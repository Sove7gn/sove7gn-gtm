// 13 Nov: every table the CRM reads gets an updated_at that moves on each insert/update, so the page can load only what changed
// (Supabase free plan egress). Safe to run again.
import postgres from "postgres"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, "")]));
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1 });
await sql.unsafe(`create or replace function public.crm_touch_updated() returns trigger language plpgsql set search_path to '' as $$
begin new.updated_at := now(); return new; end $$;`);
for (const t of ["crm_sheet", "crm_social_people", "crm_social_engagements", "crm_social_posts", "crm_ig_threads", "crm_lead_events", "crm_li_tasks", "crm_x_tasks"]) {
  await sql.unsafe(`alter table public.${t} add column if not exists updated_at timestamptz not null default now()`);
  await sql.unsafe(`drop trigger if exists ${t}_upd on public.${t}`);
  await sql.unsafe(`create trigger ${t}_upd before insert or update on public.${t} for each row execute function public.crm_touch_updated()`);
  await sql.unsafe(`create index if not exists ${t}_updated_at on public.${t}(updated_at)`);
  console.log("ok", t);
}
await sql.unsafe(`create index if not exists crm_leads_updated_at on public.crm_leads(updated_at)`);
await sql.end();
