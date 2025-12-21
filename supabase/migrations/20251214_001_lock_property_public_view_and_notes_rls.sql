begin;

-- 1) Rebuild the view cleanly (avoids ALTER VIEW rename errors)
drop view if exists public.property_public_view;

create view public.property_public_view as
select
  p.id as property_id,
  p.lat,
  p.lon,
  p.postcode,
  p.street,
  p.house_number,

  -- properties table does NOT have display_label, so we build it here.
  -- Avoids "null null" by falling back sensibly.
  nullif(
    trim(
      concat_ws(
        ', ',
        nullif(trim(concat_ws(' ', p.house_number, p.street)), ''),
        nullif(trim(p.postcode), '')
      )
    ),
    ''
  ) as display_label,

  pc.user_id as claimed_by_user_id,
  (pc.user_id is not null) as is_claimed,

  coalesce(ifl.soft_listing, false) as is_open_to_talking,
  coalesce(ifl.is_for_sale, false) as is_for_sale,
  coalesce(ifl.is_for_rent, false) as is_for_rent,
  coalesce(ifl.settled, false) as is_settled,

  hs.summary_text

from public.properties p

-- If claimed, return the claimant
left join public.property_claims pc
  on pc.property_id = p.id
 and pc.status = 'claimed'

-- Owner intent flags (only meaningful if claimed, but safe either way)
left join public.intent_flags ifl
  on ifl.property_id = p.id
 and ifl.owner_id = pc.user_id

-- Latest home_story (optional)
left join lateral (
  select hs1.summary_text
  from public.home_story hs1
  where hs1.property_id = p.id
  order by hs1.updated_at desc
  limit 1
) hs on true;

-- 2) Performance indexes (lightweight, helps bbox queries)
create index if not exists properties_lat_idx on public.properties (lat);
create index if not exists properties_lon_idx on public.properties (lon);
create index if not exists properties_postcode_idx on public.properties (postcode);

-- 3) Fix unclaimed_notes RLS (your column is sender_user_id, not user_id/author_id)
alter table public.unclaimed_notes enable row level security;

drop policy if exists "notes_insert_auth" on public.unclaimed_notes;
drop policy if exists "notes_select_own" on public.unclaimed_notes;

create policy "notes_insert_auth"
on public.unclaimed_notes
for insert
to authenticated
with check (auth.uid() = sender_user_id);

create policy "notes_select_own"
on public.unclaimed_notes
for select
to authenticated
using (auth.uid() = sender_user_id);

commit;
