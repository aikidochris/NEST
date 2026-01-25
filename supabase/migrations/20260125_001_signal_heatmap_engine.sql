-- =============================================================================
-- VERSION: 4.0.0 (SIGNAL-BASED HEATMAP ENGINE)
-- DATE: 2026-01-25
-- =============================================================================
-- ZERO-RISK MIGRATION FOR SUPABASE FREE TIER (NO BACKUPS)
-- 
-- SAFETY GUARANTEES:
--   ✅ Uses CREATE OR REPLACE VIEW (no table modifications)
--   ✅ Uses CREATE OR REPLACE FUNCTION (no table modifications)
--   ✅ NO DELETE commands
--   ✅ NO TRUNCATE commands
--   ✅ NO DROP TABLE commands
--   ✅ All existing pin data (status, display_label) preserved
--
-- SCOPE LOCKS IMPLEMENTED:
--   1. Input Filtering: Only claims, story updates, intent flags (NO pricing)
--   2. Decay Function: 30-day exponential decay
--   3. 3-Layer Roauter: interest_weight, readiness_weight, activity_weight
-- =============================================================================

-- =============================================================================
-- STEP 1: CREATE SIGNAL AGGREGATION VIEW
-- This is a pure read-only view - no underlying data is modified
-- =============================================================================

CREATE OR REPLACE VIEW public.property_signal_weights AS
WITH signal_events AS (
    -- CLAIMS: Strong interest signal (someone claimed this property)
    -- Explicitly using only: property_id, created_at, status
    -- NO pricing or valuation columns
    SELECT 
        pc.property_id,
        pc.created_at,
        'claim' as signal_type,
        1.0 as base_weight
    FROM public.property_claims pc
    WHERE pc.status = 'claimed'
    
    UNION ALL
    
    -- STORY UPDATES: Activity signal (owner is actively maintaining listing)
    -- Explicitly using only: property_id, updated_at
    -- NO pricing or valuation columns
    SELECT 
        hs.property_id,
        hs.updated_at as created_at,
        'story' as signal_type,
        0.6 as base_weight
    FROM public.home_story hs
    
    UNION ALL
    
    -- INTENT FLAG CHANGES: Readiness signal (owner changed intent)
    -- Explicitly using only: property_id, updated_at, soft_listing, is_for_sale, is_for_rent
    -- NO pricing or valuation columns
    SELECT 
        ifl.property_id,
        ifl.updated_at as created_at,
        'intent' as signal_type,
        0.8 as base_weight
    FROM public.intent_flags ifl
    WHERE ifl.soft_listing = true 
       OR ifl.is_for_sale = true 
       OR ifl.is_for_rent = true
),
-- =============================================================================
-- DECAY FUNCTION: Exponential decay over 30-day window
-- Formula: weight × exp(-age_seconds / (15 days in seconds))
-- 
-- Decay curve:
--   Day 0:  100% strength
--   Day 10: ~51% strength
--   Day 20: ~26% strength
--   Day 30: ~13% strength (effectively faded)
-- =============================================================================
decayed_signals AS (
    SELECT 
        property_id,
        signal_type,
        base_weight * EXP(
            -EXTRACT(EPOCH FROM (NOW() - created_at)) / (15.0 * 86400.0)
        ) as decayed_weight
    FROM signal_events
    WHERE created_at > NOW() - INTERVAL '30 days'
      AND created_at IS NOT NULL
),
-- Aggregate by property and signal type
aggregated AS (
    SELECT 
        property_id,
        -- INTEREST: Weighted by claim recency
        SUM(CASE WHEN signal_type = 'claim' THEN decayed_weight ELSE 0 END) as interest_weight,
        -- READINESS: Weighted by intent flag activity
        SUM(CASE WHEN signal_type = 'intent' THEN decayed_weight ELSE 0 END) as readiness_weight,
        -- ACTIVITY: Weighted by story updates
        SUM(CASE WHEN signal_type = 'story' THEN decayed_weight ELSE 0 END) as activity_weight,
        -- COMBINED: All signals capped at 1.0
        LEAST(1.0, SUM(decayed_weight)) as combined_weight
    FROM decayed_signals
    GROUP BY property_id
)
SELECT 
    property_id,
    COALESCE(interest_weight, 0)::FLOAT as interest_weight,
    COALESCE(readiness_weight, 0)::FLOAT as readiness_weight,
    COALESCE(activity_weight, 0)::FLOAT as activity_weight,
    COALESCE(combined_weight, 0)::FLOAT as heat_weight
FROM aggregated;

-- Grant read access (safe operation)
GRANT SELECT ON public.property_signal_weights TO anon, authenticated;

-- =============================================================================
-- STEP 2: UPDATE MVT FUNCTION (PRESERVES ALL EXISTING COLUMNS)
-- This is CREATE OR REPLACE - no data is modified, just function definition
-- =============================================================================

CREATE OR REPLACE FUNCTION public.properties_mvt(z integer, x integer, y integer)
RETURNS bytea LANGUAGE sql STABLE AS $$
WITH
  bounds AS (SELECT ST_TileEnvelope(z, x, y) AS geom_3857),
  pts AS (
    SELECT
      -- PRESERVED: All existing pin columns
      pv.property_id::TEXT as property_id,
      COALESCE(pv.display_label, '')::TEXT as display_label,
      
      -- PRESERVED: 5-State Status for the Discovery Engine
      CASE 
        WHEN pv.is_for_sale THEN 'for_sale'
        WHEN pv.is_for_rent THEN 'for_rent'
        WHEN pv.is_open_to_talking THEN 'open_to_talking'
        WHEN pv.is_claimed = true THEN 'settled'
        ELSE 'unclaimed' 
      END::TEXT as status,
      
      -- NEW: 3-Layer Signal Weights (from view with decay)
      COALESCE(sw.interest_weight, 0)::FLOAT as interest_weight,
      COALESCE(sw.readiness_weight, 0)::FLOAT as readiness_weight,
      COALESCE(sw.activity_weight, 0)::FLOAT as activity_weight,
      COALESCE(sw.heat_weight, 0)::FLOAT as heat_weight,
      
      -- PRESERVED: Legacy discovery_weight as fallback
      CASE 
        WHEN pv.is_for_sale THEN 1.0
        WHEN pv.is_for_rent THEN 1.0
        WHEN pv.is_open_to_talking THEN 1.0
        WHEN pv.is_claimed = true THEN 0.4
        ELSE 0.1
      END::FLOAT as discovery_weight,
      
      -- PRESERVED: Active intent flag
      (COALESCE(pv.is_for_sale, false) OR 
       COALESCE(pv.is_for_rent, false) OR 
       COALESCE(pv.is_open_to_talking, false))::BOOLEAN as has_active_intent,
      
      ST_Transform(ST_SetSRID(ST_MakePoint(pv.lon, pv.lat), 4326), 3857) as geom_3857
    FROM public.property_public_view pv
    LEFT JOIN public.property_signal_weights sw ON sw.property_id = pv.property_id
    WHERE pv.lon IS NOT NULL AND pv.lat IS NOT NULL
  ),
  clipped AS (
    SELECT 
      -- All columns explicitly listed for clarity
      p.property_id, 
      p.display_label, 
      p.status,
      p.interest_weight, 
      p.readiness_weight, 
      p.activity_weight, 
      p.heat_weight,
      p.discovery_weight, 
      p.has_active_intent,
      ST_AsMVTGeom(p.geom_3857, b.geom_3857, 4096, 256, true) as geom
    FROM pts p CROSS JOIN bounds b 
    WHERE p.geom_3857 && b.geom_3857
  )
SELECT ST_AsMVT(clipped, 'properties', 4096, 'geom') FROM clipped;
$$;

-- Grant execute access (safe operation)
GRANT EXECUTE ON FUNCTION public.properties_mvt(integer, integer, integer) TO anon, authenticated;

-- =============================================================================
-- STEP 3: DOCUMENTATION
-- =============================================================================

COMMENT ON VIEW public.property_signal_weights IS 
'Signal-based heatmap weights with 30-day exponential decay.
Decay formula: weight × exp(-age_days / 15)
At 30 days, signal is ~13% of original strength.
EXCLUDES ALL PRICING/VALUATION DATA - signals only.
Columns: interest_weight, readiness_weight, activity_weight, heat_weight';

COMMENT ON FUNCTION public.properties_mvt(integer, integer, integer) IS
'Vector tile function returning properties with 3-layer heatmap weights.
Version 4.0.0 - Signal Heatmap Engine
Preserves all existing columns: property_id, display_label, status, has_active_intent
Adds: interest_weight, readiness_weight, activity_weight, heat_weight';

-- =============================================================================
-- SAFETY AUDIT CONFIRMATION
-- Run this after migration to verify no data was modified:
--
-- SELECT 'properties' as table_name, COUNT(*) FROM properties
-- UNION ALL
-- SELECT 'property_claims', COUNT(*) FROM property_claims
-- UNION ALL
-- SELECT 'home_story', COUNT(*) FROM home_story
-- UNION ALL
-- SELECT 'intent_flags', COUNT(*) FROM intent_flags;
--
-- Counts should be identical before and after migration.
-- =============================================================================
