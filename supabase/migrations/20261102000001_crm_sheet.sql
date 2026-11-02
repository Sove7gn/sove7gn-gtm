-- The CRM's database: the Google Sheet and its Apps Script, rebuilt in Supabase.
-- Every tab keeps the sheet's shape (row 1 title, row 2 note, row 3 headers, data from row 4), stored as one row of
-- cells per sheet row, so the CRM page reads it exactly as it read the sheet. crm_call() is sheet_sync.gs, action for action,
-- with the same checks and the same answers ("ok", "bad row", "row moved, reload", ...).

-- ───────── storage ─────────
create table public.crm_sheet (
  tab text not null,
  row int not null check (row >= 1),
  cells text[] not null default '{}',   -- cells[1] = column A
  updated_at timestamptz not null default now(),
  primary key (tab, row)
);
create table public.crm_team (email text primary key check (email = lower(email)));   -- who can sign in and edit
create table public.crm_state (key text primary key, value text);                      -- settings and the refresh flag

alter table public.crm_sheet enable row level security;
alter table public.crm_team enable row level security;
alter table public.crm_state enable row level security;

create function public.crm_is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crm_team t where t.email = lower(coalesce((select auth.jwt()) ->> 'email', '')))
$$;

create policy read on public.crm_sheet for select to authenticated using ((select public.crm_is_member()));
create policy own_row on public.crm_team for select to authenticated using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')));

revoke all on public.crm_sheet, public.crm_team, public.crm_state from anon, authenticated;
grant select on public.crm_sheet, public.crm_team to authenticated;

-- ───────── sheet helpers (private schema; only crm_call uses them) ─────────
create schema crm;
revoke all on schema crm from public, anon, authenticated;

create function crm.g(t text, r int, c int) returns text language sql stable as $$
  select coalesce((select s.cells[c] from public.crm_sheet s where s.tab = t and s.row = r), '')
$$;

create function crm.s(t text, r int, c int, v text) returns void language plpgsql as $$
declare arr text[];
begin
  select cells into arr from public.crm_sheet where tab = t and row = r for update;
  if not found then arr := '{}'; end if;
  while coalesce(array_length(arr, 1), 0) < c - 1 loop arr := arr || ''::text; end loop;
  arr[c] := coalesce(v, '');
  insert into public.crm_sheet (tab, row, cells, updated_at) values (t, r, arr, now())
    on conflict (tab, row) do update set cells = excluded.cells, updated_at = now();
end $$;

-- Writes vals into consecutive cells starting at column c.
create function crm.sr(t text, r int, c int, vals text[]) returns void language plpgsql as $$
declare i int;
begin
  for i in 1 .. coalesce(array_length(vals, 1), 0) loop perform crm.s(t, r, c + i - 1, vals[i]); end loop;
end $$;

-- getLastRow(): the last row with anything in it.
create function crm.last(t text) returns int language sql stable as $$
  select coalesce(max(s.row), 0) from public.crm_sheet s
  where s.tab = t and exists (select 1 from unnest(s.cells) x where coalesce(x, '') <> '')
$$;

create function crm.snip(v text) returns text language sql immutable as $$
  select lower(left(btrim(regexp_replace(coalesce(v, ''), '\s+', ' ', 'g')), 40))
$$;

create function crm.jtext(j jsonb) returns text language sql immutable as $$
  select case when j is null or jsonb_typeof(j) = 'null' then '' when jsonb_typeof(j) = 'string' then j #>> '{}' else j::text end
$$;

create function crm.jrow(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array(select crm.jtext(x) from jsonb_array_elements(j) x), '{}')
$$;

-- The page sends sheet serial numbers for dates (days since 30 Dec 1899, local time); store them as the sheet showed them.
create function crm.cellval(j jsonb) returns text language plpgsql immutable as $$
declare n numeric; ts timestamp;
begin
  if jsonb_typeof(j) <> 'number' then return crm.jtext(j); end if;
  n := (j #>> '{}')::numeric;
  ts := timestamp '1899-12-30' + n * interval '1 day';
  if n = trunc(n) then return to_char(ts, 'FMDD Mon YYYY'); end if;
  return to_char(ts, 'FMDD Mon YYYY, FMHH24:MI');
end $$;

create function crm.today() returns timestamp language sql stable as $$ select now() at time zone 'Asia/Kolkata' $$;

-- Account name -> X handle, from the Our Accounts tab (rows 4-6, "Handle" with or without @).
create function crm.handle(account text) returns text language sql stable as $$
  select nullif(regexp_replace(btrim(s.cells[2]), '^@', ''), '') from public.crm_sheet s
  where s.tab = 'Our Accounts' and s.row between 4 and 6 and btrim(s.cells[1]) = btrim(coalesce(account, '')) limit 1
$$;

-- A link to one of our own posts, cleaned up; null if it isn't the account's.
create function crm.ourlink(link text, handle text) returns text language plpgsql immutable as $$
declare l text := btrim(coalesce(link, '')); m text[];
begin
  m := regexp_match(l, '^(https?://(?:[a-z]+\.)?linkedin\.com/(?:posts|feed/update)/[^\s?#]+)', 'i');
  if m is not null then return m[1]; end if;
  m := regexp_match(l, '^https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/([A-Za-z0-9_]+)/status/(\d+)', 'i');
  if m is null or coalesce(handle, '') = '' or lower(m[1]) <> lower(handle) then return null; end if;
  return 'https://x.com/' || handle || '/status/' || m[2];
end $$;

create function crm.weekof(ds text) returns text language plpgsql stable as $$
declare d date; p date;
begin
  p := coalesce((select value from public.crm_state where key = 'pilot_start'), '2026-11-02')::date;
  if coalesce(ds, '') ~ '^\d{1,2} [A-Z][a-z]{2} \d{4}$' then d := to_date(ds, 'DD Mon YYYY'); else d := crm.today()::date; end if;
  return 'W' || greatest(1, floor((d - p) / 7.0)::int + 1);
end $$;

-- ───────── actions (one per sheet_sync.gs function) ─────────
create function crm.pipeline_edit(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int; head text[]; ni int; ci int; k text; v jsonb; i int; n int := 0;
  writable text[] := array['Status', 'Sent on', 'FU1 sent', 'FU2 sent', 'Replied on', 'Call on', 'Notes'];
begin
  if r is null or r < 4 or r > crm.last('DM Pipeline') then return 'bad row'; end if;
  select cells into head from public.crm_sheet where tab = 'DM Pipeline' and row = 3;
  ni := array_position(head, 'Name'); ci := array_position(head, 'Company');
  if btrim(crm.g('DM Pipeline', r, ni)) <> btrim(coalesce(b ->> 'name', ''))
     or btrim(crm.g('DM Pipeline', r, ci)) <> btrim(coalesce(b ->> 'company', '')) then return 'row moved, reload'; end if;
  for k, v in select * from jsonb_each(coalesce(b -> 'cells', '{}')) loop
    i := array_position(head, k);
    if not (k = any (writable)) or i is null then continue; end if;
    perform crm.s('DM Pipeline', r, i, crm.cellval(v)); n := n + 1;
  end loop;
  return 'ok ' || n;
end $$;

create function crm.mark_posted(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int; acct text; link text;
begin
  if r is null or r < 4 or r > crm.last('Our Posts') then return 'bad row'; end if;
  acct := btrim(crm.g('Our Posts', r, 4));
  link := crm.ourlink(b ->> 'link', crm.handle(acct));
  if link is null then return 'That link is not a post from @' || coalesce(crm.handle(acct), '?') || '. Paste the link of the post itself.'; end if;
  perform crm.s('Our Posts', r, 15, 'Posted'); perform crm.s('Our Posts', r, 17, link);
  return 'ok ' || link;
end $$;

create function crm.mark_scheduled(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int;
begin
  if r is null or r < 4 or r > crm.last('Our Posts') then return 'bad row'; end if;
  if btrim(crm.g('Our Posts', r, 17)) <> '' then return 'already posted'; end if;
  perform crm.s('Our Posts', r, 15, case when (b ->> 'on')::boolean then 'Scheduled' else 'Ready to post' end);
  return 'ok';
end $$;

create function crm.delete_post(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int;
begin
  if r is null or r < 4 or r > crm.last('Our Posts') then return 'bad row'; end if;
  if crm.snip(crm.g('Our Posts', r, 10)) <> lower(coalesce(b ->> 'snippet', '')) then return 'row moved, reload'; end if;
  perform crm.s('Our Posts', r, 15, 'Deleted');
  return 'ok';
end $$;

create function crm.restore_post(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int;
begin
  if r is null or r < 4 or r > crm.last('Our Posts') then return 'bad row'; end if;
  if crm.g('Our Posts', r, 15) <> 'Deleted' then return 'ok'; end if;
  perform crm.s('Our Posts', r, 15, coalesce(nullif(b ->> 'status', ''), 'Ready to post'));
  return 'ok';
end $$;

create function crm.post_types() returns text[] language sql immutable as $$
  select array['Lead magnet', 'Founder story', 'Data post', 'Tagging post', 'How it works', 'Contrarian take', 'Company news',
               'Behind the scenes', 'Operator floor data', 'Own post']
$$;

create function crm.add_post(b jsonb) returns text language plpgsql as $$
declare acct text := coalesce(b ->> 'account', ''); h text := crm.handle(acct); link text := ''; txt text; typ text; st text;
  d date; ds text; r int;
begin
  if h is null then return 'pick an account'; end if;
  if coalesce(b ->> 'link', '') <> '' then
    link := crm.ourlink(b ->> 'link', h);
    if link is null then return 'That link is not a post from @' || h || '. Paste the link of the post itself.'; end if;
  end if;
  txt := left(coalesce(b ->> 'text', ''), 4000);
  if link = '' and txt = '' then return 'add the post text or its link'; end if;
  typ := case when (b ->> 'type') = any (crm.post_types()) then b ->> 'type' else 'Own post' end;
  st := case when link <> '' then 'Posted' when b ->> 'status' = 'Scheduled' then 'Scheduled' else 'Ready to post' end;
  begin d := nullif(b ->> 'date', '')::date; exception when others then d := null; end;
  ds := to_char(coalesce(d, crm.today()::date), 'FMDD Mon YYYY');
  r := greatest(crm.last('Our Posts') + 1, 4);
  perform crm.sr('Our Posts', r, 1, array[crm.weekof(ds), ds, coalesce(b ->> 'time', ''), acct, 'X', typ, 'Our own', '', '',
                                         txt, 'Added by hand in the CRM', '', '', '', st, '', link]);
  return 'ok ' || r;
end $$;

create function crm.move_post(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int; ds text := coalesce(b ->> 'date', '');
begin
  if r is null or r < 4 or r > crm.last('Our Posts') then return 'bad row'; end if;
  if crm.snip(crm.g('Our Posts', r, 10)) <> lower(coalesce(b ->> 'snippet', '')) then return 'row moved, reload'; end if;
  if btrim(crm.g('Our Posts', r, 17)) <> '' then return 'already posted'; end if;
  if ds !~ '^\d{1,2} [A-Z][a-z]{2} \d{4}$' then return 'bad date'; end if;
  perform crm.sr('Our Posts', r, 1, array[crm.weekof(ds), ds, coalesce(nullif(b ->> 'time', ''), 'Option')]);
  if coalesce(b ->> 'status', '') <> '' then perform crm.s('Our Posts', r, 15, b ->> 'status'); end if;
  return 'ok';
end $$;

-- A calendar card. A row is on the calendar only while column Z (Calendar) is "Yes". With no row, adds a new card.
create function crm.cal_save(b jsonb) returns text language plpgsql as $$
declare r int := coalesce(nullif(b ->> 'row', '')::int, 0); acct text; link text;
  slots text[] := array['Account tag', 'Founder', 'Data & product'];
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
end $$;

create function crm.engager_status(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int;
begin
  if r is null or r < 4 or r > crm.last('Post Engagers') then return 'bad row'; end if;
  if lower(crm.g('Post Engagers', r, 6)) <> lower(coalesce(b ->> 'handle', '')) then return 'row moved, reload'; end if;
  if not (coalesce(b ->> 'status', '') = any (array['Dismissed', 'To message', 'Messaged', 'Replied'])) then return 'bad status'; end if;
  perform crm.s('Post Engagers', r, 16, b ->> 'status');
  return 'ok';
end $$;

create function crm.mark_messaged(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int;
begin
  if r is null or r < 4 or r > crm.last('Post Engagers') then return 'bad row'; end if;
  if lower(crm.g('Post Engagers', r, 6)) <> lower(coalesce(b ->> 'handle', '')) then return 'row moved, reload'; end if;
  perform crm.s('Post Engagers', r, 16, 'Messaged');
  perform crm.s('Post Engagers', r, 17, to_char(crm.today(), 'FMDD Mon YYYY HH24:MI'));
  return 'ok';
end $$;

-- From the tracker (scripts only): numbers on our posts, snapshots, posts written by hand on X, and new engagers.
create function crm.track(b jsonb) returns text language plpgsql as $$
declare p jsonb; r int; acct text; link text; have text; n int := 0; snaps jsonb := coalesce(b -> 'snapshots', '[]');
  x jsonb; r0 int; seen jsonb := '{}'; k text; k2 text; added int := 0; s record;
begin
  perform pg_advisory_xact_lock(hashtext('crm:Our Posts'));
  for p in select * from jsonb_array_elements(coalesce(b -> 'posts', '[]')) loop
    r := nullif(p ->> 'row', '')::int;
    if r is null or r < 4 then continue; end if;
    acct := btrim(crm.g('Our Posts', r, 4));
    link := crm.ourlink(p ->> 'link', crm.handle(acct));
    if link is null then continue; end if;
    have := btrim(crm.g('Our Posts', r, 17));
    if have <> '' and lower(split_part(have, '?', 1)) <> lower(link) then continue; end if;
    if have = '' then
      if coalesce(p ->> 'snippet', '') = '' or crm.snip(crm.g('Our Posts', r, 10)) <> lower(p ->> 'snippet') then continue; end if;
      perform crm.s('Our Posts', r, 15, 'Posted'); perform crm.s('Our Posts', r, 17, link);
    end if;
    perform crm.sr('Our Posts', r, 18, array[crm.jtext(p -> 'views'), crm.jtext(p -> 'likes'), crm.jtext(p -> 'replies'),
                                            crm.jtext(p -> 'reposts'), crm.jtext(p -> 'quotes'), crm.jtext(p -> 'bookmarks')]);
    if coalesce(p ->> 'result', '') <> '' then perform crm.s('Our Posts', r, 24, p ->> 'result'); end if;
    n := n + 1;
  end loop;
  r0 := greatest(crm.last('Post Tracking') + 1, 4);
  for x in select * from jsonb_array_elements(snaps) loop
    insert into public.crm_sheet (tab, row, cells) values ('Post Tracking', r0, crm.jrow(x)); r0 := r0 + 1;
  end loop;
  -- Posts on our accounts that aren't in Our Posts yet (written by hand on X).
  r0 := greatest(crm.last('Our Posts') + 1, 4);
  for x in select * from jsonb_array_elements(coalesce(b -> 'newPosts', '[]')) loop
    k := lower(crm.jtext(x -> 16));
    if k = '' or exists (select 1 from public.crm_sheet s where s.tab = 'Our Posts' and s.row >= 4 and lower(split_part(coalesce(s.cells[17], ''), '?', 1)) = k) then continue; end if;
    insert into public.crm_sheet (tab, row, cells) values ('Our Posts', r0, crm.jrow(x)); r0 := r0 + 1;
  end loop;
  -- New engagers: one row per person per post, and one per reply link.
  for s in select cells from public.crm_sheet where tab = 'Post Engagers' and row >= 4 loop
    seen := seen || jsonb_build_object(lower(coalesce(s.cells[3], '')) || '|' || lower(coalesce(s.cells[6], '')), 1);
    if coalesce(s.cells[12], '') <> '' then seen := seen || jsonb_build_object(regexp_replace(lower(s.cells[12]), '^.*/status/', 'reply '), 1); end if;
  end loop;
  r0 := greatest(crm.last('Post Engagers') + 1, 4);
  for x in select * from jsonb_array_elements(coalesce(b -> 'engagers', '[]')) loop
    k := lower(crm.jtext(x -> 2)) || '|' || lower(crm.jtext(x -> 5));
    k2 := regexp_replace(lower(crm.jtext(x -> 11)), '^.*/status/', 'reply ');
    if seen ? k or (crm.jtext(x -> 11) <> '' and seen ? k2) then continue; end if;
    seen := seen || jsonb_build_object(k, 1);
    if crm.jtext(x -> 11) <> '' then seen := seen || jsonb_build_object(k2, 1); end if;
    insert into public.crm_sheet (tab, row, cells) values ('Post Engagers', r0, crm.jrow(x)); r0 := r0 + 1; added := added + 1;
  end loop;
  return 'ok ' || n || ' posts, ' || jsonb_array_length(snaps) || ' snapshots, ' || added || ' new people';
end $$;

-- Bulk lead loads (scripts only): only plain DM Pipeline columns C:T (3-20), AB (28) and AF:AJ (32-36).
create function crm.write_rows(b jsonb) returns text language plpgsql as $$
declare w jsonb; r int; c int; width int; vals jsonb; i int; n int := 0;
begin
  for w in select * from jsonb_array_elements(coalesce(b -> 'writes', '[]')) loop
    r := (w ->> 'row')::int; c := (w ->> 'col')::int; vals := coalesce(w -> 'values', '[]');
    width := case when jsonb_array_length(vals) > 0 then jsonb_array_length(vals -> 0) else 0 end;
    if not (r >= 4 and width > 0 and ((c >= 3 and c + width - 1 <= 20) or (c = 28 and width = 1) or (c >= 32 and c + width - 1 <= 36))) then
      return 'refused write at row ' || r || ', column ' || c || ' (not a plain column)';
    end if;
    for i in 0 .. jsonb_array_length(vals) - 1 loop perform crm.sr('DM Pipeline', r + i, c, crm.jrow(vals -> i)); n := n + 1; end loop;
  end loop;
  return 'ok ' || n || ' rows';
end $$;

-- ───────── the one entry point (what the page and the scripts call) ─────────
create function public.crm_call(body jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare a text := coalesce(body ->> 'action', ''); script boolean := coalesce((select auth.role()), '') = 'service_role'; at text;
begin
  if not (script or public.crm_is_member()) then return 'bad pass'; end if;
  if a = 'pipeline' then return crm.pipeline_edit(body); end if;
  if a = 'posted' then return crm.mark_posted(body); end if;
  if a = 'scheduled' then return crm.mark_scheduled(body); end if;
  if a = 'deletePost' then return crm.delete_post(body); end if;
  if a = 'restorePost' then return crm.restore_post(body); end if;
  if a = 'addPost' then return crm.add_post(body); end if;
  if a = 'movePost' then return crm.move_post(body); end if;
  if a = 'calSave' then return crm.cal_save(body); end if;
  if a = 'engager' then return crm.engager_status(body); end if;
  if a = 'messaged' then return crm.mark_messaged(body); end if;
  if a = 'pause' then perform crm.s('DM Templates', 4, 11, case when (body ->> 'on')::boolean then 'TRUE' else 'FALSE' end); return 'ok'; end if;
  if a = 'refresh' then
    insert into public.crm_state (key, value) values ('refreshAt', (extract(epoch from now()) * 1000)::bigint::text)
      on conflict (key) do update set value = excluded.value;
    return 'ok';
  end if;
  if not script then return 'bad token'; end if;   -- below: the team's computer only
  if a = 'track' then return crm.track(body); end if;
  if a = 'rows' then return crm.write_rows(body); end if;
  if a = 'refreshCheck' then
    delete from public.crm_state where key = 'refreshAt' returning value into at;
    return case when at is null then 'no' else 'yes ' || at end;
  end if;
  return 'unknown action';
end $$;

revoke all on function public.crm_call(jsonb) from public, anon;
grant execute on function public.crm_call(jsonb) to authenticated, service_role;
grant execute on function public.crm_is_member() to authenticated;
grant usage on schema crm to service_role;

-- ───────── media uploads (calendar "Add image"): a public bucket, written only by the team ─────────
insert into storage.buckets (id, name, public) values ('crm-media', 'crm-media', true) on conflict (id) do nothing;
create policy crm_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-media' and (select public.crm_is_member()));
