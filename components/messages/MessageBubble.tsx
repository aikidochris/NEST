"use client";

import { useState } from "react";
import type { Message, MessageAttachment } from "@/lib/messaging/types";

// =============================================================================
// MESSAGE BUBBLE COMPONENT
// Displays a single message with alignment based on sender.
// Supports locked/unlocked album attachments.
// =============================================================================

interface MessageBubbleProps {
    message: Message;
    /** List of album keys that have been unlocked in this conversation */
    unlockedAlbums?: string[];
}

/**
 * Album tile - shows locked or unlocked state.
 */
function AlbumTile({
    attachment,
    isUnlocked
}: {
    attachment: MessageAttachment;
    isUnlocked: boolean;
}) {
    const [showToast, setShowToast] = useState(false);

    const handleClick = () => {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
    };

    const albumName = attachment.label ||
        (attachment.album_key ? `${attachment.album_key.charAt(0).toUpperCase()}${attachment.album_key.slice(1)} album` : "Album");

    return (
        <div className="mt-2 relative">
            <button
                onClick={handleClick}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${isUnlocked
                        ? "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30"
                        : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
            >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isUnlocked
                        ? "bg-teal-100 dark:bg-teal-800"
                        : "bg-gray-200 dark:bg-gray-600"
                    }`}>
                    {isUnlocked ? (
                        // Unlocked - photo icon
                        <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    ) : (
                        // Locked - lock icon
                        <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isUnlocked
                            ? "text-teal-900 dark:text-teal-100"
                            : "text-gray-900 dark:text-white"
                        }`}>
                        {albumName}
                    </p>
                    <p className={`text-xs ${isUnlocked
                            ? "text-teal-600 dark:text-teal-400"
                            : "text-gray-500 dark:text-gray-400"
                        }`}>
                        {isUnlocked ? "Unlocked — view photos" : "Shared in this chat"}
                    </p>
                </div>
                {/* Chevron for unlocked */}
                {isUnlocked && (
                    <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                )}
            </button>

            {/* Coming soon toast */}
            {showToast && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap">
                    {isUnlocked ? "Photo gallery coming soon" : "Ask the owner to share"}
                </div>
            )}
        </div>
    );
}

/**
 * Single message bubble.
 * - "me" = right-aligned, subtle dark background
 * - "them" = left-aligned, light background
 */
export function MessageBubble({ message, unlockedAlbums = [] }: MessageBubbleProps) {
    const isMe = message.sender === "me";

    // Format time
    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const hasAttachments = message.attachments && message.attachments.length > 0;

    return (
        <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-3`}>
            <div className="max-w-[75%]">
                {/* Message text */}
                <div
                    className={`rounded-2xl px-4 py-2.5 ${isMe
                            ? "bg-gray-800 text-white rounded-br-md"
                            : "bg-gray-100 text-gray-900 rounded-bl-md dark:bg-gray-800 dark:text-gray-100"
                        }`}
                >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.body}
                    </p>
                    <p
                        className={`text-xs mt-1 ${isMe ? "text-gray-400" : "text-gray-500 dark:text-gray-400"
                            }`}
                    >
                        {formatTime(message.created_at)}
                    </p>
                </div>

                {/* Attachments */}
                {hasAttachments && (
                    <div className="mt-1">
                        {message.attachments!.map((attachment, index) => {
                            if (attachment.kind === "locked_album" || attachment.kind === "photo") {
                                const isUnlocked = attachment.album_key
                                    ? unlockedAlbums.includes(attachment.album_key)
                                    : false;
                                return (
                                    <AlbumTile
                                        key={`${attachment.album_key || index}`}
                                        attachment={attachment}
                                        isUnlocked={isUnlocked}
                                    />
                                );
                            }
                            return null;
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
