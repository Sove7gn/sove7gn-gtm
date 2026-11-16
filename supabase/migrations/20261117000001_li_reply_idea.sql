-- 17 Nov: Midbound shows a suggested answer under each LinkedIn comment on our posts (written by x-grow, li_ideas).
alter table crm_social_engagements add column if not exists reply_idea text;
