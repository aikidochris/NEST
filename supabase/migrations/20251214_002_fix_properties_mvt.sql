begin;

create extension if not exists postgis;

create or replace function public.properties_mvt(z integer, x integer, y integer)
returns bytea
language sql
stable
as $$
  with
  bounds as (
    select ST_TileEnvelope(z, x, y) as tile
  ),
  points as (
    select
      v.property_id,
      v.is_claimed,
      v.claimed_by_user_id,
      ST_Transform(
        ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326),
        3857
      ) as geom_3857
    from public.property_public_view v
    where v.lon is not null
      and v.lat is not null
  ),
  mvtgeom as (
    select
      p.property_id,
      p.is_claimed,
      p.claimed_by_user_id,
      ST_AsMVTGeom(p.geom_3857, b.tile, 4096, 256, true) as geom
    from points p
    cross join bounds b
    where p.geom_3857 && b.tile
  )
  select coalesce(
    ST_AsMVT(mvtgeom, 'properties', 4096, 'geom'),
    ''::bytea
  )
  from mvtgeom;
$$;

commit;
