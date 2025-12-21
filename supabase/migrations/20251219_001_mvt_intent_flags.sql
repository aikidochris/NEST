-- 20251219_001_mvt_intent_flags.sql
-- Enhanced vector tiles with intent flags for GPU-native pin rendering
-- Provides instant status-colored pins without overlay API round-trip

-- Drop and recreate the function with intent flags
create or replace function public.properties_mvt(z integer, x integer, y integer)
returns bytea
language sql
stable
as $$
with
  bounds as (
    select st_tileenvelope(z, x, y) as geom_3857
  ),
  pts as (
    select
      pv.property_id::text as property_id,
      pv.display_label,
      pv.is_claimed,
      pv.is_open_to_talking,
      pv.is_for_sale,
      pv.is_for_rent,
      pv.is_settled,
      -- Build point from lon/lat -> 4326 -> 3857 (tile coords)
      st_transform(
        st_setsrid(st_makepoint(pv.lon, pv.lat), 4326),
        3857
      ) as geom_3857
    from public.property_public_view pv
    where pv.lon is not null and pv.lat is not null
  ),
  clipped as (
    select
      p.property_id,
      p.display_label,
      p.is_claimed,
      p.is_open_to_talking,
      p.is_for_sale,
      p.is_for_rent,
      p.is_settled,
      st_asmvtgeom(p.geom_3857, b.geom_3857, 4096, 256, true) as geom
    from pts p
    cross join bounds b
    where p.geom_3857 && b.geom_3857
  )
select st_asmvt(clipped, 'properties', 4096, 'geom')
from clipped;
$$;

-- Ensure anon and authenticated can call via API
grant execute on function public.properties_mvt(integer, integer, integer) to anon, authenticated;
