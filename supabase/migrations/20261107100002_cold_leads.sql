-- Cold leads (7 Nov): a lead's heat can also be Cold. Instagram leads get theirs from how long ago the last message was
-- (hot up to 3 days, warm up to 7, cold after that; worked out on the page), and anyone can set it by hand.
alter table public.crm_leads drop constraint if exists crm_leads_heat_check;
alter table public.crm_leads add constraint crm_leads_heat_check check (heat in ('', 'Hot', 'Warm', 'Cold'));
