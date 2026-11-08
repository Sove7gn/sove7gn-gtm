-- A "Cold lead" stage (8 Nov), just before Lost: people who went quiet or whose conversation died down, to reach out to later.
-- The Instagram job parks a lead here after 7 days with no message either way, and brings it back to In talks if they write
-- again. It counts as open (not lost). Left alone if it's already there or was renamed.
update public.crm_lead_settings s set value = (
  select jsonb_agg(x.e order by x.o) from (
    select t.e, t.o::numeric as o from jsonb_array_elements(s.value) with ordinality as t(e, o)
    union all
    select '{"name":"Cold lead","color":"oklch(0.62 0.11 245)","kind":"open"}'::jsonb,
      coalesce((select t.o from jsonb_array_elements(s.value) with ordinality as t(e, o) where t.e ->> 'kind' = 'lost' limit 1),
               jsonb_array_length(s.value) + 1) - 0.5
  ) x), updated_at = now()
where s.key = 'stages' and not exists (select 1 from jsonb_array_elements(s.value) e where e ->> 'name' ilike 'cold%');
