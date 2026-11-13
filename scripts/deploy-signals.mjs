// 14 Nov: the three new signals on li-bot. Sets VISITOR_KEY (website visitor webhook, saved in .env.local and printed to
// _research/VISITOR_HOOK.txt), and schedules the daily funding search (8:30 IST). Run scripts/deploy-li-bot.mjs for the code.
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
const envPath = new URL("../.env.local", import.meta.url);
const env = Object.fromEntries(readFileSync(envPath, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, "")]));
if (!env.VISITOR_KEY) { env.VISITOR_KEY = randomBytes(18).toString("hex"); appendFileSync(envPath, "\nVISITOR_KEY=" + env.VISITOR_KEY + "\n"); }
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)/)[1];
const r = await fetch("https://api.supabase.com/v1/projects/" + ref + "/secrets", { method: "POST", headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify([{ name: "VISITOR_KEY", value: env.VISITOR_KEY }]) });
if (!r.ok) throw new Error("Saving VISITOR_KEY failed: " + r.status);
writeFileSync(new URL("../_research/VISITOR_HOOK.txt", import.meta.url), "Website visitor webhook (paste into RB2B > Integrations > Webhook):\nhttps://" + ref + ".supabase.co/functions/v1/li-bot?visitor=" + env.VISITOR_KEY + "\n");
console.log("secret: VISITOR_KEY saved; webhook URL in _research/VISITOR_HOOK.txt (gitignored)");
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1 });
await sql`select cron.unschedule(jobid) from cron.job where jobname = 'li-bot-funding'`;
const call = "select net.http_post(url := 'https://" + ref + ".supabase.co/functions/v1/li-bot', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), body := '{\"action\":\"funding\"}'::jsonb, timeout_milliseconds := 150000)";
await sql`select cron.schedule('li-bot-funding', '0 3 * * *', ${call})`;   // 03:00 UTC = 8:30 IST
console.log("schedule: li-bot-funding, daily 8:30 IST");
// (14 Nov) Launches (Product Hunt, Show HN, Launch HN) at 9:00 IST, hiring posts at 9:30 IST, and the LinkedIn top-up to 20 new
// people a day at 7:00 and again at 13:00 IST (after the approvals of the morning), each on its own run.
for (const [name, at, action] of [["li-bot-launches", "30 3 * * *", "launches"], ["li-bot-hiring", "0 4 * * *", "hiring"], ["li-bot-prospects", "30 1 * * *", "prospects"], ["li-bot-prospects-2", "30 7 * * *", "prospects"]]) {
  await sql`select cron.unschedule(jobid) from cron.job where jobname = ${name}`;
  const c = "select net.http_post(url := 'https://" + ref + ".supabase.co/functions/v1/li-bot', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), body := '{\"action\":\"" + action + "\",\"max\":6}'::jsonb, timeout_milliseconds := 150000)";
  await sql`select cron.schedule(${name}, ${at}, ${c})`;
  console.log("schedule: " + name + " " + at + " UTC");
}
await sql.end();
