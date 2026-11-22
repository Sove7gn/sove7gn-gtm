-- 22 Nov: the approval time of a LinkedIn invite. This column and trigger were already live (added directly in Supabase); this
-- file records them in the repo so a fresh setup has them. li-bot plan() hands out invites newest-approved first, then newest
-- created, and relies on this stamp. Same definitions as live, safe to re-run.
alter table public.crm_li_tasks add column if not exists approved_at timestamptz;

create or replace function public.crm_li_tasks_stamp_approved_at()
 returns trigger
 language plpgsql
as $function$
begin
  if new.kind = 'invite' and new.status = 'ready'
     and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status = 'review')) then
    new.approved_at = now();
  end if;
  return new;
end $function$;

drop trigger if exists crm_li_tasks_approved_at on public.crm_li_tasks;
create trigger crm_li_tasks_approved_at before insert or update on public.crm_li_tasks for each row execute function public.crm_li_tasks_stamp_approved_at();
