-- 25 Nov: monthly email tracker on the email board. One small row per month and inbox (US Eastern months),
-- so the CRM reads a handful of numbers instead of every event (keeps Supabase egress low).
create or replace function public.crm_email_monthly(months int default 12)
returns table(month text, inbox text, sent int, first_emails int, replies int, bounces int)
language sql stable as $$
  select to_char(at at time zone 'America/New_York', 'YYYY-MM'), inbox,
    count(*) filter (where kind = 'sent')::int,
    count(*) filter (where kind = 'sent' and step = 1)::int,
    count(*) filter (where kind = 'reply')::int,
    count(*) filter (where kind = 'bounce')::int
  from public.crm_email_events
  where kind in ('sent','reply','bounce') and inbox is not null
    and at >= (date_trunc('month', now() at time zone 'America/New_York') - make_interval(months => greatest(months,1) - 1)) at time zone 'America/New_York'
  group by 1, 2 order by 1 desc, 2;
$$;
revoke execute on function public.crm_email_monthly(int) from public, anon;
grant execute on function public.crm_email_monthly(int) to authenticated;
