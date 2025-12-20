-- 20251219_004_mvt_status_column.sql
-- Adds a unified status column for surgical frontend filtering (sale, rent, talking)

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
      -- Unified status for surgical filtering
      case 
        when pv.is_for_sale then 'for_sale'
        when pv.is_for_rent then 'for_rent'
        when pv.is_open_to_talking then 'open_to_talking'
        when pv.is_settled then 'settled'
        when pv.is_claimed then 'claimed'
        else 'unclaimed'
      end::text as status,
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
      p.status,
      st_asmvtgeom(p.geom_3857, b.geom_3857, 4096, 256, true) as geom
    from pts p
    cross join bounds b
    where p.geom_3857 && b.geom_3857
  )
select st_asmvt(clipped, 'properties', 4096, 'geom')
from clipped;
$$;

grant execute on function public.properties_mvt(integer, integer, integer) to anon, authenticated;
