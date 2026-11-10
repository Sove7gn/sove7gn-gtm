// Puts the LinkedIn bot's backend live (11 Nov): li-bot (the brain the Chrome extension talks to) and social-sync
// (which now also takes engagers from the extension instead of Apify). Makes a bot key the first time and saves it in
// .env.local (LI_BOT_TOKEN) and _research/LI_BOT_KEY.txt (paste it into the extension). Safe to run again.
// Prints names only, never secrets. Usage: node scripts/deploy-li-bot.mjs
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

const envPath = new URL("../.env.local", import.meta.url);
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "CRON_SECRET", "COMPOSIO_API_KEY", "EXA_API_KEY"])
  if (!env[k]) { console.error(k + " is empty in .env.local."); process.exit(1); }
if (!env.LI_BOT_TOKEN) {
  env.LI_BOT_TOKEN = "lib_" + randomBytes(24).toString("hex");
  appendFileSync(envPath, "\nLI_BOT_TOKEN=" + env.LI_BOT_TOKEN + "\n");
  console.log("bot key: made and saved to .env.local");
}
if (!env.CAL_WEBHOOK_SECRET) {
  env.CAL_WEBHOOK_SECRET = randomBytes(16).toString("hex");
  appendFileSync(envPath, "CAL_WEBHOOK_SECRET=" + env.CAL_WEBHOOK_SECRET + "\n");
  console.log("cal.com webhook secret: made and saved to .env.local");
}
const keyFile = new URL("../_research/LI_BOT_KEY.txt", import.meta.url);
writeFileSync(keyFile, "Bot key (paste into the extension):\n" + env.LI_BOT_TOKEN + "\n\ncal.com webhook secret (paste into cal.com > Settings > Developer > Webhooks):\n" +
  env.CAL_WEBHOOK_SECRET + "\n\ncal.com subscriber URL:\n" + env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/li-bot?cal=1\n");
console.log("keys: written to _research/LI_BOT_KEY.txt (gitignored)");

const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const api = (path, init = {}) => fetch("https://api.supabase.com/v1/projects/" + ref + path, { ...init, headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN, ...(init.headers || {}) } });
let r = await api("/secrets", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(["LI_BOT_TOKEN", "CAL_WEBHOOK_SECRET", "CRON_SECRET", "COMPOSIO_API_KEY", "EXA_API_KEY"].map((name) => ({ name, value: env[name] }))) });
if (!r.ok) throw new Error("Saving secrets failed: " + r.status);
console.log("secrets: LI_BOT_TOKEN, CAL_WEBHOOK_SECRET saved");

for (const slug of ["li-bot", "social-sync"]) {
  const form = new FormData();
  form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: slug, verify_jwt: false }));
  form.append("file", new Blob([readFileSync(new URL("../supabase/functions/" + slug + "/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
  r = await api("/functions/deploy?slug=" + slug, { method: "POST", body: form });
  if (!r.ok) throw new Error("Deploying " + slug + " failed: " + r.status + " " + (await r.text()).slice(0, 300));
  console.log("function: " + slug + " deployed (version " + ((await r.json()).version ?? "?") + ")");
}
if (!existsSync(keyFile)) console.log("warning: key file missing");

// Call briefs: every 15 minutes, any lead moved to Call booked gets researched and a call plan written (runs without the extension).
if (env.DATABASE_URL) {
  const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
  try {
    await sql`select cron.unschedule(jobid) from cron.job where jobname = 'li-bot-briefs'`;
    const call = "select net.http_post(url := 'https://" + ref + ".supabase.co/functions/v1/li-bot', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), body := '{\"action\":\"briefs\"}'::jsonb, timeout_milliseconds := 150000)";
    await sql`select cron.schedule('li-bot-briefs', '*/15 * * * *', ${call})`;
    console.log("schedule: li-bot-briefs, every 15 minutes");
  } finally { await sql.end(); }
}

