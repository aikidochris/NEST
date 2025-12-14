import { NextRequest, NextResponse } from "next/server";
import { createAuthClient, jsonErr } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_CLAIMS = 5000;

interface ClaimedProperty {
    property_id: string;
    lat: number;
    lon: number;
}

/**
 * GET /api/my-claims?bbox=minLon,minLat,maxLon,maxLat
 * 
 * Returns GeoJSON FeatureCollection of properties claimed by the authenticated user.
 * Used as a lightweight overlay layer to show "my" properties in green.
 */
export async function GET(request: NextRequest): Promise<Response> {
    try {
        // Auth required
        const { supabase, userId } = await createAuthClient(request);

        if (!supabase || !userId) {
            return jsonErr("Authentication required", 401, "UNAUTHORIZED");
        }

        // Parse bbox
        const { searchParams } = new URL(request.url);
        const bboxParam = searchParams.get("bbox");

        if (!bboxParam) {
            return jsonErr("Missing required parameter: bbox", 400, "MISSING_BBOX");
        }

        const bboxParts = bboxParam.split(",").map(Number);
        if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
            return jsonErr(
                "Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat",
                400,
                "INVALID_BBOX"
            );
        }

        const [minLon, minLat, maxLon, maxLat] = bboxParts;

        if (minLon > maxLon || minLat > maxLat) {
            return jsonErr(
                "Invalid bbox: min values must be less than max values",
                400,
                "INVALID_BBOX_RANGE"
            );
        }

        // Query user's claimed properties within bbox
        const { data, error, count } = await supabase
            .from("property_public_view")
            .select("property_id, lat, lon", { count: "exact" })
            .eq("claimed_by_user_id", userId)
            .gte("lon", minLon)
            .lte("lon", maxLon)
            .gte("lat", minLat)
            .lte("lat", maxLat)
            .limit(MAX_CLAIMS + 1);

        if (error) {
            console.error("[/api/my-claims] Supabase error:", error);
            return jsonErr(error.message, 500, "SUPABASE_ERROR");
        }

        // Check if limit exceeded
        if (count && count > MAX_CLAIMS) {
            return jsonErr(
                `Too many claims in view (${count}). Please zoom in.`,
                400,
                "TOO_MANY_CLAIMS"
            );
        }

        // Convert to GeoJSON FeatureCollection
        const features = ((data || []) as ClaimedProperty[]).map((p) => ({
            type: "Feature" as const,
            geometry: {
                type: "Point" as const,
                coordinates: [p.lon, p.lat],
            },
            properties: {
                property_id: p.property_id,
            },
        }));

        const geojson: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features,
        };

        return NextResponse.json(geojson, {
            status: 200,
            headers: {
                "Cache-Control": "private, max-age=10",
            },
        });
    } catch (err) {
        console.error("[/api/my-claims] Unexpected error:", err);
        return jsonErr("Internal server error", 500, "INTERNAL_ERROR");
    }
}
