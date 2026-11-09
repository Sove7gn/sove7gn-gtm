-- Engagement (9 Nov): every morning the li-engage job picks 10 recent LinkedIn posts by B2B founders and writes a genuine
-- comment for each (no pitch). The team copies the comment, posts it on LinkedIn, and marks it done or skips it.
create table public.crm_li_suggest (
  url text primary key,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  author text not null default '',
  author_url text not null default '',
  headline text not null default '',
  company text not null default '',
  post_text text not null default '',
  posted_at timestamptz,
  comment text not null default '',
  status text not null default 'new' check (status in ('new', 'done', 'skipped')),
  done_by text not null default '',
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index crm_li_suggest_day on public.crm_li_suggest (day desc);
alter table public.crm_li_suggest enable row level security;
create policy team_read on public.crm_li_suggest for select to authenticated using ((select public.crm_is_member()));
create policy team_edit on public.crm_li_suggest for update to authenticated using ((select public.crm_is_member())) with check ((select public.crm_is_member()));
revoke all on public.crm_li_suggest from anon, authenticated;
grant select on public.crm_li_suggest to authenticated;
grant update (comment, status, done_by, done_at) on public.crm_li_suggest to authenticated;
