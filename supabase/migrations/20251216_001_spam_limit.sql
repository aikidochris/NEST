BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS unclaimed_notes_one_per_week
ON public.unclaimed_notes (
  property_id,
  sender_user_id,
  date_trunc('week', created_at)
);

COMMIT;
