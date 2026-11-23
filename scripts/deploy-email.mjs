// Puts the email pipeline's server live (23 Nov): saves the mail keys as function secrets (from the outreach folder's .env, names
// only are printed), deploys the email-bot function (index.ts + mail.ts), and schedules it every 5 minutes. The bot starts
// paused (settings row 'email_bot'), so nothing is sent until Resume in the CRM. Safe to run again.
// Usage: node scripts/deploy-email.mjs [--no-cron]
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

const read = (u) => { const o = {}; for (const line of readFileSync(u, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return o; };
const env = read(new URL("../.env.local", import.meta.url));
const outreachEnv = new URL("../../sove7gn-outreach/.env", import.meta.url);
const keys = existsSync(outreachEnv) ? read(outreachEnv) : {};
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "CRON_SECRET", "DATABASE_URL"]) if (!env[k]) { console.error(k + " is empty in .env.local."); process.exit(1); }
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const H = { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN };

const names = ["MILLIONVERIFIER_API_KEY", "APP_PASSWORD_GETSOVE7GN", "APP_PASSWORD_TRYSOVE7GN", "APP_PASSWORD_SOVE7GNHQ", "APP_PASSWORD_JOINSOVE7GN"];
const secrets = names.filter((n) => keys[n]).map((n) => ({ name: n, value: keys[n] }));
const missing = names.filter((n) => !keys[n]);
if (secrets.length) {
  const r = await fetch("https://api.supabase.com/v1/projects/" + ref + "/secrets", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(secrets) });
  if (!r.ok) throw new Error("Saving secrets failed: " + r.status);
  console.log("secrets saved: " + secrets.map((s) => s.name).join(", "));
}
if (missing.length) console.log("NOT set (empty in the outreach .env): " + missing.join(", "));

const form = new FormData();
form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "email-bot", verify_jwt: false }));
for (const f of ["index.ts", "mail.ts"]) form.append("file", new Blob([readFileSync(new URL("../supabase/functions/email-bot/" + f, import.meta.url))], { type: "application/typescript" }), f);
const d = await fetch("https://api.supabase.com/v1/projects/" + ref + "/functions/deploy?slug=email-bot", { method: "POST", headers: H, body: form });
if (!d.ok) throw new Error("Deploying email-bot failed: " + d.status + " " + (await d.text()).slice(0, 300));
console.log("function: email-bot deployed (version " + ((await d.json()).version ?? "?") + ")");

const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  const tpl = JSON.stringify({}).replace(/'/g, "''");
  await sql.unsafe(`insert into public.crm_lead_settings (key, value) values ('email_templates', '${tpl}'::jsonb) on conflict (key) do nothing`);
  if (!process.argv.includes("--no-cron")) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/email-bot";
    await sql.unsafe(`select cron.unschedule('email-tick') where exists (select 1 from cron.job where jobname = 'email-tick')`);
    await sql`select cron.schedule('email-tick', '*/5 * * * *', ${"select net.http_post(url := '" + url + "', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '" + env.CRON_SECRET + "'), body := '{\"action\":\"tick\"}'::jsonb, timeout_milliseconds := 150000)"})`;
    console.log("cron: email-tick every 5 minutes (the bot is paused until you press Resume)");
  }
} finally { await sql.end(); }
