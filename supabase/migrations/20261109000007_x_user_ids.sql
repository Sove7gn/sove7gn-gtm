-- X user IDs (9 Nov): X's DM link needs the account's number, not its handle (x.com/messages/compose?recipient_id=...).
-- DM Pipeline column AL and Post Engagers column U hold it, so "Open DM" lands in the chat with the message filled in.
select crm.s('DM Pipeline', 3, 38, 'X user ID');
select crm.s('Post Engagers', 3, 21, 'X user ID');

-- Bulk lead loads (scripts and x-leads): plain DM Pipeline columns C:T (3-20), AB (28) and AF:AL (32-38).
create or replace function crm.write_rows(b jsonb) returns text language plpgsql as $$
declare w jsonb; r int; c int; width int; vals jsonb; i int; n int := 0;
begin
  for w in select * from jsonb_array_elements(coalesce(b -> 'writes', '[]')) loop
    r := (w ->> 'row')::int; c := (w ->> 'col')::int; vals := coalesce(w -> 'values', '[]');
    width := case when jsonb_array_length(vals) > 0 then jsonb_array_length(vals -> 0) else 0 end;
    if not (r >= 4 and width > 0 and ((c >= 3 and c + width - 1 <= 20) or (c = 28 and width = 1) or (c >= 32 and c + width - 1 <= 38))) then
      return 'refused write at row ' || r || ', column ' || c || ' (not a plain column)';
    end if;
    for i in 0 .. jsonb_array_length(vals) - 1 loop perform crm.sr('DM Pipeline', r + i, c, crm.jrow(vals -> i)); n := n + 1; end loop;
  end loop;
  return 'ok ' || n || ' rows';
end $$;
