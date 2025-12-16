"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { PropertyPublic } from "@/types/property";
import { isInspectOn } from "@/lib/inspect";
import {
    getOrCreateConversationForProperty,
    listMessages,
    sendMessage,
    leaveUnclaimedNote,
    getPropertyAlbums,
    getUnlockedAlbums,
    unlockAlbum,
    getAlbumImages,
    listConversationsForProperty,
    type Album,
    type AlbumUnlock,
    type ConversationPreview,
} from "@/lib/messaging";
import { resolveStatus } from "@/lib/status";
import { getChipStyle, getPublicLabel } from "@/lib/statusStyles";
import { NeighbourSuggestModal } from "./NeighbourSuggestModal";

// =============================================================================
// PROPERTY MESSAGE PANEL
// Embedded messaging panel with progressive photo reveal.
// =============================================================================

interface Message {
    id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
}

interface StreamItem {
    type: "message" | "album_locked" | "album_unlocked";
    id: string;
    timestamp: string;
    data: Message | AlbumUnlock;
}

interface PropertyMessagePanelProps {
    property: PropertyPublic;
    currentUserId?: string;
    onClose: () => void;
    /** Callback when user selects a neighbour to message (with coordinates for fly-to) */
    onSelectNeighbour?: (propertyId: string, lat?: number, lon?: number) => void;
    /** Pre-selected conversation ID (e.g., from note reply) */
    conversationId?: string | null;
}

export function PropertyMessagePanel({
    property,
    currentUserId,
    onClose,
    onSelectNeighbour,
    conversationId: providedConversationId,
}: PropertyMessagePanelProps) {
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [unlockedAlbums, setUnlockedAlbums] = useState<AlbumUnlock[]>([]);
    const [availableAlbums, setAvailableAlbums] = useState<Album[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [noteSent, setNoteSent] = useState(false);
    const [showNeighbourSuggest, setShowNeighbourSuggest] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [lightboxAlbum, setLightboxAlbum] = useState<string | null>(null);
    const [lightboxImages, setLightboxImages] = useState<{ url: string }[]>([]);
    const [ownerConversations, setOwnerConversations] = useState<ConversationPreview[]>([]);
    const [selectedOwnerConv, setSelectedOwnerConv] = useState<string | null>(null);
    const [resolvedUserId, setResolvedUserId] = useState<string | undefined>(currentUserId);

    // Fetch current user ID if not provided as prop
    useEffect(() => {
        if (currentUserId) {
            setResolvedUserId(currentUserId);
            return;
        }

        async function fetchUserId() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setResolvedUserId(user.id);
            }
        }
        fetchUserId();
    }, [currentUserId]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isClaimed = property.is_claimed === true;
    const isOwner = property.is_mine === true;

    // Get display status
    const status = resolveStatus({
        is_claimed: property.is_claimed,
        intent_flags: {
            soft_listing: property.is_open_to_talking ?? null,
            settled: property.is_settled ?? null,
            is_for_sale: property.is_for_sale ?? null,
            is_for_rent: property.is_for_rent ?? null,
        },
    });

    // Debug log on open
    useEffect(() => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] MESSAGE_PANEL_OPEN", {
                property_id: property.property_id,
                claimed: isClaimed,
            });
        }
    }, [property.property_id, isClaimed]);

    // Initialize conversation for claimed properties
    useEffect(() => {
        if (!isClaimed) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;

        async function initConversation() {
            try {
                // If a conversationId is provided, use it directly
                if (providedConversationId) {
                    if (!cancelled) {
                        setConversationId(providedConversationId);
                        // Fetch messages and unlocks
                        const [msgs, unlocks] = await Promise.all([
                            listMessages(providedConversationId),
                            getUnlockedAlbums(providedConversationId),
                        ]);
                        if (!cancelled) {
                            setMessages(msgs);
                            setUnlockedAlbums(unlocks);
                        }
                    }
                } else if (!isOwner) {
                    // For viewers without a provided conversation, create/get one
                    const { conversationId: convId } = await getOrCreateConversationForProperty(
                        property.property_id
                    );
                    if (!cancelled) {
                        setConversationId(convId);
                        // Fetch messages and unlocks
                        const [msgs, unlocks] = await Promise.all([
                            listMessages(convId),
                            getUnlockedAlbums(convId),
                        ]);
                        if (!cancelled) {
                            setMessages(msgs);
                            setUnlockedAlbums(unlocks);
                        }
                    }
                } else {
                    // Owner: fetch available albums for sharing
                    const albums = await getPropertyAlbums(property.property_id);
                    if (!cancelled) {
                        setAvailableAlbums(albums);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load conversation");
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        initConversation();

        return () => { cancelled = true; };
    }, [property.property_id, isClaimed, isOwner, providedConversationId]);

    // Fetch owner conversations for inbox
    useEffect(() => {
        if (!isOwner || !isClaimed) return;

        let cancelled = false;

        async function fetchOwnerConversations() {
            try {
                const convs = await listConversationsForProperty(property.property_id);
                if (!cancelled) {
                    setOwnerConversations(convs);
                    setIsLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("[messaging] Failed to fetch owner conversations:", err);
                    setIsLoading(false);
                }
            }
        }

        fetchOwnerConversations();

        return () => { cancelled = true; };
    }, [property.property_id, isOwner, isClaimed]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, unlockedAlbums]);

    // Build stream items (messages + albums interleaved by timestamp)
    const streamItems: StreamItem[] = [];

    // Add messages
    for (const msg of messages) {
        streamItems.push({
            type: "message",
            id: msg.id,
            timestamp: msg.created_at,
            data: msg,
        });
    }

    // Add unlocked albums
    for (const unlock of unlockedAlbums) {
        streamItems.push({
            type: "album_unlocked",
            id: `unlock-${unlock.album_key}`,
            timestamp: unlock.unlocked_at,
            data: unlock,
        });
    }

    // Sort by timestamp
    streamItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Handle sending message (claimed homes)
    const handleSendMessage = useCallback(async () => {
        if (!conversationId || !newMessage.trim() || isSending) return;

        setIsSending(true);
        setError(null);

        try {
            await sendMessage(conversationId, newMessage.trim());

            if (isInspectOn()) {
                console.log("[NEST_INSPECT] MESSAGE_PANEL_SEND", {
                    property_id: property.property_id,
                    conversation_id: conversationId,
                });
            }

            // Refresh messages
            const msgs = await listMessages(conversationId);
            setMessages(msgs);
            setNewMessage("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send message");
        } finally {
            setIsSending(false);
        }
    }, [conversationId, newMessage, isSending, property.property_id]);

    // Handle leaving note (unclaimed homes)
    const handleLeaveNote = useCallback(async () => {
        if (!newMessage.trim() || isSending) return;

        setIsSending(true);
        setError(null);

        try {
            await leaveUnclaimedNote(property.property_id, newMessage.trim());

            if (isInspectOn()) {
                console.log("[NEST_INSPECT] UNCLAIMED_NOTE_SENT", {
                    property_id: property.property_id,
                });
            }

            setNewMessage("");
            setNoteSent(true);

            // Show neighbour suggestions if property has coordinates
            if (property.lat && property.lon) {
                setShowNeighbourSuggest(true);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to leave note");
        } finally {
            setIsSending(false);
        }
    }, [newMessage, isSending, property.property_id, property.lat, property.lon]);

    // Handle album unlock (owner only)
    const handleUnlockAlbum = useCallback(async (albumKey: string) => {
        if (!conversationId) return;

        try {
            await unlockAlbum(conversationId, property.property_id, albumKey);

            // Refresh unlocked albums
            const unlocks = await getUnlockedAlbums(conversationId);
            setUnlockedAlbums(unlocks);

            // Remove from available
            setAvailableAlbums(prev => prev.filter(a => a.album_key !== albumKey));
            setShowShareMenu(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to share album");
        }
    }, [conversationId, property.property_id]);

    // Handle viewing album
    const handleViewAlbum = useCallback(async (albumKey: string) => {
        try {
            const images = await getAlbumImages(property.property_id, albumKey);
            setLightboxImages(images);
            setLightboxAlbum(albumKey);
        } catch (err) {
            console.error("Failed to load album:", err);
        }
    }, [property.property_id]);

    // Handle key press (Enter to send)
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (isClaimed) {
                handleSendMessage();
            } else {
                handleLeaveNote();
            }
        }
    }, [isClaimed, handleSendMessage, handleLeaveNote]);

    // Get display address
    const displayAddress = property.display_label ||
        `${property.house_number || ""} ${property.street || ""}`.trim() ||
        property.postcode ||
        "Property";

    // Chip styling
    const chipStyle = getChipStyle(status);
    const statusLabel = getPublicLabel(status);

    // Albums not yet unlocked (for locked tiles)
    const unlockedKeys = new Set(unlockedAlbums.map(u => u.album_key));

    // Format album name for display
    const formatAlbumName = (key: string) =>
        key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");

    return (
        <div className="flex flex-col h-full bg-white rounded-t-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                        {displayAddress}
                    </h3>
                    {statusLabel && (
                        <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${chipStyle.bg} ${chipStyle.text}`}>
                            {statusLabel}
                        </span>
                    )}
                </div>

                {/* Owner: Share photos button */}
                {isOwner && availableAlbums.length > 0 && (
                    <div className="relative mr-2">
                        <button
                            onClick={() => setShowShareMenu(!showShareMenu)}
                            className="px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                        >
                            Share photos
                        </button>

                        {/* Share menu dropdown */}
                        {showShareMenu && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                <div className="py-1">
                                    {availableAlbums
                                        .filter(a => !unlockedKeys.has(a.album_key))
                                        .map((album) => (
                                            <button
                                                key={album.album_key}
                                                onClick={() => handleUnlockAlbum(album.album_key)}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                {formatAlbumName(album.album_key)}
                                                <span className="text-gray-400 ml-1">
                                                    ({album.image_count} photos)
                                                </span>
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

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
            <div className="flex-1 overflow-y-auto px-4 py-3">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="text-sm text-gray-400">Loading...</div>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="text-sm text-red-500">{error}</div>
                    </div>
                ) : noteSent ? (
                    // Calm confirmation for unclaimed note
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-3">
                            <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-600">
                            Your note will be shared if the owner joins Nest.
                        </p>
                    </div>
                ) : isOwner ? (
                    // Owner inbox view
                    selectedOwnerConv ? (
                        // Show conversation thread
                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setSelectedOwnerConv(null);
                                    setConversationId(null);
                                    setMessages([]);
                                }}
                                className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mb-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                Back to inbox
                            </button>
                            {streamItems.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-sm text-gray-400">
                                        No messages yet
                                    </p>
                                </div>
                            ) : (
                                streamItems.map((item) => {
                                    if (item.type === "message") {
                                        const msg = item.data as Message;
                                        const isMe = msg.sender_user_id === resolvedUserId;
                                        return (
                                            <div
                                                key={item.id}
                                                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                                            >
                                                <div
                                                    className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${isMe
                                                        ? "bg-gray-900 text-white"
                                                        : "bg-gray-100 text-gray-900"
                                                        }`}
                                                >
                                                    <p className="whitespace-pre-wrap break-words">
                                                        {msg.body}
                                                    </p>
                                                    <p className={`text-xs mt-1 ${isMe ? "text-gray-400" : "text-gray-500"}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], {
                                                            hour: "2-digit",
                                                            minute: "2-digit"
                                                        })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    ) : ownerConversations.length === 0 ? (
                        // No conversations yet
                        <div className="flex flex-col items-center justify-center h-32 text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <p className="text-sm text-gray-500">
                                No messages yet
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                When neighbors message you, they&apos;ll appear here
                            </p>
                        </div>
                    ) : (
                        // Conversation list
                        <div className="space-y-2">
                            <p className="text-xs text-gray-500 mb-3">
                                {ownerConversations.length} conversation{ownerConversations.length !== 1 ? "s" : ""}
                            </p>
                            {ownerConversations.map((conv) => (
                                <button
                                    key={conv.conversation_id}
                                    onClick={async () => {
                                        setSelectedOwnerConv(conv.conversation_id);
                                        setConversationId(conv.conversation_id);
                                        // Fetch messages for this conversation
                                        const msgs = await listMessages(conv.conversation_id);
                                        setMessages(msgs);
                                        const unlocks = await getUnlockedAlbums(conv.conversation_id);
                                        setUnlockedAlbums(unlocks);
                                    }}
                                    className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-left transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                Neighbor
                                            </p>
                                            {conv.last_message && (
                                                <p className="text-sm text-gray-500 truncate">
                                                    {conv.last_message}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {new Date(conv.last_message_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )
                ) : isClaimed ? (
                    // Message stream for claimed homes
                    <div className="space-y-3">
                        {streamItems.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-sm text-gray-400">
                                    Start the conversation
                                </p>
                            </div>
                        ) : (
                            streamItems.map((item) => {
                                if (item.type === "message") {
                                    const msg = item.data as Message;
                                    const isMe = msg.sender_user_id === resolvedUserId;
                                    return (
                                        <div
                                            key={item.id}
                                            className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${isMe
                                                    ? "bg-gray-900 text-white"
                                                    : "bg-gray-100 text-gray-900"
                                                    }`}
                                            >
                                                <p className="whitespace-pre-wrap break-words">
                                                    {msg.body}
                                                </p>
                                                <p className={`text-xs mt-1 ${isMe ? "text-gray-400" : "text-gray-500"}`}>
                                                    {new Date(msg.created_at).toLocaleTimeString([], {
                                                        hour: "2-digit",
                                                        minute: "2-digit"
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                } else if (item.type === "album_unlocked") {
                                    const unlock = item.data as AlbumUnlock;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleViewAlbum(unlock.album_key)}
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {formatAlbumName(unlock.album_key)} photos
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Shared through conversation
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                }
                                return null;
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                ) : (
                    // Unclaimed home - note prompt
                    <div className="text-center py-8">
                        <p className="text-sm text-gray-500 mb-2">
                            This home hasn&apos;t been claimed yet.
                        </p>
                        <p className="text-sm text-gray-400">
                            Leave a friendly note for when the owner joins.
                        </p>
                    </div>
                )}
            </div>

            {/* Composer */}
            {!noteSent && (!isOwner || selectedOwnerConv) && (
                <div className="border-t border-gray-100 px-4 py-3">
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={textareaRef}
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                isClaimed
                                    ? "Write a friendly message…"
                                    : "Leave a friendly note…"
                            }
                            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent min-h-[40px] max-h-[120px]"
                            rows={1}
                            disabled={isSending}
                        />
                        <button
                            onClick={isClaimed ? handleSendMessage : handleLeaveNote}
                            disabled={!newMessage.trim() || isSending}
                            className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-teal-700 transition-colors"
                            aria-label="Send"
                        >
                            {isSending ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Simple Lightbox */}
            {lightboxAlbum && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col">
                    {/* Lightbox Header */}
                    <div className="flex items-center justify-between px-4 py-3 text-white">
                        <h4 className="text-sm font-medium">
                            {formatAlbumName(lightboxAlbum)}
                        </h4>
                        <button
                            onClick={() => {
                                setLightboxAlbum(null);
                                setLightboxImages([]);
                            }}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Lightbox Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {lightboxImages.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-white/60 text-sm">No photos in this album</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {lightboxImages.map((img, idx) => (
                                    <div
                                        key={idx}
                                        className="aspect-square bg-gray-800 rounded-lg overflow-hidden"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={img.url}
                                            alt={`Photo ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Neighbour Suggest Modal */}
            {showNeighbourSuggest && property.lat && property.lon && (
                <NeighbourSuggestModal
                    sourceLat={property.lat}
                    sourceLon={property.lon}
                    sourcePropertyId={property.property_id}
                    onClose={() => setShowNeighbourSuggest(false)}
                    onSelectNeighbour={(propertyId, lat, lon) => {
                        setShowNeighbourSuggest(false);
                        onClose();
                        onSelectNeighbour?.(propertyId, lat, lon);
                    }}
                />
            )}
        </div>
    );
}
