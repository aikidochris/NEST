-- 20251221_011_optimize_overture.sql
-- GHOSTLY ARCHITECTURE FIX: Senior Geospatial Engineering Overhaul
-- Buffer: 512px | Zoom Floor: 11 | ST_MakeValid | Conditional Simplification

create or replace function public.properties_mvt(z integer, x integer, y integer)
returns bytea 
language plpgsql 
stable 
security definer 
set search_path = public, extensions
as $$
declare
  mvt_properties bytea;
  mvt_overture bytea;
begin
  -- 1. Layer: Properties (Individual Pins)
  with
    bounds as ( select st_tileenvelope(z, x, y) as geom_3857 ),
    pts as (
      select
        pv.property_id::text as property_id,
        pv.display_label::text as display_label,
        COALESCE(pv.is_claimed, false) as is_claimed,
        COALESCE(pv.is_settled, true) as is_settled,
        COALESCE(pv.is_for_sale, false) as is_for_sale,
        COALESCE(pv.is_for_rent, false) as is_for_rent,
        COALESCE(pv.is_open_to_talking, false) as is_open_to_talking,
        CASE 
          WHEN pv.is_for_sale THEN 'for_sale'
          WHEN pv.is_for_rent THEN 'for_rent'
          WHEN pv.is_open_to_talking THEN 'open_to_talking'
          WHEN pv.is_claimed = true THEN 'settled'
          ELSE 'unclaimed' 
        END::text as status,
        (COALESCE(pv.is_for_sale, false) OR 
         COALESCE(pv.is_for_rent, false) OR 
         COALESCE(pv.is_open_to_talking, false))::boolean as has_active_intent,
        st_transform(st_setsrid(st_makepoint(pv.lon, pv.lat), 4326), 3857) as geom_3857
      from public.property_public_view pv
      where pv.lon is not null and pv.lat is not null
    ),
    clipped as (
      select 
        p.property_id,
        p.display_label,
        p.is_claimed,
        p.is_settled,
        p.is_for_sale,
        p.is_for_rent,
        p.is_open_to_talking,
        p.status,
        p.has_active_intent,
        st_asmvtgeom(p.geom_3857, b.geom_3857, 4096, 256, true) as geom
      from pts p cross join bounds b where p.geom_3857 && b.geom_3857
    )
  select st_asmvt(clipped, 'properties', 4096, 'geom') into mvt_properties from clipped;

  -- 2. Layer: Overture Buildings (Footprints & Heights)
  -- ZOOM FLOOR: 12 (Z11 tiles too heavy at 6MB, Z12 ~1MB is acceptable)
  if z >= 12 then
    with
      bounds as ( select st_tileenvelope(z, x, y) as geom_3857 ),
      bounds_4326 as ( select st_transform(geom_3857, 4326) as geom_4326 from bounds ),
      clipped_overture as (
        select 
          o.id,
          o.name,
          COALESCE(o.height, 6) as overture_height,
          -- CONDITIONAL SIMPLIFICATION:
          -- Z13+: Raw geometry for crisp 3D walls
          -- Z11-12: Aggressive simplification (10m tolerance) for performance
          st_asmvtgeom(
            CASE 
              WHEN z >= 13 THEN st_transform(ST_MakeValid(o.geometry), 3857)
              ELSE ST_Simplify(st_transform(ST_MakeValid(o.geometry), 3857), 10.0)
            END,
            b.geom_3857, 
            4096, 
            512,  -- BUFFER: 512px to eliminate tile clipping gaps
            true
          ) as geom
        from public.overture_buildings o 
        cross join bounds b
        cross join bounds_4326 b4326
        -- Index-optimized spatial filter (4326 for GIST hit)
        where o.geometry && b4326.geom_4326
      )
    select st_asmvt(clipped_overture, 'overture_buildings', 4096, 'geom') into mvt_overture from clipped_overture;
  end if;

  return coalesce(mvt_properties, '') || coalesce(mvt_overture, '');
end;
$$;

grant execute on function public.properties_mvt(integer, integer, integer) to anon, authenticated;
