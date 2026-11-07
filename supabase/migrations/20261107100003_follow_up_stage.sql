-- A "Follow up" stage (7 Nov), right after "In talks": leads pushed there by hand (the ↻ on a card) to chase. Left alone if it's
-- already there or was renamed. The Instagram job never moves a lead out of it.
update public.crm_lead_settings s set value = (
  select jsonb_agg(x.e order by x.o) from (
    select t.e, t.o::numeric as o from jsonb_array_elements(s.value) with ordinality as t(e, o)
    union all
    select '{"name":"Follow up","color":"oklch(0.72 0.15 65)","kind":"open"}'::jsonb,
      coalesce((select t.o from jsonb_array_elements(s.value) with ordinality as t(e, o) where t.e ->> 'name' = 'In talks'), 1) + 0.5
  ) x), updated_at = now()
where s.key = 'stages' and not exists (select 1 from jsonb_array_elements(s.value) e where e ->> 'name' = 'Follow up');
