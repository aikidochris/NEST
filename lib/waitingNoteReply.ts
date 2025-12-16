import { supabase } from "@/lib/supabase/client";
import { isInspectOn } from "@/lib/inspect";

// =============================================================================
// WAITING NOTE REPLY
// Phase 3 Chunk 5 - Owner-led conversation creation from waiting notes
// =============================================================================

interface ReplyArgs {
    noteId: string;
    propertyId: string;
    noteBody: string;
    noteAuthorId: string;
}

/**
 * Reply to a waiting note by creating a conversation.
 * 
 * This:
 * 1. Verifies current user owns the property
 * 2. Creates a conversation
 * 3. Adds both participants
 * 4. Inserts the first message (with quoted note)
 * 5. Deletes the original note
 */
export async function replyToWaitingNote(args: ReplyArgs): Promise<{ conversationId: string }> {
    const { noteId, propertyId, noteBody, noteAuthorId } = args;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Not authenticated");
    }

    // Verify ownership via property_claims
    const { data: claim, error: claimError } = await supabase
        .from("property_claims")
        .select("id")
        .eq("property_id", propertyId)
        .eq("user_id", user.id)
        .eq("status", "claimed")
        .maybeSingle();

    if (claimError) {
        throw new Error(`Failed to verify ownership: ${claimError.message}`);
    }

    if (!claim) {
        throw new Error("You do not own this property");
    }

    // Create conversation
    const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({
            property_id: propertyId,
            owner_user_id: user.id,
            created_by_user_id: user.id,
        })
        .select("id")
        .single();

    if (convError) {
        throw new Error(`Failed to create conversation: ${convError.message}`);
    }

    const conversationId = conversation.id;

    // Insert participants: owner and note author
    const participants = [
        { conversation_id: conversationId, user_id: user.id, role: "owner" },
        { conversation_id: conversationId, user_id: noteAuthorId, role: "viewer" },
    ];

    const { error: partError } = await supabase
        .from("conversation_participants")
        .insert(participants);

    if (partError) {
        throw new Error(`Failed to add participants: ${partError.message}`);
    }

    // Insert first message with quoted note
    const firstMessage = `Hi — thanks for your note about the house.\n\n"${noteBody}"`;

    const { error: msgError } = await supabase
        .from("messages")
        .insert({
            conversation_id: conversationId,
            sender_user_id: user.id,
            body: firstMessage,
        });

    if (msgError) {
        throw new Error(`Failed to create message: ${msgError.message}`);
    }

    // Delete the waiting note
    const { error: delError } = await supabase
        .from("unclaimed_notes")
        .delete()
        .eq("id", noteId);

    if (delError) {
        // Non-fatal - log and continue
        console.error("[waitingNoteReply] Failed to delete note:", delError.message);
    }

    // Debug log
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] WAITING_NOTE_REPLY", {
            note_id: noteId,
            property_id: propertyId,
            conversation_id: conversationId,
        });
    }

    return { conversationId };
}
