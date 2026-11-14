-- 15 Nov: reply drafts for the posts to reply to (written by x-grow), and the W1 "warm" DM script whose follow-ups the X bot
-- uses for people who replied to, commented on or followed us. W1 is Off so the lead finder never gives it to cold leads.
alter table public.crm_x_reply add column if not exists draft text not null default '';

insert into public.crm_sheet (tab, row, cells)
select 'DM Templates', (select max(row) + 1 from public.crm_sheet where tab = 'DM Templates'),
  array['W1', 'Reyansh', 'Warm', 'People who replied to, commented on or followed us. Sent by the X bot on its own (x-grow).',
    '(written for each person by x-grow)', 'Hey [first name], no rush at all. Curious how you''re getting customers at [company] right now?',
    'Last one from me. If it''s easier to talk it through, here''s my calendar: cal.com/sove7gn-gtm/30min', '', '', '', '', '', 'Off (warm people only)']
where not exists (select 1 from public.crm_sheet where tab = 'DM Templates' and cells[1] = 'W1');
