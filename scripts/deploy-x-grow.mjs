// Puts the x-grow job live (15 Nov, the 10K followers plan): reply targets every hour from 7 AM to 9 PM New York time
// (12:10 to 02:10 UTC), new followers every 6 hours. Uses the secrets deploy-x.mjs already saved. Prints names only.
// Usage: node scripts/deploy-x-grow.mjs [--no-run]
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const api = (path, init = {}) => fetch("https://api.supabase.com/v1/projects/" + ref + path, { ...init, headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN, ...(init.headers || {}) } });
const form = new FormData();
form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "x-grow", verify_jwt: false }));
form.append("file", new Blob([readFileSync(new URL("../supabase/functions/x-grow/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
const r = await api("/functions/deploy?slug=x-grow", { method: "POST", body: form });
if (!r.ok) throw new Error("Deploying x-grow failed: " + r.status + " " + (await r.text()).slice(0, 300));
console.log("function: x-grow deployed (version " + ((await r.json()).version ?? "?") + ")");

const url = env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/x-grow";
const JOBS = [
  { name: "x-grow-replies", cron: "10 12-23,0-2 * * *", body: { replies: true } },
  { name: "x-grow-followers", cron: "40 1,7,13,19 * * *", body: { followers: true } },
  { name: "x-grow-follow-src", cron: "30 2 * * *", body: { follow_src: true } },   // 8 AM IST: followers of our client's founders -> ICP check -> X > Pipeline > To approve
  { name: "x-grow-posts", cron: "0 11 * * *", body: { posts: true } },   // (19 Nov) writes TOMORROW's posts (a day ahead, so Reyansh can schedule them)
  { name: "x-grow-posts-retry", cron: "30 14 * * *", body: { posts: true } },   // second try for anything still empty (8 PM IST)   // 4:30 PM IST: AI tool (5:45 PM), News (6:30 PM), Thu Article (8:30 PM), Mon/Wed/Fri Shoutout (10:45 PM); placeholders a week ahead
];
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  for (const j of JOBS) {
    const call = `select net.http_post(url := '${url}', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','${env.CRON_SECRET}'), body := '${JSON.stringify(j.body)}'::jsonb, timeout_milliseconds := 150000)`;
    await sql`select cron.unschedule(jobid) from cron.job where jobname = ${j.name}`;
    await sql`select cron.schedule(${j.name}, ${j.cron}, ${call})`;
    console.log("schedule: " + j.name + " (" + j.cron + " UTC)");
  }
} finally { await sql.end(); }
if (!process.argv.includes("--no-run")) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": env.CRON_SECRET }, body: "{}" });
  console.log("first run:", res.status, (await res.text()).slice(0, 400));
}
