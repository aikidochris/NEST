"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ConversationSummary, Message } from "@/lib/messaging/types";
import type { Status } from "@/lib/status";
import {
    listConversations,
    getMessages,
    sendMessage,
    getOrCreateConversationByProperty
} from "@/lib/messaging/data";
import { InboxList } from "@/components/messages/InboxList";
import { ThreadView } from "@/components/messages/ThreadView";

// =============================================================================
// MESSAGES PAGE (DEV ONLY)
// 2-pane layout: Inbox list + Thread view
// Supports query params: ?property_id=...&title=...&status=...
// =============================================================================

function MessagesContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<ConversationSummary | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [initializing, setInitializing] = useState(false);

    // Check for property_id query param and auto-create/select conversation
    useEffect(() => {
        const propertyId = searchParams.get("property_id");
        const title = searchParams.get("title");
        const status = searchParams.get("status") as Status | null;

        if (!propertyId || !title) return;
        if (initializing) return;

        setInitializing(true);

        async function initConversation() {
            // Get or create conversation for this property
            const conversation = await getOrCreateConversationByProperty(
                propertyId!,
                title!,
                status || undefined
            );

            // Refresh conversations list
            const updatedConversations = await listConversations();
            setConversations(updatedConversations);

            // Select the conversation
            setSelectedConversation(conversation);

            // Clear query params from URL (cleaner UX)
            router.replace("/messages", { scroll: false });

            setLoading(false);
            setInitializing(false);
        }

        initConversation();
    }, [searchParams, router, initializing]);

    // Load conversations on mount (only if no property_id param)
    useEffect(() => {
        const propertyId = searchParams.get("property_id");
        if (propertyId) return; // Will be handled by the other effect

        async function loadConversations() {
            setLoading(true);
            const data = await listConversations();
            setConversations(data);
            setLoading(false);
        }
        loadConversations();
    }, [searchParams]);

    // Load messages when conversation changes
    useEffect(() => {
        if (!selectedConversation) {
            setMessages([]);
            return;
        }

        const conversationId = selectedConversation.id;

        async function loadMessages() {
            setMessagesLoading(true);
            const data = await getMessages(conversationId);
            setMessages(data);
            setMessagesLoading(false);
        }
        loadMessages();
    }, [selectedConversation]);

    // Handle conversation selection
    const handleSelect = useCallback((conversation: ConversationSummary) => {
        setSelectedConversation(conversation);
    }, []);

    // Handle back button (mobile)
    const handleBack = useCallback(() => {
        setSelectedConversation(null);
    }, []);

    // Handle sending a message
    const handleSend = useCallback(async (body: string) => {
        if (!selectedConversation) return;

        const newMessage = await sendMessage(selectedConversation.id, body);
        setMessages((prev) => [...prev, newMessage]);

        // Refresh conversations to update last_message preview
        const updatedConversations = await listConversations();
        setConversations(updatedConversations);

        // Update selected conversation reference
        const updated = updatedConversations.find((c) => c.id === selectedConversation.id);
        if (updated) {
            setSelectedConversation(updated);
        }
    }, [selectedConversation]);

    return (
        <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
            {/* DEV ONLY Header */}
            <div className="bg-amber-500 text-amber-900 text-center py-1 text-xs font-medium">
                🚧 DEV ONLY — Messaging UI (Phase 2)
            </div>

            {/* Main content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Inbox list (desktop: always visible, mobile: hidden when thread selected) */}
                <div
                    className={`w-full md:w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto ${selectedConversation ? "hidden md:block" : ""
                        }`}
                >
                    {/* Inbox header */}
                    <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 z-10">
                        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Messages
                        </h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {conversations.length} conversations
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                        </div>
                    ) : (
                        <InboxList
                            conversations={conversations}
                            selectedId={selectedConversation?.id}
                            onSelect={handleSelect}
                        />
                    )}
                </div>

                {/* Thread view (desktop: always visible, mobile: shown when thread selected) */}
                <div
                    className={`flex-1 bg-gray-50 dark:bg-gray-950 ${selectedConversation ? "" : "hidden md:flex"
                        }`}
                >
                    {selectedConversation ? (
                        <ThreadView
                            conversation={selectedConversation}
                            messages={messages}
                            onSend={handleSend}
                            onBack={handleBack}
                            loading={messagesLoading}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-full mx-auto mb-4 flex items-center justify-center">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">
                                    Select a conversation to start chatting
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Integration notes (dev only footer) */}
            <div className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                <strong>Flow:</strong> Tier 2 "Message owner" → <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">/messages?property_id=...&title=...&status=...</code>
            </div>
        </div>
    );
}

export default function MessagesPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
                <p className="text-gray-500">Loading messages...</p>
            </div>
        }>
            <MessagesContent />
        </Suspense>
    );
}
