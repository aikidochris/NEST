"use client";

import { useState, useRef, type ChangeEvent } from "react";
import type { PropertyPublic } from "@/types/property";
import type { Status } from "@/lib/status";
import { getChipStyle, getPublicLabel, getPinColor } from "@/lib/statusStyles";

// =============================================================================
// OWNER TOOLS PANEL
// Collapsible panel with owner management actions.
// =============================================================================

interface OwnerToolsPanelProps {
    property: PropertyPublic;
    onStatusUpdate?: (status: Status) => void;
    onStoryUpdate?: (story: string) => void;
    onCoverUpload?: (file: File) => void;
    onUnclaim?: () => Promise<void>;
}

type ModalType = "none" | "story" | "status" | "album" | "cover" | "unclaim";

interface Album {
    id: string;
    name: string;
    visibility: "public" | "followers" | "private";
    photoCount: number;
}

const STATUS_OPTIONS: { status: Status; label: string }[] = [
    { status: "open_to_talking", label: "Open to Talking" },
    { status: "for_sale", label: "For Sale" },
    { status: "for_rent", label: "For Rent" },
    { status: "settled", label: "Settled" },
];

const VISIBILITY_OPTIONS = [
    { value: "public", label: "Public", description: "Visible to everyone" },
    { value: "followers", label: "Followers", description: "Only your followers" },
    { value: "private", label: "Private", description: "Only you" },
];

/**
 * Owner tools panel with modals for managing property.
 */
export function OwnerToolsPanel({
    property,
    onStatusUpdate,
    onStoryUpdate,
    onCoverUpload,
    onUnclaim,
}: OwnerToolsPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeModal, setActiveModal] = useState<ModalType>("none");
    const [isUnclaiming, setIsUnclaiming] = useState(false);

    // Story editing
    const [storyDraft, setStoryDraft] = useState(property.summary_text || "");

    // Status selection
    const [selectedStatus, setSelectedStatus] = useState<Status | null>(null);

    // Album management
    const [albums, setAlbums] = useState<Album[]>([
        { id: "1", name: "Kitchen", visibility: "private", photoCount: 0 },
        { id: "2", name: "Living Room", visibility: "private", photoCount: 0 },
        { id: "3", name: "Garden", visibility: "public", photoCount: 0 },
    ]);
    const [newAlbumName, setNewAlbumName] = useState("");
    const [newAlbumVisibility, setNewAlbumVisibility] = useState<"public" | "followers" | "private">("private");

    // File upload
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get current status
    const getCurrentStatus = (): Status | null => {
        if (property.is_open_to_talking) return "open_to_talking";
        if (property.is_for_sale) return "for_sale";
        if (property.is_for_rent) return "for_rent";
        if (property.is_settled) return "settled";
        return null;
    };

    // Handle cover photo selection
    const handleCoverSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onCoverUpload) {
            onCoverUpload(file);
        }
        setActiveModal("none");
    };

    // Handle story save
    const handleStorySave = () => {
        if (onStoryUpdate) {
            onStoryUpdate(storyDraft);
        }
        setActiveModal("none");
    };

    // Handle status save
    const handleStatusSave = () => {
        if (selectedStatus && onStatusUpdate) {
            onStatusUpdate(selectedStatus);
        }
        setActiveModal("none");
    };

    // Handle album create
    const handleAlbumCreate = () => {
        if (!newAlbumName.trim()) return;

        const newAlbum: Album = {
            id: `album-${Date.now()}`,
            name: newAlbumName.trim(),
            visibility: newAlbumVisibility,
            photoCount: 0,
        };

        setAlbums(prev => [...prev, newAlbum]);
        setNewAlbumName("");
        setNewAlbumVisibility("private");
    };

    // Handle album visibility change
    const handleAlbumVisibilityChange = (albumId: string, visibility: "public" | "followers" | "private") => {
        setAlbums(prev => prev.map(album =>
            album.id === albumId ? { ...album, visibility } : album
        ));
    };

    // Handle unclaim confirmation
    const handleUnclaimConfirm = async () => {
        if (!onUnclaim) return;
        setIsUnclaiming(true);
        try {
            await onUnclaim();
            setActiveModal("none");
        } catch (err) {
            console.error("Failed to unclaim:", err);
        } finally {
            setIsUnclaiming(false);
        }
    };

    return (
        <>
            {/* Collapsible panel */}
            <div className="px-4 pb-4">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    <span className="font-medium">Owner tools</span>
                    <svg
                        className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {isOpen && (
                    <div className="mt-3 space-y-2">
                        {/* Upload cover */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Upload cover photo</span>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCoverSelect}
                        />

                        {/* Manage albums */}
                        <button
                            onClick={() => setActiveModal("album")}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <span>Manage albums</span>
                            <span className="ml-auto text-xs text-gray-400">{albums.length} albums</span>
                        </button>

                        {/* Edit story */}
                        <button
                            onClick={() => {
                                setStoryDraft(property.summary_text || "");
                                setActiveModal("story");
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit home story</span>
                        </button>

                        {/* Update status */}
                        <button
                            onClick={() => {
                                setSelectedStatus(getCurrentStatus());
                                setActiveModal("status");
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                            <span>Update status</span>
                            {getCurrentStatus() && (
                                <span className="ml-auto text-xs text-gray-400">
                                    {getPublicLabel(getCurrentStatus()!)}
                                </span>
                            )}
                        </button>

                        {/* Unclaim this home (Ghost button) */}
                        <button
                            onClick={() => setActiveModal("unclaim")}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-400 hover:text-red-500 bg-transparent rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left mt-4 border border-dashed border-gray-200 dark:border-gray-700 hover:border-red-200"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>Unclaim this home</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Edit Story Modal */}
            {activeModal === "story" && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setActiveModal("none")} />
                    <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Edit home story
                        </h3>
                        <textarea
                            value={storyDraft}
                            onChange={(e) => setStoryDraft(e.target.value)}
                            placeholder="Share your home's story with the neighborhood..."
                            className="w-full h-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Share what you love about your home and neighborhood.
                        </p>
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setActiveModal("none")}
                                className="flex-1 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStorySave}
                                className="flex-1 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100"
                            >
                                Save story
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Update Status Modal */}
            {activeModal === "status" && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setActiveModal("none")} />
                    <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Update your status
                        </h3>
                        <div className="space-y-2">
                            {STATUS_OPTIONS.map(({ status, label }) => {
                                const { bg, text } = getChipStyle(status);
                                const isSelected = selectedStatus === status;
                                return (
                                    <button
                                        key={status}
                                        onClick={() => setSelectedStatus(status)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${isSelected
                                            ? "border-gray-900 dark:border-white"
                                            : "border-transparent bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                                            }`}
                                    >
                                        <span
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: getPinColor(status) }}
                                        />
                                        <span className={`text-sm font-medium ${bg} ${text} px-2 py-0.5 rounded-full`}>
                                            {label}
                                        </span>
                                        {isSelected && (
                                            <svg className="w-5 h-5 ml-auto text-gray-900 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setActiveModal("none")}
                                className="flex-1 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStatusSave}
                                disabled={!selectedStatus}
                                className="flex-1 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
                            >
                                Update status
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manage Albums Modal */}
            {activeModal === "album" && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setActiveModal("none")} />
                    <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Manage albums
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                Control who can see your photo albums
                            </p>
                        </div>

                        {/* Albums list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {albums.map((album) => (
                                <div
                                    key={album.id}
                                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                                >
                                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {album.name}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {album.photoCount} photos
                                        </p>
                                    </div>
                                    <select
                                        value={album.visibility}
                                        onChange={(e) => handleAlbumVisibilityChange(album.id, e.target.value as "public" | "followers" | "private")}
                                        className="text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-300"
                                    >
                                        {VISIBILITY_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}

                            {/* Create new album */}
                            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                                <p className="text-xs font-medium text-gray-500 mb-2">Create new album</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newAlbumName}
                                        onChange={(e) => setNewAlbumName(e.target.value)}
                                        placeholder="Album name"
                                        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                    <select
                                        value={newAlbumVisibility}
                                        onChange={(e) => setNewAlbumVisibility(e.target.value as "public" | "followers" | "private")}
                                        className="text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 text-gray-700 dark:text-gray-300"
                                    >
                                        {VISIBILITY_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={handleAlbumCreate}
                                    disabled={!newAlbumName.trim()}
                                    className="w-full mt-2 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                                >
                                    + Create album
                                </button>
                            </div>
                        </div>

                        {/* Close button */}
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setActiveModal("none")}
                                className="w-full py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unclaim Confirmation Modal (Glass DNA) */}
            {activeModal === "unclaim" && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/30 backdrop-blur-[12px]"
                        onClick={() => !isUnclaiming && setActiveModal("none")}
                    />
                    <div className="relative bg-white/90 backdrop-blur-xl rounded-[32px] shadow-2xl w-full max-w-sm p-8 border border-white/50">
                        {/* Icon */}
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-orange-50 flex items-center justify-center">
                            <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 text-center mb-3">
                            Ready to move on?
                        </h3>
                        <p className="text-sm text-gray-500 text-center leading-relaxed mb-8">
                            This will remove your story and status from the map. The home will return to unclaimed.
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleUnclaimConfirm}
                                disabled={isUnclaiming}
                                className="w-full py-3 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isUnclaiming ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Unclaiming...
                                    </>
                                ) : (
                                    "Yes, unclaim this home"
                                )}
                            </button>
                            <button
                                onClick={() => setActiveModal("none")}
                                disabled={isUnclaiming}
                                className="w-full py-3 text-sm font-medium text-gray-600 hover:text-gray-900 bg-transparent rounded-2xl transition-colors disabled:opacity-50"
                            >
                                Keep my home
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
