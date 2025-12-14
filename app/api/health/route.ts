import { createAnonClient, jsonOk, jsonErr } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Lightweight health check that verifies Supabase connectivity
 * by querying property_public_view with limit 1.
 */
export async function GET(): Promise<Response> {
    try {
        const supabase = createAnonClient();

        const { error } = await supabase
            .from("property_public_view")
            .select("property_id")
            .limit(1);

        if (error) {
            console.error("[/api/health] Supabase error:", error);
            return jsonErr(error.message, 503, "SUPABASE_ERROR");
        }

        return jsonOk({ ok: true });
    } catch (err) {
        console.error("[/api/health] Unexpected error:", err);
        return jsonErr("Internal server error", 500, "INTERNAL_ERROR");
    }
}
