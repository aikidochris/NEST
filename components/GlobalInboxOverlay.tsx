"use client";

import { useState, useEffect, useCallback } from "react";
import { listAllConversationsFlat, type InboxConversation } from "@/lib/messaging";
import { inspectLog } from "@/lib/inspect";
import type { OpenPropertyOptions } from "@/contexts/MapIntentContext";

// =============================================================================
// GLOBAL INBOX OVERLAY
// Flat list of all conversations for the current user across all properties
// =============================================================================

interface GlobalInboxOverlayProps {
    onClose: () => void;
    /** Unified navigation callback using openProperty API */
    onOpenProperty: (options: OpenPropertyOptions) => void;
}

export function GlobalInboxOverlay({
    onClose,
    onOpenProperty,
}: GlobalInboxOverlayProps) {
    const [conversations, setConversations] = useState<InboxConversation[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch conversations on mount
    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            try {
                const data = await listAllConversationsFlat();
                if (!cancelled) {
                    setConversations(data);
                    setLoading(false);
                }
            } catch (err) {
                console.error("[GlobalInbox] Failed to fetch:", err);
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        // Log open event (inspect-only)
        inspectLog("GLOBAL_INBOX_OPEN", {});

        fetchData();

        return () => { cancelled = true; };
    }, []);

    // Handle conversation row click
    const handleConversationClick = useCallback((conv: InboxConversation) => {
        // Log navigation event (inspect-only)
        inspectLog("GLOBAL_INBOX_OPEN_THREAD", {
            property_id: conv.property_id,
            conversation_id: conv.conversation_id,
        });

        onClose();
        onOpenProperty({
            propertyId: conv.property_id,
            openMode: "messages",
            conversationId: conv.conversation_id,
            lat: conv.lat ?? undefined,
            lon: conv.lon ?? undefined,
        });
    }, [onClose, onOpenProperty]);

    // Format relative time
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-full max-w-md max-h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
                        <p className="text-xs text-gray-500">
                            {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
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
                    ) : conversations.length === 0 ? (
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
                            {conversations.map((conv) => (
                                <button
                                    key={conv.conversation_id}
                                    onClick={() => handleConversationClick(conv)}
                                    className="w-full px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {conv.property_label}
                                                </p>
                                                <p className="text-xs text-gray-400 flex-shrink-0">
                                                    {formatTime(conv.last_message_at)}
                                                </p>
                                            </div>
                                            <p className="text-xs text-teal-600 mt-0.5">
                                                {conv.counterparty_label}
                                            </p>
                                            <p className="text-sm text-gray-500 truncate mt-1">
                                                {conv.last_message || "No messages yet"}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
