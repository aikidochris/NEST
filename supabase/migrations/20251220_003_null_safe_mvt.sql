-- VERSION: 2.0.0 (NULL-SAFE MVT)
-- Every nullable column is wrapped in COALESCE to emit empty strings or default values.
-- This prevents empty Value messages from being encoded.

CREATE OR REPLACE FUNCTION public.properties_mvt(z integer, x integer, y integer)
RETURNS bytea LANGUAGE sql STABLE AS $$
WITH
  bounds AS (SELECT ST_TileEnvelope(z, x, y) AS geom_3857),
  pts AS (
    SELECT
      pv.property_id::TEXT as property_id,
      COALESCE(pv.display_label, '')::TEXT as display_label,
      COALESCE(pv.is_claimed, false)::BOOLEAN as is_claimed,
      COALESCE(pv.is_settled, false)::BOOLEAN as is_settled,
      COALESCE(pv.is_for_sale, false)::BOOLEAN as is_for_sale,
      COALESCE(pv.is_for_rent, false)::BOOLEAN as is_for_rent,
      COALESCE(pv.is_open_to_talking, false)::BOOLEAN as is_open_to_talking,
      CASE 
        WHEN pv.is_for_sale THEN 'for_sale'
        WHEN pv.is_for_rent THEN 'for_rent'
        WHEN pv.is_open_to_talking THEN 'open_to_talking'
        WHEN pv.is_claimed = true THEN 'settled'
        ELSE 'unclaimed' 
      END::TEXT as status,
      (COALESCE(pv.is_for_sale, false) OR 
       COALESCE(pv.is_for_rent, false) OR 
       COALESCE(pv.is_open_to_talking, false))::BOOLEAN as has_active_intent,
      ST_Transform(ST_SetSRID(ST_MakePoint(pv.lon, pv.lat), 4326), 3857) as geom_3857
    FROM public.property_public_view pv
    WHERE pv.lon IS NOT NULL AND pv.lat IS NOT NULL
  ),
  clipped AS (
    SELECT 
      p.property_id,
      p.display_label,
      p.is_claimed,
      p.is_settled,
      p.is_for_sale,
      p.is_for_rent,
      p.is_open_to_talking,
      p.status,
      p.has_active_intent,
      ST_AsMVTGeom(p.geom_3857, b.geom_3857, 4096, 256, true) as geom
    FROM pts p 
    CROSS JOIN bounds b 
    WHERE p.geom_3857 && b.geom_3857
  )
SELECT ST_AsMVT(clipped, 'properties', 4096, 'geom') FROM clipped;
$$;

GRANT EXECUTE ON FUNCTION public.properties_mvt(integer, integer, integer) TO anon, authenticated;