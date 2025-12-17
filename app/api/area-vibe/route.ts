import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface VibeStats {
    claimed: number;
    open_to_talk: number;
    for_sale: number;
    for_rent: number;
}

/**
 * GET /api/area-vibe?bbox=minLon,minLat,maxLon,maxLat
 * 
 * Returns aggregated counts for the viewport:
 * - claimed: properties with is_claimed = true
 * - open_to_talk: properties with is_open_to_talking = true
 * - for_sale: properties with is_for_sale = true
 * - for_rent: properties with is_for_rent = true
 */
export async function GET(request: NextRequest): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const bboxParam = searchParams.get("bbox");

    if (!bboxParam) {
        return NextResponse.json(
            { ok: false, error: { message: "Missing bbox parameter" } },
            { status: 400 }
        );
    }

    const parts = bboxParam.split(",").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
        return NextResponse.json(
            { ok: false, error: { message: "Invalid bbox format" } },
            { status: 400 }
        );
    }

    const [minLon, minLat, maxLon, maxLat] = parts;

    try {
        const supabase = createAnonClient();

        // Fetch counts using aggregation
        const { data, error } = await supabase
            .from("property_public_view")
            .select("is_claimed, is_open_to_talking, is_for_sale, is_for_rent")
            .gte("lon", minLon)
            .lte("lon", maxLon)
            .gte("lat", minLat)
            .lte("lat", maxLat)
            .limit(10000); // Cap for performance

        if (error) {
            console.error("[/api/area-vibe] Supabase error:", error);
            return NextResponse.json(
                { ok: false, error: { message: error.message } },
                { status: 500 }
            );
        }

        // Aggregate counts
        const stats: VibeStats = {
            claimed: 0,
            open_to_talk: 0,
            for_sale: 0,
            for_rent: 0,
        };

        for (const row of data || []) {
            if (row.is_claimed) stats.claimed++;
            if (row.is_open_to_talking) stats.open_to_talk++;
            if (row.is_for_sale) stats.for_sale++;
            if (row.is_for_rent) stats.for_rent++;
        }

        return NextResponse.json(
            { ok: true, data: stats },
            {
                status: 200,
                headers: {
                    "Cache-Control": "public, max-age=30",
                },
            }
        );
    } catch (err) {
        console.error("[/api/area-vibe] Unexpected error:", err);
        return NextResponse.json(
            { ok: false, error: { message: "Internal server error" } },
            { status: 500 }
        );
    }
}
