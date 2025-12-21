-- Fix #3: break RLS recursion between conversations <-> conversation_participants

begin;

-- 1) Drop the current conversations SELECT policy that depends on conversation_participants
drop policy if exists "conversations_participant_read" on public.conversations;

-- 2) Create a new conversations SELECT policy that DOES NOT reference conversation_participants
-- Participants are simply: owner_user_id or created_by_user_id
create policy "conversations_read_participants"
on public.conversations
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or created_by_user_id = auth.uid()
);

commit;
