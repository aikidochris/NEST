"use client";

import { useState, useEffect, useCallback } from "react";
import { listConversationsGroupedByProperty, type PropertyGroup, type ConversationItem } from "@/lib/messageCentre";
import { isInspectOn } from "@/lib/inspect";

// =============================================================================
// MESSAGE CENTRE OVERLAY
// Modal overlay showing user's conversations grouped by property
// =============================================================================

interface MessageCentreOverlayProps {
    onClose: () => void;
    onNavigateToProperty: (propertyId: string, lat?: number, lon?: number) => void;
    onNavigateToConversation: (propertyId: string, conversationId: string, lat?: number, lon?: number) => void;
}

export function MessageCentreOverlay({
    onClose,
    onNavigateToProperty,
    onNavigateToConversation,
}: MessageCentreOverlayProps) {
    const [groups, setGroups] = useState<PropertyGroup[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch conversations on mount
    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            try {
                const data = await listConversationsGroupedByProperty();
                if (!cancelled) {
                    setGroups(data);
                    setLoading(false);
                }
            } catch (err) {
                console.error("[MessageCentre] Failed to fetch:", err);
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        // Log open event
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] MESSAGE_CENTRE_OPEN");
        }

        fetchData();

        return () => { cancelled = true; };
    }, []);

    // Handle property header click
    const handlePropertyClick = useCallback((group: PropertyGroup) => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] MESSAGE_CENTRE_NAVIGATE", {
                property_id: group.property_id,
                conversation_id: null,
            });
        }
        onClose();
        onNavigateToProperty(group.property_id, group.lat ?? undefined, group.lon ?? undefined);
    }, [onClose, onNavigateToProperty]);

    // Handle conversation row click
    const handleConversationClick = useCallback((group: PropertyGroup, conv: ConversationItem) => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] MESSAGE_CENTRE_NAVIGATE", {
                property_id: group.property_id,
                conversation_id: conv.conversation_id,
            });
        }
        onClose();
        onNavigateToConversation(group.property_id, conv.conversation_id, group.lat ?? undefined, group.lon ?? undefined);
    }, [onClose, onNavigateToConversation]);

    // Format time display
    const formatTime = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const totalConversations = groups.reduce((sum, g) => sum + g.conversations.length, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-full max-w-md max-h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
                        <p className="text-xs text-gray-500">
                            {totalConversations} conversation{totalConversations !== 1 ? "s" : ""} across {groups.length} propert{groups.length !== 1 ? "ies" : "y"}
                        </p>
                    </div>
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
                <div className="overflow-y-auto max-h-[calc(80vh-56px)]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="text-sm text-gray-400">Loading messages…</div>
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <p className="text-sm text-gray-500">No messages yet</p>
                            <p className="text-xs text-gray-400 mt-1">
                                Start a conversation by messaging a property owner
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {groups.map((group) => (
                                <div key={group.property_id}>
                                    {/* Property header */}
                                    <button
                                        onClick={() => handlePropertyClick(group)}
                                        className="w-full px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                        </svg>
                                        <span className="text-sm font-medium text-gray-700 truncate flex-1">
                                            {group.property_label}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {group.conversations.length}
                                        </span>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>

                                    {/* Conversations under this property */}
                                    {group.conversations.map((conv) => (
                                        <button
                                            key={conv.conversation_id}
                                            onClick={() => handleConversationClick(group, conv)}
                                            className="w-full px-4 py-3 pl-10 hover:bg-gray-50 text-left transition-colors"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-sm font-medium text-gray-900">
                                                            {conv.is_owner ? "Neighbour" : "Owner"}
                                                        </p>
                                                        <p className="text-xs text-gray-400 flex-shrink-0">
                                                            {formatTime(conv.last_message_at)}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm text-gray-500 truncate mt-0.5">
                                                        {conv.last_message || "No messages yet"}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
