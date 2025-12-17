BEGIN;

ALTER TABLE public.unclaimed_notes ENABLE ROW LEVEL SECURITY;

-- Add owner read policy: if you have a claim for that property, you can read its waiting notes
CREATE POLICY unclaimed_notes_owner_read
ON public.unclaimed_notes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.property_claims pc
    WHERE pc.property_id = unclaimed_notes.property_id
      AND pc.user_id = auth.uid()
      AND pc.status = 'claimed'
  )
);

COMMIT;
