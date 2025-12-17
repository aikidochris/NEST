// =============================================================================
// MESSAGING TYPES
// Kept separate from DB types for flexibility during development.
// =============================================================================

import type { Status } from "@/lib/status";

/**
 * Summary of a conversation for inbox display.
 */
export interface ConversationSummary {
    id: string;
    property_id: string;
    property_title: string;
    /** Intent status for chip display (optional) */
    intent_status?: Status;
    /** Preview of last message (truncated) */
    last_message?: string;
    /** When the last message was sent */
    last_message_at?: string;
    /** Number of unread messages (future) */
    unread_count?: number;
}

/**
 * Attachment for progressive photo reveal.
 * Currently only locked_album is implemented.
 */
export interface MessageAttachment {
    kind: "locked_album" | "photo";
    /** Album key for locked albums (e.g. "kitchen", "living") */
    album_key?: string;
    /** URL for photos (future) */
    url?: string;
    /** Display label */
    label?: string;
}

/**
 * A single message in a conversation.
 */
export interface Message {
    id: string;
    conversation_id: string;
    /** "me" = current user, "them" = other participant */
    sender: "me" | "them";
    body: string;
    created_at: string;
    /** Attachments for progressive photo reveal */
    attachments?: MessageAttachment[];
}
