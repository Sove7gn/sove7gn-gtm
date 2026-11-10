// li-bot (11 Nov): the brain behind the LinkedIn Chrome extension (extension/ in this repo).
// The extension runs in Reyansh's own Chrome while LinkedIn is signed in. Every ~20 minutes it:
//   hello    -> says it's alive, gets the settings
//   engagers -> sends everyone who liked or commented on our posts (social-sync judges them against the ICP and adds fits to Leads)
//   state    -> sends recent connections and recent DM threads (we spot accepts and replies)
//   plan     -> gets the requests and messages to send now (written here, approved on LinkedIn > Outreach in Review mode)
//   done     -> reports each one sent or failed
//   contact  -> reports a person's LinkedIn id and their email if they share it
// The sequence per lead: request with a note -> accepted -> DM 1 (unless they already replied) -> follow-ups 1..7, one a day
// -> no reply: Cold lead. Any reply stops everything and moves them to In talks. A cal.com booking moves them to Call booked.
// Only people who engaged with our posts (origin li-person:) and fit the ICP are ever contacted.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TOKEN = Deno.env.get("LI_BOT_TOKEN") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const COMPOSIO = Deno.env.get("COMPOSIO_API_KEY") ?? "";
const CAL_SECRET = Deno.env.get("CAL_WEBHOOK_SECRET") ?? "";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const BY = "li-bot";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-token, x-cal-signature-256",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const now = () => new Date().toISOString();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const ACTIVE = /^(new|contacted|follow up)$/i;     // stages the bot may still message in

async function allowed(req: Request): Promise<boolean> {
  if (TOKEN && req.headers.get("x-bot-token") === TOKEN) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.from("crm_team").select("email").limit(1);
  return !!data?.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (url.searchParams.get("cal") === "1") return calBooking(req);
  if (!(await allowed(req))) return json({ error: "Not allowed. Check the bot key in the extension's settings." }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    const out = await ({ hello, engagers, state, plan, claim, done, contact, status } as Record<string, (b: any) => Promise<unknown>>)[body.action]?.(body);
    if (out === undefined) return json({ error: "Unknown action " + body.action }, 400);
    return json(out);
  } catch (e) {
    const error = String((e as Error).message ?? e);
    await saveStatus({ last_error: error, last_error_at: now() });
    return json({ error }, 500);
  }
});

// ───────── settings and status ─────────
type Bot = { mode: "review" | "auto"; paused: boolean; include_warm: boolean; week_cap: number; notes_month: number; followups: number;
  gap_days: number; hours: { from: number; to: number }; note: string; dm1: string; fu: string[] };
async function settings(): Promise<Bot> {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot").maybeSingle();
  const v = (data?.value ?? {}) as Partial<Bot>;
  return { mode: v.mode === "auto" ? "auto" : "review", paused: !!v.paused, include_warm: !!v.include_warm, week_cap: +(v.week_cap ?? 150),
    notes_month: +(v.notes_month ?? 250), followups: Math.min(+(v.followups ?? 7), (v.fu ?? []).length || 7), gap_days: +(v.gap_days ?? 1),
    hours: { from: +(v.hours?.from ?? 10), to: +(v.hours?.to ?? 24) }, note: v.note ?? "", dm1: v.dm1 ?? "", fu: v.fu ?? [] };
}
async function saveStatus(patch: Record<string, unknown>) {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  await db.from("crm_lead_settings").upsert({ key: "li_bot_status", value: { ...(data?.value ?? {}), ...patch }, updated_at: now() });
}
const istHour = () => { const d = new Date(Date.now() + 5.5 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const inHours = (h: { from: number; to: number }) => { const x = istHour(); return h.from <= h.to ? x >= h.from && x < h.to : x >= h.from || x < h.to; };

async function hello(b: any) {
  const set = await settings();
  const { data: st } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  const lastScan = Date.parse((st?.value as any)?.last_scan ?? "") || 0;
  await saveStatus({ seen: now(), version: b.version ?? "", me: b.me ?? null, signed_in: b.signed_in !== false });
  // Posts we already know about (from earlier checks), in case LinkedIn's own list of our posts misses one.
  const { data: known } = await db.from("crm_social_posts").select("post_id").eq("platform", "linkedin").gte("posted_at", new Date(Date.now() - 30 * 86400e3).toISOString());
  // For the extension's self-test: our latest post with known comments, and who wrote them.
  let probe = null;
  const { data: ce } = await db.from("crm_social_engagements").select("post_id,person_key,first_seen").eq("platform", "linkedin").eq("kind", "commented").order("first_seen", { ascending: false }).limit(30);
  if (ce?.length) {
    const post = ce[0].post_id, keys = ce.filter((e) => e.post_id === post).map((e) => e.person_key);
    const { data: ppl } = await db.from("crm_social_people").select("name").eq("platform", "linkedin").eq("is_self", false).in("person_key", keys);
    probe = { post, names: (ppl ?? []).map((p) => p.name).filter(Boolean).slice(0, 3) };
  }
  return { probe, paused: set.paused, mode: set.mode, in_hours: inHours(set.hours), hours: set.hours,
    scan_engagers: Date.now() - lastScan > 3 * 3600e3, scan_days: 30, extra_posts: (known ?? []).map((k) => String(k.post_id)).filter((x) => /^\d+$/.test(x)) };
}
async function status(b: any) { await saveStatus({ seen: now(), ...(b.error ? { last_error: String(b.error).slice(0, 500), last_error_at: now() } : {}), ...(b.note ? { last_note: String(b.note).slice(0, 300) } : {}), ...(b.diag ? { diag: b.diag } : {}) }); return { ok: true }; }

// ───────── engagers: hand them to social-sync (same judging and lead rules as before, no Apify) ─────────
async function engagers(b: any) {
  const items = Array.isArray(b.items) ? b.items : [];
  const res = await fetch(SB_URL + "/functions/v1/social-sync", { method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON }, body: JSON.stringify({ items }) });
  const out = await res.json().catch(() => ({ error: "social-sync answered " + res.status }));
  await saveStatus({ last_scan: now(), last_scan_result: out });
  return out;
}

// ───────── who is who ─────────
type Lead = { id: string; name: string; company: string; role: string; linkedin: string; stage: string; heat: string; email: string;
  x_handle: string; fields: any; source_detail: string; origin_key: string | null };
const idsOf = (l: Lead) => {
  const li = l.fields?.li ?? {}, out = new Set<string>();
  const m = String(l.linkedin || "").match(/\/in\/([^/?#]+)/i);
  if (m) out.add(decodeURIComponent(m[1]).toLowerCase());
  if (li.urn) out.add(String(li.urn).toLowerCase());
  if (li.pid) out.add(String(li.pid).toLowerCase());
  return out;
};
const urnOf = (l: Lead) => { const li = l.fields?.li ?? {}; if (li.urn) return li.urn; const m = String(l.linkedin || "").match(/\/in\/(ACoA[\w-]+)/); return m ? m[1] : ""; };
const pidOf = (l: Lead) => { const li = l.fields?.li ?? {}; if (li.pid) return li.pid; const m = String(l.linkedin || "").match(/\/in\/([^/?#]+)/i); return m && !/^ACoA/.test(m[1]) ? decodeURIComponent(m[1]) : ""; };
async function pool(set?: Bot): Promise<Lead[]> {
  const heats = set?.include_warm ? ["Hot", "Warm"] : ["Hot"];
  const { data, error } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key")
    .eq("source", "LinkedIn").eq("archived", false).like("origin_key", "li-person:%").in("heat", heats).limit(2000);
  if (error) throw error;
  return (data ?? []) as Lead[];
}
async function saveLi(l: Lead, li: any, extra: Record<string, unknown> = {}) {
  l.fields = { ...(l.fields ?? {}), li };
  const { error } = await db.from("crm_leads").update({ fields: l.fields, ...extra }).eq("id", l.id);
  if (error) throw error;
}
const log = (lead_id: string, text: string, kind = "message") => db.from("crm_lead_events").insert({ lead_id, kind, text, by_email: BY });
async function stopTasks(leadId: string, why: string) {
  await db.from("crm_li_tasks").update({ status: "skipped", error: why }).eq("lead_id", leadId).in("status", ["review", "ready", "sending"]);
}

// ───────── state: accepts and replies ─────────
async function state(b: any) {
  const leads = await pool({ include_warm: true } as Bot);
  const byId = new Map<string, Lead>();
  for (const l of leads) for (const k of idsOf(l)) byId.set(k, l);
  const find = (x: any) => byId.get(String(x?.urn ?? "").toLowerCase()) ?? byId.get(String(x?.pid ?? "").toLowerCase());
  let accepted = 0, replied = 0;
  for (const c of b.connections ?? []) {
    const l = find(c); if (!l) continue;
    const li = { ...(l.fields?.li ?? {}) };
    if (li.acc) continue;
    li.acc = c.at || now(); if (c.urn) li.urn = c.urn; if (c.pid) li.pid = c.pid;
    await saveLi(l, li);
    await log(l.id, li.req ? "Accepted our LinkedIn request" : "Already connected with us on LinkedIn");
    accepted++;
  }
  for (const t of b.threads ?? []) {
    const l = find(t); if (!l || !t.them_at) continue;
    const li = { ...(l.fields?.li ?? {}) };
    const since = Date.parse(li.req || li.dm || li.inmail || "") || 0;
    if (!li.replied && !li.stop && since && t.me_at && Date.parse(t.me_at) > (Date.parse(li.last || "") || 0) + 10 * 60e3) {
      await saveLi(l, { ...li, stop: "you messaged them" });
      await stopTasks(l.id, "You messaged them yourself");
      await log(l.id, "You messaged them yourself on LinkedIn, so the bot stopped its follow-ups.", "note");
      continue;
    }
    if (li.replied || !since || Date.parse(t.them_at) <= since) continue;
    li.replied = t.them_at; li.stop = "replied"; if (t.urn) li.urn = t.urn;
    await saveLi(l, li, ACTIVE.test(l.stage) ? { stage: "In talks" } : {});
    await stopTasks(l.id, "They replied");
    await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "message", text: "Replied on LinkedIn: “" + clip(String(t.them_text ?? ""), 600) + "”", by_email: "linkedin" });
    replied++;
  }
  return { accepted, replied };
}

// ───────── plan: queue what's due, hand out what's approved ─────────
const firstName = (n: string) => {
  const parts = String(n || "").replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|prof)$/i.test(w));
  const f = parts[0] ?? "";
  return f ? f[0].toUpperCase() + (f === f.toUpperCase() ? f.slice(1).toLowerCase() : f.slice(1)) : "there";
};
const fill = (tpl: string, l: Lead, hook = "") => tpl.replaceAll("{first}", firstName(l.name)).replaceAll("{company}", l.company || "your company")
  .replaceAll("{where}", l.x_handle ? "X and LinkedIn" : "LinkedIn").replaceAll("{hook}", hook).replace(/[ \t]{2,}/g, " ").replace(/\s*[—–]\s*/g, ", ").trim();

async function plan(_b: any) {
  const set = await settings();
  const leads = await pool(set);
  const { data: open } = await db.from("crm_li_tasks").select("lead_id,kind,step,status").in("lead_id", leads.map((l) => l.id).slice(0, 2000));
  const tasksOf = new Map<string, any[]>();
  for (const t of open ?? []) tasksOf.set(t.lead_id, [...(tasksOf.get(t.lead_id) ?? []), t]);
  const status = set.mode === "auto" ? "ready" : "review";
  const m0 = new Date(); m0.setUTCDate(1); m0.setUTCHours(0, 0, 0, 0);
  const { count: notesUsed } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("kind", "invite").eq("status", "sent").neq("text", "").gte("sent_at", m0.toISOString());
  let notesLeft = set.notes_month - (notesUsed ?? 0);
  const newRows: any[] = [], needHook: Lead[] = [];
  let finished = 0;
  for (const l of leads) {
    const li = { ...(l.fields?.li ?? {}) };
    const ts = tasksOf.get(l.id) ?? [];
    if (li.stop || li.replied || !ACTIVE.test(l.stage)) continue;
    if (ts.some((t) => ["review", "ready", "sending"].includes(t.status))) continue;
    const had = (kind: string, step = 0) => ts.find((t) => t.kind === kind && t.step === step);
    if (!li.req && !li.acc) {
      const t = had("invite");
      if (t?.status === "skipped") { await saveLi(l, { ...li, stop: "skipped" }); continue; }
      if (t?.status === "failed") continue;                                // shown on Outreach with Retry
      if (!t) needHook.push(l);
      continue;
    }
    if (li.acc && !li.dm) {
      const t = had("dm");
      if (t?.status === "skipped") { await saveLi(l, { ...li, stop: "skipped" }); continue; }
      if (!t) newRows.push({ lead_id: l.id, kind: "dm", step: 0, text: fill(set.dm1, l), status });
      continue;
    }
    if (li.dm) {
      const n = (li.fu ?? 0) + 1, due = (Date.parse(li.last || li.dm) || 0) + set.gap_days * 86400e3 - 2 * 3600e3;
      if (Date.now() < due) continue;
      if (n > set.followups) {
        await saveLi(l, { ...li, stop: "no reply" }, { stage: "Cold lead" });
        await log(l.id, "No reply after DM 1 and " + set.followups + " follow-ups on LinkedIn. Moved to Cold lead.", "note");
        finished++; continue;
      }
      const t = had("followup", n);
      if (t?.status === "skipped") { await saveLi(l, { ...li, fu: n, last: now() }); continue; }
      if (!t) newRows.push({ lead_id: l.id, kind: "followup", step: n, text: fill(set.fu[n - 1] ?? "", l), status });
    }
  }
  // Connection notes: one short opener per person, written from what we know about them.
  if (needHook.length) {
    const hooks = await writeHooks(needHook.slice(0, 40));
    for (const l of needHook.slice(0, 40)) {
      let text = "";
      if (notesLeft > 0) {
        text = fill(set.note, l, hooks.get(l.id) ?? "");
        if (text.length > 300) text = fill(set.note, l, "thanks for checking out my post.");
        if (text.length > 300) text = clip(text, 300);
        notesLeft--;
      }
      newRows.push({ lead_id: l.id, kind: "invite", step: 0, text, status });
    }
  }
  if (newRows.length) {
    const { error } = await db.from("crm_li_tasks").upsert(newRows, { onConflict: "lead_id,kind,step", ignoreDuplicates: true });
    if (error) throw error;
  }

  // Hand out what's approved, at a human pace: a few per run, and never past LinkedIn's weekly request ceiling.
  await db.from("crm_li_tasks").update({ status: "ready" }).eq("status", "sending").lt("created_at", new Date(Date.now() - 3600e3).toISOString());
  let tasks: any[] = [];
  if (!set.paused && inHours(set.hours)) {
    const wk = new Date(Date.now() - 7 * 86400e3).toISOString();
    const { count: weekSent } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("kind", "invite").eq("status", "sent").gte("sent_at", wk);
    const invitesLeft = Math.max(0, Math.min(6, set.week_cap - (weekSent ?? 0)));
    const { data: ready } = await db.from("crm_li_tasks").select("id,lead_id,kind,step,text,subject").eq("status", "ready").order("created_at").limit(40);
    const inv = (ready ?? []).filter((t) => t.kind === "invite").slice(0, invitesLeft);
    const msg = (ready ?? []).filter((t) => t.kind !== "invite").slice(0, 10);
    tasks = [...msg, ...inv];
    if (tasks.length) {
      const { data: ls } = await db.from("crm_leads").select("id,name,linkedin,fields,stage,archived").in("id", tasks.map((t) => t.lead_id));
      const L = new Map((ls ?? []).map((l: any) => [l.id, l]));
      tasks = tasks.filter((t) => { const l: any = L.get(t.lead_id); return l && !l.archived && !l.fields?.li?.replied; })
        .map((t) => { const l: any = L.get(t.lead_id); return { ...t, name: l.name, urn: urnOf(l), pid: pidOf(l), profile: l.linkedin }; });
      if (tasks.length) await db.from("crm_li_tasks").update({ status: "sending" }).in("id", tasks.map((t) => t.id));
    }
  }
  // People whose LinkedIn id we still need (to send anything), or whose email we haven't looked for since they connected.
  const lookups = leads.filter((l) => { const li = l.fields?.li ?? {}; return (!urnOf(l) && !li.lookup_fail) || (li.acc && !li.ci && !l.email); })
    .slice(0, 8).map((l) => ({ lead_id: l.id, urn: urnOf(l), pid: pidOf(l), profile: l.linkedin, connected: !!l.fields?.li?.acc }));
  await saveStatus({ last_plan: now(), queued: newRows.length, handed_out: tasks.length });
  return { queued: newRows.length, finished, tasks, lookups, paused: set.paused, in_hours: inHours(set.hours) };
}

// claim: right before sending, make sure it's still approved (not skipped, not already sent, they haven't replied).
async function claim(b: any) {
  const { data } = await db.from("crm_li_tasks").update({ status: "sending" }).eq("id", b.id).in("status", ["sending", "ready"]).select("id,lead_id");
  if (!data?.length) return { ok: false };
  const { data: l } = await db.from("crm_leads").select("fields,archived").eq("id", data[0].lead_id).maybeSingle();
  if (!l || l.archived || l.fields?.li?.replied || l.fields?.li?.stop) {
    await db.from("crm_li_tasks").update({ status: "skipped", error: "Stopped before sending" }).eq("id", b.id);
    return { ok: false };
  }
  return { ok: true };
}

// ───────── done: one request or message went out (or didn't) ─────────
async function done(b: any) {
  const { data: t } = await db.from("crm_li_tasks").select("*").eq("id", b.id).maybeSingle();
  if (!t) return { error: "No such task" };
  if (t.status === "sent") return { ok: true };
  const { data: l } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key").eq("id", t.lead_id).maybeSingle();
  if (!l) return { error: "No such lead" };
  const lead = l as Lead;
  const li = { ...(lead.fields?.li ?? {}) };
  if (b.urn) li.urn = b.urn; if (b.pid) li.pid = b.pid;
  const at = now();
  if (b.already === "connected") {
    await db.from("crm_li_tasks").update({ status: "skipped", error: "Already connected" }).eq("id", t.id);
    if (!li.acc) { li.acc = at; await log(lead.id, "Already connected with us on LinkedIn"); }
    await saveLi(lead, li); return { ok: true };
  }
  if (b.already === "pending") {
    await db.from("crm_li_tasks").update({ status: "skipped", error: "A request was already pending" }).eq("id", t.id);
    if (!li.req) li.req = at;
    await saveLi(lead, li); return { ok: true };
  }
  if (!b.ok) {
    await db.from("crm_li_tasks").update({ status: "failed", error: clip(String(b.error ?? "Failed"), 300) }).eq("id", t.id);
    await saveLi(lead, li); return { ok: true };
  }
  await db.from("crm_li_tasks").update({ status: "sent", sent_at: at, error: "" }).eq("id", t.id);
  const stage: Record<string, unknown> = {};
  if (t.kind === "invite") {
    li.req = at; li.note = !!t.text; li.last = at;
    if (/^new$/i.test(lead.stage)) stage.stage = "Contacted";
    await log(lead.id, t.text ? "LinkedIn connection request sent, with this note:\n" + t.text : "LinkedIn connection request sent (no note left this month)");
  } else if (t.kind === "dm") {
    li.dm = at; li.last = at; li.fu = 0;
    if (/^new$/i.test(lead.stage)) stage.stage = "Contacted";
    await log(lead.id, "LinkedIn DM 1 sent:\n" + t.text);
  } else if (t.kind === "followup") {
    li.fu = t.step; li.last = at;
    if (/^(new|contacted)$/i.test(lead.stage)) stage.stage = "Follow up";
    await log(lead.id, "LinkedIn follow-up " + t.step + " sent:\n" + t.text);
  } else if (t.kind === "inmail") {
    li.inmail = at; li.last = at;
    if (/^new$/i.test(lead.stage)) stage.stage = "Contacted";
    await log(lead.id, "LinkedIn InMail sent" + (t.subject ? " (" + t.subject + ")" : "") + ":\n" + t.text);
  }
  await saveLi(lead, li, { ...stage, last_touch: at });
  return { ok: true };
}

// ───────── contact: their LinkedIn id, and email if they share it ─────────
async function contact(b: any) {
  const { data: l } = await db.from("crm_leads").select("id,name,email,linkedin,fields,stage,heat,company,role,x_handle,source_detail,origin_key").eq("id", b.lead_id).maybeSingle();
  if (!l) return { error: "No such lead" };
  const lead = l as Lead;
  const li = { ...(lead.fields?.li ?? {}) };
  if (b.urn) li.urn = b.urn; if (b.pid) li.pid = b.pid;
  if (!b.urn && !urnOf(lead)) li.lookup_fail = now();
  if (li.acc || b.connected) li.ci = now();
  if (b.connected && !li.acc) { li.acc = now(); await log(lead.id, "Already connected with us on LinkedIn"); }
  const extra: Record<string, unknown> = {};
  const email = String(b.email ?? "").trim().toLowerCase();
  if (email && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) && !lead.email) {
    extra.email = email;
    await log(lead.id, "Email found on their LinkedIn profile: " + email, "note");
  }
  await saveLi(lead, li, extra);
  return { ok: true };
}

// ───────── connection-note openers (Composio's language model, the one li-engage uses) ─────────
async function mcp(name: string, args: Record<string, unknown>) {
  const res = await fetch("https://connect.composio.dev/mcp", { method: "POST",
    headers: { "x-consumer-api-key": COMPOSIO, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const txt = await res.text();
  if (!res.ok) throw new Error("Composio answered " + res.status);
  const line = txt.match(/^data: (.*)$/m);
  const j = JSON.parse(line ? line[1] : txt);
  if (j.error) throw new Error("Composio: " + String(j.error.message ?? j.error).slice(0, 200));
  return JSON.parse(j.result?.content?.[0]?.text ?? "{}");
}
async function writeHooks(leads: Lead[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data: ppl } = await db.from("crm_social_people").select("lead_id,person_key,headline,why,company,company_what,company_stage").in("lead_id", leads.map((l) => l.id));
  const keys = (ppl ?? []).map((p) => p.person_key);
  const { data: eng } = keys.length ? await db.from("crm_social_engagements").select("person_key,post_id,kind,said").eq("platform", "linkedin").in("person_key", keys) : { data: [] };
  const postIds = [...new Set((eng ?? []).map((e) => e.post_id))];
  const { data: posts } = postIds.length ? await db.from("crm_social_posts").select("post_id,text").eq("platform", "linkedin").in("post_id", postIds) : { data: [] };
  const postText = new Map((posts ?? []).map((p) => [p.post_id, String(p.text ?? "").split("\n").find((x: string) => x.trim()) ?? ""]));
  const fallback = (l: Lead, did: any) => did?.kind === "commented" ? "thanks for the comment on my post." : "thanks for checking out my post.";
  const items = leads.map((l) => {
    const p: any = (ppl ?? []).find((x) => x.lead_id === l.id) ?? {};
    const did: any = (eng ?? []).find((e) => e.person_key === p.person_key && e.kind === "commented") ?? (eng ?? []).find((e) => e.person_key === p.person_key);
    out.set(l.id, fallback(l, did));
    const facts = ["Name: " + l.name, "Headline: " + (p.headline || l.role), "Company: " + (l.company || p.company || "unknown"),
      p.company_what ? "What the company does: " + p.company_what : "", p.company_stage && p.company_stage !== "unknown" ? "Funding stage: " + p.company_stage : "",
      did ? (did.kind === "commented" ? "They commented on my post \"" + clip(postText.get(did.post_id) ?? "", 120) + "\": \"" + clip(did.said ?? "", 250) + "\"" :
        "They liked my post \"" + clip(postText.get(did.post_id) ?? "", 120) + "\"") : ""].filter(Boolean).join("\n");
    return { id: l.id, prompt: "Write the opening of a LinkedIn connection note. It comes right after \"Hey {first}, \" and before \"I had a look at your LinkedIn and have 3 small ideas that could bring in more inbound.\"\n" +
      "Write ONE short, warm, specific sentence, under 100 characters, starting lowercase. Pick the most positive true thing: congrats on a recent raise, YC batch or launch if the facts show one; otherwise mention their comment or the post they liked. " +
      "Never invent facts. No selling, no questions, no emojis, no hashtags, no dashes. End with a period. Reply with the sentence only.\n\nFacts:\n" + facts };
  });
  if (!COMPOSIO) return out;
  try {
    const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(items))));
    const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
      "items = json.loads(base64.b64decode('" + payload + "').decode())",
      "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
      "with ThreadPoolExecutor(8) as ex: res = dict(ex.map(one, items))", "print('@@' + json.dumps(res))"].join("\n");
    const outp = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Write LinkedIn connection note openers for the CRM" });
    const res = JSON.parse(String(outp?.data?.stdout ?? "").split("@@").pop() || "{}");
    for (const l of leads) {
      let s = String(res[l.id] ?? "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s*[—–-]\s+/g, ", ").replace(/#\w+/g, "").trim();
      if (!s || s.length > 140 || /\?/.test(s)) continue;
      if (!/^I/.test(s)) s = s[0].toLowerCase() + s.slice(1);   // keep "I" capital
      if (!/[.!]$/.test(s)) s += ".";
      out.set(l.id, s);
    }
  } catch (_) { /* fall back to the plain openers */ }
  return out;
}

// ───────── cal.com: a booking moves the lead to Call booked ─────────
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function calBooking(req: Request) {
  const raw = await req.text();
  if (!CAL_SECRET || (await hmacHex(CAL_SECRET, raw)) !== (req.headers.get("x-cal-signature-256") ?? "")) return json({ error: "Bad signature" }, 401);
  const ev = JSON.parse(raw || "{}");
  if (!/BOOKING_CREATED|BOOKING_RESCHEDULED/.test(ev.triggerEvent ?? "")) return json({ ignored: ev.triggerEvent });
  const p = ev.payload ?? {}, who = (p.attendees ?? [])[0] ?? {};
  const email = String(who.email ?? "").toLowerCase(), name = String(who.name ?? "").trim();
  const when = p.startTime ? new Date(p.startTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "";
  let { data: l } = email ? await db.from("crm_leads").select("id,fields,stage").eq("archived", false).ilike("email", email).limit(1).maybeSingle() : { data: null };
  if (!l && name) ({ data: l } = await db.from("crm_leads").select("id,fields,stage").eq("archived", false).ilike("name", name).order("updated_at", { ascending: false }).limit(1).maybeSingle());
  if (!l) {
    const { data: n, error } = await db.from("crm_leads").insert({ name: name || email, email, direction: "Inbound", source: "Referral", source_detail: "Booked on cal.com",
      stage: "Call booked", created_by: "automation" }).select("id,fields,stage").single();
    if (error) throw error;
    l = n;
  } else {
    const li = { ...((l as any).fields?.li ?? {}) };
    if (li.req || li.dm) li.stop = "booked";
    await db.from("crm_leads").update({ stage: "Call booked", fields: { ...((l as any).fields ?? {}), li }, ...(email ? { email } : {}) }).eq("id", (l as any).id);
    await stopTasks((l as any).id, "They booked a call");
  }
  await db.from("crm_lead_events").insert({ lead_id: (l as any).id, kind: "meeting", text: "Booked a call on cal.com" + (when ? " for " + when : ""), by_email: "cal.com" });
  return json({ ok: true });
}
