-- One tracking run per platform at a time (7 Nov): a second start (the schedule plus "Check now", or two teammates) fails to
-- insert its run row and steps aside, so Apify is never paid twice for the same check.
update public.crm_sync_runs set finished_at = now(), ok = false, error = 'Didn’t finish'
where finished_at is null and started_at < now() - interval '5 minutes';
create unique index crm_sync_runs_one_live on public.crm_sync_runs (platform) where finished_at is null;
