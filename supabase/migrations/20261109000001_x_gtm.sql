-- X GTM (9 Nov): DM scripts edited from the CRM, a "Hook" column for each lead's personal first line, and the two new X jobs
-- (x-leads finds 30 to 40 funded founders a day, x-engage reads replies, quotes and mentions on our posts).

-- Each lead's personal first line (written by x-leads), dropped into a script wherever it says [hook].
select crm.s('DM Pipeline', 3, 37, 'Hook');

-- The team can now also set a lead's script, its own message and why a DM couldn't go out (passcode, closed DMs).
create or replace function crm.pipeline_edit(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int; head text[]; ni int; ci int; k text; v jsonb; i int; n int := 0;
  writable text[] := array['Status', 'Sent on', 'FU1 sent', 'FU2 sent', 'Replied on', 'Call on', 'Notes', 'DM result', 'Template', 'Opener (30-40 words)', 'X handle'];
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

-- Bulk lead loads (scripts and x-leads): plain DM Pipeline columns C:T (3-20), AB (28) and AF:AK (32-37).
create or replace function crm.write_rows(b jsonb) returns text language plpgsql as $$
declare w jsonb; r int; c int; width int; vals jsonb; i int; n int := 0;
begin
  for w in select * from jsonb_array_elements(coalesce(b -> 'writes', '[]')) loop
    r := (w ->> 'row')::int; c := (w ->> 'col')::int; vals := coalesce(w -> 'values', '[]');
    width := case when jsonb_array_length(vals) > 0 then jsonb_array_length(vals -> 0) else 0 end;
    if not (r >= 4 and width > 0 and ((c >= 3 and c + width - 1 <= 20) or (c = 28 and width = 1) or (c >= 32 and c + width - 1 <= 37))) then
      return 'refused write at row ' || r || ', column ' || c || ' (not a plain column)';
    end if;
    for i in 0 .. jsonb_array_length(vals) - 1 loop perform crm.sr('DM Pipeline', r + i, c, crm.jrow(vals -> i)); n := n + 1; end loop;
  end loop;
  return 'ok ' || n || ' rows';
end $$;

-- DM scripts (DM Templates row 11 on): edit one, or add a new version. Columns: A ID, B Account, C Intent, D Use it for,
-- E Opener, F Follow-up 1, G Follow-up 2, M Verdict ("Off" takes a version out of the rotation).
create or replace function crm.tpl_save(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int; k text; col int;
begin
  if r is null or r < 11 or r > crm.last('DM Templates') then return 'bad row'; end if;
  if btrim(crm.g('DM Templates', r, 1)) <> btrim(coalesce(b ->> 'id', '')) then return 'row moved, reload'; end if;
  foreach k in array array['intent', 'use', 'opener', 'fu1', 'fu2', 'verdict'] loop
    if b ? k then
      col := case k when 'intent' then 3 when 'use' then 4 when 'opener' then 5 when 'fu1' then 6 when 'fu2' then 7 else 13 end;
      perform crm.s('DM Templates', r, col, left(coalesce(b ->> k, ''), 2000));
    end if;
  end loop;
  return 'ok';
end $$;

create or replace function crm.tpl_add(b jsonb) returns text language plpgsql as $$
declare r int; id text := upper(btrim(coalesce(b ->> 'id', '')));
begin
  if id !~ '^[A-Z][0-9]{1,2}[A-Z]?$' then return 'The name must look like A2 or D1.'; end if;
  if exists (select 1 from public.crm_sheet where tab = 'DM Templates' and row >= 11 and upper(btrim(cells[1])) = id) then return id || ' already exists.'; end if;
  perform pg_advisory_xact_lock(hashtext('crm:DM Templates'));
  r := greatest(crm.last('DM Templates') + 1, 11);
  insert into public.crm_sheet (tab, row, cells) values ('DM Templates', r,
    array[id, coalesce(b ->> 'account', ''), left(coalesce(b ->> 'intent', ''), 200), left(coalesce(b ->> 'use', ''), 500),
          left(coalesce(b ->> 'opener', ''), 2000), left(coalesce(b ->> 'fu1', ''), 2000), left(coalesce(b ->> 'fu2', ''), 2000), '', '', '', '', '', '']);
  return 'ok ' || r;
end $$;

-- The one entry point, now with the script actions.
create or replace function public.crm_call(body jsonb) returns text
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
  if a = 'tplSave' then return crm.tpl_save(body); end if;
  if a = 'tplAdd' then return crm.tpl_add(body); end if;
  if a = 'pause' then perform crm.s('DM Templates', 4, 11, case when (body ->> 'on')::boolean then 'TRUE' else 'FALSE' end); return 'ok'; end if;
  if a = 'refresh' then
    insert into public.crm_state (key, value) values ('refreshAt', (extract(epoch from now()) * 1000)::bigint::text)
      on conflict (key) do update set value = excluded.value;
    return 'ok';
  end if;
  if not script then return 'bad token'; end if;   -- below: scripts and the scheduled jobs only
  if a = 'track' then return crm.track(body); end if;
  if a = 'rows' then return crm.write_rows(body); end if;
  if a = 'refreshCheck' then
    delete from public.crm_state where key = 'refreshAt' returning value into at;
    return case when at is null then 'no' else 'yes ' || at end;
  end if;
  return 'unknown action';
end $$;
