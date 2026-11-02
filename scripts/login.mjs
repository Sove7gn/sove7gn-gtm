// Signs you in without an email: asks Supabase (with the service key in .env.local) for a one-time sign-in link
// for a team email and opens it in Chrome. The link is never printed. Usage: pnpm login [email] [--check]
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SITE = "https://sove7gn.github.io/sove7gn-gtm/";
const args = process.argv.slice(2);
const check = args.includes("--check");
const email = (args.find((a) => a.includes("@")) || env.CRM_TEAM_EMAILS.split(/[,\s]+/)[0] || "").toLowerCase();
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !email) { console.error("Fill NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CRM_TEAM_EMAILS in .env.local first."); process.exit(1); }

const res = await fetch(url + "/auth/v1/admin/generate_link", {
  method: "POST",
  headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email, redirect_to: SITE }),
});
const body = await res.json().catch(() => ({}));
const link = body.action_link || body.properties?.action_link;
// Ends by falling off the script, not process.exit(): exiting right after fetch() crashes Node on Windows.
if (!res.ok || !link) {
  console.error("Supabase said no:", res.status, body.msg || body.message || body.error_description || "");
  process.exitCode = 1;
} else if (check) {
  console.log("Link ready for " + email + ", returning to " + new URL(link).searchParams.get("redirect_to"));
} else {
  // Pass the link through an environment variable so no shell ever parses its & characters.
  const ps = "try { Start-Process chrome -ArgumentList $env:CRM_LINK -ErrorAction Stop } catch { Start-Process $env:CRM_LINK }";
  spawnSync("powershell", ["-NoProfile", "-Command", ps], { env: { ...process.env, CRM_LINK: link }, stdio: "inherit" });
  console.log("Opened a sign-in link for " + email + " in Chrome. It works once and expires in an hour.");
}
