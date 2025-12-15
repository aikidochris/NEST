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
 */
export type Status =
    | "unclaimed"
    | "open_to_talking"
    | "settled"
    | "for_sale"
    | "for_rent"
    | "claimed"
    | "unknown";

/**
 * Resolve the display status from claim and intent flags.
 * 
 * Precedence:
 * 1. is_claimed === false → "unclaimed"
 * 2. is_claimed === null → "unknown" (debug-only)
 * 3. is_claimed === true:
 *    - settled true → "settled"
 *    - is_for_sale true → "for_sale"
 *    - is_for_rent true → "for_rent"
 *    - soft_listing true → "open_to_talking"
 *    - else → "claimed"
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
    const flags = intent_flags ?? {};

    if (flags.settled === true) return "settled";
    if (flags.is_for_sale === true) return "for_sale";
    if (flags.is_for_rent === true) return "for_rent";
    if (flags.soft_listing === true) return "open_to_talking";

    return "claimed";
}
