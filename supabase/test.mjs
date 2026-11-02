// Runs both migrations on PGlite (real Postgres in WASM) with a stand-in for Supabase's auth and storage schemas,
// then checks access rules and every crm_call action against the answers sheet_sync.gs gave.
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
create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;`;

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log("  ✓ " + name); };
async function as(role, email) {
  const claims = JSON.stringify(role === "anon" ? { role: "anon" } : { role, email, sub: "00000000-0000-0000-0000-000000000001" });
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role ${role};`);
}
const call = async (body) => (await db.query("select public.crm_call($1::jsonb) as r", [JSON.stringify(body)])).rows[0].r;
const cells = async (tab, row) => (await db.query("select cells from public.crm_sheet where tab = $1 and row = $2", [tab, row])).rows[0]?.cells ?? [];

await db.exec(SHIM);
for (const f of readdirSync(join(here, "migrations")).sort()) await db.exec(readFileSync(join(here, "migrations", f), "utf8"));
// What setup.mjs writes from config: one account and the team list.
await db.exec(`insert into public.crm_sheet (tab,row,cells) values ('Our Accounts',4,array['Reyansh','@reyansh_x','','','1000','','','']),
  ('DM Templates',4,array['Reyansh','30','','','','','','','','','FALSE']); insert into public.crm_team values ('me@example.com');`);
console.log("migrations applied");

await ok("anonymous visitors can't read anything", async () => {
  await as("anon");
  await assert.rejects(db.query("select * from public.crm_sheet"), /permission denied/);
});
await ok("someone not on the team sees no rows and can't save", async () => {
  await as("authenticated", "stranger@example.com");
  assert.equal((await db.query("select count(*)::int n from public.crm_sheet")).rows[0].n, 0);
  assert.equal(await call({ action: "pause", on: true }), "bad pass");
});
await ok("a team member reads every tab", async () => {
  await as("authenticated", "me@example.com");
  const tabs = (await db.query("select distinct tab from public.crm_sheet order by tab")).rows.map((r) => r.tab);
  assert.deepEqual(tabs, ["Company", "Competitor People", "Competitors", "DM Pipeline", "DM Templates", "Founder Profiles", "Our Accounts", "Our Posts", "Post Engagers", "Post Tracking", "Target Accounts", "Their Posts"]);
  assert.equal((await cells("Our Posts", 3)).length, 28);
  assert.equal((await cells("Post Engagers", 3)).at(-1), "Why");
});
await ok("calendar: a new card lands on row 4 as a Draft on the calendar", async () => {
  assert.equal(await call({ action: "calSave", account: "Reyansh", date: "4 Nov 2026", time: "7:30 PM", cal: "Yes", status: "Draft", platform: "X", slot: "Founder" }), "ok 4");
  const c = await cells("Our Posts", 4);
  assert.deepEqual([c[0], c[1], c[2], c[3], c[4], c[14], c[25], c[27]], ["W1", "4 Nov 2026", "7:30 PM", "Reyansh", "X", "Draft", "Yes", "Founder"]);
});
await ok("calendar: edits need the right text snippet, and check every field", async () => {
  assert.equal(await call({ action: "calSave", row: 4, snippet: "", text: "Six months ago our outbound had a 1% reply rate." }), "ok 4");
  assert.equal(await call({ action: "calSave", row: 4, snippet: "wrong", text: "x" }), "row moved, reload");
  assert.equal(await call({ action: "calSave", row: 4, snippet: "six months ago our outbound had a 1% repl", time: "25:00" }), "bad time");
  assert.equal(await call({ action: "calSave", account: "Nobody", date: "4 Nov 2026" }), "pick an account");
});
await ok("posted: only links to our own account's posts", async () => {
  assert.match(await call({ action: "posted", row: 4, link: "https://x.com/someone_else/status/123" }), /not a post from @reyansh_x/);
  assert.equal(await call({ action: "posted", row: 4, link: "https://twitter.com/Reyansh_X/status/1855?s=20" }), "ok https://x.com/reyansh_x/status/1855");
  assert.equal((await cells("Our Posts", 4))[14], "Posted");
  assert.equal(await call({ action: "scheduled", row: 4, on: true }), "already posted");
});
await ok("add a post by hand, delete it, undo the delete", async () => {
  assert.equal(await call({ action: "addPost", account: "Reyansh", text: "A post we wrote ourselves", type: "Founder story", date: "2026-11-05", time: "9:00 AM" }), "ok 5");
  assert.equal((await cells("Our Posts", 5))[1], "5 Nov 2026");
  assert.equal(await call({ action: "deletePost", row: 5, snippet: "nope" }), "row moved, reload");
  assert.equal(await call({ action: "deletePost", row: 5, snippet: "a post we wrote ourselves" }), "ok");
  assert.equal((await cells("Our Posts", 5))[14], "Deleted");
  assert.equal(await call({ action: "restorePost", row: 5, status: "Ready to post" }), "ok");
  assert.equal((await cells("Our Posts", 5))[14], "Ready to post");
  assert.equal(await call({ action: "movePost", row: 5, snippet: "a post we wrote ourselves", date: "6 Nov 2026", time: "" }), "ok");
  assert.deepEqual((await cells("Our Posts", 5)).slice(0, 3), ["W1", "6 Nov 2026", "Option"]);
});
await ok("DM Pipeline: only plain columns, only when the name still matches; dates stored as the sheet showed them", async () => {
  await as("service_role");
  assert.equal(await call({ action: "rows", writes: [{ row: 4, col: 3, values: [["Priya Raman", "Loopline", "Head of Growth", "Reyansh", "X DM"]] }] }), "ok 1 rows");
  assert.match(await call({ action: "rows", writes: [{ row: 4, col: 1, values: [["9"]] }] }), /refused write/);
  await as("authenticated", "me@example.com");
  assert.equal(await call({ action: "pipeline", row: 4, name: "Someone else", company: "Loopline", cells: { Status: "Sent" } }), "row moved, reload");
  const serial = 46330.8125; // 4 Nov 2026, 19:30
  assert.equal(await call({ action: "pipeline", row: 4, name: "Priya Raman", company: "Loopline", cells: { Status: "Sent", "Sent on": serial, Priority: "99" } }), "ok 2");
  const c = await cells("DM Pipeline", 4);
  assert.equal(c[18], "Sent"); assert.equal(c[19], "4 Nov 2026, 19:30"); assert.equal(c[0] ?? "", "");
});
await ok("pause switch, engagers, refresh", async () => {
  assert.equal(await call({ action: "pause", on: true }), "ok");
  assert.equal((await cells("DM Templates", 4))[10], "TRUE");
  await as("service_role");
  assert.match(await call({ action: "track", posts: [], snapshots: [["2026-11-04 21:00", "Reyansh", "https://x.com/reyansh_x/status/1855", "1200", "30", "4", "2", "0", "1", "512"]],
    engagers: [["4 Nov 2026", "Reyansh", "https://x.com/reyansh_x/status/1855", "Six months ago…", "Replied", "@tom", "Tom", "Founder", "3200", "Yes", "Great point", "https://x.com/tom/status/9", "Good fit", "Reyansh", "Hi Tom", "To message", "", "Agreed", "DM + reply", "Founder at a buyer"]] }),
    /ok 0 posts, 1 snapshots, 1 new people/);
  assert.match(await call({ action: "track", engagers: [["4 Nov 2026", "Reyansh", "https://x.com/reyansh_x/status/1855", "", "Replied", "@tom"]] }), /0 new people/);
  await as("authenticated", "me@example.com");
  assert.equal(await call({ action: "messaged", row: 4, handle: "@TOM" }), "ok");
  assert.equal((await cells("Post Engagers", 4))[15], "Messaged");
  assert.equal(await call({ action: "engager", row: 4, handle: "@tom", status: "Dismissed" }), "ok");
  assert.equal(await call({ action: "engager", row: 4, handle: "@tom", status: "Gone" }), "bad status");
  assert.equal(await call({ action: "refresh" }), "ok");
  assert.equal(await call({ action: "refreshCheck" }), "bad token");
  await as("service_role");
  assert.match(await call({ action: "refreshCheck" }), /^yes \d+$/);
  assert.equal(await call({ action: "refreshCheck" }), "no");
});
await ok("members can't write the tables directly, only through crm_call", async () => {
  await as("authenticated", "me@example.com");
  await assert.rejects(db.query("update public.crm_sheet set cells = '{}' where tab = 'Our Posts'"), /permission denied/);
  await assert.rejects(db.query("insert into public.crm_team values ('friend@example.com')"), /permission denied/);
});
console.log(`\n${passed} checks passed`);
