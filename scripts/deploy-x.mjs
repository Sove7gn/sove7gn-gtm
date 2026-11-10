// Puts the X jobs and the LinkedIn comment ideas job live in Supabase (9 Nov). li-engage: 10 founder posts to comment on, 7:45 IST.
// x-leads (finds 30 to 40 founders to DM, 7:30 and 12:30 IST) and x-engage
// (post numbers plus everyone who replied, quoted or mentioned us, every 6 hours). Uses the Apify and Exa keys and the
// cron secret that deploy-automation.mjs already saved. Safe to run again. Prints names only, never secrets.
// Usage: node scripts/deploy-x.mjs [--no-run]
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "DATABASE_URL", "APIFY_TOKEN", "EXA_API_KEY", "CRON_SECRET", "COMPOSIO_API_KEY"])
  if (!env[k]) { console.error(k + " is empty in .env.local. Run node scripts/deploy-automation.mjs first."); process.exit(1); }
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const api = (path, init = {}) => fetch("https://api.supabase.com/v1/projects/" + ref + path, { ...init, headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN, ...(init.headers || {}) } });

let r = await api("/secrets", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(["APIFY_TOKEN", "EXA_API_KEY", "CRON_SECRET", "COMPOSIO_API_KEY", ...(env.TWITTERAPI_KEY ? ["TWITTERAPI_KEY"] : [])].map((name) => ({ name, value: env[name] }))) });
if (!r.ok) throw new Error("Saving secrets failed: " + r.status);
console.log("secrets: APIFY_TOKEN, EXA_API_KEY, CRON_SECRET, COMPOSIO_API_KEY" + (env.TWITTERAPI_KEY ? ", TWITTERAPI_KEY (X now reads through twitterapi.io)" : "") + " saved");

const JOBS = [
  { slug: "x-leads", cron: "0 2,7 * * *", when: "7:30 and 12:30 IST" },     // 02:00 and 07:00 UTC
  { slug: "x-engage", cron: "45 0,6,12,18 * * *", when: "every 6 hours (6:15, 12:15, 18:15, 0:15 IST)" },
  { slug: "li-engage", cron: "15 2 * * *", when: "7:45 IST (10 LinkedIn posts to comment on)" },
];
for (const j of JOBS) {
  const form = new FormData();
  form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: j.slug, verify_jwt: false }));
  form.append("file", new Blob([readFileSync(new URL("../supabase/functions/" + j.slug + "/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
  r = await api("/functions/deploy?slug=" + j.slug, { method: "POST", body: form });
  if (!r.ok) throw new Error("Deploying " + j.slug + " failed: " + r.status + " " + (await r.text()).slice(0, 300));
  console.log("function: " + j.slug + " deployed (version " + ((await r.json()).version ?? "?") + ")");
}
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  for (const j of JOBS) {
    await sql`select cron.unschedule(jobid) from cron.job where jobname = ${j.slug}`;
    const call = "select net.http_post(url := 'https://" + ref + ".supabase.co/functions/v1/" + j.slug + "', " +
      "headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), " +
      "body := '{}'::jsonb, timeout_milliseconds := 150000)";
    await sql`select cron.schedule(${j.slug}, ${j.cron}, ${call})`;
    console.log("schedule: " + j.slug + ", " + j.when);
  }
} finally { await sql.end(); }
