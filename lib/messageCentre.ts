import { supabase } from "@/lib/supabase/client";

// =============================================================================
// MESSAGE CENTRE DATA HELPER
// Fetches user's conversations grouped by property for the Message Centre overlay
// =============================================================================

export interface ConversationItem {
    conversation_id: string;
    property_id: string;
    last_message: string | null;
    last_message_at: string;
    is_owner: boolean;
}

export interface PropertyGroup {
    property_id: string;
    property_label: string;
    lat: number | null;
    lon: number | null;
    conversations: ConversationItem[];
}

/**
 * List all conversations for the current user, grouped by property.
 * For each conversation, includes last message preview.
 */
export async function listConversationsGroupedByProperty(): Promise<PropertyGroup[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return [];
    }

    // Step 1: Get all conversations where user is a participant
    const { data: participations, error: partError } = await supabase
        .from("conversation_participants")
        .select(`
            conversation_id,
            role,
            conversations!inner (
                id,
                property_id,
                owner_user_id,
                updated_at
            )
        `)
        .eq("user_id", user.id);

    if (partError) {
        console.error("[messageCentre] Failed to fetch participations:", partError.message);
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
            updated_at: conv.updated_at as string,
            role: p.role as string,
        };
    });

    // Step 2: Get last message for each conversation
    const conversationIds = conversationsData.map(c => c.conversation_id);

    const { data: lastMessages } = await supabase
        .from("messages")
        .select("conversation_id, body, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false });

    // Create a map of conversation_id -> last message
    const lastMessageMap = new Map<string, { body: string; created_at: string }>();
    for (const msg of (lastMessages || [])) {
        if (!lastMessageMap.has(msg.conversation_id)) {
            lastMessageMap.set(msg.conversation_id, { body: msg.body, created_at: msg.created_at });
        }
    }

    // Step 3: Get property details
    const propertyIds = [...new Set(conversationsData.map(c => c.property_id))];

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

    // Step 4: Group conversations by property
    const propertyGroupMap = new Map<string, PropertyGroup>();

    for (const conv of conversationsData) {
        const propInfo = propertyMap.get(conv.property_id) || { label: "Unknown address", lat: null, lon: null };
        const lastMsg = lastMessageMap.get(conv.conversation_id);

        if (!propertyGroupMap.has(conv.property_id)) {
            propertyGroupMap.set(conv.property_id, {
                property_id: conv.property_id,
                property_label: propInfo.label,
                lat: propInfo.lat,
                lon: propInfo.lon,
                conversations: [],
            });
        }

        propertyGroupMap.get(conv.property_id)!.conversations.push({
            conversation_id: conv.conversation_id,
            property_id: conv.property_id,
            last_message: lastMsg?.body || null,
            last_message_at: lastMsg?.created_at || conv.updated_at,
            is_owner: conv.role === "owner",
        });
    }

    // Convert to array and sort by most recent activity
    const result = [...propertyGroupMap.values()];

    // Sort each property's conversations by last_message_at
    for (const group of result) {
        group.conversations.sort((a, b) =>
            new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
        );
    }

    // Sort properties by their most recent conversation
    result.sort((a, b) => {
        const aTime = a.conversations[0]?.last_message_at || "";
        const bTime = b.conversations[0]?.last_message_at || "";
        return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return result;
}
