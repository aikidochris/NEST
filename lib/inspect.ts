/**
 * Inspection mode helpers for debug logging.
 * Logs only fire when localStorage.getItem("nest_inspect") === "true"
 */

/**
 * Check if inspection mode is enabled via localStorage.
 * SSR-safe: returns false on server.
 */
export function isInspectOn(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem("nest_inspect") === "true";
    } catch {
        return false;
    }
}

/**
 * Log an inspection event with timestamp.
 * Only logs when inspect mode is on.
 */
export function inspectLog(event: string, payload: Record<string, unknown>): void {
    if (!isInspectOn()) return;
    console.info("[NEST_INSPECT]", {
        event,
        ts: new Date().toISOString(),
        ...payload,
    });
}

/**
 * Intent flags structure for status resolution.
 */
interface IntentFlags {
    is_claimed?: boolean | null;
    soft_listing?: boolean;
    settled?: boolean;
    is_for_sale?: boolean;
    is_for_rent?: boolean;
}

/**
 * Resolve the display status from intent flags.
 * Precedence: unclaimed > unknown > settled > for_sale > for_rent > open_to_talking > claimed
 * Note: "unknown" is debug-only and not a UI status.
 */
export function resolveStatus(flags: IntentFlags): string {
    if (flags.is_claimed === false) return "unclaimed";
    if (flags.is_claimed === null || flags.is_claimed === undefined) return "unknown";
    // is_claimed === true from here
    if (flags.settled === true) return "settled";
    if (flags.is_for_sale === true) return "for_sale";
    if (flags.is_for_rent === true) return "for_rent";
    if (flags.soft_listing === true) return "open_to_talking";
    return "claimed";
}
