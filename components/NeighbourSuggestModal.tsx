"use client";

import { useState, useEffect, useCallback } from "react";
import { getNearbyOpenNeighbours } from "@/lib/unclaimedNotes";
import { getChipStyle, getPublicLabel } from "@/lib/statusStyles";
import { isInspectOn } from "@/lib/inspect";

// =============================================================================
// NEIGHBOUR SUGGEST MODAL
// Shown after leaving an unclaimed note to suggest messaging nearby neighbours.
// =============================================================================

interface NeighbourSuggestion {
    property_id: string;
    display_label: string;
    distance_m: number;
    lat: number;
    lon: number;
}

interface NeighbourSuggestModalProps {
    /** Source property coordinates */
    sourceLat: number;
    sourceLon: number;
    /** Source property ID (to exclude from suggestions) */
    sourcePropertyId: string;
    /** Callback when modal is closed */
    onClose: () => void;
    /** Callback when a neighbour is selected (with coordinates for fly-to) */
    onSelectNeighbour: (propertyId: string, lat: number, lon: number) => void;
}

export function NeighbourSuggestModal({
    sourceLat,
    sourceLon,
    sourcePropertyId,
    onClose,
    onSelectNeighbour,
}: NeighbourSuggestModalProps) {
    const [suggestions, setSuggestions] = useState<NeighbourSuggestion[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function fetchSuggestions() {
            try {
                const data = await getNearbyOpenNeighbours(
                    sourceLat,
                    sourceLon,
                    sourcePropertyId,
                    3
                );
                if (!cancelled) {
                    setSuggestions(data);
                }
            } catch (err) {
                console.error("Failed to fetch neighbour suggestions:", err);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchSuggestions();

        return () => { cancelled = true; };
    }, [sourceLat, sourceLon, sourcePropertyId]);

    const chipStyle = getChipStyle("open_to_talking");
    const statusLabel = getPublicLabel("open_to_talking");

    // Handle neighbour selection with logging
    const handleSelectNeighbour = useCallback((suggestion: NeighbourSuggestion) => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] NEIGHBOUR_NAVIGATE", {
                from_property_id: sourcePropertyId,
                to_property_id: suggestion.property_id,
            });
        }
        onClose();
        onSelectNeighbour(suggestion.property_id, suggestion.lat, suggestion.lon);
    }, [sourcePropertyId, onClose, onSelectNeighbour]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h3 className="text-base font-medium text-gray-900">
                        While you&apos;re here…
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 py-4">
                    <p className="text-sm text-gray-600 mb-4">
                        This home isn&apos;t claimed yet. Want to message a nearby neighbour instead?
                    </p>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="text-sm text-gray-400">Finding neighbours…</div>
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-gray-400">
                                No nearby neighbours available right now.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion.property_id}
                                    onClick={() => handleSelectNeighbour(suggestion)}
                                    className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl transition-colors text-left"
                                >
                                    <div className="flex-1 min-w-0 mr-3">
                                        <p className="text-sm font-medium text-gray-900 truncate">
                                            {suggestion.display_label}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${chipStyle.bg} ${chipStyle.text}`}>
                                                {statusLabel}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {formatDistance(suggestion.distance_m)}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors">
                                        Message
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        Maybe later
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Format distance for display.
 */
function formatDistance(meters: number): string {
    if (meters < 100) {
        return `${meters}m away`;
    } else if (meters < 1000) {
        return `${Math.round(meters / 10) * 10}m away`;
    } else {
        return `${(meters / 1000).toFixed(1)}km away`;
    }
}
