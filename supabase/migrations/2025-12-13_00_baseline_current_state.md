# Nest Pre-MVP — Database Baseline (Read-Only Snapshot)
Date: 13 Dec 2025

This document records the agreed database state after initial
map, auth, claiming, and messaging wiring.

No schema changes should be inferred from this file.
All future changes must be implemented via SQL migrations.

---

## Schemas in Use
- public (application data)
- auth (Supabase managed)
- storage (Supabase managed)
- realtime (Supabase managed)

---

## Core Tables (public)

### properties
Purpose: canonical property records used for mapping

Columns:
- id (uuid, pk)
- lat (double, not null)
- lon (double, not null)
- postcode (text)
- street (text)
- house_number (text)
- created_at (timestamptz)

---

### property_claims
Purpose: ownership assertion

Columns:
- id (uuid, pk)
- property_id (uuid, fk → properties.id)
- user_id (uuid, fk → auth.users.id)
- status (enum: claimed)
- created_at
- updated_at

Invariant:
- One active claim per property

---

### intent_flags
Purpose: owner signalling

Columns:
- property_id
- owner_id
- soft_listing
- is_for_sale
- is_for_rent
- settled
- created_at
- updated_at

---

### home_story
Purpose: owner-written summary

Columns:
- property_id
- user_id
- summary_text
- created_at
- updated_at

---

### unclaimed_notes
Purpose: notes left on unclaimed homes

Columns:
- id
- property_id
- sender_user_id
- note_text
- created_at

RLS:
- insert/select only by sender_user_id

---

### message_threads
### messages
Purpose: 1:1 buyer ↔ owner messaging

---

### neighbour_notes
### neighbour_vouches
Purpose: neighbour interaction & trust

---

### analytics_events
Purpose: internal usage tracking

---

### local_businesses
### ad_slots
Purpose: future referral & advertising engine

---

## Views

### property_public_view
Purpose: single public read model for the map & cards

Columns:
- property_id
- lat
- lon
- postcode
- street
- house_number
- display_label
- claimed_by_user_id
- is_claimed
- is_open_to_talking
- is_for_sale
- is_for_rent
- is_settled
- summary_text

Source:
- properties
- property_claims
- intent_flags
- home_story

Invariant:
- Frontend must ONLY read from this view for property data

---

## Known Deviations / Debt
- display_label is computed, not stored
- Some legacy data imported via properties_import_raw
- No PostGIS geometry yet (lat/lon only)

---

## Governance Rules (From This Point Forward)

1. No direct schema edits without a migration file
2. Views are dropped + recreated, never altered in place
3. Columns are added, never renamed
4. Frontend contracts follow views, not tables


14.12.2025

- 
20251214_010_properties_vector_tiles.sql
 (original)
20251214_002_fix_properties_mvt.sql
 (your new version)
 These have both run in in supabase
 
 Migration 
supabase/migrations/20251214_011_properties_mvt_b64.sql

Creates properties_mvt_b64(z, x, y) returning 
text
Uses encode(properties_mvt(...), 'base64')
Grants execute to anon/authenticated
This has been ran in supabase

20251214_012_live_feed_update.sql - this has been run in supabase

20251215_001_property_images_conversations.sql - this has been applied
20251215_003_messaging_fix.sql - this has been applied
20251215_004_fix_conversation_rls.sql - this has been applied
20251215_005_message_recursion_fix.sql - this has been applied
20251215_006_API_fix.sql - this has been applied
20251215_007_property_claims_read_policy.sql - this has been applied
20251215_008_pin_fixes.sql - this has been applied
20251215_009_messaging_start.sql - this has been applied
20251215_010_messages_fix.sql - this has been applied
20251215_011_another_message_fix.sql - this has been applied
20251216_001_spam_limit.sql - this has been applied
20251216_002_spam_limit_final.sql - this has been applied
20251216_003_spam_limit_finish.sql - this has been applied
20251217_001_messaging_fix.sql - this has been applied
20251217_002_messaging_sql_fix.sql - this has been applied
20251225_003_messaging_fix.sql - this has been applied
20251217_003_inserts.sql - this has been applied
20251217_004_messages_fix.sql - this has been applied
20251217_005_messaging.sql - this has been applied
20251217_006_messaging.sql - this has been applied
20251217_007_messaging.sql - this has been applied
20251219_001_mvt_intent_flags.sql - this has been applied
20251219_002_neighborhood_anchors_seed.sql - this has been applied
20251219_003_admin_roles.sql - this has been applied
20251219_004_mvt_status_column.sql - this has been applied
20251219_005_error_fix.sql - this has been applied
20251219_006_map_fix.sql - this has been applied
20251219_007_fixes.sql - this has been applied
20251219_008_more_fixes.sql - this has been applied
20251219_009_filter_fix.sql - this has been applied
20251219_010_map.sql - this has been applied
20251220_001_fix_mvt_properties.sql - this has been applied
20251220_002_hardened_mvt.sql - this has been applied
20251220_003_null_safe_mvt.sql - this has been applied
20251220_004_heatmap_weightings.sql - this has been applied
20251220_005_heatmap_weightings_2.sql - this has been applied
20251221_001_heatmap_weightings_3.sql - this has been applied