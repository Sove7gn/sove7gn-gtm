-- 23 Nov: the email board's first column lists everyone contacted on LinkedIn (invite or DM) or X (DM). Approving a card there sends
-- the person straight through: find + verify the work email, build the seven emails, queue email 1; the bot takes over from there.
alter table public.crm_email_leads drop constraint if exists crm_email_leads_stage;
alter table public.crm_email_leads add constraint crm_email_leads_stage check (stage = any (array['candidate','new','found','ready','approved','active','done','replied','stopped','skipped','no_email','rejected']));
alter table public.crm_email_leads
  add column if not exists via text,                       -- how we reached them: 'LinkedIn invite', 'LinkedIn DM', 'X DM', or a mix
  add column if not exists x_handle text,
  add column if not exists pre_approved boolean not null default false,   -- approved while still a candidate: auto-queued once the email is found and verified
  add column if not exists approved_by text;

-- Follow-ups always come from the inbox that sent email 1: once e1_at is set, the inbox can't be changed.
create or replace function public.crm_email_keep_inbox() returns trigger language plpgsql as $$
begin
  if old.e1_at is not null and old.inbox is not null and new.inbox is distinct from old.inbox then new.inbox := old.inbox; end if;
  return new;
end $$;
drop trigger if exists crm_email_keep_inbox on public.crm_email_leads;
create trigger crm_email_keep_inbox before update on public.crm_email_leads for each row execute function public.crm_email_keep_inbox();
