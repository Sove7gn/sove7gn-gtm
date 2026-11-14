-- X growth to 10K (15 Nov). Two tables for the x-grow job and the 10K plan page:
--   crm_x_reply: fresh posts from GTM creators and our funded-founder leads, to reply to (Replied / Skip from the CRM).
--   crm_x_followers: every follower we've seen, so new followers are found and judged once (they go to Post Engagers as "Followed").
-- Our Posts gets a Funnel column (AC): Reach (top of funnel), Trust (middle) or Convert (bottom). Safe to re-run.

create table if not exists public.crm_x_reply (
  url text primary key,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  author text not null default '',
  name text not null default '',
  followers int,
  kind text not null default 'creator' check (kind in ('creator', 'lead')),
  post_text text not null default '',
  posted_at timestamptz,
  views int, likes int, replies int,
  status text not null default 'new' check (status in ('new', 'done', 'skipped')),
  done_by text not null default '',
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_x_reply_day on public.crm_x_reply (day desc);
alter table public.crm_x_reply enable row level security;
drop policy if exists team_read on public.crm_x_reply;
drop policy if exists team_edit on public.crm_x_reply;
create policy team_read on public.crm_x_reply for select to authenticated using ((select public.crm_is_member()));
create policy team_edit on public.crm_x_reply for update to authenticated using ((select public.crm_is_member())) with check ((select public.crm_is_member()));
revoke all on public.crm_x_reply from anon, authenticated;
grant select on public.crm_x_reply to authenticated;
grant update (status, done_by, done_at) on public.crm_x_reply to authenticated;

create table if not exists public.crm_x_followers (
  id text primary key,
  handle text not null default '',
  name text not null default '',
  followers int,
  judged boolean not null default false,
  seen_at timestamptz not null default now()
);
alter table public.crm_x_followers enable row level security;
drop policy if exists team_read on public.crm_x_followers;
create policy team_read on public.crm_x_followers for select to authenticated using ((select public.crm_is_member()));
revoke all on public.crm_x_followers from anon, authenticated;
grant select on public.crm_x_followers to authenticated;

update public.crm_sheet set cells[29] = 'Funnel' where tab = 'Our Posts' and row = 3;
