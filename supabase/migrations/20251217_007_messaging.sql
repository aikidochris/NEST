begin;

drop policy if exists messages_insert on public.messages;
drop policy if exists messages_insert_if_participant on public.messages;

create policy messages_insert_if_participant
on public.messages
for insert
to authenticated
with check (
  messages.sender_user_id = auth.uid()
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
  )
);

commit;
