"use client";

import { useState, useEffect, useCallback } from "react";
import { listConversationsForProperty, type ConversationPreview } from "@/lib/messaging";
import { isInspectOn } from "@/lib/inspect";

// =============================================================================
// OWNER INBOX PREVIEW
// Shows a preview of recent conversations for a property owner.
// Used in the owner tools area of PropertyProfileModal.
// =============================================================================

interface OwnerInboxPreviewProps {
    propertyId: string;
    /** Maximum number of conversations to show (default: 5) */
    maxItems?: number;
    /** Callback when a conversation is clicked */
    onSelectConversation: (conversationId: string) => void;
    /** Callback when "View all" is clicked */
    onViewAll: () => void;
}

/**
 * Format time as relative or short date.
 */
function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function OwnerInboxPreview({
    propertyId,
    maxItems = 5,
    onSelectConversation,
    onViewAll,
}: OwnerInboxPreviewProps) {
    const [conversations, setConversations] = useState<ConversationPreview[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch conversations on mount
    useEffect(() => {
        let cancelled = false;

        async function fetchConversations() {
            try {
                const data = await listConversationsForProperty(propertyId);
                if (!cancelled) {
                    setConversations(data.slice(0, maxItems));
                    setLoading(false);
                }
            } catch (err) {
                console.error("[OwnerInboxPreview] Failed to fetch conversations:", err);
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchConversations();

        return () => { cancelled = true; };
    }, [propertyId, maxItems]);

    const handleConversationClick = useCallback((conv: ConversationPreview) => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] OWNER_INBOX_CLICK", {
                property_id: propertyId,
                conversation_id: conv.conversation_id,
            });
        }
        onSelectConversation(conv.conversation_id);
    }, [propertyId, onSelectConversation]);

    if (loading) {
        return (
            <div className="px-4 pb-4">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-1/3 mb-3"></div>
                    <div className="h-16 bg-gray-50 rounded-xl"></div>
                </div>
            </div>
        );
    }

    if (conversations.length === 0) {
        return null; // Don't show section if no conversations
    }

    return (
        <div className="px-4 pb-4">
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Messages about this home
                </h4>
                <button
                    onClick={onViewAll}
                    className="text-xs text-ember hover:opacity-80 font-medium"
                >
                    View all
                </button>
            </div>

            {/* Conversation list */}
            <div className="space-y-2">
                {conversations.map((conv) => (
                    <button
                        key={conv.conversation_id}
                        onClick={() => handleConversationClick(conv)}
                        className="w-full flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-left transition-colors"
                    >
                        {/* Avatar */}
                        <div className="w-9 h-9 bg-ember/20 dark:bg-ember/30 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    Neighbour
                                </p>
                                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                    {formatRelativeTime(conv.last_message_at)}
                                </span>
                            </div>
                            {conv.last_message && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {conv.last_message}
                                </p>
                            )}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
