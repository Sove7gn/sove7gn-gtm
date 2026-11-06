-- Automatic post tracking (7 Nov): every post we publish, its numbers over time, everyone who liked or commented, whether
-- each person fits who we sell to, and good fits added to Leads on their own. Filled by the social-sync Edge Function
-- (service role); team members read it, and can change a person's fit or link them to a lead. Built per platform, so X
-- can join later.

alter table public.crm_leads add column heat text not null default '' check (heat in ('', 'Hot', 'Warm'));
alter table public.crm_lead_events drop constraint crm_lead_events_kind_check;
alter table public.crm_lead_events add constraint crm_lead_events_kind_check
  check (kind in ('note', 'call', 'message', 'email', 'meeting', 'stage', 'created', 'engaged'));

create table public.crm_social_posts (
  platform text not null,                 -- 'linkedin' (and 'x' later)
  post_id text not null,
  url text not null default '',
  text text not null default '',
  posted_at timestamptz,
  likes int not null default 0,
  comments int not null default 0,
  reposts int not null default 0,
  views int,                              -- not available from LinkedIn without the account's own login
  reactions jsonb not null default '[]',  -- [{type:"LIKE",count:2}, ...]
  first_seen timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  primary key (platform, post_id)
);

-- One row per post per check, so the tracker can show how each post grew.
create table public.crm_social_checks (
  platform text not null,
  post_id text not null,
  at timestamptz not null default now(),
  likes int not null default 0,
  comments int not null default 0,
  reposts int not null default 0,
  views int,
  primary key (platform, post_id, at),
  foreign key (platform, post_id) references public.crm_social_posts (platform, post_id) on delete cascade
);

-- Everyone who engaged with any of our posts, and what we make of them.
create table public.crm_social_people (
  platform text not null,
  person_key text not null,               -- their profile link, lower case
  name text not null default '',
  headline text not null default '',
  profile_url text not null default '',
  picture_url text not null default '',
  is_self boolean not null default false, -- us, liking or answering under our own post
  fit text not null default '' check (fit in ('', 'hot', 'warm', 'not a fit')),
  why text not null default '',
  role text not null default '',
  company text not null default '',
  company_what text not null default '',
  company_stage text not null default '',
  found_online boolean,
  judged_at timestamptz,
  fit_by text not null default 'auto',    -- 'auto', or the email of whoever changed it by hand
  lead_id uuid references public.crm_leads (id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (platform, person_key)
);

create table public.crm_social_engagements (
  platform text not null,
  post_id text not null,
  person_key text not null,
  kind text not null check (kind in ('liked', 'commented', 'reposted', 'replied', 'quoted')),
  reaction text not null default '',      -- LIKE, PRAISE, EMPATHY, ...
  said text not null default '',          -- the comment, if any
  at timestamptz,
  first_seen timestamptz not null default now(),
  primary key (platform, post_id, person_key, kind),
  foreign key (platform, person_key) references public.crm_social_people (platform, person_key) on delete cascade
);
create index crm_social_engagements_person on public.crm_social_engagements (platform, person_key);

-- Each automatic run: what it found, what it cost, and any error, so the page can say "last checked 2 hours ago".
create table public.crm_sync_runs (
  id bigint generated always as identity primary key,
  platform text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb not null default '{}',
  error text not null default ''
);

-- ───────── access: team members read everything; they may change a person's fit or link them to a lead ─────────
alter table public.crm_social_posts enable row level security;
alter table public.crm_social_checks enable row level security;
alter table public.crm_social_people enable row level security;
alter table public.crm_social_engagements enable row level security;
alter table public.crm_sync_runs enable row level security;

create policy team_read on public.crm_social_posts for select to authenticated using ((select public.crm_is_member()));
create policy team_read on public.crm_social_checks for select to authenticated using ((select public.crm_is_member()));
create policy team_read on public.crm_social_people for select to authenticated using ((select public.crm_is_member()));
create policy team_edit on public.crm_social_people for update to authenticated using ((select public.crm_is_member())) with check ((select public.crm_is_member()));
create policy team_read on public.crm_social_engagements for select to authenticated using ((select public.crm_is_member()));
create policy team_read on public.crm_sync_runs for select to authenticated using ((select public.crm_is_member()));

revoke all on public.crm_social_posts, public.crm_social_checks, public.crm_social_people, public.crm_social_engagements, public.crm_sync_runs from anon, authenticated;
grant select on public.crm_social_posts, public.crm_social_checks, public.crm_social_people, public.crm_social_engagements, public.crm_sync_runs to authenticated;
grant update (fit, why, fit_by, lead_id) on public.crm_social_people to authenticated;

-- What the automation does, editable on the Setup page. Who we sell to is filled in by setup.mjs from crm/config.json.
insert into public.crm_lead_settings (key, value) values
  ('automation', '{"linkedin_profile":"","icp":"","add_hot":true,"add_warm":false,"enabled":true}')
on conflict (key) do nothing;
