-- 16 Nov: the 3 ideas written ahead for X leads that are not in Leads (e.g. followers of our client's founders), sent as X follow-up 1.
alter table public.crm_x_people add column if not exists tips text not null default '';
