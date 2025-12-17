/**
 * Inspection mode helpers for debug logging.
 * Logs only fire when localStorage.getItem("nest_inspect") === "true"
 */

// Re-export resolveStatus from the shared status module for backwards compatibility
export { resolveStatus, type Status, type IntentFlags } from "./status";

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
