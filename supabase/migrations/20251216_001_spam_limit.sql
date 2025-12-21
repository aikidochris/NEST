BEGIN;

-- Add week bucket columns (safe, additive)
ALTER TABLE public.unclaimed_notes
ADD COLUMN IF NOT EXISTS iso_year integer,
ADD COLUMN IF NOT EXISTS iso_week integer;

-- Backfill existing rows
UPDATE public.unclaimed_notes
SET
  iso_year = EXTRACT(isoyear FROM (created_at AT TIME ZONE 'UTC')::date)::int,
  iso_week = EXTRACT(week    FROM (created_at AT TIME ZONE 'UTC')::date)::int
WHERE iso_year IS NULL OR iso_week IS NULL;

-- Keep them filled on new inserts / updates
CREATE OR REPLACE FUNCTION public.set_unclaimed_notes_iso_week()
RETURNS trigger AS $$
BEGIN
  NEW.iso_year := EXTRACT(isoyear FROM (NEW.created_at AT TIME ZONE 'UTC')::date)::int;
  NEW.iso_week := EXTRACT(week    FROM (NEW.created_at AT TIME ZONE 'UTC')::date)::int;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unclaimed_notes_set_iso_week ON public.unclaimed_notes;

CREATE TRIGGER trg_unclaimed_notes_set_iso_week
BEFORE INSERT OR UPDATE OF created_at
ON public.unclaimed_notes
FOR EACH ROW
EXECUTE FUNCTION public.set_unclaimed_notes_iso_week();

COMMIT;
