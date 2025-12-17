import { supabase } from "@/lib/supabase/client";
import { isInspectOn } from "@/lib/inspect";
import { findConversationBetweenUsers } from "@/lib/messaging";

// =============================================================================
// WAITING NOTE CONVERSION
// Convert a waiting note into a conversation without sending an initial message.
// =============================================================================

interface ConversionArgs {
    noteId: string;
    propertyId: string;
    noteBody: string;
    noteAuthorId: string;
    noteCreatedAt: string;
}

interface ConversionResult {
    conversationId: string;
    quotedNote: {
        body: string;
        created_at: string;
    };
}


/**
 * Convert a waiting note to a conversation.
 * 
 * 1. Verifies ownership
 * 2. Creates/Get conversation
 * 3. Upserts participants
 * 4. Marks note as handled (with handled_at + handled_conversation_id)
 * 5. Returns conversation ID + quoted note for UI display
 * 
 * DOES NOT send the first message automatically.
 */
export async function convertWaitingNoteToConversation(args: ConversionArgs): Promise<ConversionResult> {
    const { noteId, propertyId, noteBody, noteAuthorId } = args;

    // Inspect log: Start
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] WAITING_NOTE_CONVERT_START", {
            note_id: noteId,
            property_id: propertyId,
        });
    }

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

    if (claimError || !claim) {
        if (isInspectOn()) {
            console.error("[waitingNoteReply] Failed to verify ownership:", claimError);
        }
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
        if (isInspectOn()) {
            console.error("[waitingNoteReply] Failed to create conversation:", convError);
        }
        throw new Error("Couldn't start conversation. Please try again.");
    }

    const conversationId = conversation.id;

    // Insert participants: owner and note author
    const participants = [
        { conversation_id: conversationId, user_id: user.id, role: "owner" },
        { conversation_id: conversationId, user_id: noteAuthorId, role: "viewer" },
    ];

    const { error: partError } = await supabase
        .from("conversation_participants")
        .upsert(participants, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });

    if (partError) {
        if (isInspectOn()) {
            console.error("[waitingNoteReply] Failed to add participants:", partError);
        }
        // Continue anyway - conversation exists
    }

    // Mark note as handled
    const handledAt = new Date().toISOString();
    const { error: updateError } = await supabase
        .from("unclaimed_notes")
        .update({
            handled_at: handledAt,
            handled_conversation_id: conversationId,
        })
        .eq("id", noteId);

    if (updateError) {
        if (isInspectOn()) {
            console.error("[waitingNoteReply] Failed to mark note handled:", updateError);
        }
        // Non-fatal, but note might reappear.
    }

    // Inspect log: Done
    if (isInspectOn()) {
        console.log("[NEST_INSPECT] WAITING_NOTE_CONVERT_DONE", {
            note_id: noteId,
            conversation_id: conversationId,
        });
        console.log("[NEST_INSPECT] WAITING_NOTE_HANDLED", {
            note_id: noteId,
        });
    }

    return {
        conversationId,
        quotedNote: {
            body: noteBody,
            created_at: args.noteCreatedAt,
        }
    };
}

interface ReplyArgs {
    noteId: string;
    propertyId: string;
    noteBody: string;
    replyBody: string;
    ownerId: string;
    noteAuthorId: string;
}

/**
 * Send the first reply to a waiting note.
 * 
 * 1. Creates conversation (if not exists)
 * 2. Upserts participants
 * 3. Inserts the REPLY message
 * 4. Marks the note as handled (ONLY if message send succeeds)
 * 5. Returns conversation ID
 */
export async function sendFirstReplyToWaitingNote(args: ReplyArgs): Promise<string> {
    const { noteId, propertyId, replyBody, ownerId, noteAuthorId } = args;

    if (ownerId === noteAuthorId) {
        throw new Error("You cannot reply to your own note.");
    }

    if (isInspectOn()) {
        console.log("[NEST_INSPECT] WAITING_NOTE_REPLY_START", {
            note_id: noteId,
            property_id: propertyId,
            owner_id: ownerId,
            author_id: noteAuthorId,
        });
    }

    // 1. Find existing conversation between owner and note author (deterministic)
    let conversationId = await findConversationBetweenUsers(propertyId, ownerId, noteAuthorId);

    if (conversationId) {
        if (isInspectOn()) {
            console.log("[NEST_INSPECT] WAITING_NOTE_CONVO_CREATED", {
                conversation_id: conversationId,
            });
        }
    } else {
        // Create new conversation
        // Log auth user just before insert
        if (isInspectOn()) {
            const { data: authData } = await supabase.auth.getUser();
            console.debug("[inspect] AUTH USER BEFORE CONVERSATION INSERT:", authData?.user);
        }

        const { data: newConv, error: createError } = await supabase
            .from("conversations")
            .insert({
                property_id: propertyId,
                owner_user_id: ownerId,
                created_by_user_id: ownerId,
            })
            .select("id")
            .single();

        if (createError) {
            console.error("RAW ERROR (conversation INSERT):", createError);
            console.error("ERROR JSON:", JSON.stringify(createError, null, 2));
            console.error("ERROR KEYS:", createError ? Object.keys(createError) : null);
            console.error("ERROR CODE:", (createError as unknown as Record<string, unknown>)?.code);
            console.error("ERROR MESSAGE:", (createError as unknown as Record<string, unknown>)?.message);
            console.error("ERROR DETAILS:", (createError as unknown as Record<string, unknown>)?.details);
            console.error("ERROR HINT:", (createError as unknown as Record<string, unknown>)?.hint);
            throw new Error("Failed to start conversation.");
        }
        conversationId = newConv.id;

        if (isInspectOn()) {
            console.log("[NEST_INSPECT] WAITING_NOTE_CONVO_CREATED", {
                conversation_id: conversationId,
            });
        }
    }

    // At this point conversationId is guaranteed to be a string
    if (!conversationId) {
        throw new Error("Failed to obtain conversation ID");
    }

    // 2. Insert participants (use insert, not upsert - avoids UPDATE path which lacks RLS policy)
    // For a new conversation, no duplicates can exist
    if (isInspectOn()) {
        const { data: authDataPart } = await supabase.auth.getUser();
        console.debug("[inspect] AUTH USER BEFORE PARTICIPANT INSERT:", authDataPart?.user);
    }

    const participants = [
        { conversation_id: conversationId, user_id: ownerId, role: "owner" },
        { conversation_id: conversationId, user_id: noteAuthorId, role: "viewer" },
    ];

    const { error: partError } = await supabase
        .from("conversation_participants")
        .insert(participants);

    if (partError) {
        console.error("RAW ERROR (participant INSERT):", partError);
        console.error("ERROR JSON:", JSON.stringify(partError, null, 2));
        console.error("ERROR KEYS:", partError ? Object.keys(partError) : null);
        console.error("ERROR CODE:", (partError as unknown as Record<string, unknown>)?.code);
        console.error("ERROR MESSAGE:", (partError as unknown as Record<string, unknown>)?.message);
        console.error("ERROR DETAILS:", (partError as unknown as Record<string, unknown>)?.details);
        console.error("ERROR HINT:", (partError as unknown as Record<string, unknown>)?.hint);
        // BLOCK: Do not attempt message insert if participants failed
        throw new Error(`Failed to add participants: ${(partError as unknown as Record<string, unknown>)?.message || 'Unknown error'}`);
    }

    // Verify participants (inspect mode only)
    if (isInspectOn()) {
        const { data: verifyParts } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", conversationId);
        console.log("[NEST_INSPECT] WAITING_NOTE_PARTICIPANTS_AFTER_UPSERT", {
            conversationId,
            participantUserIds: verifyParts?.map(p => p.user_id) || [],
        });
    }

    // 3. Insert Message
    const { error: msgError } = await supabase
        .from("messages")
        .insert({
            conversation_id: conversationId,
            sender_user_id: ownerId,
            body: replyBody,
        });

    if (msgError) {
        console.error("RAW ERROR (message INSERT):", msgError);
        console.error("ERROR JSON:", JSON.stringify(msgError, null, 2));
        console.error("ERROR KEYS:", msgError ? Object.keys(msgError) : null);
        console.error("ERROR CODE:", (msgError as unknown as Record<string, unknown>)?.code);
        console.error("ERROR MESSAGE:", (msgError as unknown as Record<string, unknown>)?.message);
        console.error("ERROR DETAILS:", (msgError as unknown as Record<string, unknown>)?.details);
        console.error("ERROR HINT:", (msgError as unknown as Record<string, unknown>)?.hint);
        throw new Error(`Failed to send reply: ${(msgError as unknown as Record<string, unknown>)?.message || 'Unknown error'}`);
    }

    // Verify message count (inspect mode only)
    if (isInspectOn()) {
        const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conversationId);
        console.log("[NEST_INSPECT] WAITING_NOTE_MESSAGES_AFTER_SEND", {
            conversationId,
            messageCount: count || 0,
        });
    }

    // 4. Mark note as handled - ONLY after successful message
    const handledAt = new Date().toISOString();
    const { error: updateError } = await supabase
        .from("unclaimed_notes")
        .update({
            handled_at: handledAt,
            handled_conversation_id: conversationId,
        })
        .eq("id", noteId);

    if (updateError) {
        // Non-fatal, log it. Note will remain in list but message is sent.
        if (isInspectOn()) {
            console.error("[waitingNoteReply] Failed to mark note handled after reply:", updateError);
        }
    }

    if (isInspectOn()) {
        console.log("[NEST_INSPECT] WAITING_NOTE_REPLY_SEND_DONE", {
            noteId,
            conversationId,
            handled: !updateError
        });
    }

    return conversationId;
}
