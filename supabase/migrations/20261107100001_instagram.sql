-- Instagram DMs into Leads (7 Nov): the ig-sync Edge Function reads the DMs of our Instagram accounts (through Composio)
-- every hour. A thread counts once we've sent them our booking link or phone number. Then the person is checked (1,000+
-- followers, not someone looking for clipping work, not one of us) and added to Leads, and every message after that goes into
-- the lead's history, with the next step (reply, follow up, waiting) kept up to date.

-- One row per DM thread we've given our link or number in, kept or filtered out, and why.
create table public.crm_ig_threads (
  account text not null,                  -- our Instagram account, e.g. reyanshbuilds
  thread_id text not null,
  handle text not null default '',        -- their username
  igsid text not null default '',         -- their id as this account sees it
  name text not null default '',
  followers int,                          -- null when Instagram didn't say
  status text not null default 'kept' check (status in ('kept', 'filtered')),
  why text not null default '',           -- why it was filtered out ("Under 1,000 followers (412)")
  status_by text not null default 'auto', -- 'auto', or the email of whoever changed it by hand
  lead_id uuid references public.crm_leads (id) on delete set null,
  qualified_at timestamptz,               -- when we sent our link or number
  last_them timestamptz,                  -- their latest message
  last_us timestamptz,                    -- our latest message
  logged_to timestamptz,                  -- messages up to here are in the lead's history
  updated_time timestamptz,               -- the thread's own "last changed"
  first_seen timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  primary key (account, thread_id)
);
create index crm_ig_threads_lead on public.crm_ig_threads (lead_id);

alter table public.crm_ig_threads enable row level security;
create policy team_read on public.crm_ig_threads for select to authenticated using ((select public.crm_is_member()));
create policy team_edit on public.crm_ig_threads for update to authenticated using ((select public.crm_is_member())) with check ((select public.crm_is_member()));
revoke all on public.crm_ig_threads from anon, authenticated;
grant select on public.crm_ig_threads to authenticated;
grant update (status, why, status_by, lead_id) on public.crm_ig_threads to authenticated;

-- Their messages are logged under "<handle>@ig-contact": a message from them is not something the team did, so it is not a
-- touch. Our own replies ("<account>@instagram") are.
create or replace function public.crm_lead_events_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('note', 'call', 'message', 'email', 'meeting') and new.by_email <> 'automation' and new.by_email not like '%@ig-contact' then
    update public.crm_leads set last_touch = new.at where id = new.lead_id and (last_touch is null or last_touch < new.at);
  end if;
  return null;
end $$;
revoke execute on function public.crm_lead_events_touch() from public, anon, authenticated;

-- A "Call booked" stage right after "In talks" (left alone if it's already there or was renamed).
update public.crm_lead_settings s set value = (
  select jsonb_agg(x.e order by x.o) from (
    select t.e, t.o::numeric as o from jsonb_array_elements(s.value) with ordinality as t(e, o)
    union all
    select '{"name":"Call booked","color":"var(--in)","kind":"open"}'::jsonb,
      coalesce((select t.o from jsonb_array_elements(s.value) with ordinality as t(e, o) where t.e ->> 'name' = 'In talks'), 1) + 0.5
  ) x), updated_at = now()
where s.key = 'stages' and not exists (select 1 from jsonb_array_elements(s.value) e where e ->> 'name' = 'Call booked');

-- What the Instagram job does, editable later on the Setup page. Where it has got to is kept apart (instagram_sync),
-- so saving settings never resets it.
insert into public.crm_lead_settings (key, value) values
  ('instagram', '{"enabled":true,"accounts":["reyanshbuilds","sove7gn"],"min_followers":1000,
    "our_links":["calendly.com/founders-sove7gn"],"our_phones":["8800506622","8708856875"],
    "ignore":["namanz11","reyanshj._","sove7gn","sove7gn.clips","reyanshbuilds"],"follow_up_days":2,"backfill_days":30}'),
  ('instagram_sync', '{}')
on conflict (key) do nothing;
