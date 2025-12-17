"use client";

import { memo, useState } from "react";

// =============================================================================
// TYPES
// =============================================================================
export interface VibeStats {
    claimed: number;
    open_to_talk: number;
    for_sale: number;
    for_rent: number;
}

export interface LiveFeedEvent {
    event_type: string;
    property_id: string;
    display_label: string | null;
    created_at: string;
    summary: string;
}

interface AreaVibeBarProps {
    stats: VibeStats | null;
    events: LiveFeedEvent[];
    loading?: boolean;
    eventsLoading?: boolean;
    expanded: boolean;
    onToggleExpand: () => void;
    onEventClick?: (event: LiveFeedEvent) => void;
}

// =============================================================================
// HELPERS
// =============================================================================
function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function getEventIcon(eventType: string): string {
    switch (eventType) {
        case "claim": return "🏠";
        case "status": return "📋";
        case "story": return "📖";
        case "note": return "✉️";
        default: return "📌";
    }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================
function LiveFeedTab({
    events,
    loading,
    onEventClick
}: {
    events: LiveFeedEvent[];
    loading?: boolean;
    onEventClick?: (event: LiveFeedEvent) => void;
}) {
    if (loading) {
        return (
            <div className="py-8 text-center text-gray-400 text-sm">
                Loading activity...
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="py-8 text-center text-gray-400 text-sm">
                No recent activity in this area
            </div>
        );
    }

    return (
        <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
            {events.slice(0, 10).map((event, idx) => (
                <button
                    key={`${event.property_id}-${idx}`}
                    onClick={() => onEventClick?.(event)}
                    className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                >
                    <span className="text-lg flex-shrink-0">{getEventIcon(event.event_type)}</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                            {event.display_label || "Property"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{event.summary}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatRelativeTime(event.created_at)}
                    </span>
                </button>
            ))}
        </div>
    );
}

function AreaVibeTab({ stats }: { stats: VibeStats | null }) {
    if (!stats) {
        return (
            <div className="py-8 text-center text-gray-400 text-sm">
                Loading area stats...
            </div>
        );
    }

    const hasActivity = stats.claimed > 0 || stats.open_to_talk > 0 ||
        stats.for_sale > 0 || stats.for_rent > 0;

    return (
        <div className="p-4">
            {hasActivity ? (
                <div className="grid grid-cols-2 gap-4 mb-4">
                    {stats.claimed > 0 && (
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                            <p className="text-2xl font-semibold text-purple-600">{stats.claimed}</p>
                            <p className="text-xs text-gray-500">Claimed</p>
                        </div>
                    )}
                    {stats.open_to_talk > 0 && (
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <p className="text-2xl font-semibold text-blue-600">{stats.open_to_talk}</p>
                            <p className="text-xs text-gray-500">Open to talk</p>
                        </div>
                    )}
                    {stats.for_sale > 0 && (
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                            <p className="text-2xl font-semibold text-green-600">{stats.for_sale}</p>
                            <p className="text-xs text-gray-500">For sale</p>
                        </div>
                    )}
                    {stats.for_rent > 0 && (
                        <div className="text-center p-3 bg-orange-50 rounded-lg">
                            <p className="text-2xl font-semibold text-orange-600">{stats.for_rent}</p>
                            <p className="text-xs text-gray-500">For rent</p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-gray-400 text-sm text-center py-4">
                    No activity in this area yet
                </p>
            )}
            <p className="text-xs text-gray-400 text-center">
                This area is waiting for more neighbors to join Nest.
            </p>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export const AreaVibeBar = memo(function AreaVibeBar({
    stats,
    events,
    loading,
    eventsLoading,
    expanded,
    onToggleExpand,
    onEventClick,
}: AreaVibeBarProps) {
    const [activeTab, setActiveTab] = useState<"feed" | "vibe">("feed");

    // Collapsed bar
    if (!expanded) {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
                <div className="flex justify-center p-2">
                    <button
                        onClick={onToggleExpand}
                        className="bg-white/80 backdrop-blur-md rounded-full px-4 py-2 shadow-sm border border-gray-100 pointer-events-auto hover:bg-white/90 transition-colors"
                    >
                        {loading ? (
                            <span className="text-sm text-gray-400">Loading area...</span>
                        ) : stats ? (
                            <div className="flex items-center gap-4 text-sm">
                                {stats.claimed > 0 && (
                                    <span className="text-gray-600">
                                        <span className="font-medium text-purple-600">{stats.claimed}</span> claimed
                                    </span>
                                )}
                                {stats.open_to_talk > 0 && (
                                    <span className="text-gray-600">
                                        <span className="font-medium text-blue-600">{stats.open_to_talk}</span> open
                                    </span>
                                )}
                                {stats.for_sale > 0 && (
                                    <span className="text-gray-600">
                                        <span className="font-medium text-green-600">{stats.for_sale}</span> for sale
                                    </span>
                                )}
                                {stats.for_rent > 0 && (
                                    <span className="text-gray-600">
                                        <span className="font-medium text-orange-600">{stats.for_rent}</span> for rent
                                    </span>
                                )}
                                {stats.claimed === 0 && stats.open_to_talk === 0 &&
                                    stats.for_sale === 0 && stats.for_rent === 0 && (
                                        <span className="text-gray-400">Tap to explore this area</span>
                                    )}
                                <span className="text-gray-300">▲</span>
                            </div>
                        ) : (
                            <span className="text-sm text-gray-400">Tap to explore this area</span>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // Expanded panel
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
            <div className="flex justify-center p-2">
                <div className="bg-white rounded-t-2xl shadow-lg w-full max-w-[420px] pointer-events-auto border border-gray-100">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <h3 className="font-medium text-gray-900">This area</h3>
                        <button
                            onClick={onToggleExpand}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-100">
                        <button
                            onClick={() => setActiveTab("feed")}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === "feed"
                                    ? "text-blue-600 border-b-2 border-blue-600"
                                    : "text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            Live Feed
                        </button>
                        <button
                            onClick={() => setActiveTab("vibe")}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === "vibe"
                                    ? "text-blue-600 border-b-2 border-blue-600"
                                    : "text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            Area Vibe
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === "feed" ? (
                        <LiveFeedTab
                            events={events}
                            loading={eventsLoading}
                            onEventClick={onEventClick}
                        />
                    ) : (
                        <AreaVibeTab stats={stats} />
                    )}
                </div>
            </div>
        </div>
    );
});
