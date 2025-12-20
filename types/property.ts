/**
 * Types aligned with property_public_view contract.
 * Do NOT add fields that don't exist in the view.
 */

export interface PropertyPublic {
    property_id: string;
    lat: number;
    lon: number;
    postcode: string | null;
    street: string | null;
    house_number: string | null;
    display_label: string | null;
    is_claimed: boolean;
    is_open_to_talking: boolean;
    is_for_sale: boolean;
    is_for_rent: boolean;
    is_settled: boolean;
    summary_text: string | null;
    /** Computed server-side: true if authenticated user owns this property */
    is_mine: boolean;

    // Image fields (nullable, backend will provide)
    /** Cover image URL for hero display (Legacy) */
    cover_image_url?: string | null;
    /** High-res cinematic image */
    hero_image_url?: string | null;
    /** Low-res thumbnail */
    thumbnail_url?: string | null;
    /** Whether additional images exist in album */
    has_additional_images?: boolean;
    /** Metadata JSON (vibe labels, story summary, etc) */
    metadata?: Record<string, any> | null;
    /** Public images for Tier 2 gallery (fetched separately) */
    public_images?: PropertyImage[];
}

// =============================================================================
// PHOTO TYPES (matches property_images table)
// =============================================================================

export type ImageKind = "cover" | "album";
export type ImageVisibility = "public" | "followers" | "chat_unlocked" | "private";

export interface PropertyImage {
    id: string;
    property_id: string;
    url: string;
    kind: ImageKind;
    album_key: string | null;  // "kitchen" | "living" | "garden" etc
    visibility: ImageVisibility;
    sort_order: number;
    created_at: string;
}

// =============================================================================
// CONVERSATION TYPES (matches conversations/messages tables)
// =============================================================================

export type ConversationRole = "owner" | "viewer";

export interface Conversation {
    id: string;
    property_id: string;
    owner_user_id: string;
    created_by_user_id: string;
    created_at: string;
    updated_at: string;
}

export interface ConversationParticipant {
    conversation_id: string;
    user_id: string;
    role: ConversationRole;
    created_at: string;
}

export interface Message {
    id: string;
    conversation_id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
}

export interface ConversationAlbumUnlock {
    id: string;
    conversation_id: string;
    property_id: string;
    album_key: string;
    unlocked_by_user_id: string;
    created_at: string;
}

// =============================================================================
// API TYPES
// =============================================================================

export interface BBox {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
}

export interface PropertiesApiResponse {
    ok: true;
    data: PropertyPublic[];
}

export interface ApiErrorResponse {
    ok: false;
    error: {
        message: string;
        code?: string;
    };
}

export type ApiResponse = PropertiesApiResponse | ApiErrorResponse;

