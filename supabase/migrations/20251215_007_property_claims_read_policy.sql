begin;

-- 1) Make sure the role can SELECT the table at all (common cause of "permission denied")
grant select on public.property_claims to authenticated;
grant select on public.property_claims to anon;

-- 2) Add a policy only if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_claims'
      and policyname = 'Read own property claim'
  ) then
    create policy "Read own property claim"
    on public.property_claims
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;
end $$;

commit;
