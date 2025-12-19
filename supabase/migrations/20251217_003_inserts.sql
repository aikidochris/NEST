create policy participants_insert_owner_for_own_conversation
on public.conversation_participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_participants.conversation_id
      and c.owner_user_id = auth.uid()
  )
);
