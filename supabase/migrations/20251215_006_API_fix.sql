-- Give the API roles permission to use the public schema
grant usage on schema public to anon, authenticated;

-- Allow reads on property_claims (needed for isPropertyMine + map ownership enrichment)
grant select on table public.property_claims to anon, authenticated;

-- Allow the logged-in user flows you already have (claim/update/delete own claim via RLS)
grant insert, update, delete on table public.property_claims to authenticated;

-- (Optional but typical) if you insert id defaults etc, allow sequence usage (harmless if none)
-- grant usage, select on all sequences in schema public to authenticated;
