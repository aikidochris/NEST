BEGIN;

WITH ranked_notes AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, sender_user_id, iso_year, iso_week
      ORDER BY created_at DESC
    ) AS rn
  FROM public.unclaimed_notes
)
DELETE FROM public.unclaimed_notes
WHERE id IN (
  SELECT id
  FROM ranked_notes
  WHERE rn > 1
);

COMMIT;
