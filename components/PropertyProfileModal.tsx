"use client";

import { useEffect, useState, useMemo } from "react";
import type { PropertyPublic, PropertyImage as PropertyImageType } from "@/types/property";
import { PropertyImage } from "./PropertyImage";
import { PropertyImageLightbox } from "./PropertyImageLightbox";
import { OwnerToolsPanel } from "./OwnerToolsPanel";
import { WaitingNotesPanel } from "./WaitingNotesPanel";
import { PropertyMessagePanel } from "./PropertyMessagePanel";
import { OwnerInboxPreview } from "./OwnerInboxPreview";
import { getChipStyle, getPublicLabel, getPinColor } from "@/lib/statusStyles";
import { resolveStatus, type Status } from "@/lib/status";
import { isInspectOn } from "@/lib/inspect";
import { listConversationsForProperty, getConversationForProperty } from "@/lib/messaging";
import {
    type ProximityAnchor,
    processProximityAnchors,
    MAX_WALK_THRESHOLD_METERS
} from "@/lib/proximity";

// =============================================================================
// PROPERTY PROFILE MODAL (Tier 2 - S06)
// Centred modal overlay with gallery, story, and conditional actions.
// =============================================================================

interface PropertyProfileModalProps {
    property: PropertyPublic;
    onClose: () => void;
    /** Whether user is authenticated */
    isAuthenticated?: boolean;
    /** Callback when user wants to claim */
    onClaim?: () => void;
    /** Callback when user wants to message */
    onMessage?: () => void;
    /** Callback when user wants to follow */
    onFollow?: () => void;
    /** Callback when owner updates status */
    onStatusUpdate?: (status: Status) => void;
    /** Callback when owner updates story */
    onStoryUpdate?: (story: string) => void;
    /** Callback when owner uploads cover photo */
    onCoverUpload?: (file: File) => void;
    /** Album keys that have been unlocked (via conversation) */
    unlockedAlbums?: string[];
    /** Callback when owner replies to a waiting note */
    onNoteReply?: (conversationId: string | null) => void;
    /** Initial open mode: "card" or "messages" to auto-open messaging */
    initialOpenMode?: "card" | "messages";
    /** Initial conversation ID to open directly */
    initialConversationId?: string | null;
    /** Callback when navigating to a neighbour property */
    onSelectNeighbour?: (propertyId: string, lat?: number, lon?: number) => void;
}

// Mock image data for development (will be fetched from API later)
function getMockImages(property: PropertyPublic): PropertyImageType[] {
    const images: PropertyImageType[] = [];

    // Add cover if exists
    if (property.cover_image_url) {
        images.push({
            id: "cover-1",
            property_id: property.property_id,
            url: property.cover_image_url,
            kind: "cover",
            album_key: null,
            visibility: "public",
            sort_order: 0,
            created_at: new Date().toISOString(),
        });
    }

    // Add mock album images if has_additional_images is true
    if (property.has_additional_images) {
        images.push(
            {
                id: "album-1",
                property_id: property.property_id,
                url: "",  // Will show as locked
                kind: "album",
                album_key: "living",
                visibility: "chat_unlocked",
                sort_order: 1,
                created_at: new Date().toISOString(),
            },
            {
                id: "album-2",
                property_id: property.property_id,
                url: "",
                kind: "album",
                album_key: "kitchen",
                visibility: "chat_unlocked",
                sort_order: 2,
                created_at: new Date().toISOString(),
            },
        );
    }

    return images;
}

/**
 * Tier 2 Full Property Profile Overlay.
 * Shows gallery grid, full story, and conditional action buttons.
 */
export function PropertyProfileModal({
    property,
    onClose,
    isAuthenticated = false,
    onClaim,
    onMessage,
    onFollow,
    onStatusUpdate,
    onStoryUpdate,
    onCoverUpload,
    unlockedAlbums = [],
    onNoteReply,
    initialOpenMode = "card",
    initialConversationId = null,
    onSelectNeighbour,
}: PropertyProfileModalProps) {
    const [images, setImages] = useState<PropertyImageType[]>([]);
    const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
    // Show messaging panel if initialOpenMode is 'messages' (for non-owners)
    const [showMessagePanel, setShowMessagePanel] = useState(initialOpenMode === "messages" && !property.is_mine);
    // Owner inbox: only show full panel if navigating directly to a conversation, otherwise show summary
    const [showOwnerInbox, setShowOwnerInbox] = useState(
        initialOpenMode === "messages" && property.is_mine && !!initialConversationId
    );
    const [hasConversations, setHasConversations] = useState(false);
    // Selected conversation for owner's inbox
    const [selectedOwnerConversationId, setSelectedOwnerConversationId] = useState<string | null>(
        initialConversationId ?? null
    );
    // Message panel mode for owner: 'thread' if opening specific conversation, 'list' if opening from View All
    const [ownerPanelMode, setOwnerPanelMode] = useState<"list" | "thread">(
        initialConversationId ? "thread" : "list"
    );
    // Track how owner entered the full panel (for "Back" button behavior)
    const [ownerEntryPoint, setOwnerEntryPoint] = useState<"row" | "viewall">(
        initialConversationId ? "row" : "viewall"
    );
    // Quoted note to display when opening a conversation from a waiting note reply
    const [pendingQuotedNote, setPendingQuotedNote] = useState<{ body: string; created_at: string } | null>(null);
    const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
    const [pendingNoteAuthorId, setPendingNoteAuthorId] = useState<string | null>(null);
    const [proximityAnchors, setProximityAnchors] = useState<ProximityAnchor[]>([]);
    const [isFactsExpanded, setIsFactsExpanded] = useState(false);

    // Load images (mocked for now)
    useEffect(() => {
        setImages(getMockImages(property));
    }, [property]);

    // Proximity Guard: State for raw anchor data (cached in state)
    const [allAnchors, setAllAnchors] = useState<any[]>([]);

    useEffect(() => {
        const fetchAllAnchors = async () => {
            if (allAnchors.length > 0) return; // Only fetch once
            try {
                const response = await fetch("/api/anchors");
                const geojson = await response.json();
                if (geojson.features) {
                    setAllAnchors(geojson.features);
                }
            } catch (err) {
                console.error("Failed to fetch anchors for cache:", err);
            }
        };
        fetchAllAnchors();
    }, [allAnchors.length]);

    // Proximity Guard: Memoized processing (runs only when property coordinates change)
    const proximityPills = useMemo(() => {
        if (!property.lat || !property.lon || allAnchors.length === 0) {
            return [];
        }
        return processProximityAnchors(allAnchors, property.lat, property.lon);
    }, [property.lat, property.lon, allAnchors]);

    // Log OPEN_PROPERTY_APPLIED on mount (confirms UI has opened)
    useEffect(() => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] OPEN_PROPERTY_APPLIED", {
                property_id: property.property_id,
                is_owner: property.is_mine,
                initialOpenMode,
                initialConversationId,
                showOwnerInbox,
                showMessagePanel,
            });
        }
        // Only log on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Check for existing conversation (to allow bypassing status gating)
    const [existingConversationId, setExistingConversationId] = useState<string | null>(null);

    useEffect(() => {
        // If owner, we use listConversationsForProperty separately.
        // If viewer + authenticated + claimed -> check if we have a conversation
        if (property.is_mine || !isAuthenticated || !property.is_claimed) return;

        let cancelled = false;

        async function checkExisting() {
            try {
                const existing = await getConversationForProperty(property.property_id);
                if (!cancelled && existing) {
                    setExistingConversationId(existing.conversationId);
                }
            } catch (err) {
                console.error("Failed to check existing conversation:", err);
            }
        }

        checkExisting();
        return () => { cancelled = true; };
    }, [property.property_id, property.is_mine, property.is_claimed, isAuthenticated]);

    // Check for existing conversations when owner views their property (for badge/count only)
    useEffect(() => {
        if (!property.is_mine) return;

        let cancelled = false;

        async function checkConversations() {
            try {
                const convs = await listConversationsForProperty(property.property_id);
                if (!cancelled && convs.length > 0) {
                    setHasConversations(true);
                    // DO NOT auto-open inbox - only set flag for display purposes
                }
            } catch (err) {
                if (isInspectOn()) {
                    console.error("[PropertyProfileModal] Failed to check conversations:", err);
                }
            }
        }

        checkConversations();

        return () => { cancelled = true; };
    }, [property.property_id, property.is_mine]);

    // Build display title
    const title = property.display_label ||
        [property.house_number, property.street, property.postcode].filter(Boolean).join(", ") ||
        "Property";

    // Get story text
    const getStory = (): string => {
        if (property.summary_text) {
            return property.summary_text;
        }
        if (!property.is_claimed) {
            return "This home hasn't been claimed yet. If you live here, you can claim it and share your story with the neighborhood.";
        }
        return "No story yet. The owner hasn't shared their story with the neighborhood.";
    };

    // Get intent statuses
    const getIntentStatuses = (): Status[] => {
        const statuses: Status[] = [];
        if (property.is_open_to_talking) statuses.push("open_to_talking");
        if (property.is_for_sale) statuses.push("for_sale");
        if (property.is_for_rent) statuses.push("for_rent");
        if (property.is_settled) statuses.push("settled");
        return statuses;
    };

    // Handle "Message owner" click - opens the messaging panel within this modal
    const handleMessageOwnerClick = () => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] MESSAGE_OWNER_CLICK", {
                property_id: property.property_id,
                is_owner: property.is_mine,
                is_claimed: property.is_claimed,
                is_open_to_talking: property.is_open_to_talking,
            });
        }

        // Open the message panel for viewers
        setShowMessagePanel(true);

        if (isInspectOn()) {
            console.log("[NEST_INSPECT] MESSAGE_PANEL_OPEN", {
                property_id: property.property_id,
                conversation_id: null,
                mode: "thread",
            });
        }
    };

    // Handle "Leave a friendly note" click for unclaimed properties
    const handleLeaveNoteClick = () => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] LEAVE_NOTE_CLICK", {
                property_id: property.property_id,
            });
        }

        // Open the message panel for unclaimed note
        setShowMessagePanel(true);
    };

    // Determine primary/secondary actions based on state
    const getPrimaryAction = (): { label: string; onClick: () => void } | null => {
        // Unclaimed: Claim this home
        if (!property.is_claimed) {
            if (!isAuthenticated) {
                return { label: "Sign in to claim", onClick: onClaim || (() => { }) };
            }
            return { label: "Claim this home", onClick: onClaim || (() => { }) };
        }

        // Owner: suppress message CTA (owner tools shown instead)
        if (property.is_mine) {
            if (isInspectOn()) {
                console.log("[NEST_INSPECT] OWNER_CTA_SUPPRESSED", {
                    property_id: property.property_id,
                });
            }
            return null; // Owner sees tools panel, not messaging CTA
        }

        // If conversation ALREADY EXISTS, allow messaging regardless of status
        if (existingConversationId) {
            return { label: "View conversation", onClick: handleMessageOwnerClick };
        }

        // Claimed + Open to Talking / For Sale / For Rent: Message owner
        if (property.is_open_to_talking || property.is_for_sale || property.is_for_rent) {
            return { label: "Message owner", onClick: handleMessageOwnerClick };
        }

        // Claimed + Settled: Follow
        if (property.is_settled) {
            return { label: "Follow", onClick: onFollow || (() => { }) };
        }

        // Default: Follow
        return { label: "Follow", onClick: onFollow || (() => { }) };
    };

    const getSecondaryAction = (): { label: string; onClick: () => void } | null => {
        // Unclaimed + authenticated: Leave a friendly note
        if (!property.is_claimed && isAuthenticated) {
            return { label: "Leave a friendly note", onClick: handleLeaveNoteClick };
        }

        if (!property.is_claimed) return null;

        // If primary is "View conversation" (existing), secondary is Follow
        if (existingConversationId) {
            return { label: "Follow", onClick: onFollow || (() => { }) };
        }

        // If primary is Message (new), secondary is Follow
        if (property.is_open_to_talking || property.is_for_sale || property.is_for_rent) {
            return { label: "Follow", onClick: onFollow || (() => { }) };
        }

        // If primary is Follow, secondary is Message (if allowed or existing)
        if (property.is_settled && property.is_open_to_talking) {
            // This case is actually covered by "Message owner" logic above in getPrimaryAction
            // But if we ever land here:
            return { label: "Message", onClick: handleMessageOwnerClick };
        }

        return null;
    };

    const story = getStory();
    const intentStatuses = getIntentStatuses();
    const primaryAction = getPrimaryAction();
    const secondaryAction = getSecondaryAction();

    // Filter images by visibility:
    // - Public: always visible
    // - chat_unlocked: visible if album_key is in unlockedAlbums, OR if owner
    // - private/followers: only visible to owner
    const publicImages = images.filter(img => img.visibility === "public");
    const unlockedChatImages = images.filter(img =>
        img.visibility === "chat_unlocked" &&
        (property.is_mine || (img.album_key && unlockedAlbums.includes(img.album_key)))
    );
    const lockedImages = images.filter(img =>
        img.visibility === "chat_unlocked" &&
        !property.is_mine &&
        (!img.album_key || !unlockedAlbums.includes(img.album_key))
    );
    const privateImages = property.is_mine
        ? images.filter(img => img.visibility === "private" || img.visibility === "followers")
        : [];

    // Hero Media Priority: hero_image_url || thumbnail_url || cover_image_url || fallback
    const heroMediaSrc = property.hero_image_url || property.thumbnail_url || property.cover_image_url || '/placeholder-home.jpg';

    // Vibe Subtitle Priority: metadata->'vibe_label' || metadata->'story_summary' || summary_text || fallback
    const vibeSubtitle = property.metadata?.vibe_label || property.metadata?.story_summary || property.summary_text || "Neighborhood Vibe";

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop with extreme blur and 'Ember' glow saturates/sepia */}
                <div
                    className="absolute inset-0 bg-black/40 backdrop-blur-[24px] backdrop-saturate-[1.2] backdrop-sepia-[0.2]"
                    onClick={onClose}
                />

                {/* Modal with radial gradient background overlay */}
                <div
                    className="relative rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col"
                    style={{
                        background: 'radial-gradient(circle, rgba(224,142,95,0.05) 0%, rgba(249,247,242,0.95) 100%)',
                        backdropFilter: 'blur(12px)'
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="profile-modal-title"
                >
                    {/* Header: Cinematic 16:10 Full-bleed */}
                    <div className="relative aspect-[16/10] w-full overflow-hidden flex-shrink-0">
                        <img
                            src={heroMediaSrc}
                            alt={title}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-700"
                            onClick={() => setLightboxImage({ src: heroMediaSrc, alt: title })}
                        />

                        {/* Status Overlay */}
                        <div className="absolute top-4 left-4 flex gap-2">
                            {intentStatuses.map((status) => {
                                const { bg, text } = getChipStyle(status);
                                const label = getPublicLabel(status);
                                if (!label) return null;
                                return (
                                    <span
                                        key={status}
                                        className={`px-3 py-1 text-[10px] font-bold tracking-wider uppercase rounded-full backdrop-blur-md shadow-lg ${bg} ${text}`}
                                    >
                                        {label}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        <div className="px-6 py-6 pb-24">
                            {/* Header Info */}
                            <div className="mb-6">
                                <h2
                                    id="profile-modal-title"
                                    className="text-3xl font-serif text-gray-900 mb-1"
                                >
                                    {title}
                                </h2>
                                <p className="text-amber-700/80 font-serif italic text-sm mb-4">
                                    {vibeSubtitle}
                                </p>

                                {/* Proximity Guard */}
                                <div className="mb-8">
                                    {proximityPills.length === 0 ? (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100/50 rounded-full text-[10px] font-medium text-gray-500">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                            </svg>
                                            Quiet residential pocket
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {proximityPills.map((anchor: ProximityAnchor) => (
                                                <div
                                                    key={anchor.id}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-white/60 backdrop-blur-sm border border-gray-100 shadow-sm rounded-lg text-[10px] font-semibold text-gray-700"
                                                >
                                                    {anchor.category === 'school' && '🎓'}
                                                    {anchor.category === 'transport' && '🚆'}
                                                    {anchor.category === 'spirit' && '🍃'}
                                                    {anchor.category === 'amenity' && '☕'}
                                                    <span>{anchor.walkMins} min walk to {anchor.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* From the Owner (Editorial Section) */}
                            <div className="mb-10 bg-[#FAF9F6] border border-gray-100/50 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-serif italic text-gray-800">From the Owner</h3>
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 border-2 border-white shadow-sm ring-1 ring-gray-100">
                                        <img
                                            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                                            alt="Owner"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-gray-700 text-sm leading-relaxed font-serif italic opacity-90">
                                        "{story}"
                                    </p>
                                </div>
                            </div>

                            {/* Property Facts Accordion */}
                            <div className="mb-10 border-t border-gray-100">
                                <button
                                    onClick={() => setIsFactsExpanded(!isFactsExpanded)}
                                    className="w-full py-4 flex items-center justify-between group"
                                >
                                    <span className="text-sm font-semibold text-gray-800 group-hover:text-amber-600 transition-colors">Property Facts (EPC, Floor Area)</span>
                                    <svg
                                        className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isFactsExpanded ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {isFactsExpanded && (
                                    <div className="pb-6 grid grid-cols-2 gap-4">
                                        <div className="bg-white/40 p-3 rounded-xl border border-gray-100">
                                            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Floor Area</p>
                                            <p className="text-sm font-medium text-gray-800">1,240 sq ft</p>
                                        </div>
                                        <div className="bg-white/40 p-3 rounded-xl border border-gray-100">
                                            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">EPC Rating</p>
                                            <p className="text-sm font-medium text-gray-800">B (84)</p>
                                        </div>
                                        <div className="bg-white/40 p-3 rounded-xl border border-gray-100">
                                            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Council Tax</p>
                                            <p className="text-sm font-medium text-gray-800">Band D</p>
                                        </div>
                                        <div className="bg-white/40 p-3 rounded-xl border border-gray-100">
                                            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Tenure</p>
                                            <p className="text-sm font-medium text-gray-800">Freehold</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Multi-Image Grid (Owner Gallery) */}
                            <div className="mb-10">
                                <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-6 px-1">Gallery</h4>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {publicImages.filter(img => img.kind === "album").concat(unlockedChatImages).concat(privateImages).map((img, idx) => (
                                        <div
                                            key={img.id}
                                            className={`relative group cursor-pointer overflow-hidden rounded-xl border border-[#DEDBD1] bg-white shadow-sm transition-all hover:shadow-md ${idx === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}`}
                                            onClick={() => img.url && setLightboxImage({ src: img.url, alt: img.album_key || "Photo" })}
                                        >
                                            <div className="aspect-square w-full">
                                                <img
                                                    src={img.url || '/placeholder-home.jpg'}
                                                    alt={img.album_key || "Gallery"}
                                                    loading="lazy"
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                            </div>
                                            {img.visibility === 'chat_unlocked' && (
                                                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-teal-500 text-white text-[8px] font-bold uppercase tracking-wider rounded backdrop-blur-md shadow-sm">
                                                    Unlocked
                                                </div>
                                            )}
                                            {img.visibility === 'private' && (
                                                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gray-500 text-white text-[8px] font-bold uppercase tracking-wider rounded backdrop-blur-md shadow-sm">
                                                    Private
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Locked album tiles */}
                                    {!property.is_mine && lockedImages.map((img) => (
                                        <div key={img.id} className="relative aspect-square rounded-xl bg-gray-100 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-4 text-center group transition-colors hover:bg-gray-50 uppercase">
                                            <svg className="w-5 h-5 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                            <p className="text-[10px] font-bold text-gray-400 tracking-wider">
                                                {img.album_key || "Internal Photos"}
                                            </p>
                                            <p className="text-[8px] text-gray-300 mt-1">Unlock via chat</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Owner tools / Messaging Panel integrations */}
                            <div className="space-y-6">
                                {property.is_mine && (
                                    <OwnerToolsPanel
                                        property={property}
                                        onStatusUpdate={onStatusUpdate}
                                        onStoryUpdate={onStoryUpdate}
                                        onCoverUpload={onCoverUpload}
                                    />
                                )}

                                <WaitingNotesPanel
                                    propertyId={property.property_id}
                                    isOwner={property.is_mine === true}
                                    status={resolveStatus({
                                        is_claimed: property.is_claimed, intent_flags: {
                                            soft_listing: property.is_open_to_talking ?? null,
                                            settled: property.is_settled ?? null,
                                            is_for_sale: property.is_for_sale ?? null,
                                            is_for_rent: property.is_for_rent ?? null,
                                        }
                                    })}
                                    onReply={(conversationId, quotedNote, noteId, authorUserId) => {
                                        setSelectedOwnerConversationId(conversationId);
                                        setPendingQuotedNote(quotedNote);
                                        setPendingNoteId(noteId);
                                        setPendingNoteAuthorId(authorUserId);
                                        setOwnerPanelMode("thread");
                                        setOwnerEntryPoint("row");
                                        setShowOwnerInbox(true);
                                        onNoteReply?.(conversationId);
                                    }}
                                />

                                {property.is_mine && showOwnerInbox && (
                                    <div className="border border-gray-100 bg-white/50 backdrop-blur-sm rounded-2xl overflow-hidden h-[450px] shadow-sm">
                                        <PropertyMessagePanel
                                            property={property}
                                            onClose={() => {
                                                setShowOwnerInbox(false);
                                                setSelectedOwnerConversationId(null);
                                                setPendingQuotedNote(null);
                                                setPendingNoteId(null);
                                                setPendingNoteAuthorId(null);
                                                setOwnerPanelMode("list");
                                            }}
                                            conversationId={selectedOwnerConversationId}
                                            onSelectNeighbour={onSelectNeighbour}
                                            mode={ownerPanelMode}
                                            isOwnerView={true}
                                            draftNote={pendingNoteId && pendingNoteAuthorId && pendingQuotedNote ? {
                                                noteId: pendingNoteId,
                                                authorUserId: pendingNoteAuthorId,
                                                quotedNote: pendingQuotedNote,
                                            } : null}
                                        />
                                    </div>
                                )}

                                {!property.is_mine && showMessagePanel && (
                                    <div className="border border-gray-100 bg-white/50 backdrop-blur-sm rounded-2xl overflow-hidden h-[450px] shadow-sm">
                                        <PropertyMessagePanel
                                            property={property}
                                            onClose={() => setShowMessagePanel(false)}
                                            conversationId={initialConversationId}
                                            onSelectNeighbour={onSelectNeighbour}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sticky Action Footer */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 pt-8 bg-gradient-to-t from-[#F9F7F2] via-[#F9F7F2]/95 to-transparent flex items-center justify-center pointer-events-none">
                        <div className="w-full max-w-lg pointer-events-auto">
                            {primaryAction && (
                                <button
                                    onClick={primaryAction.onClick}
                                    className="w-full py-4 px-8 bg-[#E08E5F] hover:bg-[#D47D4C] text-white text-sm font-bold tracking-widest uppercase rounded-2xl shadow-xl shadow-amber-900/10 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 group"
                                >
                                    <span>{primaryAction.label === "Message owner" ? "View Home & Message Owner" : primaryAction.label}</span>
                                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {lightboxImage && (
                <PropertyImageLightbox
                    src={lightboxImage.src}
                    alt={lightboxImage.alt}
                    onClose={() => setLightboxImage(null)}
                />
            )}
        </>
    );
}
