// Puts the automatic post tracking live in Supabase: stores the Apify and Exa keys as function secrets, deploys the
// social-sync Edge Function, and schedules it twice a day (9:00 and 21:00 IST) with pg_cron. Safe to run again.
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ACCESS_TOKEN, DATABASE_URL, APIFY_TOKEN, EXA_API_KEY.
// Prints names only, never secrets.
import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

const envFile = new URL("../.env.local", import.meta.url);
const env = {};
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "DATABASE_URL", "APIFY_TOKEN", "EXA_API_KEY"])
  if (!env[k]) { console.error(k + " is empty in .env.local."); process.exit(1); }
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
if (!env.CRON_SECRET) {   // shared only between the schedule and the function
  env.CRON_SECRET = randomBytes(24).toString("hex");
  appendFileSync(envFile, "\n# Lets the twice-daily schedule start the tracking job (made by deploy-automation.mjs)\nCRON_SECRET=" + env.CRON_SECRET + "\n");
}
const api = (path, init = {}) => fetch("https://api.supabase.com/v1/projects/" + ref + path, { ...init, headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN, ...(init.headers || {}) } });

let r = await api("/secrets", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(["APIFY_TOKEN", "EXA_API_KEY", "CRON_SECRET"].map((name) => ({ name, value: env[name] }))) });
if (!r.ok) throw new Error("Saving secrets failed: " + r.status + " " + (await r.text()).slice(0, 200));
console.log("secrets: APIFY_TOKEN, EXA_API_KEY, CRON_SECRET saved");

const form = new FormData();
form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "social-sync", verify_jwt: false }));
form.append("file", new Blob([readFileSync(new URL("../supabase/functions/social-sync/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
r = await api("/functions/deploy?slug=social-sync", { method: "POST", body: form });
if (!r.ok) throw new Error("Deploying the function failed: " + r.status + " " + (await r.text()).slice(0, 300));
console.log("function: social-sync deployed (version " + ((await r.json()).version ?? "?") + ")");

const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await sql`create extension if not exists pg_cron`;
  await sql`create extension if not exists pg_net`;
  await sql`select cron.unschedule(jobid) from cron.job where jobname = 'social-sync'`;
  const call = "select net.http_post(url := 'https://" + ref + ".supabase.co/functions/v1/social-sync', " +
    "headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), " +
    "body := '{}'::jsonb, timeout_milliseconds := 150000)";
  await sql`select cron.schedule('social-sync', '30 3,15 * * *', ${call})`;   // 03:30 and 15:30 UTC = 9:00 and 21:00 IST
  console.log("schedule: twice a day, 9:00 and 21:00 IST");
} finally { await sql.end(); }
