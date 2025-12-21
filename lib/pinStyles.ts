/**
 * Pin semantic styles - shape, ring, badge, halo configurations.
 * Single source of truth for map pins and UI baseline.
 * 
 * STRICT EMBER RULE (hearth. brand bible):
 * - Active states (for_rent, for_sale, open_to_talking) = EMBER fill
 * - Unclaimed = Muted Grey (#9CA3AF)
 * - Base radius = 5px (editorial, not app-like)
 * - Stroke = 0.5px INK (#1B1B1B)
 * - Glyphs: '+' (open_to_talking), '£' (for_sale), 'r' (for_rent)
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
    /** Whether the pin should pulse (Living Pin) */
    pulse: boolean;
    /** Internal glyph/symbol (e.g. "+", "£", "r") */
    glyph?: string;
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
// SEMANTIC PIN STYLES BY STATUS - STRICT EMBER RULE
// =============================================================================

const INK_STROKE = "#1B1B1B";  // Brand ink color for strokes

export const PIN_SEMANTIC_STYLES: Record<ExtendedStatus, PinSemanticStyle> = {
    unclaimed: {
        radius: 4.5,
        fillColor: PIN_COLORS.unclaimed,
        hollow: false,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
        pulse: false,
    },
    claimed: {
        radius: 4.5,
        fillColor: PIN_COLORS.claimed,
        hollow: false,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
        pulse: false,
    },
    owner_no_status: {
        radius: 4.5,
        fillColor: PIN_COLORS.owner_no_status,
        hollow: false,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
        pulse: false,
    },
    open_to_talking: {
        radius: 4.5,
        fillColor: PIN_COLORS.open_to_talking,  // EMBER
        hollow: false,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: true, width: 2, color: "#E08E5F" },  // Ember ring
        pulse: true,
        glyph: "+",
    },
    for_sale: {
        radius: 4.5,
        fillColor: PIN_COLORS.for_sale,  // EMBER
        hollow: false,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "solid",
        badge: { show: true, color: "#E08E5F" },
        ring: { show: false, width: 0, color: "" },
        pulse: true,
        glyph: "£",
    },
    for_rent: {
        radius: 4.5,
        fillColor: PIN_COLORS.for_rent,  // EMBER (was Indigo)
        hollow: false,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "solid",
        badge: { show: true, color: "#E08E5F" },
        ring: { show: false, width: 0, color: "" },
        pulse: true,  // Active state pulses
        glyph: "r",   // Key/rental indicator
    },
    settled: {
        radius: 4.5,
        fillColor: PIN_COLORS.settled,
        hollow: false,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "solid",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
        pulse: false,
    },
    unknown: {
        radius: 4.5,
        fillColor: "transparent",
        hollow: true,
        strokeWidth: 0.5,
        strokeColor: INK_STROKE,
        strokeStyle: "dashed",
        badge: { show: false, color: "" },
        ring: { show: false, width: 0, color: "" },
        pulse: false,
    },
    flagged: {
        radius: 4.5,
        fillColor: "transparent",
        hollow: true,
        strokeWidth: 1,
        strokeColor: "#DC2626",  // Red for flagged
        strokeStyle: "dashed",
        badge: { show: true, color: "#DC2626", symbol: "!" },
        ring: { show: false, width: 0, color: "" },
        pulse: false,
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
        haloColor: "#E08E5F",  // Ember halo
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
