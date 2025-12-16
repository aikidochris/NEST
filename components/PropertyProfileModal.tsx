"use client";

import { useEffect, useState } from "react";
import type { PropertyPublic, PropertyImage as PropertyImageType } from "@/types/property";
import { PropertyImage } from "./PropertyImage";
import { PropertyImageLightbox } from "./PropertyImageLightbox";
import { OwnerToolsPanel } from "./OwnerToolsPanel";
import { WaitingNotesPanel } from "./WaitingNotesPanel";
import { PropertyMessagePanel } from "./PropertyMessagePanel";
import { getChipStyle, getPublicLabel, getPinColor } from "@/lib/statusStyles";
import { type Status } from "@/lib/status";
import { isInspectOn } from "@/lib/inspect";
import { listConversationsForProperty } from "@/lib/messaging";

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
    onNoteReply?: (conversationId: string) => void;
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
}: PropertyProfileModalProps) {
    const [images, setImages] = useState<PropertyImageType[]>([]);
    const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
    const [showOwnerInbox, setShowOwnerInbox] = useState(false);
    const [hasConversations, setHasConversations] = useState(false);

    // Load images (mocked for now)
    useEffect(() => {
        setImages(getMockImages(property));
    }, [property]);

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

    // Check for existing conversations when owner views their property
    useEffect(() => {
        if (!property.is_mine) return;

        let cancelled = false;

        async function checkConversations() {
            try {
                const convs = await listConversationsForProperty(property.property_id);
                if (!cancelled && convs.length > 0) {
                    setHasConversations(true);
                    setShowOwnerInbox(true); // Auto-open inbox if there are messages
                }
            } catch (err) {
                console.error("[PropertyProfileModal] Failed to check conversations:", err);
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

        // Claimed + Open to Talking / For Sale / For Rent: Message owner
        if (property.is_open_to_talking || property.is_for_sale || property.is_for_rent) {
            return { label: "Message owner", onClick: onMessage || (() => { }) };
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
            return { label: "Leave a friendly note", onClick: onMessage || (() => { }) };
        }

        if (!property.is_claimed) return null;

        // If primary is Message, secondary is Follow
        if (property.is_open_to_talking || property.is_for_sale || property.is_for_rent) {
            return { label: "Follow", onClick: onFollow || (() => { }) };
        }

        // If primary is Follow, secondary is Message (if allowed)
        if (property.is_settled && property.is_open_to_talking) {
            return { label: "Message", onClick: onMessage || (() => { }) };
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

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/60"
                    onClick={onClose}
                />

                {/* Modal */}
                <div
                    className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="profile-modal-title"
                >
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Content area */}
                    <div className="overflow-y-auto max-h-[90vh]">
                        {/* Gallery grid */}
                        <div className="p-4">
                            <div className="grid grid-cols-2 gap-2">
                                {/* Cover image (large) - clickable for lightbox */}
                                {property.cover_image_url && (
                                    <div
                                        className="col-span-2 cursor-pointer"
                                        onClick={() => setLightboxImage({
                                            src: property.cover_image_url!,
                                            alt: title
                                        })}
                                    >
                                        <PropertyImage
                                            src={property.cover_image_url}
                                            alt={title}
                                            aspectRatio="16:9"
                                        />
                                    </div>
                                )}

                                {/* Public album images */}
                                {publicImages.filter(img => img.kind === "album").map((img) => (
                                    <div
                                        key={img.id}
                                        className="cursor-pointer"
                                        onClick={() => img.url && setLightboxImage({
                                            src: img.url,
                                            alt: img.album_key || "Album photo"
                                        })}
                                    >
                                        <PropertyImage
                                            src={img.url}
                                            alt={img.album_key || "Album photo"}
                                            aspectRatio="4:3"
                                        />
                                    </div>
                                ))}

                                {/* Unlocked chat images (via conversation) */}
                                {unlockedChatImages.map((img) => (
                                    <div
                                        key={img.id}
                                        className="cursor-pointer relative"
                                        onClick={() => img.url && setLightboxImage({
                                            src: img.url,
                                            alt: img.album_key || "Album photo"
                                        })}
                                    >
                                        <PropertyImage
                                            src={img.url || null}
                                            alt={img.album_key || "Album photo"}
                                            aspectRatio="4:3"
                                        />
                                        {/* Unlocked badge */}
                                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-teal-500/90 text-white text-xs rounded-full">
                                            Shared
                                        </div>
                                    </div>
                                ))}

                                {/* Private images (owner only) */}
                                {privateImages.map((img) => (
                                    <div
                                        key={img.id}
                                        className="cursor-pointer relative"
                                        onClick={() => img.url && setLightboxImage({
                                            src: img.url,
                                            alt: img.album_key || "Private photo"
                                        })}
                                    >
                                        <PropertyImage
                                            src={img.url || null}
                                            alt={img.album_key || "Private photo"}
                                            aspectRatio="4:3"
                                        />
                                        {/* Private badge */}
                                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-gray-700/90 text-white text-xs rounded-full">
                                            Private
                                        </div>
                                    </div>
                                ))}

                                {/* Locked album tiles */}
                                {lockedImages.map((img) => (
                                    <div key={img.id} className="relative">
                                        <PropertyImage
                                            src={null}
                                            alt={img.album_key ? `${img.album_key} photos` : "Locked photos"}
                                            aspectRatio="4:3"
                                            isLocked={true}
                                        />
                                        {/* Album label on locked tile */}
                                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                                            <p className="text-white text-sm font-medium capitalize">
                                                {img.album_key || "Photos"}
                                            </p>
                                            <p className="text-white/70 text-xs">
                                                Shared through chat
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Owner tools panel (if owner) */}
                        {property.is_mine && (
                            <OwnerToolsPanel
                                property={property}
                                onStatusUpdate={onStatusUpdate}
                                onStoryUpdate={onStoryUpdate}
                                onCoverUpload={onCoverUpload}
                            />
                        )}

                        {/* Waiting notes panel (if owner) */}
                        <WaitingNotesPanel
                            propertyId={property.property_id}
                            isOwner={property.is_mine === true}
                            onReply={onNoteReply}
                        />

                        {/* Owner inbox toggle and panel */}
                        {property.is_mine && (
                            <div className="px-4 pb-4">
                                {!showOwnerInbox ? (
                                    <button
                                        onClick={() => setShowOwnerInbox(true)}
                                        className="w-full py-3 px-4 bg-teal-50 hover:bg-teal-100 text-teal-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        {hasConversations ? "View messages" : "Messages"}
                                    </button>
                                ) : (
                                    <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ height: "400px" }}>
                                        <PropertyMessagePanel
                                            property={property}
                                            onClose={() => setShowOwnerInbox(false)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Story section */}
                        <div className="px-4 pb-4">
                            <h2
                                id="profile-modal-title"
                                className="text-xl font-semibold text-gray-900 dark:text-white mb-2"
                            >
                                {title}
                            </h2>

                            {/* Intent chips */}
                            {intentStatuses.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {intentStatuses.map((status) => {
                                        const { bg, text } = getChipStyle(status);
                                        const label = getPublicLabel(status);
                                        if (!label) return null;
                                        return (
                                            <span
                                                key={status}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${bg} ${text}`}
                                            >
                                                <span
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: getPinColor(status) }}
                                                />
                                                {label}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Full story */}
                            <div className="prose prose-sm dark:prose-invert max-w-none mb-6">
                                <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                                    {story}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                {primaryAction && (
                                    <button
                                        onClick={primaryAction.onClick}
                                        className="flex-1 py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                                    >
                                        {primaryAction.label}
                                    </button>
                                )}
                                {secondaryAction && (
                                    <button
                                        onClick={secondaryAction.onClick}
                                        className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        {secondaryAction.label}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Mini-map placeholder */}
                        <div className="px-4 pb-4">
                            <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                                <span className="text-sm text-gray-400 dark:text-gray-500">Mini-map (coming soon)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {
                lightboxImage && (
                    <PropertyImageLightbox
                        src={lightboxImage.src}
                        alt={lightboxImage.alt}
                        onClose={() => setLightboxImage(null)}
                    />
                )
            }
        </>
    );
}
