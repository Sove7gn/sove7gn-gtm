-- Everyone the X jobs have looked at (9 Nov), kept apart from the LinkedIn and Instagram tables so those pages stay as they are.
-- x-leads and x-engage check here first, so nobody is looked up (and paid for) twice.
create table public.crm_x_people (
  handle text primary key check (handle = lower(handle)),
  name text not null default '',
  bio text not null default '',
  followers int,
  fit text not null default '' check (fit in ('', 'hot', 'warm', 'not a fit')),
  why text not null default '',
  role text not null default '',
  company text not null default '',
  company_what text not null default '',
  company_stage text not null default '',
  found_by text not null default '',          -- 'leads' or 'engage'
  added boolean not null default false,       -- put in DM Pipeline (leads) or Post Engagers (engage)
  judged_at timestamptz,
  first_seen timestamptz not null default now()
);
alter table public.crm_x_people enable row level security;
create policy team_read on public.crm_x_people for select to authenticated using ((select public.crm_is_member()));
revoke all on public.crm_x_people from anon, authenticated;
grant select on public.crm_x_people to authenticated;
