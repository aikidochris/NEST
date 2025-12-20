"use client";

import { useState, useEffect, useCallback } from "react";
import { useClaim } from "@/hooks/useClaim";
import type { PropertyPublic } from "@/types/property";
import { inspectLog, resolveStatus } from "@/lib/inspect";
import { PropertyCardPreview, PropertyCardClickOutside } from "./PropertyCardPreview";
import { PropertyProfileModal } from "./PropertyProfileModal";
import { supabase } from "@/lib/supabase/client";
import { isPropertyMine } from "@/lib/ownership";
import { useMapIntent } from "@/contexts/MapIntentContext";
import { persistOwnerStatus, type OwnerStatus } from "@/lib/intent";

// =============================================================================
// PROPERTY CARD SHEET
// Container component that manages Tier 1 (Preview) and Tier 2 (Modal) states.
// =============================================================================

interface PropertyCardSheetProps {
    /** Property ID to fetch details for */
    propertyId: string;
    /** Callback when card is closed */
    onClose: () => void;
    /** Callback after successful claim */
    onClaimSuccess: () => void;
    /** Callback to refresh map pins instantly */
    onRefreshPins?: () => Promise<void>;
    /** Callback when navigating to a neighbour property (with optional coordinates for fly-to) */
    onSelectNeighbour?: (propertyId: string, lat?: number, lon?: number) => void;
    /** Whether to use mobile layout */
    isMobile?: boolean;
    /** Initial open mode: "card" (default) or "messages" to open messaging panel */
    initialOpenMode?: "card" | "messages";
    /** Initial conversation ID to open directly (used with initialOpenMode="messages") */
    initialConversationId?: string | null;
}

/**
 * Property card container that shows Tier 1 preview and opens Tier 2 modal.
 * Handles data fetching and state management.
 */
export function PropertyCardSheet({
    propertyId,
    onClose,
    onClaimSuccess,
    onRefreshPins,
    onSelectNeighbour,
    isMobile = false,
    initialOpenMode = "card",
    initialConversationId = null,
}: PropertyCardSheetProps) {
    const { claim, claiming, error: claimError, isAuthenticated } = useClaim();
    const { refreshIntentOverlay } = useMapIntent();
    const [property, setProperty] = useState<PropertyPublic | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [justClaimed, setJustClaimed] = useState(false);
    const [showModal, setShowModal] = useState(initialOpenMode === "messages");

    // Fetch property details
    useEffect(() => {
        let cancelled = false;

        async function fetchProperty() {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/properties?id=${propertyId}`);

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`HTTP ${response.status}: ${text}`);
                }

                const json = await response.json();

                if (!json.ok) {
                    throw new Error(json.error?.message || "Failed to load property");
                }

                if (!cancelled) {
                    const found = json.data?.find?.((p: PropertyPublic) => p.property_id === propertyId);
                    let propertyData: PropertyPublic | null = null;

                    if (found) {
                        propertyData = found;
                    } else if (json.data) {
                        propertyData = json.data;
                    } else {
                        throw new Error("Property not found");
                    }

                    // Check ownership via property_claims table
                    const isMine = await isPropertyMine(supabase, propertyId);

                    // Enrich with ownership status
                    const enrichedProperty = { ...propertyData, is_mine: isMine } as PropertyPublic;
                    setProperty(enrichedProperty);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Unknown error");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchProperty();

        return () => {
            cancelled = true;
        };
    }, [propertyId]);

    // Clear justClaimed message after 2 seconds
    useEffect(() => {
        if (justClaimed) {
            const timer = setTimeout(() => setJustClaimed(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [justClaimed]);

    // Handle View home click - opens Tier 2 modal
    const handleViewHome = useCallback(() => {
        setShowModal(true);

        // Log PROPERTY_DETAILS when View home is clicked
        if (property) {
            inspectLog("PROPERTY_DETAILS", {
                property_id: property.property_id,
                is_claimed: property.is_claimed,
                source: "tier1_view_home",
                intent_flags: {
                    soft_listing: property.is_open_to_talking ?? null,
                    settled: property.is_settled ?? null,
                    is_for_sale: property.is_for_sale ?? null,
                    is_for_rent: property.is_for_rent ?? null,
                },
                resolved_status: resolveStatus({
                    is_claimed: property.is_claimed,
                    intent_flags: {
                        soft_listing: property.is_open_to_talking ?? null,
                        settled: property.is_settled ?? null,
                        is_for_sale: property.is_for_sale ?? null,
                        is_for_rent: property.is_for_rent ?? null,
                    },
                }),
            });
        }
    }, [property]);

    // Handle claim action
    const handleClaim = useCallback(async () => {
        const success = await claim(propertyId);
        if (success) {
            setJustClaimed(true);
            if (property) {
                setProperty({ ...property, is_claimed: true, is_mine: true });
            }
            // Trigger map pin refresh
            refreshIntentOverlay(propertyId);
            onRefreshPins?.(); // Instant UI Echo
            onClaimSuccess();
        }
    }, [claim, propertyId, property, onClaimSuccess, refreshIntentOverlay, onRefreshPins]);

    // Handle message action - opens Tier 2 modal where messaging is embedded
    const handleMessage = useCallback(() => {
        if (!property) return;

        inspectLog("MESSAGE_OWNER", {
            property_id: property.property_id,
        });

        // Open Tier 2 modal which has embedded messaging
        setShowModal(true);
    }, [property]);

    // Handle follow action (placeholder)
    const handleFollow = useCallback(() => {
        inspectLog("FOLLOW_PROPERTY", {
            property_id: property?.property_id,
        });
        // TODO: Implement follow functionality
    }, [property]);

    // Handle status update (owner)
    const handleStatusUpdate = useCallback(async (status: string) => {
        if (!property) return;

        inspectLog("OWNER_STATUS_UPDATE", {
            property_id: property.property_id,
            new_status: status,
        });

        // Update local state optimistically
        setProperty(prev => prev ? {
            ...prev,
            is_open_to_talking: status === "open_to_talking",
            is_for_sale: status === "for_sale",
            is_for_rent: status === "for_rent",
            is_settled: status === "settled",
        } : null);

        // Persist to Supabase intent_flags table
        const success = await persistOwnerStatus(
            supabase,
            property.property_id,
            status as OwnerStatus
        );

        if (success) {
            console.log("[Owner] Status persisted to database:", status);
            onRefreshPins?.(); // Instant UI Echo
        } else {
            console.error("[Owner] Failed to persist status");
        }

        // Trigger map pin refresh (will re-fetch from DB)
        refreshIntentOverlay(property.property_id);
    }, [property, refreshIntentOverlay, onRefreshPins]);

    // Handle story update (owner)
    const handleStoryUpdate = useCallback(async (story: string) => {
        if (!property) return;

        inspectLog("OWNER_STORY_UPDATE", {
            property_id: property.property_id,
        });

        // Update local state
        setProperty(prev => prev ? { ...prev, summary_text: story } : null);

        // TODO: Call API to persist story change
        console.log("[Owner] Story updated:", story.substring(0, 50) + "...");
    }, [property]);

    // Handle cover photo upload (owner)
    const handleCoverUpload = useCallback(async (file: File) => {
        if (!property) return;

        inspectLog("OWNER_COVER_UPLOAD", {
            property_id: property.property_id,
            file_name: file.name,
            file_size: file.size,
        });

        // TODO: Upload to storage and update property
        console.log("[Owner] Cover upload:", file.name, file.size);
    }, [property]);

    // Close modal
    const handleCloseModal = useCallback(() => {
        setShowModal(false);
    }, []);

    // Loading state
    if (loading) {
        return (
            <div className="absolute top-20 right-4 w-[380px] bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden z-40 animate-pulse">
                <div className="w-full h-48 bg-gray-200 dark:bg-gray-700" />
                <div className="p-4">
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
                    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-full mb-2" />
                    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-5/6 mb-4" />
                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
            </div>
        );
    }

    // Error state
    if (error || !property) {
        return (
            <div className="absolute top-20 right-4 w-[380px] bg-white dark:bg-gray-900 rounded-xl shadow-xl p-4 z-40">
                <div className="flex items-start justify-between mb-3">
                    <p className="text-sm text-red-600 dark:text-red-400">
                        {error || "Property not found"}
                    </p>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Tier 1 - Preview Card */}
            <PropertyCardClickOutside onClickOutside={onClose}>
                <PropertyCardPreview
                    property={property}
                    onClose={onClose}
                    onViewHome={handleViewHome}
                    isMobile={isMobile}
                />
            </PropertyCardClickOutside>

            {/* Tier 2 - Profile Modal */}
            {showModal && (
                <PropertyProfileModal
                    property={property}
                    onClose={handleCloseModal}
                    isAuthenticated={isAuthenticated}
                    onClaim={handleClaim}
                    onMessage={handleMessage}
                    onFollow={handleFollow}
                    onStatusUpdate={handleStatusUpdate}
                    onStoryUpdate={handleStoryUpdate}
                    onCoverUpload={handleCoverUpload}
                    initialOpenMode={initialOpenMode}
                    initialConversationId={initialConversationId}
                    onSelectNeighbour={onSelectNeighbour}
                />
            )}
        </>
    );
}

