/**
 * Pin semantic styles - shape, ring, badge, halo configurations.
 * Single source of truth for map pins and UI baseline.
 * 
 * Semantic rules:
 * - unclaimed: small filled circle, light grey, thin stroke
 * - claimed/owner_no_status: slightly larger circle, medium grey
 * - open_to_talking: teal + thicker ring (stroke) = "social"
 * - for_sale: coral + badge dot top-right
 * - for_rent: indigo + badge dot top-right
 * - settled: dark grey, no badge
 * - unknown (debug): hollow circle + dashed stroke
 * - flagged (admin): hollow + dashed + "!" badge
 */

import type { Status } from "./status";
import { PIN_COLORS } from "./statusStyles";

// =============================================================================
// EXTENDED STATUS TYPE (includes admin-only states)
// =============================================================================

export type ExtendedStatus = Status | "flagged";

// =============================================================================
// PIN SEMANTIC CONFIGURATION
// =============================================================================

export interface PinSemanticStyle {
    /** Base radius of the pin (pixels) */
    radius: number;
    /** Fill color (hex) */
    fillColor: string;
    /** Whether pin is hollow (no fill) */
    hollow: boolean;
    /** Stroke width (pixels) */
    strokeWidth: number;
    /** Stroke color (hex) */
    strokeColor: string;
    /** Stroke style: solid or dashed */
    strokeStyle: "solid" | "dashed";
    /** Badge configuration (top-right dot) */
    badge: {
        show: boolean;
        color: string;
        symbol?: string;  // e.g. "!" for flagged
    };
    /** Ring/halo for social states */
    ring: {
        show: boolean;
        width: number;
        color: string;
    };
}

export interface InteractionStyles {
    /** Hover state */
    hover: {
        radiusIncrease: number;
        strokeWidthIncrease: number;
    };
    /** Active/selected state */
    active: {
        haloRadius: number;
        haloOpacity: number;
        haloColor: string;
    };
}

// =============================================================================
// SEMANTIC PIN STYLES BY STATUS
// =============================================================================

const DEFAULT_STROKE_COLOR = "#FFFFFF";

export const PIN_SEMANTIC_STYLES: Record<ExtendedStatus, PinSemanticStyle> = {
    unclaimed: {
        radius: 5,
        fillColor: PIN_COLORS.unclaimed,
        hollow: false,
        strokeWidth: 1,
        strokeColor: "#9CA3AF",  // Slightly darker for contrast
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
    },
    claimed: {
        radius: 6,
        fillColor: PIN_COLORS.claimed,
        hollow: false,
        strokeWidth: 1.5,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
    },
    open_to_talking: {
        radius: 6,
        fillColor: PIN_COLORS.open_to_talking,
        hollow: false,
        strokeWidth: 3,  // Thicker ring = "social"
        strokeColor: "#005F5F",  // Darker teal for ring
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: true, width: 3, color: "#005F5F" },
    },
    for_sale: {
        radius: 6,
        fillColor: PIN_COLORS.for_sale,
        hollow: false,
        strokeWidth: 1.5,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeStyle: "solid",
        badge: { show: true, color: PIN_COLORS.for_sale },
        ring: { show: false, width: 0, color: "" },
    },
    for_rent: {
        radius: 6,
        fillColor: PIN_COLORS.for_rent,
        hollow: false,
        strokeWidth: 1.5,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeStyle: "solid",
        badge: { show: true, color: PIN_COLORS.for_rent },
        ring: { show: false, width: 0, color: "" },
    },
    settled: {
        radius: 6,
        fillColor: PIN_COLORS.settled,
        hollow: false,
        strokeWidth: 1.5,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
    },
    unknown: {
        radius: 5,
        fillColor: "transparent",
        hollow: true,
        strokeWidth: 1.5,
        strokeColor: PIN_COLORS.unknown,
        strokeStyle: "dashed",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
    },
    flagged: {
        radius: 6,
        fillColor: "transparent",
        hollow: true,
        strokeWidth: 2,
        strokeColor: "#DC2626",  // Red for flagged
        strokeStyle: "dashed",
        badge: { show: true, color: "#DC2626", symbol: "!" },
        ring: { show: false, width: 0, color: "" },
    },
};

// =============================================================================
// INTERACTION STYLES
// =============================================================================

export const INTERACTION_STYLES: InteractionStyles = {
    hover: {
        radiusIncrease: 2,
        strokeWidthIncrease: 1,
    },
    active: {
        haloRadius: 16,
        haloOpacity: 0.25,
        haloColor: "#007C7C",  // Teal halo
    },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get semantic pin style for a status.
 */
export function getPinSemanticStyle(status: ExtendedStatus): PinSemanticStyle {
    return PIN_SEMANTIC_STYLES[status] ?? PIN_SEMANTIC_STYLES.unclaimed;
}

/**
 * Get interaction styles.
 */
export function getInteractionStyles(): InteractionStyles {
    return INTERACTION_STYLES;
}

/**
 * Check if a status should show a badge.
 */
export function hasBadge(status: ExtendedStatus): boolean {
    return PIN_SEMANTIC_STYLES[status]?.badge.show ?? false;
}

/**
 * Check if a status has a ring (social indicator).
 */
export function hasRing(status: ExtendedStatus): boolean {
    return PIN_SEMANTIC_STYLES[status]?.ring.show ?? false;
}

/**
 * Get all extended statuses (including admin-only).
 */
export function getAllExtendedStatuses(): ExtendedStatus[] {
    return ["unclaimed", "claimed", "open_to_talking", "settled", "for_sale", "for_rent", "unknown", "flagged"];
}
