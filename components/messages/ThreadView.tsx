"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationSummary, Message } from "@/lib/messaging/types";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { isConversationOwner, unlockAlbum, listUnlockedAlbums } from "@/lib/messaging/data";

// =============================================================================
// THREAD VIEW COMPONENT
// Shows messages in a conversation with composer.
// Includes owner tools for sharing albums.
// =============================================================================

interface ThreadViewProps {
    conversation: ConversationSummary;
    messages: Message[];
    onSend: (message: string) => void;
    onBack?: () => void;
    loading?: boolean;
}

const ALBUM_OPTIONS = [
    { key: "kitchen", label: "Kitchen" },
    { key: "living", label: "Living room" },
    { key: "garden", label: "Garden" },
    { key: "bedroom", label: "Bedroom" },
];

/**
 * Thread view showing messages and composer.
 */
export function ThreadView({
    conversation,
    messages,
    onSend,
    onBack,
    loading = false,
}: ThreadViewProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isOwner, setIsOwner] = useState(false);
    const [unlockedAlbums, setUnlockedAlbums] = useState<string[]>([]);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [sharing, setSharing] = useState(false);

    // Check if user is owner
    useEffect(() => {
        async function checkOwner() {
            const owner = await isConversationOwner(conversation.id);
            setIsOwner(owner);
        }
        checkOwner();
    }, [conversation.id]);

    // Load unlocked albums
    useEffect(() => {
        async function loadUnlocks() {
            const unlocked = await listUnlockedAlbums(conversation.id);
            setUnlockedAlbums(unlocked);
        }
        loadUnlocks();
    }, [conversation.id]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Handle share album
    const handleShareAlbum = async (albumKey: string) => {
        setSharing(true);
        try {
            const success = await unlockAlbum(
                conversation.id,
                conversation.property_id,
                albumKey
            );
            if (success) {
                setUnlockedAlbums(prev => [...prev, albumKey]);
                setShowShareMenu(false);
            }
        } catch (err) {
            console.error("Failed to share album:", err);
        } finally {
            setSharing(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 md:hidden"
                        aria-label="Back"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}
                <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                        {conversation.property_title}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Neighbour chat
                    </p>
                </div>

                {/* Owner: Share album button */}
                {isOwner && (
                    <div className="relative">
                        <button
                            onClick={() => setShowShareMenu(!showShareMenu)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            disabled={sharing}
                        >
                            {sharing ? "Sharing..." : "Share album…"}
                        </button>

                        {/* Share menu dropdown */}
                        {showShareMenu && (
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20">
                                {ALBUM_OPTIONS.map((album) => {
                                    const alreadyUnlocked = unlockedAlbums.includes(album.key);
                                    return (
                                        <button
                                            key={album.key}
                                            onClick={() => !alreadyUnlocked && handleShareAlbum(album.key)}
                                            disabled={alreadyUnlocked}
                                            className={`w-full text-left px-3 py-2 text-sm ${alreadyUnlocked
                                                    ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                                                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                }`}
                                        >
                                            {album.label}
                                            {alreadyUnlocked && " ✓"}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 bg-white dark:bg-gray-900">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Loading messages...</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            No messages yet. Say hello!
                        </p>
                    </div>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                unlockedAlbums={unlockedAlbums}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Composer */}
            <Composer onSend={onSend} />
        </div>
    );
}
