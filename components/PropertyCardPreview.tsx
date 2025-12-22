"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { PropertyPublic } from "@/types/property";
import { PropertyImage } from "./PropertyImage";
import { getChipStyle, getPublicLabel, getPinColor } from "@/lib/statusStyles";
import { type Status } from "@/lib/status";
import {
    type ProximityAnchor,
    processProximityAnchors,
    MAX_WALK_THRESHOLD_METERS
} from "@/lib/proximity";



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
    screenCoords?: { x: number; y: number } | null;
}

/**
 * Tier 1 Expanded Preview Card.
 * Desktop: Spatially anchored floating card "Ember Card".
 * Mobile: Bottom sheet.
 */
export function PropertyCardPreview({
    property,
    onClose,
    onViewHome,
    isMobile = false,
    screenCoords,
}: PropertyCardPreviewProps) {
    const [imgError, setImgError] = useState(false);
    // Proximity Guard: State for raw anchor data (cached in state)
    const [allAnchors, setAllAnchors] = useState<any[]>([]);

    useEffect(() => {
        const fetchAllAnchors = async () => {
            if (allAnchors.length > 0) return; // Only fetch once
            try {
                const response = await fetch("/api/anchors");
                const geojson = await response.json();
                if (geojson.features) {
                    setAllAnchors(geojson.features);
                }
            } catch (err) {
                console.error("Failed to fetch anchors for cache:", err);
            }
        };
        fetchAllAnchors();
    }, [allAnchors.length]);

    // Proximity Guard: Memoized processing (runs only when property coordinates change)
    const proximityAnchors = useMemo(() => {
        if (!property.lat || !property.lon || allAnchors.length === 0) {
            return [];
        }
        return processProximityAnchors(allAnchors, property.lat, property.lon);
    }, [property.lat, property.lon, allAnchors]);

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

    // Desktop Spatially Anchored Ember Card
    // We don't return null if hasPosition is false, because that would prevent it from mounting
    // and setting up the transition. Instead we hide it until coordinates are ready.
    const hasPosition = !isMobile && !!screenCoords;

    if (!isMobile) {
        return (
            <motion.div
                layoutId={`property-card-${property.property_id}`}
                className="absolute z-50 flex items-center gap-3 p-2 bg-white/70 backdrop-blur-xl rounded-[32px] shadow-2xl border border-white/50 cursor-pointer origin-center"
                style={{
                    left: screenCoords?.x ?? 0,
                    top: screenCoords?.y ?? 0,
                    visibility: hasPosition ? "visible" : "hidden",
                }}
                initial={{ opacity: 0, scale: 0.9, x: "-50%", y: "calc(-100% - 14px)" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "calc(-100% - 24px)" }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                onClick={onViewHome}
            >
                {/* Thumbnail */}
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0 bg-[#FDF8F3]">
                    {(!imgError && (property.thumbnail_url || property.cover_image_url || property.hero_image_url)) ? (
                        <img
                            src={property.thumbnail_url || property.cover_image_url || property.hero_image_url || ''}
                            alt={title}
                            className="w-full h-full object-cover"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-orange-50 to-rose-50 flex items-center justify-center">
                            <svg className="w-6 h-6 text-orange-200" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 9.5L12 3L21 9.5V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M12 17C13.1046 17 14 16.1046 14 15C14 13.8954 12 11 12 11C12 11 10 13.8954 10 15C10 16.1046 10.8954 17 12 17Z" fill="currentColor" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex flex-col pr-4">
                    <span className="text-sm font-bold text-gray-900 leading-tight whitespace-nowrap">{title}</span>
                    <span className="text-xs font-medium text-gray-600">
                        {property.metadata?.price_text || property.display_label || "View Home"}
                    </span>
                </div>
            </motion.div>
        );
    }

    // Default return (should not be reached if not mobile and no position, but TypeScript safety)
    return null;
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
