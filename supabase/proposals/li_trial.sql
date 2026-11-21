-- PROPOSAL, NOT APPLIED (22 Nov). LinkedIn assistant trial: a small set of new people Reyansh picks, worked by the assistant
-- (Instinct) instead of the Chrome extension. Lives in supabase/proposals/ on purpose: supabase/setup.mjs applies everything in
-- supabase/migrations/, so this file only moves there after Reyansh confirms.
--
-- Isolation from the extension (checked in supabase/functions/li-bot/index.ts):
--   * The extension's work comes only from crm_li_tasks, handed out by plan() and claim(). Neither function, nor anything else
--     in li-bot, reads crm_li_trial, so trial rows can never be handed to the extension.
--   * plan() only writes crm_li_tasks for people in crm_leads. Trial people are NOT added to crm_leads.
--   * The remaining risk is a trial person entering crm_leads by another door (they view Reyansh's profile, like a post, etc.).
--     crm_li_trial_guard (below) marks any such lead "by hand" + archived the moment it is created, which plan() already skips
--     (it checks archived and fields.li.stop = 'by hand' before writing or handing out anything).
--
-- Execution model:
--   * Reyansh adds and approves people in the CRM (team RPCs below, checked with crm_is_member()).
--   * The assistant never gets database keys. It talks to a small proposed Edge Function (li-trial) with its own executor key;
--     that function calls the executor RPCs below, which only the service role may run.
--   * Stages move only on reported, verified events. Nothing moves because time passed.

create table if not exists public.crm_li_trial (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  role text not null default '',
  company text not null default '',
  profile_url text not null,                         -- https://www.linkedin.com/in/<id>
  profile_key text not null,                         -- lower-case <id> from the URL: the recipient for the void check
  account_key text not null default 'reyansh-linkedin',
  texts jsonb not null default '{}'::jsonb,          -- {note, day0, fu3, fu5, fu8, fu12}: the exact texts, final, no placeholders
  schedule jsonb not null default '{"fu3":3,"fu5":5,"fu8":8,"fu12":12}'::jsonb,   -- days after the Day 0 message was SEEN sent
  stage text not null default 'ready',
  -- ready -> approved -> request_sent -> accepted -> day0_sent -> fu3_sent -> fu5_sent -> fu8_sent -> closed
  -- any active stage -> replied (stops everything) ; ended (Reyansh stopped it) ; withdrawn (request taken back)
  approved_at timestamptz, approved_by text, approved_hash text, approved_snapshot jsonb,
  action text,                                       -- what the executor is doing now: send_request, send_day0, send_fu3, ...
  action_state text not null default 'idle',         -- idle | claimed | sending | unknown | failed
  action_error text,
  claimed_by text, claimed_at timestamptz,
  request_seen_at timestamptz, accepted_seen_at timestamptz, day0_seen_at timestamptz,
  fu3_seen_at timestamptz, fu5_seen_at timestamptz, fu8_seen_at timestamptz, fu12_seen_at timestamptz,
  replied_seen_at timestamptz, reply_text text, answered_at timestamptz,
  last_checked_at timestamptz, last_checked_by text,
  constraint crm_li_trial_stage check (stage in ('ready','approved','request_sent','accepted','day0_sent','fu3_sent','fu5_sent','fu8_sent','closed','replied','ended','withdrawn')),
  constraint crm_li_trial_action_state check (action_state in ('idle','claimed','sending','unknown','failed')),
  constraint crm_li_trial_profile unique (profile_key)
);

create table if not exists public.crm_li_trial_events (
  id bigint generated always as identity primary key,
  trial_id uuid not null references public.crm_li_trial(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,                               -- 'reyansh' | 'executor:<name>' | 'system'
  event text not null,
  detail jsonb not null default '{}'::jsonb
);

alter table public.crm_li_trial enable row level security;
alter table public.crm_li_trial_events enable row level security;
drop policy if exists team_read on public.crm_li_trial;
drop policy if exists team_read on public.crm_li_trial_events;
create policy team_read on public.crm_li_trial for select to authenticated using ((select public.crm_is_member()));
create policy team_read on public.crm_li_trial_events for select to authenticated using ((select public.crm_is_member()));
grant select on public.crm_li_trial, public.crm_li_trial_events to authenticated;
-- No insert/update/delete grants: every change goes through the functions below.

-- Settings row: executor status and channel pause. No timer fields on purpose (no auto-resume).
insert into public.crm_lead_settings (key, value)
values ('li_trial', '{"executor":"unverified","state":"active","test_item_id":null,"first_test_ok_at":null}'::jsonb)
on conflict (key) do nothing;

create or replace function public.crm_li_trial_log(p_id uuid, p_actor text, p_event text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into crm_li_trial_events (trial_id, actor, event, detail) values (p_id, p_actor, p_event, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function public.crm_li_trial_log(uuid, text, text, jsonb) from public, anon, authenticated;

-- What an approval covers: recipient, account, every text, the schedule and the stop rules. Changing any of it voids it.
create or replace function public.crm_li_trial_scope(t public.crm_li_trial)
returns jsonb language sql immutable as $$
  select jsonb_build_object('recipient', t.profile_key, 'profile_url', t.profile_url, 'name', t.name, 'account', t.account_key,
    'texts', t.texts, 'schedule', t.schedule,
    'stops', jsonb_build_array('Any reply from them stops everything and goes to Reyansh.',
                               'The Day 12 message is the last one; the sequence then ends.',
                               'A platform warning or security page pauses the channel until Reyansh resumes it.'));
$$;
create or replace function public.crm_li_trial_hash(s jsonb)
returns text language sql immutable as $$ select encode(sha256(convert_to(s::text, 'UTF8')), 'hex'); $$;

-- ───────── Reyansh (team) ─────────
create or replace function public.crm_li_trial_add(p_name text, p_role text, p_company text, p_profile_url text, p_texts jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare k text; v_id uuid;
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  k := lower(regexp_replace(split_part(split_part(p_profile_url, '/in/', 2), '?', 1), '/+$', ''));
  if k = '' then raise exception 'profile_url must be a linkedin.com/in/ link'; end if;
  -- never a person the extension's pipeline already has (it could message them too)
  if exists (select 1 from crm_leads l where not l.archived and lower(rtrim(split_part(l.linkedin, '/in/', 2), '/')) = k) then
    raise exception 'This person is already in the main LinkedIn pipeline. Pick someone new for the trial.';
  end if;
  insert into crm_li_trial (name, role, company, profile_url, profile_key, texts)
  values (p_name, coalesce(p_role,''), coalesce(p_company,''), p_profile_url, k, coalesce(p_texts,'{}'::jsonb)) returning id into v_id;
  perform crm_li_trial_log(v_id, 'reyansh', 'added', jsonb_build_object('profile_url', p_profile_url));
  return v_id;
end $$;

create or replace function public.crm_li_trial_edit(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t crm_li_trial;
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  select * into t from crm_li_trial where id = p_id for update;
  if t.stage not in ('ready','approved') then raise exception 'Texts are locked once the request has gone out.'; end if;
  if t.action_state <> 'idle' then raise exception 'The assistant is working on this card right now.'; end if;
  update crm_li_trial set
    name = coalesce(p_patch->>'name', name), role = coalesce(p_patch->>'role', role), company = coalesce(p_patch->>'company', company),
    account_key = coalesce(p_patch->>'account_key', account_key),
    texts = case when p_patch ? 'texts' then texts || (p_patch->'texts') else texts end,
    stage = 'ready', approved_at = null, approved_by = null, approved_hash = null, approved_snapshot = null, updated_at = now()
  where id = p_id;
  perform crm_li_trial_log(p_id, 'reyansh', case when t.stage = 'approved' then 'approval voided by an edit' else 'edited' end, p_patch);
end $$;

create or replace function public.crm_li_trial_approve(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare t crm_li_trial; s jsonb; k text;
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  select * into t from crm_li_trial where id = p_id for update;
  if t.stage <> 'ready' then raise exception 'Only a card in Ready to approve can be approved.'; end if;
  foreach k in array array['note','day0','fu3','fu5','fu8','fu12'] loop
    if coalesce(t.texts->>k, '') = '' then raise exception 'Text % is empty.', k; end if;
    if (t.texts->>k) ~ '\{[a-z_0-9]+\}|\[[^\]]+\]' then raise exception 'Text % still has a placeholder.', k; end if;
  end loop;
  if length(t.texts->>'note') > 300 then raise exception 'The connection note is over 300 characters.'; end if;
  s := crm_li_trial_scope(t);
  update crm_li_trial set stage = 'approved', approved_at = now(), approved_by = 'reyansh', approved_snapshot = s,
    approved_hash = crm_li_trial_hash(s), updated_at = now() where id = p_id;
  perform crm_li_trial_log(p_id, 'reyansh', 'approved', jsonb_build_object('hash', crm_li_trial_hash(s)));
  return crm_li_trial_hash(s);
end $$;

-- Unknown outcome: only a person can say what happened.
create or replace function public.crm_li_trial_resolve(p_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare t crm_li_trial;
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  select * into t from crm_li_trial where id = p_id for update;
  if t.action_state <> 'unknown' then raise exception 'This card is not waiting for reconciliation.'; end if;
  if p_outcome = 'sent' then perform crm_li_trial_apply_sent(p_id, 'reyansh', jsonb_build_object('how', 'confirmed by Reyansh in the thread'));
  elsif p_outcome = 'not_sent' then
    update crm_li_trial set action_state = 'failed', action_error = 'Confirmed not sent', claimed_by = null, updated_at = now() where id = p_id;
    perform crm_li_trial_log(p_id, 'reyansh', 'reconciled: not sent', '{}'::jsonb);
  else raise exception 'outcome must be sent or not_sent'; end if;
end $$;

create or replace function public.crm_li_trial_retry(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  update crm_li_trial set action_state = 'idle', action = null, action_error = null, updated_at = now() where id = p_id and action_state = 'failed';
  if not found then raise exception 'Only a failed card can be retried.'; end if;
  perform crm_li_trial_log(p_id, 'reyansh', 'retry', '{}'::jsonb);
end $$;

create or replace function public.crm_li_trial_stop(p_id uuid, p_why text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  update crm_li_trial set stage = 'ended', updated_at = now() where id = p_id and action_state in ('idle','failed');
  if not found then raise exception 'Can''t end it while a send is in progress or unresolved.'; end if;
  perform crm_li_trial_log(p_id, 'reyansh', 'ended', jsonb_build_object('why', p_why));
end $$;

create or replace function public.crm_li_trial_answered(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  update crm_li_trial set answered_at = now(), updated_at = now() where id = p_id and stage = 'replied';
  perform crm_li_trial_log(p_id, 'reyansh', 'answered', '{}'::jsonb);
end $$;

create or replace function public.crm_li_trial_resume()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not crm_is_member() then raise exception 'not allowed'; end if;
  update crm_lead_settings set value = value || '{"state":"active","paused_reason":null}'::jsonb where key = 'li_trial';
end $$;

-- ───────── executor (service role only, via the proposed li-trial Edge Function) ─────────
-- One atomic claim: the single next due send, locked with FOR UPDATE SKIP LOCKED so no two workers ever get the same card.
-- Due = an evidence-based stage plus, for follow-ups, the schedule measured from when Day 0 was SEEN sent.
-- Until the executor is verified, only the one test card Reyansh names (li_trial.test_item_id) can be claimed.
create or replace function public.crm_li_trial_claim(p_executor text)
returns setof public.crm_li_trial language plpgsql security definer set search_path = public as $$
declare cfg jsonb; v_id uuid; v_action text;
begin
  select value into cfg from crm_lead_settings where key = 'li_trial';
  if coalesce(cfg->>'state','active') <> 'active' then return; end if;
  if exists (select 1 from crm_li_trial where action_state = 'unknown') then return; end if;   -- an unresolved send holds the channel
  select t.id, case
      when t.stage = 'approved' then 'send_request'
      when t.stage = 'accepted' then 'send_day0'
      when t.stage = 'day0_sent' and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu3')::int) then 'send_fu3'
      when t.stage = 'fu3_sent'  and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu5')::int) then 'send_fu5'
      when t.stage = 'fu5_sent'  and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu8')::int) then 'send_fu8'
      when t.stage = 'fu8_sent'  and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu12')::int) then 'send_fu12'
    end
    into v_id, v_action
  from crm_li_trial t
  where t.action_state = 'idle' and t.approved_hash is not null and t.approved_hash = crm_li_trial_hash(crm_li_trial_scope(t))
    and (coalesce(cfg->>'executor','unverified') = 'verified' or t.id::text = cfg->>'test_item_id')
    and (t.stage in ('approved','accepted')
      or (t.stage = 'day0_sent' and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu3')::int))
      or (t.stage = 'fu3_sent'  and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu5')::int))
      or (t.stage = 'fu5_sent'  and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu8')::int))
      or (t.stage = 'fu8_sent'  and now() >= t.day0_seen_at + make_interval(days => (t.schedule->>'fu12')::int)))
  order by t.approved_at
  limit 1
  for update skip locked;
  if v_id is null then return; end if;
  update crm_li_trial set action = v_action, action_state = 'claimed', claimed_by = p_executor, claimed_at = now(), updated_at = now() where id = v_id;
  perform crm_li_trial_log(v_id, 'executor:' || p_executor, 'claimed', jsonb_build_object('action', v_action));
  return query select * from crm_li_trial where id = v_id;
end $$;

-- A verified send moves the stage. Called by report('sent_verified') and by resolve('sent').
create or replace function public.crm_li_trial_apply_sent(p_id uuid, p_actor text, p_evidence jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t crm_li_trial;
begin
  select * into t from crm_li_trial where id = p_id for update;
  update crm_li_trial set
    stage = case t.action when 'send_request' then 'request_sent' when 'send_day0' then 'day0_sent' when 'send_fu3' then 'fu3_sent'
                          when 'send_fu5' then 'fu5_sent' when 'send_fu8' then 'fu8_sent' when 'send_fu12' then 'closed' else stage end,
    request_seen_at = case when t.action = 'send_request' then now() else request_seen_at end,
    day0_seen_at = case when t.action = 'send_day0' then now() else day0_seen_at end,
    fu3_seen_at = case when t.action = 'send_fu3' then now() else fu3_seen_at end,
    fu5_seen_at = case when t.action = 'send_fu5' then now() else fu5_seen_at end,
    fu8_seen_at = case when t.action = 'send_fu8' then now() else fu8_seen_at end,
    fu12_seen_at = case when t.action = 'send_fu12' then now() else fu12_seen_at end,
    action_state = 'idle', action = null, action_error = null, claimed_by = null, updated_at = now()
  where id = p_id;
  perform crm_li_trial_log(p_id, p_actor, 'sent, verified: ' || coalesce(t.action, '?'), coalesce(p_evidence, '{}'::jsonb));
end $$;

-- Everything the executor sees or does, reported as one event. Stages move only here, on evidence.
create or replace function public.crm_li_trial_report(p_id uuid, p_executor text, p_event text, p_evidence jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t crm_li_trial; want text; actor text := 'executor:' || p_executor;
begin
  select * into t from crm_li_trial where id = p_id for update;
  if not found then raise exception 'no such card'; end if;
  if p_event = 'sending' then
    if t.action_state <> 'claimed' or t.claimed_by <> p_executor then raise exception 'not claimed by you'; end if;
    update crm_li_trial set action_state = 'sending', updated_at = now() where id = p_id;
  elsif p_event = 'sent_verified' then
    if t.action_state <> 'sending' or t.claimed_by <> p_executor then raise exception 'not sending'; end if;
    want := t.approved_snapshot->'texts'->>(replace(t.action, 'send_', ''));
    if t.action = 'send_request' then want := t.approved_snapshot->'texts'->>'note'; end if;
    if coalesce(p_evidence->>'sent_text', '') <> coalesce(want, '') then
      update crm_li_trial set action_state = 'unknown', action_error = 'The text seen in LinkedIn does not match the approved text', updated_at = now() where id = p_id;
      perform crm_li_trial_log(p_id, actor, 'unknown: text mismatch', p_evidence); return;
    end if;
    perform crm_li_trial_apply_sent(p_id, actor, p_evidence); return;
  elsif p_event = 'failed_known' then
    if t.action_state not in ('claimed','sending') then raise exception 'nothing in progress'; end if;
    update crm_li_trial set action_state = 'failed', action_error = coalesce(p_evidence->>'reason','failed'), claimed_by = null, updated_at = now() where id = p_id;
  elsif p_event = 'unknown' then
    update crm_li_trial set action_state = 'unknown', action_error = coalesce(p_evidence->>'reason','unknown outcome'), updated_at = now() where id = p_id;
  elsif p_event = 'released' then                    -- claimed, then decided not to send (e.g. the pre-send thread check)
    if t.action_state <> 'claimed' then raise exception 'not claimed'; end if;
    update crm_li_trial set action_state = 'idle', action = null, claimed_by = null, updated_at = now() where id = p_id;
  elsif p_event = 'accepted_seen' then
    if t.stage <> 'request_sent' then raise exception 'not waiting for an accept'; end if;
    update crm_li_trial set stage = 'accepted', accepted_seen_at = now(), updated_at = now() where id = p_id;
  elsif p_event = 'reply_seen' then
    if t.action_state in ('sending','unknown') then raise exception 'resolve the send first'; end if;
    update crm_li_trial set stage = 'replied', replied_seen_at = now(), reply_text = p_evidence->>'text',
      action_state = 'idle', action = null, claimed_by = null, updated_at = now()
    where id = p_id and stage in ('request_sent','accepted','day0_sent','fu3_sent','fu5_sent','fu8_sent','closed','approved');
  elsif p_event = 'checked' then
    null;
  elsif p_event = 'platform_warning' then
    update crm_lead_settings set value = value || jsonb_build_object('state','paused_needs_review','paused_reason', coalesce(p_evidence->>'what','platform warning'),'paused_at', now()) where key = 'li_trial';
    if t.action_state in ('claimed','sending') then update crm_li_trial set action_state = 'unknown', action_error = 'Platform warning during the send', updated_at = now() where id = p_id; end if;
  else raise exception 'unknown event %', p_event; end if;
  update crm_li_trial set last_checked_at = now(), last_checked_by = p_executor where id = p_id;
  perform crm_li_trial_log(p_id, actor, p_event, p_evidence);
end $$;

revoke all on function public.crm_li_trial_claim(text) from public, anon, authenticated;
revoke all on function public.crm_li_trial_report(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.crm_li_trial_apply_sent(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.crm_li_trial_claim(text), public.crm_li_trial_report(uuid, text, text, jsonb) to service_role;
grant execute on function public.crm_li_trial_add(text, text, text, text, jsonb), public.crm_li_trial_edit(uuid, jsonb),
  public.crm_li_trial_approve(uuid), public.crm_li_trial_resolve(uuid, text), public.crm_li_trial_retry(uuid),
  public.crm_li_trial_stop(uuid, text), public.crm_li_trial_answered(uuid), public.crm_li_trial_resume() to authenticated;

-- The guard: a trial person who enters the main pipeline by another door (viewed the profile, liked a post...) is marked
-- "by hand" and archived at once, so the extension's planner (which skips both) never writes or sends anything to them.
create or replace function public.crm_li_trial_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'LinkedIn' and exists (select 1 from crm_li_trial t where t.profile_key = lower(rtrim(split_part(coalesce(new.linkedin,''), '/in/', 2), '/'))) then
    new.archived := true;
    new.fields := coalesce(new.fields, '{}'::jsonb) || jsonb_build_object('li', coalesce(new.fields->'li', '{}'::jsonb) || '{"stop":"by hand","trial":true}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists crm_li_trial_guard on public.crm_leads;
create trigger crm_li_trial_guard before insert on public.crm_leads for each row execute function public.crm_li_trial_guard();
