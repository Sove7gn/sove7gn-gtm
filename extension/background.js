// SOVE7GN LinkedIn Bot: runs in your Chrome while it's open.
// Every 20 minutes (sync): checks who engaged with our posts, who accepted, who replied, and asks the CRM what to send.
// Every 2 minutes (tick): sends at most one approved request or message, with random gaps, so it looks like a person.
import { liOp } from "./linkedin.js";

const FN = "https://rmadxyyvdiqdujuwecdt.supabase.co/functions/v1/li-bot";
const VERSION = chrome.runtime.getManifest().version;
const store = chrome.storage.local;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
let busy = false;
// A fresh worker means nothing is running (Chrome may have stopped the last one midway), so clear stale flags.
store.get("test").then(({ test }) => store.set({ syncing: false, ...(test && test.running ? { test: { ...test, running: false, lines: ["The last test was cut off. Press Test LinkedIn again."] } } : {}) }));

function setup() {
  chrome.alarms.create("sync", { periodInMinutes: 20, delayInMinutes: 1 });
  chrome.alarms.create("tick", { periodInMinutes: 2, delayInMinutes: 2 });
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener((a) => (a.name === "sync" ? sync(false) : tick()));
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m.cmd === "sync") { sync(true).then(reply); return true; }
  if (m.cmd === "test") { selfTest().then(reply, (e) => reply({ error: String(e.message || e) })); return true; }
});

async function log(line, isError = false) {
  const { logs = [] } = await store.get("logs");
  logs.unshift({ at: new Date().toISOString(), line, err: isError });
  await store.set({ logs: logs.slice(0, 40) });
  if (isError) chrome.action.setBadgeText({ text: "!" }), chrome.action.setBadgeBackgroundColor({ color: "#d93f00" });
}

async function api(action, body = {}) {
  const { key } = await store.get("key");
  if (!key) throw new Error("No bot key yet. Open the extension and paste it.");
  const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", "x-bot-token": key }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({ error: "li-bot answered " + r.status }));
  if (!r.ok || j.error) throw new Error(j.error || "li-bot answered " + r.status);
  return j;
}

// The bot works in its own pinned LinkedIn tab, so it never touches the tabs you're using. If that tab shows an error
// page (it failed to load, or Chrome put it to sleep), it's reloaded, and replaced if it still won't load.
async function botTab() {
  const { tabId } = await store.get("tabId");
  if (tabId) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (/linkedin\.com/.test(t.url || t.pendingUrl || "")) {
        if (t.discarded || t.status !== "complete") { await chrome.tabs.reload(t.id); await loaded(t.id); }
        if (await alive(t.id)) return t.id;
        await chrome.tabs.reload(t.id); await loaded(t.id); await sleep(2500);
        if (await alive(t.id)) return t.id;
        await log("The bot's LinkedIn tab wouldn't load (" + ((await chrome.tabs.get(t.id)).url || "").slice(0, 80) + "). Opening a fresh one.", true);
        await chrome.tabs.remove(t.id).catch(() => {});
      }
    } catch (_) {}
  }
  const t = await chrome.tabs.create({ url: "https://www.linkedin.com/feed/", active: false, pinned: true });
  await store.set({ tabId: t.id });
  await loaded(t.id); await sleep(2500);
  if (!(await alive(t.id))) throw new Error("LinkedIn won't load in Chrome right now. Open linkedin.com in a normal tab to check you're online and signed in.");
  return t.id;
}
async function alive(id) {
  try { const r = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", func: () => location.hostname }); return /linkedin\.com$/.test((r && r[0] && r[0].result) || ""); }
  catch (_) { return false; }
}
async function loaded(id) { for (let i = 0; i < 60; i++) { const t = await chrome.tabs.get(id); if (t.status === "complete") return; await sleep(500); } }
async function go(url) { const id = await botTab(); await chrome.tabs.update(id, { url }); await sleep(800); await loaded(id); await sleep(3000); }
async function op(name, args = {}) {
  let id = await botTab(), res;
  try { res = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", func: liOp, args: [name, args] }); }
  catch (e) {
    if (!/error page|Cannot access|No tab|frame/i.test(String(e.message))) throw e;
    await chrome.tabs.reload(id); await loaded(id); await sleep(3000);                 // one retry after a reload
    res = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", func: liOp, args: [name, args] });
  }
  const r = res && res[0];
  if (!r) throw new Error("LinkedIn tab didn't answer");
  if (r.error) throw new Error(r.error.message || String(r.error));
  return r.result;
}
const keepAlive = () => setInterval(() => chrome.runtime.getPlatformInfo(), 20e3);

// LinkedIn's comments call needs a query id that changes when LinkedIn ships a new version. Opening one of our posts makes
// the page use it, so it's read from there and kept until LinkedIn rejects it.
async function commentsQid(me, extra, force) {
  let { cqid, cqidAt = 0 } = await store.get(["cqid", "cqidAt"]);
  if (!force && (cqid || Date.now() - cqidAt < 24 * 3600e3)) return cqid || "";
  await store.set({ cqidAt: Date.now() });
  let id = (await op("latestPost", { me })).id || (extra || [])[0] || "";
  if (!id) return "";
  await go("https://www.linkedin.com/feed/update/urn:li:activity:" + id + "/");
  const q = await op("findQid");
  cqid = (q.qids || []).find((x) => /^voyagerSocialDashComments\./.test(x)) || "";
  await store.set({ cqid, qids_seen: q.qids || [] });
  await go("https://www.linkedin.com/feed/");
  return cqid;
}

// Opens each of our posts that has new comments and reads them off the page (a few seconds per post).
async function pageComments(me, e) {
  const { ccount = {} } = await store.get("ccount");
  const todo = (e.dom || []).filter((p) => p.n == null || (p.n > 0 && p.n !== ccount[p.id])).slice(0, 12);
  let added = 0, err = "";
  for (const p of todo) {
    try {
      await go("https://www.linkedin.com/feed/update/urn:li:activity:" + p.id + "/");
      const r = await op("domComments", { me });
      for (const c of r.list) {
        e.items.push({ type: "comment", postId: p.id, commentary: c.text, createdAt: null,
          actor: { id: c.id || c.pid, linkedinUrl: "https://www.linkedin.com/in/" + (c.pid || c.id), name: c.name, position: c.headline } });
        added++;
      }
      if (p.n != null && (r.list.length || !p.n)) ccount[p.id] = p.n;
      if (!r.found && p.n) err = "couldn't find comments on the post page";
    } catch (x) { err = String(x.message || x); }
    await sleep(rand(2000, 4000));
  }
  if (todo.length) await go("https://www.linkedin.com/feed/");
  await store.set({ ccount });
  return { posts: todo.length, added, err };
}

async function sync(fromButton) {
  if (busy) return { busy: true };
  busy = true; const ka = keepAlive(); const summary = {}; await store.set({ syncing: true });
  try {
    const me = await op("me");
    const h = await api("hello", { me, version: VERSION, signed_in: me.signed_in });
    await store.set({ me, last: { at: new Date().toISOString(), mode: h.mode, paused: h.paused, in_hours: h.in_hours, signed_in: me.signed_in } });
    if (!me.signed_in) { await log("You're signed out of LinkedIn in this Chrome. Sign in and it carries on.", true); return { signed_out: true }; }
    if (h.paused) { await log("Paused on LinkedIn > Outreach in the CRM."); return { paused: true }; }

    // 1. Everyone who liked or commented on our posts (every 3 hours).
    if (h.scan_engagers) {
      let cqid = await commentsQid(me, h.extra_posts);
      let e = await op("engagers", { me, days: h.scan_days || 30, extra_posts: h.extra_posts || [], cqid });
      if (/graphql: GET graphql answered 4/.test(e.err || "")) {                     // query id went stale: learn it again
        cqid = await commentsQid(me, h.extra_posts, true);
        e = await op("engagers", { me, days: h.scan_days || 30, extra_posts: h.extra_posts || [], cqid });
      }
      const pc = await pageComments(me, e);
      if (pc.err) e.err = (e.err ? e.err + "; " : "") + "comments: " + pc.err;
      const r = await api("engagers", { items: e.items });
      summary.engagers = r;
      await log("Checked " + e.posts + " posts: " + e.items.filter((i) => i.type !== "post").length + " likes and comments. New ICP leads: " + (r.leads_added ?? 0) + (e.err ? ". Problem: " + e.err : ""), !!e.err);
    }
    // 2. Accepts and replies.
    let conns = [], threads = [];
    try { conns = await op("connections"); } catch (e) { await log("Couldn't read your connections: " + e.message, true); }
    try {
      let { qid } = await store.get("qid");
      let t = await op("threads", { me, qid });
      if (t.need_qid) {
        await go("https://www.linkedin.com/messaging/");
        qid = (await op("findQid")).qid; await store.set({ qid });
        t = qid ? await op("threads", { me, qid }) : { threads: [] };
        await go("https://www.linkedin.com/feed/");
        if (!qid) await log("Couldn't find LinkedIn's messaging feed, so replies aren't being checked this run.", true);
      }
      threads = t.threads || [];
    } catch (e) { await log("Couldn't read your messages: " + e.message, true); }
    const st = await api("state", { connections: conns, threads });
    summary.state = st;
    if (st.accepted || st.replied) await log((st.accepted ? st.accepted + " accepted. " : "") + (st.replied ? st.replied + " replied (follow-ups stopped)." : ""));

    // 3. What to send next.
    const p = await api("plan");
    for (const L of p.lookups || []) {
      try { const r = await op("lookup", L); await api("contact", { lead_id: L.lead_id, ...r }); } catch (e) { await log("Lookup failed: " + e.message, true); }
      await sleep(rand(1500, 4000));
    }
    await store.set({ queue: (p.tasks || []).map((t) => ({ ...t, handed: Date.now() })) });
    summary.plan = { queued: p.queued, to_send: (p.tasks || []).length };
    if (p.queued) await log(p.queued + " new messages waiting" + (h.mode === "review" ? " for your approval on LinkedIn > Outreach." : "."));
    if (!p.in_hours && fromButton) await log("Outside your sending hours, so nothing goes out right now.");
    chrome.action.setBadgeText({ text: (p.tasks || []).length ? String(p.tasks.length) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
    return summary;
  } catch (e) {
    await log(String(e.message || e), true);
    try { await api("status", { error: String(e.message || e) }); } catch (_) {}
    return { error: String(e.message || e) };
  } finally { clearInterval(ka); busy = false; await store.set({ syncing: false }); }
}

// One approved request or message at a time. Skips some ticks at random so the gaps aren't regular.
async function tick() {
  if (busy) return;
  let { queue = [], me } = await store.get(["queue", "me"]);
  queue = queue.filter((t) => Date.now() - t.handed < 50 * 60e3);
  if (!queue.length || !me || !me.signed_in) { await store.set({ queue }); return; }
  if (Math.random() < 0.3) return;
  busy = true; const ka = keepAlive();
  const t = queue.shift(); await store.set({ queue });
  try {
    const c = await api("claim", { id: t.id });
    if (!c.ok) return;                                                   // approved task was skipped or already sent meanwhile
    let urn = t.urn, pid = t.pid;
    if (!urn) { const L = await op("lookup", { urn, pid, profile: t.profile, want_email: false }); urn = L.urn; pid = L.pid; }
    if (!urn) { await api("done", { id: t.id, ok: false, error: "Couldn't find their LinkedIn id" }); return; }
    await sleep(rand(2000, 6000));
    const r = t.kind === "invite" ? await op("invite", { urn, text: t.text }) : await op("message", { urn, text: t.text, me });
    await api("done", { id: t.id, urn, pid, ...r });
    if (r.limit) { await store.set({ queue: queue.filter((q) => q.kind !== "invite") }); await log("LinkedIn says the weekly request limit is reached. Requests wait until it resets.", true); }
    await log((r.ok ? "Sent " : r.already ? "Skipped (" + r.already + ") " : "Failed ") + ({ invite: "request", dm: "DM 1", followup: "follow-up " + t.step }[t.kind] || t.kind) + " to " + t.name + (r.error ? ": " + r.error : ""), !r.ok && !r.already);
    chrome.action.setBadgeText({ text: queue.length ? String(queue.length) : "" });
  } catch (e) {
    await log("Sending to " + t.name + " failed: " + e.message, true);
    try { await api("done", { id: t.id, ok: false, error: String(e.message || e) }); } catch (_) {}
  } finally { clearInterval(ka); busy = false; }
}

// Checks each LinkedIn call without saving or sending anything, and saves the details to the CRM so they can be fixed.
// Waits for a run in progress, keeps Chrome from stopping the worker midway, and keeps the result for the popup.
async function selfTest() {
  for (let i = 0; busy && i < 90; i++) await sleep(2000);
  busy = true; const ka = keepAlive();
  await store.set({ test: { at: new Date().toISOString(), running: true, lines: ["Testing… about 30 seconds. You can close this window."] } });
  try { const r = await selfTestRun(); await store.set({ test: { at: new Date().toISOString(), running: false, lines: r.lines } }); return r; }
  catch (e) { const r = { lines: ["Test stopped: " + (e.message || e)] }; await store.set({ test: { at: new Date().toISOString(), running: false, lines: r.lines } }); try { await api("status", { error: "self-test: " + (e.message || e) }); } catch (_) {} return r; }
  finally { clearInterval(ka); busy = false; }
}
async function selfTestRun() {
  const me = await op("me");
  let h = {}; try { h = await api("hello", { me, version: VERSION, signed_in: me.signed_in }); } catch (_) {}
  let q = { qid: "", qids: [] };
  if (me.signed_in) { await go("https://www.linkedin.com/messaging/"); q = await op("findQid"); await go("https://www.linkedin.com/feed/"); }
  let cqid = ""; if (me.signed_in) { try { cqid = await commentsQid(me, h.extra_posts, true); } catch (_) {} }
  const { qids_seen = [] } = await store.get("qids_seen");
  let domTest = null, net = null;
  if (me.signed_in) {
    try {
      const lp = (await op("latestPost", { me })).id || (h.extra_posts || [])[0];
      if (lp) { await go("https://www.linkedin.com/feed/update/urn:li:activity:" + lp + "/"); const r = await op("domComments", { me }); net = await op("netlog");
        domTest = { post: lp, found: r.found, read: r.list.length, sample: r.sample, first: r.list[0] ? { id: !!r.list[0].id, pid: !!r.list[0].pid, name: !!r.list[0].name, headline: !!r.list[0].headline, text: !!r.list[0].text } : null };
        await go("https://www.linkedin.com/feed/"); }
    } catch (x) { domTest = { err: String(x.message || x) }; }
  }
  const d = await op("diagnose", { qid: q.qid, qids: [...new Set([...(q.qids || []), ...qids_seen])], extra_posts: h.extra_posts || [], cqid });
  d.steps.page_comments = domTest; d.steps.post_page_calls = net;
  const out = d.lines || [];
  if (domTest) out.splice(3, 0, "Comments on your newest post (read from the page): " + (domTest.err ? "problem: " + domTest.err : domTest.read + " read"));
  try { await api("status", { note: "self-test " + new Date().toISOString(), diag: d }); out.push("CRM: connected, details saved"); } catch (e) { out.push("CRM: " + e.message); }
  if (d.qid) await store.set({ qid: d.qid });
  return { lines: out };
}
