"use client";

import { useState } from "react";
import { resolveStatus, type Status } from "@/lib/status";
import { AreaVibeBar, type VibeStats, type LiveFeedEvent } from "@/components/AreaVibeBar";
import {
    getPinColor,
    getChipStyle,
    getDevLabel,
    getPublicLabel,
    getPublicLegendStatuses,
    getAllStatuses,
    PIN_COLORS,
} from "@/lib/statusStyles";
import {
    getPinSemanticStyle,
    getInteractionStyles,
    type ExtendedStatus,
    type PinSemanticStyle,
} from "@/lib/pinStyles";
import { PropertyImage } from "@/components/PropertyImage";
import type { PropertyPublic } from "@/types/property";

// =============================================================================
// STATUS CHIP COMPONENT
// =============================================================================

function StatusChip({ status, devMode = false }: { status: Status; devMode?: boolean }) {
    const { bg, text } = getChipStyle(status);
    const label = devMode ? getDevLabel(status) : (getPublicLabel(status) ?? getDevLabel(status));
    return (
        <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${bg} ${text}`}>
            {label}
        </span>
    );
}

// =============================================================================
// PIN PREVIEW COMPONENT
// =============================================================================

function PinPreview({ status, devMode = false }: { status: Status; devMode?: boolean }) {
    const color = getPinColor(status);
    const label = devMode ? getDevLabel(status) : (getPublicLabel(status) ?? "");
    const isUnknown = status === "unknown";

    return (
        <div className="flex flex-col items-center gap-1">
            <svg width="24" height="24" viewBox="0 0 24 24">
                {isUnknown ? (
                    // Dashed outline for unknown/debug
                    <circle
                        cx="12" cy="12" r="7"
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray="4 2"
                    />
                ) : (
                    <circle cx="12" cy="12" r="8" fill={color} stroke="#fff" strokeWidth="2" />
                )}
            </svg>
            <span className="text-xs text-gray-500">{label}</span>
        </div>
    );
}

// =============================================================================
// SMALL PROPERTY CARD (S04) - STATIC VARIANT
// =============================================================================

interface SmallPropertyCardProps {
    title: string;
    status: Status;
    statusLabel: string;
}

function SmallPropertyCard({ title, status, statusLabel }: SmallPropertyCardProps) {
    const isClaimed = status !== "unclaimed";
    const showOpenBadge = status === "open_to_talking";

    return (
        <div className="bg-white rounded-t-xl shadow-lg w-full max-w-[420px] p-4">
            {/* Header with close button */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
                    {/* Status badge */}
                    <span
                        className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${isClaimed
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                            }`}
                    >
                        {isClaimed ? "Claimed" : "Unclaimed"}
                    </span>
                    {/* Open to talking badge */}
                    {showOpenBadge && (
                        <span className="inline-block mt-1 ml-2 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">
                            Open to Talking
                        </span>
                    )}
                </div>
                <button
                    className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Primary action - View home */}
            <button
                className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors mb-2"
            >
                View home
            </button>

            {/* Status-specific action text */}
            <p className="text-center text-sm text-gray-500">
                {statusLabel}
            </p>
        </div>
    );
}

// =============================================================================
// GLASS/SOLID SURFACE STYLES
// =============================================================================

const SOLID_SURFACE = "bg-white";
const GLASS_SURFACE = "bg-white/90 backdrop-blur-[12px] border border-white/30";

function getSurfaceClass(glassMode: boolean): string {
    return glassMode ? GLASS_SURFACE : SOLID_SURFACE;
}

// =============================================================================
// EXPANDED PROPERTY CARD PREVIEW (matches real PropertyCardSheet)
// =============================================================================

// Placeholder image SVG data URL
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Crect fill='%23E5E7EB' width='400' height='200'/%3E%3Cpath d='M160 80h80v40h-80z' fill='%23D1D5DB'/%3E%3Ccircle cx='200' cy='70' r='20' fill='%23D1D5DB'/%3E%3Cpath d='M140 140h120l-30-40-20 25-15-15z' fill='%23D1D5DB'/%3E%3C/svg%3E";

interface ExpandedPropertyCardPreviewProps {
    glassMode: boolean;
    hasPhoto?: boolean;
    hasMorePhotos?: boolean;
    isClaimed?: boolean;
    intentStatuses?: Status[];
    storyPreview?: string;
}

function ExpandedPropertyCardPreview({
    glassMode,
    hasPhoto = false,
    hasMorePhotos = false,
    isClaimed = true,
    intentStatuses = ["open_to_talking"],
    storyPreview = "We've been in this home for about five years now. Great neighbours on both sides, and the park at the end of the street is perfect for morning walks.",
}: ExpandedPropertyCardPreviewProps) {
    const heroImage = hasPhoto
        ? "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=200&fit=crop"
        : PLACEHOLDER_IMAGE;

    return (
        <div className={`rounded-xl shadow-lg w-full max-w-[420px] overflow-hidden ${getSurfaceClass(glassMode)}`}>
            {/* Hero Image - always present, never collapses */}
            <div className="relative w-full h-40 bg-gray-100">
                <img
                    src={heroImage}
                    alt="42 Oak Street"
                    className="w-full h-full object-cover"
                />
                {/* Close button overlay */}
                <button
                    className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white"
                    aria-label="Close"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                {/* Photos available indicator */}
                {hasMorePhotos && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
                        Photos available
                    </div>
                )}
            </div>

            {/* Card content */}
            <div className="px-4 py-4">
                {/* Property title */}
                <h2 className="text-lg font-semibold text-gray-900 mb-2">42 Oak Street, NE1 4AB</h2>

                {/* Home Story preview (first-person tone) */}
                <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3">
                    {storyPreview}
                </p>

                {/* Intent chips */}
                {intentStatuses.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {intentStatuses.map((status) => {
                            const { bg, text } = getChipStyle(status);
                            const label = getPublicLabel(status);
                            if (!label) return null;
                            return (
                                <span
                                    key={status}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${bg} ${text}`}
                                >
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: getPinColor(status) }}
                                    />
                                    {label}
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* Primary action button */}
                <button className="w-full py-2.5 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
                    View home
                </button>

                {/* Claim prompt for unclaimed */}
                {!isClaimed && (
                    <p className="mt-3 text-center text-xs text-gray-400">
                        Is this your home? <span className="text-blue-600">Sign in to claim</span>
                    </p>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// SMALL PROPERTY CARD WITH GLASS SUPPORT
// =============================================================================

interface SmallPropertyCardGlassProps {
    title: string;
    status: Status;
    statusLabel: string;
    glassMode: boolean;
}

function SmallPropertyCardGlass({ title, status, statusLabel, glassMode }: SmallPropertyCardGlassProps) {
    const isClaimed = status !== "unclaimed";
    const showOpenBadge = status === "open_to_talking";

    return (
        <div className={`rounded-t-xl shadow-lg w-full max-w-[420px] p-4 ${getSurfaceClass(glassMode)}`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
                    <span
                        className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${isClaimed
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                            }`}
                    >
                        {isClaimed ? "Claimed" : "Unclaimed"}
                    </span>
                    {showOpenBadge && (
                        <span className="inline-block mt-1 ml-2 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">
                            Open to Talking
                        </span>
                    )}
                </div>
                <button className="ml-2 p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <button className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors mb-2">
                View home
            </button>
            <p className="text-center text-sm text-gray-500">{statusLabel}</p>
        </div>
    );
}

// =============================================================================
// AREA VIBE BAR WITH GLASS SUPPORT (INLINE PREVIEW)
// =============================================================================

function AreaVibeBarPreview({ glassMode, expanded }: { glassMode: boolean; expanded: boolean }) {
    if (!expanded) {
        return (
            <div className={`rounded-full px-4 py-2 shadow-sm border border-gray-100 ${getSurfaceClass(glassMode)}`}>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-600">
                        <span className="font-medium text-purple-600">12</span> claimed
                    </span>
                    <span className="text-gray-600">
                        <span className="font-medium text-blue-600">3</span> open
                    </span>
                    <span className="text-gray-300">▲</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`rounded-t-2xl shadow-lg w-full max-w-[420px] border border-gray-100 ${getSurfaceClass(glassMode)}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-medium text-gray-900">This area</h3>
                <button className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-2xl font-semibold text-purple-600">12</p>
                        <p className="text-xs text-gray-500">Claimed</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-semibold text-blue-600">3</p>
                        <p className="text-xs text-gray-500">Open to talk</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// MAP PIN COMPONENT (Static overlay) - Supports Basic/Semantic modes
// =============================================================================

interface MapPinProps {
    status: ExtendedStatus;
    x: number;  // percentage 0-100
    y: number;  // percentage 0-100
    size?: number;
    semantic?: boolean;
    hovered?: boolean;
    active?: boolean;
}

function MapPin({ status, x, y, size = 14, semantic = false, hovered = false, active = false }: MapPinProps) {
    // Get basic color (fallback for basic mode)
    const basicColor = status === "flagged" ? "#DC2626" : getPinColor(status as Status);

    // Get semantic style
    const style = getPinSemanticStyle(status);
    const interaction = getInteractionStyles();

    // Calculate effective values based on state
    const effectiveRadius = semantic
        ? style.radius + (hovered ? interaction.hover.radiusIncrease : 0)
        : 5;
    const effectiveStrokeWidth = semantic
        ? style.strokeWidth + (hovered ? interaction.hover.strokeWidthIncrease : 0)
        : 1;

    // SVG viewBox size (needs to accommodate halo)
    const viewBoxSize = semantic && active ? 40 : 20;
    const center = viewBoxSize / 2;

    // Scale factor for pin size
    const scale = size / 14;

    if (!semantic) {
        // Basic mode - simple circles like before
        const isUnknown = status === "unknown";
        const isFlagged = status === "flagged";

        return (
            <div
                className="absolute"
                style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: "translate(-50%, -50%)",
                }}
            >
                <svg width={size} height={size} viewBox="0 0 12 12">
                    {(isUnknown || isFlagged) ? (
                        <circle
                            cx="6" cy="6" r="4"
                            fill="none"
                            stroke={basicColor}
                            strokeWidth="1.5"
                            strokeDasharray="2 1"
                        />
                    ) : (
                        <circle
                            cx="6" cy="6" r="5"
                            fill={basicColor}
                            stroke="#fff"
                            strokeWidth="1"
                        />
                    )}
                </svg>
            </div>
        );
    }

    // Semantic mode - full styling
    const dashArray = style.strokeStyle === "dashed" ? "3 2" : undefined;

    return (
        <div
            className="absolute"
            style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: active ? 10 : hovered ? 5 : 1,
            }}
        >
            <svg
                width={viewBoxSize * scale}
                height={viewBoxSize * scale}
                viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            >
                {/* Active halo (glow) */}
                {active && (
                    <circle
                        cx={center}
                        cy={center}
                        r={interaction.active.haloRadius}
                        fill={interaction.active.haloColor}
                        opacity={interaction.active.haloOpacity}
                    />
                )}

                {/* Ring for social states (open_to_talking) */}
                {style.ring.show && (
                    <circle
                        cx={center}
                        cy={center}
                        r={effectiveRadius + style.ring.width}
                        fill="none"
                        stroke={style.ring.color}
                        strokeWidth={style.ring.width}
                        opacity={0.4}
                    />
                )}

                {/* Main pin circle */}
                <circle
                    cx={center}
                    cy={center}
                    r={effectiveRadius}
                    fill={style.hollow ? "none" : style.fillColor}
                    stroke={style.strokeColor}
                    strokeWidth={effectiveStrokeWidth}
                    strokeDasharray={dashArray}
                />

                {/* Badge dot (for for_sale, for_rent, flagged) */}
                {style.badge.show && (
                    <>
                        <circle
                            cx={center + effectiveRadius * 0.7}
                            cy={center - effectiveRadius * 0.7}
                            r={3}
                            fill={style.badge.color}
                            stroke="#fff"
                            strokeWidth={0.5}
                        />
                        {/* Badge symbol (! for flagged) */}
                        {style.badge.symbol && (
                            <text
                                x={center + effectiveRadius * 0.7}
                                y={center - effectiveRadius * 0.7 + 1}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#fff"
                                fontSize="4"
                                fontWeight="bold"
                            >
                                {style.badge.symbol}
                            </text>
                        )}
                    </>
                )}
            </svg>
        </div>
    );
}

// =============================================================================
// SAMPLE PINS DATA (deterministic positions)
// =============================================================================

interface SamplePin {
    status: ExtendedStatus;
    x: number;
    y: number;
    hovered?: boolean;
    active?: boolean;
}

// Generate ~50 sample pins with realistic distribution
function generateSamplePins(): SamplePin[] {
    const pins: SamplePin[] = [];

    // Seed positions for unclaimed (majority - ~35 pins)
    const unclaimedPositions = [
        [8, 12], [15, 8], [22, 15], [28, 22], [35, 10],
        [42, 18], [48, 12], [55, 20], [62, 8], [68, 15],
        [75, 22], [82, 10], [88, 18], [92, 25], [12, 35],
        [18, 42], [25, 38], [32, 45], [38, 52], [45, 35],
        [52, 48], [58, 42], [65, 55], [72, 38], [78, 48],
        [85, 42], [10, 62], [18, 70], [25, 65], [32, 75],
        [40, 68], [48, 78], [55, 62], [62, 72], [70, 65],
        [78, 75], [85, 68], [90, 78],
    ];
    for (const [x, y] of unclaimedPositions) {
        pins.push({ status: "unclaimed", x, y });
    }

    // Intent pins (stand out)
    pins.push({ status: "open_to_talking", x: 20, y: 28 });
    pins.push({ status: "open_to_talking", x: 58, y: 32, hovered: true }); // Demo hover
    pins.push({ status: "open_to_talking", x: 75, y: 58 });

    pins.push({ status: "for_sale", x: 35, y: 55, active: true }); // Demo active
    pins.push({ status: "for_sale", x: 82, y: 35 });

    pins.push({ status: "for_rent", x: 45, y: 25 });
    pins.push({ status: "for_rent", x: 68, y: 82 });

    pins.push({ status: "settled", x: 28, y: 68 });
    pins.push({ status: "settled", x: 52, y: 85 });
    pins.push({ status: "settled", x: 88, y: 55 });

    // One owner with no status (claimed)
    pins.push({ status: "claimed", x: 42, y: 42 });

    // One unknown/debug (dashed outline)
    pins.push({ status: "unknown", x: 15, y: 85 });

    // One flagged (admin-only)
    pins.push({ status: "flagged", x: 92, y: 62 });

    return pins;
}

const SAMPLE_PINS = generateSamplePins();

function SamplePinsOverlay({ semantic = false }: { semantic?: boolean }) {
    return (
        <>
            {SAMPLE_PINS.map((pin, idx) => (
                <MapPin
                    key={idx}
                    status={pin.status}
                    x={pin.x}
                    y={pin.y}
                    size={14}
                    semantic={semantic}
                    hovered={pin.hovered}
                    active={pin.active}
                />
            ))}
        </>
    );
}

// =============================================================================
// UI BASELINE PAGE
// =============================================================================

export default function UIBaselinePage() {
    const [vibeExpanded, setVibeExpanded] = useState(true);
    const [glassMode, setGlassMode] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [semanticMode, setSemanticMode] = useState(true);  // Default to Semantic on dev

    // Mock data for Area Vibe Bar
    const mockVibeStats: VibeStats = {
        claimed: 12,
        open_to_talk: 3,
        for_sale: 2,
        for_rent: 1,
    };

    const mockLiveFeedEvents: LiveFeedEvent[] = [
        {
            event_type: "claim",
            property_id: "mock-1",
            display_label: "42 Oak Street, NE1 4AB",
            created_at: new Date(Date.now() - 5 * 60000).toISOString(),
            summary: "Property claimed by a neighbor",
        },
        {
            event_type: "status",
            property_id: "mock-2",
            display_label: "17 Maple Avenue, NE2 3CD",
            created_at: new Date(Date.now() - 30 * 60000).toISOString(),
            summary: "Marked as open to talking",
        },
        {
            event_type: "note",
            property_id: "mock-3",
            display_label: "8 Pine Road, NE3 2EF",
            created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
            summary: "Left a note for the owner",
        },
    ];

    // All statuses for dev display
    const allStatuses = getAllStatuses();

    // Public legend statuses (no unclaimed, claimed, unknown)
    const publicLegendStatuses = getPublicLegendStatuses();

    // Verify resolveStatus works correctly
    const statusExamples = [
        { input: { is_claimed: false, intent_flags: null }, expected: "unclaimed" },
        { input: { is_claimed: true, intent_flags: null }, expected: "claimed" },
        { input: { is_claimed: true, intent_flags: { soft_listing: true } }, expected: "open_to_talking" },
        { input: { is_claimed: true, intent_flags: { settled: true } }, expected: "settled" },
        { input: { is_claimed: true, intent_flags: { is_for_sale: true } }, expected: "for_sale" },
        { input: { is_claimed: true, intent_flags: { is_for_rent: true } }, expected: "for_rent" },
        { input: { is_claimed: null, intent_flags: null }, expected: "unknown" },
    ];

    return (
        <div className={`min-h-screen p-6 ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <header className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <h1 className={`text-3xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                            UI Baseline
                        </h1>
                        {/* Dark Backdrop Toggle */}
                        <div className="flex items-center gap-2">
                            <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                                Backdrop:
                            </span>
                            <button
                                onClick={() => setDarkMode(false)}
                                className={`px-3 py-1 text-sm rounded ${!darkMode ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-300"}`}
                            >
                                Light
                            </button>
                            <button
                                onClick={() => setDarkMode(true)}
                                className={`px-3 py-1 text-sm rounded ${darkMode ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
                            >
                                Dark
                            </button>
                        </div>
                    </div>
                    <p className={darkMode ? "text-gray-400" : "text-gray-600"}>
                        Dev-only page for reviewing UI states before map color finalization.
                    </p>
                    <p className="text-sm text-amber-600 mt-2">
                        ⚠️ This page is for development only and should not be deployed to production.
                    </p>
                </header>

                {/* Export Screenshots Checklist */}
                <section className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">📸 Export Screenshots Checklist</h2>
                    <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>All 7 status chips (unclaimed → unknown)</li>
                        <li>All 7 pin color previews</li>
                        <li>Small Property Card — Unclaimed variant</li>
                        <li>Small Property Card — Claimed variant</li>
                        <li>Small Property Card — Claimed + Open to Talking variant</li>
                        <li>Area Vibe Bar — Collapsed state</li>
                        <li>Area Vibe Bar — Expanded state (Live Feed tab)</li>
                        <li>Area Vibe Bar — Expanded state (Area Vibe tab)</li>
                        <li>resolveStatus() verification table</li>
                        <li><strong>Map backdrop — Solid mode</strong></li>
                        <li><strong>Map backdrop — Glass mode</strong></li>
                    </ol>
                </section>

                {/* Glass Toggle */}
                <section className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">🪟 Surface Style Toggle</h2>
                    <div className="flex items-center gap-4">
                        <span className="text-gray-700">Surface style:</span>
                        <button
                            onClick={() => setGlassMode(false)}
                            className={`px-4 py-2 rounded ${!glassMode ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
                        >
                            Solid
                        </button>
                        <button
                            onClick={() => setGlassMode(true)}
                            className={`px-4 py-2 rounded ${glassMode ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
                        >
                            Glass
                        </button>
                        <span className="text-sm text-gray-500 ml-4">
                            {glassMode ? "backdrop-blur: 12px, bg: white/90" : "bg: white, opacity: 1"}
                        </span>
                    </div>
                </section>

                {/* Map Backdrop Preview */}
                <section className={`rounded-lg p-6 mb-8 border ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                    <h2 className={`text-xl font-semibold mb-4 ${darkMode ? "text-white" : "text-gray-900"}`}>
                        🗺️ Map Backdrop Preview
                    </h2>
                    <p className={`text-sm mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        ~{SAMPLE_PINS.length} sample pins over static map. Toggle controls to test contrast and semantics.
                    </p>

                    {/* Pin Style Toggle */}
                    <div className="flex items-center gap-4 mb-4">
                        <span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                            Pin Style:
                        </span>
                        <button
                            onClick={() => setSemanticMode(false)}
                            className={`px-3 py-1 text-sm rounded ${!semanticMode ? "bg-blue-500 text-white" : darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-700"}`}
                        >
                            Basic
                        </button>
                        <button
                            onClick={() => setSemanticMode(true)}
                            className={`px-3 py-1 text-sm rounded ${semanticMode ? "bg-blue-500 text-white" : darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-700"}`}
                        >
                            Semantic
                        </button>
                    </div>

                    {/* Semantic Legend (dev-only) */}
                    {semanticMode && (
                        <div className={`text-xs mb-4 p-3 rounded ${darkMode ? "bg-gray-700 text-gray-300" : "bg-amber-50 text-gray-600"}`}>
                            <strong>Semantic legend:</strong>{" "}
                            <span className="inline-flex items-center gap-1">
                                <span className="inline-block w-3 h-3 rounded-full border-2 border-teal-600"></span> Ring = social
                            </span>{" • "}
                            <span className="inline-flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> Badge = market intent
                            </span>{" • "}
                            <span className="inline-flex items-center gap-1">
                                <span className="inline-block w-4 h-4 rounded-full bg-teal-500/25"></span> Halo = active/selected
                            </span>{" • "}
                            <span className="inline-flex items-center gap-1">
                                <span className="inline-block w-3 h-3 rounded-full border border-dashed border-gray-400"></span> Dashed = debug/flagged
                            </span>
                        </div>
                    )}

                    <div
                        className="relative w-full h-[650px] rounded-lg overflow-hidden"
                        style={{
                            backgroundImage: "url(/ui-baseline-map.png)",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        }}
                    >
                        {/* Dark overlay for dark mode */}
                        {darkMode && (
                            <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                        )}

                        {/* Pin Overlay Layer */}
                        <SamplePinsOverlay semantic={semanticMode} />

                        {/* Expanded Card - center */}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                            <ExpandedPropertyCardPreview glassMode={glassMode} />
                        </div>

                        {/* Small Property Card - bottom center */}
                        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-10">
                            <SmallPropertyCardGlass
                                title="42 Oak Street, NE1 4AB"
                                status="open_to_talking"
                                statusLabel="The owner is open to hearing from neighbors"
                                glassMode={glassMode}
                            />
                        </div>

                        {/* Area Vibe Bar - bottom edge */}
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
                            <AreaVibeBarPreview glassMode={glassMode} expanded={false} />
                        </div>

                        {/* Mode indicators */}
                        <div className="absolute top-4 right-4 flex gap-2 z-20">
                            <span className="px-2 py-1 bg-black/60 text-white text-xs rounded">
                                {semanticMode ? "Semantic" : "Basic"}
                            </span>
                            <span className="px-2 py-1 bg-black/60 text-white text-xs rounded">
                                {glassMode ? "Glass" : "Solid"}
                            </span>
                            <span className="px-2 py-1 bg-black/60 text-white text-xs rounded">
                                {darkMode ? "Dark" : "Light"}
                            </span>
                        </div>

                        {/* Pin count indicator */}
                        <div className="absolute top-4 left-4 px-2 py-1 bg-black/60 text-white text-xs rounded z-20">
                            {SAMPLE_PINS.length} pins
                        </div>
                    </div>
                </section>

                {/* 2-Tier Property Card System Preview */}
                <section className={`rounded-lg p-6 mb-8 border ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                    <h2 className={`text-xl font-semibold mb-4 ${darkMode ? "text-white" : "text-gray-900"}`}>
                        🏠 2-Tier Property Card System
                    </h2>
                    <p className={`text-sm mb-6 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        Tier 1 (S04): Preview cards. Tier 2 (S06): Full profile modal. All states shown below.
                    </p>

                    {/* PropertyImage Component States */}
                    <div className="mb-8">
                        <h3 className={`text-lg font-medium mb-4 ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                            PropertyImage Component
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                            {/* Placeholder */}
                            <div>
                                <PropertyImage
                                    src={null}
                                    alt="Placeholder"
                                    aspectRatio="16:9"
                                />
                                <p className={`text-xs mt-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                    Placeholder (no photo)
                                </p>
                            </div>
                            {/* Cover photo */}
                            <div>
                                <PropertyImage
                                    src="https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=225&fit=crop"
                                    alt="Cover photo"
                                    aspectRatio="16:9"
                                />
                                <p className={`text-xs mt-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                    Cover photo
                                </p>
                            </div>
                            {/* Locked tile */}
                            <div>
                                <PropertyImage
                                    src={null}
                                    alt="Locked"
                                    aspectRatio="16:9"
                                    isLocked={true}
                                />
                                <p className={`text-xs mt-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                    Locked album tile
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tier 1 Card Previews */}
                    <div className="mb-8">
                        <h3 className={`text-lg font-medium mb-4 ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                            Tier 1: Preview Cards (Static)
                        </h3>
                        <div className="grid grid-cols-2 gap-6">
                            {/* Unclaimed - no photo */}
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden max-w-[380px]">
                                <PropertyImage src={null} alt="Unclaimed property" aspectRatio="16:9" />
                                <div className="p-4">
                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                        15 Maple Lane, SW2 3DE
                                    </h4>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
                                        This home hasn&apos;t been claimed yet. If you live here, you can claim it and share your story with the neighborhood.
                                    </p>
                                    <button className="w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg">
                                        View home
                                    </button>
                                </div>
                            </div>

                            {/* Claimed - Open to Talking */}
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden max-w-[380px]">
                                <div className="relative">
                                    <PropertyImage
                                        src="https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=225&fit=crop"
                                        alt="Open to talking property"
                                        aspectRatio="16:9"
                                    />
                                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/50 text-white text-xs rounded">
                                        Photos available
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                        42 Oak Street, NE1 4AB
                                    </h4>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
                                        We&apos;ve been here for five years. Love the community feel and the park at the end of the street.
                                    </p>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-teal-100 text-teal-800">
                                            <span className="w-2 h-2 rounded-full bg-teal-600" />
                                            Open to Talking
                                        </span>
                                    </div>
                                    <button className="w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg">
                                        View home
                                    </button>
                                </div>
                            </div>

                            {/* Claimed - For Sale */}
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden max-w-[380px]">
                                <PropertyImage
                                    src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=225&fit=crop"
                                    alt="For sale property"
                                    aspectRatio="16:9"
                                />
                                <div className="p-4">
                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                        8 Willow Court, EC4 7PQ
                                    </h4>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
                                        Time to move on! This home has been perfect for our growing family but we&apos;re relocating.
                                    </p>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                                            <span className="w-2 h-2 rounded-full bg-red-500" />
                                            For Sale
                                        </span>
                                    </div>
                                    <button className="w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg">
                                        View home
                                    </button>
                                </div>
                            </div>

                            {/* Claimed - Settled */}
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden max-w-[380px]">
                                <PropertyImage
                                    src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=225&fit=crop"
                                    alt="Settled property"
                                    aspectRatio="16:9"
                                />
                                <div className="p-4">
                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                        27 Cedar Road, N1 5TG
                                    </h4>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
                                        This is our forever home. We&apos;re not going anywhere and love being part of this street.
                                    </p>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-700">
                                            <span className="w-2 h-2 rounded-full bg-gray-500" />
                                            Settled
                                        </span>
                                    </div>
                                    <button className="w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg">
                                        View home
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tier 2 Action Logic */}
                    <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-700" : "bg-amber-50"}`}>
                        <h3 className={`text-lg font-medium mb-3 ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                            Tier 2: Conditional Primary Action
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className={`font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>Unclaimed:</p>
                                <p className={darkMode ? "text-gray-400" : "text-gray-600"}>Primary = &quot;Claim this home&quot;</p>
                            </div>
                            <div>
                                <p className={`font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>Open to Talking / For Sale / For Rent:</p>
                                <p className={darkMode ? "text-gray-400" : "text-gray-600"}>Primary = &quot;Message owner&quot;</p>
                            </div>
                            <div>
                                <p className={`font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>Settled:</p>
                                <p className={darkMode ? "text-gray-400" : "text-gray-600"}>Primary = &quot;Follow&quot;</p>
                            </div>
                            <div>
                                <p className={`font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>Owner Mode:</p>
                                <p className={darkMode ? "text-gray-400" : "text-gray-600"}>Tools strip under gallery (collapsible)</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Public Legend - Status Chips */}
                <section className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Public Legend — Status Chips</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Intent statuses only. These appear in the public map legend.
                        <br />
                        <span className="text-amber-600">Note: &quot;Claimed&quot; is NOT shown publicly.</span>
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {publicLegendStatuses.map((status) => (
                            <StatusChip key={status} status={status} />
                        ))}
                    </div>
                </section>

                {/* Dev-Only - All Status Chips */}
                <section className="bg-amber-50 rounded-lg p-6 mb-8 border border-amber-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">🔧 Dev-Only — All Status Chips</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        All internal statuses including structural states. Never shown to users.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {allStatuses.map((status) => (
                            <StatusChip key={status} status={status} devMode />
                        ))}
                    </div>
                </section>

                {/* Public Legend - Pin Colors */}
                <section className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Public Legend — Pin Colors</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Intent colors draw the eye. Unclaimed homes appear calm (light grey).
                    </p>
                    <div className="flex flex-wrap gap-6 mb-6">
                        {publicLegendStatuses.map((status) => (
                            <PinPreview key={status} status={status} />
                        ))}
                    </div>
                    <p className="text-sm text-gray-400">
                        Unclaimed pins: <span style={{ color: getPinColor("unclaimed") }}>●</span> {getPinColor("unclaimed")} (light grey, low priority)
                    </p>
                </section>

                {/* Dev-Only - All Pin Colors */}
                <section className="bg-amber-50 rounded-lg p-6 mb-8 border border-amber-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">🔧 Dev-Only — All Pin Colors</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        All pin colors including structural and debug states.
                    </p>
                    <div className="flex flex-wrap gap-6">
                        {allStatuses.map((status) => (
                            <PinPreview key={status} status={status} devMode />
                        ))}
                    </div>
                </section>

                {/* Small Property Cards (S04) */}
                <section className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Small Property Card (S04)</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        3 variants: Unclaimed, Claimed, Claimed + Open to Talking
                    </p>
                    <div className="space-y-6">
                        {/* Variant 1: Unclaimed */}
                        <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Variant 1: Unclaimed</h3>
                            <div className="bg-gray-100 p-4 rounded-lg">
                                <SmallPropertyCard
                                    title="42 Oak Street, NE1 4AB"
                                    status="unclaimed"
                                    statusLabel="Is this your home? Sign in to claim"
                                />
                            </div>
                        </div>

                        {/* Variant 2: Claimed */}
                        <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Variant 2: Claimed</h3>
                            <div className="bg-gray-100 p-4 rounded-lg">
                                <SmallPropertyCard
                                    title="17 Maple Avenue, NE2 3CD"
                                    status="claimed"
                                    statusLabel="This home has been claimed by its owner"
                                />
                            </div>
                        </div>

                        {/* Variant 3: Claimed + Open to Talking */}
                        <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Variant 3: Claimed + Open to Talking</h3>
                            <div className="bg-gray-100 p-4 rounded-lg">
                                <SmallPropertyCard
                                    title="8 Pine Road, NE3 2EF"
                                    status="open_to_talking"
                                    statusLabel="The owner is open to hearing from neighbors"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Area Vibe Bar */}
                <section className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Area Vibe Bar</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Mocked with sample counts. Toggle to see both states.
                    </p>
                    <div className="flex gap-4 mb-6">
                        <button
                            onClick={() => setVibeExpanded(false)}
                            className={`px-4 py-2 rounded ${!vibeExpanded ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        >
                            Collapsed
                        </button>
                        <button
                            onClick={() => setVibeExpanded(true)}
                            className={`px-4 py-2 rounded ${vibeExpanded ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        >
                            Expanded
                        </button>
                    </div>
                    <div className="relative bg-gray-100 rounded-lg p-4 min-h-[400px]">
                        <p className="text-xs text-gray-400 mb-2">Preview container (not positioned fixed)</p>
                        {/* Wrap in relative container to preview */}
                        <div className="relative">
                            <AreaVibeBar
                                stats={mockVibeStats}
                                events={mockLiveFeedEvents}
                                loading={false}
                                eventsLoading={false}
                                expanded={vibeExpanded}
                                onToggleExpand={() => setVibeExpanded(!vibeExpanded)}
                                onEventClick={(e) => console.log("Event clicked:", e)}
                            />
                        </div>
                    </div>
                </section>

                {/* resolveStatus() Verification */}
                <section className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">resolveStatus() Verification</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Confirms the status resolver produces correct outputs
                    </p>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-2 px-3">is_claimed</th>
                                <th className="text-left py-2 px-3">intent_flags</th>
                                <th className="text-left py-2 px-3">Expected</th>
                                <th className="text-left py-2 px-3">Actual</th>
                                <th className="text-left py-2 px-3">✓</th>
                            </tr>
                        </thead>
                        <tbody>
                            {statusExamples.map((ex, idx) => {
                                const actual = resolveStatus({
                                    is_claimed: ex.input.is_claimed,
                                    intent_flags: ex.input.intent_flags,
                                });
                                const pass = actual === ex.expected;
                                return (
                                    <tr key={idx} className="border-b">
                                        <td className="py-2 px-3 font-mono text-xs">
                                            {String(ex.input.is_claimed)}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-xs">
                                            {ex.input.intent_flags
                                                ? JSON.stringify(ex.input.intent_flags)
                                                : "null"}
                                        </td>
                                        <td className="py-2 px-3">{ex.expected}</td>
                                        <td className="py-2 px-3">{actual}</td>
                                        <td className="py-2 px-3">
                                            {pass ? (
                                                <span className="text-green-600">✓</span>
                                            ) : (
                                                <span className="text-red-600">✗</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>

                {/* Footer */}
                <footer className="text-center text-gray-400 text-sm py-8">
                    UI Baseline — Nest Pre-MVP — Dev Only
                </footer>
            </div>
        </div>
    );
}
