// ig-sync (7 Nov): reads the DMs of our Instagram accounts through Composio and keeps Leads up to date. A thread counts
// once we've sent them our booking link or phone number. Then the person is checked (enough followers, not looking for
// clipping work, not one of us) and added to Leads. After that every message goes into the lead's history, and the next step
// (reply, follow up, waiting) and "Call booked" are kept up to date. Runs every hour (pg_cron). The first runs also go back
// over the last 30 days, a few pages at a time.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const COMPOSIO = Deno.env.get("COMPOSIO_API_KEY") ?? "";   // the ck_ key of Composio "For You", where the accounts are connected
const APIFY = Deno.env.get("APIFY_TOKEN") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const MCP_URL = "https://connect.composio.dev/mcp";
const BUDGET_MS = 80_000;    // the schedule waits 150 s; a last lookup (up to 45 s) and saving come after
// Composio hands back answers up to about 30 KB, so threads are listed with their last 5 messages, 15 at a time, and only
// the ones that matter are read further (25 messages each, 6 at a time).
const LIST_FIELDS = "id,updated_time,participants,messages.limit(5){message,from,created_time}";
const PAGE = 15, BATCH = 6, HISTORY = 25, SUMMARIES = 12;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function allowed(req: Request): Promise<boolean> {
  if (CRON && req.headers.get("x-cron-secret") === CRON) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.from("crm_team").select("email").limit(1);
  return !!data?.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await allowed(req))) return json({ error: "Only the team can run this." }, 401);
  await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error: "Didn’t finish" })
    .eq("platform", "instagram").is("finished_at", null).lt("started_at", new Date(Date.now() - 5 * 60e3).toISOString());
  const { data: run, error: busy } = await db.from("crm_sync_runs").insert({ platform: "instagram" }).select("id").single();
  if (busy) return json({ skipped: "A check is already running. Give it a minute." });
  try {
    const summary = await syncInstagram();
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", run.id);
    return json(summary);
  } catch (e) {
    const error = String((e as Error).message ?? e);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", run.id);
    return json({ error }, 500);
  }
});

// ───────── Composio (its "For You" MCP endpoint) ─────────
async function mcp(name: string, args: Record<string, unknown>) {
  const res = await fetch(MCP_URL, { method: "POST",
    headers: { "x-consumer-api-key": COMPOSIO, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const txt = await res.text();
  if (!res.ok) throw new Error("Composio answered " + res.status + ": " + txt.slice(0, 200));
  const line = txt.match(/^data: (.*)$/m);
  const j = JSON.parse(line ? line[1] : txt);
  if (j.error) throw new Error("Composio: " + String(j.error.message ?? j.error).slice(0, 200));
  const text = j.result?.content?.[0]?.text ?? "";
  let out: any;
  try { out = JSON.parse(text); } catch { throw new Error("Composio: " + text.slice(0, 200)); }
  if (j.result?.isError || (out?.successful === false && !out?.data?.results)) throw new Error("Composio: " + String(out?.error ?? text).slice(0, 200));
  return out;
}
// Several Instagram tools at once, as one of our accounts. Each answer is its data, or null if it failed or came back too big.
async function run(account: string, calls: { slug: string; args: Record<string, unknown> }[]) {
  const out = await mcp("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: calls.map((c) => ({ tool_slug: c.slug, arguments: c.args, account })), sync_response_to_workbench: false });
  const res: any[] = out?.data?.results ?? [];
  return calls.map((_, i) => { const r = res.find((x) => x.index === i) ?? res[i]; const d = r?.response?.data; return d && typeof d === "object" ? d : null; });
}
// Our accounts: Composio's name for each connected Instagram username.
async function ourAccounts() {
  const out = await mcp("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "instagram", action: "list" }] });
  const map: Record<string, string> = {};
  for (const a of out?.data?.results?.instagram?.accounts ?? []) if (a.status === "active" && a.user_info?.username) map[lc(a.user_info.username)] = a.alias || a.id;
  return map;
}
// Follower counts and names for new people, in one Apify run over their public profiles.
async function profiles(handles: string[]) {
  const out = new Map<string, { followers: number | null; name: string }>();
  if (!handles.length || !APIFY) return out;
  try {
    const res = await fetch("https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?timeout=45", {
      method: "POST", headers: { Authorization: "Bearer " + APIFY, "Content-Type": "application/json" }, body: JSON.stringify({ usernames: handles }) });
    if (res.ok) for (const p of await res.json() as any[]) if (p?.username) out.set(lc(p.username), { followers: typeof p.followersCount === "number" ? p.followersCount : null, name: p.fullName ?? "" });
  } catch { /* an unknown follower count keeps the person in, it never filters them out */ }
  return out;
}

// ───────── reading a thread ─────────
const lc = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/^@/, "");
const ms = (t: string) => Date.parse(String(t).replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const digits = (s: string) => s.replace(/\D/g, "");
const iso = (n: number) => new Date(n).toISOString();
const istDate = (n: number) => new Date(n + 330 * 60e3).toISOString().slice(0, 10);
const dayLabel = (n: number) => new Date(n + 330 * 60e3).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// People who want to work as clippers (payouts, jobs), as opposed to brands and creators who want to buy clipping.
const CLIPPER = /\bcl+ip+ers?\b|become a clip|clipping (job|work|kaam)|\b(job|internship|vacancy|hiring|kaam)\b.{0,40}\b(clip|edit)|\bpayouts?\b|paid per|per (1k|1000|k|million|10k) views|how much (can|will|do|would) (i|we) (earn|make|get)|\bearn(ing)? (money|from)|kitna (milega|kama)|paise milenge|join (your|ur) (team|program|campaign)/i;
// Signs a call is set: a time agreed, a booking, or that we already spoke.
const BOOKED = /\b(booked|scheduled|see you (then|tomorrow|today|at)|talk (at|tomorrow|today|in the)|connect (at|today|tomorrow|in the (first|second) half)|call (at|today|tomorrow|you (in|at|today|tomorrow))|will call|chatted on whatsapp|spoke (on|over)|(meet|meeting) (at|around|tomorrow|today))\b|\b\d{1,2}(:\d\d)?\s?(am|pm)\b/i;
const THEIR_PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|\+\d[\d\s-]{8,}\d/;

type Msg = { at: number; text: string; us: boolean };
type Settings = { enabled?: boolean; accounts?: string[]; min_followers?: number; our_links?: string[]; our_phones?: string[]; ignore?: string[];
  follow_up_days?: number; backfill_days?: number };

async function syncInstagram() {
  const { data: rows } = await db.from("crm_lead_settings").select("key,value").in("key", ["instagram", "instagram_sync", "stages", "automation"]);
  const val = (k: string) => rows?.find((r) => r.key === k)?.value;
  const set = (val("instagram") ?? {}) as Settings;
  const sync = (val("instagram_sync") ?? {}) as Record<string, any>;
  const stages = ((val("stages") ?? []) as { name: string; kind?: string }[]);
  const owner = (val("automation") ?? {}).owner ?? "";
  if (set.enabled === false) return { skipped: "Instagram tracking is switched off." };
  if (!COMPOSIO) throw new Error("COMPOSIO_API_KEY is missing.");
  const has = (n: string) => stages.some((s) => s.name === n);
  const talks = has("In talks") ? "In talks" : stages[0]?.name ?? "New";
  const booked = has("Call booked") ? "Call booked" : "";
  const closed = new Set(stages.filter((s) => s.kind === "won" || s.kind === "lost").map((s) => s.name));
  const links = (set.our_links ?? []).map(lc).filter(Boolean);
  const phones = (set.our_phones ?? []).map(digits).filter((p) => p.length >= 8);
  const ignore = new Set((set.ignore ?? []).map(lc));
  const minF = set.min_followers ?? 1000, fuDays = set.follow_up_days ?? 2;
  const sentOurs = (t: string) => { const l = t.toLowerCase(), d = digits(t); return links.some((x) => l.includes(x)) || phones.some((p) => d.includes(p)); };

  sync.accounts = await ourAccounts();
  const wanted = (set.accounts ?? []).map(lc).filter((u) => sync.accounts[u]);
  if (!wanted.length) return { skipped: "None of the Instagram accounts in Setup are connected in Composio." };
  const mine = new Set([...Object.keys(sync.accounts), ...(set.accounts ?? []).map(lc)]);

  // Everything we already track, and the leads, so a person DMing both accounts is one lead.
  const { data: known } = await db.from("crm_ig_threads").select("*");
  const threads = new Map((known ?? []).map((t) => [t.account + "|" + t.thread_id, t]));
  const { data: leadRows } = await db.from("crm_leads").select("id,instagram,origin_key,stage,next_step,next_date,phone,fields,archived");
  const leads = new Map<string, any>(), leadByHandle = new Map<string, any>();
  for (const l of leadRows ?? []) { leads.set(l.id, l); if (l.instagram) leadByHandle.set(lc(l.instagram), l); if (l.origin_key?.startsWith("ig:")) leadByHandle.set(l.origin_key.slice(3), l); }

  const out: Record<string, any> = { threads_read: 0, kept: 0, filtered: 0, leads_added: 0, messages_logged: 0, updated: 0, accounts: {} };
  const end = Date.now() + BUDGET_MS;

  for (let i = 0; i < wanted.length; i++) {
    const acct = wanted[i], alias = sync.accounts[acct];
    const deadline = Date.now() + (end - Date.now()) / (wanted.length - i);
    const st = sync[acct] = sync[acct] ?? {};
    // Everything that changed since the last check, newest first.
    const backfill = Date.now() - (set.backfill_days ?? 30) * 86400e3;
    let pass = st.pass ?? { stop_at: st.since ?? iso(backfill), after: null, newest: null };
    let pages = 0, restarted = false;
    while (Date.now() < deadline) {
      const [page] = await run(alias, [{ slug: "INSTAGRAM_LIST_ALL_CONVERSATIONS", args: { limit: PAGE, fields: LIST_FIELDS, ...(pass.after ? { after: pass.after } : {}) } }]);
      if (!page) {   // an old cursor: start again from the top
        if (pass.after && !restarted) { pass.after = null; restarted = true; continue; }
        throw new Error("Couldn’t read the DMs of @" + acct + ".");
      }
      pages++;
      const items: any[] = page.data ?? [];
      if (!pass.newest && items[0]) pass.newest = items[0].updated_time;
      const fresh = items.filter((c) => ms(c.updated_time) >= ms(pass.stop_at));
      out.threads_read += fresh.length;
      await handlePage(acct, alias, fresh, false);
      const after = page.paging?.cursors?.after;
      if (fresh.length < items.length || !items.length || !after) { st.since = iso((pass.newest ? ms(pass.newest) : Date.now()) - 10 * 60e3); pass = null; break; }
      pass.after = after;
    }
    st.pass = pass;
    out.accounts[acct] = { pages, caught_up: !pass };
  }
  // Then, with the time left, older threads handed over by a one-time look back.
  for (const acct of wanted) {
    const st = sync[acct], seeds: any[] = st.seed ?? [];
    while (seeds.length && Date.now() < end - 30e3) {
      const chunk = seeds.splice(0, BATCH * 2);
      out.threads_read += chunk.length;
      await handlePage(acct, sync.accounts[acct], chunk.map((x) => ({ id: x.thread_id, updated_time: x.updated_time,
        participants: { data: [{ username: acct }, { username: x.handle, id: x.igsid }] } })), true);
    }
    st.seed = seeds;
    out.accounts[acct].waiting = seeds.length;
    if (seeds.length) out.accounts[acct].caught_up = false;
  }
  await db.from("crm_lead_settings").upsert({ key: "instagram_sync", value: sync, updated_at: new Date().toISOString() });

  // Quiet threads aren't read again, so "Waiting for a reply" turns into "Follow up" here once its day comes.
  const today = istDate(Date.now());
  for (const l of leads.values()) {
    const f = l.fields ?? {};
    if (!f.ig_auto_next || l.next_step !== f.ig_auto_next || !String(l.next_step).startsWith("Waiting for @") || !l.next_date || l.next_date > today) continue;
    if (l.archived || closed.has(l.stage)) continue;
    const m = String(l.next_step).match(/^Waiting for @(\S+) to reply on Instagram \(@([^)]+)\)$/);
    if (!m) continue;
    const next = "Follow up with @" + m[1] + " on Instagram (@" + m[2] + "): no reply since " + dayLabel((f.ig_last_at ?? Date.now())) ;
    const { error } = await db.from("crm_leads").update({ next_step: next, fields: { ...f, ig_auto_next: next } }).eq("id", l.id);
    if (!error) out.updated++;
  }

  // A short AI read of each conversation that changed (shown when you hover the ✦ on a lead's card).
  if (Date.now() < end + 15e3) out.summarised = await summarise().catch(() => 0);
  return out;

  async function summarise() {
    const due = [...leads.values()].filter((l) => l.origin_key?.startsWith("ig:") && !l.archived && l.fields?.ig_last_at && l.fields.ig_sum_at !== l.fields.ig_last_at)
      .sort((a, b) => b.fields.ig_last_at - a.fields.ig_last_at).slice(0, SUMMARIES);
    if (!due.length) return 0;
    const { data: ev } = await db.from("crm_lead_events").select("lead_id,at,text").eq("kind", "message").in("lead_id", due.map((l) => l.id)).order("at");
    const { data: more } = await db.from("crm_leads").select("id,name,source_detail,stage").in("id", due.map((l) => l.id));
    const info = new Map((more ?? []).map((l) => [l.id, l]));
    const today = dayLabel(Date.now());
    const items = due.map((l) => {
      const i: any = info.get(l.id) ?? {}, acct = String(i.source_detail ?? "").match(/@([\w.]+)/)?.[1] ?? "our account";
      const convo = (ev ?? []).filter((e) => e.lead_id === l.id).slice(-30).map((e) => e.text).join("\n");
      return { id: l.id, prompt: "You help a founder keep track of Instagram DM leads for SOVE7GN, which sells clipping and done-for-you GTM services. " +
        "Messages from @" + acct + " are us; the other person is " + (i.name || l.instagram) + " (" + l.instagram + "), " + (l.fields?.ig_followers ?? "unknown") + " followers, now in our stage “" + i.stage + "”. Today is " + today + ".\n" +
        "Write JSON only: {\"summary\": at most 2 short sentences, under 220 characters: who they are and what they want, what we did (shared our number, sent the Calendly link, …) and where it stands, " +
        "\"next\": what we should do now in 2 to 4 words, e.g. \"Reply to them\", \"Follow up\", \"Wait for reply\", \"Prepare for the call\", \"Nothing, it's closed\"}.\n\nConversation (oldest first):\n" + convo };
    });
    const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(items))));
    const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
      "items = json.loads(base64.b64decode('" + payload + "').decode())",
      "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
      "with ThreadPoolExecutor(6) as ex: res = dict(ex.map(one, items))",
      "print('@@' + json.dumps(res))"].join("\n");
    const outp = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Summarise Instagram DM leads for the CRM" });
    const res = JSON.parse(String(outp?.data?.stdout ?? "").split("@@").pop() || "{}");
    let n = 0;
    for (const l of due) {
      let s: any = null;
      try { s = JSON.parse(String(res[l.id] ?? "").replace(/^```(json)?|```$/g, "").trim()); } catch { continue; }
      if (!s?.summary) continue;
      const fields = { ...l.fields, ig_summary: clip(String(s.summary), 300), ig_ai_next: clip(String(s.next ?? ""), 40), ig_sum_at: l.fields.ig_last_at };
      const { error } = await db.from("crm_leads").update({ fields }).eq("id", l.id);
      if (!error) { l.fields = fields; n++; }
    }
    return n;
  }

  // One page of threads. The ones that matter (already tracked, or where we've sent our link or number) are read further,
  // new people are looked up, then each is handled.
  async function handlePage(acct: string, alias: string, items: any[], seeded: boolean) {
    const themOf = (c: any) => { const o = (c.participants?.data ?? []).filter((p: any) => !mine.has(lc(p.username))); return o.length === 1 && !ignore.has(lc(o[0].username)) ? lc(o[0].username) : ""; };
    const ours = (list: any[], h: string) => list.some((m: any) => lc(m.from?.username) !== h && sentOurs(String(m.message ?? "")));
    const cand = items.filter((c) => { const h = themOf(c); return !!h && (seeded || threads.has(acct + "|" + c.id) || ours(c.messages?.data ?? [], h)); });
    if (!cand.length) return;
    const full: (any | null)[] = [];
    for (let i = 0; i < cand.length; i += BATCH)
      full.push(...await run(alias, cand.slice(i, i + BATCH).map((c) => ({ slug: "INSTAGRAM_LIST_ALL_MESSAGES", args: { conversation_id: c.id, limit: HISTORY, fields: "message,from,created_time" } }))));
    const msgsOf = cand.map((c, i) => (full[i]?.data ?? c.messages?.data ?? []) as any[]);
    const isNew = cand.map((c, i) => !threads.has(acct + "|" + c.id) && ours(msgsOf[i], themOf(c)));
    const looked = await profiles(cand.filter((_, i) => isNew[i]).map(themOf));
    for (let i = 0; i < cand.length; i++) await handleThread(acct, cand[i], msgsOf[i], looked.get(themOf(cand[i])));
  }

  async function handleThread(acct: string, c: any, raw: any[], p?: { followers: number | null; name: string }) {
    const others = (c.participants?.data ?? []).filter((p: any) => !mine.has(lc(p.username)));
    if (others.length !== 1 || ignore.has(lc(others[0].username))) return;   // group chats and our own people
    const them = others[0], handle = lc(them.username);
    const msgs: Msg[] = raw.map((m: any) => ({ at: ms(m.created_time), text: String(m.message ?? ""), us: lc(m.from?.username) !== handle }))
      .filter((m: Msg) => !isNaN(m.at)).sort((a: Msg, b: Msg) => a.at - b.at);
    const key = acct + "|" + c.id;
    let row = threads.get(key);
    const firstOurs = msgs.find((m) => m.us && sentOurs(m.text));
    if (!row && !firstOurs) return;
    const lastThem = [...msgs].reverse().find((m) => !m.us), lastUs = [...msgs].reverse().find((m) => m.us);

    if (!row) {   // newly qualified: check them, then keep or filter out
      const followers = p?.followers ?? null;
      const said = msgs.filter((m) => !m.us && m.text).map((m) => m.text).join("\n");
      const clipper = said.match(CLIPPER);
      const why = followers != null && followers < minF ? "Under " + minF.toLocaleString("en-US") + " followers (" + followers.toLocaleString("en-US") + ")"
        : clipper ? "Looking for clipping work: “" + clip(said.split("\n").find((t) => CLIPPER.test(t)) ?? clipper[0], 120) + "”" : "";
      row = { account: acct, thread_id: c.id, handle, igsid: String(them.id ?? ""), name: p?.name ?? "", followers, status: why ? "filtered" : "kept", why,
        qualified_at: iso(firstOurs!.at), logged_to: null, lead_id: null };
      if (why) out.filtered++; else out.kept++;
    }
    row.last_them = lastThem ? iso(lastThem.at) : row.last_them ?? null;
    row.last_us = lastUs ? iso(lastUs.at) : row.last_us ?? null;
    row.updated_time = iso(ms(c.updated_time));
    row.checked_at = new Date().toISOString();

    // Kept before but its lead is gone: someone deleted it in the CRM, so don't bring it back.
    if (threads.has(key) && row.status === "kept" && (!row.lead_id || !leads.has(row.lead_id)) && !leadByHandle.has(handle)) {
      row.status = "filtered"; row.why = "Deleted from Leads"; row.lead_id = null;
    }
    if (row.status === "kept") {
      let lead = row.lead_id ? leads.get(row.lead_id) : leadByHandle.get(handle);
      const sinceQ = ms(row.qualified_at) - 60e3;
      if (!lead) {
        const said = msgs.filter((m) => !m.us && m.text.trim().length > 3).sort((a, b) => b.text.length - a.text.length)[0]?.text ?? "";
        const theirPhone = msgs.filter((m) => !m.us).map((m) => m.text.match(THEIR_PHONE)?.[0]).find(Boolean) ?? "";
        const isBooked = !!booked && msgs.some((m) => m.at >= sinceQ && BOOKED.test(m.text));
        const notes = [row.followers != null ? row.followers.toLocaleString("en-US") + " followers on Instagram." : "", said ? "They said: “" + clip(said, 400) + "”" : ""].filter(Boolean).join("\n");
        const { data: made, error } = await db.from("crm_leads").insert({ name: row.name || handle, instagram: "@" + handle, phone: theirPhone, direction: "Inbound",
          source: "Instagram", source_detail: "DM to @" + acct, stage: isBooked ? booked : talks, heat: "Hot", notes, owner, origin_key: "ig:" + handle,
          fields: { ig_followers: row.followers }, created_by: "automation" }).select("id,instagram,origin_key,stage,next_step,next_date,phone,fields,archived").single();
        if (error) {   // made by the other account's thread a moment ago
          const { data: again } = await db.from("crm_leads").select("id,instagram,origin_key,stage,next_step,next_date,phone,fields,archived").eq("origin_key", "ig:" + handle).maybeSingle();
          if (!again) throw error;
          lead = again;
        } else {
          lead = made;
          out.leads_added++;
          await db.from("crm_lead_events").insert({ lead_id: lead.id, kind: "note", by_email: "automation",
            text: "Found automatically in the Instagram DMs to @" + acct + ": we sent our " + (links.some((x) => firstOurs!.text.toLowerCase().includes(x)) ? "booking link" : "number") +
              " on " + dayLabel(ms(row.qualified_at)) + "." });
        }
        leads.set(lead.id, lead); leadByHandle.set(handle, lead);
      }
      row.lead_id = lead.id;

      // The conversation, into the lead's history (text only; photos, voice notes and our automated cards are left out).
      const from = row.logged_to ? ms(row.logged_to) : -Infinity;
      const fresh = msgs.filter((m) => m.at > from && m.text.trim());
      if (fresh.length) {
        const { error } = await db.from("crm_lead_events").insert(fresh.map((m) => ({ lead_id: lead.id, kind: "message", at: iso(m.at),
          text: (m.us ? "@" + acct : "@" + handle) + ": " + clip(m.text, 1500), by_email: m.us ? acct + "@instagram" : handle + "@ig-contact" })));
        if (error) throw error;
        out.messages_logged += fresh.length;
      }
      if (msgs.length) row.logged_to = iso(Math.max(msgs[msgs.length - 1].at, from === -Infinity ? 0 : from));

      // Stage and next step, unless someone on the team has taken over (changed the next step, or closed the lead).
      const last = msgs[msgs.length - 1];
      const f = lead.fields ?? {};
      if (last && !lead.archived && !closed.has(lead.stage) && last.at >= (f.ig_last_at ?? 0)) {
        const patch: Record<string, unknown> = {};
        if (booked && lead.stage === talks && msgs.some((m) => m.at >= sinceQ && BOOKED.test(m.text))) patch.stage = booked;
        if (!lead.phone) { const p = msgs.filter((m) => !m.us).map((m) => m.text.match(THEIR_PHONE)?.[0]).find(Boolean); if (p) patch.phone = p; }
        const where = " on Instagram (@" + acct + ")";
        let next: string, date: number;
        if (!last.us) { next = "Reply to @" + handle + where + ": “" + clip(last.text || "sent a photo or voice note", 80) + "”"; date = last.at; }
        else {
          const due = last.at + fuDays * 86400e3;
          next = Date.now() >= due ? "Follow up with @" + handle + where + ": no reply since " + dayLabel(last.at) : "Waiting for @" + handle + " to reply" + where;
          date = due;
        }
        const mineToSet = !lead.next_step || lead.next_step === f.ig_auto_next;
        if (mineToSet && (next !== lead.next_step || istDate(date) !== lead.next_date)) { patch.next_step = next; patch.next_date = istDate(date); }
        if (Object.keys(patch).length || last.at !== f.ig_last_at) {
          patch.fields = { ...f, ig_last_at: last.at, ...(mineToSet ? { ig_auto_next: next } : {}) };
          const { data: upd, error } = await db.from("crm_leads").update(patch).eq("id", lead.id).select("id,instagram,origin_key,stage,next_step,next_date,phone,fields,archived").single();
          if (error) throw error;
          leads.set(lead.id, upd); leadByHandle.set(handle, upd);
          if (patch.stage || patch.next_step) out.updated++;
        }
      }
    }
    const { error } = await db.from("crm_ig_threads").upsert(row, { onConflict: "account,thread_id" });
    if (error) throw error;
    threads.set(key, row);
  }
}
