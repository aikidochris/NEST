begin;

-- drop the two INSERT policies that currently exist (names from your output)
drop policy if exists participants_insert_owner_for_own_conversation on public.conversation_participants;
drop policy if exists participants_insert_self_or_owner_creator      on public.conversation_participants;

-- allow the conversation owner OR creator to add participants (including other users)
create policy conversation_participants_insert_owner_or_creator
on public.conversation_participants
for insert
to authenticated
with check (
  conversation_participants.user_id is not null
  and conversation_participants.role in ('owner', 'viewer')
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_participants.conversation_id
      and (c.owner_user_id = auth.uid() or c.created_by_user_id = auth.uid())
  )
);

commit;
