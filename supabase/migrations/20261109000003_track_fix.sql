-- 9 Nov: crm.track's loop variable was called s, the same as the table alias in its "new posts" check, so adding a post
-- written straight on X failed with 'record "s" is not assigned yet'. Same function, the variable renamed.
create or replace function crm.track(b jsonb) returns text language plpgsql as $$
declare p jsonb; r int; acct text; link text; have text; n int := 0; snaps jsonb := coalesce(b -> 'snapshots', '[]');
  x jsonb; r0 int; seen jsonb := '{}'; k text; k2 text; added int := 0; pe record;
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
  for pe in select cells from public.crm_sheet where tab = 'Post Engagers' and row >= 4 loop
    seen := seen || jsonb_build_object(lower(coalesce(pe.cells[3], '')) || '|' || lower(coalesce(pe.cells[6], '')), 1);
    if coalesce(pe.cells[12], '') <> '' then seen := seen || jsonb_build_object(regexp_replace(lower(pe.cells[12]), '^.*/status/', 'reply '), 1); end if;
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
