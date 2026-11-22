-- 22 Nov: manual X replies. Automatic replies stay off (x_bot.replies_paused); a reply can be entered by hand (target post URL +
-- draft), claimed through li-bot (same cap, pacing, hours, cooldown, 20-hour freshness and one-person-a-day checks as the bot),
-- posted on X by a person or the assistant, then closed with the URL of the reply that was actually published.
--   source = 'manual' for these rows: the automatic sender (xr_plan) never hands them out or resets their claim.
--   reply_url = the published reply, shown in Posted (live) and the activity history.
alter table public.crm_x_reply add column if not exists reply_url text not null default '';
alter table public.crm_x_reply add column if not exists source text not null default '';
create index if not exists crm_x_reply_done_at on public.crm_x_reply (done_at desc);
