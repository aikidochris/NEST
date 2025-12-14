"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useClaim } from "@/hooks/useClaim";
import type { PropertyPublic } from "@/types/property";
import { inspectLog, resolveStatus } from "@/lib/inspect";

interface PropertyCardSheetProps {
    /** Property ID to fetch details for */
    propertyId: string;
    onClose: () => void;
    onClaimSuccess: () => void;
}

/**
 * Bottom sheet card for selected property.
 * Fetches property details by ID and shows claim action.
 */
export function PropertyCardSheet({ propertyId, onClose, onClaimSuccess }: PropertyCardSheetProps) {
    const { claim, claiming, error: claimError, isAuthenticated } = useClaim();
    const [property, setProperty] = useState<PropertyPublic | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [justClaimed, setJustClaimed] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

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

                    setProperty(propertyData);
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

    // Build display title
    const title = property
        ? property.display_label ||
        [property.house_number, property.street, property.postcode].filter(Boolean).join(", ") ||
        "Property"
        : "Loading...";

    // Clear justClaimed message after 2 seconds
    useEffect(() => {
        if (justClaimed) {
            const timer = setTimeout(() => setJustClaimed(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [justClaimed]);

    const handleClaim = useCallback(async () => {
        const success = await claim(propertyId);
        if (success) {
            setJustClaimed(true);
            if (property) {
                setProperty({ ...property, is_claimed: true, is_mine: true });
            }
            onClaimSuccess();
        }
    }, [claim, propertyId, property, onClaimSuccess]);

    // Handle View home click - opens expanded view and logs
    const handleViewHome = useCallback(() => {
        setIsExpanded(true);

        // Log PROPERTY_DETAILS when View home is clicked
        if (property) {
            inspectLog("PROPERTY_DETAILS", {
                property_id: property.property_id,
                is_claimed: property.is_claimed,
                source: "small_card_view_home",
                intent_flags: {
                    soft_listing: property.is_open_to_talking ?? null,
                    settled: property.is_settled ?? null,
                    is_for_sale: property.is_for_sale ?? null,
                    is_for_rent: property.is_for_rent ?? null,
                },
                resolved_status: resolveStatus({
                    is_claimed: property.is_claimed,
                    soft_listing: property.is_open_to_talking,
                    settled: property.is_settled,
                    is_for_sale: property.is_for_sale,
                    is_for_rent: property.is_for_rent,
                }),
            });
        }
    }, [property]);

    // Close expanded view
    const handleCloseExpanded = useCallback(() => {
        setIsExpanded(false);
    }, []);

    // Show claimed state if property is claimed OR we just claimed it
    const isClaimed = property?.is_claimed || justClaimed;

    // Expanded placeholder panel
    if (isExpanded) {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 pointer-events-none">
                <div className="bg-white rounded-t-xl shadow-lg w-full max-w-[420px] pointer-events-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <h2 className="font-semibold text-gray-900">Home</h2>
                        <button
                            onClick={handleCloseExpanded}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Placeholder body */}
                    <div className="p-6 text-center">
                        <p className="text-gray-500">Expanded view coming soon</p>
                        {property && (
                            <p className="mt-2 text-sm text-gray-400 truncate">{title}</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Small card view
    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-t-xl shadow-lg w-full max-w-[420px] p-4 pointer-events-auto">
                {/* Header with close button */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
                        {/* Status badge */}
                        {!loading && property && (
                            <span
                                className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${isClaimed
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-600"
                                    }`}
                            >
                                {isClaimed ? "Claimed" : "Unclaimed"}
                            </span>
                        )}
                        {loading && (
                            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-600">
                                Loading...
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Error message */}
                {error && (
                    <p className="text-sm text-red-600 mb-3">{error}</p>
                )}

                {/* Success message */}
                {justClaimed && (
                    <p className="text-sm text-green-600 mb-3">Claimed successfully!</p>
                )}

                {/* Claim error message */}
                {claimError && (
                    <p className="text-sm text-red-600 mb-3">{claimError}</p>
                )}

                {/* Primary action - View home */}
                <button
                    onClick={handleViewHome}
                    disabled={loading || !property}
                    className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors mb-2 disabled:opacity-50"
                >
                    View home
                </button>

                {/* Claim link - hide if claimed or loading */}
                {!loading && property && !isClaimed && (
                    !isAuthenticated ? (
                        <Link
                            href="/auth/login"
                            className="block text-center text-sm text-blue-600 hover:text-blue-800"
                        >
                            Sign in to claim
                        </Link>
                    ) : (
                        <button
                            onClick={handleClaim}
                            disabled={claiming}
                            className="w-full text-center text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                            {claiming ? "Claiming..." : "Is this your home? Claim ownership"}
                        </button>
                    )
                )}
            </div>
        </div>
    );
}
