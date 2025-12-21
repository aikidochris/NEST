-- 1. Policy Dump
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where tablename in ('conversations','conversation_participants','messages','unclaimed_notes','property_claims')
order by tablename, policyname;

-- 2. Schema Check
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('conversations','conversation_participants','messages','unclaimed_notes')
order by table_name, ordinal_position;
