-- CLINICAL ENFORCEMENT: 20251219_014_glow_guard_mvt.sql
create or replace function public.properties_mvt(z integer, x integer, y integer)
returns bytea language sql stable as $$
with
  bounds as ( select st_tileenvelope(z, x, y) as geom_3857 ),
  pts as (
    select
      pv.property_id::text as property_id,
      pv.display_label,
      -- 5-State Status for the Filter Bar
      CASE 
        WHEN pv.is_for_sale THEN 'for_sale'
        WHEN pv.is_for_rent THEN 'for_rent'
        WHEN pv.is_open_to_talking THEN 'open_to_talking'
        WHEN pv.is_claimed = true THEN 'settled'
        ELSE 'unclaimed' 
      END::text as status,
      -- THE GLOW GUARD: Hardened boolean to prevent orange blinking on standard pins
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

grant execute on function public.properties_mvt(integer, integer, integer) to anon, authenticated;