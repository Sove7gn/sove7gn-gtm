-- (16 Nov) The bots answer replies: LinkedIn tasks can be a reply to someone who wrote back ("reply") or a polite closing
-- message to someone who said no ("close"). Both wait for Reyansh's OK unless the reply rules say "send on its own".
alter table public.crm_li_tasks drop constraint if exists crm_li_tasks_kind_check;
alter table public.crm_li_tasks add constraint crm_li_tasks_kind_check check (kind = any (array['invite','dm','followup','inmail','accept','magnet','reply','close']));
