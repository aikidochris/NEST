import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";

/**
 * GET /api/profile
 * Returns user profile including role for RBAC.
 * Query params:
 *   - userId: the user's auth.users.id
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
        return NextResponse.json(
            { ok: false, error: "Missing userId parameter" },
            { status: 400 }
        );
    }

    const supabase = createAnonClient();

    const { data, error } = await supabase
        .from("profiles")
        .select("user_id, role")
        .eq("user_id", userId)
        .single();

    if (error) {
        // Profile may not exist yet - return null profile (not an error)
        if (error.code === "PGRST116") {
            return NextResponse.json({ ok: true, profile: null });
        }
        console.error("[Profile API] Error:", error);
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
        );
    }

    return NextResponse.json({
        ok: true,
        profile: {
            userId: data.user_id,
            role: data.role || "user"
        }
    });
}
