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