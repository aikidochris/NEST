-- VERSION: 1.0.3 (Hardened Sanitization & Cache Bust)
-- Persona: Senior Spatial Systems Engineer (MVT Spec Compliance)

CREATE OR REPLACE FUNCTION public.properties_mvt(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
    mvt bytea;
BEGIN
    WITH
    bounds AS (
        SELECT ST_TileEnvelope(z, x, y) AS geom_3857
    ),
    pts AS (
        SELECT
            pv.property_id::TEXT as property_id,
            COALESCE(pv.display_label, '')::TEXT as display_label,
            COALESCE(pv.is_claimed, false)::BOOLEAN as is_claimed,
            COALESCE(pv.is_settled, true)::BOOLEAN as is_settled,
            COALESCE(pv.is_for_sale, false)::BOOLEAN as is_for_sale,
            COALESCE(pv.is_for_rent, false)::BOOLEAN as is_for_rent,
            COALESCE(pv.is_open_to_talking, false)::BOOLEAN as is_open_to_talking,
            -- 5-State Status for the Filter Bar (Explicit Sanitization)
            CASE 
                WHEN pv.is_for_sale THEN 'for_sale'
                WHEN pv.is_for_rent THEN 'for_rent'
                WHEN pv.is_open_to_talking THEN 'open_to_talking'
                WHEN pv.is_claimed = true THEN 'settled'
                ELSE 'unclaimed' 
            END::TEXT as status,
            -- THE GLOW GUARD: Hardened boolean
            (COALESCE(pv.is_for_sale, false) OR 
             COALESCE(pv.is_for_rent, false) OR 
             COALESCE(pv.is_open_to_talking, false))::BOOLEAN as has_active_intent,
            ST_Transform(ST_SetSRID(ST_MakePoint(pv.lon, pv.lat), 4326), 3857) as geom_3857
        FROM public.property_public_view pv
        WHERE pv.lon IS NOT NULL AND pv.lat IS NOT NULL
    ),
    clipped AS (
        -- BINARY AUDIT: We EXPLICITLY list columns to ensure NO raw geometry leakage from the source table.
        -- ST_AsMVTGeom converts the internal PostGIS geometry (geom_3857) into local MVT coordinates (geom).
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
    SELECT ST_AsMVT(clipped, 'properties', 4096, 'geom') INTO mvt FROM clipped;
    
    RETURN mvt;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.properties_mvt(integer, integer, integer) TO anon, authenticated;
