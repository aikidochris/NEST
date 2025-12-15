alter table public.intent_flags
add constraint intent_flags_property_owner_unique unique (property_id, owner_id);
