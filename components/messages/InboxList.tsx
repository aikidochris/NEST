"use client";

import type { ConversationSummary } from "@/lib/messaging/types";
import { getChipStyle, getPublicLabel, getPinColor } from "@/lib/statusStyles";

// =============================================================================
// INBOX LIST COMPONENT
// Shows list of conversations with last message preview.
// =============================================================================

interface InboxListProps {
    conversations: ConversationSummary[];
    selectedId?: string;
    onSelect: (conversation: ConversationSummary) => void;
}

/**
 * Inbox list showing all conversations.
 */
export function InboxList({
    conversations,
    selectedId,
    onSelect,
}: InboxListProps) {
    // Format relative time
    const formatRelativeTime = (dateStr?: string) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return "now";
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
    };

    if (conversations.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
                No conversations yet
            </div>
        );
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {conversations.map((conv) => {
                const isSelected = conv.id === selectedId;
                const chipData = conv.intent_status
                    ? { ...getChipStyle(conv.intent_status), label: getPublicLabel(conv.intent_status) }
                    : null;

                return (
                    <button
                        key={conv.id}
                        onClick={() => onSelect(conv)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isSelected ? "bg-gray-100 dark:bg-gray-800" : ""
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            {/* Placeholder thumbnail */}
                            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0" />

                            <div className="flex-1 min-w-0">
                                {/* Property title + time */}
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {conv.property_title}
                                    </h3>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                        {formatRelativeTime(conv.last_message_at)}
                                    </span>
                                </div>

                                {/* Status chip */}
                                {chipData?.label && (
                                    <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full mb-1 ${chipData.bg} ${chipData.text}`}
                                    >
                                        <span
                                            className="w-1.5 h-1.5 rounded-full"
                                            style={{ backgroundColor: getPinColor(conv.intent_status!) }}
                                        />
                                        {chipData.label}
                                    </span>
                                )}

                                {/* Last message preview */}
                                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                    {conv.last_message || "No messages yet"}
                                </p>

                                {/* Unread badge */}
                                {conv.unread_count && conv.unread_count > 0 && (
                                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full">
                                        {conv.unread_count} new
                                    </span>
                                )}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
