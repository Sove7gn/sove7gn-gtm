-- 16 Nov: AI tool and Article are calendar slots too (written by x-grow on the day).
CREATE OR REPLACE FUNCTION crm.cal_save(b jsonb)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare r int := coalesce(nullif(b ->> 'row', '')::int, 0); acct text; link text;
  slots text[] := array['Account tag', 'Founder', 'Data & product', 'AI tool', 'News', 'Article', 'Shoutout'];
  statuses text[] := array['Draft', 'Ready to post', 'Needs media', 'Needs a founder answer', 'Needs founder approval', 'Scheduled', 'Posted', 'Deleted'];
begin
  perform pg_advisory_xact_lock(hashtext('crm:Our Posts'));
  if b ? 'date' and coalesce(b ->> 'date', '') !~ '^\d{1,2} [A-Z][a-z]{2} \d{4}$' then return 'bad date'; end if;
  if b ? 'time' and coalesce(b ->> 'time', '') <> '' and (b ->> 'time') !~ '^\d{1,2}:\d{2} [AP]M$' then return 'bad time'; end if;
  if b ? 'type' and coalesce(b ->> 'type', '') <> '' and not ((b ->> 'type') = any (crm.post_types())) then return 'bad type'; end if;
  if b ? 'aimed' and length(coalesce(b ->> 'aimed', '')) > 80 then return 'bad audience'; end if;
  if b ? 'status' and not (coalesce(b ->> 'status', '') = any (statuses)) then return 'bad status'; end if;
  if b ? 'slot' and coalesce(b ->> 'slot', '') <> '' and not ((b ->> 'slot') = any (slots)) then return 'bad slot'; end if;
  if r = 0 then
    acct := coalesce(b ->> 'account', '');
    if crm.handle(acct) is null then return 'pick an account'; end if;
    if coalesce(b ->> 'date', '') = '' then return 'bad date'; end if;
    r := greatest(crm.last('Our Posts') + 1, 4);
    perform crm.sr('Our Posts', r, 1, array[crm.weekof(b ->> 'date'), b ->> 'date', coalesce(b ->> 'time', ''), acct,
      case when b ->> 'platform' = 'LinkedIn' then 'LinkedIn' else 'X' end, '', 'Our own', '', '', '', 'Added in the calendar',
      '', '', '', 'Draft', '', '', '', '', '', '', '', '', '', '', 'Yes']);
    if (b ->> 'slot') = any (slots) then perform crm.s('Our Posts', r, 28, b ->> 'slot'); end if;
    return 'ok ' || r;
  end if;
  if r < 4 or r > crm.last('Our Posts') then return 'bad row'; end if;
  if crm.snip(crm.g('Our Posts', r, 10)) <> lower(coalesce(b ->> 'snippet', '')) then return 'row moved, reload'; end if;
  acct := btrim(crm.g('Our Posts', r, 4));
  if b ? 'date' then perform crm.s('Our Posts', r, 1, crm.weekof(b ->> 'date')); perform crm.s('Our Posts', r, 2, b ->> 'date'); end if;
  if b ? 'time' then perform crm.s('Our Posts', r, 3, coalesce(b ->> 'time', '')); end if;
  if b ? 'type' then perform crm.s('Our Posts', r, 6, coalesce(b ->> 'type', '')); end if;
  if b ? 'text' then perform crm.s('Our Posts', r, 10, left(coalesce(b ->> 'text', ''), 4000)); end if;
  if b ? 'media' then perform crm.s('Our Posts', r, 14, left(coalesce(b ->> 'media', ''), 2000)); end if;
  if b ? 'aimed' then perform crm.s('Our Posts', r, 25, coalesce(b ->> 'aimed', '')); end if;
  if b ? 'funnel' then perform crm.s('Our Posts', r, 29, case when (b ->> 'funnel') in ('Reach', 'Trust', 'Convert') then b ->> 'funnel' else '' end); end if;
  if b ? 'slot' then perform crm.s('Our Posts', r, 28, case when (b ->> 'slot') = any (slots) then b ->> 'slot' else '' end); end if;
  if b ? 'cal' then perform crm.s('Our Posts', r, 26, case when b ->> 'cal' = 'No' then 'No' when coalesce(b ->> 'cal', '') <> '' then 'Yes' else '' end); end if;
  if b ? 'link' then
    link := case when coalesce(b ->> 'link', '') = '' then '' else crm.ourlink(b ->> 'link', crm.handle(acct)) end;
    if link is null then return 'That link is not a post from @' || coalesce(crm.handle(acct), '?') || '. Paste the link of the post itself.'; end if;
    perform crm.s('Our Posts', r, 17, link);
    if link <> '' then perform crm.s('Our Posts', r, 15, 'Posted'); end if;
  end if;
  if b ? 'status' and not (b ? 'link' and coalesce(b ->> 'link', '') <> '') then
    if btrim(crm.g('Our Posts', r, 17)) <> '' and b ->> 'status' <> 'Deleted' then perform crm.s('Our Posts', r, 15, 'Posted');
    else perform crm.s('Our Posts', r, 15, b ->> 'status'); end if;
  end if;
  return 'ok ' || r;
end $function$;
