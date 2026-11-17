// Puts the lead drop live (18 Nov): table crm_lead_drops, the lead-drop function, and a job every 2 minutes that queues prospects
// and moves one drop on by one stage. Safe to run again. Prints names only, never secrets.
// Usage: node scripts/deploy-lead-drop.mjs [--no-cron]
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "CRON_SECRET", "COMPOSIO_API_KEY", "DATABASE_URL"])
  if (!env[k]) { console.error(k + " is empty in .env.local."); process.exit(1); }
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await sql.unsafe(`
    create table if not exists public.crm_lead_drops (
      token text primary key, status text not null default 'queued', priority int not null default 3,
      lead_id uuid, handle text, name text, role text, company text not null, hint text, domain text,
      stage jsonb, data jsonb, n_leads int, top_line text, cost numeric default 0, searched int default 0,
      tries int not null default 0, error text, views int not null default 0, first_view_at timestamptz, last_view_at timestamptz,
      ready_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table public.crm_lead_drops add column if not exists sent_li_at timestamptz, add column if not exists sent_x_at timestamptz;
    create index if not exists crm_lead_drops_status on public.crm_lead_drops (status, priority, created_at);
    create index if not exists crm_lead_drops_lead on public.crm_lead_drops (lead_id);
    create index if not exists crm_lead_drops_handle on public.crm_lead_drops (lower(handle));
    alter table public.crm_lead_drops enable row level security;
    drop policy if exists team_read on public.crm_lead_drops;
    create policy team_read on public.crm_lead_drops for select using ((select public.crm_is_member()));
    drop trigger if exists crm_lead_drops_upd on public.crm_lead_drops;
    create trigger crm_lead_drops_upd before insert or update on public.crm_lead_drops for each row execute function public.crm_touch_updated();
    insert into public.crm_lead_settings (key, value) values ('lead_drop', '{"daily_cap": 80, "paused": false}') on conflict (key) do nothing;`);
  console.log("table: crm_lead_drops ready");

  const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
  const form = new FormData();
  form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "lead-drop", verify_jwt: false }));
  form.append("file", new Blob([readFileSync(new URL("../supabase/functions/lead-drop/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
  const r = await fetch("https://api.supabase.com/v1/projects/" + ref + "/functions/deploy?slug=lead-drop", { method: "POST", headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN }, body: form });
  if (!r.ok) throw new Error("Deploying lead-drop failed: " + r.status + " " + (await r.text()).slice(0, 300));
  console.log("function: lead-drop deployed (version " + ((await r.json()).version ?? "?") + ")");

  if (!process.argv.includes("--no-cron")) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/lead-drop";
    await sql.unsafe(`select cron.unschedule('lead-drop') where exists (select 1 from cron.job where jobname = 'lead-drop')`);
    await sql`select cron.schedule('lead-drop', '*/2 * * * *', ${"select net.http_post(url := '" + url + "', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), body := '{\"action\":\"tick\"}'::jsonb, timeout_milliseconds := 150000)"})`;
    console.log("cron: lead-drop every 2 minutes");
  }
} finally { await sql.end(); }
