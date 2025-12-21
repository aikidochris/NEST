-- REPAIR: 20251219_015_bulletproof_mvt.sql
create or replace function public.properties_mvt(z integer, x integer, y integer)
returns bytea language sql stable as $$
with
  bounds as ( select st_tileenvelope(z, x, y) as geom_3857 ),
  pts as (
    select
      pv.property_id::text as property_id,
      -- Ensure strictly string-based status
      CASE 
        WHEN COALESCE(pv.is_for_sale, false) THEN 'for_sale'
        WHEN COALESCE(pv.is_for_rent, false) THEN 'for_rent'
        WHEN COALESCE(pv.is_open_to_talking, false) THEN 'open_to_talking'
        WHEN COALESCE(pv.is_claimed, false) THEN 'settled'
        ELSE 'unclaimed' 
      END::text as status,
      -- Hardened boolean for the Glow logic
      (COALESCE(pv.is_for_sale, false) OR 
       COALESCE(pv.is_for_rent, false) OR 
       COALESCE(pv.is_open_to_talking, false))::boolean as has_active_intent,
      st_transform(st_setsrid(st_makepoint(pv.lon, pv.lat), 4326), 3857) as geom_3857
    from public.property_public_view pv
    where pv.lon is not null and pv.lat is not null
  ),
  clipped as (
    select p.*, st_asmvtgeom(p.geom_3857, b.geom_3857, 4096, 256, true) as geom
    from pts p cross join bounds b where p.geom_3857 && b.geom_3857
  )
select st_asmvt(clipped, 'properties', 4096, 'geom') from clipped;
$$;