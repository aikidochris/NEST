import { supabase } from "@/lib/supabase/client";
import { isInspectOn, inspectLog } from "@/lib/inspect";

// =============================================================================
// MESSAGING DATA HELPERS
// Phase 3 Chunk 1 - No UI, data operations only
// =============================================================================

/**
 * Find an existing conversation for a property where BOTH users are participants.
 * This is the deterministic way to check if a conversation already exists.
 * 
 * Returns the newest conversation if multiple exist (and logs a warning).
 */
export async function findConversationBetweenUsers(
    propertyId: string,
    userAId: string,
    userBId: string
): Promise<string | null> {
    // Query conversations for this property, then filter by participants
    const { data: conversations, error } = await supabase
        .from("conversations")
        .select(`
            id,
            updated_at,
            conversation_participants!inner(user_id)
        `)
        .eq("property_id", propertyId);

    if (error) {
        if (isInspectOn()) {
            console.error("[messaging] findConversationBetweenUsers error:", error);
        }
        return null;
    }

    if (!conversations || conversations.length === 0) {
        return null;
    }

    // Filter to conversations where BOTH users are participants
    const matchingConvos = conversations.filter((conv) => {
        const participants = conv.conversation_participants as { user_id: string }[];
        const participantIds = participants.map(p => p.user_id);
        return participantIds.includes(userAId) && participantIds.includes(userBId);
    });

    if (matchingConvos.length === 0) {
        return null;
    }

    // Sort by updated_at descending and pick newest
    matchingConvos.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const chosen = matchingConvos[0];

    // Log if we had to pick from multiple
    if (matchingConvos.length > 1 && isInspectOn()) {
        console.log("[NEST_INSPECT] CONVO_MULTI_PICKED_NEWEST", {
            property_id: propertyId,
            chosen_id: chosen.id,
            all_ids: matchingConvos.map(c => c.id),
            count: matchingConvos.length,
        });
    }

    return chosen.id;
}

/**
 * Get an existing conversation between the current user and a property owner.
 * Returns null if no conversation exists.
 */
export async function getConversationForProperty(
    propertyId: string
): Promise<{ conversationId: string } | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get property owner
    const { data: claim } = await supabase
        .from("property_claims")
        .select("user_id")
        .eq("property_id", propertyId)
        .eq("status", "claimed")
        .maybeSingle();

    if (!claim) return null;

    const ownerId = claim.user_id;
    if (ownerId === user.id) return null; // Owner can't message themselves

    // Check if conversation already exists
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
        return null; // Fail safe
    }

    const existingConv = existingConvRows && existingConvRows.length > 0 ? existingConvRows[0] : null;

    if (existingConv) {
        return { conversationId: existingConv.id };
    }

    return null;
}

/**
 * Get or create a conversation between the current user and a property owner.
 * If conversation already exists between current user and owner, returns it.
 * Otherwise creates a new conversation with participants.
 */
export async function getOrCreateConversationForProperty(
    propertyId: string
): Promise<{ conversationId: string }> {
    // Try to get existing first
    const existing = await getConversationForProperty(propertyId);
    if (existing) {
        return existing;
    }

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

// =============================================================================
// GLOBAL INBOX - Flat list of all conversations for current user
// =============================================================================

export interface InboxConversation {
    conversation_id: string;
    property_id: string;
    property_label: string;
    lat: number | null;
    lon: number | null;
    counterparty_label: string;
    last_message: string | null;
    last_message_at: string;
}

/**
 * List all conversations for the current user across all properties.
 * Returns a flat list sorted by most recent activity (last_message_at desc).
 */
export async function listAllConversationsFlat(): Promise<InboxConversation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return [];
    }

    // Step 1: Get all conversations where user is a participant
    if (isInspectOn()) {
        const { data: authDataPart } = await supabase.auth.getUser();
        console.debug("[inspect] AUTH USER BEFORE PARTICIPANT SELECT:", authDataPart?.user);
    }

    const { data: participations, error: partError } = await supabase
        .from("conversation_participants")
        .select(`
            conversation_id,
            role,
            conversations!inner (
                id,
                property_id,
                owner_user_id,
                created_by_user_id,
                updated_at
            )
        `)
        .eq("user_id", user.id);

    if (partError) {
        console.error("RAW ERROR (participant SELECT):", partError);
        console.error("ERROR JSON:", JSON.stringify(partError, null, 2));
        console.error("ERROR KEYS:", partError ? Object.keys(partError) : null);
        console.error("ERROR CODE:", (partError as unknown as Record<string, unknown>)?.code);
        console.error("ERROR MESSAGE:", (partError as unknown as Record<string, unknown>)?.message);
        console.error("ERROR DETAILS:", (partError as unknown as Record<string, unknown>)?.details);
        console.error("ERROR HINT:", (partError as unknown as Record<string, unknown>)?.hint);
        if (isInspectOn()) {
            console.error("[messaging] listAllConversationsFlat participations error:", partError);
        }
        return [];
    }

    if (!participations || participations.length === 0) {
        return [];
    }

    // Extract conversation data with role info
    const conversationsData = participations.map((p: Record<string, unknown>) => {
        const conv = p.conversations as Record<string, unknown>;
        return {
            conversation_id: conv.id as string,
            property_id: conv.property_id as string,
            owner_user_id: conv.owner_user_id as string,
            created_by_user_id: conv.created_by_user_id as string,
            updated_at: conv.updated_at as string,
            role: p.role as string,
        };
    });

    // Deduplicate by (property_id + counterparty user) - keep newest by updated_at
    // Counterparty is: owner_user_id for viewers, created_by_user_id for owners
    // This collapses multiple conversations for the same property-counterparty pair
    const dedupeKey = (c: typeof conversationsData[0]) => {
        const counterpartyId = c.role === "owner" ? c.created_by_user_id : c.owner_user_id;
        return `${c.property_id}::${counterpartyId}`;
    };

    // Sort by updated_at desc first so we pick the newest
    conversationsData.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const seenKeys = new Map<string, string[]>(); // key -> all conversation_ids with that key
    const uniqueConversations: typeof conversationsData = [];

    for (const conv of conversationsData) {
        const key = dedupeKey(conv);
        if (!seenKeys.has(key)) {
            seenKeys.set(key, [conv.conversation_id]);
            uniqueConversations.push(conv);
        } else {
            // Track duplicates for logging
            seenKeys.get(key)!.push(conv.conversation_id);
        }
    }

    // Log any collapsed duplicates (inspect mode only)
    for (const [key, ids] of seenKeys) {
        if (ids.length > 1) {
            const [property_id] = key.split("::");
            inspectLog("INBOX_DEDUPE_COLLAPSED", {
                property_id,
                conversation_ids: ids,
                kept_newest: ids[0],
                collapsed_count: ids.length - 1,
            });
        }
    }

    // Step 2: Get last message for each conversation
    const conversationIds = uniqueConversations.map(c => c.conversation_id);

    const { data: lastMessages } = await supabase
        .from("messages")
        .select("conversation_id, body, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false });

    // Create a map of conversation_id -> last message (first occurrence = most recent)
    const lastMessageMap = new Map<string, { body: string; created_at: string }>();
    for (const msg of (lastMessages || [])) {
        if (!lastMessageMap.has(msg.conversation_id)) {
            lastMessageMap.set(msg.conversation_id, { body: msg.body, created_at: msg.created_at });
        }
    }

    // Step 3: Get property details
    const propertyIds = [...new Set(uniqueConversations.map(c => c.property_id))];

    const { data: properties } = await supabase
        .from("property_public_view")
        .select("property_id, display_label, lat, lon")
        .in("property_id", propertyIds);

    // Create a map of property_id -> property details
    const propertyMap = new Map<string, { label: string; lat: number | null; lon: number | null }>();
    for (const prop of (properties || [])) {
        propertyMap.set(prop.property_id, {
            label: prop.display_label || "Unknown address",
            lat: prop.lat,
            lon: prop.lon,
        });
    }

    // Step 4: Build flat list
    const result: InboxConversation[] = [];

    for (const conv of uniqueConversations) {
        const propInfo = propertyMap.get(conv.property_id) || { label: "Unknown address", lat: null, lon: null };
        const lastMsg = lastMessageMap.get(conv.conversation_id);

        // Counterparty label: if user is owner, counterparty is "Neighbour"; else "Owner"
        const counterpartyLabel = conv.role === "owner" ? "Neighbour" : "Owner";

        result.push({
            conversation_id: conv.conversation_id,
            property_id: conv.property_id,
            property_label: propInfo.label,
            lat: propInfo.lat,
            lon: propInfo.lon,
            counterparty_label: counterpartyLabel,
            last_message: lastMsg?.body || null,
            last_message_at: lastMsg?.created_at || conv.updated_at,
        });
    }

    // Sort by most recent activity
    result.sort((a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );

    return result;
}

