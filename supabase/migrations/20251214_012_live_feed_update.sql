create or replace function public.get_live_feed(
  min_lon double precision,
  min_lat double precision,
  max_lon double precision,
  max_lat double precision,
  lim integer default 30
)
returns table (
  event_type text,
  property_id uuid,
  display_label text,
  created_at timestamptz,
  summary text
)
language sql
stable
as $$
  with bbox_props as (
    select
      ppv.property_id,
      ppv.display_label
    from public.property_public_view ppv
    where ppv.lon between min_lon and max_lon
      and ppv.lat between min_lat and max_lat
  ),

  claim_events as (
    select
      'claim'::text as event_type,
      pc.property_id,
      bp.display_label,
      pc.created_at,
      'Owner claimed this home'::text as summary
    from public.property_claims pc
    join bbox_props bp on bp.property_id = pc.property_id
  ),

  status_events as (
    select
      'status'::text as event_type,
      i.property_id,
      bp.display_label,
      i.updated_at as created_at,
      case
        when i.is_for_sale then 'Marked For Sale'
        when i.is_for_rent then 'Marked For Rent'
        when i.settled then 'Marked Settled'
        when i.soft_listing then 'Open to Talking'
        else 'Updated status'
      end as summary
    from public.intent_flags i
    join bbox_props bp on bp.property_id = i.property_id
  ),

  story_events as (
    select
      'story'::text as event_type,
      hs.property_id,
      bp.display_label,
      hs.updated_at as created_at,
      'Added a home story'::text as summary
    from public.home_story hs
    join bbox_props bp on bp.property_id = hs.property_id
  ),

  note_events as (
    select
      'note'::text as event_type,
      un.property_id,
      bp.display_label,
      un.created_at,
      'Left a friendly note'::text as summary
    from public.unclaimed_notes un
    join bbox_props bp on bp.property_id = un.property_id
  )

  select * from (
    select * from claim_events
    union all
    select * from status_events
    union all
    select * from story_events
    union all
    select * from note_events
  ) all_events
  order by created_at desc
  limit greatest(lim, 1);
$$;

grant execute on function public.get_live_feed(double precision, double precision, double precision, double precision, integer)
to anon, authenticated;
