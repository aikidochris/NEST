import { supabase } from "@/lib/supabase/client";
import { isInspectOn } from "@/lib/inspect";

// =============================================================================
// MESSAGING DATA HELPERS
// Phase 3 Chunk 1 - No UI, data operations only
// =============================================================================

/**
 * Get or create a conversation between the current user and a property owner.
 * If conversation already exists between current user and owner, returns it.
 * Otherwise creates a new conversation with participants.
 */
export async function getOrCreateConversationForProperty(
    propertyId: string
): Promise<{ conversationId: string }> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Not authenticated");
    }

    // Get property owner from property_claims
    const { data: claim, error: claimError } = await supabase
        .from("property_claims")
        .select("user_id")
        .eq("property_id", propertyId)
        .eq("status", "claimed")
        .maybeSingle();

    if (claimError) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to get property owner:", claimError);
        }
        throw new Error("Something went wrong. Please try again.");
    }

    if (!claim) {
        throw new Error("Property is not claimed - cannot start conversation");
    }

    const ownerId = claim.user_id;

    // If current user is the owner, don't allow self-messaging
    if (ownerId === user.id) {
        throw new Error("You can't message yourself.");
    }

    // Check if conversation already exists between user and owner for this property
    // Use deterministic query to handle potential duplicates: order by updated_at desc, limit 1
    const { data: existingConvRows, error: convError } = await supabase
        .from("conversations")
        .select("id")
        .eq("property_id", propertyId)
        .eq("owner_user_id", ownerId)
        .eq("created_by_user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

    if (convError) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to check existing conversation:", convError);
        }
        throw new Error("Something went wrong. Please try again.");
    }

    const existingConv = existingConvRows && existingConvRows.length > 0 ? existingConvRows[0] : null;

    // Inspection log for conversation lookup
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] CONVO_LOOKUP_RESULT", {
            property_id: propertyId,
            existing_conversation_id: existingConv?.id || null,
            count: existingConvRows?.length || 0,
        });
    }

    if (existingConv) {
        return { conversationId: existingConv.id };
    }

    // Create new conversation
    const { data: newConv, error: createError } = await supabase
        .from("conversations")
        .insert({
            property_id: propertyId,
            owner_user_id: ownerId,
            created_by_user_id: user.id,
        })
        .select("id")
        .single();

    if (createError) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to create conversation:", createError);
        }
        throw new Error("Couldn't start conversation. Please try again.");
    }

    // Insert participants: owner with role 'owner', current user with role 'viewer'
    // Use upsert with ON CONFLICT DO NOTHING to avoid duplicate key errors
    const participants = [
        { conversation_id: newConv.id, user_id: ownerId, role: "owner" },
        { conversation_id: newConv.id, user_id: user.id, role: "viewer" },
    ];

    const { error: partError } = await supabase
        .from("conversation_participants")
        .upsert(participants, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });

    if (partError) {
        // Log only in inspect mode, don't throw - conversation was created successfully
        if (isInspectOn()) {
            console.error("[messaging] Failed to add participants:", partError);
        }
    }

    // Debug log
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] CONVERSATION_CREATED", {
            property_id: propertyId,
            conversation_id: newConv.id,
        });
    }

    return { conversationId: newConv.id };
}

/**
 * List all conversations the current user participates in.
 * Returns ordered by updated_at DESC (most recent first).
 */
export async function listMyConversations(): Promise<{
    conversation_id: string;
    property_id: string;
    updated_at: string;
}[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return [];
    }

    // Get conversations where user is a participant
    // Join via conversation_participants
    const { data, error } = await supabase
        .from("conversation_participants")
        .select(`
            conversation_id,
            conversations!inner (
                id,
                property_id,
                updated_at
            )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to list conversations:", error);
        }
        return [];
    }

    // Flatten the result
    const conversations = (data || []).map((row: Record<string, unknown>) => {
        const conv = row.conversations as Record<string, unknown>;
        return {
            conversation_id: conv.id as string,
            property_id: conv.property_id as string,
            updated_at: conv.updated_at as string,
        };
    });

    // Sort by updated_at DESC
    conversations.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    return conversations;
}

/**
 * List all messages in a conversation.
 * Only works if user is a participant.
 */
export async function listMessages(
    conversationId: string
): Promise<{
    id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
}[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return [];
    }

    const { data, error } = await supabase
        .from("messages")
        .select("id, sender_user_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

    if (error) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to list messages:", error);
        }
        return [];
    }

    return data || [];
}

/**
 * Send a message in a conversation.
 * User must be a participant (RLS enforced).
 * DB trigger will update conversation.updated_at.
 */
export async function sendMessage(
    conversationId: string,
    body: string
): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Not authenticated");
    }

    if (!body.trim()) {
        throw new Error("Message body cannot be empty");
    }

    const { error } = await supabase
        .from("messages")
        .insert({
            conversation_id: conversationId,
            sender_user_id: user.id,
            body: body.trim(),
        });

    if (error) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to send message:", error);
        }
        throw new Error("Message couldn't be sent. Please try again.");
    }

    // Debug log
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] MESSAGE_SENT", {
            conversation_id: conversationId,
            length: body.length,
        });
    }
}

/**
 * Leave a note on an unclaimed property.
 * Authenticated users only.
 * Max 50 notes per property enforced client-side.
 */
export async function leaveUnclaimedNote(
    propertyId: string,
    body: string
): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Not authenticated");
    }

    if (!body.trim()) {
        throw new Error("Note body cannot be empty");
    }

    // Check if property is claimed (if claimed, should use messaging instead)
    const { data: claim } = await supabase
        .from("property_claims")
        .select("id")
        .eq("property_id", propertyId)
        .eq("status", "claimed")
        .maybeSingle();

    if (claim) {
        throw new Error("Property is claimed - use messaging instead");
    }

    // Check note count limit (max 50 per property)
    const { count, error: countError } = await supabase
        .from("unclaimed_notes")
        .select("*", { count: "exact", head: true })
        .eq("property_id", propertyId);

    if (countError) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to check note count:", countError);
        }
        throw new Error("Something went wrong. Please try again.");
    }

    if ((count ?? 0) >= 50) {
        throw new Error("This home's inbox is full for now.");
    }

    // Insert note
    const { error } = await supabase
        .from("unclaimed_notes")
        .insert({
            property_id: propertyId,
            sender_user_id: user.id,
            note_text: body.trim(),
        });

    if (error) {
        // Check for unique constraint violation (one note per user per week)
        if (error.code === "23505" || error.message.includes("duplicate") || error.message.includes("unique") || error.message.includes("one_per_user_per_week")) {
            if (isInspectOn()) {
                console.error("[messaging] Weekly note limit hit:", error);
            }
            throw new Error("You've already left a note here this week.");
        }
        if (isInspectOn()) {
            console.error("[messaging] Failed to leave note:", error);
        }
        throw new Error("Couldn't leave your note. Please try again.");
    }

    // Debug log
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] UNCLAIMED_NOTE_CREATED", {
            property_id: propertyId,
        });
    }
}

// =============================================================================
// ALBUM HELPERS (Progressive Photo Reveal)
// Phase 3 Chunk 3
// =============================================================================

export interface Album {
    album_key: string;
    image_count: number;
    preview_urls: string[];
}

export interface AlbumUnlock {
    album_key: string;
    unlocked_at: string;
}

/**
 * Get all available albums for a property (owner use).
 * Groups images by album_key and returns counts + previews.
 */
export async function getPropertyAlbums(
    propertyId: string
): Promise<Album[]> {
    const { data, error } = await supabase
        .from("property_images")
        .select("album_key, url, sort_order")
        .eq("property_id", propertyId)
        .in("visibility", ["chat_unlocked", "private"])
        .order("sort_order", { ascending: true });

    if (error) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to get property albums:", error);
        }
        return [];
    }

    // Group by album_key
    const albumMap = new Map<string, { urls: string[] }>();
    for (const row of data || []) {
        const key = row.album_key || "default";
        if (!albumMap.has(key)) {
            albumMap.set(key, { urls: [] });
        }
        albumMap.get(key)!.urls.push(row.url);
    }

    // Convert to Album array
    const albums: Album[] = [];
    for (const [album_key, { urls }] of albumMap) {
        albums.push({
            album_key,
            image_count: urls.length,
            preview_urls: urls.slice(0, 3),
        });
    }

    return albums;
}

/**
 * Get albums unlocked in a specific conversation.
 */
export async function getUnlockedAlbums(
    conversationId: string
): Promise<AlbumUnlock[]> {
    const { data, error } = await supabase
        .from("conversation_album_unlocks")
        .select("album_key, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

    if (error) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to get unlocked albums:", error);
        }
        return [];
    }

    return (data || []).map((row) => ({
        album_key: row.album_key,
        unlocked_at: row.created_at,
    }));
}

/**
 * Unlock an album for a conversation (owner action).
 */
export async function unlockAlbum(
    conversationId: string,
    propertyId: string,
    albumKey: string
): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Not authenticated");
    }

    const { error } = await supabase
        .from("conversation_album_unlocks")
        .insert({
            conversation_id: conversationId,
            property_id: propertyId,
            album_key: albumKey,
            unlocked_by_user_id: user.id,
        });

    if (error) {
        // Might already be unlocked
        if (error.code === "23505") {
            return true; // Already unlocked
        }
        if (isInspectOn()) {
            console.error("[messaging] Failed to unlock album:", error);
        }
        throw new Error("Couldn't share photos. Please try again.");
    }

    // Debug log
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] ALBUM_UNLOCKED", {
            property_id: propertyId,
            conversation_id: conversationId,
            album_key: albumKey,
        });
    }

    return true;
}

/**
 * Get images for a specific album (after unlock check passes via RLS).
 */
export async function getAlbumImages(
    propertyId: string,
    albumKey: string
): Promise<{ url: string; sort_order: number }[]> {
    const { data, error } = await supabase
        .from("property_images")
        .select("url, sort_order")
        .eq("property_id", propertyId)
        .eq("album_key", albumKey)
        .order("sort_order", { ascending: true });

    if (error) {
        if (isInspectOn()) {
            console.error("[messaging] Failed to get album images:", error);
        }
        return [];
    }

    // Debug log
    if (isInspectOn() && data && data.length > 0) {
        console.log("[NEST_INSPECT] ALBUM_VIEWED", {
            property_id: propertyId,
            album_key: albumKey,
        });
    }

    return data || [];
}

// =============================================================================
// OWNER INBOX - List conversations for a property
// =============================================================================

export interface ConversationPreview {
    conversation_id: string;
    property_id: string;
    last_message?: string;
    last_message_at: string;
    created_by_user_id: string;
}

/**
 * List all conversations for a property where current user is the owner.
 * Used by owners to see their inbox.
 */
export async function listConversationsForProperty(
    propertyId: string
): Promise<ConversationPreview[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return [];
    }

    // Get all conversations for this property where user is the owner
    const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select("id, property_id, created_by_user_id, updated_at")
        .eq("property_id", propertyId)
        .eq("owner_user_id", user.id)
        .order("updated_at", { ascending: false });

    if (convError) {
        if (isInspectOn()) {
            console.error("[messaging] listConversationsForProperty error:", convError);
        }
        return [];
    }

    if (!conversations || conversations.length === 0) {
        return [];
    }

    const previews: ConversationPreview[] = [];

    for (const conv of conversations) {
        // Get last message
        const { data: lastMessages } = await supabase
            .from("messages")
            .select("body, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1);

        const lastMsg = lastMessages?.[0];

        previews.push({
            conversation_id: conv.id,
            property_id: conv.property_id,
            last_message: lastMsg?.body ?
                (lastMsg.body.length > 50 ? lastMsg.body.slice(0, 47) + "..." : lastMsg.body) :
                undefined,
            last_message_at: lastMsg?.created_at || conv.updated_at,
            created_by_user_id: conv.created_by_user_id,
        });
    }

    return previews;
}
