-- LinkedIn bot (11 Nov): a Chrome extension in Reyansh's own Chrome does the LinkedIn work (connection requests with a note,
-- the first DM, daily follow-ups, spotting accepts and replies) and the li-bot function decides what to send next.
-- Every message the bot will send is a row here first. In Review mode it waits for Approve on LinkedIn > Outreach;
-- in Auto mode it goes out on the extension's next run.

create table if not exists public.crm_li_tasks (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  kind text not null check (kind in ('invite', 'dm', 'followup', 'inmail')),
  step int not null default 0,                -- follow-up number (1 to 7); 0 for the rest
  text text not null default '',              -- exactly what will be sent
  subject text not null default '',           -- InMail only
  status text not null default 'review' check (status in ('review', 'ready', 'sending', 'sent', 'failed', 'skipped')),
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  decided_by text not null default '',
  unique (lead_id, kind, step)
);
create index if not exists crm_li_tasks_open on public.crm_li_tasks (status, created_at);

alter table public.crm_li_tasks enable row level security;
drop policy if exists team_read on public.crm_li_tasks;
drop policy if exists team_edit on public.crm_li_tasks;
create policy team_read on public.crm_li_tasks for select to authenticated using ((select public.crm_is_member()));
create policy team_edit on public.crm_li_tasks for update to authenticated using ((select public.crm_is_member())) with check ((select public.crm_is_member()));
revoke all on public.crm_li_tasks from anon, authenticated;
grant select on public.crm_li_tasks to authenticated;
grant update (text, subject, status, decided_by) on public.crm_li_tasks to authenticated;

-- The bot's settings and messages (editable on LinkedIn > Outreach), and what the extension last reported.
insert into public.crm_lead_settings (key, value) values ('li_bot', jsonb_build_object(
  'mode', 'review', 'paused', false, 'include_warm', false,
  'week_cap', 150, 'notes_month', 250, 'followups', 7, 'gap_days', 1,
  'hours', jsonb_build_object('from', 10, 'to', 24),
  'note', 'Hey {first}, {hook} I had a look at your {where} and have 3 small ideas that could bring in more inbound. Wanted to send them over :D',
  'dm1', E'Hey {first}, saw you engage with my recent post & thought I''d reach out.\n\nI''m Reyansh. Been building startups for the past couple of years and was also featured on Shark Tank.\n\nCurrently building something of my own in GTM space and would love to hear your thoughts and get some advice. Open to a 15-minute call sometime this week?',
  'fu', jsonb_build_array(
    'Hey {first}, if it''s easier, you can go ahead and book a slot here, looking forward to it. https://cal.com/sove7gn-gtm/30min',
    'Just bumping this up in case it got buried.',
    'Quick one: who handles growth at {company} right now, you or someone on the team?',
    'Happy to send the 3 ideas over in text if a call is too much this week. Want them?',
    'Curious how {company} is getting new customers right now. Mostly referrals, or outbound too?',
    'No worries if the timing''s off. Would next week work better for a quick chat?',
    'Last nudge from me, {first}. If inbound becomes a priority, the link''s here: https://cal.com/sove7gn-gtm/30min. Rooting for {company}.')
)) on conflict (key) do nothing;
insert into public.crm_lead_settings (key, value) values ('li_bot_status', '{}'::jsonb) on conflict (key) do nothing;
