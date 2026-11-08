-- Engaged page (9 Nov): "Done" on someone who replied to, quoted or mentioned our post puts them in DM Pipeline as Contacted
-- (sheet status "Sent", sent today, our DM as their message) and marks them Messaged in Post Engagers.
-- If they're already in the pipeline, an unsent row just moves to Contacted.
create or replace function crm.engager_to_pipeline(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int; e text[]; h text; pr int; now_txt text := to_char(crm.today(), 'FMDD Mon YYYY HH24:MI'); nr int;
begin
  if r is null or r < 4 or r > crm.last('Post Engagers') then return 'bad row'; end if;
  select cells into e from public.crm_sheet where tab = 'Post Engagers' and row = r;
  h := lower(btrim(coalesce(e[6], '')));
  if h = '' or h <> lower(btrim(coalesce(b ->> 'handle', ''))) then return 'row moved, reload'; end if;
  perform pg_advisory_xact_lock(hashtext('crm:DM Pipeline'));
  select row into pr from public.crm_sheet where tab = 'DM Pipeline' and row >= 4 and lower(btrim(replace(coalesce(cells[11], ''), '@', ''))) = h limit 1;
  if pr is not null then
    if btrim(coalesce(crm.g('DM Pipeline', pr, 19), '')) in ('', 'To send') then
      perform crm.s('DM Pipeline', pr, 19, 'Sent'); perform crm.s('DM Pipeline', pr, 20, now_txt);
    end if;
  else
    nr := greatest(crm.last('DM Pipeline') + 1, 4);
    insert into public.crm_sheet (tab, row, cells) values ('DM Pipeline', nr, array[
      '', '', coalesce(nullif(e[7], ''), e[6]), '', left(coalesce(e[8], ''), 120), coalesce(nullif(e[14], ''), e[2], ''), 'X DM', 'Warm', 'Inbound engager', '8',
      e[6], '', '', 'Engaged with our post: “' || left(coalesce(e[11], ''), 200) || '”', coalesce(e[12], ''), coalesce(e[1], ''), 'Inbound', coalesce(e[15], ''),
      'Sent', now_txt, '', '', '', '', '', '', '', 'Added from Engaged on ' || now_txt || '. ' || coalesce(e[20], ''), '', '', '', '1', '', '', '', '', '']);
  end if;
  perform crm.s('Post Engagers', r, 16, 'Messaged');
  perform crm.s('Post Engagers', r, 17, now_txt);
  return 'ok';
end $$;

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
  if a = 'engagerToPipeline' then return crm.engager_to_pipeline(body); end if;
  if a = 'tplSave' then return crm.tpl_save(body); end if;
  if a = 'tplAdd' then return crm.tpl_add(body); end if;
  if a = 'pause' then perform crm.s('DM Templates', 4, 11, case when (body ->> 'on')::boolean then 'TRUE' else 'FALSE' end); return 'ok'; end if;
  if a = 'refresh' then
    insert into public.crm_state (key, value) values ('refreshAt', (extract(epoch from now()) * 1000)::bigint::text)
      on conflict (key) do update set value = excluded.value;
    return 'ok';
  end if;
  if not script then return 'bad token'; end if;
  if a = 'track' then return crm.track(body); end if;
  if a = 'rows' then return crm.write_rows(body); end if;
  if a = 'refreshCheck' then
    delete from public.crm_state where key = 'refreshAt' returning value into at;
    return case when at is null then 'no' else 'yes ' || at end;
  end if;
  return 'unknown action';
end $$;
