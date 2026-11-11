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
// What carries a call in founders@ (checked 11 Nov, 30 days back):
//  1. Calendly "New Event / Updated / Canceled" (the clipping Discovery Call): invitee, email, time with its time zone, their
//     Instagram handle and WhatsApp number, the Meet link. The search only gives a cut-down copy, so these are read in full in
//     Composio's sandbox, which sends back just those fields.
//  2. cal.com "Your event has been scheduled": Who: <name> - Organizer / <email>, Where: <Meet link>, Additional notes.
//  3. our reminders (SENT, from "Sove7gn Clipping"): "Reminder: our call today at 8:15pm IST", the lead's email in To, the Meet link.
//  4. Google Calendar replies and invites: "Declined: <title> @ Tue 10 Nov 2026 5:30pm - 6pm (IST)" (Accepted / Invitation too).
// Every call gets a kind: clipping (Calendly, anything that says clipping or comes from the Clipping account) or gtm (says GTM,
// or a LinkedIn / X lead's cal.com booking). The lead is found by email, then phone, then Instagram handle, then name.
type Call = { name: string; email: string; phone: string; ig: string; at: number | null; meet: string; title: string; from: string; status: string; kind: string;
  lead_id?: string; lead_name?: string; lead_source?: string; msg_at: number; how?: string };
const OURS = /@sove7gn\.org$|calendly|@cal\.com|google\.com|noreply|no-reply|calendar-notification/i;
const emailsIn = (s: string) => [...new Set((String(s).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))];
const phone10 = (p: string) => String(p || "").replace(/\D/g, "").slice(-10);
const handleOf = (s: string) => String(s || "").toLowerCase().replace(/^.*instagram\.com\//, "").replace(/[/?#].*$/, "").replace(/^@/, "").trim();
const MEET = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;
// "8:15pm" on an IST day -> ms
function istAt(dayMs: number, hm: string): number | null {
  const m = hm.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i); if (!m) return null;
  let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12;
  const d = new Date(dayMs + IST); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, +(m[2] ?? 0)) - IST;
}
// Calendly emails, read whole in the sandbox; only the fields we need come back.
async function calendlyFull(alias: string, ids: string[]): Promise<Record<string, any>> {
  const res: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 12) {
    const code = [
      "import json, re, html",
      "from datetime import datetime",
      "from zoneinfo import ZoneInfo",
      "TZ = {'eastern': 'America/New_York', 'pacific': 'America/Los_Angeles', 'central': 'America/Chicago', 'mountain': 'America/Denver', 'india': 'Asia/Kolkata', 'kolkata': 'Asia/Kolkata', 'gmt': 'UTC', 'utc': 'UTC', 'london': 'Europe/London', 'british': 'Europe/London', 'central europe': 'Europe/Berlin', 'singapore': 'Asia/Singapore', 'dubai': 'Asia/Dubai', 'gulf': 'Asia/Dubai'}",
      "def g(t, k, stop):",
      "    m = re.search(k + r'\\s*:?\\s*(.*?)\\s*(?:' + stop + r'|$)', t)",
      "    return m.group(1).strip() if m else ''",
      "out = {}",
      "for i in " + JSON.stringify(ids.slice(i, i + 12)) + ":",
      "    r, e = run_composio_tool('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {'message_id': i, 'format': 'full', 'user_id': 'me'})",
      "    if e: out[i] = {'err': str(e)[:120]}; continue",
      "    d = (r or {}).get('data', r) or {}",
      "    raw = d.get('messageText') or ''",
      "    links = re.findall(r'https://meet\\.google\\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}', raw)",
      "    t = re.sub(r'<style[\\s\\S]*?</style>', ' ', raw); t = re.sub(r'<[^>]+>', ' ', t); t = html.unescape(t); t = re.sub(r'\\s+', ' ', t)",
      "    when = g(t, 'Event Date/Time', 'Description:|Location:|Invitee Time Zone:')",
      "    at = None",
      "    m = re.match(r'(\\d{1,2}:\\d{2}\\s*[ap]m)\\s*-\\s*\\w+,\\s*(\\d{1,2} \\w+ \\d{4})\\s*\\(([^)]*)\\)', when, re.I)",
      "    if m:",
      "        z = next((v for k, v in TZ.items() if k in m.group(3).lower()), 'UTC')",
      "        try: at = int(datetime.strptime(m.group(2) + ' ' + m.group(1).replace(' ', '').upper(), '%d %B %Y %I:%M%p').replace(tzinfo=ZoneInfo(z)).timestamp() * 1000)",
      "        except Exception: at = None",
      "    out[i] = {'name': g(t, 'Invitee:', 'Invitee Email:'), 'email': g(t, 'Invitee Email:', 'Event Date/Time:|Text Reminder|Description:'), 'at': at, 'when': when[:80],",
      "              'event': g(t, 'Event Type:', 'Invitee:'), 'meet': links[0] if links else '',",
      "              'ig': g(t, 'Instagram Handle Link', 'Roughly|Who are you|Any past|Please share|WhatsApp|View event'), 'phone': g(t, 'WhatsApp Phone Number', 'View event|Pro Tip|$'), 'cancel': bool(re.search(r'has been canceled|Cancel(l)?ation reason', t, re.I))}",
      "print('@@' + json.dumps(out))",
    ].join("\n");
    try {
      const outp = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Read Calendly booking emails" });
      Object.assign(res, JSON.parse(String(outp?.data?.stdout ?? "").split("@@").pop() || "{}"));
    } catch (_) { /* the rest still count from their subject line */ }
  }
  return res;
}
async function gmailCalls(leads: Lead[], dry = false, days = 7): Promise<{ status: string; calls: Call[] }> {
  if (!COMPOSIO) return { status: "not connected", calls: [] };
  let alias = "";
  try {
    const out = await mcp("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "gmail", action: "list" }] });
    const acc = (out?.data?.results?.gmail?.accounts ?? []).find((a: any) => a.status === "active");
    alias = acc ? acc.alias || acc.id : "";
  } catch (_) { return { status: "error", calls: [] }; }
  if (!alias) return { status: "not connected", calls: [] };
  const msgs = new Map<string, any>();
  try {
    // One search per call (several in one call come back as a cut-down preview; one combined OR query found nothing).
    for (const q of ["meet.google.com", "from:calendly.com", "from:cal.com"]) {
      let token = "", pages = 0;
      do {
        const out = await mcp("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{ tool_slug: "GMAIL_FETCH_EMAILS", arguments: { query: "newer_than:" + days + "d " + q, max_results: 20, include_payload: false, verbose: true, ...(token ? { page_token: token } : {}) }, account: alias }], sync_response_to_workbench: false });
        const d = (out?.data?.results ?? [])[0]?.response; const data = d?.data ?? d?.data_preview ?? {};
        for (const m of data.messages ?? []) if (m?.messageId) msgs.set(m.messageId, m);
        token = data.nextPageToken || ""; pages++;
      } while (token && pages < 6);
    }
  } catch (_) { return { status: "error", calls: [] }; }
  const cal = await calendlyFull(alias, [...msgs.values()].filter((m) => /calendly/i.test(m.sender ?? "") && /^(New Event|Updated|Canceled):/i.test(m.subject ?? "")).map((m) => m.messageId));

  const byEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email.toLowerCase().trim(), l]));
  const byPhone = new Map(leads.filter((l) => phone10(l.phone).length === 10).map((l) => [phone10(l.phone), l]));
  const byIg = new Map(leads.filter((l) => l.instagram).map((l) => [handleOf(l.instagram), l]));
  const byName = new Map(leads.filter((l) => l.name && l.name.trim().includes(" ")).map((l) => [l.name.toLowerCase().trim(), l]));
  // Reminders only say "Hi Roshan,": a first name counts when exactly one lead we're talking to has it.
  const fn = (n: string) => String(n || "").toLowerCase().replace(/[^a-z ]/g, " ").trim().split(/\s+/)[0] || "";
  const firstCount = new Map<string, Lead[]>();
  for (const l of leads) if (TALKING.has(l.stage) && fn(l.name).length >= 3) firstCount.set(fn(l.name), [...(firstCount.get(fn(l.name)) ?? []), l]);
  const byFirst = (n: string) => { const a = firstCount.get(fn(n)); return a && a.length === 1 ? a[0] : undefined; };
  // Instagram handles vs the names people type and their email ("kanav.nayyar" booked as kanavnayyar97@...): letters and digits only, 5+ long.
  const an = (x: string) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const igLoose = leads.filter((l) => an(handleOf(l.instagram)).length >= 7).map((l) => [an(handleOf(l.instagram)), l] as [string, Lead]);
  const byLoose = (...keys: string[]) => { const ks = keys.map(an).filter((k) => k.length >= 7); const hit = igLoose.filter(([h]) => ks.some((k) => k.startsWith(h) || h.startsWith(k))); return hit.length === 1 ? hit[0][1] : undefined; };

  const found: Call[] = [];
  for (const m of msgs.values()) {
    const subject = String(m.subject ?? ""), body = String(m.messageText ?? m.preview?.body ?? "").replace(/\r/g, ""), from = String(m.sender ?? "");
    const sent = (m.labelIds ?? []).includes("SENT"), msgAt = Date.parse(m.messageTimestamp ?? "") || Date.now();
    if (/^(Fwd|Re):/i.test(subject)) continue;
    let name = "", email = "", phone = "", ig = "", at: number | null = null, status = "booked", src = "Gmail", kind = "", notes = "";
    let meet = ((subject + "\n" + body).match(MEET) ?? [])[0] ?? "";
    if (/calendly/i.test(from)) {                                                                   // 1. Calendly
      const mm = subject.match(/^(New Event|Updated|Canceled):\s*(.*?)\s+-\s+(\d{1,2}:\d{2}[ap]m)\s+\w{3},\s+(\d{1,2} \w{3} \d{4})\s+-\s+(.*)$/i);
      if (!/^(New Event|Updated|Canceled):/i.test(subject)) continue;
      const c = cal[m.messageId] ?? {};
      src = "Calendly"; kind = "clipping"; status = /^Canceled/i.test(subject) || c.cancel ? "cancelled" : "booked";
      name = c.name || (mm ? mm[2] : ""); email = String(c.email || "").toLowerCase(); phone = c.phone || ""; ig = handleOf(c.ig || ""); meet = c.meet || meet;
      at = c.at ?? (mm ? Date.parse(mm[4] + " " + mm[3].replace(/([ap]m)/i, " $1") + " EST") || null : null);   // the Calendly account shows Eastern time
      notes = String(c.event || (mm ? mm[5] : ""));
      if (/canceled:/i.test(subject)) name = name || (subject.match(/with (.*?) on /i) ?? [])[1] || "";
    } else if (/cal\.com/i.test(from) || /event has been scheduled/i.test(body)) {                  // 2. cal.com
      src = "cal.com";
      const who = body.split(/\nWho:\n/)[1]?.split(/\nWhere:|\nAdditional notes:|\nDescription/)[0] ?? "";
      const lines = who.split("\n").map((x) => x.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) if (/@/.test(lines[i]) && !OURS.test(lines[i])) { email = lines[i].toLowerCase(); name = (lines[i - 1] ?? "").replace(/\s*-\s*Organizer$/i, "").trim(); break; }
      notes = (body.split(/\nAdditional notes:\n/)[1] ?? "").split("\n")[0] ?? "";
      kind = /clip/i.test(notes + subject) ? "clipping" : /gtm/i.test(subject + body) || /linkedin/i.test(notes) ? "gtm" : "";
    } else if (sent && /^Reminder:.*call/i.test(subject)) {                                       // 3. our reminder
      email = emailsIn(m.to ?? "").find((e) => !OURS.test(e)) ?? "";
      name = (body.match(/^Hi ([^,\n]+),/) ?? [])[1] ?? "";
      if (/^(there|all|team|everyone)$/i.test(name.trim())) name = "";
      const t = subject.match(/(today|tomorrow) at (\d{1,2}(?::\d{2})?\s*[ap]m)/i);
      if (t) at = istAt(msgAt + (/tomorrow/i.test(t[1]) ? DAY : 0), t[2]);
      if (/clipping/i.test(from)) kind = "clipping";
    } else if (/^(Declined|Accepted|Tentatively accepted|Invitation|Updated invitation):/i.test(subject)) {   // 4. calendar
      status = /^Declined/i.test(subject) ? "declined" : "booked";
      const t = subject.match(/@ \w{3} (\d{1,2} \w{3} \d{4}) (\d{1,2}(?::\d{2})?\s*[ap]m)/i);
      if (t) at = istAt(Date.parse(t[1] + " 12:00 GMT+0530"), t[2]);
      email = (sent ? emailsIn(m.to ?? "") : emailsIn(from)).find((e) => !OURS.test(e)) ?? "";
      name = sent ? "" : from.replace(/<.*$/, "").replace(/"/g, "").trim();
      if (/^naman\b/i.test(name)) continue;                                                        // our co-founder accepting our own invite
      kind = /clipping/i.test(subject) ? "clipping" : /gtm/i.test(subject) ? "gtm" : "";
    } else continue;
    if (!email && !name && !phone) continue;
    let how = "";
    let lead: Lead | undefined;
    if (email && byEmail.get(email)) { lead = byEmail.get(email); how = "email"; }
    else if (phone10(phone).length === 10 && byPhone.get(phone10(phone))) { lead = byPhone.get(phone10(phone)); how = "phone"; }
    else if (ig && byIg.get(ig)) { lead = byIg.get(ig); how = "Instagram handle"; }
    else if (name && byName.get(name.toLowerCase().trim())) { lead = byName.get(name.toLowerCase().trim()); how = "name"; }
    else if (name && !name.includes(" ") && byFirst(name)) { lead = byFirst(name); how = "first name"; }
    else if (byLoose(ig, email.split("@")[0])) { lead = byLoose(ig, email.split("@")[0]); how = "Instagram handle"; }
    if (!kind) kind = lead ? (lead.source === "Instagram" || /clip|ugc|reel/i.test(String((lead as any).pitch ?? "")) ? "clipping" : "gtm") : "";
    if (!name && email) name = email.split("@")[0];
    found.push({ name: lead?.name || name || email, email, phone, ig, at, meet, title: clip(subject, 120), from: src, status, kind,
      lead_id: lead?.id, lead_name: lead?.name, lead_source: lead?.source, msg_at: msgAt, how });
  }
  // One call per person and meeting: the newest email about it wins, but keep a Meet link, time or contact an older one had.
  const per = new Map<string, Call>();
  for (const c of found.sort((a, b) => a.msg_at - b.msg_at)) {
    const who = c.lead_id || c.email || phone10(c.phone) || c.name.toLowerCase();
    const day = c.at ? istDay(c.at) : "";
    const k = who + "|" + (c.meet || day);
    const o = per.get(k) ?? [...per.entries()].find(([kk, v]) => kk.startsWith(who + "|") && (!v.at || !c.at || Math.abs(v.at - c.at) < 2 * DAY))?.[1];
    const merged = o ? { ...o, ...c, meet: c.meet || o.meet, at: c.at ?? o.at, email: c.email || o.email, phone: c.phone || o.phone, ig: c.ig || o.ig, kind: c.kind || o.kind, how: c.how || o.how } : c;
    if (o) for (const [kk, v] of per) if (v === o) per.delete(kk);
    per.set(k, merged);
  }
  const calls = [...per.values()].filter((c) => c.lead_id || !/^reyansh( juneja)?$/i.test(c.name.trim()));   // our own test bookings
  // Save each lead's calls (newest five) and the one that matters now (the next upcoming one, else the latest), plus contact details we didn't have.
  const byLead = new Map<string, Call[]>();
  for (const c of calls) if (c.lead_id) byLead.set(c.lead_id, [...(byLead.get(c.lead_id) ?? []), c]);
  for (const [id, cs] of byLead) {
    const l = leads.find((x) => x.id === id)!; const old = l.fields?.call ?? {};
    const live = cs.filter((c) => c.status === "booked");
    const next = live.filter((c) => c.at && c.at > Date.now() - 2 * 3600e3).sort((a, b) => a.at! - b.at!)[0] ?? cs.sort((a, b) => (b.at ?? b.msg_at) - (a.at ?? a.msg_at))[0];
    const call = { meet: next.meet || (old.at === next.at ? old.meet : "") || "", at: next.at ?? null, kind: next.kind, status: next.status, src: next.from, title: next.title, how: next.how, seen: new Date().toISOString(),
      history: cs.sort((a, b) => (b.at ?? b.msg_at) - (a.at ?? a.msg_at)).slice(0, 5).map((c) => ({ at: c.at, meet: c.meet, kind: c.kind, status: c.status, src: c.from })) };
    l.fields = { ...(l.fields ?? {}), call };
    if (dry) continue;
    if (old.meet === call.meet && old.at === call.at && old.status === call.status && old.kind === call.kind) continue;
    const early = call.status === "booked" && !!call.at && call.at > Date.now() - DAY && ["New", "Contacted", "In talks", "Follow up", "Cold lead"].includes(l.stage);
    const add: Record<string, unknown> = {};
    if (!l.email) { const e = cs.map((c) => c.email).find(Boolean); if (e) add.email = e; }
    if (!l.phone) { const p = cs.map((c) => c.phone).find(Boolean); if (p) add.phone = p; }
    await db.from("crm_leads").update({ fields: l.fields, ...(early ? { stage: "Call booked" } : {}), ...add }).eq("id", l.id);
    if (early) l.stage = "Call booked";
    if (old.meet !== call.meet || old.at !== call.at || old.status !== call.status) {
      const what = call.status === "declined" ? "Declined the call invite" : call.status === "cancelled" ? "Cancelled the call" : (call.kind === "gtm" ? "GTM call" : "Clipping call") + " found in Gmail";
      const when = call.at ? " for " + new Date(call.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "";
      await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "meeting", text: what + when + (call.meet ? ": " + call.meet : "") + " (matched by " + (next.how || "email") + ")" + (early ? ", moved to Call booked" : ""), by_email: "gmail" });
    }
  }
  return { status: "connected", calls };
}

// ───────── the brief ─────────
async function build(dry = false, days = 7) {
  const now = Date.now(), today = istDay(now);
  const start = Date.parse(today + "T00:00:00Z") - IST - DAY, end = start + DAY;          // yesterday, IST
  const inY = (t: number | null) => t != null && t >= start && t < end;
  const yday = istDay(start);

  const leads = ((await db.from("crm_leads").select("id,name,company,role,source,stage,phone,email,x_handle,linkedin,instagram,last_touch,next_date,stage_at,created_at,fields,pitch,closed_for").eq("archived", false).limit(5000)).data ?? []) as Lead[];
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
  const gm = await gmailCalls(leads, dry, days);
  if (dry) return { dry: true, gmail: gm.status, calls: gm.calls } as any;
  const upcoming = leads.filter((l) => l.stage === "Call booked").map((l) => ({ id: l.id, name: l.name, sub: sub(l), source: l.source, at: l.fields?.call?.at ?? null, meet: l.fields?.call?.meet ?? "", status: l.fields?.call?.status ?? "", kind: l.fields?.call?.kind ?? (l.source === "Instagram" ? "clipping" : "gtm") }))
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
  let body: any = {}; try { body = await req.json(); } catch (_) { /* cron sends {} */ }
  const days = Math.min(60, Math.max(1, +(body.days ?? 7) || 7));
  try { if (body.dry) return json(await build(true, days));
    const b = await build(false, days); return json({ ok: true, day: b.day, follow: b.overall[4].v, gmail: b.calls.gmail }); }
  catch (e) { return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500); }
});
