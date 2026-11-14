// x-grow (15 Nov): the daily engine of the 10K followers plan on X.
// 1. Reply targets (every hour in US hours): fresh posts (last 3 hours, no replies or reposts) from the GTM creators our buyers
//    follow, and from the funded founders in DM Pipeline, saved to crm_x_reply. Replying early and well under these posts is
//    how a small account gets seen, and replying to a lead before the DM warms them up. Replies are written by hand (no AI).
// 2. New followers (every run): our newest followers that we haven't seen are judged once (Exa) and go to Post Engagers as
//    "Followed", with a DM ready on the Engaged page. The first run only remembers who already follows us.
// Body: { replies?: boolean, followers?: boolean } (both when empty). Targets: crm_lead_settings "x_grow".targets.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Exa through Composio (15 Nov): our own Exa key ran out of credits, while the Exa account connected in Composio has them.
// exaFetch takes the same arguments as fetch("https://api.exa.ai/search", ...): it tries the Exa key first (when there is one
// and it hasn't said "out of credits" in this run), then sends the same search through Composio's EXA_SEARCH tool, and hands
// back a Response with Exa's usual JSON, so the code around it doesn't change.
const EXA_KEY_ = Deno.env.get("EXA_API_KEY") ?? "";
const CMP_KEY_ = Deno.env.get("COMPOSIO_API_KEY") ?? "";
let exaKeyEmpty_ = false;
async function exaFetch(url: string, init: RequestInit): Promise<Response> {
  if (EXA_KEY_ && !exaKeyEmpty_) {
    const r = await fetch(url, init);
    if (r.ok) return r;
    const t = await r.text();
    if (!(r.status === 402 || /credit|NO_MORE_CREDITS|top up/i.test(t)) || !CMP_KEY_) return new Response(t, { status: r.status });
    exaKeyEmpty_ = true;
  }
  if (!CMP_KEY_) return new Response(JSON.stringify({ error: "No Exa key with credits and no COMPOSIO_API_KEY" }), { status: 500 });
  const args = JSON.parse(String(init.body ?? "{}"));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://connect.composio.dev/mcp", { method: "POST",
        headers: { "x-consumer-api-key": CMP_KEY_, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "COMPOSIO_MULTI_EXECUTE_TOOL",
          arguments: { tools: [{ tool_slug: "EXA_SEARCH", arguments: args }], sync_response_to_workbench: false, thought: "CRM job search" } } }) });
      const txt = await res.text();
      if (!res.ok) throw new Error("Composio answered " + res.status + ": " + txt.slice(0, 160));
      const line = txt.match(/^data: (.*)$/m);
      const j = JSON.parse(line ? line[1] : txt);
      if (j.error) throw new Error("Composio: " + String(j.error.message ?? j.error).slice(0, 160));
      const out = JSON.parse(j.result?.content?.[0]?.text ?? "{}");
      const one = out?.data?.results?.[0]?.response;
      if (!one?.successful) throw new Error("Exa via Composio: " + String(one?.error ?? out?.error ?? "no result").slice(0, 160));
      return new Response(JSON.stringify(one.data ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) { if (attempt === 1) return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 502 }); }
  }
  return new Response("{}", { status: 502 });
}


const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TWAPI = Deno.env.get("TWITTERAPI_KEY") ?? "";
const EXA = Deno.env.get("EXA_API_KEY") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const COMPOSIO = Deno.env.get("COMPOSIO_API_KEY") ?? "";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const ACCOUNT = "Reyansh", HANDLE = "r3yanshJuneja";
const MAX_FOLLOWERS_JUDGED = 20;
const DEFAULT_TARGETS = ["NamanyayG", "codyschneider", "danielfazio", "NickAbraham12", "LoganTGott", "MitchellKeller_", "romanbuildsaas",
  "DanniChenGTM", "coldemailchris", "fin465", "itsalexvacca", "HelloPrerona", "MichLieben", "thatGTMdude", "DinScales26", "atishayhyperke",
  "nikolak47", "dimitarangg", "jack_9947", "dan__rosenthal", "pierreeliottlal", "Dylan_txa_", "vxanand", "mayanayyar1", "ericosiu", "garrytan"];

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
async function allowed(req: Request) {
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
  if (!TWAPI) return json({ error: "TWITTERAPI_KEY is missing." }, 500);
  const body = await req.json().catch(() => ({}));
  const both = !body.replies && !body.followers;
  const { data: run } = await db.from("crm_sync_runs").insert({ platform: "x-grow" }).select("id").single();
  const out: Record<string, unknown> = {};
  try {
    if (both || body.replies) out.replies = await replyTargets();
    if (both || body.followers) out.followers = await newFollowers();
    if (both || body.followers || body.warm) out.warm = await warmDMs();
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, summary: out }).eq("id", run.id);
    return json(out);
  } catch (e) {
    const error = String((e as Error).message ?? e);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", run.id);
    return json({ error, ...out }, 500);
  }
});

const clip = (s: string, n: number) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const noDash = (s: string) => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+,/g, ",");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const istStamp = (d: Date) => { const x = new Date(d.getTime() + 330 * 60e3); return x.getUTCDate() + " " + MON[x.getUTCMonth()] + " " + x.getUTCFullYear() + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); };

let twNext = 0;
async function tw(path: string): Promise<any> {   // free tier: one request every 5 seconds
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = Math.max(0, twNext - Date.now()); twNext = Math.max(Date.now(), twNext) + 5200;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    let r: Response;
    try { r = await fetch("https://api.twitterapi.io" + path, { headers: { "X-API-Key": TWAPI } }); }
    catch (e) { if (attempt === 2) throw e; continue; }   // a dropped connection: try again on the next turn
    if (r.status === 429) continue;
    if (!r.ok) throw new Error("twitterapi.io answered " + r.status + ": " + (await r.text()).slice(0, 160));
    return await r.json();
  }
  throw new Error("twitterapi.io kept saying slow down");
}

async function settings() {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "x_grow").maybeSingle();
  return (data?.value ?? {}) as { targets?: string[]; lead_turn?: number };
}

// 1. Fresh posts to reply to.
async function replyTargets() {
  const set = await settings();
  const creators = [...new Set((set.targets?.length ? set.targets : DEFAULT_TARGETS).map((h) => h.replace(/^@/, "")))];
  // Funded founders we plan to DM or already messaged: replying first makes the DM warm. A third of them each run.
  const { data: pl } = await db.from("crm_sheet").select("cells").eq("tab", "DM Pipeline").gte("row", 4);
  const leads = [...new Set((pl ?? []).filter((r) => !/do not contact|not now|customer/i.test(String(r.cells?.[18] || "")))
    .map((r) => String(r.cells?.[10] || "").replace(/^@/, "").trim()).filter((h) => /^\w{2,15}$/.test(h)))];
  const turn = (set.lead_turn ?? 0) % 3;
  const leadPart = leads.filter((_, i) => i % 3 === turn);
  await db.from("crm_lead_settings").upsert({ key: "x_grow", value: { ...set, lead_turn: turn + 1 } }, { onConflict: "key" });
  const since = Math.floor(Date.now() / 1000) - 3 * 3600;
  const groups: [string, string[]][] = [];
  for (let i = 0; i < creators.length; i += 9) groups.push(["creator", creators.slice(i, i + 9)]);
  for (let i = 0; i < leadPart.length; i += 9) groups.push(["lead", leadPart.slice(i, i + 9)]);
  const rows: any[] = [];
  for (const [kind, hs] of groups) {
    const q = "(" + hs.map((h) => "from:" + h).join(" OR ") + ") -filter:replies -filter:retweets since_time:" + since;
    const j = await tw("/twitter/tweet/advanced_search?queryType=Latest&query=" + encodeURIComponent(q));
    for (const t of j.tweets ?? []) {
      if (!t?.id || !t.author?.userName || t.isReply || t.retweeted_tweet) continue;
      rows.push({ url: "https://x.com/" + t.author.userName + "/status/" + t.id, author: t.author.userName, name: t.author.name || "",
        followers: t.author.followers ?? null, kind, post_text: String(t.text || "").slice(0, 2000), posted_at: t.createdAt ? new Date(t.createdAt).toISOString() : null,
        views: t.viewCount ?? null, likes: t.likeCount ?? null, replies: t.replyCount ?? null });
    }
  }
  // New posts are added; ones we already have only get fresh numbers (status and who replied stay as they are).
  let added = 0;
  if (rows.length) {
    const { data: have } = await db.from("crm_x_reply").select("url").in("url", rows.map((r) => r.url));
    const known = new Set((have ?? []).map((r) => r.url));
    const fresh = rows.filter((r) => !known.has(r.url));
    if (fresh.length) {
      // A reply draft for the posts worth it (leads, and creators with 1,000+ followers), at most 12 a run. Reyansh edits and posts it.
      const worth = fresh.filter((r) => r.kind === "lead" || (r.followers ?? 0) >= 1000).slice(0, 12);
      if (COMPOSIO && worth.length) { const d = await draftReplies(worth).catch(() => ({} as Record<string, string>)); worth.forEach((r, i) => { r.draft = noDash(d[String(i)] || ""); }); }
      const { error } = await db.from("crm_x_reply").insert(fresh); if (error) throw error; added = fresh.length;
    }
    for (const r of rows.filter((r) => known.has(r.url))) await db.from("crm_x_reply").update({ views: r.views, likes: r.likes, replies: r.replies }).eq("url", r.url);
  }
  await db.from("crm_x_reply").delete().lt("day", new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10));
  // Catch-up: open posts from the last 6 hours that still have no draft (the model was busy, or they came in before drafts existed).
  let drafted = 0;
  if (COMPOSIO) {
    const { data: miss } = await db.from("crm_x_reply").select("url,author,name,followers,kind,post_text").eq("status", "new").eq("draft", "")
      .gte("created_at", new Date(Date.now() - 6 * 3600e3).toISOString()).order("created_at", { ascending: false }).limit(30);
    const todo = (miss ?? []).filter((r) => r.kind === "lead" || (r.followers ?? 0) >= 1000).slice(0, 12);
    if (todo.length) {
      const d = await draftReplies(todo).catch(() => ({} as Record<string, string>));
      for (const [i, r] of todo.entries()) { const t = noDash(d[String(i)] || ""); if (t) { await db.from("crm_x_reply").update({ draft: t }).eq("url", r.url); drafted++; } }
    }
  }
  return { searched: groups.length, found: rows.length, added, drafted };
}

// Reply drafts through Composio's model (one batch per run, like li-engage's LinkedIn comments).
async function mcp(name: string, args: Record<string, unknown>) {
  const res = await fetch("https://connect.composio.dev/mcp", { method: "POST",
    headers: { "x-consumer-api-key": COMPOSIO, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const txt = await res.text();
  if (!res.ok) throw new Error("Composio answered " + res.status + ": " + txt.slice(0, 200));
  const line = txt.match(/^data: (.*)$/m);
  const j = JSON.parse(line ? line[1] : txt);
  if (j.error) throw new Error("Composio: " + String(j.error.message ?? j.error).slice(0, 200));
  return JSON.parse(j.result?.content?.[0]?.text ?? "{}");
}
const REPLY_PROMPT = (r: any) =>
  "Write Reyansh's reply under this X post. Reyansh is 20, runs SOVE7GN (founder content and DMs on X and LinkedIn for funded B2B founders) and built his own outbound CRM.\n" +
  "Post by " + r.name + " (@" + r.author + ", " + (r.followers ?? 0) + " followers" + (r.kind === "lead" ? ", a funded founder he may sell to later: be useful and curious about their company" : ", a GTM creator whose audience is founders") + "):\n\"\"\"\n" +
  String(r.post_text).slice(0, 1200) + "\n\"\"\"\n" +
  "Rules: max 200 characters, react to what the post actually says. Add something of his own: a specific take, an example, or one sharp question. Talk like a peer. " +
  "Mention his outbound, CRM or content work only when the post is about sales, GTM, content or getting customers, and never more than half a sentence. " +
  "Never pitch, no links, no hashtags, no em dashes, never start with praise (great, love, so true, congrats), no 'it's not X, it's Y'. Plain casual words, lowercase is fine. " +
  "If the post is only a link or there is nothing worth saying, answer SKIP. Answer with the reply text only.";
async function draftReplies(rows: any[]): Promise<Record<string, string>> {
  const items = rows.map((r, i) => ({ id: String(i), prompt: REPLY_PROMPT(r) }));
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(items))));
  const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
    "items = json.loads(base64.b64decode('" + payload + "').decode())",
    "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
    "with ThreadPoolExecutor(8) as ex: res = dict(ex.map(one, items))",
    "print('@@' + json.dumps(res))"].join("\n");
  const out = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Write X reply drafts for the CRM" });
  const res = JSON.parse(String(out?.data?.stdout ?? "").split("@@").pop() || "{}");
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(res)) { const t = String(v || "").trim().replace(/^"|"$/g, ""); if (t && !/^skip\b/i.test(t) && !/^(great|love|so true|congrats|amazing)\b/i.test(t)) clean[k] = t.slice(0, 280); }
  return clean;
}

// 3. Warm DMs on autopilot (15 Nov): everyone the CRM judged worth a DM (replied, quoted, commented a keyword, tagged, followed)
//    gets a DM Pipeline row (script W1, Warm) and a task for the X bot, which sends it from Reyansh's X tab within its daily cap
//    (warm people go before cold ones). Follow-ups 1 and 2 come from W1. At most 10 a run.
async function warmDMs() {
  const { data: pe } = await db.from("crm_sheet").select("row,cells").eq("tab", "Post Engagers").gte("row", 4);
  const week = Date.now() - 7 * 864e5;
  const MONS: Record<string, number> = Object.fromEntries(MON.map((m, i) => [m, i]));
  const when = (s: string) => { const m = String(s || "").match(/^(\d{1,2}) (\w{3}) (\d{4})/); return m ? Date.UTC(+m[3], MONS[m[2]] ?? 0, +m[1]) : 0; };
  const todo = (pe ?? []).filter((r) => { const c = r.cells ?? []; return (c[15] || "To message") === "To message" && c[18] === "DM + reply" && String(c[14] || "").trim() && c[5] && when(c[0]) >= week; });
  if (!todo.length) return { queued: 0 };
  const { data: pl } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Pipeline").gte("row", 4);
  const inPipe = new Set((pl ?? []).map((r) => String(r.cells?.[10] || "").replace(/^@/, "").toLowerCase()).filter(Boolean));
  const { data: tk } = await db.from("crm_x_tasks").select("handle");
  const queuedH = new Set((tk ?? []).map((t) => String(t.handle || "").toLowerCase()));
  let next = Math.max(3, ...(pl ?? []).map((r) => r.row)) + 1;
  const writes: any[] = [], tasks: any[] = [], fills: any[] = [];
  const seen = new Set<string>();
  for (const r of todo) {
    const c = r.cells, h = String(c[5]).replace(/^@/, ""), hl = h.toLowerCase();
    if (seen.has(hl) || inPipe.has(hl) || queuedH.has(hl)) continue;
    seen.add(hl);
    const row = next++, name = c[6] || h, how = c[4] || "Engaged", dm = String(c[14]).trim();
    const sig = how === "Followed" ? "Followed us on X" : how + " on our post: “" + clip(c[10] || c[3] || "", 150) + "”";
    writes.push({ row, col: 3, values: [[name, "Unknown", "", ACCOUNT, "X DM", "Warm", how === "Followed" ? "Followed us" : "Engaged with our post", "9", h, "", "", sig, c[11] || c[2] || "", c[0] || "", "W1", dm, "To send", ""]] });
    writes.push({ row, col: 28, values: [["Warm: added by x-grow on " + istStamp(new Date()) + ". " + (c[19] || "") + " Bio: " + clip(c[7] || "", 160)]] });
    if (c[20]) writes.push({ row, col: 38, values: [[String(c[20])]] });
    tasks.push({ row, name, company: "", handle: h, user_id: c[20] ? String(c[20]) : null, kind: "dm", text: dm, status: "ready", decided_by: "auto: warm" });
    fills.push({ row: r.row, handle: h });
    if (tasks.length >= 10) break;
  }
  if (!tasks.length) return { queued: 0 };
  const { data: res, error } = await db.rpc("crm_call", { body: { action: "rows", writes } });
  if (error || !String(res).startsWith("ok")) throw new Error("Saving warm leads failed: " + (error?.message ?? res));
  const { error: e2 } = await db.from("crm_x_tasks").insert(tasks); if (e2) throw e2;
  for (const f of fills) await db.rpc("crm_call", { body: { action: "engagerFill", row: f.row, handle: f.handle, cells: { 16: "Messaged" } } });
  return { queued: tasks.length };
}

// 2. New followers -> judged once -> Post Engagers ("Followed") with a DM.
const ICP = "We sell a done-for-you GTM service (founder content on X and LinkedIn, warm-signal DMs, outbound, booked sales calls) to seed to Series C B2B founders. " +
  "Core buyer = co-founder, CEO, CMO or C-suite at a B2B or B2B2C startup of about 5 to 50 people that raised recently and still runs GTM themselves. " +
  "Good fit = founder or senior GTM person at a startup that could buy later. Related = operators, GTM people, other founders. Investor = VCs and angels. " +
  "Not a buyer = agencies and people selling GTM, outbound or content (competitors), job seekers, bots, spam.";
async function judge(f: any) {
  const bio = String(f.description || "");
  const schema = { type: "object", required: ["verdict", "fit", "why", "dm"], properties: {
    verdict: { type: "string", enum: ["DM + reply", "Reply only", "Skip"], description: "DM + reply = Core buyer or Good fit (DM them). Reply only = nice to thank but not a buyer. Skip = bots, spam, competitors." },
    fit: { type: "string", enum: ["Core buyer", "Good fit", "Related", "Investor", "Other", "Not a buyer"] },
    why: { type: "string", description: "One plain sentence: who they are and why this verdict" },
    company: { type: "string" },
    dm: { type: "string", description: "A DM from Reyansh (20, building SOVE7GN, runs founder content and DMs on X and LinkedIn for funded B2B founders), max 280 characters: thank them for the follow, one specific line about what they build (from their bio), then one easy question about how they get customers right now. No pitch, no links, no em dashes, no hashtags, plain human sentences." },
  } };
  const at = (bio.match(/@([A-Za-z0-9_]{2,15})/) || [])[1] || "";
  const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: (at ? at + " " : "") + clip(bio, 120) + " company", numResults: 3, outputSchema: schema,
      systemPrompt: "Someone just followed us on X. Them: " + f.name + " (@" + f.userName + "), " + (f.followers_count ?? 0) + " followers, bio: \"" + clip(bio, 250) + "\". Use the search results only to learn about their company. " + ICP }) });
  if (!r.ok) throw new Error("Exa answered " + r.status);
  const j = await r.json();
  return { ...(j.output?.content ?? {}), cost: j.costDollars?.total ?? 0 };
}
async function newFollowers() {
  const j = await tw("/twitter/user/followers?userName=" + HANDLE + "&pageSize=200");
  const list: any[] = (j.followers ?? []).filter((f: any) => f?.id);
  const { count } = await db.from("crm_x_followers").select("id", { count: "exact", head: true });
  const { data: seen } = await db.from("crm_x_followers").select("id").in("id", list.map((f) => String(f.id)));
  const known = new Set((seen ?? []).map((r) => r.id));
  const fresh = list.filter((f) => !known.has(String(f.id)));
  const rowOf = (f: any, judged: boolean) => ({ id: String(f.id), handle: f.userName || f.screen_name || "", name: f.name || "", followers: f.followers_count ?? null, judged });
  if (!count) {   // first run: remember everyone who already follows us, DM nobody
    if (fresh.length) await db.from("crm_x_followers").upsert(fresh.map((f) => rowOf(f, false)), { onConflict: "id" });
    return { seeded: fresh.length };
  }
  const now = new Date(), engagers: any[] = [], people: any[] = [];
  let cost = 0;
  const toJudge = fresh.slice(0, MAX_FOLLOWERS_JUDGED);
  for (let i = 0; i < toJudge.length; i += 5) {
    const batch = toJudge.slice(i, i + 5);
    const res = await Promise.all(batch.map((f) => EXA ? judge(f).catch(() => null) : Promise.resolve(null)));
    batch.forEach((f, k) => {
      const o: any = res[k]; if (o) cost += o.cost ?? 0;
      const h = f.userName || f.screen_name, first = String(f.name || h).split(/\s+/)[0];
      const dm = noDash(o?.dm || "Hey " + first + ", thanks for the follow. What are you building right now, and how are you getting customers for it?");
      engagers.push([istStamp(now), ACCOUNT, "https://x.com/" + h, "(followed us)", "Followed", h, f.name || "", clip(String(f.description || ""), 200),
        String(f.followers_count ?? ""), f.can_dm ? "Yes" : "", "", "https://x.com/" + h, o?.fit || "Other", ACCOUNT, dm,
        o?.verdict === "Skip" ? "Dismissed" : "To message", "", "", o?.verdict === "Reply only" ? "Reply only" : (o?.verdict || "DM + reply"), noDash(o?.why || "Followed us on X."), String(f.id)]);
      if (o) people.push({ handle: String(h).toLowerCase(), name: f.name || "", bio: clip(String(f.description || ""), 300), followers: f.followers_count ?? null,
        fit: o.verdict === "DM + reply" ? "hot" : o.verdict === "Reply only" ? "warm" : "not a fit", why: noDash(o.why || ""), company: o.company || "",
        found_by: "followed", added: true, judged_at: now.toISOString() });
    });
  }
  if (engagers.length) { const { error } = await db.rpc("crm_call", { body: { action: "track", posts: [], snapshots: [], newPosts: [], engagers } }); if (error) throw error; }
  if (people.length) await db.from("crm_x_people").upsert(people, { onConflict: "handle" });
  // Everyone new is remembered (the ones over the cap too, so a burst of followers doesn't queue forever).
  if (fresh.length) await db.from("crm_x_followers").upsert(fresh.map((f, i) => rowOf(f, i < MAX_FOLLOWERS_JUDGED)), { onConflict: "id" });
  return { new_followers: fresh.length, judged: toJudge.length, to_dm: engagers.filter((e) => e[15] === "To message").length, cost_exa: Math.round(cost * 1000) / 1000 };
}
