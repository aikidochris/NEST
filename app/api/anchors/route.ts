import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";

// Type for anchor database row
interface AnchorRow {
    id: string;
    name: string;
    anchor_type: string;
    subtype: string;
    postcode: string;
    latitude: number;
    longitude: number;
    metadata: Record<string, unknown>;
}

/**
 * GET /api/anchors
 * Returns neighborhood anchors as GeoJSON FeatureCollection for map visualization.
 * Query params:
 *   - bbox: optional bounding box filter (minLon,minLat,maxLon,maxLat)
 *   - type: optional anchor_type filter (school, transport, spirit_point)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const bboxParam = searchParams.get("bbox");
    const typeFilter = searchParams.get("type");

    const supabase = createAnonClient();

    // Base query
    let query = supabase
        .from("neighborhood_anchors")
        .select("id, name, anchor_type, subtype, postcode, latitude, longitude, metadata");

    // Apply type filter if specified
    if (typeFilter) {
        query = query.eq("anchor_type", typeFilter);
    }

    // Apply bbox filter if specified
    if (bboxParam) {
        const [minLon, minLat, maxLon, maxLat] = bboxParam.split(",").map(Number);
        if (!isNaN(minLon) && !isNaN(minLat) && !isNaN(maxLon) && !isNaN(maxLat)) {
            query = query
                .gte("longitude", minLon)
                .lte("longitude", maxLon)
                .gte("latitude", minLat)
                .lte("latitude", maxLat);
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error("[Anchors API] Error:", error);
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
        );
    }

    // Convert to GeoJSON FeatureCollection
    const features: GeoJSON.Feature[] = ((data || []) as AnchorRow[]).map((anchor) => ({
        type: "Feature" as const,
        id: anchor.id,
        geometry: {
            type: "Point" as const,
            coordinates: [anchor.longitude, anchor.latitude]
        },
        properties: {
            id: anchor.id,
            name: anchor.name,
            anchor_type: anchor.anchor_type,
            subtype: anchor.subtype,
            postcode: anchor.postcode,
            metadata: JSON.stringify(anchor.metadata || {})
        }
    }));

    const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features
    };

    return NextResponse.json({
        ok: true,
        geojson,
        count: features.length
    });
}

/**
 * PATCH /api/anchors
 * Updates anchor location (admin only).
 * Body: { id: string, latitude: number, longitude: number }
 */
export async function PATCH(request: Request) {
    const { createAdminClient } = await import("@/lib/supabase/server");

    try {
        const body = await request.json();
        const { id, latitude, longitude } = body;

        if (!id || typeof latitude !== "number" || typeof longitude !== "number") {
            return NextResponse.json(
                { ok: false, error: "Missing required fields: id, latitude, longitude" },
                { status: 400 }
            );
        }

        // Use admin client to bypass RLS for anchor updates
        const supabase = createAdminClient();

        const { error } = await supabase
            .from("neighborhood_anchors")
            .update({ latitude, longitude })
            .eq("id", id);

        if (error) {
            console.error("[Anchors API] PATCH error:", error);
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            );
        }

        console.log(`[Anchors API] Updated anchor ${id} to (${latitude}, ${longitude})`);

        return NextResponse.json({ ok: true, id, latitude, longitude });
    } catch (err) {
        console.error("[Anchors API] PATCH error:", err);
        return NextResponse.json(
            { ok: false, error: "Failed to update anchor" },
            { status: 500 }
        );
    }
}
