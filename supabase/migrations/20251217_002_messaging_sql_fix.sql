-- Add participant-based read policy (keep the old one if you like)
create policy conversations_read_if_participant
on public.conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = auth.uid()
  )
);
