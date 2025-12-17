import { supabase } from "@/lib/supabase/client";
import { isInspectOn } from "@/lib/inspect";

// =============================================================================
// UNCLAIMED NOTES HELPERS
// Phase 3 Chunk 4 - Owner inbox unlock + anti-spam caps
// =============================================================================

interface WaitingNote {
    id: string;
    body: string;
    sender_user_id: string;
    created_at: string;
}

/**
 * List notes waiting for a property the current user owns.
 * Returns empty array if user doesn't own the property.
 */
export async function listWaitingNotesForMyProperty(
    propertyId: string
): Promise<WaitingNote[]> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return [];
    }

    // Verify ownership via property_claims
    const { data: claim, error: claimError } = await supabase
        .from("property_claims")
        .select("id")
        .eq("property_id", propertyId)
        .eq("user_id", user.id)
        .eq("status", "claimed")
        .maybeSingle();

    if (claimError || !claim) {
        return []; // Not owner - return empty
    }

    // Fetch unclaimed notes for this property
    const { data, error } = await supabase
        .from("unclaimed_notes")
        .select("id, note_text, sender_user_id, created_at")
        .eq("property_id", propertyId)
        .is("handled_at", null)
        .order("created_at", { ascending: true });

    if (error) {
        if (isInspectOn()) {
            console.error("[unclaimedNotes] Failed to fetch notes:", error);
        }
        return [];
    }

    const notes: WaitingNote[] = (data || []).map((row) => ({
        id: row.id,
        body: row.note_text,
        sender_user_id: row.sender_user_id,
        created_at: row.created_at,
    }));

    // Debug log
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] WAITING_NOTES_FETCH", {
            property_id: propertyId,
            count: notes.length,
        });
    }

    return notes;
}

/**
 * Check if more unclaimed notes can be left on a property.
 * Enforces max 50 notes per property.
 */
export async function canLeaveUnclaimedNote(
    propertyId: string
): Promise<boolean> {
    const { count, error } = await supabase
        .from("unclaimed_notes")
        .select("*", { count: "exact", head: true })
        .eq("property_id", propertyId);

    if (error) {
        if (isInspectOn()) {
            console.error("[unclaimedNotes] Failed to check note count:", error);
        }
        return false;
    }

    return (count ?? 0) < 50;
}

// =============================================================================
// NEIGHBOUR SUGGESTIONS
// Find nearby claimed properties that are open to talking
// =============================================================================

interface NeighbourSuggestion {
    property_id: string;
    display_label: string;
    distance_m: number;
    lat: number;
    lon: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 */
function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Get nearby properties that are claimed and open to talking.
 * Used for neighbour routing after leaving an unclaimed note.
 */
export async function getNearbyOpenNeighbours(
    sourceLat: number,
    sourceLon: number,
    sourcePropertyId: string,
    maxResults: number = 3
): Promise<NeighbourSuggestion[]> {
    // Get current user to exclude their owned properties
    const { data: { user } } = await supabase.auth.getUser();

    // Get properties owned by current user
    let myPropertyIds: Set<string> = new Set();
    if (user) {
        const { data: myClaims } = await supabase
            .from("property_claims")
            .select("property_id")
            .eq("user_id", user.id)
            .eq("status", "claimed");

        if (myClaims) {
            myPropertyIds = new Set(myClaims.map(c => c.property_id));
        }
    }

    // Query nearby properties that are claimed and open to talking
    // We need to fetch from property_public_view to get all relevant data
    const { data, error } = await supabase
        .from("property_public_view")
        .select("property_id, lat, lon, display_label, is_claimed, is_open_to_talking")
        .eq("is_claimed", true)
        .eq("is_open_to_talking", true)
        .neq("property_id", sourcePropertyId)
        .limit(100); // Get a reasonable set to filter by distance

    if (error) {
        if (isInspectOn()) {
            console.error("[unclaimedNotes] Failed to get neighbours:", error);
        }
        return [];
    }

    if (!data || data.length === 0) {
        return [];
    }

    // Calculate distances and filter
    const candidates: NeighbourSuggestion[] = [];

    for (const row of data) {
        if (!row.lat || !row.lon) continue;
        // Skip properties owned by current user
        if (myPropertyIds.has(row.property_id)) continue;

        const distance = haversineDistance(
            sourceLat,
            sourceLon,
            row.lat,
            row.lon
        );

        // First pass: 250m radius
        if (distance <= 250) {
            candidates.push({
                property_id: row.property_id,
                display_label: row.display_label || "Nearby home",
                distance_m: Math.round(distance),
                lat: row.lat,
                lon: row.lon,
            });
        }
    }

    // If not enough within 250m, expand to 500m
    if (candidates.length < maxResults) {
        for (const row of data) {
            if (!row.lat || !row.lon) continue;
            // Skip properties owned by current user
            if (myPropertyIds.has(row.property_id)) continue;

            const distance = haversineDistance(
                sourceLat,
                sourceLon,
                row.lat,
                row.lon
            );

            // Already added in 250m pass
            if (distance <= 250) continue;

            if (distance <= 500) {
                candidates.push({
                    property_id: row.property_id,
                    display_label: row.display_label || "Nearby home",
                    distance_m: Math.round(distance),
                    lat: row.lat,
                    lon: row.lon,
                });
            }
        }
    }

    // Sort by distance and take top results
    candidates.sort((a, b) => a.distance_m - b.distance_m);
    const results = candidates.slice(0, maxResults);

    // Debug log
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] NEIGHBOUR_SUGGESTIONS", {
            source_property_id: sourcePropertyId,
            results: results.map((r) => ({
                property_id: r.property_id,
                distance_m: r.distance_m,
            })),
        });
    }

    return results;
}
