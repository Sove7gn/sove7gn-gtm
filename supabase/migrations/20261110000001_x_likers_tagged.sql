-- X midbound (10 Nov): people who liked our posts and people we tagged in them, on the Engaged page with a DM ready.
-- X only shows likes to the post's author, so likers are pasted in from X's notifications (add_likers); the x-engage job
-- then looks each one up, judges the fit and writes the DM (engager_fill). Tagged people are added by x-engage itself.

-- Paste likers: one Post Engagers row per handle (How "Liked", no verdict yet, so the next x-engage run fills it in).
create or replace function crm.add_likers(b jsonb) returns text language plpgsql as $$
declare h text; r0 int; n int := 0; post text := btrim(coalesce(b ->> 'post', ''));
begin
  perform pg_advisory_xact_lock(hashtext('crm:Post Engagers'));
  r0 := greatest(crm.last('Post Engagers') + 1, 4);
  for h in select distinct lower(btrim(regexp_replace(x, '^.*(x|twitter)\.com/', ''), '@/ ')) from jsonb_array_elements_text(coalesce(b -> 'handles', '[]')) x loop
    if h !~ '^[a-z0-9_]{1,15}$' or h = 'r3yanshjuneja' then continue; end if;
    if exists (select 1 from public.crm_sheet where tab = 'Post Engagers' and row >= 4 and lower(cells[6]) = h and coalesce(cells[16], '') in ('', 'To message')) then continue; end if;
    insert into public.crm_sheet (tab, row, cells) values ('Post Engagers', r0, array[
      to_char(crm.today(), 'FMDD Mon YYYY HH24:MI'), 'Reyansh', post, '', 'Liked', h, '', '', '', '', '', '', '', 'Reyansh', '', 'To message', '', '', '', 'Looking them up…', '']);
    r0 := r0 + 1; n := n + 1;
  end loop;
  return 'ok ' || n;
end $$;

-- The job fills in a row it looked up: name, bio, followers, fit, DM, reply, verdict, why, X user id (by column number).
create or replace function crm.engager_fill(b jsonb) returns text language plpgsql as $$
declare r int := nullif(b ->> 'row', '')::int; k text; v text;
begin
  if r is null or r < 4 or r > crm.last('Post Engagers') then return 'bad row'; end if;
  if lower(crm.g('Post Engagers', r, 6)) <> lower(coalesce(b ->> 'handle', '')) then return 'row moved'; end if;
  for k, v in select * from jsonb_each_text(coalesce(b -> 'cells', '{}')) loop
    if k::int = any (array[7, 8, 9, 13, 15, 16, 18, 19, 20, 21]) then perform crm.s('Post Engagers', r, k::int, v); end if;
  end loop;
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
  if a = 'addLikers' then return crm.add_likers(body); end if;
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
  if a = 'engagerFill' then return crm.engager_fill(body); end if;
  if a = 'refreshCheck' then
    delete from public.crm_state where key = 'refreshAt' returning value into at;
    return case when at is null then 'no' else 'yes ' || at end;
  end if;
  return 'unknown action';
end $$;
