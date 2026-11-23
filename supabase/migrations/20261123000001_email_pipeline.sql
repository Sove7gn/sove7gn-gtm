-- 23 Nov: the email pipeline. People contacted on LinkedIn/X also get a 3-email sequence from the 4 Emily inboxes
-- (Google Workspace, one per outreach domain). Fed only by the CRM's own pipelines; nothing sends without Approve.
--   crm_email_leads   one row per person in the email pipeline (stage, found email, MillionVerifier result, drafts, send times)
--   crm_email_events  every send, reply, bounce and check (the audit trail and the numbers behind each inbox's stats)
--   crm_email_dnc     do-not-contact addresses (bounced, said no/stop/unsubscribe)
--   crm_email_inboxes the 4 sending inboxes: paused state, next allowed send, IMAP position
--   crm_email_lock    one row so two runs of the email-bot can't overlap
-- Settings row 'email_bot' starts PAUSED. Writes go through the email-bot Edge Function (service role); the team can only read.

create table if not exists public.crm_email_inboxes (
  addr text primary key,
  domain text not null,
  enabled boolean not null default true,
  paused boolean not null default false,
  paused_reason text,
  paused_at timestamptz,
  next_send_at timestamptz,
  last_uid bigint,
  uidvalidity bigint,
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
insert into public.crm_email_inboxes (addr, domain) values
  ('emily@getsove7gn.com', 'getsove7gn.com'), ('emily@trysove7gn.com', 'trysove7gn.com'),
  ('emily@sove7gnhq.com', 'sove7gnhq.com'), ('emily@joinsove7gn.com', 'joinsove7gn.com')
on conflict (addr) do nothing;

create table if not exists public.crm_email_lock (id int primary key default 1 check (id = 1), until timestamptz not null default 'epoch');
insert into public.crm_email_lock (id) values (1) on conflict do nothing;

create table if not exists public.crm_email_dnc (
  email text primary key,
  reason text not null default '',
  source text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.crm_email_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid not null unique references public.crm_leads(id) on delete cascade,
  channel text not null default 'linkedin',
  first_touch_at timestamptz,
  first_touch_text text not null default '',
  name text not null default '', first_name text not null default '', company text not null default '', company_key text not null default '',
  role text not null default '', linkedin text not null default '', country text not null default '', tz text not null default 'America/New_York',
  one_liner text not null default '', funding text not null default '',
  email text, email_source text, email_found_at timestamptz,
  verify_result text, verify_sub text, verified_at timestamptz,
  stage text not null default 'new',
  stop_reason text, error text,
  inbox text, subject text not null default '', draft jsonb not null default '{}'::jsonb, fact text not null default '', warnings jsonb not null default '[]'::jsonb,
  approved_at timestamptz, approved_hash text,
  e1_at timestamptz, e2_at timestamptz, e3_at timestamptz, msgid1 text, msgid2 text, msgid3 text,
  next_step int, next_due timestamptz,
  replied_at timestamptz, reply_text text, bounced_at timestamptz,
  constraint crm_email_leads_stage check (stage in ('new','found','ready','approved','active','done','replied','stopped','skipped','no_email','rejected'))
);
create index if not exists crm_email_leads_stage on public.crm_email_leads (stage, next_due);
create index if not exists crm_email_leads_inbox on public.crm_email_leads (inbox, stage);
create index if not exists crm_email_leads_email on public.crm_email_leads (lower(email));
-- one contact per company while anyone at it is still in the pipeline
create unique index if not exists crm_email_leads_company on public.crm_email_leads (company_key)
  where company_key <> '' and stage not in ('skipped', 'no_email', 'rejected', 'stopped');
drop trigger if exists crm_email_leads_upd on public.crm_email_leads;
create trigger crm_email_leads_upd before insert or update on public.crm_email_leads for each row execute function public.crm_touch_updated();

create table if not exists public.crm_email_events (
  id bigint generated always as identity primary key,
  email_lead_id uuid references public.crm_email_leads(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,          -- sent | reply | auto_reply | bounce | verify | found | approve | skip | stop | pause | note | test
  inbox text,
  step int,
  message_id text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists crm_email_events_lead on public.crm_email_events (email_lead_id, at desc);
create index if not exists crm_email_events_inbox on public.crm_email_events (inbox, kind, at desc);

-- Starts paused, US only. Daily cap per inbox ramps 5 -> 10 -> 15 -> 20 -> 25, one step every 4 days counted from the first send
-- (Reyansh's schedule, 23 Nov). The bot holds the ramp one step back if bounces go over 2% or an inbox is paused.
insert into public.crm_lead_settings (key, value) values ('email_bot', jsonb_build_object(
  'paused', true, 'cap_steps', jsonb_build_array(5, 10, 15, 20, 25), 'step_days', 4, 'ramp_start', null, 'ramp_hold_bounce_pct', 2, 'window_from', 8, 'window_to', 17, 'default_tz', 'America/New_York',
  'gap_min', 10, 'gap_max', 20, 'countries', jsonb_build_array('united states', 'usa', 'u.s.'),
  'holidays', jsonb_build_array('2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01'),
  'bounce_pause_pct', 3, 'bounce_min_sends', 20, 'verify_max_age_days', 14,
  'intake_days', 30, 'intake_per_day', 6, 'finds_per_run', 2, 'apollo', true, 'test_recipients', '[]'::jsonb))
on conflict (key) do nothing;

alter table public.crm_email_inboxes enable row level security;
alter table public.crm_email_lock enable row level security;
alter table public.crm_email_dnc enable row level security;
alter table public.crm_email_leads enable row level security;
alter table public.crm_email_events enable row level security;
drop policy if exists team_read on public.crm_email_inboxes;
drop policy if exists team_read on public.crm_email_dnc;
drop policy if exists team_read on public.crm_email_leads;
drop policy if exists team_read on public.crm_email_events;
create policy team_read on public.crm_email_inboxes for select to authenticated using ((select public.crm_is_member()));
create policy team_read on public.crm_email_dnc for select to authenticated using ((select public.crm_is_member()));
create policy team_read on public.crm_email_leads for select to authenticated using ((select public.crm_is_member()));
create policy team_read on public.crm_email_events for select to authenticated using ((select public.crm_is_member()));
revoke all on public.crm_email_inboxes, public.crm_email_lock, public.crm_email_dnc, public.crm_email_leads, public.crm_email_events from anon, authenticated;
grant select on public.crm_email_inboxes, public.crm_email_dnc, public.crm_email_leads, public.crm_email_events to authenticated;
