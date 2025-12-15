import { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// OWNERSHIP HELPERS
// Query property_claims to determine which properties the current user owns.
// =============================================================================

/**
 * Get the set of property IDs claimed by the current user.
 * Only includes claims with status = 'claimed'.
 */
export async function getMyClaimedPropertyIds(
    supabase: SupabaseClient
): Promise<Set<string>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return new Set();
    }

    const { data, error } = await supabase
        .from("property_claims")
        .select("property_id")
        .eq("user_id", user.id)
        .eq("status", "claimed");

    if (error) {
        console.error("[ownership] Failed to fetch claims:", error.message);
        return new Set();
    }

    const ids = new Set<string>();
    for (const row of data || []) {
        if (row.property_id) {
            ids.add(row.property_id);
        }
    }

    return ids;
}

/**
 * Check if a specific property is claimed by the current user.
 */
export async function isPropertyMine(
    supabase: SupabaseClient,
    propertyId: string
): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return false;
    }

    const { data, error } = await supabase
        .from("property_claims")
        .select("id")
        .eq("property_id", propertyId)
        .eq("user_id", user.id)
        .eq("status", "claimed")
        .maybeSingle();

    if (error) {
        console.error("[ownership] Failed to check claim:", error.message);
        return false;
    }

    return !!data;
}
