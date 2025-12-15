/**
 * Single source of truth for status styling across map pins, cards, and UI baseline.
 * 
 * Design principles:
 * - Structural states (unclaimed, claimed) are MUTED - low visual priority
 * - Intent states draw the eye with distinct colours
 * - "Claimed" is internal only; public UI shows nothing or "Owner (no status)"
 * - Unknown/debug states never leak to production UI
 */

import type { Status } from "./status";

// =============================================================================
// PIN COLORS - Intent-first scheme
// =============================================================================

/**
 * Map status to pin color (hex).
 * Unclaimed = light grey (calm, low priority)
 * Intent states = distinctive colors
 */
export const PIN_COLORS: Record<Status, string> = {
    unclaimed: "#D1D5DB",       // Light grey - calm, structural
    claimed: "#9CA3AF",         // Medium grey - deprecated
    owner_no_status: "#9CA3AF", // Medium grey - claimed with no intent
    open_to_talking: "#007C7C", // Teal - friendly, approachable
    settled: "#8C8C8C",         // Dark grey - not moving
    for_sale: "#E65F52",        // Coral - attention, action
    for_rent: "#4F46E5",        // Indigo/violet - distinct from teal
    unknown: "#E5E7EB",         // Very light grey - debug only
};

// =============================================================================
// STATUS LABELS - Public vs Internal
// =============================================================================

/**
 * Public-facing labels for status chips and legend.
 * Note: "claimed" maps to null - not shown in public legend.
 */
export const PUBLIC_LABELS: Record<Status, string | null> = {
    unclaimed: null,            // Not shown in legend (structural)
    claimed: null,              // Deprecated
    owner_no_status: null,      // NOT shown publicly
    open_to_talking: "Open to Talking",
    settled: "Settled",
    for_sale: "For Sale",
    for_rent: "For Rent",
    unknown: null,              // Debug only - never public
};

/**
 * Dev/internal labels for UI baseline and debug views.
 */
export const DEV_LABELS: Record<Status, string> = {
    unclaimed: "Unclaimed",
    claimed: "Owner (no status)",  // Deprecated
    owner_no_status: "Owner (no status)",
    open_to_talking: "Open to Talking",
    settled: "Settled",
    for_sale: "For Sale",
    for_rent: "For Rent",
    unknown: "Unknown (debug)",
};

// =============================================================================
// STATUS CHIP STYLES - Tailwind classes
// =============================================================================

interface ChipStyle {
    bg: string;
    text: string;
}

/**
 * Tailwind classes for status chips.
 */
export const CHIP_STYLES: Record<Status, ChipStyle> = {
    unclaimed: { bg: "bg-gray-100", text: "text-gray-500" },
    claimed: { bg: "bg-gray-100", text: "text-gray-600" },  // Deprecated
    owner_no_status: { bg: "bg-gray-100", text: "text-gray-600" },
    open_to_talking: { bg: "bg-teal-100", text: "text-teal-800" },
    settled: { bg: "bg-gray-200", text: "text-gray-700" },
    for_sale: { bg: "bg-red-100", text: "text-red-800" },
    for_rent: { bg: "bg-indigo-100", text: "text-indigo-800" },
    unknown: { bg: "bg-gray-100", text: "text-gray-400" },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get pin color for a status.
 * 
 * Pin colour MUST be derived from intent_flags only.
 * Do not set colours in layer paint props.
 */
export function getPinColor(status: Status): string {
    return PIN_COLORS[status] ?? PIN_COLORS.unclaimed;
}

/**
 * Get public label for a status (null if not shown publicly).
 */
export function getPublicLabel(status: Status): string | null {
    return PUBLIC_LABELS[status];
}

/**
 * Get dev/internal label for a status.
 */
export function getDevLabel(status: Status): string {
    return DEV_LABELS[status] ?? status;
}

/**
 * Get chip style classes for a status.
 */
export function getChipStyle(status: Status): ChipStyle {
    return CHIP_STYLES[status] ?? CHIP_STYLES.unclaimed;
}

/**
 * Get all statuses that should appear in the public legend.
 * Excludes unclaimed, claimed, and unknown.
 */
export function getPublicLegendStatuses(): Status[] {
    return ["open_to_talking", "settled", "for_sale", "for_rent"];
}

/**
 * Get all statuses for dev/internal views.
 */
export function getAllStatuses(): Status[] {
    return ["unclaimed", "owner_no_status", "claimed", "open_to_talking", "settled", "for_sale", "for_rent", "unknown"];
}
