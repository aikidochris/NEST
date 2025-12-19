"use client";

import { useEffect, useCallback, useState } from "react";
import type { PropertyPublic } from "@/types/property";
import { PropertyImage } from "./PropertyImage";
import { getChipStyle, getPublicLabel, getPinColor } from "@/lib/statusStyles";
import { type Status } from "@/lib/status";

// =============================================================================
// PROXIMITY GUARD CONSTANTS
// =============================================================================
const WALK_SPEED_METERS_PER_MIN = 80;  // Average walking speed
const MAX_WALK_THRESHOLD_METERS = 1200;  // 15 minutes max

// Anchor categories for proximity display
type AnchorCategory = "school" | "transport" | "amenity" | "spirit";

interface ProximityAnchor {
    id: string;
    name: string;
    category: AnchorCategory;
    distance: number;  // meters
    walkMins: number;
}

/**
 * Haversine formula to calculate distance between two coordinates in meters.
 * Accurate for short distances at any latitude.
 */
function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg: number) => deg * (Math.PI / 180);

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
 * Map anchor_type to display category
 */
function mapAnchorCategory(anchorType: string, subtype: string): AnchorCategory {
    switch (anchorType) {
        case "school":
            return "school";
        case "transport":
            return "transport";
        case "spirit":
            return "spirit";
        default:
            return "amenity";
    }
}

// =============================================================================
// PROPERTY CARD PREVIEW (Tier 1 - S04)
// Desktop: Right-aligned floating panel inside map container
// Mobile: Bottom sheet with drag handle
// =============================================================================

interface PropertyCardPreviewProps {
    property: PropertyPublic;
    onClose: () => void;
    onViewHome: () => void;
    /** Whether to use mobile bottom sheet layout */
    isMobile?: boolean;
}

/**
 * Tier 1 Expanded Preview Card.
 * Shows hero image, title, story preview, intent chips, and "View home" CTA.
 */
export function PropertyCardPreview({
    property,
    onClose,
    onViewHome,
    isMobile = false,
}: PropertyCardPreviewProps) {
    // Proximity anchors state
    const [proximityAnchors, setProximityAnchors] = useState<ProximityAnchor[]>([]);

    // Fetch nearby anchors and calculate distances
    useEffect(() => {
        const fetchProximityAnchors = async () => {
            // Need property coordinates
            if (!property.lat || !property.lon) {
                setProximityAnchors([]);
                return;
            }

            try {
                // Fetch all anchors (filtered by bbox around property)
                const buffer = 0.02; // ~2km buffer for bbox
                const bbox = [
                    property.lon - buffer,
                    property.lat - buffer,
                    property.lon + buffer,
                    property.lat + buffer
                ].join(",");

                const response = await fetch(`/api/anchors?bbox=${bbox}`);
                if (!response.ok) {
                    setProximityAnchors([]);
                    return;
                }

                const geojson = await response.json();
                if (!geojson.features || geojson.features.length === 0) {
                    setProximityAnchors([]);
                    return;
                }

                // Calculate distances and find closest per category
                const anchorsWithDistance = geojson.features.map((f: GeoJSON.Feature) => {
                    const coords = (f.geometry as GeoJSON.Point).coordinates;
                    const distance = haversineDistance(
                        property.lat,
                        property.lon,
                        coords[1],
                        coords[0]
                    );
                    const category = mapAnchorCategory(
                        f.properties?.anchor_type || "",
                        f.properties?.subtype || ""
                    );
                    return {
                        id: f.properties?.id || "",
                        name: f.properties?.name || "Unknown",
                        category,
                        distance,
                        walkMins: Math.round(distance / WALK_SPEED_METERS_PER_MIN)
                    };
                });

                // Filter to only within threshold and find closest per category
                const withinThreshold = anchorsWithDistance.filter(
                    (a: ProximityAnchor) => a.distance < MAX_WALK_THRESHOLD_METERS
                );

                // Get closest per category
                const closestByCategory = new Map<AnchorCategory, ProximityAnchor>();
                for (const anchor of withinThreshold) {
                    const existing = closestByCategory.get(anchor.category);
                    if (!existing || anchor.distance < existing.distance) {
                        closestByCategory.set(anchor.category, anchor);
                    }
                }

                setProximityAnchors(Array.from(closestByCategory.values()));
            } catch {
                setProximityAnchors([]);
            }
        };

        fetchProximityAnchors();
    }, [property.lat, property.lon]);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Build display title
    const title = property.display_label ||
        [property.house_number, property.street, property.postcode].filter(Boolean).join(", ") ||
        "Property";

    // Get active intent statuses for chips
    const getIntentStatuses = (): Status[] => {
        const statuses: Status[] = [];
        if (property.is_open_to_talking) statuses.push("open_to_talking");
        if (property.is_for_sale) statuses.push("for_sale");
        if (property.is_for_rent) statuses.push("for_rent");
        if (property.is_settled) statuses.push("settled");
        return statuses;
    };

    // Get story preview text
    const getStoryPreview = (): string => {
        if (property.summary_text) {
            return property.summary_text;
        }
        if (!property.is_claimed) {
            return "This home hasn't been claimed yet. If you live here, you can claim it and share your story with the neighborhood.";
        }
        return "No story yet. The owner hasn't shared their story with the neighborhood.";
    };

    const intentStatuses = getIntentStatuses();
    const storyPreview = getStoryPreview();

    // Mobile bottom sheet layout
    if (isMobile) {
        return (
            <div className="fixed inset-0 z-50 pointer-events-none">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/20 pointer-events-auto"
                    onClick={onClose}
                />
                {/* Bottom sheet */}
                <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl pointer-events-auto max-h-[85vh] overflow-hidden">
                    {/* Drag handle */}
                    <div className="flex justify-center py-3">
                        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(85vh-48px)]">
                        {/* Hero image */}
                        <PropertyImage
                            src={property.cover_image_url}
                            alt={title}
                            aspectRatio="16:9"
                            className="mx-4 mb-4"
                        />

                        {/* Card body */}
                        <div className="px-4 pb-6">
                            {/* Title */}
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                {title}
                            </h2>

                            {/* Story preview */}
                            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-4">
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

                            {/* Photos available pill */}
                            {property.has_additional_images && (
                                <div className="mb-4">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Photos available
                                    </span>
                                </div>
                            )}

                            {/* Proximity Guard - Walk time badges */}
                            {proximityAnchors.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {proximityAnchors.map((anchor) => (
                                        <span
                                            key={anchor.id}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                        >
                                            {anchor.walkMins} min walk to {anchor.name}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="mb-4">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                        Quiet residential street
                                    </span>
                                </div>
                            )}

                            {/* Primary CTA */}
                            <button
                                onClick={onViewHome}
                                className="w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                            >
                                View home
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Desktop right-aligned panel layout
    return (
        <div
            className="absolute top-20 right-4 w-[380px] bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden z-40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="property-preview-title"
        >
            {/* Hero image with close button */}
            <div className="relative">
                <PropertyImage
                    src={property.cover_image_url}
                    alt={title}
                    aspectRatio="16:9"
                />
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
                    aria-label="Close"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                {/* Photos available badge */}
                {property.has_additional_images && (
                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/50 text-white text-xs rounded">
                        Photos available
                    </div>
                )}
            </div>

            {/* Card body */}
            <div className="p-4">
                {/* Title */}
                <h2
                    id="property-preview-title"
                    className="text-lg font-semibold text-gray-900 dark:text-white mb-2"
                >
                    {title}
                </h2>

                {/* Story preview */}
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
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

                {/* Proximity Guard - Walk time badges */}
                {proximityAnchors.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {proximityAnchors.map((anchor) => (
                            <span
                                key={anchor.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                            >
                                {anchor.walkMins} min walk to {anchor.name}
                            </span>
                        ))}
                    </div>
                ) : (
                    <div className="mb-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            Quiet residential street
                        </span>
                    </div>
                )}

                {/* Primary CTA */}
                <button
                    onClick={onViewHome}
                    className="w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                    View home
                </button>
            </div>
        </div>
    );
}

// =============================================================================
// CLICK OUTSIDE WRAPPER
// =============================================================================

interface ClickOutsideWrapperProps {
    children: React.ReactNode;
    onClickOutside: () => void;
}

/**
 * Wrapper that detects clicks outside the property card.
 * Use this in the parent component to wrap PropertyCardPreview.
 */
export function PropertyCardClickOutside({
    children,
    onClickOutside,
}: ClickOutsideWrapperProps) {
    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
                onClickOutside();
            }
        },
        [onClickOutside]
    );

    return (
        <div
            className="absolute inset-0 z-30"
            onClick={handleBackdropClick}
        >
            {children}
        </div>
    );
}
