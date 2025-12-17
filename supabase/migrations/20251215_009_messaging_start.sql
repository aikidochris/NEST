BEGIN;

DROP POLICY IF EXISTS participants_read ON public.conversation_participants;
DROP POLICY IF EXISTS participants_insert ON public.conversation_participants;

CREATE POLICY participants_read
ON public.conversation_participants
FOR SELECT
TO authenticated
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

CREATE POLICY participants_insert
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
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

COMMIT;
