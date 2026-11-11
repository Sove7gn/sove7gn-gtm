// Puts the daily brief live (11 Nov): table crm_briefs, Edge Function daily-brief, and its 8:00 IST schedule (02:30 UTC).
// Also redeploys li-bot (its cal.com hook now saves the Meet link). Prints names only, never secrets.
// Usage: node scripts/deploy-brief.mjs [--no-run]
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "DATABASE_URL", "CRON_SECRET", "COMPOSIO_API_KEY"])
  if (!env[k]) { console.error(k + " is empty in .env.local."); process.exit(1); }
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const api = (path, init = {}) => fetch("https://api.supabase.com/v1/projects/" + ref + path, { ...init, headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN, ...(init.headers || {}) } });

const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await sql.unsafe(`
    create table if not exists public.crm_briefs (day date primary key, data jsonb not null, made_at timestamptz not null default now());
    alter table public.crm_briefs enable row level security;
    drop policy if exists team_read on public.crm_briefs;
    create policy team_read on public.crm_briefs for select using ((select crm_is_member()));`);
  console.log("table: crm_briefs ready");

  for (const slug of ["daily-brief"]) {
    const form = new FormData();
    form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: slug, verify_jwt: false }));
    form.append("file", new Blob([readFileSync(new URL("../supabase/functions/" + slug + "/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
    const r = await api("/functions/deploy?slug=" + slug, { method: "POST", body: form });
    if (!r.ok) throw new Error("Deploying " + slug + " failed: " + r.status + " " + (await r.text()).slice(0, 300));
    console.log("function: " + slug + " deployed (version " + ((await r.json()).version ?? "?") + ")");
  }

  await sql`select cron.unschedule(jobid) from cron.job where jobname = 'daily-brief'`;
  const call = "select net.http_post(url := 'https://" + ref + ".supabase.co/functions/v1/daily-brief', " +
    "headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), " +
    "body := '{}'::jsonb, timeout_milliseconds := 150000)";
  await sql`select cron.schedule('daily-brief', '30 2 * * *', ${call})`;
  console.log("schedule: daily-brief, 8:00 IST every day");
} finally { await sql.end(); }

if (!process.argv.includes("--no-run")) {
  const r = await fetch("https://" + ref + ".supabase.co/functions/v1/daily-brief", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": env.CRON_SECRET }, body: "{}" });
  console.log("first run: " + r.status + " " + (await r.text()).slice(0, 300));
}
