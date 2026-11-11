// daily-brief (11 Nov): every morning at 8:00 IST, what happened yesterday on LinkedIn, X and Instagram, and who to follow up
// with today, saved in crm_briefs for Leads > Daily brief. Also runs from "Write it now" on that page.
// Sections (Reyansh's format): Overall update, LinkedIn update (+ follow-ups on LinkedIn or WhatsApp), X update (same),
// Instagram (people we took to WhatsApp but haven't spoken to in 2+ days), Calls (from Gmail once it's connected in Composio:
// booking emails from cal.com / Calendly / Google Calendar, with their Google Meet links saved on the lead).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const COMPOSIO = Deno.env.get("COMPOSIO_API_KEY") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const MCP_URL = "https://connect.composio.dev/mcp";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const DAY = 864e5, IST = 330 * 60e3;
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10);
const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// "9 Nov 2026, 23:55", "11 Nov 2026 08:24", "2026-11-09" or an ISO time -> ms (sheet times are IST)
function parseT(s: unknown): number | null {
  const v = String(s ?? "").trim(); if (!v) return null;
  const m = v.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (m && MON[m[2].toLowerCase()] != null) return Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1], +(m[4] ?? 0), +(m[5] ?? 0)) - IST;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Date.parse(v + "T00:00:00Z") - IST;
  if (/^\d{12,}$/.test(v)) return +v;
  const t = Date.parse(v); return isNaN(t) ? null : t;
}
const first = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";
const daysAgo = (t: number) => Math.floor((Date.now() - t) / DAY);
const ago = (t: number) => { const d = daysAgo(t); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const digits = (p: string) => String(p || "").replace(/[^\d+]/g, "");
const wa = (p: string) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "91" + d; return d.length >= 10 ? "https://wa.me/" + d : ""; };

async function allowed(req: Request): Promise<boolean> {
  if (CRON && req.headers.get("x-cron-secret") === CRON) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.from("crm_team").select("email").limit(1);
  return !!data?.length;
}
async function mcp(name: string, args: Record<string, unknown>) {
  const res = await fetch(MCP_URL, { method: "POST",
    headers: { "x-consumer-api-key": COMPOSIO, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const txt = await res.text();
  if (!res.ok) throw new Error("Composio answered " + res.status);
  const line = txt.match(/^data: (.*)$/m);
  const j = JSON.parse(line ? line[1] : txt);
  if (j.error) throw new Error("Composio: " + String(j.error.message ?? j.error).slice(0, 200));
  try { return JSON.parse(j.result?.content?.[0]?.text ?? "{}"); } catch { return {}; }
}

type Lead = { id: string; name: string; company: string; role: string; source: string; stage: string; phone: string; email: string; x_handle: string;
  linkedin: string; instagram: string; last_touch: string | null; next_date: string | null; stage_at: string | null; created_at: string; fields: any };
type Item = { id?: string; name: string; sub: string; why: string; channel: "LinkedIn" | "X" | "WhatsApp" | "Instagram"; link: string; days?: number; phone?: string };
const OPEN = new Set(["New", "Contacted", "In talks", "Follow up", "Call booked", "Proposal sent"]);
const TALKING = new Set(["In talks", "Follow up", "Call booked", "Proposal sent"]);
const lastAct = (l: Lead) => Math.max(Date.parse(l.last_touch ?? "") || 0, +(l.fields?.ig_last_at ?? 0) || 0, Date.parse(l.stage_at ?? "") || 0, Date.parse(l.created_at) || 0);
const sub = (l: Lead) => [l.role, l.company].filter(Boolean).join(" · ");
const liLink = (l: Lead) => l.linkedin || (l.fields?.li?.pid ? "https://www.linkedin.com/in/" + l.fields.li.pid : "");

// ───────── Gmail: booking emails -> calls with their Meet links ─────────
type Call = { name: string; email: string; at: number | null; meet: string; title: string; from: string; lead_id?: string; lead_name?: string };
async function gmailCalls(leads: Lead[]): Promise<{ status: string; calls: Call[] }> {
  if (!COMPOSIO) return { status: "not connected", calls: [] };
  let alias = "";
  try {
    const out = await mcp("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "gmail", action: "list" }] });
    const acc = (out?.data?.results?.gmail?.accounts ?? []).find((a: any) => a.status === "active");
    alias = acc ? acc.alias || acc.id : "";
  } catch (_) { return { status: "error", calls: [] }; }
  if (!alias) return { status: "not connected", calls: [] };
  let msgs: any[] = [];
  try {
    const q = "newer_than:3d (meet.google.com OR from:calendly.com OR from:cal.com OR subject:(invitation OR booked OR \"new event\" OR scheduled))";
    const out = await mcp("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{ tool_slug: "GMAIL_FETCH_EMAILS", arguments: { query: q, max_results: 40, include_payload: false, verbose: true }, account: alias }], sync_response_to_workbench: false });
    const r = (out?.data?.results ?? [])[0]; msgs = r?.response?.data?.messages ?? r?.response?.data?.data?.messages ?? [];
  } catch (_) { return { status: "error", calls: [] }; }
  const byEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email.toLowerCase(), l]));
  const byName = new Map(leads.filter((l) => l.name).map((l) => [l.name.toLowerCase().trim(), l]));
  const calls: Call[] = [], seen = new Set<string>();
  for (const m of msgs) {
    const subject = String(m.subject ?? ""), body = String(m.messageText ?? m.preview?.body ?? m.snippet ?? ""), from = String(m.sender ?? m.from ?? "");
    const text = subject + "\n" + body;
    const meet = (text.match(/https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i) ?? [])[0] ?? "";
    if (!meet && !/calendly|cal\.com|invitation|booked|scheduled/i.test(from + subject)) continue;
    if (/cancel/i.test(subject)) continue;
    const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))]
      .filter((e) => !/calendly|cal\.com|google\.com|sove7gn|noreply|no-reply|calendar-notification/i.test(e));
    let lead = emails.map((e) => byEmail.get(e)).find(Boolean);
    let name = (body.match(/(?:Invitee|Name|Attendee)s?:?\s*\n?\s*([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){0,3})/) ?? [])[1] ??
      (subject.match(/(?:with|between)\s+([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){0,3})/) ?? [])[1] ?? "";
    if (!lead && name) lead = byName.get(name.toLowerCase().trim());
    const whenM = text.match(/(\w+day,?\s+)?(\w+ \d{1,2},? \d{4}|\d{1,2} \w+ \d{4})[^\n]{0,20}?(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    const at = whenM ? Date.parse(whenM[2] + " " + whenM[3]) || null : null;
    const key = meet || subject + (emails[0] ?? "");
    if (seen.has(key)) continue; seen.add(key);
    calls.push({ name: lead?.name || name || emails[0] || "Someone", email: emails[0] ?? "", at, meet, title: clip(subject, 120), from: /calendly/i.test(from) ? "Calendly" : /cal\.com/i.test(from) ? "cal.com" : "Gmail",
      lead_id: lead?.id, lead_name: lead?.name });
  }
  // Save the Meet link on the lead, and move them to Call booked if they weren't further along.
  for (const c of calls) {
    if (!c.lead_id) continue;
    const l = leads.find((x) => x.id === c.lead_id)!; const old = l.fields?.call ?? {};
    if (old.meet === c.meet && old.at === c.at) continue;
    const fields = { ...(l.fields ?? {}), call: { ...old, meet: c.meet || old.meet || "", at: c.at ?? old.at ?? null, title: c.title, src: c.from, seen: new Date().toISOString() } };
    const early = ["New", "Contacted", "In talks", "Follow up", "Cold lead"].includes(l.stage);
    await db.from("crm_leads").update({ fields, ...(early ? { stage: "Call booked" } : {}) }).eq("id", l.id);
    await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "meeting", text: "Call booking found in Gmail" + (c.meet ? ": " + c.meet : "") + (early ? " (moved to Call booked)" : ""), by_email: "gmail" });
  }
  return { status: "connected", calls };
}

// ───────── the brief ─────────
async function build() {
  const now = Date.now(), today = istDay(now);
  const start = Date.parse(today + "T00:00:00Z") - IST - DAY, end = start + DAY;          // yesterday, IST
  const inY = (t: number | null) => t != null && t >= start && t < end;
  const yday = istDay(start);

  const leads = ((await db.from("crm_leads").select("id,name,company,role,source,stage,phone,email,x_handle,linkedin,instagram,last_touch,next_date,stage_at,created_at,fields").eq("archived", false).limit(5000)).data ?? []) as Lead[];
  const ev = (await db.from("crm_lead_events").select("lead_id,kind,text,at").gte("at", new Date(start).toISOString()).lt("at", new Date(end).toISOString()).limit(5000)).data ?? [];
  const tasks = (await db.from("crm_li_tasks").select("lead_id,kind,status,sent_at").eq("status", "sent").gte("sent_at", new Date(start).toISOString()).lt("sent_at", new Date(end).toISOString())).data ?? [];
  const sheet = (await db.from("crm_sheet").select("tab,row,cells").in("tab", ["DM Pipeline", "Post Engagers", "Our Posts", "Post Tracking"]).limit(5000)).data ?? [];
  const xPeople = (await db.from("crm_x_people").select("fit,first_seen,found_by").gte("first_seen", new Date(start).toISOString()).lt("first_seen", new Date(end).toISOString())).data ?? [];
  const byId = new Map(leads.map((l) => [l.id, l]));
  const src = (id: string) => byId.get(id)?.source ?? "";
  const booked = (s: string) => ev.filter((e) => (e.kind === "meeting" || (e.kind === "stage" && /→\s*Call booked/.test(e.text ?? ""))) && src(e.lead_id) === s).map((e) => e.lead_id);
  const uniq = (a: string[]) => [...new Set(a)].length;

  // LinkedIn
  const L = leads.filter((l) => l.source === "LinkedIn");
  const li = {
    requests: tasks.filter((t) => t.kind === "invite").length,
    accepted: L.filter((l) => inY(Date.parse(l.fields?.li?.acc ?? "") || null)).length,
    dms: tasks.filter((t) => t.kind === "dm").length,
    followups: tasks.filter((t) => t.kind === "followup").length,
    replies: L.filter((l) => inY(Date.parse(l.fields?.li?.replied ?? "") || null)).length,
    calls: uniq(booked("LinkedIn")),
    found: L.filter((l) => inY(Date.parse(l.created_at))).length,
  };
  const liFollow: Item[] = [];
  for (const l of L) {
    if (!OPEN.has(l.stage)) continue;
    const last = lastAct(l), d = daysAgo(last), rep = Date.parse(l.fields?.li?.replied ?? "") || 0;
    const due = l.next_date && l.next_date.slice(0, 10) <= today;
    let why = "";
    if (rep && l.stage === "In talks" && last - rep < 60e3 * 5 && d >= 1) why = "Replied " + ago(rep) + ", nothing from us since";
    else if (TALKING.has(l.stage) && d >= 2) why = l.stage + ", last touch " + ago(last);
    else if (due) why = "Follow-up date was " + (l.next_date!.slice(0, 10) === today ? "today" : new Date(l.next_date!.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }));
    if (!why) continue;
    const phone = digits(l.phone);
    liFollow.push({ id: l.id, name: l.name, sub: sub(l), why, channel: phone ? "WhatsApp" : "LinkedIn", link: phone ? wa(phone) : liLink(l), days: d, phone });
  }

  // X (the DM Pipeline sheet, the post engagers, our posts and their numbers)
  const H = (tab: string) => { const rows = sheet.filter((r) => r.tab === tab).sort((a, b) => a.row - b.row); const h = rows.find((r) => (r.cells ?? []).filter(Boolean).length > 5); return { h: h?.cells ?? [], rows: rows.filter((r) => h && r.row > h.row) }; };
  const col = (h: string[], name: string) => h.indexOf(name);
  const P = H("DM Pipeline"), ph = P.h;
  const c = (r: any, n: string) => String(r.cells?.[col(ph, n)] ?? "");
  const xs = {
    dms: P.rows.filter((r) => inY(parseT(c(r, "Sent on")))).length,
    followups: P.rows.filter((r) => inY(parseT(c(r, "FU1 sent"))) || inY(parseT(c(r, "FU2 sent")))).length,
    replies: P.rows.filter((r) => inY(parseT(c(r, "Replied on")))).length,
    cant: P.rows.filter((r) => /Not sent on X \((\d+ \w+)\)/.test(c(r, "DM result")) && inY(parseT((c(r, "DM result").match(/\((\d+ \w+)\)/) ?? [])[1] + " " + new Date(start + IST).getUTCFullYear()))).length,
    engaged: xPeople.filter((p: any) => p.found_by !== "leads").length, found: xPeople.filter((p: any) => p.found_by === "leads" && p.fit === "hot").length,
    posts: 0, views: 0, calls: uniq(booked("X")),
  };
  const O = H("Our Posts"), oh = O.h;
  xs.posts = O.rows.filter((r) => /^x$/i.test(String(r.cells?.[col(oh, "Platform")] ?? "X") || "X") && /posted/i.test(String(r.cells?.[col(oh, "Status")] ?? "")) && istDay(parseT(r.cells?.[col(oh, "Date")]) ?? 0) === yday).length;
  const T = H("Post Tracking"), th = T.h, views = new Map<string, { b: number; e: number }>();
  for (const r of T.rows) {
    const t = parseT(r.cells?.[col(th, "Checked at (IST)")]), link = String(r.cells?.[col(th, "Post link")] ?? ""), v = +String(r.cells?.[col(th, "Views")] ?? "").replace(/[^\d]/g, "") || 0;
    if (t == null || !link) continue; const m = views.get(link) ?? { b: 0, e: 0 };
    if (t < start) m.b = Math.max(m.b, v); if (t < end) m.e = Math.max(m.e, v); views.set(link, m);
  }
  xs.views = [...views.values()].reduce((a, m) => a + Math.max(0, m.e - m.b), 0);
  const xFollow: Item[] = [];
  for (const r of P.rows) {
    const st = c(r, "Status"), name = c(r, "Name"), handle = c(r, "X handle").replace(/^@/, ""); if (!name) continue;
    const sent = parseT(c(r, "Sent on")), f1 = parseT(c(r, "FU1 sent")), f2 = parseT(c(r, "FU2 sent")), rep = parseT(c(r, "Replied on")), call = c(r, "Call on");
    const link = handle ? "https://x.com/messages/compose?recipient_id=" + c(r, "X user ID") : "";
    const xl = handle ? (c(r, "X user ID") ? link : "https://x.com/" + handle) : "";
    let why = "";
    if (rep && !call && !/closed|call booked/i.test(st)) why = "Replied " + ago(rep) + ": answer them";
    else if (sent && !rep && !f1 && /sent/i.test(st) && now - sent >= 3 * DAY) why = "Follow-up 1 due (first DM " + ago(sent) + ")";
    else if (f1 && !rep && !f2 && now - f1 >= 4 * DAY) why = "Follow-up 2 due (follow-up 1 " + ago(f1) + ")";
    if (why) xFollow.push({ name, sub: [c(r, "Role"), c(r, "Company")].filter(Boolean).join(" · "), why, channel: "X", link: xl });
  }
  const E = H("Post Engagers"), eh = E.h;
  for (const r of E.rows) {
    const st = String(r.cells?.[col(eh, "Status")] ?? ""), verdict = String(r.cells?.[col(eh, "Verdict")] ?? "");
    if (st && st !== "To message") continue; if (/skip/i.test(verdict)) continue;
    const handle = String(r.cells?.[col(eh, "Handle")] ?? "").replace(/^@/, ""); if (!handle || /^grok$|bot$/i.test(handle) || /\bbot\b/i.test(String(r.cells?.[col(eh, "Name")] ?? ""))) continue;
    xFollow.push({ name: String(r.cells?.[col(eh, "Name")] ?? handle), sub: "@" + handle, why: "Engaged with our post (" + String(r.cells?.[col(eh, "How")] ?? "replied").toLowerCase() + "): reply and DM", channel: "X", link: String(r.cells?.[col(eh, "Their link")] ?? "") || "https://x.com/" + handle });
  }
  for (const l of leads.filter((l) => l.source === "X" && TALKING.has(l.stage))) {
    const d = daysAgo(lastAct(l)); if (d < 2) continue; const phone = digits(l.phone);
    xFollow.push({ id: l.id, name: l.name, sub: sub(l), why: l.stage + ", last touch " + ago(lastAct(l)), channel: phone ? "WhatsApp" : "X", link: phone ? wa(phone) : l.x_handle ? "https://x.com/" + l.x_handle.replace(/^@/, "") : "", days: d, phone });
  }

  // Instagram: they move to WhatsApp once we've shared our number or booking link; flag anyone quiet for 2+ days.
  const I = leads.filter((l) => l.source === "Instagram");
  const igs = {
    newLeads: I.filter((l) => inY(Date.parse(l.created_at))).length,
    messaged: I.filter((l) => inY(+(l.fields?.ig_last_at ?? 0) || null)).length,
    calls: uniq(booked("Instagram")),
    open: I.filter((l) => TALKING.has(l.stage)).length,
  };
  const rank: Record<string, number> = { "Proposal sent": 0, "Call booked": 1, "In talks": 2, "Follow up": 3 };
  const igStale: Item[] = I.filter((l) => TALKING.has(l.stage) && daysAgo(lastAct(l)) >= 2)
    .map((l) => { const d = daysAgo(lastAct(l)), phone = digits(l.phone); const h = (l.instagram || "").replace(/^@/, "");
      return { id: l.id, name: l.name || "@" + h, sub: [l.stage, h ? "@" + h : ""].filter(Boolean).join(" · "), why: "No update in " + d + " days" + (l.fields?.ig_summary ? ": " + clip(String(l.fields.ig_summary), 140) : ""),
        channel: (phone ? "WhatsApp" : "Instagram") as Item["channel"], link: phone ? wa(phone) : h ? "https://ig.me/m/" + h : "", days: d, phone }; })
    .sort((a, b) => (rank[a.sub.split(" · ")[0]] ?? 9) - (rank[b.sub.split(" · ")[0]] ?? 9) || (a.days! - b.days!));

  // Calls
  const gm = await gmailCalls(leads);
  const upcoming = leads.filter((l) => l.stage === "Call booked").map((l) => ({ id: l.id, name: l.name, sub: sub(l), source: l.source, at: l.fields?.call?.at ?? null, meet: l.fields?.call?.meet ?? "" }))
    .sort((a, b) => (a.at ?? 9e15) - (b.at ?? 9e15));

  const totalCalls = li.calls + xs.calls + igs.calls;
  const overall = [
    { label: "Messages sent", v: li.requests + li.dms + li.followups + xs.dms + xs.followups, d: "LinkedIn " + (li.requests + li.dms + li.followups) + " · X " + (xs.dms + xs.followups) },
    { label: "Replies", v: li.replies + xs.replies, d: "LinkedIn " + li.replies + " · X " + xs.replies },
    { label: "Calls booked", v: totalCalls, d: "LinkedIn " + li.calls + " · X " + xs.calls + " · Instagram " + igs.calls },
    { label: "New leads", v: li.found + igs.newLeads + xs.found, d: "LinkedIn " + li.found + " · X " + xs.found + " · Instagram " + igs.newLeads },
    { label: "Follow up today", v: liFollow.length + xFollow.length + igStale.length, d: "LinkedIn " + liFollow.length + " · X " + xFollow.length + " · Instagram " + igStale.length },
  ];
  const brief = {
    day: today, yday, made_at: new Date().toISOString(), overall,
    linkedin: { stats: [{ label: "Requests sent", v: li.requests }, { label: "Accepted", v: li.accepted }, { label: "First DMs", v: li.dms }, { label: "Follow-ups", v: li.followups },
      { label: "Replies", v: li.replies }, { label: "Calls booked", v: li.calls }, { label: "New good fits", v: li.found }], follow: liFollow.sort((a, b) => (b.days ?? 0) - (a.days ?? 0)).slice(0, 40), followN: liFollow.length },
    x: { stats: [{ label: "DMs sent", v: xs.dms }, { label: "Follow-ups", v: xs.followups }, { label: "Replies", v: xs.replies }, { label: "Couldn't DM", v: xs.cant },
      { label: "Posts", v: xs.posts }, { label: "Views gained", v: xs.views }, { label: "Good leads found", v: xs.found }, { label: "People who engaged", v: xs.engaged }, { label: "Calls booked", v: xs.calls }], follow: xFollow.slice(0, 40), followN: xFollow.length },
    instagram: { stats: [{ label: "New leads", v: igs.newLeads }, { label: "Chats with new messages", v: igs.messaged }, { label: "Calls booked", v: igs.calls }, { label: "Open conversations", v: igs.open }],
      stale: igStale.slice(0, 40), staleN: igStale.length },
    calls: { gmail: gm.status, found: gm.calls.map((c) => ({ ...c, at: c.at })), upcoming: upcoming.slice(0, 30) },
  };
  await db.from("crm_briefs").upsert({ day: today, data: brief, made_at: brief.made_at });
  return brief;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await allowed(req))) return json({ error: "Only the team can run this." }, 401);
  try { const b = await build(); return json({ ok: true, day: b.day, follow: b.overall[4].v, gmail: b.calls.gmail }); }
  catch (e) { return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500); }
});
