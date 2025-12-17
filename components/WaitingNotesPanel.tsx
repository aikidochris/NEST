import { useState, useEffect, useCallback } from "react";
import { listWaitingNotesForMyProperty } from "@/lib/unclaimedNotes";
import { convertWaitingNoteToConversation } from "@/lib/waitingNoteReply";
import { canStartConversation, type Status } from "@/lib/status";
import { isInspectOn } from "@/lib/inspect";

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
    status: Status; // Added status prop
    /** Callback when owner replies to a note - receives the new conversation ID (if created) or null (if drafting) and quoted context, note ID, and author ID */
    onReply?: (conversationId: string | null, quotedNote: { body: string; created_at: string }, noteId: string, authorUserId: string) => void;
}

export function WaitingNotesPanel({
    propertyId,
    isOwner,
    status,
    onReply,
}: WaitingNotesPanelProps) {
    const [notes, setNotes] = useState<WaitingNote[]>([]);
    const [loading, setLoading] = useState(true);
    // Removed replyingNoteId as we're not doing async conversion here anymore

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
    const handleReply = useCallback((note: WaitingNote) => {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] WAITING_NOTE_REPLY_OPEN", {
                note_id: note.id,
                property_id: propertyId,
                status,
            });
        }

        // We no longer convert immediately. Pass intent to parent to open composer.
        // conversationId is null because it doesn't exist yet.
        onReply?.(null, {
            body: note.body,
            created_at: note.created_at
        }, note.id, note.sender_user_id);

    }, [propertyId, onReply, status]);

    // Check if reply is allowed
    const canReply = canStartConversation(status);

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
                            <div className="flex items-center gap-2">
                                {!canReply && (
                                    <span className="text-xs text-gray-400 italic">
                                        Turn on Open to Talking to reply
                                    </span>
                                )}
                                <button
                                    onClick={() => handleReply(note)}
                                    disabled={!canReply}
                                    className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Reply
                                </button>
                            </div>
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
