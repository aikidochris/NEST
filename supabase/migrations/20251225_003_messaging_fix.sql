-- Fix infinite recursion between conversations <-> conversation_participants RLS

-- 1) Drop the recursive SELECT policy on conversation_participants
drop policy if exists participants_read_if_owner_or_creator
on public.conversation_participants;

-- 2) Replace with a non-recursive SELECT policy:
-- users can read their own participant rows
create policy participants_select_self
on public.conversation_participants
for select
to authenticated
using (user_id = auth.uid());
