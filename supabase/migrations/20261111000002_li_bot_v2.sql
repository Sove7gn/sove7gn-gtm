-- LinkedIn bot v2 (11 Nov): people who send us a connection request get an "accept + first message" step (kind 'accept').
alter table public.crm_li_tasks drop constraint if exists crm_li_tasks_kind_check;
alter table public.crm_li_tasks add constraint crm_li_tasks_kind_check check (kind in ('invite', 'dm', 'followup', 'inmail', 'accept'));
-- Sending times now follow each person's own morning, so the bot's own hours default to the whole day.
update public.crm_lead_settings set value = jsonb_set(value, '{hours}', '{"from":0,"to":24}'::jsonb)
  where key = 'li_bot' and value->'hours' = '{"from":10,"to":24}'::jsonb;
