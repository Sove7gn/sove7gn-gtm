-- 16 Nov: the Chrome extension posts approved replies for Reyansh (30 a day max, 15+ minutes apart, paused with the X cooldown).
-- Replies page: Approve -> 'approved'; the bot claims it ('sending'), likes the post, posts the reply -> 'posted', or 'failed' with why.
-- 'done' stays for replies he posted himself.
alter table public.crm_x_reply drop constraint if exists crm_x_reply_status_check;
alter table public.crm_x_reply add constraint crm_x_reply_status_check check (status in ('new', 'approved', 'sending', 'posted', 'failed', 'done', 'skipped'));
alter table public.crm_x_reply add column if not exists error text not null default '';
alter table public.crm_x_reply add column if not exists claimed_at timestamptz;
alter table public.crm_x_reply add column if not exists posted_at timestamptz;
grant update (draft) on public.crm_x_reply to authenticated;
