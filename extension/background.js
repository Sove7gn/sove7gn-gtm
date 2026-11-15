// SOVE7GN Outreach Bot (LinkedIn + X): runs in your Chrome while it's open.
// Every 20 minutes (sync): checks who engaged with our posts, who accepted, who replied, and asks the CRM what to send.
// Every 2 minutes (tick): sends at most one approved LinkedIn request or message, with random gaps, so it looks like a person.
// Every 2 minutes (xtick, 12 Nov): sends at most one approved X DM from its own pinned X tab (Send today > Send with bot).
// Every 5 minutes (xrtick, 16 Nov): posts at most one approved reply (X > Outbound > Replies), 30 a day, 15+ minutes apart.
// Every 6 minutes (xreadtick, 16 Nov): reads one X page the CRM asks for (ICP posts, raise posts, followers) and sends it back.
import { liOp } from "./linkedin.js";
import { xOp } from "./x.js";

const FN = "https://rmadxyyvdiqdujuwecdt.supabase.co/functions/v1/li-bot";
const VERSION = chrome.runtime.getManifest().version;
const store = chrome.storage.local;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
let busy = false, xbusy = false, xbusyAt = 0, xbusyName = "";
// (16 Nov) One X tab, one job at a time. Jobs wait their turn instead of skipping (sending DMs used to lose to the reader for
// hours), and a lock older than 8 minutes is treated as stuck and taken over.
async function xAcquire(name, waitMs) {
  const t0 = Date.now();
  while (xbusy && Date.now() - xbusyAt < 8 * 60e3) { if (Date.now() - t0 > waitMs) { await xReport(name, false, "waited for " + xbusyName); return false; } await sleep(2000); }
  xbusy = true; xbusyAt = Date.now(); xbusyName = name; return true;
}
// What each X job last did, so the CRM's Bots page (and Claude) can see it.
async function xReport(name, ok, note) { try { await api("x_job", { name, ok, note: String(note || "").slice(0, 300), version: VERSION }); } catch (_) {} }
// A fresh worker means nothing is running (Chrome may have stopped the last one midway), so clear stale flags.
store.get("test").then(({ test }) => store.set({ syncing: false, ...(test && test.running ? { test: { ...test, running: false, lines: ["The last test was cut off. Press Test again."] } } : {}) }));

function setup() {
  chrome.alarms.create("sync", { periodInMinutes: 20, delayInMinutes: 1 });
  chrome.alarms.create("tick", { periodInMinutes: 2, delayInMinutes: 2 });
  chrome.alarms.create("xtick", { periodInMinutes: 2, delayInMinutes: 1 });
  chrome.alarms.create("xrtick", { periodInMinutes: 5, delayInMinutes: 3 });
  chrome.alarms.create("xreadtick", { periodInMinutes: 6, delayInMinutes: 2 });
  chrome.alarms.create("xinbox", { periodInMinutes: 10, delayInMinutes: 2 });
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener((a) => (a.name === "sync" ? sync(false) : a.name === "xtick" ? xTick() : a.name === "xrtick" ? xReplyTick() : a.name === "xreadtick" ? xReadTick() : a.name === "xinbox" ? xInboxTick() : tick()));
// An extension updated in place keeps its old alarms; make sure the X one exists.
chrome.alarms.get("xtick").then((a) => { if (!a || a.periodInMinutes !== 2) chrome.alarms.create("xtick", { periodInMinutes: 2, delayInMinutes: 1 }); });
chrome.alarms.get("xrtick").then((a) => { if (!a) chrome.alarms.create("xrtick", { periodInMinutes: 5, delayInMinutes: 3 }); });
chrome.alarms.get("xreadtick").then((a) => { if (!a) chrome.alarms.create("xreadtick", { periodInMinutes: 6, delayInMinutes: 2 }); });
chrome.alarms.get("xinbox").then((a) => { if (!a) chrome.alarms.create("xinbox", { periodInMinutes: 10, delayInMinutes: 2 }); });
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
  const t = await openTab("https://www.linkedin.com/feed/");
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
// (12 Nov) Chrome can keep running with every window closed, and then tabs.create fails with "No current window": open a small
// minimized window for the bot's tab instead.
async function openTab(url) {
  try { return await chrome.tabs.create({ url, active: false, pinned: true }); }
  catch (e) {
    if (!/no current window|no window/i.test(String(e.message || e))) throw e;
    const w = await chrome.windows.create({ url, focused: false, state: "minimized" });
    return w.tabs && w.tabs[0] ? w.tabs[0] : (await chrome.tabs.query({ windowId: w.id }))[0];
  }
}

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

async function moreSources(me, h) {
  const send = async (kind, people) => { if (!people.length) return; try { const r = await api("people", { kind, people, me }); if (r.added) await log(r.added + " new ICP leads from " + ({ viewed: "profile views", inbound: "requests sent to you", tagged: "people you tagged", niche: "founder posts you commented on" })[kind] + "."); } catch (e) { await log("Couldn't save " + kind + ": " + e.message, true); } };
  if (h.do_invites) {
    let p = []; try { p = (await op("invitesReceived")).people; } catch (_) { try { await go("https://www.linkedin.com/mynetwork/invitation-manager/received/"); p = (await op("domPeople", { me, messages: true })).people; await go("https://www.linkedin.com/feed/"); } catch (_) {} }
    await send("inbound", p); if (!p.length) try { await api("people", { kind: "inbound", people: [], me }); } catch (_) {}
  }
  if (h.scan_engagers) { try { await send("tagged", (await op("tagged", { me, days: 30 })).people); } catch (e) { await log("Couldn't read who we tagged: " + e.message, true); } }
  if (h.do_views) { try { await go("https://www.linkedin.com/me/profile-views/"); await sleep(2500); await send("viewed", (await op("domPeople", { me })).people); await go("https://www.linkedin.com/feed/"); } catch (e) { await log("Couldn't read profile views: " + e.message, true); } }
  if (h.do_niche && (h.niche_posts || []).length) {
    const all = [];
    for (const p of h.niche_posts.slice(0, 5)) { try { await go(p.url); const r = await op("domComments", { me }); for (const c of r.list) all.push({ urn: c.id, pid: c.pid, name: c.name, headline: c.headline, said: c.text, post_author: p.author }); } catch (_) {} await sleep(rand(2000, 4000)); }
    await go("https://www.linkedin.com/feed/"); await send("niche", all);
  }
  if (h.do_withdraw) {
    try { await go("https://www.linkedin.com/mynetwork/invitation-manager/sent/"); const r = await op("domWithdraw", { maxDays: 21, limit: 25 }); await go("https://www.linkedin.com/feed/");
      await api("withdrawn", { people: r.withdrawn }); if (r.withdrawn.length) await log("Withdrew " + r.withdrawn.length + " requests nobody accepted in 3+ weeks (" + r.eligible + " were that old)."); }
    catch (e) { await log("Couldn't withdraw old requests: " + e.message, true); }
  }
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
    // 1b. New sources: requests sent to us, people we tagged, profile viewers, commenters on founder posts we commented on.
    await moreSources(me, h);
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
    const p = await api("plan", { version: VERSION });
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
    if (t.warm) {                                                       // warm touch now, the request a few hours later
      await go("https://www.linkedin.com/in/" + (pid || urn) + "/"); await sleep(rand(4000, 9000));
      const lk = await op("likeLatest", { urn }); await go("https://www.linkedin.com/feed/");
      await api("warmed", { id: t.id, liked: !!lk.liked }); await log("Visited " + t.name + "'s profile" + (lk.liked ? " and liked their latest post" : "") + ". Their request goes out in a few hours."); return;
    }
    let r;
    if (t.kind === "accept") {
      let a = await op("acceptInvite", { inv: t.inv, urn, pid });
      if (!a.ok) { await go("https://www.linkedin.com/mynetwork/invitation-manager/received/"); a = await op("acceptInvite", { urn, pid }); await go("https://www.linkedin.com/feed/"); }
      r = a.ok ? (await sleep(rand(3000, 7000)), await op("message", { urn, text: t.text, me })) : a;
    } else if (t.kind === "inmail") {                                // (14 Nov) through their profile page, like a person
      await go("https://www.linkedin.com/in/" + (pid || urn) + "/"); await sleep(rand(4000, 8000));
      r = await imSend(urn, { subject: t.subject || "", text: t.text }); await go("https://www.linkedin.com/feed/");
    } else r = t.kind === "invite" ? await op("invite", { urn, text: t.text }) : await op("message", { urn, text: t.text, me });
    await api("done", { id: t.id, urn, pid, ...r });
    if (r.limit) { await store.set({ queue: queue.filter((q) => q.kind !== "invite") }); await log("LinkedIn says the weekly request limit is reached. Requests wait until it resets.", true); }
    await log((r.ok ? "Sent " : r.already ? "Skipped (" + r.already + ") " : "Failed ") + ({ invite: "request", dm: "first message", followup: "follow-up " + t.step, accept: "accept + first message" }[t.kind] || t.kind) + " to " + t.name + (r.error ? ": " + r.error : ""), !r.ok && !r.already);
    chrome.action.setBadgeText({ text: queue.length ? String(queue.length) : "" });
  } catch (e) {
    await log("Sending to " + t.name + " failed: " + e.message, true);
    try { await api("done", { id: t.id, ok: false, error: String(e.message || e) }); } catch (_) {}
  } finally { clearInterval(ka); busy = false; }
}

// Checks each LinkedIn call without saving or sending anything, and saves the details to the CRM so they can be fixed.
// Waits for a run in progress, keeps Chrome from stopping the worker midway, and keeps the result for the popup.
async function selfTest() {
  if (busy) await store.set({ test: { at: new Date().toISOString(), running: true, lines: ["Waiting for the bot's current check to finish, then testing. You can close this window."] } });
  for (let i = 0; busy && i < 90; i++) await sleep(2000);
  busy = true; const ka = keepAlive();
  await store.set({ test: { at: new Date().toISOString(), running: true, lines: ["Testing… about 40 seconds. You can close this window."] } });
  try { const r = await selfTestRun(); await store.set({ test: { at: new Date().toISOString(), running: false, lines: r.lines } }); return r; }
  catch (e) { const r = { lines: ["Test stopped: " + (e.message || e)] }; await store.set({ test: { at: new Date().toISOString(), running: false, lines: r.lines } }); try { await api("status", { error: "self-test: " + (e.message || e) }); } catch (_) {} return r; }
  finally { clearInterval(ka); busy = false; }
}
async function selfTestRun() {
  // Quick check (about 30 to 40 seconds): only what isn't proven yet. Reads only; nothing is clicked or sent.
  const t0 = Date.now(), v2 = {}, out = [];
  const me = await op("me");
  out.push(me.signed_in ? "Signed in as " + me.name : "Not signed in to LinkedIn");
  if (!me.signed_in) return { lines: out };
  try { await api("hello", { me, version: VERSION, signed_in: true }); } catch (_) {}
  try { v2.connections = (await op("connections")).length; } catch (e) { v2.connections = "error: " + e.message; }
  try { v2.invites = (await op("invitesReceived")).people.length; } catch (e) { v2.invites = "error: " + e.message; }
  try { v2.tagged = (await op("tagged", { me, days: 30 })).people.length; } catch (e) { v2.tagged = "error: " + e.message; }
  try { await go("https://www.linkedin.com/me/profile-views/"); const pv = await op("domPeople", { me }); v2.views = pv.people.length;
    v2.views_sample = pv.people.slice(0, 2).map((p) => ({ name: !!p.name, headline: !!p.headline, id: !!(p.urn || p.pid) })); } catch (e) { v2.views = "error: " + e.message; }
  try { await go("https://www.linkedin.com/mynetwork/invitation-manager/sent/"); const w = await op("domWithdraw", { maxDays: 21, dry: true }); v2.sent_pending = w.total; v2.older_than_3_weeks = w.eligible; v2.oldest = w.oldest;
    if (!w.total) v2.sent_page = await op("pageProbe"); } catch (e) { v2.sent_pending = "error: " + e.message; }
  await go("https://www.linkedin.com/feed/");
  out.push("Connections read: " + v2.connections + " · Requests sent to you: " + v2.invites + " · People you tagged (30 days): " + v2.tagged);
  out.push("Profile viewers read: " + v2.views);
  out.push("Your pending requests: " + v2.sent_pending + " (" + v2.older_than_3_weeks + " older than 3 weeks, to withdraw" + (v2.oldest ? "; oldest sent " + v2.oldest : "") + ")");
  try { const xm = await xop("me"); v2.x = xm.signed_in ? "signed in" : "signed out";
    if (xm.signed_in) { const pm = await xop("canDm", { user_id: "783214" }); v2.x_dm_check = pm.known ? "works" : "error: " + (pm.error || "no answer"); }
    out.push("X: " + (xm.signed_in ? "signed in · DM check " + v2.x_dm_check : "signed out of X in this Chrome (sign in at x.com)")); }
  catch (e) { v2.x = "error: " + e.message; out.push("X: " + e.message); }
  out.push("Took " + Math.round((Date.now() - t0) / 1000) + " seconds.");
  try { await api("status", { note: "self-test " + new Date().toISOString(), diag: { at: new Date().toISOString(), lines: out, steps: { v2 } } }); out.push("Saved to the CRM."); } catch (e) { out.push("CRM: " + e.message); }
  return { lines: out };
}

// ═════════ X DMs (12 Nov) ═════════
// Its own pinned X tab, so it never touches the tabs you're using.
async function xTab() {
  const { xTabId } = await store.get("xTabId");
  if (xTabId) {
    try {
      const t = await chrome.tabs.get(xTabId);
      if (/(^|\/\/)(x|twitter)\.com/.test(t.url || t.pendingUrl || "")) {
        if (t.discarded || t.status !== "complete") { await chrome.tabs.reload(t.id); await loaded(t.id); await sleep(2500); }
        if (await xAlive(t.id)) return t.id;
        await chrome.tabs.reload(t.id); await loaded(t.id); await sleep(3000);
        if (await xAlive(t.id)) return t.id;
        await chrome.tabs.remove(t.id).catch(() => {});
      }
    } catch (_) {}
  }
  const t = await openTab("https://x.com/messages");
  await store.set({ xTabId: t.id }); await loaded(t.id); await sleep(3000);
  if (!(await xAlive(t.id))) throw new Error("X won't load in Chrome right now. Open x.com in a normal tab to check you're signed in.");
  return t.id;
}
async function xAlive(id) {
  try { const r = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", func: () => location.hostname }); return /(^|\.)x\.com$/.test((r && r[0] && r[0].result) || ""); }
  catch (_) { return false; }
}
async function xop(name, args = {}) {
  const id = await xTab();
  const res = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", func: xOp, args: [name, args] });
  const r = res && res[0];
  if (!r) throw new Error("X tab didn't answer");
  if (r.error) throw new Error(r.error.message || String(r.error));
  return r.result;
}
// One approved X DM at a time: ask the CRM for a few, then send them one per tick, skipping some ticks at random.
// InMail (14 Nov): the profile's Message button first; if no message window appears there (LinkedIn may keep it closed to
// extensions), LinkedIn's full-page new-message screen for them.
async function imSend(urn, a) {
  const r = await op("inmail", a);
  if (r.ok || r.step !== "box") return r;
  await go(r.href ? new URL(r.href, "https://www.linkedin.com").href : "https://www.linkedin.com/messaging/thread/new/?recipient=" + encodeURIComponent(urn)); await sleep(rand(4000, 7000));
  const r2 = await op("inmail", { ...a, onPage: true });
  return r2.ok ? { ...r2, via: "page" } : { ...r2, first: { step: r.step, btn: r.btn, href: r.href } };
}

// InMail test (14 Nov), asked from the CRM: open an InMail to that person, fill it in, close it without sending (no credit used).
async function inmailTest(t) {
  if (busy) return; busy = true; const ka = keepAlive();
  try {
    await go("https://www.linkedin.com/in/" + (t.pid || t.urn) + "/"); await sleep(rand(4000, 7000));
    const r = await imSend(t.urn, { test: true, subject: "Quick question", text: "Hi, this is a test and will not be sent." });
    await go("https://www.linkedin.com/feed/");
    await api("inmail_tested", { result: r }); await log("InMail test on " + (t.name || "a profile") + ": " + (r.ok ? "works, nothing sent" : "problem: " + (r.error || "see the CRM")) + ".", !r.ok);
  } catch (e) { try { await api("inmail_tested", { result: { ok: false, error: String(e.message || e) } }); } catch (_) {} }
  finally { busy = false; clearInterval(ka); }
}

async function xTick() {
  if (!(await xAcquire("dms", 100e3))) return;
  const ka = keepAlive();
  try {
    const { key } = await store.get("key"); if (!key) return;
    // Refresh in the CRM (13 Nov): asked every 3 minutes; when it was pressed, read LinkedIn (post numbers, engagers) now.
    const { pollAt = 0 } = await store.get("pollAt");
    if (Date.now() - pollAt > 3 * 60e3) {
      await store.set({ pollAt: Date.now() });
      try { const r = await api("poll", {}); if (r.sync && !busy) setTimeout(() => sync(false), 1500);
        if (r.inmail_test && !busy) setTimeout(() => inmailTest(r.inmail_test), 3000); } catch (_) {}
    }
    let { xqueue = [], xplanAt = 0 } = await store.get(["xqueue", "xplanAt"]);
    xqueue = xqueue.filter((t) => Date.now() - t.handed < 50 * 60e3);
    if (!xqueue.length && Date.now() - xplanAt > 6 * 60e3) {
      const me = await xop("me");
      const p = await api("x_plan", { me, version: VERSION });
      await store.set({ xplanAt: Date.now(), xlast: { at: new Date().toISOString(), signed_in: me.signed_in, paused: p.paused, in_hours: p.in_hours, left: p.left, sent_today: p.sent_today } });
      if (!me.signed_in) { await log("X: you're signed out of X in this Chrome. Sign in and approved DMs carry on.", true); return; }
      xqueue = (p.tasks || []).map((t) => ({ ...t, handed: Date.now() }));
      await store.set({ xqueue });
      if (xqueue.length) await log("X: " + xqueue.length + " approved DMs to send over the next few minutes.");
      return;                                                            // first send waits for the next tick
    }
    if (!xqueue.length) return;
    if (Math.random() < 0.2) return;
    const t = xqueue.shift(); await store.set({ xqueue });
    try {
      const c = await api("x_claim", { id: t.id });
      if (!c.ok) { if (c.why) await log("X: skipped " + t.name + " (" + c.why + ")."); return; }
      const perm = await xop("canDm", { user_id: t.user_id });
      if (perm && perm.known && !perm.can) { await api("x_done", { id: t.id, cant: true }); await log("X: " + t.name + "'s DMs are closed or need a passcode, so they're off today's list."); return; }
      await sleep(rand(3000, 9000));
      const r = await xop("send", { user_id: t.user_id, text: t.text });
      await api("x_done", { id: t.id, ...r });
      const what = { dm: "first DM", fu1: "follow-up 1", fu2: "follow-up 2" }[t.kind] || "DM";
      if (r.ok) { await log("X: sent " + what + " to " + t.name + "."); await xReport("dms", true, "sent " + what + " to " + t.name); }
      else if (r.cant) await log("X: " + t.name + "'s DMs are closed (" + r.error + "), so they're off today's list.");
      else { await log("X: couldn't send to " + t.name + ": " + r.error, true); if (r.limit) await store.set({ xqueue: [], xplanAt: Date.now() + 30 * 60e3 }); }
    } catch (e) {
      await log("X: sending to " + t.name + " failed: " + e.message, true);
      try { await api("x_done", { id: t.id, ok: false, error: String(e.message || e) }); } catch (_) {}
    }
  } catch (e) { await log("X: " + (e.message || e), true); }
  finally { clearInterval(ka); xbusy = false; }
}

// ═════════ X replies (16 Nov) ═════════
// Every 5 minutes (xrtick): asks the CRM for the next reply Reyansh approved on X > Outbound > Replies (the CRM keeps it to 30 a day,
// 15+ minutes apart, in his hours, and holds off while X's cooldown is on). In the bot's own X tab it opens the post, likes it,
// opens X's reply box with the reply filled in and presses Post: the same clicks he would make, done by X's own page.
async function xReplyTick() {
  const { key } = await store.get("key"); if (!key) return;
  if (!(await xAcquire("replies", 120e3))) return;
  const ka = keepAlive();
  let task = null;
  try {
    const me = await xop("me");
    if (!me.signed_in) return;
    const p = await api("xr_plan", { me, version: VERSION });
    await store.set({ xrlast: { at: new Date().toISOString(), posted_today: p.posted_today, cap: p.cap, waiting: p.waiting, paused: p.paused, wait_min: p.wait_min } });
    task = (p.tasks || [])[0]; if (!task) return;
    const id = await xTab();
    await chrome.tabs.update(id, { url: task.url }); await loaded(id); await sleep(rand(5000, 9000));
    const lk = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", args: [task.id], func: async (tid) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 20; i++) {
        const arts = [...document.querySelectorAll('article[data-testid="tweet"]')];
        const art = arts.find((a) => a.querySelector('a[href$="/status/' + tid + '"] time')) || arts[0];
        if (art) {
          if (art.querySelector('[data-testid="unlike"]')) return { liked: true, already: true };
          const b = art.querySelector('[data-testid="like"]');
          if (b) { b.click(); await wait(1200); return { liked: !!art.querySelector('[data-testid="unlike"]') }; }
        }
        if (/this post (is unavailable|was deleted)|hmm\.\.\.this page doesn.t exist/i.test(document.body.innerText)) return { liked: false, gone: true };
        await wait(500);
      }
      return { liked: false };
    } });
    const like = (lk && lk[0] && lk[0].result) || {};
    if (like.gone) { await api("xr_done", { url: task.url, ok: false, error: "The post is gone (deleted or hidden)" }); await log("X: " + task.name + "'s post is gone, reply skipped."); return; }
    await sleep(rand(2500, 6000));
    // (16 Nov) Reply on the post itself: press its Reply button, type the text into X's box, press Reply. X stopped filling
    // in the separate reply page's box, which is why replies failed. The old page is only the fallback.
    const typed = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", args: [task.id, task.text], func: async (tid, text) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const arts = [...document.querySelectorAll('article[data-testid="tweet"]')];
      const art = arts.find((a) => a.querySelector('a[href$="/status/' + tid + '"] time')) || arts[0];
      const rb = art && art.querySelector('[data-testid="reply"]'); if (!rb) return { ok: false };
      rb.click();
      let box = null; for (let i = 0; i < 20 && !box; i++) { await wait(400); box = document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]') || document.querySelector('[data-testid="tweetTextarea_0"]'); }
      if (!box) return { ok: false };
      box.focus(); await wait(300);
      document.execCommand("insertText", false, text); await wait(800);
      return { ok: box.innerText.trim().length > 2 };
    } }).catch(() => null);
    const inPlace = !!(typed && typed[0] && typed[0].result && typed[0].result.ok);
    if (!inPlace) { await chrome.tabs.update(id, { url: "https://x.com/intent/post?in_reply_to=" + task.id + "&text=" + encodeURIComponent(task.text) }); await loaded(id); await sleep(rand(5000, 8000)); }
    else await sleep(rand(1200, 2500));
    const res = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", func: async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const alertText = () => [...document.querySelectorAll('[role="alert"], [data-testid="toast"]')].map((e) => e.innerText).join(" ");
      let btn = null;
      for (let i = 0; i < 24; i++) {
        btn = document.querySelector('[data-testid="tweetButton"]');
        const box = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (btn && btn.getAttribute("aria-disabled") !== "true" && box && box.innerText.trim().length > 2) break;
        btn = null; await wait(500);
      }
      if (!btn) return { ok: false, error: "X's reply box didn't open with the text (signed out, or X changed the page)" };
      btn.click();
      for (let i = 0; i < 24; i++) {
        await wait(500);
        const a = alertText();
        if (/automated|try again later|rate limit|over capacity|temporarily/i.test(a)) return { ok: false, limit: true, error: "X: " + a.slice(0, 200) };
        if (/already said that|something went wrong|can.t reply|isn.t available|restricted who can reply/i.test(a)) return { ok: false, error: "X: " + a.slice(0, 200) };
        if (!document.querySelector('[data-testid="tweetButton"]') || /your post was sent|reply was sent/i.test(a)) return { ok: true };
      }
      return { ok: false, error: "Pressed Post but X didn't confirm within 12 seconds" };
    } });
    const r = (res && res[0] && res[0].result) || { ok: false, error: "X tab didn't answer" };
    await api("xr_done", { url: task.url, ok: r.ok, error: r.error, limit: r.limit, liked: like.liked });
    if (r.ok) await log("X: replied to " + task.name + (like.liked ? " (and liked the post)." : "."));
    else await log("X: couldn't reply to " + task.name + ": " + r.error, true);
    await chrome.tabs.update(id, { url: "https://x.com/messages" }).catch(() => {});
  } catch (e) {
    await log("X replies: " + (e.message || e), true);
    if (task) { try { await api("xr_done", { url: task.url, ok: false, error: String(e.message || e) }); } catch (_) {} }
  } finally { clearInterval(ka); xbusy = false; }
}

// ═════════ Reading X from your tab (16 Nov) ═════════
// twitterapi.io ran out of credits and Exa no longer indexes X, so the bot reads X itself, in its own X tab, like you scrolling:
// every 6 minutes (xreadtick) it asks the CRM's x-grow job for one page to read (fresh posts by ICP founders to reply to, raise and
// launch posts for new leads, our newest followers, or the followers of our client's founders), scrolls it and sends back what X shows.
const XG_FN = FN.replace(/\/li-bot$/, "/x-grow");
async function xg(action, body = {}) {
  const { key } = await store.get("key");
  const r = await fetch(XG_FN, { method: "POST", headers: { "Content-Type": "application/json", "x-bot-token": key }, body: JSON.stringify({ [action]: true, ...body }) });
  const j = await r.json().catch(() => ({ error: "x-grow answered " + r.status }));
  if (j.error) throw new Error(j.error);
  return j;
}
// Every 10 minutes (16 Nov): reads the X DM inbox and hands the CRM any new messages. The CRM matches them to people we DMed,
// marks them Replied, sorts the reply (interested, question, not now, not interested), drafts the answer and stops the follow-ups.
async function xInboxTick() {
  const { key } = await store.get("key"); if (!key) return;
  if (!(await xAcquire("inbox", 180e3))) return;
  const ka = keepAlive();
  try {
    const me = await xop("me"); if (!me.signed_in) return;
    const { xdeepAt = 0 } = await store.get("xdeepAt"); const deep = Date.now() - xdeepAt > 6 * 3600e3;
    const r = await xop("inbox", { deep }); if (deep) await store.set({ xdeepAt: Date.now() });
    if (!r || !r.ok) { await log("X inbox: " + ((r && r.error) || "couldn't read it"), true); return; }
    // (16 Nov) The inbox only holds the last few hours, so also open the chats of people we DMed lately (15 a run, oldest checked first).
    const items = [...(r.items || [])];
    const tg = await api("x_inbox_targets", {}).catch(() => ({ user_ids: [] }));
    const convs = [];
    for (const uid of (tg.user_ids || []).slice(0, 6)) {
      const c = await xop("conv", { user_id: uid }).catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (c && c.ok) items.push(...c.items);
      convs.push({ uid, ok: !!(c && c.ok), n: c && c.items ? c.items.length : 0, error: c && c.error ? String(c.error).slice(0, 120) : "" });
      await sleep(rand(1500, 3500));
    }
    let dom = [];
    try {
      const id = await xTab();
      await chrome.tabs.update(id, { url: "https://x.com/i/chat" }); await loaded(id); await sleep(rand(3000, 5000));
      // X's new chat (x.com/i/chat) loads its list a few seconds after the page; wait for it, then read each chat's link and last line.
      // (16 Nov) X's new chat runs inside an embedded frame, so read every frame (and the chat app's shadow roots).
      let frames = null;
      for (let attempt = 0; attempt < 4 && !frames; attempt++) {
        if (attempt) { await sleep(4000); await loaded(id); }
        frames = await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, world: "MAIN", func: async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const deep = (root, sel, acc) => { root.querySelectorAll(sel).forEach((e) => acc.push(e)); root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) deep(e.shadowRoot, sel, acc); }); return acc; };
          const SEL = 'a[href*="/i/chat/"], a[href*="/messages/"], [data-testid="conversation"], [data-testid*="onversation"], [data-testid*="chat-list"] [role="link"], [role="listitem"], [role="option"]';
          const items = () => deep(document, SEL, []).filter((e) => { const t = String(e.innerText || "").trim(); return t.includes("\n") && t.length < 500; });
          for (let i = 0; i < 20 && items().length < 2; i++) await wait(1000);
          const out = new Map();
          const grab = () => { for (const c of items()) { const a = c.matches("a") ? c : c.querySelector("a[href]"); const href = (a && a.getAttribute("href")) || c.getAttribute("data-testid") || "";
            const text = String(c.innerText || "").trim().slice(0, 400); out.set(href + "|" + text.slice(0, 60), { href, text }); } };
          grab();
          const first = items()[0]; let sc = first && first.parentElement;
          while (sc && sc.parentElement && !(sc.scrollHeight > sc.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
          for (let i = 0; i < 5 && sc; i++) { sc.scrollBy(0, 1200); await wait(1500); grab(); }
          const body = document.body ? String(document.body.innerText || "") : "";
          return { url: location.href, cells: [...out.values()].slice(0, 150), locked: /passcode|enter your pin|recover your|set up encryption/i.test(body) && out.size < 2, sample: out.size ? "" : body.slice(0, 900) };
        } }).catch((e) => { if (!/frame|removed|navigat/i.test(String(e.message || e))) throw e; return null; });
      }
      const fr = (frames || []).map((f) => f && f.result).filter(Boolean);
      dom = fr.flatMap((f) => f.cells || []);
      convs.push({ page: "chat", frames: fr.map((f) => ({ url: String(f.url).slice(0, 120), cells: (f.cells || []).length, sample: String(f.sample || "").slice(0, 500) })) });
      if (fr.some((f) => f.locked)) await xReport("chat", false, "X chat is locked: open x.com/i/chat in Chrome once and enter your chat passcode, so the bot can read replies");
    } catch (e) { convs.push({ page: "error", error: String(e.message || e).slice(0, 160) }); }
    const out = await api("x_inbox", { me, items, dom, version: VERSION, debug: { pages: r.pages || [], convs } });
    await xReport("inbox", true, (r.items || []).length + " inbox messages, " + (convs.length - 1) + " chats opened, " + dom.length + " chats read on x.com/i/chat, " + ((out && out.replied) || 0) + " new replies");
    if (out && out.replied) await log("X: " + out.replied + " new " + (out.replied === 1 ? "reply" : "replies") + " to our DMs, sorted with an answer ready in the CRM.");
  } catch (e) { await log("X inbox: " + (e.message || e), true); }
  finally { xbusy = false; clearInterval(ka); }
}
async function xReadTick() {
  const { key } = await store.get("key"); if (!key) return;
  const { xqueue = [] } = await store.get("xqueue"); if (xqueue.length) return;   // DMs waiting go first
  if (!(await xAcquire("reader", 20e3))) return;
  const ka = keepAlive();
  try {
    const me = await xop("me"); if (!me.signed_in) return;
    const { job } = await xg("read_plan", { version: VERSION });
    if (!job) return;
    const id = await xTab();
    await chrome.tabs.update(id, { url: job.url }); await loaded(id); await sleep(rand(5000, 8000));
    const res = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", args: [job.kind, job.scrolls || 3], func: async (kind, scrolls) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = new Map(); let still = 0, end = false;
      const users = kind === "my_followers" || kind === "follow_src";
      const grab = () => {
        let added = 0;
        if (users) {
          for (const c of document.querySelectorAll('[data-testid="UserCell"]')) {
            const link = [...c.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute("href")).find((h) => /^\/\w{1,15}$/.test(h || ""));
            if (!link) continue; const handle = link.slice(1); if (out.has(handle.toLowerCase())) continue;
            const texts = [...c.querySelectorAll('div[dir="auto"], span')].map((e) => e.innerText.trim()).filter(Boolean);
            const name = (texts[0] || handle).split("\n")[0];
            const bio = [...c.querySelectorAll('div[dir="auto"]')].map((e) => e.innerText.trim()).filter((t) => t && t !== name && !t.startsWith("@") && t.length > 12).pop() || "";
            out.set(handle.toLowerCase(), { handle, name, bio }); added++;
          }
        } else {
          for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
            const t = a.querySelector("time"); const link = t && t.closest("a"); if (!link) continue;
            const url = new URL(link.getAttribute("href"), location.origin).href.split("?")[0]; if (out.has(url)) continue;
            const m = url.match(/x\.com\/(\w{1,15})\/status\/(\d+)/); if (!m) continue;
            const un = a.querySelector('[data-testid="User-Name"]'); const name = un ? (un.innerText.split("\n")[0] || m[1]) : m[1];
            const txt = a.querySelector('[data-testid="tweetText"]'); const grp = a.querySelector('[role="group"][aria-label]');
            const lab = grp ? grp.getAttribute("aria-label") : "";
            const pick = (w) => { const mm = lab.match(new RegExp("([\\d,.]+[KM]?)\\s+" + w, "i")); return mm ? mm[1] : null; };
            out.set(url, { url, handle: m[1], name, text: txt ? txt.innerText : "", time: t.getAttribute("datetime"), reply: /Replying to/i.test(a.innerText.slice(0, 300)),
              replies: pick("repl"), likes: pick("like"), views: pick("view") }); added++;
          }
        }
        return added;
      };
      for (let i = 0; i < 40 && !document.querySelector(users ? '[data-testid="UserCell"]' : 'article[data-testid="tweet"]'); i++) {
        if (/no results for|nothing to see here|hmm\.\.\.this page/i.test(document.body.innerText)) return { items: [], end: true };
        await wait(500);
      }
      for (let i = 0; i < scrolls; i++) {
        const n = grab(); still = n ? 0 : still + 1;
        if (still >= 4) { end = true; break; }
        window.scrollBy(0, window.innerHeight * (1.2 + Math.random() * 0.6)); await wait(1200 + Math.random() * 1300);
      }
      grab();
      return { items: [...out.values()], end };
    } });
    const r = (res && res[0] && res[0].result) || { items: [] };
    const done = await xg("read_done", { job, items: r.items, end: !!r.end });
    const what = { replies: "fresh posts by ICP founders", leads: "raise / launch posts", my_followers: "your newest followers", follow_src: "followers of @" + job.via }[job.kind] || job.kind;
    await log("X: read " + r.items.length + " " + what + (done.new != null ? ", " + done.new + " new to reply to" : done.added != null ? ", " + done.added + " added to the pipeline" : "") + ".");
    await chrome.tabs.update(id, { url: "https://x.com/messages" }).catch(() => {});
  } catch (e) { await log("X reading: " + (e.message || e), true); }
  finally { clearInterval(ka); xbusy = false; }
}
