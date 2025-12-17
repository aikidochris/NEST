"use client";

import { useState, useEffect } from "react";
import { listUnlockedAlbums, unlockAlbum } from "@/lib/messaging/data";

// =============================================================================
// SHARE ALBUM MODAL
// Owner can share locked albums with conversation participants.
// =============================================================================

interface ShareAlbumModalProps {
    conversationId: string;
    propertyId: string;
    /** Available albums that can be shared */
    availableAlbums: { key: string; label: string }[];
    onClose: () => void;
    onShare: (albumKey: string) => void;
}

/**
 * Modal for owner to share albums in conversation.
 */
export function ShareAlbumModal({
    conversationId,
    propertyId,
    availableAlbums,
    onClose,
    onShare,
}: ShareAlbumModalProps) {
    const [unlockedKeys, setUnlockedKeys] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [sharing, setSharing] = useState<string | null>(null);

    // Load already unlocked albums
    useEffect(() => {
        async function loadUnlocked() {
            setLoading(true);
            const unlocked = await listUnlockedAlbums(conversationId);
            setUnlockedKeys(unlocked);
            setLoading(false);
        }
        loadUnlocked();
    }, [conversationId]);

    // Handle share
    const handleShare = async (albumKey: string) => {
        setSharing(albumKey);
        try {
            const success = await unlockAlbum(conversationId, propertyId, albumKey);
            if (success) {
                setUnlockedKeys(prev => [...prev, albumKey]);
                onShare(albumKey);
            }
        } catch (err) {
            console.error("Failed to share album:", err);
        } finally {
            setSharing(null);
        }
    };

    // Filter to only show shareable albums (not already unlocked)
    const shareableAlbums = availableAlbums.filter(
        album => !unlockedKeys.includes(album.key)
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Share photos
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Share your photo albums with this person
                </p>

                {loading ? (
                    <div className="py-8 text-center">
                        <p className="text-sm text-gray-500">Loading albums...</p>
                    </div>
                ) : shareableAlbums.length === 0 ? (
                    <div className="py-8 text-center">
                        <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            All albums have been shared
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {shareableAlbums.map((album) => (
                            <button
                                key={album.key}
                                onClick={() => handleShare(album.key)}
                                disabled={sharing !== null}
                                className="w-full flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left disabled:opacity-50"
                            >
                                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {album.label}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Share with this person
                                    </p>
                                </div>
                                {sharing === album.key ? (
                                    <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Already shared albums */}
                {unlockedKeys.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 mb-2">Already shared</p>
                        <div className="flex flex-wrap gap-2">
                            {unlockedKeys.map((key) => {
                                const album = availableAlbums.find(a => a.key === key);
                                return (
                                    <span
                                        key={key}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs rounded-full"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        {album?.label || key}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="w-full mt-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                    Done
                </button>
            </div>
        </div>
    );
}
