-- 20251214_011_properties_mvt_b64.sql
-- Wrapper function that returns MVT as base64 text for easier JS decoding

create or replace function public.properties_mvt_b64(z integer, x integer, y integer)
returns text
language sql
stable
as $$
  select coalesce(encode(public.properties_mvt(z, x, y), 'base64'), '');
$$;

grant execute on function public.properties_mvt_b64(integer, integer, integer) to anon, authenticated;
