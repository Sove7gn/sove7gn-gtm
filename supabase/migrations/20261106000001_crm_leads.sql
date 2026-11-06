-- Leads (6 Nov): everyone we're talking to, whatever the channel, in one pipeline.
-- Unlike the sheet tabs, these are plain tables the page reads and writes directly; team members only (row level security).

-- ───────── storage ─────────
create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  company text not null default '',
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  x_handle text not null default '',
  linkedin text not null default '',
  instagram text not null default '',
  website text not null default '',
  direction text not null default 'Inbound',      -- Inbound: they came to us. Outbound: we went to them.
  source text not null default '',                -- X, LinkedIn, Instagram, Email, Referral, ... (list in crm_lead_settings)
  source_detail text not null default '',         -- which post, campaign or person it came from
  stage text not null default 'New',              -- one of the stages in crm_lead_settings
  group_name text not null default '',            -- one group per lead
  categories text[] not null default '{}',        -- any number of categories
  pitch text not null default '',                 -- what we're pitching them
  closed_for text not null default '',            -- what they bought, once won
  price numeric,                                  -- deal value
  currency text not null default 'USD',
  pricing_note text not null default '',          -- e.g. "$4,000 a month, 3-month plan"
  next_step text not null default '',
  next_date date,
  owner text not null default '',
  notes text not null default '',
  fields jsonb not null default '{}',             -- custom fields, keyed by the field's key in crm_lead_settings
  origin_key text unique,                         -- set when brought in from X or LinkedIn, so it isn't added twice
  last_touch timestamptz,
  stage_at timestamptz not null default now(),    -- when it entered its current stage (Won this month counts from this)
  archived boolean not null default false,
  created_by text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_leads_live on public.crm_leads (archived, updated_at desc);

-- What happened with each lead, newest last: notes, calls, messages, and every stage change (added by the trigger below).
create table public.crm_lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null default 'note' check (kind in ('note', 'call', 'message', 'email', 'meeting', 'stage', 'created')),
  text text not null default '',
  by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create index crm_lead_events_lead on public.crm_lead_events (lead_id, at);

-- One row per setting: stages, sources, groups, categories, fields (custom fields), currency.
create table public.crm_lead_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────── bookkeeping ─────────
-- A rename on the Setup page (crm_lead_rename below) is not a move, so it neither touches the lead nor logs anything.
create function public.crm_leads_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.stage is distinct from old.stage and coalesce(current_setting('crm.renaming', true), '') <> '1' then
    new.last_touch := now(); new.stage_at := now();
  end if;
  return new;
end $$;
create trigger crm_leads_touch before update on public.crm_leads for each row execute function public.crm_leads_touch();

-- Every new lead and every stage change lands in the lead's history on its own.
create function public.crm_leads_log() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_lead_events (lead_id, kind, text) values (new.id, 'created',
      'Added' || case when new.source <> '' then ' from ' || new.source else '' end || ' as ' || new.stage);
  elsif new.stage is distinct from old.stage and coalesce(current_setting('crm.renaming', true), '') <> '1' then
    insert into public.crm_lead_events (lead_id, kind, text) values (new.id, 'stage', old.stage || ' → ' || new.stage);
  end if;
  return null;
end $$;
create trigger crm_leads_log after insert or update of stage on public.crm_leads for each row execute function public.crm_leads_log();

-- Logging a note, call or message counts as a touch.
create function public.crm_lead_events_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('note', 'call', 'message', 'email', 'meeting') then
    update public.crm_leads set last_touch = new.at where id = new.lead_id and (last_touch is null or last_touch < new.at);
  end if;
  return null;
end $$;
create trigger crm_lead_events_touch after insert on public.crm_lead_events for each row execute function public.crm_lead_events_touch();

-- Renames a stage, source, group or category on every lead that has it (Setup page). Returns how many leads changed.
create function public.crm_lead_rename(kind text, old_name text, new_name text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.crm_is_member() then raise exception 'not on the team'; end if;
  if coalesce(new_name, '') = '' or old_name = new_name then return 0; end if;
  perform set_config('crm.renaming', '1', true);
  if kind = 'stages' then update public.crm_leads set stage = new_name where stage = old_name;
  elsif kind = 'sources' then update public.crm_leads set source = new_name where source = old_name;
  elsif kind = 'groups' then update public.crm_leads set group_name = new_name where group_name = old_name;
  elsif kind = 'categories' then update public.crm_leads set categories = array_replace(categories, old_name, new_name) where old_name = any(categories);
  else raise exception 'unknown kind %', kind;
  end if;
  get diagnostics n = row_count;
  perform set_config('crm.renaming', '', true);
  return n;
end $$;

-- ───────── access: team members only ─────────
alter table public.crm_leads enable row level security;
alter table public.crm_lead_events enable row level security;
alter table public.crm_lead_settings enable row level security;

create policy team on public.crm_leads for all to authenticated
  using ((select public.crm_is_member())) with check ((select public.crm_is_member()));
create policy team on public.crm_lead_events for all to authenticated
  using ((select public.crm_is_member())) with check ((select public.crm_is_member()));
create policy team on public.crm_lead_settings for all to authenticated
  using ((select public.crm_is_member())) with check ((select public.crm_is_member()));

revoke all on public.crm_leads, public.crm_lead_events, public.crm_lead_settings from anon, authenticated;
grant select, insert, update, delete on public.crm_leads, public.crm_lead_settings to authenticated;
grant select, insert, delete on public.crm_lead_events to authenticated;
revoke execute on function public.crm_leads_touch(), public.crm_leads_log(), public.crm_lead_events_touch() from public, anon, authenticated;
revoke execute on function public.crm_lead_rename(text, text, text) from public, anon;
grant execute on function public.crm_lead_rename(text, text, text) to authenticated;

-- ───────── starting settings (all editable on the Setup page) ─────────
insert into public.crm_lead_settings (key, value) values
  ('stages', '[
    {"name":"New","color":"var(--ink-4)","kind":"open"},
    {"name":"Contacted","color":"var(--out)","kind":"open"},
    {"name":"In talks","color":"var(--mid)","kind":"open"},
    {"name":"Proposal sent","color":"var(--warn)","kind":"open"},
    {"name":"Won","color":"var(--ok)","kind":"won"},
    {"name":"Lost","color":"var(--bad)","kind":"lost"}]'),
  ('sources', '["X","LinkedIn","Instagram","Email","Referral","Website","Other"]'),
  ('groups', '[]'),
  ('categories', '[]'),
  ('fields', '[]'),
  ('currency', '"USD"')
on conflict (key) do nothing;
