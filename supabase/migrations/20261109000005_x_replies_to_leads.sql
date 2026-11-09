-- X replies become leads (9 Nov): the X Pipeline is outreach; Leads is everyone we're actually talking to. When an X DM
-- person moves to Replied, Call booked or Customer, they're added to Leads once (source X, stage "In talks", or "Call booked"
-- when that's where they are). People already in Leads (same X handle) are left alone.
create or replace function crm.x_to_leads(r int) returns void language plpgsql as $$
declare c text[]; h text; st text; stage text;
begin
  select cells into c from public.crm_sheet where tab = 'DM Pipeline' and row = r;
  if c is null then return; end if;
  h := lower(btrim(replace(coalesce(c[11], ''), '@', '')));
  st := btrim(coalesce(c[19], ''));
  if h = '' or st not in ('Replied', 'Call booked', 'Customer') then return; end if;
  if exists (select 1 from public.crm_leads where lower(replace(coalesce(x_handle, ''), '@', '')) = h or origin_key = 'x-dm:' || h) then return; end if;
  stage := case when st = 'Call booked' then 'Call booked' when st = 'Customer' then 'Won' else 'In talks' end;
  insert into public.crm_leads (name, company, role, x_handle, source, direction, source_detail, stage, notes, origin_key, created_by)
  values (coalesce(nullif(c[3], ''), '@' || h), nullif(c[4], ''), nullif(c[5], ''), '@' || h, 'X', 'Outbound', 'Replied to our X DM', stage,
          nullif(concat_ws(E'\n', nullif(c[14], ''), 'Script ' || nullif(c[17], ''), nullif(c[28], '')), ''), 'x-dm:' || h, 'automation');
end $$;

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
  perform crm.x_to_leads(r);
  return 'ok ' || n;
end $$;
