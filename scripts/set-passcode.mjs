// Sets (or changes) the CRM passcode (16 Nov). The CRM signs in to one shared team account (teamLogin in crm/config.json)
// whose password is the passcode, so Supabase checks it and the passcode never sits in the public page or in any file.
// Usage: node scripts/set-passcode.mjs   (asks for the passcode without showing it)
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const cfg = JSON.parse(readFileSync(new URL("../crm/config.json", import.meta.url), "utf8"));
const email = String(cfg.teamLogin || "").trim().toLowerCase();
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first."); process.exit(1); }
if (!email) { console.error("Add \"teamLogin\" to crm/config.json first."); process.exit(1); }

function ask(q) {
  return new Promise((resolve) => {
    process.stdout.write(q);
    const s = process.stdin; let v = "";
    if (!s.isTTY) { let all = ""; s.on("data", (d) => (all += d)); s.on("end", () => resolve(all.split(/\r?\n/)[0])); return; }
    s.setRawMode(true); s.resume(); s.setEncoding("utf8");
    const on = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") { s.setRawMode(false); s.pause(); s.off("data", on); process.stdout.write("\n"); return resolve(v); }
        if (c === "\u0003") { process.stdout.write("\n"); process.exit(1); }
        if (c === "\u007f" || c === "\b") { if (v) { v = v.slice(0, -1); process.stdout.write("\b \b"); } continue; }
        v += c; process.stdout.write("*");
      }
    };
    s.on("data", on);
  });
}

const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
const pass = await ask("New CRM passcode: ");
if (pass.length < 6) { console.error("Use at least 6 characters."); process.exit(1); }
const again = await ask("Type it again: ");
if (again !== pass) { console.error("The two didn't match. Nothing changed."); process.exit(1); }

// Find the team account, then create it or change its password.
let id = null;
for (let page = 1; page <= 20 && !id; page++) {
  const r = await fetch(url + "/auth/v1/admin/users?per_page=200&page=" + page, { headers: H });
  const b = await r.json().catch(() => ({}));
  const users = b.users || [];
  const u = users.find((x) => String(x.email || "").toLowerCase() === email);
  if (u) id = u.id;
  if (users.length < 200) break;
}
const res = id
  ? await fetch(url + "/auth/v1/admin/users/" + id, { method: "PUT", headers: H, body: JSON.stringify({ password: pass, email_confirm: true }) })
  : await fetch(url + "/auth/v1/admin/users", { method: "POST", headers: H, body: JSON.stringify({ email, password: pass, email_confirm: true }) });
if (!res.ok) {
  const b = await res.json().catch(() => ({}));
  console.error("Supabase said no:", res.status, b.msg || b.message || b.error_description || "");
  process.exitCode = 1;
} else {
  // The team list decides who can read and save; the shared account must be on it.
  const t = await fetch(url + "/rest/v1/crm_team", { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify([{ email }]) });
  if (!t.ok) { console.error("Passcode set, but adding " + email + " to the team list failed:", t.status, (await t.text()).slice(0, 200)); process.exitCode = 1; }
  else console.log((id ? "Passcode changed." : "Passcode set.") + " Open the CRM and type it in.");
}
