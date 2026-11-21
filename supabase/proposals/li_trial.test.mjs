// Checks the PROPOSED li_trial.sql on PGlite (local, in-memory Postgres) after every real migration. Never touches Supabase.
// Usage: node supabase/proposals/li_trial.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const db = new PGlite();
const SHIM = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant all on sequences to service_role;
create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;`;
async function as(role, email) {
  const claims = JSON.stringify(role === "anon" ? { role: "anon" } : { role, email, sub: "00000000-0000-0000-0000-000000000001" });
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role ${role};`);
}
let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log("  ✓ " + name); };
const one = async (q, p = []) => (await db.query(q, p)).rows[0];

await db.exec(SHIM);
// Some tables (crm_x_tasks, crm_lead_drops, crm_briefs) are created by deploy scripts, not migrations: a stand-in is made
// when a migration needs one, and the migration is run again.
for (const f of readdirSync(join(here, "..", "migrations")).sort()) {
  for (let tries = 0; ; tries++) {
    try { await db.exec(readFileSync(join(here, "..", "migrations", f), "utf8")); break; }
    catch (e) {
      const m = String(e.message).match(/relation "(public\.[a-z_]+)" does not exist/);
      if (!m || tries > 5) throw e;
      await db.exec(`create table if not exists ${m[1]} (id bigserial primary key, row int, name text, company text, handle text, author text, user_id text, kind text, text text,
        status text, error text, decided_by text, created_at timestamptz default now(), claimed_at timestamptz, sent_at timestamptz, updated_at timestamptz default now());`);
    }
  }
}
await db.exec(`insert into public.crm_team values ('me@example.com');`);
await db.exec(readFileSync(join(here, "li_trial.sql"), "utf8"));
console.log("migrations + proposal applied");

const T = { note: "Hope you liked the post. Have 3 small ideas for {company}.", day0: "One thing I'd do at Acme this week.\n\nIdea one.\n\nQuick q: what part of lead gen are you still doing yourself?",
  fu3: "Curious, if you could fix one thing this quarter, is it getting found, getting replies, or getting calls booked?", fu5: "Said I'd send the other two.\n\nIdea two.\n\nIdea three.", fu8: "Had a founder in almost exactly your spot.", fu12: "Doesn't look like the timing's right, so I'll stop here." };
let id;

await ok("a team member adds a trial person; a stranger can't", async () => {
  await as("anon"); await assert.rejects(db.query("select public.crm_li_trial_add('A','CEO','Acme','https://www.linkedin.com/in/acme-ceo/', '{}'::jsonb)"));
  await as("authenticated", "me@example.com");
  id = (await one("select public.crm_li_trial_add($1,$2,$3,$4,$5::jsonb) as id", ["Alex Acme", "CEO", "Acme", "https://www.linkedin.com/in/Acme-CEO/", JSON.stringify(T)])).id;
  assert.equal((await one("select profile_key, stage from public.crm_li_trial where id=$1", [id])).profile_key, "acme-ceo");
});
await ok("someone already in the main pipeline can't be added", async () => {
  await as("service_role"); await db.query("insert into public.crm_leads (name, source, linkedin) values ('Old Lead','LinkedIn','https://www.linkedin.com/in/old-lead')");
  await as("authenticated", "me@example.com");
  await assert.rejects(db.query("select public.crm_li_trial_add('Old','CEO','X','https://www.linkedin.com/in/old-lead', '{}'::jsonb)"), /already in the main LinkedIn pipeline/);
});
await ok("approval is refused while a placeholder is left", async () => {
  await assert.rejects(db.query("select public.crm_li_trial_approve($1)", [id]), /placeholder/);
});
await ok("fixing the text, then approving, stores the scope and its hash", async () => {
  await db.query("select public.crm_li_trial_edit($1, $2::jsonb)", [id, JSON.stringify({ texts: { note: "Hope you liked the post. Have 3 small ideas for Acme." } })]);
  const h = (await one("select public.crm_li_trial_approve($1) as h", [id])).h;
  const r = await one("select stage, approved_hash, approved_snapshot from public.crm_li_trial where id=$1", [id]);
  assert.equal(r.stage, "approved"); assert.equal(r.approved_hash, h); assert.equal(r.approved_snapshot.texts.fu12, T.fu12);
  assert.equal(r.approved_snapshot.stops.length, 3);
});
await ok("the team can't write the table directly", async () => {
  await assert.rejects(db.query("update public.crm_li_trial set stage='closed' where id=$1", [id]), /permission denied/);
});
await ok("an edit after approval voids it (back to Ready to approve)", async () => {
  await db.query("select public.crm_li_trial_edit($1, $2::jsonb)", [id, JSON.stringify({ texts: { fu8: "Had a founder in almost exactly your spot, a few months back." } })]);
  assert.equal((await one("select stage, approved_hash from public.crm_li_trial where id=$1", [id])).stage, "ready");
  await db.query("select public.crm_li_trial_approve($1)", [id]);
});
await ok("the team can't claim work; only the executor (service role) can", async () => {
  await assert.rejects(db.query("select * from public.crm_li_trial_claim('instinct')"), /permission denied/);
});
await ok("while the executor is unverified, nothing can be claimed", async () => {
  await as("service_role");
  assert.equal((await db.query("select * from public.crm_li_trial_claim('instinct')")).rows.length, 0);
});
await ok("the one named test card can be claimed, by exactly one worker", async () => {
  await db.query("update public.crm_lead_settings set value = value || jsonb_build_object('test_item_id', $1::text) where key='li_trial'", [id]);
  const a = (await db.query("select * from public.crm_li_trial_claim('instinct')")).rows;
  const b = (await db.query("select * from public.crm_li_trial_claim('instinct-2')")).rows;
  assert.equal(a.length, 1); assert.equal(a[0].action, "send_request"); assert.equal(b.length, 0);
});
await ok("a text that doesn't match the approval locks the card (unknown), and that holds the channel", async () => {
  await db.query("select public.crm_li_trial_report($1,'instinct','sending')", [id]);
  await db.query("select public.crm_li_trial_report($1,'instinct','sent_verified',$2::jsonb)", [id, JSON.stringify({ sent_text: "something else" })]);
  assert.equal((await one("select action_state from public.crm_li_trial where id=$1", [id])).action_state, "unknown");
  assert.equal((await db.query("select * from public.crm_li_trial_claim('instinct')")).rows.length, 0);
});
await ok("only a team member can resolve an unknown outcome; 'sent' moves the stage on that evidence", async () => {
  await assert.rejects(db.query("select public.crm_li_trial_resolve($1,'sent')", [id]), /not allowed/);
  await as("authenticated", "me@example.com");
  await assert.rejects(db.query("select public.crm_li_trial_retry($1)", [id]), /Only a failed card/);
  await db.query("select public.crm_li_trial_resolve($1,'sent')", [id]);
  const r = await one("select stage, action_state, request_seen_at from public.crm_li_trial where id=$1", [id]);
  assert.equal(r.stage, "request_sent"); assert.equal(r.action_state, "idle"); assert.ok(r.request_seen_at);
});
await ok("texts are locked once the request is out", async () => {
  await assert.rejects(db.query("select public.crm_li_trial_edit($1,'{\"texts\":{\"fu3\":\"x\"}}'::jsonb)", [id]), /locked/);
});
await ok("time passing moves nothing: no Day 0 until the accept is seen", async () => {
  await as("service_role");
  assert.equal((await db.query("select * from public.crm_li_trial_claim('instinct')")).rows.length, 0);
  await db.query("select public.crm_li_trial_report($1,'instinct','accepted_seen')", [id]);
  const c = (await db.query("select * from public.crm_li_trial_claim('instinct')")).rows;
  assert.equal(c[0].action, "send_day0");
});
await ok("a verified Day 0 send moves the card; Day 3 isn't due yet", async () => {
  await db.query("select public.crm_li_trial_report($1,'instinct','sending')", [id]);
  await db.query("select public.crm_li_trial_report($1,'instinct','sent_verified',$2::jsonb)", [id, JSON.stringify({ sent_text: T.day0 })]);
  assert.equal((await one("select stage from public.crm_li_trial where id=$1", [id])).stage, "day0_sent");
  assert.equal((await db.query("select * from public.crm_li_trial_claim('instinct')")).rows.length, 0);
});
await ok("Day 3 becomes claimable 3 days after Day 0 was seen sent", async () => {
  await db.query("update public.crm_li_trial set day0_seen_at = now() - interval '3 days 1 minute' where id=$1", [id]);
  const c = (await db.query("select * from public.crm_li_trial_claim('instinct')")).rows; assert.equal(c[0].action, "send_fu3");
});
await ok("a reply seen before sending stops everything and routes to Reyansh", async () => {
  await db.query("select public.crm_li_trial_report($1,'instinct','released')", [id]);
  await db.query("select public.crm_li_trial_report($1,'instinct','reply_seen',$2::jsonb)", [id, JSON.stringify({ text: "not now, maybe January" })]);
  const r = await one("select stage, reply_text from public.crm_li_trial where id=$1", [id]);
  assert.equal(r.stage, "replied"); assert.equal(r.reply_text, "not now, maybe January");
  assert.equal((await db.query("select * from public.crm_li_trial_claim('instinct')")).rows.length, 0);
});
await ok("a platform warning pauses the channel; only a team member resumes it", async () => {
  await db.query("select public.crm_li_trial_report($1,'instinct','platform_warning',$2::jsonb)", [id, JSON.stringify({ what: "security check page" })]);
  assert.equal((await one("select value->>'state' s from public.crm_lead_settings where key='li_trial'")).s, "paused_needs_review");
  await as("authenticated", "me@example.com"); await db.query("select public.crm_li_trial_resume()");
  assert.equal((await one("select value->>'state' s from public.crm_lead_settings where key='li_trial'")).s, "active");
});
await ok("the guard: a trial person entering the main pipeline is archived and marked by hand", async () => {
  await as("service_role");
  await db.query("insert into public.crm_leads (name, source, linkedin, fields) values ('Alex Acme','LinkedIn','https://www.linkedin.com/in/acme-ceo','{}'::jsonb)");
  const r = await one("select archived, fields from public.crm_leads where linkedin like '%acme-ceo'");
  assert.equal(r.archived, true); assert.equal(r.fields.li.stop, "by hand");
});
await ok("every step is in the audit trail", async () => {
  const n = (await one("select count(*)::int n from public.crm_li_trial_events where trial_id=$1", [id])).n; assert.ok(n >= 12, "events: " + n);
});
console.log(passed + " checks passed");
