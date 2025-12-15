"use client";

// =============================================================================
// MESSAGING DATA ADAPTER (SUPABASE)
// Real Supabase calls for conversations, messages, and album unlocks.
// =============================================================================

import { supabase } from "@/lib/supabase/client";
import type { ConversationSummary, Message, MessageAttachment } from "./types";
import type { Status } from "@/lib/status";

// =============================================================================
// TYPES FOR DB RESPONSES
// =============================================================================

interface DbConversation {
    id: string;
    property_id: string;
    owner_user_id: string;
    created_by_user_id: string;
    created_at: string;
    updated_at: string;
}

interface DbMessage {
    id: string;
    conversation_id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
}

interface DbParticipant {
    conversation_id: string;
    user_id: string;
    role: "owner" | "viewer";
    created_at: string;
}

interface DbAlbumUnlock {
    id: string;
    conversation_id: string;
    property_id: string;
    album_key: string;
    unlocked_by_user_id: string;
    created_at: string;
}

// =============================================================================
// HELPER: Get current user ID
// =============================================================================

async function getCurrentUserId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
}

// =============================================================================
// LIST CONVERSATIONS
// =============================================================================

/**
 * List all conversations where current user is a participant.
 * Includes last message preview.
 */
export async function listConversations(): Promise<ConversationSummary[]> {
    const userId = await getCurrentUserId();
    if (!userId) {
        console.warn("[messaging] listConversations: Not authenticated");
        return [];
    }

    // Step 1: Get conversation IDs where user is participant
    const { data: participations, error: partError } = await supabase
        .from("conversation_participants")
        .select("conversation_id, role")
        .eq("user_id", userId);

    if (partError) {
        console.error("[messaging] listConversations participant error:", partError);
        return [];
    }

    if (!participations || participations.length === 0) {
        return [];
    }

    const conversationIds = participations.map(p => p.conversation_id);

    // Step 2: Get conversations
    const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .in("id", conversationIds)
        .order("updated_at", { ascending: false });

    if (convError) {
        console.error("[messaging] listConversations error:", convError);
        return [];
    }

    if (!conversations || conversations.length === 0) {
        return [];
    }

    // Step 3: Get last message for each conversation (simple approach for dev)
    const summaries: ConversationSummary[] = [];

    for (const conv of conversations as DbConversation[]) {
        // Get last message
        const { data: lastMessages } = await supabase
            .from("messages")
            .select("body, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1);

        const lastMsg = lastMessages?.[0];

        // Get property info (for title)
        const { data: property } = await supabase
            .from("property_public_view")
            .select("display_label, is_open_to_talking, is_for_sale, is_for_rent, is_settled")
            .eq("property_id", conv.property_id)
            .single();

        // Determine intent status
        let intentStatus: Status | undefined;
        if (property?.is_open_to_talking) intentStatus = "open_to_talking";
        else if (property?.is_for_sale) intentStatus = "for_sale";
        else if (property?.is_for_rent) intentStatus = "for_rent";
        else if (property?.is_settled) intentStatus = "settled";

        summaries.push({
            id: conv.id,
            property_id: conv.property_id,
            property_title: property?.display_label || conv.property_id,
            intent_status: intentStatus,
            last_message: lastMsg?.body ?
                (lastMsg.body.length > 50 ? lastMsg.body.slice(0, 47) + "..." : lastMsg.body) :
                undefined,
            last_message_at: lastMsg?.created_at || conv.updated_at,
            unread_count: 0, // TODO: implement unread tracking
        });
    }

    return summaries;
}

// =============================================================================
// GET MESSAGES
// =============================================================================

/**
 * Get messages for a specific conversation.
 */
export async function getMessages(conversationId: string): Promise<Message[]> {
    const userId = await getCurrentUserId();
    if (!userId) {
        console.warn("[messaging] getMessages: Not authenticated");
        return [];
    }

    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("[messaging] getMessages error:", error);
        return [];
    }

    // Map DB messages to UI type
    return (data as DbMessage[]).map(msg => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender: msg.sender_user_id === userId ? "me" : "them",
        body: msg.body,
        created_at: msg.created_at,
    }));
}

// =============================================================================
// SEND MESSAGE
// =============================================================================

/**
 * Send a new message in a conversation.
 */
export async function sendMessage(
    conversationId: string,
    body: string
): Promise<Message> {
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error("Not authenticated");
    }

    const { data, error } = await supabase
        .from("messages")
        .insert({
            conversation_id: conversationId,
            sender_user_id: userId,
            body,
        })
        .select()
        .single();

    if (error) {
        console.error("[messaging] sendMessage error:", error);
        throw new Error(error.message);
    }

    const msg = data as DbMessage;

    return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender: "me",
        body: msg.body,
        created_at: msg.created_at,
    };
}

// =============================================================================
// GET OR CREATE CONVERSATION BY PROPERTY
// =============================================================================

/**
 * Get or create a conversation for a property.
 * @param propertyId - The property ID
 * @param propertyTitle - Display title for the property
 * @param intentStatus - Optional intent status
 * @param ownerUserId - Required if creating new conversation
 */
export async function getOrCreateConversationByProperty(
    propertyId: string,
    propertyTitle: string,
    intentStatus?: Status,
    ownerUserId?: string
): Promise<ConversationSummary> {
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error("Not authenticated");
    }

    // Step 1: Check if conversation already exists for this property where user is participant
    const { data: existingParticipation } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

    if (existingParticipation && existingParticipation.length > 0) {
        const existingConvIds = existingParticipation.map(p => p.conversation_id);

        const { data: existingConv } = await supabase
            .from("conversations")
            .select("*")
            .in("id", existingConvIds)
            .eq("property_id", propertyId)
            .limit(1);

        if (existingConv && existingConv.length > 0) {
            const conv = existingConv[0] as DbConversation;
            return {
                id: conv.id,
                property_id: conv.property_id,
                property_title: propertyTitle,
                intent_status: intentStatus,
                last_message: undefined,
                last_message_at: conv.updated_at,
                unread_count: 0,
            };
        }
    }

    // Step 2: Need owner_user_id to create new conversation
    let resolvedOwnerUserId = ownerUserId;
    if (!resolvedOwnerUserId) {
        // Try to get it from the property
        const { data: property } = await supabase
            .from("property_public_view")
            .select("claimed_by_user_id")
            .eq("property_id", propertyId)
            .single();

        if (!property?.claimed_by_user_id) {
            throw new Error("Cannot message: Property owner not found. Property may be unclaimed.");
        }
        resolvedOwnerUserId = property.claimed_by_user_id;
    }

    // Now resolvedOwnerUserId is definitely a string (we throw above if not)
    const ownerIdFinal: string = resolvedOwnerUserId!;

    // Step 3: Create conversation
    const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
            property_id: propertyId,
            owner_user_id: ownerIdFinal,
            created_by_user_id: userId,
        })
        .select()
        .single();

    if (convError) {
        console.error("[messaging] create conversation error:", convError);
        throw new Error(convError.message);
    }

    const conv = newConv as DbConversation;

    // Step 4: Add participants
    const participants: Omit<DbParticipant, "created_at">[] = [];

    // Add owner
    participants.push({
        conversation_id: conv.id,
        user_id: ownerIdFinal,
        role: "owner",
    });

    // Add viewer (if different from owner)
    if (userId !== ownerIdFinal) {
        participants.push({
            conversation_id: conv.id,
            user_id: userId,
            role: "viewer",
        });
    }

    const { error: participantError } = await supabase
        .from("conversation_participants")
        .insert(participants);

    if (participantError) {
        console.error("[messaging] add participants error:", participantError);
        // Don't throw - conversation was created
    }

    return {
        id: conv.id,
        property_id: conv.property_id,
        property_title: propertyTitle,
        intent_status: intentStatus,
        last_message: undefined,
        last_message_at: conv.updated_at,
        unread_count: 0,
    };
}

// =============================================================================
// GET CONVERSATION
// =============================================================================

/**
 * Get a single conversation by ID.
 */
export async function getConversation(
    conversationId: string
): Promise<ConversationSummary | null> {
    const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

    if (error || !data) {
        return null;
    }

    const conv = data as DbConversation;

    // Get property info
    const { data: property } = await supabase
        .from("property_public_view")
        .select("display_label, is_open_to_talking, is_for_sale, is_for_rent, is_settled")
        .eq("property_id", conv.property_id)
        .single();

    let intentStatus: Status | undefined;
    if (property?.is_open_to_talking) intentStatus = "open_to_talking";
    else if (property?.is_for_sale) intentStatus = "for_sale";
    else if (property?.is_for_rent) intentStatus = "for_rent";
    else if (property?.is_settled) intentStatus = "settled";

    return {
        id: conv.id,
        property_id: conv.property_id,
        property_title: property?.display_label || conv.property_id,
        intent_status: intentStatus,
        last_message: undefined,
        last_message_at: conv.updated_at,
        unread_count: 0,
    };
}

// =============================================================================
// ALBUM UNLOCKS
// =============================================================================

/**
 * Get unlocked album keys for a conversation.
 */
export async function listUnlockedAlbums(conversationId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("conversation_album_unlocks")
        .select("album_key")
        .eq("conversation_id", conversationId);

    if (error) {
        console.error("[messaging] listUnlockedAlbums error:", error);
        return [];
    }

    return (data || []).map((row: { album_key: string }) => row.album_key);
}

/**
 * Unlock an album in a conversation (owner only).
 */
export async function unlockAlbum(
    conversationId: string,
    propertyId: string,
    albumKey: string
): Promise<boolean> {
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error("Not authenticated");
    }

    const { error } = await supabase
        .from("conversation_album_unlocks")
        .insert({
            conversation_id: conversationId,
            property_id: propertyId,
            album_key: albumKey,
            unlocked_by_user_id: userId,
        });

    if (error) {
        console.error("[messaging] unlockAlbum error:", error);
        return false;
    }

    return true;
}

/**
 * Check if current user is the owner in a conversation.
 */
export async function isConversationOwner(conversationId: string): Promise<boolean> {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { data } = await supabase
        .from("conversation_participants")
        .select("role")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .single();

    return data?.role === "owner";
}

// =============================================================================
// FIND CONVERSATION BY PROPERTY (kept for compatibility)
// =============================================================================

export async function findConversationByProperty(
    propertyId: string
): Promise<ConversationSummary | null> {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data: participations } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

    if (!participations || participations.length === 0) return null;

    const convIds = participations.map(p => p.conversation_id);

    const { data: conv } = await supabase
        .from("conversations")
        .select("*")
        .in("id", convIds)
        .eq("property_id", propertyId)
        .limit(1);

    if (!conv || conv.length === 0) return null;

    const c = conv[0] as DbConversation;

    return {
        id: c.id,
        property_id: c.property_id,
        property_title: propertyId,
        intent_status: undefined,
        last_message: undefined,
        last_message_at: c.updated_at,
        unread_count: 0,
    };
}
