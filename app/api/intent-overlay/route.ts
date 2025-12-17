import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsonErr, jsonOk } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Intent overlay data for a single property.
 */
interface IntentOverlayData {
    property_id: string;
    is_claimed: boolean | null;
    soft_listing: boolean | null;
    settled: boolean | null;
    is_for_sale: boolean | null;
    is_for_rent: boolean | null;
}

/**
 * POST /api/intent-overlay
 * Body: { ids: string[] }
 * 
 * Fetches intent flags for a batch of property IDs.
 * Max 500 IDs per request.
 */
export async function POST(request: NextRequest): Promise<Response> {
    try {
        const body = await request.json();
        const ids: unknown = body.ids;

        // Validate input
        if (!Array.isArray(ids)) {
            return jsonErr("Missing or invalid 'ids' array", 400, "INVALID_INPUT");
        }

        // Filter to valid strings and dedupe
        const validIds = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];

        if (validIds.length === 0) {
            return jsonOk<IntentOverlayData[]>([]);
        }

        // Cap at 500 to prevent abuse
        if (validIds.length > 500) {
            return jsonErr("Too many IDs. Max 500 per request.", 400, "TOO_MANY_IDS");
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data, error } = await supabase
            .from("property_public_view")
            .select("property_id, is_claimed, is_open_to_talking, is_settled, is_for_sale, is_for_rent")
            .in("property_id", validIds);

        if (error) {
            console.error("[/api/intent-overlay] Supabase error:", error);
            return jsonErr(error.message, 500, "SUPABASE_ERROR");
        }

        // Map to overlay format (rename fields to match IntentFlags)
        const overlay: IntentOverlayData[] = (data || []).map((row) => ({
            property_id: row.property_id,
            is_claimed: row.is_claimed ?? null,
            soft_listing: row.is_open_to_talking ?? null,
            settled: row.is_settled ?? null,
            is_for_sale: row.is_for_sale ?? null,
            is_for_rent: row.is_for_rent ?? null,
        }));

        return NextResponse.json(
            { ok: true, data: overlay },
            {
                status: 200,
                headers: {
                    "Cache-Control": "public, max-age=30",
                },
            }
        );
    } catch (err) {
        console.error("[/api/intent-overlay] Unexpected error:", err);
        return jsonErr("Internal server error", 500, "INTERNAL_ERROR");
    }
}
