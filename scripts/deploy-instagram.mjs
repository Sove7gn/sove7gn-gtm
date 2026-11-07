// Puts the Instagram DM tracking live in Supabase: checks the Composio key can see the Instagram accounts, applies new
// database changes, stores the key as a function secret, deploys the ig-sync Edge Function, schedules it every hour with
// pg_cron, and runs it once. Safe to run again.
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ACCESS_TOKEN, DATABASE_URL, CRON_SECRET, COMPOSIO_API_KEY.
// Prints names and counts only, never secrets or messages.
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { setup } from "../supabase/setup.mjs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "DATABASE_URL", "CRON_SECRET", "COMPOSIO_API_KEY"])
  if (!env[k]) { console.error(k + " is empty in .env.local." + (k === "CRON_SECRET" ? " Run node scripts/deploy-automation.mjs once first." : "")); process.exit(1); }
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const api = (path, init = {}) => fetch("https://api.supabase.com/v1/projects/" + ref + path, { ...init, headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN, ...(init.headers || {}) } });

// 1. The Composio key (the ck_ key of Composio "For You") works and sees connected Instagram accounts.
let r = await fetch("https://connect.composio.dev/mcp", { method: "POST",
  headers: { "x-consumer-api-key": env.COMPOSIO_API_KEY, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "COMPOSIO_MANAGE_CONNECTIONS", arguments: { toolkits: [{ name: "instagram", action: "list" }] } } }) });
if (!r.ok) { console.error("Composio didn't accept the key (" + r.status + "). Copy the ck_ key again from Composio → For You → Install."); process.exit(1); }
const txt = await r.text();
const accts = JSON.parse(JSON.parse((txt.match(/^data: (.*)$/m) || [, txt])[1]).result?.content?.[0]?.text || "{}").data?.results?.instagram?.accounts ?? [];
const n = accts.filter((a) => a.status === "active").length;
console.log("composio: key works, " + n + " Instagram account" + (n === 1 ? "" : "s") + " connected");
if (!n) { console.error("No Instagram accounts are connected in Composio. Connect them first."); process.exit(1); }
if (!env.APIFY_TOKEN) { console.error("APIFY_TOKEN is empty in .env.local (it looks up follower counts)."); process.exit(1); }

// 2. Database changes (only the ones not applied yet).
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await setup(sql, { log: (s) => s.startsWith("apply") && console.log("database: " + s) });

  // 3. Secret and function.
  r = await api("/secrets", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(["COMPOSIO_API_KEY", "APIFY_TOKEN", "CRON_SECRET"].map((name) => ({ name, value: env[name] }))) });
  if (!r.ok) throw new Error("Saving secrets failed: " + r.status + " " + (await r.text()).slice(0, 200));
  console.log("secrets: COMPOSIO_API_KEY, APIFY_TOKEN, CRON_SECRET saved");
  const form = new FormData();
  form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "ig-sync", verify_jwt: false }));
  form.append("file", new Blob([readFileSync(new URL("../supabase/functions/ig-sync/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
  r = await api("/functions/deploy?slug=ig-sync", { method: "POST", body: form });
  if (!r.ok) throw new Error("Deploying the function failed: " + r.status + " " + (await r.text()).slice(0, 300));
  console.log("function: ig-sync deployed (version " + ((await r.json()).version ?? "?") + ")");

  // 4. Every hour, at a quarter past.
  await sql`create extension if not exists pg_cron`;
  await sql`create extension if not exists pg_net`;
  await sql`select cron.unschedule(jobid) from cron.job where jobname = 'ig-sync'`;
  const call = "select net.http_post(url := 'https://" + ref + ".supabase.co/functions/v1/ig-sync', " +
    "headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), " +
    "body := '{}'::jsonb, timeout_milliseconds := 150000)";
  await sql`select cron.schedule('ig-sync', '15 * * * *', ${call})`;
  console.log("schedule: every hour at :15");
} finally { await sql.end(); }

// 5. A first run now (later runs keep going back through the last 30 days until they've caught up).
if (process.argv.includes("--no-run")) { console.log("first run: skipped (--no-run)"); process.exit(0); }
console.log("first run: reading DMs (up to two minutes)…");
r = await fetch("https://" + ref + ".supabase.co/functions/v1/ig-sync", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": env.CRON_SECRET }, body: "{}" });
const out = await r.json().catch(() => ({}));
if (!r.ok || out.error) { console.error("first run failed: " + (out.error ?? r.status)); process.exit(1); }
if (out.skipped) console.log("first run: " + out.skipped);
else console.log("first run: " + out.threads_read + " threads read, " + out.leads_added + " leads added, " + out.filtered + " filtered out, " + out.messages_logged + " messages logged; " +
  Object.entries(out.accounts ?? {}).map(([a, s]) => "@" + a + (s.caught_up ? " caught up" : " still going back")).join(", "));
