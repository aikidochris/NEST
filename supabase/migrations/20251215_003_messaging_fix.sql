-- Fix RLS recursion on conversation_participants

-- Drop the problematic policies (names must match existing)
DROP POLICY IF EXISTS participants_read ON conversation_participants;
DROP POLICY IF EXISTS participants_insert ON conversation_participants;

-- Recreate SELECT policy WITHOUT self-referencing conversation_participants
CREATE POLICY participants_read ON conversation_participants
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND (
        c.owner_user_id = auth.uid()
        OR c.created_by_user_id = auth.uid()
      )
  )
);

-- Recreate INSERT policy WITHOUT self-referencing conversation_participants
CREATE POLICY participants_insert ON conversation_participants
FOR INSERT TO authenticated
WITH CHECK (
  -- you can always insert yourself as a participant
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND (
        c.created_by_user_id = auth.uid()
        OR c.owner_user_id = auth.uid()
      )
  )
);
