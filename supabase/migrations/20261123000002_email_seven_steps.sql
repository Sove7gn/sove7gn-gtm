-- 23 Nov: the email sequence grows from 3 to 7 emails (Reyansh's cold email + 6 follow-ups). Days are business days after email 1,
-- kept in settings email_bot.steps_days so they can change without code: [0, 2, 4, 6, 8, 11, 14].
alter table public.crm_email_leads
  add column if not exists e4_at timestamptz, add column if not exists e5_at timestamptz, add column if not exists e6_at timestamptz, add column if not exists e7_at timestamptz,
  add column if not exists msgid4 text, add column if not exists msgid5 text, add column if not exists msgid6 text, add column if not exists msgid7 text;
update public.crm_lead_settings set value = value || jsonb_build_object('steps_days', jsonb_build_array(0, 2, 4, 6, 8, 11, 14))
 where key = 'email_bot' and not (value ? 'steps_days');
