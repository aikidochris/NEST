"use client";

import { useState, useEffect, useCallback } from "react";
import { listWaitingNotesForMyProperty } from "@/lib/unclaimedNotes";
import { replyToWaitingNote } from "@/lib/waitingNoteReply";

// =============================================================================
// WAITING NOTES PANEL
// Shows notes left by visitors before the owner claimed the property.
// Only renders for property owners (is_mine === true).
// =============================================================================

interface WaitingNote {
    id: string;
    body: string;
    sender_user_id: string;
    created_at: string;
}

interface WaitingNotesPanelProps {
    propertyId: string;
    isOwner: boolean;
    /** Callback when owner replies to a note - receives the new conversation ID */
    onReply?: (conversationId: string) => void;
}

export function WaitingNotesPanel({
    propertyId,
    isOwner,
    onReply,
}: WaitingNotesPanelProps) {
    const [notes, setNotes] = useState<WaitingNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyingNoteId, setReplyingNoteId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOwner) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function fetchNotes() {
            try {
                const data = await listWaitingNotesForMyProperty(propertyId);
                if (!cancelled) {
                    setNotes(data);
                }
            } catch (err) {
                console.error("Failed to fetch waiting notes:", err);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchNotes();

        return () => { cancelled = true; };
    }, [propertyId, isOwner]);

    // Handle reply to a note
    const handleReply = useCallback(async (note: WaitingNote) => {
        setReplyingNoteId(note.id);

        try {
            const { conversationId } = await replyToWaitingNote({
                noteId: note.id,
                propertyId,
                noteBody: note.body,
                noteAuthorId: note.sender_user_id,
            });

            // Remove note from local state
            setNotes(prev => prev.filter(n => n.id !== note.id));

            // Trigger callback to open messaging
            onReply?.(conversationId);
        } catch (err) {
            console.error("Failed to reply to note:", err);
        } finally {
            setReplyingNoteId(null);
        }
    }, [propertyId, onReply]);

    // Don't render if not owner or no notes
    if (!isOwner || loading || notes.length === 0) {
        return null;
    }

    return (
        <div className="px-4 py-3 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
                Waiting notes
            </h4>
            <div className="space-y-2">
                {notes.map((note) => (
                    <div
                        key={note.id}
                        className="p-3 bg-gray-50 border border-gray-100 rounded-xl"
                    >
                        <p className="text-sm text-gray-700 line-clamp-3">
                            {note.body}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-gray-400">
                                Received {formatRelativeTime(note.created_at)}
                            </p>
                            <button
                                onClick={() => handleReply(note)}
                                disabled={replyingNoteId === note.id}
                                className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {replyingNoteId === note.id ? "Replying…" : "Reply"}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Format a timestamp as relative time (e.g., "2 days ago").
 */
function formatRelativeTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
            return "just now";
        }
        return `${diffHours}h ago`;
    } else if (diffDays === 1) {
        return "yesterday";
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
    }
}
