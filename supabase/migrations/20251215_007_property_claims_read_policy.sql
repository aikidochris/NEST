-- Add SELECT policy for property_claims so users can check their own claims
-- This enables isPropertyMine() helper to work

BEGIN;

-- Allow authenticated users to read their own claims
CREATE POLICY "Read own property claim"
ON public.property_claims
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

COMMIT;
