-- The automation's own notes ("Found automatically …") are not a touch: last_touch means someone on the team did something,
-- so a new hot lead shows as "not contacted yet" until they do.
create or replace function public.crm_lead_events_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('note', 'call', 'message', 'email', 'meeting') and new.by_email <> 'automation' then
    update public.crm_leads set last_touch = new.at where id = new.lead_id and (last_touch is null or last_touch < new.at);
  end if;
  return null;
end $$;
revoke execute on function public.crm_lead_events_touch() from public, anon, authenticated;

-- Leads the automation already added, where nobody on the team has done anything yet.
update public.crm_leads l set last_touch = null
where l.created_by = 'automation' and l.last_touch is not null
  and not exists (select 1 from public.crm_lead_events e where e.lead_id = l.id and e.by_email <> 'automation' and e.kind in ('note', 'call', 'message', 'email', 'meeting'))
  and not exists (select 1 from public.crm_lead_events e where e.lead_id = l.id and e.kind = 'stage');
