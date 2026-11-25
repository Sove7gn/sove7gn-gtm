// email-bot (23 Nov): the email pipeline. People contacted on LinkedIn/X also get a 3-email sequence (day 0, 3, 7) from the four
// Emily inboxes. Fed only by the CRM's pipelines. Nothing is sent without Approve in the CRM, and the whole bot starts PAUSED.
//   tick: intake (who was contacted) -> find + verify + draft -> read replies/bounces (IMAP) -> send what's due (SMTP)
//   approve / edit / skip / stop / pause / resume: from the CRM's Email board (team login)
// Sending and reading are in mail.ts (tested on its own). Keys: MILLIONVERIFIER_API_KEY, APP_PASSWORD_<DOMAIN> x4, COMPOSIO_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import * as M from "./mail.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON = Deno.env.get("CRON_SECRET") ?? "", MV = Deno.env.get("MILLIONVERIFIER_API_KEY") ?? "", CMP = Deno.env.get("COMPOSIO_API_KEY") ?? "";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const now = () => new Date().toISOString();
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
const pwFor = (addr: string) => Deno.env.get("APP_PASSWORD_" + addr.split("@")[1].split(".")[0].toUpperCase()) ?? "";
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const inChunks = async <T>(ids: string[], q: (part: string[]) => PromiseLike<{ data: any; error: any }>, size = 100): Promise<T[]> => {
  const out: T[] = []; for (let i = 0; i < ids.length; i += size) { const { data, error } = await q(ids.slice(i, i + size)); if (error) throw new Error(String(error.message ?? error)); out.push(...(data ?? [])); } return out;
};

// ───────── settings ─────────
type Cfg = { paused: boolean; cap_steps: number[]; step_days: number; ramp_start: string | null; ramp_hold_bounce_pct: number; window_from: number; window_to: number; default_tz: string;
  gap_min: number; gap_max: number; countries: string[]; holidays: string[]; bounce_pause_pct: number; bounce_min_sends: number; verify_max_age_days: number; steps_days: number[];
  intake_days: number; intake_per_day: number; finds_per_run: number; apollo: boolean; test_recipients: string[] };
async function cfg(): Promise<Cfg> {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "email_bot").maybeSingle();
  return { paused: true, cap_steps: [5, 10, 15, 20, 25], step_days: 4, ramp_start: null, ramp_hold_bounce_pct: 2, window_from: 8, window_to: 17, default_tz: "America/New_York", gap_min: 10, gap_max: 20,
    countries: ["united states", "usa", "u.s."], holidays: [], bounce_pause_pct: 3, bounce_min_sends: 20, verify_max_age_days: 14, steps_days: [0, 2, 4, 6, 8, 11, 14], intake_days: 30, intake_per_day: 6, finds_per_run: 2, apollo: true, test_recipients: [], ...((data?.value as any) ?? {}) };
}
const saveCfg = async (patch: Record<string, unknown>) => { const { data } = await db.from("crm_lead_settings").select("value").eq("key", "email_bot").maybeSingle(); await db.from("crm_lead_settings").upsert({ key: "email_bot", value: { ...((data?.value as any) ?? {}), ...patch } }, { onConflict: "key" }); };
async function templates(): Promise<M.Templates> { const { data } = await db.from("crm_lead_settings").select("value").eq("key", "email_templates").maybeSingle(); return { ...M.DEFAULT_TEMPLATES, ...((data?.value as any) ?? {}) }; }
const ev = (lead: string | null, kind: string, inbox: string | null, detail: Record<string, unknown> = {}, extra: { step?: number; message_id?: string } = {}) =>
  db.from("crm_email_events").insert({ email_lead_id: lead, kind, inbox, detail, ...extra }).then(() => {}, () => {});

// local midnight in a time zone, as ms
function dayStartMs(tz: string, d = new Date()): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => +(p.find((x) => x.type === t)?.value ?? 0); return d.getTime() - ((g("hour") * 60 + g("minute")) * 60 + g("second")) * 1000;
}
async function lock(sec = 240): Promise<boolean> { const { data } = await db.from("crm_email_lock").update({ until: new Date(Date.now() + sec * 1000).toISOString() }).eq("id", 1).lt("until", now()).select("id"); return !!data?.length; }
const unlock = () => db.from("crm_email_lock").update({ until: new Date(0).toISOString() }).eq("id", 1).then(() => {}, () => {});

// ───────── numbers: daily cap with the ramp, per-inbox stats ─────────
type Ev = { kind: string; inbox: string | null; at: string; detail: any };
async function recentEvents(days = 30): Promise<Ev[]> { const { data } = await db.from("crm_email_events").select("kind,inbox,at,detail").in("kind", ["sent", "bounce", "reply"]).gte("at", new Date(Date.now() - days * 864e5).toISOString()).limit(20000); return (data ?? []) as Ev[]; }
const hardBounce = (e: Ev) => e.kind === "bounce" && e.detail?.hard === true;
async function capNow(c: Cfg, events?: Ev[]): Promise<{ cap: number; level: number; held: boolean; why: string }> {
  const s = c.cap_steps;
  if (!c.ramp_start) return { cap: s[0], level: 0, held: false, why: "starts at " + s[0] + " a day per inbox" };
  let level = Math.min(s.length - 1, Math.floor((Date.now() - Date.parse(c.ramp_start)) / 864e5 / c.step_days));
  if (level > 0) {
    const e = events ?? await recentEvents(c.step_days), since = Date.now() - c.step_days * 864e5, sent = e.filter((x) => x.kind === "sent" && Date.parse(x.at) >= since).length, bad = e.filter((x) => hardBounce(x) && Date.parse(x.at) >= since).length;
    const { data: paused } = await db.from("crm_email_inboxes").select("addr").eq("paused", true).limit(1);
    if ((sent >= 10 && bad / sent * 100 > c.ramp_hold_bounce_pct) || paused?.length) { level--; return { cap: s[level], level, held: true, why: paused?.length ? "an inbox is paused" : "bounces over " + c.ramp_hold_bounce_pct + "%" }; }
  }
  return { cap: s[level], level, held: false, why: "step " + (level + 1) + " of " + s.length };
}
async function stats(c: Cfg) {
  const { data: boxes } = await db.from("crm_email_inboxes").select("*").order("addr"), e = await recentEvents(30), t0 = dayStartMs("America/New_York"), cap = await capNow(c, e);
  const per = (boxes ?? []).map((b: any) => { const mine = e.filter((x) => x.inbox === b.addr), sent = mine.filter((x) => x.kind === "sent"), bad = mine.filter(hardBounce).length;
    return { addr: b.addr, enabled: b.enabled, paused: b.paused, paused_reason: b.paused_reason, has_password: !!pwFor(b.addr), next_send_at: b.next_send_at, last_polled_at: b.last_polled_at, last_error: b.last_error,
      sent_today: sent.filter((x) => Date.parse(x.at) >= t0).length, sent_30d: sent.length, bounces_30d: bad, replies_30d: mine.filter((x) => x.kind === "reply").length, bounce_pct: sent.length ? Math.round(bad / sent.length * 1000) / 10 : 0 }; });
  const { data: mvc } = await db.from("crm_email_events").select("detail").eq("kind", "verify").order("at", { ascending: false }).limit(1);
  return { paused: c.paused, cap, ramp_start: c.ramp_start, inboxes: per, mv_credits: mvc?.[0]?.detail?.credits ?? null, window: c.window_from + ":00 to " + c.window_to + ":00 prospect time, Mon to Fri" };
}

// ───────── 1. intake: everyone we contacted on LinkedIn (invite or DM) or X (DM) becomes a card in the first column ─────────
// No email lookup yet (that costs credits): a person is only looked up once you approve them.
async function intake(c: Cfg) {
  const [{ data: leads }, { data: have }, { data: xt }] = await Promise.all([
    db.from("crm_leads").select("id,name,company,role,linkedin,x_handle,stage,source,fields").eq("archived", false).or("source.eq.LinkedIn,x_handle.neq.").limit(3000),
    db.from("crm_email_leads").select("lead_id,company_key,stage"),
    db.from("crm_x_tasks").select("handle,text,sent_at").eq("kind", "dm").eq("status", "sent").not("sent_at", "is", null).order("sent_at").limit(3000)]);
  const xdm = new Map<string, { at: number; text: string }>(); for (const t of xt ?? []) { const h = String(t.handle ?? "").replace(/^@/, "").toLowerCase(); if (h && !xdm.has(h)) xdm.set(h, { at: Date.parse(t.sent_at), text: t.text ?? "" }); }
  const known = new Set((have ?? []).map((x: any) => x.lead_id)), taken = new Set((have ?? []).filter((x: any) => !["skipped", "no_email", "rejected", "stopped"].includes(x.stage)).map((x: any) => x.company_key));
  const since = Date.now() - c.intake_days * 864e5, cand: any[] = []; let notUs = 0;
  for (const l of (leads ?? []) as any[]) {
    const f = l.fields ?? {}, li = f.li ?? {}, xf = f.x ?? {}; if (known.has(l.id) || li.replied || li.stop || xf.replied || /^(in talks|call booked|proposal sent|won|lost|cold lead)$/i.test(l.stage ?? "")) continue;
    const lt = [li.req, li.dm].filter(Boolean).map((x: string) => Date.parse(x)).filter((x: number) => !isNaN(x)), xd = xdm.get(String(l.x_handle ?? "").replace(/^@/, "").toLowerCase());
    const ts = [...lt, ...(xd && !isNaN(xd.at) ? [xd.at] : [])]; if (!ts.length) continue;
    const first = Math.min(...ts); if (first < since) continue;
    const country = String(f.li_icp?.founder_country || f.li_icp?.hq_country || f.gtm?.intel?.hq?.v || "").trim();
    if (!country || !c.countries.some((x) => country.toLowerCase().includes(x))) { notUs++; continue; }
    const co = String(l.company ?? "").trim(); if (!co || /^unknown$/i.test(co) || !M.firstNameOf(l.name)) continue;
    const key = M.companyKey(co); if (!key) continue;
    const via = [li.req ? "LinkedIn invite" : li.dm ? "LinkedIn DM" : "", xd ? "X DM" : ""].filter(Boolean).join(" + ");
    cand.push({ l, first, country, key, co, via, xd: lt.length ? null : xd });
  }
  cand.sort((a, b) => b.first - a.first);
  const pick: any[] = []; const seen = new Set<string>(); for (const x of cand) { if (seen.has(x.key) || taken.has(x.key)) continue; seen.add(x.key); pick.push(x); }
  const touches = await inChunks<any>(pick.filter((x) => !x.xd).map((x) => x.l.id), (part) => db.from("crm_li_tasks").select("lead_id,text,sent_at,kind").in("lead_id", part).eq("status", "sent").in("kind", ["invite", "dm", "followup"]).order("sent_at"));
  let added = 0;
  for (const x of pick) {
    const text = x.xd ? x.xd.text : touches.find((t) => t.lead_id === x.l.id && t.text)?.text ?? "";
    const { error } = await db.from("crm_email_leads").insert({ lead_id: x.l.id, channel: x.xd ? "x" : "linkedin", via: x.via, x_handle: String(x.l.x_handle ?? "").replace(/^@/, ""), first_touch_at: new Date(x.first).toISOString(), first_touch_text: clip(text, 1500), name: x.l.name, first_name: M.firstNameOf(x.l.name), company: x.co, company_key: x.key,
      role: x.l.role ?? "", linkedin: x.l.linkedin ?? "", country: x.country, tz: c.default_tz, one_liner: clip(x.l.fields.li_icp?.one_liner, 300), funding: clip(x.l.fields.li_icp?.funding, 80), stage: "candidate" });
    if (!error) added++;
  }
  return { added, candidates: cand.length, not_us_or_unknown_country: notUs };
}

// ───────── 2. find the email, verify it, draft ─────────
const KEYS = ["e1", "e2", "e3", "e4", "e5", "e6", "e7"] as const;
/** The lead page made for this person (LinkedIn day 0 uses the same one): its size and the first two companies, or null if it isn't ready. */
async function dropFor(r: any): Promise<M.Drop> {
  const since = new Date(Date.now() - 21 * 864e5).toISOString();
  let d: any = (await db.from("crm_lead_drops").select("n_leads,data,status").eq("lead_id", r.lead_id).in("status", ["ready", "thin"]).gte("created_at", since).order("created_at", { ascending: false }).limit(1)).data?.[0];
  if (!d && r.company) d = (await db.from("crm_lead_drops").select("n_leads,data,status").ilike("company", r.company).in("status", ["ready", "thin"]).gte("created_at", since).order("created_at", { ascending: false }).limit(1)).data?.[0];
  if (!d || (d.n_leads ?? 0) < 2) return null;
  const items = M.dropItems(d.data?.leads ?? []); return items.length >= 2 ? { n: d.n_leads, items } : null;
}
const lintAll = (draft: Record<string, string>, touch: string) => KEYS.flatMap((k, i) => M.lintEmail(i + 1, draft[k] ?? "", touch).map((p) => "Email " + (i + 1) + ": " + p));
async function apolloFind(r: any): Promise<{ email?: string; tz?: string; error?: string }> {
  if (!CMP) return { error: "no COMPOSIO_API_KEY" };
  const vanity = /linkedin\.com\/in\/[a-z0-9-]+\/?$/i.test(r.linkedin ?? "") && !/ACoA/i.test(r.linkedin ?? "");
  const parts = String(r.name).replace(/\(.*?\)/g, "").trim().split(/\s+/), args: Record<string, unknown> = { first_name: parts[0], last_name: parts.slice(1).join(" "), organization_name: r.company };
  if (vanity) args.linkedin_url = r.linkedin;
  const res = await fetch("https://connect.composio.dev/mcp", { method: "POST", headers: { "x-consumer-api-key": CMP, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "COMPOSIO_MULTI_EXECUTE_TOOL", arguments: { tools: [{ tool_slug: "APOLLO_PEOPLE_ENRICHMENT", arguments: args }], sync_response_to_workbench: false, thought: "Find a work email for the CRM email pipeline" } } }) });
  const txt = await res.text(); if (!res.ok) return { error: "Composio answered " + res.status };
  const line = txt.match(/^data: (.*)$/m); const j = JSON.parse(line ? line[1] : txt); if (j.error) return { error: "Composio: " + clip(j.error.message ?? j.error, 120) };
  const out = JSON.parse(j.result?.content?.[0]?.text ?? "{}"), one = out?.data?.results?.[0]?.response;
  if (!one?.successful) return { error: clip(one?.error ?? out?.error ?? "no result", 140) };
  let p = one.data?.person;
  if (!p && out?.data?.remote_file_info?.file_path) {   // a big result comes back as a file: read only the few fields we need
    const jq = "jq -c '.results[0].response.data.person | {email, email_status, time_zone}' " + out.data.remote_file_info.file_path;
    const r2 = await fetch("https://connect.composio.dev/mcp", { method: "POST", headers: { "x-consumer-api-key": CMP, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "COMPOSIO_REMOTE_BASH_TOOL", arguments: { command: jq } } }) });
    const t2 = await r2.text(), l2 = t2.match(/^data: (.*)$/m); try { p = JSON.parse(String(JSON.parse(JSON.parse(l2 ? l2[1] : t2).result?.content?.[0]?.text ?? "{}")?.data?.stdout ?? "{}").trim()); } catch { /* none */ }
  }
  return p?.email ? { email: M.normEmail(p.email), tz: p.time_zone } : { error: "Apollo has no email for them" };
}
async function mvCheck(email: string): Promise<{ result: string; sub: string; credits: number | null }> {
  if (!MV) throw new Error("no MILLIONVERIFIER_API_KEY");
  const r = await fetch("https://api.millionverifier.com/api/v3/?api=" + encodeURIComponent(MV) + "&email=" + encodeURIComponent(email) + "&timeout=10"), j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("MillionVerifier: " + clip(j.error ?? r.status, 100));
  return { result: String(j.result ?? "unknown"), sub: String(j.subresult ?? ""), credits: typeof j.credits === "number" ? j.credits : null };
}
const isDnc = async (email: string) => !!(await db.from("crm_email_dnc").select("email").eq("email", email).maybeSingle()).data;
async function enrichOne(r: any, c: Cfg, tpl: M.Templates) {
  const setR = (p: Record<string, unknown>) => db.from("crm_email_leads").update(p).eq("id", r.id);
  const { data: lead } = await db.from("crm_leads").select("email").eq("id", r.lead_id).maybeSingle();
  const usable = (e?: string | null) => !!e && M.emailOk(e) && !M.isFreeMail(e) && !M.isRole(e);
  let email: string | null = null, src = "", tz = r.tz;
  if (usable(lead?.email)) { email = M.normEmail(lead!.email); src = "crm"; }
  else if (c.apollo) {
    const a = await apolloFind(r);
    if (a.email && usable(a.email)) { email = a.email; src = "apollo"; if (a.tz) tz = M.validTz(a.tz, r.tz); }
    else if (a.email) { await setR({ stage: "no_email", error: "Found only a role or free-mail address (" + (M.isFreeMail(a.email) ? "free mail" : "role") + ")" }); return "no_email"; }
    else if (a.error && !/no email/i.test(a.error)) { await setR({ error: "Lookup failed, will retry: " + a.error }); return "retry"; }
  }
  if (!email) { await setR({ stage: "no_email", error: "No work email found", email_found_at: now() }); await ev(r.id, "found", null, { found: false }); return "no_email"; }
  if (await isDnc(email)) { await setR({ stage: "rejected", email, error: "On the do-not-contact list" }); return "rejected"; }
  let v; try { v = await mvCheck(email); } catch (e) { await setR({ error: "Verification failed, will retry: " + clip((e as Error).message, 100) }); return "retry"; }
  await ev(r.id, "verify", null, { email_src: src, result: v.result, sub: v.sub, credits: v.credits });
  if (v.result !== "ok") { await setR({ stage: "rejected", email, email_source: src, email_found_at: now(), verify_result: v.result, verify_sub: v.sub, verified_at: now(), error: "Verification: " + v.result + (v.sub ? " (" + v.sub + ")" : "") }); return "rejected"; }
  const d = M.buildDrafts({ name: r.name, company: r.company, funding: r.funding, one_liner: r.one_liner, channel: r.channel }, tpl, new Date(), await dropFor(r));
  const draft = Object.fromEntries(KEYS.map((k) => [k, d[k]])), warn = [...d.warnings, ...lintAll(draft, r.first_touch_text)];
  await setR({ stage: "ready", email, email_source: src, email_found_at: now(), verify_result: "ok", verify_sub: v.sub, verified_at: now(), tz, subject: d.subject, draft: { ...draft, has_drop: d.has_drop }, fact: d.fact, warnings: warn, error: null });
  if (r.pre_approved) { const a = await approve({ id: r.id }, r.approved_by || "approved earlier", true); if (a.error) { await setR({ error: a.error }); return "ready"; } return "queued"; }
  return "ready";
}
/** Take a person for lookup (new -> found) so the instant path and the 5-minute tick never work on the same one. */
async function claimNew(id: string) { const { data } = await db.from("crm_email_leads").update({ stage: "found" }).eq("id", id).eq("stage", "new").select("*"); return data?.[0] as any; }
async function enrichClaimed(id: string, c: Cfg, tpl: M.Templates, out: Record<string, number>) {
  const r = await claimNew(id); if (!r) return;
  try { const k = await enrichOne(r, c, tpl); out[k] = (out[k] ?? 0) + 1; if (k === "retry") await db.from("crm_email_leads").update({ stage: "new" }).eq("id", id).eq("stage", "found"); }
  catch (e) { out.error = (out.error ?? 0) + 1; await db.from("crm_email_leads").update({ stage: "new", error: clip((e as Error).message, 160) }).eq("id", id).eq("stage", "found"); }
}
async function enrich(c: Cfg) {
  await db.from("crm_email_leads").update({ stage: "new" }).eq("stage", "found").lt("updated_at", new Date(Date.now() - 5 * 60e3).toISOString());   // a lookup that died halfway is retried
  const tpl = await templates(), { data: rows } = await db.from("crm_email_leads").select("id").eq("stage", "new").order("created_at").limit(c.finds_per_run), out: Record<string, number> = {};
  for (const r of rows ?? []) await enrichClaimed(r.id, c, tpl, out);
  return out;
}
/** Right after an Approve: look the people up now (3 at a time) and send what is due, instead of waiting for the next 5-minute tick. The caps, windows and gaps still apply. */
async function kickNow(ids: string[]) {
  const c = await cfg(), tpl = await templates(), out: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 3) await Promise.all(ids.slice(i, i + 3).map((id) => enrichClaimed(id, c, tpl, out)));
  await kickSend();
}
async function kickSend() { if (!(await lock(120))) return; try { await sendRun(await cfg()); } finally { await unlock(); } }
const bg = (p: Promise<unknown>) => { const q = p.catch((e) => console.error("background:", (e as Error).message)); try { (globalThis as any).EdgeRuntime?.waitUntil?.(q); } catch (_) { /* runs anyway until the response ends */ } };

// ───────── 3. the team's buttons ─────────
async function getRow(id: string) { const { data } = await db.from("crm_email_leads").select("*").eq("id", id).maybeSingle(); return data as any; }
async function approve(b: any, who: string, fromBot = false) {
  const r = await getRow(b.id); if (!r) return { error: "No such person" };
  if (r.stage === "candidate" && !fromBot) {   // the first click: look up and verify the email, build the seven emails, then queue email 1 automatically
    const { data: l } = await db.from("crm_leads").select("archived,stage,fields").eq("id", r.lead_id).maybeSingle(), li = (l?.fields as any)?.li ?? {}, xf = (l?.fields as any)?.x ?? {};
    if (!l || l.archived) return { error: "They were removed from the CRM" };
    if (li.replied || xf.replied || li.stop) return { error: "They already replied or were stopped on another channel" };
    await db.from("crm_email_leads").update({ stage: "new", pre_approved: true, approved_by: who, approved_at: now(), error: null }).eq("id", r.id); await ev(r.id, "approve", null, { by: who, candidate: true });
    if (!b.noKick) bg(kickNow([r.id]));
    return { ok: true, looking_up: true };
  }
  if (r.stage !== "ready") return { error: "Only a card in Ready to approve can be approved" };
  if ((r.warnings ?? []).some((w: string) => /No real fact|first name/.test(w))) return { error: "Edit the draft first: " + (r.warnings as string[]).find((w) => /No real fact|first name/.test(w)) };
  if (!r.draft?.edited) {   // the lead page may have finished since the drafts were made: email 2 uses it if it did
    const d = M.buildDrafts({ name: r.name, company: r.company, funding: r.funding, one_liner: r.one_liner, channel: r.channel }, await templates(), new Date(), await dropFor(r));
    r.draft = { ...r.draft, e2: d.e2, has_drop: d.has_drop };
  }
  const probs = lintAll(r.draft ?? {}, r.first_touch_text);
  if (probs.length) return { error: "The draft breaks the copy rules: " + probs.join("; ") };
  if (!r.email || r.verify_result !== "ok") return { error: "The address isn't verified" };
  if (await isDnc(r.email)) return { error: "That address is on the do-not-contact list" };
  const { data: boxes } = await db.from("crm_email_inboxes").select("addr").eq("enabled", true).eq("paused", false), usable = (boxes ?? []).filter((x: any) => pwFor(x.addr));
  if (!usable.length) return { error: "No sending inbox is available (paused, or its app password isn't set)" };
  const { data: busy } = await db.from("crm_email_leads").select("inbox").in("stage", ["approved", "active"]), n: Record<string, number> = {}; for (const x of busy ?? []) if (x.inbox) n[x.inbox] = (n[x.inbox] ?? 0) + 1;
  const inbox = usable.map((x: any) => x.addr).sort((a: string, c2: string) => (n[a] ?? 0) - (n[c2] ?? 0))[0];
  const hash = await sha(JSON.stringify([r.email, r.subject, r.draft, inbox]));
  await db.from("crm_email_leads").update({ draft: r.draft, stage: "approved", inbox, approved_at: now(), approved_hash: hash, next_step: 1, next_due: now(), error: null }).eq("id", r.id);
  await ev(r.id, "approve", inbox, { by: who, hash: hash.slice(0, 12) });
  if (!fromBot && !b.noKick) bg(kickSend());
  return { ok: true, inbox };
}
async function approveMany(b: any, who: string) {
  const ids: string[] = Array.isArray(b.ids) ? b.ids.slice(0, 200) : [], out = { approved: 0, failed: [] as string[] };
  const go: string[] = [];
  for (const id of ids) { const r = await approve({ id, noKick: true }, who); if (r.error) out.failed.push(r.error); else { out.approved++; go.push(id); } }
  if (go.length) bg(kickNow(go));
  return out;
}
async function sha(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", M.enc.encode(s)))).map((x) => x.toString(16).padStart(2, "0")).join(""); }
async function edit(b: any, who: string) {
  const r = await getRow(b.id); if (!r) return { error: "No such person" };
  if (!["ready", "approved"].includes(r.stage) || r.e1_at) return { error: "Texts can only change before the first email goes out" };
  const d = { ...(r.draft ?? {}), edited: true }, probs: string[] = [];
  for (const k of KEYS) if (typeof b.draft?.[k] === "string") { d[k] = b.draft[k].replace(/\r/g, "").trimEnd(); for (const p of M.lintEmail(+k[1], d[k], r.first_touch_text)) probs.push("Email " + k[1] + ": " + p); }
  const subject = typeof b.draft?.subject === "string" ? b.draft.subject.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 90) : r.subject;
  if (!subject) return { error: "The subject can't be empty" };
  if (probs.length) return { error: "Not saved. Copy rules: " + probs.join("; ") };
  const warnings = (r.warnings ?? []).filter((w: string) => !/No real fact/.test(w));   // a person has now looked at it
  await db.from("crm_email_leads").update({ draft: d, subject, warnings, ...(r.stage === "approved" ? { stage: "ready", approved_at: null, approved_hash: null, inbox: null, next_step: null, next_due: null } : {}) }).eq("id", r.id);
  await ev(r.id, "note", null, { edited_by: who, voided_approval: r.stage === "approved" });
  return { ok: true, voided: r.stage === "approved" };
}
// Rebuild the drafts of everyone still in Ready to approve from the current templates (a hand-edited draft is never touched).
async function redraft() {
  const tpl = await templates(), { data: rows } = await db.from("crm_email_leads").select("*").eq("stage", "ready"); let n = 0;
  for (const r of rows ?? []) {
    if (r.draft?.edited) continue;
    const d = M.buildDrafts({ name: r.name, company: r.company, funding: r.funding, one_liner: r.one_liner, channel: r.channel }, tpl, new Date(), await dropFor(r)), draft = Object.fromEntries(KEYS.map((k) => [k, d[k]]));
    await db.from("crm_email_leads").update({ subject: d.subject, draft: { ...draft, has_drop: d.has_drop }, fact: d.fact, warnings: [...d.warnings, ...lintAll(draft, r.first_touch_text)] }).eq("id", r.id); n++;
  }
  return { redrafted: n };
}
async function skip(b: any, who: string) {
  const r = await getRow(b.id); if (!r) return { error: "No such person" };
  if (["replied", "stopped", "skipped", "done"].includes(r.stage)) return { error: "Already finished" };
  await db.from("crm_email_leads").update({ stage: r.e1_at ? "stopped" : "skipped", stop_reason: "Stopped by " + who, next_due: null }).eq("id", r.id); await ev(r.id, "skip", r.inbox, { by: who }); return { ok: true };
}

// ───────── 4. read replies and bounces (IMAP, read-only) ─────────
async function imapInit(box: any) {
  const im = await M.Imap.open(box.addr, pwFor(box.addr)); try { const s = await im.select(); await db.from("crm_email_inboxes").update({ last_uid: s.uidnext - 1, uidvalidity: s.uidvalidity, last_polled_at: now(), last_error: null }).eq("addr", box.addr); box.last_uid = s.uidnext - 1; } finally { im.close(); }
}
async function leadsByAddress(addrs: string[], ids: string[]) {
  const out = new Map<string, any>();
  if (addrs.length) for (const x of (await db.from("crm_email_leads").select("*").in("email", addrs).not("e1_at", "is", null)).data ?? []) out.set(x.id, x);
  for (const col of ["msgid1", "msgid2", "msgid3", "msgid4", "msgid5", "msgid6", "msgid7"]) if (ids.length) for (const x of (await db.from("crm_email_leads").select("*").in(col, ids)).data ?? []) out.set(x.id, x);
  return [...out.values()];
}
async function stopOtherChannels(r: any, reply: string, optOut: boolean) {
  const { data: l } = await db.from("crm_leads").select("id,stage,fields").eq("id", r.lead_id).maybeSingle(); if (!l) return;
  const li = { ...((l.fields as any)?.li ?? {}) }; if (!li.replied) li.replied = now(); li.replied_last = now(); li.stop = "replied"; li.answered = null; li.reply_label = optOut ? "not_interested" : "other"; li.reply_text = clip("By email: " + reply, 600);
  await db.from("crm_leads").update({ fields: { ...(l.fields as any), li }, ...(!optOut && /^(new|contacted|follow up)$/i.test(l.stage ?? "") ? { stage: "In talks" } : {}) }).eq("id", l.id);
  await db.from("crm_li_tasks").update({ status: "skipped", error: "They replied by email" }).eq("lead_id", l.id).in("status", ["review", "ready"]);
  await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "message", text: "Replied by email" + (optOut ? " (asked not to be contacted)" : "") + ": “" + clip(reply, 500) + "”", by_email: "email" });
}
async function handleMessage(box: any, m: M.ImapMsg) {
  const kind = M.classify(m), from = M.addrOf(m.from), ids = [...(m.inReplyTo.match(/<[^>\s]+>/g) ?? []), ...(m.references.match(/<[^>\s]+>/g) ?? []), ...(kind.startsWith("bounce") ? (M.decodeText(m.text).match(/<[^>\s]+@[^>\s]+>/g) ?? []) : [])];
  if (kind.startsWith("bounce")) {
    const rows = await leadsByAddress(M.bouncedRecipients(m), ids), hard = kind === "bounce_hard";
    for (const r of rows) {
      await ev(r.id, "bounce", box.addr, { hard, subject: clip(m.subject, 100) });
      if (hard) { await db.from("crm_email_leads").update({ stage: "stopped", stop_reason: "Bounced: the address doesn't exist", bounced_at: now(), next_due: null }).eq("id", r.id); await db.from("crm_email_dnc").upsert({ email: r.email, reason: "bounced", source: box.addr }, { onConflict: "email" }); }
    }
    return rows.length ? "bounce" : "ignored";
  }
  const rows = await leadsByAddress([from], ids).then((x) => x.filter((r) => r.email === from || ids.some((i) => [r.msgid1, r.msgid2, r.msgid3, r.msgid4, r.msgid5, r.msgid6, r.msgid7].includes(i)))); if (!rows.length) return "ignored";   // warmup mail and strangers
  for (const r of rows) {
    if (kind === "auto_reply") { await ev(r.id, "auto_reply", box.addr, { subject: clip(m.subject, 100) }); continue; }
    const reply = M.replyOnly(m.text).slice(0, 600), optOut = M.isOptOut(reply);
    await db.from("crm_email_leads").update(optOut ? { stage: "stopped", stop_reason: "Asked not to be emailed", replied_at: now(), reply_text: reply, next_due: null } : { stage: "replied", replied_at: now(), reply_text: reply, next_due: null }).eq("id", r.id);
    await ev(r.id, "reply", box.addr, { opt_out: optOut, text: clip(reply, 300) });
    if (optOut) await db.from("crm_email_dnc").upsert({ email: r.email, reason: "asked not to be emailed", source: "reply" }, { onConflict: "email" });
    await stopOtherChannels(r, reply, optOut);
  }
  return kind;
}
async function poll(c: Cfg, force = false) {
  const { data: boxes } = await db.from("crm_email_inboxes").select("*").eq("enabled", true), out: Record<string, unknown> = {};
  for (const box of boxes ?? []) {
    if (!pwFor(box.addr) || box.last_uid == null) continue;
    if (!force && box.last_polled_at && Date.now() - Date.parse(box.last_polled_at) < 8 * 60e3) continue;
    try {
      const im = await M.Imap.open(box.addr, pwFor(box.addr)); let handled = 0, maxUid = box.last_uid;
      try {
        const s = await im.select(); if (box.uidvalidity && s.uidvalidity !== box.uidvalidity) { await db.from("crm_email_inboxes").update({ last_uid: s.uidnext - 1, uidvalidity: s.uidvalidity, last_polled_at: now(), last_error: "Mailbox was reset: starting from now" }).eq("addr", box.addr); continue; }
        const uids = (await im.uidsAfter(box.last_uid)).slice(0, 60);
        for (const m of await im.fetch(uids)) { if ((await handleMessage(box, m)) !== "ignored") handled++; maxUid = Math.max(maxUid, m.uid); }
        if (uids.length) maxUid = Math.max(maxUid, ...uids);
      } finally { im.close(); }
      await db.from("crm_email_inboxes").update({ last_uid: maxUid, last_polled_at: now(), last_error: null }).eq("addr", box.addr); out[box.addr] = handled;
    } catch (e) { await db.from("crm_email_inboxes").update({ last_polled_at: now(), last_error: clip((e as Error).message, 160) }).eq("addr", box.addr); out[box.addr] = "error: " + clip((e as Error).message, 80); }
  }
  return out;
}

// ───────── 5. send what's due ─────────
const DONE_LEAD = /^(in talks|call booked|proposal sent|won|lost)$/i;
async function pickDue(addr: string, c: Cfg) {
  const { data: rows } = await db.from("crm_email_leads").select("*").eq("inbox", addr).in("stage", ["approved", "active"]).lte("next_due", now()).order("next_step", { ascending: false }).order("next_due").limit(20);
  const t0 = dayStartMs("America/New_York"), { count: started } = await db.from("crm_email_leads").select("id", { count: "exact", head: true }).eq("inbox", addr).gte("e1_at", new Date(t0).toISOString());
  for (const r of rows ?? []) {
    if (r.next_step === 1 && (started ?? 0) >= c.intake_per_day) continue;   // intake_per_day = new people each INBOX starts per day (3 x 4 inboxes = 12); 0 holds all new starts
    const tz = M.validTz(r.tz, c.default_tz); if (!M.inWindow(new Date(), tz, c.window_from, c.window_to, c.holidays)) continue;
    const { data: l } = await db.from("crm_leads").select("archived,stage,fields").eq("id", r.lead_id).maybeSingle(), li = (l?.fields as any)?.li ?? {}, xr = !!(l?.fields as any)?.x?.replied;
    if (l && !l.archived && li.stop === "by hand") continue;   // "Take over by hand" = on hold: nothing sends, and it carries on if you hand them back
    const why = !l || l.archived ? "Removed from the CRM" : li.replied || xr || li.stop === "replied" ? "They replied on LinkedIn or X" : li.stop === "by hand" ? "You took them over by hand" : DONE_LEAD.test(l.stage ?? "") ? "They are now " + l.stage : "";
    if (why) { await db.from("crm_email_leads").update({ stage: li.replied || xr ? "replied" : "stopped", stop_reason: why, next_due: null }).eq("id", r.id); await ev(r.id, "stop", addr, { why }); continue; }
    if (await isDnc(r.email)) { await db.from("crm_email_leads").update({ stage: "stopped", stop_reason: "On the do-not-contact list", next_due: null }).eq("id", r.id); continue; }
    if (!r.verified_at || Date.now() - Date.parse(r.verified_at) > c.verify_max_age_days * 864e5) {
      try { const v = await mvCheck(r.email); await ev(r.id, "verify", null, { recheck: true, result: v.result, credits: v.credits });
        if (v.result !== "ok") { await db.from("crm_email_leads").update({ stage: "stopped", verify_result: v.result, stop_reason: "Re-check before sending: " + v.result, next_due: null }).eq("id", r.id); continue; }
        await db.from("crm_email_leads").update({ verified_at: now(), verify_result: "ok" }).eq("id", r.id);
      } catch { continue; }   // can't re-verify right now: not sent
    }
    return r;
  }
  return null;
}
async function sendRun(c: Cfg) {
  if (c.paused) return { paused: true };
  const events = await recentEvents(30), cap = await capNow(c, events), t0 = dayStartMs("America/New_York"), out: Record<string, unknown> = {};
  const sentAll = events.filter((x) => x.kind === "sent").length, badAll = events.filter(hardBounce).length;
  if (sentAll >= c.bounce_min_sends && badAll / sentAll * 100 > c.bounce_pause_pct) { await saveCfg({ paused: true }); await ev(null, "pause", null, { why: "total bounce rate " + Math.round(badAll / sentAll * 1000) / 10 + "%" }); return { paused: true, why: "bounce rate over " + c.bounce_pause_pct + "%" }; }
  const { data: boxes } = await db.from("crm_email_inboxes").select("*").eq("enabled", true).eq("paused", false);
  const tpl = await templates(); void tpl;
  for (const box of boxes ?? []) {
    const pw = pwFor(box.addr); if (!pw) { out[box.addr] = "no app password set"; continue; }
    if (box.next_send_at && Date.parse(box.next_send_at) > Date.now()) continue;
    const mine = events.filter((x) => x.inbox === box.addr), sentToday = mine.filter((x) => x.kind === "sent" && Date.parse(x.at) >= t0).length, s30 = mine.filter((x) => x.kind === "sent").length, b30 = mine.filter(hardBounce).length;
    if (s30 >= c.bounce_min_sends && b30 / s30 * 100 > c.bounce_pause_pct) { await db.from("crm_email_inboxes").update({ paused: true, paused_reason: "Bounce rate over " + c.bounce_pause_pct + "%", paused_at: now() }).eq("addr", box.addr); await ev(null, "pause", box.addr, { why: "inbox bounce rate" }); continue; }
    if (sentToday >= cap.cap) { out[box.addr] = "daily cap " + cap.cap + " reached"; continue; }
    if (box.last_uid == null) { try { await imapInit(box); } catch (e) { out[box.addr] = "can't read the inbox yet: " + clip((e as Error).message, 80); continue; } }   // replies must be readable BEFORE the first send
    const r = await pickDue(box.addr, c); if (!r) continue;
    const step = r.next_step as number, body = r.draft?.["e" + step] ?? "", problems = M.lintEmail(step, body, r.first_touch_text);
    if (problems.length) { await db.from("crm_email_leads").update(step === 1 ? { stage: "ready", approved_at: null, approved_hash: null, inbox: null, next_due: null, error: "Copy rules: " + problems.join("; ") } : { stage: "stopped", stop_reason: "Copy rules: " + problems.join("; "), next_due: null }).eq("id", r.id); continue; }
    const domain = box.addr.split("@")[1], id = M.newMessageId(domain), refs = Array.from({ length: step - 1 }, (_, i) => r["msgid" + (i + 1)]).filter(Boolean) as string[];
    const res = await M.smtpSend({ user: box.addr, pass: pw }, { from: box.addr, fromName: "Emily Jones", to: r.email, toName: r.name, subject: step === 1 ? r.subject : "Re: " + r.subject, body, messageId: id, inReplyTo: step > 1 ? refs[refs.length - 1] : undefined, references: step > 1 ? refs : undefined, unsubscribeMailto: box.addr });
    if (res.ok) {
      const t = new Date(), e1 = step === 1 ? t : new Date(r.e1_at), last = step >= c.steps_days.length, nextDue = last ? null : M.addBusinessDays(e1, c.steps_days[step], M.validTz(r.tz, c.default_tz), c.holidays);
      await db.from("crm_email_leads").update({ ["e" + step + "_at"]: t.toISOString(), ["msgid" + step]: id, stage: last ? "done" : "active", next_step: last ? null : step + 1, next_due: nextDue ? nextDue.toISOString() : null, error: null }).eq("id", r.id);
      await ev(r.id, "sent", box.addr, { to: r.email, response: res.response }, { step, message_id: id });
      await db.from("crm_email_inboxes").update({ next_send_at: new Date(Date.now() + rand(c.gap_min, c.gap_max) * 60e3).toISOString() }).eq("addr", box.addr);
      if (!c.ramp_start) { await saveCfg({ ramp_start: now() }); c.ramp_start = now(); }
      out[box.addr] = "sent email " + step + " to " + r.name;
    } else if (res.stage === "auth") {
      await db.from("crm_email_inboxes").update({ paused: true, paused_reason: "Google refused the app password", paused_at: now() }).eq("addr", box.addr); await ev(null, "pause", box.addr, { why: "auth: " + res.response }); out[box.addr] = "paused: login refused";
    } else if (res.permanent) {
      await db.from("crm_email_leads").update({ stage: "stopped", stop_reason: "Address refused: " + clip(res.response, 100), bounced_at: now(), next_due: null }).eq("id", r.id); await db.from("crm_email_dnc").upsert({ email: r.email, reason: "refused at send", source: box.addr }, { onConflict: "email" });
      await ev(r.id, "bounce", box.addr, { hard: true, at_send: true, response: res.response }); out[box.addr] = "address refused: " + r.name;
    } else {
      await db.from("crm_email_leads").update({ error: clip(res.stage + ": " + res.response, 160), next_due: new Date(Date.now() + 30 * 60e3).toISOString() }).eq("id", r.id); out[box.addr] = "send failed, will retry: " + res.stage;
    }
  }
  return out;
}

// ───────── checks that send nothing ─────────
async function checks(c: Cfg, what: string) {
  const { data: boxes } = await db.from("crm_email_inboxes").select("*").order("addr"), out: Record<string, unknown> = {};
  for (const b of boxes ?? []) {
    if (!pwFor(b.addr)) { out[b.addr] = "no app password set"; continue; }
    try {
      if (what === "imap") { const im = await M.Imap.open(b.addr, pwFor(b.addr)); try { const s = await im.select(); out[b.addr] = { ok: true, messages: s.exists, uidnext: s.uidnext }; } finally { im.close(); } }
      else { const r = await M.smtpSend({ user: b.addr, pass: pwFor(b.addr) }, { from: b.addr, fromName: "Emily Jones", to: b.addr, subject: "x", body: "x", messageId: "<check@x>" }, true); out[b.addr] = r.ok ? { ok: true, note: "logged in; recipient accepted; nothing sent" } : { ok: false, stage: r.stage, response: r.response }; }
    } catch (e) { out[b.addr] = { ok: false, error: clip((e as Error).message, 120) }; }
  }
  return out;
}

async function allowed(req: Request): Promise<{ ok: boolean; who: string }> {
  if (CRON && req.headers.get("x-cron-secret") === CRON) return { ok: true, who: "system" };
  const auth = req.headers.get("authorization") ?? ""; if (!auth.startsWith("Bearer ")) return { ok: false, who: "" };
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.from("crm_team").select("email").limit(1); const { data: u } = await user.auth.getUser();
  return { ok: !!data?.length, who: u?.user?.email ?? "team" };
}
async function tick(c: Cfg) {
  if (!(await lock())) return { busy: true };
  try {
    const r: Record<string, unknown> = {}; for (const [k, f] of [["intake", () => intake(c)], ["enrich", () => enrich(c)], ["poll", () => poll(c)], ["send", () => sendRun(c)]] as const) { try { r[k] = await f(); } catch (e) { r[k] = { error: clip((e as Error).message, 140) }; } }
    return r;
  } finally { await unlock(); }
}

if (Deno.env.get("EMAIL_BOT_TEST") !== "1") Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const a = await allowed(req); if (!a.ok) return json({ error: "Not allowed" }, 401);
  const b = await req.json().catch(() => ({})), c = await cfg();
  try {
    const f: Record<string, () => Promise<unknown>> = {
      tick: () => tick(c), intake: () => intake(c), enrich: () => enrich(c), poll: () => poll(c, true), send: () => sendRun(c), stats: () => stats(c),
      redraft: () => redraft(), approve: () => approve(b, a.who), approve_many: () => approveMany(b, a.who), edit: () => edit(b, a.who), skip: () => skip(b, a.who),
      imap_check: () => checks(c, "imap"), smtp_check: () => checks(c, "smtp"),
      pause: async () => { await saveCfg({ paused: true }); await ev(null, "pause", null, { by: a.who }); return { ok: true }; },
      resume: async () => {
        const { data: boxes } = await db.from("crm_email_inboxes").select("*").eq("enabled", true).eq("paused", false), ready = (boxes ?? []).filter((x: any) => pwFor(x.addr)); if (!ready.length) return { error: "No inbox is ready (app passwords or paused inboxes)" };
        for (const x of ready) if (x.last_uid == null) { try { await imapInit(x); } catch (e) { return { error: x.addr + ": can't read the inbox: " + clip((e as Error).message, 100) }; } }
        await saveCfg({ paused: false }); await ev(null, "note", null, { resumed_by: a.who }); return { ok: true, inboxes: ready.length };
      },
      resume_inbox: async () => { await db.from("crm_email_inboxes").update({ paused: false, paused_reason: null, paused_at: null }).eq("addr", String(b.addr)); return { ok: true }; },
      send_test: async () => {
        const to = M.normEmail(b.to); if (!c.test_recipients.map(M.normEmail).includes(to)) return { error: "That address isn't on the test list (email_bot.test_recipients)" };
        const box = (await db.from("crm_email_inboxes").select("addr").eq("addr", String(b.inbox)).maybeSingle()).data; if (!box || !pwFor(box.addr)) return { error: "Unknown inbox" };
        // exactly what a real email 1 looks like (same builder, same signature); only the subject says it is a test and which inbox sent it
        const d = M.buildDrafts({ name: String(b.name || "Reyansh"), company: "Example Co", funding: "", one_liner: "Software that helps teams plan their work", channel: "linkedin" }, await templates());
        const r = await M.smtpSend({ user: box.addr, pass: pwFor(box.addr) }, { from: box.addr, fromName: "Emily Jones", to, toName: String(b.name || "Reyansh"), subject: "[TEST " + box.addr.split("@")[1] + "] " + d.subject, body: d.e1, messageId: M.newMessageId(box.addr.split("@")[1]), unsubscribeMailto: box.addr });
        await ev(null, "test", box.addr, { to, ok: r.ok, stage: r.stage }); return r;
      },
    };
    const run = f[String(b.action)]; if (!run) return json({ error: "Unknown action" }, 400);
    return json(await run());
  } catch (e) { return json({ error: clip((e as Error).message, 200) }, 500); }
});
