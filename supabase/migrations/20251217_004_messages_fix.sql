create policy messages_insert_if_participant
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
  )
);
