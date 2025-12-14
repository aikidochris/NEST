import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface LiveFeedEvent {
    event_type: string;
    property_id: string;
    display_label: string | null;
    created_at: string;
    summary: string;
}

/**
 * GET /api/live-feed?bbox=minLon,minLat,maxLon,maxLat&limit=30
 * 
 * Returns live feed events for the viewport via the get_live_feed RPC.
 */
export async function GET(request: NextRequest): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const bboxParam = searchParams.get("bbox");
    const limitParam = searchParams.get("limit");

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
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 100) : 30;

    try {
        const supabase = createAnonClient();

        const { data, error } = await supabase.rpc("get_live_feed", {
            min_lon: minLon,
            min_lat: minLat,
            max_lon: maxLon,
            max_lat: maxLat,
            lim: limit,
        });

        if (error) {
            console.error("[/api/live-feed] Supabase error:", error);
            return NextResponse.json(
                { ok: false, error: { message: error.message } },
                { status: 500 }
            );
        }

        const events: LiveFeedEvent[] = (data || []).map((row: {
            event_type: string;
            property_id: string;
            display_label: string | null;
            created_at: string;
            summary: string;
        }) => ({
            event_type: row.event_type,
            property_id: row.property_id,
            display_label: row.display_label,
            created_at: row.created_at,
            summary: row.summary,
        }));

        return NextResponse.json(
            { ok: true, events },
            {
                status: 200,
                headers: {
                    "Cache-Control": "public, max-age=15",
                },
            }
        );
    } catch (err) {
        console.error("[/api/live-feed] Unexpected error:", err);
        return NextResponse.json(
            { ok: false, error: { message: "Internal server error" } },
            { status: 500 }
        );
    }
}
