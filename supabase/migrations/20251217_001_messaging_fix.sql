-- 20251217_waiting_notes_handled.sql

alter table public.unclaimed_notes
  add column if not exists handled_at timestamptz null,
  add column if not exists handled_conversation_id uuid null references public.conversations(id);

comment on column public.unclaimed_notes.handled_at
  is 'When owner clicked Reply';

comment on column public.unclaimed_notes.handled_conversation_id
  is 'Conversation created from this note';

create index if not exists unclaimed_notes_unhandled_idx
  on public.unclaimed_notes(property_id, created_at)
  where handled_at is null;
