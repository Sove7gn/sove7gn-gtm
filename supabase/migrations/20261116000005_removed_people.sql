-- (16 Nov) Remove a person: they go to the Trash and the bots and the CRM never touch them again.
-- A removed person is matched by lead id, LinkedIn id (urn or profile id) or X handle. Triggers keep them out:
-- their lead stays archived, and any new LinkedIn/X task or X post reply for them is skipped as it's written.
create table if not exists public.crm_removed (
  id bigserial primary key,
  lead_id uuid,
  li_urn text not null default '',
  li_pid text not null default '',
  x text not null default '',
  name text not null default '',
  why text not null default '',
  removed_by text not null default '',
  removed_at timestamptz not null default now()
);
alter table public.crm_removed enable row level security;
drop policy if exists team_read on public.crm_removed;
drop policy if exists team_add on public.crm_removed;
drop policy if exists team_del on public.crm_removed;
create policy team_read on public.crm_removed for select to authenticated using ((select public.crm_is_member()));
create policy team_add on public.crm_removed for insert to authenticated with check ((select public.crm_is_member()));
create policy team_del on public.crm_removed for delete to authenticated using ((select public.crm_is_member()));

create or replace function public.crm_is_removed(p_lead uuid, p_urn text, p_link text, p_x text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_removed r where
    (p_lead is not null and r.lead_id = p_lead)
    or (r.li_urn <> '' and lower(coalesce(p_urn, '')) = r.li_urn)
    or (r.li_pid <> '' and lower(coalesce(p_link, '')) like '%/in/' || r.li_pid || '%')
    or (r.x <> '' and lower(regexp_replace(coalesce(p_x, ''), '^@', '')) = r.x));
$$;

create or replace function public.crm_keep_removed_lead() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.archived and public.crm_is_removed(new.id, new.fields->'li'->>'urn', new.linkedin, new.x_handle) then new.archived := true; end if;
  return new;
end $$;
drop trigger if exists crm_keep_removed_lead on public.crm_leads;
create trigger crm_keep_removed_lead before insert or update on public.crm_leads for each row execute function public.crm_keep_removed_lead();

create or replace function public.crm_skip_removed_li_task() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('review', 'ready', 'sending') and exists (select 1 from public.crm_leads l where l.id = new.lead_id and public.crm_is_removed(l.id, l.fields->'li'->>'urn', l.linkedin, l.x_handle)) then
    new.status := 'skipped'; new.error := 'Removed from the CRM'; end if;
  return new;
end $$;
drop trigger if exists crm_skip_removed_li_task on public.crm_li_tasks;
create trigger crm_skip_removed_li_task before insert or update on public.crm_li_tasks for each row execute function public.crm_skip_removed_li_task();

create or replace function public.crm_skip_removed_x_task() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('review', 'ready', 'sending') and coalesce(new.handle, '') <> '' and public.crm_is_removed(null, null, null, new.handle) then
    new.status := 'skipped'; new.error := 'Removed from the CRM'; end if;
  return new;
end $$;
drop trigger if exists crm_skip_removed_x_task on public.crm_x_tasks;
create trigger crm_skip_removed_x_task before insert or update on public.crm_x_tasks for each row execute function public.crm_skip_removed_x_task();

create or replace function public.crm_skip_removed_x_reply() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('new', 'approved', 'sending') and public.crm_is_removed(null, null, null, new.author) then
    new.status := 'skipped'; new.error := 'Removed from the CRM'; end if;
  return new;
end $$;
drop trigger if exists crm_skip_removed_x_reply on public.crm_x_reply;
create trigger crm_skip_removed_x_reply before insert or update on public.crm_x_reply for each row execute function public.crm_skip_removed_x_reply();
