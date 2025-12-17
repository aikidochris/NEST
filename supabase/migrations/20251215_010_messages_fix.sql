BEGIN;

-- 1) Drop ALL existing policies on conversations + conversation_participants (safe; does not delete data)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='conversations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversations', r.policyname);
  END LOOP;

  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='conversation_participants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversation_participants', r.policyname);
  END LOOP;
END $$;

-- 2) Ensure RLS is enabled
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- 3) Conversations: READ if you're owner or creator (NO dependency on conversation_participants)
CREATE POLICY conversations_read_owner_or_creator
ON public.conversations
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR created_by_user_id = auth.uid()
);

-- 4) Conversations: INSERT only by authed user as creator
CREATE POLICY conversations_insert_creator
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
);

-- 5) Conversations: UPDATE only by owner or creator (keeps updated_at changes possible)
CREATE POLICY conversations_update_owner_or_creator
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR created_by_user_id = auth.uid()
)
WITH CHECK (
  owner_user_id = auth.uid()
  OR created_by_user_id = auth.uid()
);

-- 6) Participants: READ if you're owner or creator of the conversation (references conversations, but conversations no longer references participants)
CREATE POLICY participants_read_if_owner_or_creator
ON public.conversation_participants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND (c.owner_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
  )
);

-- 7) Participants: INSERT rules
-- Allow inserting yourself; allow owner/creator to insert the other participant
CREATE POLICY participants_insert_self_or_owner_creator
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND (c.owner_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
  )
);

COMMIT;
