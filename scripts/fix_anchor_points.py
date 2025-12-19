import time
import math
from datetime import date
from typing import Optional, Tuple, Dict, Any, List

import pandas as pd
import requests

# ===== CONFIG =====
INPUT_CSV = "NEST_Master_Anchors_BlankLatLon.csv"
OUT_CSV = "NEST_Master_Anchors_corrected.csv"
CHANGELOG_CSV = "NEST_Master_Anchors_changelog.csv"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

HEADERS = {
    # IMPORTANT: replace with your real contact email
    "User-Agent": "nest-anchor-cleaner/1.0 (contact: your@email.com)",
    "Accept": "application/json",
}

# Throttle: be polite to public services
NOMINATIM_SLEEP_S = 1.1
OVERPASS_SLEEP_S = 1.1

# Overpass search radius for entrance nodes
ENTRANCE_RADIUS_M = 150
# ==================


def is_plausible_uk(lat: float, lon: float) -> bool:
    return 49.8 <= lat <= 60.9 and -8.6 <= lon <= 1.8


def nominatim_search(name: str, postcode: str) -> Optional[Dict[str, Any]]:
    params = {
        "q": f"{name}, {postcode}, United Kingdom",
        "format": "jsonv2",
        "limit": 1,
        "countrycodes": "gb",
        "addressdetails": 1,
    }
    r = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data[0] if data else None


def overpass_find_entrance(lat: float, lon: float, radius_m: int = ENTRANCE_RADIUS_M) -> Optional[Tuple[float, float, Dict[str, Any]]]:
    query = f"""
    [out:json][timeout:25];
    (
      node(around:{radius_m},{lat},{lon})["entrance"];
      node(around:{radius_m},{lat},{lon})["highway"="entrance"];
    );
    out body;
    """
    r = requests.post(OVERPASS_URL, data=query.encode("utf-8"), headers=HEADERS, timeout=60)
    r.raise_for_status()
    els = r.json().get("elements", [])
    if not els:
        return None

    # Prefer entrance=main, then anything else tagged as an entrance
    def score(el):
        tags = el.get("tags", {}) or {}
        if tags.get("entrance") == "main":
            return 0
        if "entrance" in tags:
            return 1
        return 2

    els.sort(key=score)
    best = els[0]
    return best["lat"], best["lon"], best


def main():
    df = pd.read_csv(INPUT_CSV)

    today = date.today().isoformat()

    # Add long-mode columns if missing
    for c in [
        "lat_corrected",
        "lon_corrected",
        "point_intent",
        "correction_method",
        "confidence_score",
        "change_note",
        "source_checked",
        "last_verified_date",
        "needs_manual_review",
    ]:
        if c not in df.columns:
            df[c] = None

    changelog: List[Dict[str, Any]] = []
    total = len(df)

    print(f"Starting correction run: {total} rows")
    print(f"Input:  {INPUT_CSV}")
    print(f"Output: {OUT_CSV}")
    print(f"Log:    {CHANGELOG_CSV}\n")

    for idx, row in df.iterrows():
        name = str(row.get("name", "")).strip()
        postcode = str(row.get("postcode", "")).strip()
        a_type = str(row.get("anchor_type", "")).strip()
        subtype = str(row.get("subtype", "")).strip()

        # ---- TICKER / PROGRESS ----
        print(f"[{idx+1}/{total}] {a_type} | {subtype} | {name} ({postcode})", flush=True)

        lat = None
        lon = None
        confidence = 0
        needs_review = False
        method = "fallback"
        intent = "public_entrance"
        notes: List[str] = []

        # 1) Nominatim lookup
        nom = None
        try:
            nom = nominatim_search(name, postcode)
            notes.append("Nominatim OK")
            time.sleep(NOMINATIM_SLEEP_S)
        except Exception as e:
            notes.append(f"Nominatim failed: {e}")
            needs_review = True

        if nom:
            lat_n = float(nom["lat"])
            lon_n = float(nom["lon"])
            lat, lon = lat_n, lon_n
            method = "nominatim_poi"
            confidence = 65
            notes.append("Nominatim POI match")

            # 2) Try entrance snap via Overpass
            ent = None
            try:
                ent = overpass_find_entrance(lat_n, lon_n, radius_m=ENTRANCE_RADIUS_M)
                notes.append("Overpass OK")
                time.sleep(OVERPASS_SLEEP_S)
            except Exception as e:
                notes.append(f"Overpass failed: {e}")
                needs_review = True

            if ent:
                lat, lon, el = ent
                method = "overpass_entrance"
                confidence = 85

                ent_tag = (el.get("tags", {}) or {}).get("entrance")
                intent = "main_entrance" if ent_tag == "main" else "entrance_nearby"
                notes.append("Entrance node found")
            else:
                # We got a POI, but couldn't confirm a specific entrance node
                needs_review = True
                notes.append("No entrance node; using POI location (likely centroid/site point)")
                confidence = 60

        else:
            # No match at all
            needs_review = True
            notes.append("No geocode match")
            confidence = 0
            method = "no_match"

        # Final plausibility check
        if lat is None or lon is None:
            needs_review = True
            notes.append("Missing coordinates")
            confidence = 0
        elif not is_plausible_uk(lat, lon):
            needs_review = True
            notes.append("Implausible UK bounds")
            confidence = min(confidence, 20)

        # Write results
        df.at[idx, "lat_corrected"] = lat
        df.at[idx, "lon_corrected"] = lon
        df.at[idx, "point_intent"] = intent
        df.at[idx, "correction_method"] = method
        df.at[idx, "confidence_score"] = int(confidence)
        df.at[idx, "change_note"] = " ".join(notes)
        df.at[idx, "source_checked"] = "OSM:Nominatim; OSM:Overpass"
        df.at[idx, "last_verified_date"] = today
        df.at[idx, "needs_manual_review"] = bool(needs_review)

        changelog.append(
            {
                "id": row.get("id"),
                "name": name,
                "anchor_type": a_type,
                "subtype": subtype,
                "postcode": postcode,
                "old_lat": row.get("latitude"),
                "old_lon": row.get("longitude"),
                "new_lat": lat,
                "new_lon": lon,
                "method": method,
                "confidence": int(confidence),
                "notes": " ".join(notes),
            }
        )

    df.to_csv(OUT_CSV, index=False)
    pd.DataFrame(changelog).to_csv(CHANGELOG_CSV, index=False)

    print("\nDONE")
    print(f"Wrote {OUT_CSV}")
    print(f"Wrote {CHANGELOG_CSV}")


if __name__ == "__main__":
    main()
