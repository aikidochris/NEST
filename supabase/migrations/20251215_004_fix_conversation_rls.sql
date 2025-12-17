-- 20251215_003_fix_conversation_rls.sql
-- Fix RLS recursion between conversations and conversation_participants
-- Also harden owner checks to require status='claimed'

BEGIN;

-- 1) Replace conversations SELECT policy so it does NOT depend solely on conversation_participants
DROP POLICY IF EXISTS "conversations_participant_read" ON public.conversations;

CREATE POLICY "conversations_read_owner_or_creator_or_participant"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
  )
);

-- 2) Replace participants_read so it doesn't create a loop back through conversations SELECT
DROP POLICY IF EXISTS "participants_read" ON public.conversation_participants;

CREATE POLICY "participants_read"
ON public.conversation_participants
FOR SELECT
TO authenticated
USING (
  -- you can always see your own participant row
  conversation_participants.user_id = auth.uid()
  OR
  -- owner/creator can see participants (direct check on conversations row)
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND (c.owner_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
  )
);

-- 3) Tighten unlock owner check to require an actual claimed row (status='claimed')
DROP POLICY IF EXISTS "unlocks_owner_insert" ON public.conversation_album_unlocks;

CREATE POLICY "unlocks_owner_insert"
ON public.conversation_album_unlocks
FOR INSERT
TO authenticated
WITH CHECK (
  unlocked_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.property_claims pc
    WHERE pc.property_id = conversation_album_unlocks.property_id
      AND pc.user_id = auth.uid()
      AND pc.status = 'claimed'::claim_status
  )
);

-- 4) Tighten property_images owner-all similarly (prevents “any claim row” granting access)
DROP POLICY IF EXISTS "property_images_owner_all" ON public.property_images;

CREATE POLICY "property_images_owner_all"
ON public.property_images
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.property_claims pc
    WHERE pc.property_id = property_images.property_id
      AND pc.user_id = auth.uid()
      AND pc.status = 'claimed'::claim_status
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.property_claims pc
    WHERE pc.property_id = property_images.property_id
      AND pc.user_id = auth.uid()
      AND pc.status = 'claimed'::claim_status
  )
);

COMMIT;
