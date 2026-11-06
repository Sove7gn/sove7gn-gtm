// Sets up the Supabase database: applies supabase/migrations/*.sql once each, then writes the accounts from
// crm/config.json (Our Accounts rows 4-6, DM Templates rows 4-6), and from .env.local the team emails (CRM_TEAM_EMAILS)
// and the LinkedIn queue sheet (LINKEDIN_SHEET_ID, kept in the members-only Settings tab).
// Reads DATABASE_URL from the environment or .env.local. Prints names only, never secrets.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const root = join(here, "..");
const env = {};
if (existsSync(join(root, ".env.local"))) {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const cfg = JSON.parse(readFileSync(join(root, "crm", "config.json"), "utf8"));
const team = String(process.env.CRM_TEAM_EMAILS || env.CRM_TEAM_EMAILS || "").split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function setup(sql, { log = console.log } = {}) {
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._migrations enable row level security`;
  const done = new Set((await sql`select name from public._migrations`).map((r) => r.name));
  const dir = join(here, "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) { log(`skip  ${f}`); continue; }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, f), "utf8"));
      await tx`insert into public._migrations (name) values (${f})`;
    });
    log(`apply ${f}`);
  }
  // Accounts: Our Accounts rows 4-6 (name, @handle, target) and DM Templates rows 4-6 (name, daily target 30, not paused).
  const accounts = (cfg.accounts || []).slice(0, 3);
  for (const [i, a] of accounts.entries()) {
    const handle = a.x ? "@" + String(a.x).replace(/^@/, "") : "";
    await sql`insert into public.crm_sheet (tab, row, cells) values ('Our Accounts', ${4 + i},
      ${[a.name, handle, "", "", String((cfg.pilot || {}).followerTarget || ""), "", "", ""]})
      on conflict (tab, row) do update set cells[1] = excluded.cells[1], cells[2] = excluded.cells[2], updated_at = now()`;
    await sql`insert into public.crm_sheet (tab, row, cells) values ('DM Templates', ${4 + i},
      ${[a.name, "30", "", "", "", "", "", "", "", "", "FALSE"]}) on conflict (tab, row) do nothing`;
  }
  log(`accounts: ${accounts.map((a) => a.name).join(", ") || "none"}`);
  await sql`insert into public.crm_state (key, value) values ('pilot_start', ${(cfg.pilot || {}).start || "2026-11-02"})
    on conflict (key) do update set value = excluded.value`;
  // Settings tab (members only): the LinkedIn queue sheet the calendar and tracker read in LinkedIn mode.
  const liSheet = String(process.env.LINKEDIN_SHEET_ID || env.LINKEDIN_SHEET_ID || "").trim();
  const settings = [["Settings"], ["Private settings for the CRM page. Only signed-in team members can read this tab."], ["Key", "Value"]];
  if (liSheet) settings.push(["LinkedIn sheet", liSheet]);
  for (const [i, cells] of settings.entries())
    await sql`insert into public.crm_sheet (tab, row, cells) values ('Settings', ${i + 1}, ${cells})
      on conflict (tab, row) do update set cells = excluded.cells, updated_at = now()`;
  log(`LinkedIn sheet: ${liSheet ? "set" : "not set"}`);
  // Automation (Leads): fill in our LinkedIn profile, who we sell to and the owner, but never overwrite what Setup changed.
  const auto = cfg.automation || {};
  if (auto.linkedin_profile || auto.icp) {
    const fill = { linkedin_profile: auto.linkedin_profile || "", icp: auto.icp || "", owner: (cfg.accounts || [])[0]?.name || "" };
    await sql`update public.crm_lead_settings set value = ${sql.json(fill)}::jsonb || value
      || jsonb_strip_nulls(jsonb_build_object(
        'linkedin_profile', case when coalesce(value->>'linkedin_profile','') = '' then ${fill.linkedin_profile}::text end,
        'icp', case when coalesce(value->>'icp','') = '' then ${fill.icp}::text end,
        'owner', case when coalesce(value->>'owner','') = '' then ${fill.owner}::text end))
      where key = 'automation'`;
  }
  for (const email of team) await sql`insert into public.crm_team (email) values (${email}) on conflict do nothing`;
  log(`team emails: ${team.length}`);
}

if (process.argv[1] && process.argv[1].endsWith("setup.mjs")) {
  const url = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is empty. Paste the Supabase session-pooler connection string into .env.local."); process.exit(1); }
  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
  try { await setup(sql); console.log("Supabase is set up."); } finally { await sql.end(); }
}
