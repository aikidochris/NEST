import { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// INTENT FLAGS HELPERS
// Query intent_flags to get property intent status.
// =============================================================================

export interface IntentFlags {
    soft_listing: boolean | null;
    is_for_sale: boolean | null;
    is_for_rent: boolean | null;
    settled: boolean | null;
}

/**
 * Get intent flags for multiple property IDs.
 * Returns a map of property_id -> IntentFlags.
 */
export async function getIntentFlagsByPropertyIds(
    supabase: SupabaseClient,
    propertyIds: string[]
): Promise<Record<string, IntentFlags>> {
    if (propertyIds.length === 0) {
        return {};
    }

    const { data, error } = await supabase
        .from("intent_flags")
        .select("property_id, soft_listing, is_for_sale, is_for_rent, settled")
        .in("property_id", propertyIds);

    if (error) {
        console.error("[intent] Failed to fetch intent flags:", error.message);
        return {};
    }

    const result: Record<string, IntentFlags> = {};
    for (const row of data || []) {
        if (row.property_id) {
            result[row.property_id] = {
                soft_listing: row.soft_listing ?? null,
                is_for_sale: row.is_for_sale ?? null,
                is_for_rent: row.is_for_rent ?? null,
                settled: row.settled ?? null,
            };
        }
    }

    return result;
}

/**
 * Get intent flags for a single property.
 */
export async function getIntentFlagsForProperty(
    supabase: SupabaseClient,
    propertyId: string
): Promise<IntentFlags | null> {
    const { data, error } = await supabase
        .from("intent_flags")
        .select("soft_listing, is_for_sale, is_for_rent, settled")
        .eq("property_id", propertyId)
        .maybeSingle();

    if (error) {
        console.error("[intent] Failed to fetch intent flags:", error.message);
        return null;
    }

    if (!data) {
        return null;
    }

    return {
        soft_listing: data.soft_listing ?? null,
        is_for_sale: data.is_for_sale ?? null,
        is_for_rent: data.is_for_rent ?? null,
        settled: data.settled ?? null,
    };
}

/**
 * Owner status types that can be persisted.
 */
export type OwnerStatus = "open_to_talking" | "for_sale" | "for_rent" | "settled";

/**
 * Map owner status to intent flag booleans.
 */
function statusToFlags(status: OwnerStatus): IntentFlags {
    switch (status) {
        case "open_to_talking":
            return { soft_listing: true, is_for_sale: false, is_for_rent: false, settled: false };
        case "for_sale":
            return { soft_listing: false, is_for_sale: true, is_for_rent: false, settled: false };
        case "for_rent":
            return { soft_listing: false, is_for_sale: false, is_for_rent: true, settled: false };
        case "settled":
            return { soft_listing: false, is_for_sale: false, is_for_rent: false, settled: true };
        default:
            return { soft_listing: false, is_for_sale: false, is_for_rent: false, settled: false };
    }
}

/**
 * Persist owner status to Supabase intent_flags table.
 * Returns true on success, false on failure.
 */
export async function persistOwnerStatus(
    supabase: SupabaseClient,
    propertyId: string,
    newStatus: OwnerStatus
): Promise<boolean> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("[intent] Cannot persist status: no authenticated user");
        return false;
    }

    // Map status to flag booleans
    const flags = statusToFlags(newStatus);

    // Upsert to intent_flags
    const { error: upsertError } = await supabase
        .from("intent_flags")
        .upsert(
            {
                property_id: propertyId,
                owner_id: user.id,
                ...flags,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "property_id,owner_id" }
        );

    if (upsertError) {
        console.error("[intent] Failed to persist status:", upsertError.message);
        return false;
    }

    // Read back and log for verification
    const { data } = await supabase
        .from("intent_flags")
        .select("soft_listing, is_for_sale, is_for_rent, settled, updated_at")
        .eq("property_id", propertyId)
        .eq("owner_id", user.id)
        .maybeSingle();

    console.log("[NEST_INSPECT] INTENT_FLAGS_AFTER_WRITE", { propertyId, data });

    return true;
}
