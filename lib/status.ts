/**
 * Shared status resolver for properties.
 * Single source of truth for status derivation across pins, cards, and area vibe.
 */

/**
 * Intent flags structure for status resolution.
 */
export type IntentFlags = {
    soft_listing: boolean | null;
    settled: boolean | null;
    is_for_sale: boolean | null;
    is_for_rent: boolean | null;
};

/**
 * Property status enum.
 * "unknown" is debug-only; never shown as a user-facing status.
 * "owner_no_status" is claimed with no explicit intent (grey pin).
 */
export type Status =
    | "unclaimed"
    | "open_to_talking"
    | "settled"
    | "for_sale"
    | "for_rent"
    | "owner_no_status"
    | "claimed"  // deprecated - use owner_no_status
    | "unknown";

/**
 * Resolve the display status from claim and intent flags.
 * 
 * Precedence for claimed properties:
 * 1. is_for_sale → "for_sale"
 * 2. is_for_rent → "for_rent"  
 * 3. soft_listing → "open_to_talking"
 * 4. settled → "settled"
 * 5. claimed with no intent → "owner_no_status"
 * 
 * Unclaimed properties → "unclaimed"
 * Unknown claim state → "unknown" (debug)
 */
export function resolveStatus(input: {
    is_claimed: boolean | null;
    intent_flags?: Partial<IntentFlags> | null;
}): Status {
    const { is_claimed, intent_flags } = input;

    // Unclaimed property
    if (is_claimed === false) return "unclaimed";

    // Unknown claim state - debug only
    if (is_claimed === null || is_claimed === undefined) return "unknown";

    // Claimed property (is_claimed === true) - check intent flags
    // Priority: for_sale > for_rent > open_to_talking > settled
    const flags = intent_flags ?? {};

    if (flags.is_for_sale === true) return "for_sale";
    if (flags.is_for_rent === true) return "for_rent";
    if (flags.soft_listing === true) return "open_to_talking";
    if (flags.settled === true) return "settled";

    // Claimed with no explicit intent - grey pin
    return "owner_no_status";
}

/**
 * Check if a new conversation can be started based on property status.
 * Returns true if users can start NEW conversations.
 * Returns false if settled OR owner_no_status (or other restrictive states).
 */
export function canStartConversation(status: Status): boolean {
    switch (status) {
        case "open_to_talking":
        case "for_sale":
        case "for_rent":
            return true;
        case "settled":
        case "owner_no_status":
        case "unclaimed":
        case "claimed": // Deprecated but treat as no status
        case "unknown":
            return false;
    }
}
