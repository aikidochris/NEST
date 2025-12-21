-- VERSION: 3.1.0 (LUMINOUS SEMANTIC ENGINE)
-- PURPOSE: Decommissions clusters, enables dual-tone heatmap, and adds discovery weights.
CREATE OR REPLACE FUNCTION public.properties_mvt(z integer, x integer, y integer)
RETURNS bytea LANGUAGE sql STABLE AS $$
WITH
  bounds AS (SELECT ST_TileEnvelope(z, x, y) AS geom_3857),
  pts AS (
    SELECT
      pv.property_id::TEXT as property_id,
      COALESCE(pv.display_label, '')::TEXT as display_label,
      -- 5-State Status for the Discovery Engine
      CASE 
        WHEN pv.is_for_sale THEN 'for_sale'
        WHEN pv.is_for_rent THEN 'for_rent'
        WHEN pv.is_open_to_talking THEN 'open_to_talking'
        WHEN pv.is_claimed = true THEN 'settled'
        ELSE 'unclaimed' 
      END::TEXT as status,
      -- DISCOVERY WEIGHTING: Ember (1.0), Ink (0.4), Stone (0.1)
      CASE 
        WHEN pv.is_for_sale THEN 1.0
        WHEN pv.is_open_to_talking THEN 0.8
        WHEN pv.is_claimed = true THEN 0.4
        ELSE 0.1
      END::FLOAT as discovery_weight,
      (COALESCE(pv.is_for_sale, false) OR 
       COALESCE(pv.is_for_rent, false) OR 
       COALESCE(pv.is_open_to_talking, false))::BOOLEAN as has_active_intent,
      ST_Transform(ST_SetSRID(ST_MakePoint(pv.lon, pv.lat), 4326), 3857) as geom_3857
    FROM public.property_public_view pv
    WHERE pv.lon IS NOT NULL AND pv.lat IS NOT NULL
  ),
  clipped AS (
    SELECT 
      p.property_id, p.display_label, p.status, p.discovery_weight, p.has_active_intent,
      ST_AsMVTGeom(p.geom_3857, b.geom_3857, 4096, 256, true) as geom
    FROM pts p CROSS JOIN bounds b 
    WHERE p.geom_3857 && b.geom_3857
  )
SELECT ST_AsMVT(clipped, 'properties', 4096, 'geom') FROM clipped;
$$;

GRANT EXECUTE ON FUNCTION public.properties_mvt(integer, integer, integer) TO anon, authenticated;