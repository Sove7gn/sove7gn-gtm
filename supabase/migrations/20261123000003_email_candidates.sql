-- 23 Nov: the email board's first column lists everyone contacted on LinkedIn (invite or DM) or X (DM). Approving a card there sends
-- the person straight through: find + verify the work email, build the seven emails, queue email 1; the bot takes over from there.
alter table public.crm_email_leads drop constraint if exists crm_email_leads_stage;
alter table public.crm_email_leads add constraint crm_email_leads_stage check (stage = any (array['candidate','new','found','ready','approved','active','done','replied','stopped','skipped','no_email','rejected']));
alter table public.crm_email_leads
  add column if not exists via text,                       -- how we reached them: 'LinkedIn invite', 'LinkedIn DM', 'X DM', or a mix
  add column if not exists x_handle text,
  add column if not exists pre_approved boolean not null default false,   -- approved while still a candidate: auto-queued once the email is found and verified
  add column if not exists approved_by text;
