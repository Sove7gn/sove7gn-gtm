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
let REDRAFT = false;
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
const BOT_KEY = Deno.env.get("LI_BOT_TOKEN") ?? "";
async function allowed(req: Request) {
  if (CRON && req.headers.get("x-cron-secret") === CRON) return true;
  if (BOT_KEY && req.headers.get("x-bot-token") === BOT_KEY) return true;   // (16 Nov) the Chrome extension, reading X from his tab
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.from("crm_team").select("email").limit(1);
  return !!data?.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await allowed(req))) return json({ error: "Only the team can run this." }, 401);
  const body = await req.json().catch(() => ({}));
  if (body.read_plan) { try { return json(await readPlan(body)); } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); } }
  if (body.read_done) { try { return json(await readDone(body)); } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); } }
  if (body.posts) {   // the daily News / Shoutout posts run on their own
    try { return json({ posts: await dailyPosts(!!body.force) }); } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
  }
  if (body.redraft) {   // write the reply drafts again for open posts (after a prompt change)
    await db.from("crm_x_reply").update({ draft: "" }).eq("status", "new"); REDRAFT = true;
  }
  const both = !body.replies && !body.followers;
  const { data: run } = await db.from("crm_sync_runs").insert({ platform: "x-grow" }).select("id").single();
  const out: Record<string, unknown> = {};
  try {
    // (22 Nov) X replies are done by Instinct: no reply targets or drafts while x_bot.replies_paused is on
    const rp = !!((await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle()).data?.value as any)?.replies_paused;
    if ((both || body.replies) && !rp) out.replies = await replyTargets().catch((e) => ({ error: String((e as Error).message ?? e) }));
    if (both || body.followers) out.followers = await newFollowers().catch((e) => ({ error: String((e as Error).message ?? e) }));   // twitterapi.io may be out of credits: the extension reads followers too
    if (both || body.followers || body.warm) out.warm = await warmDMs();
    if (both || body.li_ideas) out.li_ideas = await liReplyIdeas().catch((e) => ({ error: String((e as Error).message ?? e) }));
    if (body.follow_src) out.follow_src = await followSource(+(body.max ?? 10) || 10);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, summary: out }).eq("id", run.id);
    return json(out);
  } catch (e) {
    const error = String((e as Error).message ?? e);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", run.id);
    return json({ error, ...out }, 500);
  }
});

// A "comment" that is really their headline (the old reader put the name where the headline goes, then the headline where the comment goes).
const cleanNm = (s: string) => String(s || "").replace(/\s+(Premium|Verified)\b.*$/i, "").replace(/\s*[•·]?\s*(1st|2nd|3rd\+?)\s*$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
const headlineLike = (said: string, p: any) => !!cleanNm(p.headline) && cleanNm(p.headline) === cleanNm(p.name) &&
  (/\s[|·]\s/.test(said) || /^[^.!?]{0,160}\b(founder|co-founder|ceo|cto|coo|engineer|director|head of|vp|manager|partner|consultant)\b[^.!?]*$/i.test(said));
// (17 Nov) Midbound: a suggested answer for each new comment on our LinkedIn posts, so Reyansh can reply under it in one go.
async function liReplyIdeas() {
  const { data: es } = await db.from("crm_social_engagements").select("post_id,person_key,said").eq("platform", "linkedin").eq("kind", "commented")
    .is("reply_idea", null).neq("said", "").gte("first_seen", new Date(Date.now() - 21 * 864e5).toISOString()).order("first_seen", { ascending: false }).limit(12);
  if (!es?.length) return { written: 0 };
  const { data: ppl } = await db.from("crm_social_people").select("person_key,name,headline,is_self").eq("platform", "linkedin").in("person_key", es.map((e) => e.person_key));
  const { data: pos } = await db.from("crm_social_posts").select("post_id,text").eq("platform", "linkedin").in("post_id", [...new Set(es.map((e) => e.post_id))]);
  const pm = new Map((ppl ?? []).map((p) => [p.person_key, p])), tm = new Map((pos ?? []).map((p) => [p.post_id, p.text]));
  const mark = (e: any, v: string) => db.from("crm_social_engagements").update({ reply_idea: v }).eq("platform", "linkedin").eq("post_id", e.post_id).eq("person_key", e.person_key).eq("kind", "commented");
  const todo: any[] = [];
  for (const e of es) {
    const p: any = pm.get(e.person_key) ?? {};
    const said = String(e.said || "").trim();
    // Comments read before the 17 Nov reader fix sometimes hold the person's headline instead; those get no idea.
    if (p.is_self || said === String(p.headline || "").trim() || said === String(p.name || "").trim() || headlineLike(said, p)) { await mark(e, ""); continue; }
    todo.push({ e, p });
  }
  if (!todo.length) return { written: 0 };
  const outs = await llm(todo.map(({ e, p }) =>
    "You are Reyansh, founder of SOVE7GN (done-for-you GTM for B2B startups). Someone commented under your LinkedIn post. Write the reply you'd post under their comment.\n" +
    "Your post: \"" + clip(tm.get(e.post_id) ?? "", 600) + "\"\n" +
    "Their name: " + (String(p.name || "").split(" ")[0] || "there") + ". Their headline: " + clip(p.headline ?? "", 120) + "\n" +
    "Their comment: \"" + clip(e.said, 500) + "\"\n" +
    "Rules: 1-2 short sentences, under 40 words, casual and human, react to their exact point (agree, add one concrete detail, or a light pushback). " +
    "At most one simple question, only if it keeps the chat going naturally. Never pitch, never mention SOVE7GN, no hashtags, no emojis, no dashes. Start with their first name. Reply with the text only."));
  let written = 0;
  for (let i = 0; i < todo.length; i++) {
    const t = clip(outs[i] ?? "", 400);
    if (!t) continue;
    await mark(todo[i].e, t);
    written++;
  }
  return { written };
}

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
    let j: any = {};
    try { j = TWAPI ? await tw("/twitter/tweet/advanced_search?queryType=Latest&query=" + encodeURIComponent(q)) : {}; } catch (_) { break; }   // (16 Nov) no credits: the extension reads X instead
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
      .gte("created_at", new Date(Date.now() - (REDRAFT ? 48 : 6) * 3600e3).toISOString()).order("created_at", { ascending: false }).limit(REDRAFT ? 80 : 30);
    const todo = (miss ?? []).filter((r) => r.kind === "lead" || (r.followers ?? 0) >= 1000).slice(0, REDRAFT ? 40 : 12);
    if (todo.length) {
      const d = await draftReplies(todo).catch(() => ({} as Record<string, string>));
      for (const [i, r] of todo.entries()) { const t = noDash(d[String(i)] || ""); if (t) { await db.from("crm_x_reply").update({ draft: t, ...(r.kind === "lead" ? { status: "approved" } : {}) }).eq("url", r.url).eq("status", "new"); drafted++; } }   // ICP posts go straight to the bot
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
// (15 Nov v2) Replies that sound like a 20-year-old founder typing on his phone: short, one point, casual, on the post's own topic.
const REPLY_PROMPT = (r: any, i: number) =>
  "You write a reply under an X post, as Reyansh: 20, Indian founder of a small GTM agency for startups, casual and a bit funny, types fast on his phone.\n" +
  "Post by " + r.name + " (@" + r.author + ", " + (r.followers ?? 0) + " followers, " + (r.kind === "lead" ? "a startup founder" : "a creator who posts about sales and growth") + "):\n\"\"\"\n" +
  String(r.post_text).slice(0, 1200) + "\n\"\"\"\n" +
  // (18 Nov, Reyansh) Only reply where we belong: posts about building, selling or growing a startup. Everything else (where they live,
  // morning posts, crypto wallets, sport, food, trips, politics, leaks, teasers, memes) is SKIP. Replies must read like a person, not AI.
  "Step 1, relevance: reply ONLY if the post is about building, launching, selling, marketing, hiring for or growing a startup or product (GTM, sales, outbound, content, customers, pricing, fundraising, founder work, AI tools for business). " +
  "If it is about anything else (where someone lives, their day, motivation, crypto, sport, food, travel, politics, news gossip, a teaser with no detail, a meme, a personal story), answer SKIP. When in doubt, SKIP.\n" +
  "Step 2, the reply: say one real thing he actually thinks, the way a founder texts a friend: a specific take or opinion. Never invent stories, clients, numbers or things he did (no 'last month a client...', no 'my week is...'): give a view, not a made-up memory. Talk to the person, about their exact point. Mention his own work only if it truly fits, in a few words.\n" +
  "Style: one line, ideally 50 to 120 characters, plain words, lowercase is fine, imperfect grammar is fine. " +
  "Make a statement, not a question" + (i % 3 === 2 ? " (one short question at the end is allowed this time)" : " (no question this time)") + ". " +
  "Sound human: no 'lol', 'tbh', 'ha,' or 'honestly' fillers, no repeating their post back to them, no neat two-part balanced sentences, no summary of the post, no wise-sounding closing line. " +
  "Never: pitch, links, hashtags, emojis, em dashes, semicolons, starting with praise (great, love this, so true, congrats, this is gold, bold), 'it's not X, it's Y', 'the real X is Y', sounding like a LinkedIn post, big words. " +
  "If the post is only a link with no text, it is vague, or there is nothing natural to say, answer SKIP. " +
  "Answer with the reply text only, exactly as it will be posted: no notes, no thinking, no labels, no explaining what the post is about, no second try. " +
  "If you are not sure your reply follows every rule, answer SKIP.";
// (18 Nov, Reyansh) The bot posts drafts with no human check, so anything that isn't a clean reply is skipped. The model once wrote its own
// notes ("Wait, I need to keep it to 1-2 short lines...", "Reyansh's reply: the post is about...", "Trimming:") and the bot posted them.
const META = /\b(wait,|trimming|1-2 (short )?lines|under 140|characters\b|reyansh|the post is|this post|post is about|reply:|reply as|replying|statement[- ]only|no question|no pitch|no praise|as a friend would|the rules?\b|draft|here'?s (a|my|the)|let me|i need to keep|okay,? so|ok,? the vibe|generic motivation|nothing specific)/i;
function replyOk(t: string) {
  const s = String(t || "").trim();
  if (!s || s.length > 160 || /\n/.test(s) || META.test(s) || /^skip\b/i.test(s)) return false;   // long ones got cut off mid-word on X ("the rest of y")
  if (/^(great|love|so true|congrats|amazing|bold|ha\b|honestly)/i.test(s) || /https?:\/\/|#\w|;|\p{Extended_Pictographic}/u.test(s)) return false;
  if (/\b(lol|tbh|lmao)\s*[.!]?$/i.test(s) || /\bthe real (flex|game|product|x)\b/i.test(s)) return false;   // AI tells he flagged
  return true;
}
async function draftReplies(rows: any[]): Promise<Record<string, string>> {
  const items = rows.map((r, i) => ({ id: String(i), prompt: REPLY_PROMPT(r, i) }));
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(items))));
  const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
    "items = json.loads(base64.b64decode('" + payload + "').decode())",
    "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
    "with ThreadPoolExecutor(8) as ex: res = dict(ex.map(one, items))",
    "print('@@' + json.dumps(res))"].join("\n");
  const out = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Write X reply drafts for the CRM" });
  const res = JSON.parse(String(out?.data?.stdout ?? "").split("@@").pop() || "{}");
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(res)) { const t = String(v || "").trim().replace(/^"|"$/g, ""); if (replyOk(t)) clean[k] = t; }
  return clean;
}

// (17 Nov, Reyansh) At least one post a day has to be engineered to spread: the daily News take is that post when nothing else is.
const TWIST_RULES = "Make it spread, not just inform. Line 1 is a twist that makes people curious or a little angry: a surprising number, a side most founders " +
  "won't say out loud, or what everyone is getting wrong about this story. Take one clear side and say it plainly, from someone who does GTM for funded startups " +
  "every day. It may be a bit controversial but never silly, mean or made up. Simple words, short lines, no lecture. End with a question people will argue about " +
  "in the replies (pick a side, A or B, or 'am I wrong?'). Facts only from the news given; no invented stories or quotes.";
// 4. Daily posts on the Calendar (15 Nov): every day a News post (the biggest AI / startup / GTM story of the last day, named, so
//    people searching for it find us) at 6:30 PM IST = 8 AM New York; Mon, Wed, Fri a Shoutout post at 10:45 PM IST that tags a
//    bigger GTM creator, says what they got right and quotes their best post of the last 2 days (their audience sees it, they often
//    repost). Both are drafts in Our Posts (status To post, Funnel Reach) for Reyansh to schedule. Never written twice for a day.
const POST_RULES = "Rules: write as Reyansh (20, founder of SOVE7GN, a done-for-you GTM agency for funded B2B startups). First line is the hook, under 120 characters. " +
  "Short lines, plain words, under 500 characters in total, one clear point, end with a short line that invites replies. Only facts from the material given, never invent numbers or results. " +
  "No em dashes, no en dashes, no hashtags, no emojis, no 'it's not X, it's Y', no 'no X, no Y' lists, no pitching the agency. Answer with the post text only.";
async function llm(prompts: string[]): Promise<string[]> {
  const items = prompts.map((prompt, i) => ({ id: String(i), prompt }));
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(items))));
  const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
    "items = json.loads(base64.b64decode('" + payload + "').decode())",
    "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
    "with ThreadPoolExecutor(4) as ex: res = dict(ex.map(one, items))",
    "print('@@' + json.dumps(res))"].join("\n");
  const out = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Write X posts for the CRM calendar" });
  const res = JSON.parse(String(out?.data?.stdout ?? "").split("@@").pop() || "{}");
  return prompts.map((_, i) => noDash(String(res[String(i)] ?? "").trim().replace(/^"|"$/g, "").replace(/#\w+/g, "").trim()));
}
// Daily slots written by this job (16 Nov v2). Each has a placeholder on the Calendar for the next 7 days, so the week is visible;
// on the day at 4:30 PM IST the placeholder is filled with a post written from that day's material.
const PLACEHOLDER = "(Written for you on ";
const DAILY_SLOTS: { slot: string; time: string; funnel: string; days: number[]; what: string }[] = [
  { slot: "AI tool", time: "5:45 PM", funnel: "Reach", days: [0, 1, 2, 3, 4, 5, 6], what: "a new AI tool or workflow founders can use to get customers, with how to use it" },
  { slot: "News", time: "6:30 PM", funnel: "Reach", days: [0, 1, 2, 3, 4, 5, 6], what: "the biggest AI or startup story of that day, named in line 1" },
  { slot: "Article", time: "8:30 PM", funnel: "Trust", days: [4], what: "a long X Article from our own playbook (post it with X's Articles button)" },
  { slot: "Shoutout", time: "10:45 PM", funnel: "Reach", days: [1, 3, 5], what: "credit to a bigger GTM creator for their best post this week, quoting it" },
];
const ARTICLE_TOPICS = [
  "How a seed-stage founder gets 10 buyer conversations a week from X",
  "How to find founders the week they raise (the searches, the checks, the first DM)",
  "Founder-led GTM for funded B2B startups: posts, replies and DMs as one system",
  "What 3 startups that sell GTM do on X that works, and what doesn't",
];
const OUR_FACTS = "Facts you may use (all true): Reyansh is 20 and runs SOVE7GN, a done-for-you GTM agency for funded B2B founders (seed to Series C): founder posts on X and LinkedIn, replies under posts buyers read, DMs to everyone who engages, booked calls. " +
  "His own CRM finds about 40 founders a day on X who just raised, launched or posted a GTM job, scores fit 1 to 10, checks why-now and warmth, and sends the top 30 a DM. He uses 3 DM scripts: a pitch, asking for advice, and giving 3 free ideas first. " +
  "First DMs are 3 lines: one true thing (congrats on the raise), one thing he noticed about how they get customers, one easy question; the call link comes in message 3. " +
  "He posts 3+ times a day on X: founders-to-watch lists that tag founders, trust posts with real numbers, and 'comment a word and I'll DM you' posts. He leaves 30 replies a day under posts by GTM creators and his leads, in the first hour. " +
  "He studied 3 GTM startups on X: the one founder who wins gets about 1,400 views a post (Reyansh was getting about 35) using screenshots of real moments, comment-to-get posts, short unpolished posts and free work in public; another founder only posts on LinkedIn; another pays bigger accounts to post about them. " +
  "Checks for a founder ready to buy GTM help: raised in the last 6 months, still posting the GTM job themselves, no marketing or SDR hire, posting on X less than weekly, launch post under 50 likes. " +
  "X searches: \"raised\" \"seed\" min_faves:20; \"founding AE\" OR \"first GTM hire\"; \"(YC F26)\" \"launching\"; from:competitor min_faves:50; to:big account in your space. " +
  "Never invent client results, revenue or follower numbers.";
const isPlaceholder = (t: string) => String(t || "").startsWith(PLACEHOLDER);
async function dailyPosts(force = false) {
  const now = new Date(), x = new Date(now.getTime() + 330 * 60e3);
  const dateOf = (d: Date) => d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear();
  const weekOf = (d: Date) => "W" + (Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2026, 10, 2)) / (7 * 864e5)) + 1);
  const date = dateOf(x), dow = x.getUTCDay();
  const { data: op } = await db.from("crm_sheet").select("row,cells").eq("tab", "Our Posts").gte("row", 4);
  const rows = op ?? [];
  const find = (d: string, slot: string) => rows.find((r) => r.cells?.[1] === d && r.cells?.[27] === slot && r.cells?.[14] !== "Deleted");
  const usedTags = new Set(rows.flatMap((r) => [...String(r.cells?.[9] ?? "").matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase())));
  let next = Math.max(3, ...rows.map((r) => r.row)) + 1;
  const cellsFor = (d: Date, s: typeof DAILY_SLOTS[0], text: string, extra: Record<number, string> = {}) => {
    const c = [weekOf(d), dateOf(d), s.time, ACCOUNT, "X", s.slot === "AI tool" ? "AI discovery" : s.slot === "News" ? "News take" : s.slot === "Article" ? "X Article" : "Shoutout (tag a bigger creator)",
      "Written by the CRM", "", "", text, "", s.slot === "Article" ? "Article cover (X asks for one)" : "None", "", "", "To post", "", "", "", "", "", "", "", "", "", "Founders", "Yes", "", s.slot, s.funnel];
    for (const [k, v] of Object.entries(extra)) c[+k] = v;
    return c;
  };
  // 1. Placeholders for the next 7 days, so the week shows on the Calendar.
  let placed = 0;
  for (let k = 1; k <= 7; k++) {
    const d = new Date(x.getTime() + k * 864e5);
    for (const s of DAILY_SLOTS) {
      if (!s.days.includes(d.getUTCDay()) || find(dateOf(d), s.slot)) continue;
      const cells = cellsFor(d, s, PLACEHOLDER + (() => { const pd = new Date(d.getTime() - 864e5); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][pd.getUTCDay()] + " " + dateOf(pd).replace(/ \d{4}$/, ""); })() + " at 4:30 PM IST, the day before: " + s.what + ".)");
      const { error } = await db.from("crm_sheet").insert({ tab: "Our Posts", row: next++, cells }); if (!error) { placed++; rows.push({ row: next - 1, cells }); }
    }
  }
  // 2. (19 Nov, Reyansh) Posts are written the day before, like the other 3 posts, so he can schedule them: each run fills
  //    tomorrow, plus any of today's slots still ahead that are empty. The AI model (Composio invoke_llm) has a $5 a day budget that
  //    is often spent by the afternoon, so Exa (its own credits) writes the text when the model returns nothing.
  const slotAt = (d: Date, s: typeof DAILY_SLOTS[0]) => { const m = s.time.match(/(\d+):(\d+) (AM|PM)/)!; const h = (+m[1] % 12) + (m[3] === "PM" ? 12 : 0);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (h * 60 + +m[2]) * 60e3 - 330 * 60e3; };
  let added = 0; const slotsDone: string[] = [];
  for (const ahead of [1, 0]) {
    const tx = new Date(x.getTime() + ahead * 864e5);
    const r = await fillDay(tx, ahead === 0);
    added += r.added; slotsDone.push(...r.slots.map((z) => dateOf(tx).replace(/ \d{4}$/, "") + " " + z));
  }
  return { added, slots: slotsDone, placeholders: placed };

  async function fillDay(tx: Date, today: boolean) {
  const date = dateOf(tx), dow = tx.getUTCDay();
  const todays = DAILY_SLOTS.filter((s) => (s.days.includes(dow) || (force && !today && s.slot === "Shoutout")) && (!today || slotAt(tx, s) > now.getTime() + 20 * 60e3) &&
    (() => { const r = find(date, s.slot); return !r || isPlaceholder(r.cells?.[9]); })());
  const jobs: { s: typeof DAILY_SLOTS[0]; prompt: string; their?: string; link?: string; why: string; append?: string; q?: string }[] = [];
  const since = (h: number) => new Date(now.getTime() - h * 3600e3).toISOString();
  const exaPick = async (query: string, hours: number, schema: any, sys: string) => {
    const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
      body: JSON.stringify({ query, category: "news", numResults: 8, startPublishedDate: since(hours), outputSchema: schema, systemPrompt: sys }) });
    return r.ok ? (await r.json())?.output?.content : null;
  };
  for (const s of todays) {
    if (s.slot === "News") {
      const n = await exaPick("biggest AI and startup news today", 30, { type: "object", required: ["headline", "what", "who", "url"], properties: {
        headline: { type: "string", description: "The single biggest story of the last day that startup founders are talking about: a big AI launch, a big raise or acquisition, a big move by a known founder or company" },
        what: { type: "string", description: "3 to 5 plain facts: who, what, numbers, why founders care" }, who: { type: "string", description: "The product, company or person name people will search for" }, url: { type: "string" } } },
        "Pick one story only, from the last 24 hours. Use the search results as the source.");
      if (n?.headline) jobs.push({ s, q: n.headline, link: n.url || "", their: n.headline + "\n\n" + n.what, why: "News (TOFU): people search for " + (n.who || "this") + " today. Post within the hour. Source: " + (n.url || "search"),
        prompt: "Write an X post reacting to today's news. Name " + (n.who || "it") + " in the first line. Give Reyansh's take for startup founders: what it means for how they build, sell or get customers. News: " + n.headline + ". Facts: " + n.what + "\n" + TWIST_RULES + "\n" + POST_RULES });
    } else if (s.slot === "AI tool") {
      const t = await exaPick("new AI tool or AI agent launched this week for sales, marketing or founders", 96, { type: "object", required: ["tool", "what", "steps", "url"], properties: {
        tool: { type: "string", description: "Name of one new or newly updated AI tool, model feature or agent useful for a startup founder getting customers (sales, outreach, content, research)" },
        what: { type: "string", description: "What it does, in 2 plain sentences, facts only" }, steps: { type: "string", description: "3 short steps a founder could follow to use it for getting customers" }, url: { type: "string" } } },
        "Pick one tool launched or updated in the last few days. Prefer tools that are actually usable today. Use the search results as the source.");
      if (t?.tool) jobs.push({ s, q: t.tool + " " + t.what, link: t.url || "", their: t.tool + ": " + t.what, append: t.url ? "\n\n" + t.url : "", why: "AI discovery (TOFU): a new tool people are searching for, with a how-to they can save. Source: " + (t.url || "search"),
        prompt: "Write an X post about a new AI tool. Line 1: name " + t.tool + " and what it does for founders in under 120 characters. Then 3 short numbered steps for how a founder can use it to get customers. End with a short line asking if they have tried it. Tool facts: " + t.what + " Steps idea: " + t.steps + "\n" + POST_RULES.replace("under 500 characters", "under 600 characters") });
    } else if (s.slot === "Article") {
      const topic = ARTICLE_TOPICS[Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / (7 * 864e5)) % ARTICLE_TOPICS.length];
      jobs.push({ s, q: topic, their: topic, why: "X Article (MOFU): a long, saveable playbook. Bookmarks push it far, and it proves we know the work. Post it with X's Articles button, then share it with its first line.",
        prompt: "Write an X Article (long post) titled: \"" + topic + "\". 800 to 1,100 words. First line is the title, then a 2-line intro, then 4 to 6 sections with short headers in plain text, short paragraphs and numbered steps, written as Reyansh in first person. " +
          "End with: if you want this run for you, DM me \"GTM\". " + OUR_FACTS + " No em dashes, no hashtags, no emojis, no 'it's not X, it's Y'. Answer with the article text only." });
    } else if (s.slot === "Shoutout") {
      const { data: cand } = await db.from("crm_x_reply").select("url,author,name,post_text,likes,views,followers").eq("kind", "creator")
        .gte("created_at", since(48)).order("likes", { ascending: false, nullsFirst: false }).limit(30);
      let pick = (cand ?? []).filter((c) => String(c.post_text || "").length > 120 && (c.followers ?? 0) >= 3000).sort((a, b) => (usedTags.has(a.author.toLowerCase()) ? 1 : 0) - (usedTags.has(b.author.toLowerCase()) ? 1 : 0))[0];
      if (!pick) {   // (19 Nov) creator posts stopped coming in with twitterapi.io; the extension reads founders' posts, so credit the founder post that took off
        const { data: lp } = await db.from("crm_x_reply").select("url,author,name,post_text,likes,views,followers").eq("kind", "lead")
          .gte("created_at", since(48)).gte("likes", 100).order("likes", { ascending: false, nullsFirst: false }).limit(30);
        pick = (lp ?? []).filter((c) => String(c.post_text || "").length > 120 && !usedTags.has(String(c.author).toLowerCase()))[0];
      }
      if (pick) jobs.push({ s, q: "@" + pick.author + " " + String(pick.post_text).slice(0, 120), link: pick.url, their: pick.post_text, append: "\n\n" + pick.url, why: "Shoutout (TOFU): makes @" + pick.author + " look good in front of our followers, so they and their audience see us. The link at the end shows their post under ours.",
        prompt: "Write an X post that gives credit to @" + pick.author + " (" + pick.name + ") for this post of theirs:\n\"\"\"\n" + String(pick.post_text).slice(0, 1200) + "\n\"\"\"\n" +
          "Start with @" + pick.author + " and what they got right in one line. Then 2 or 3 short lines on why it matters for startup founders, or how Reyansh is applying it this week (no made-up results). End with a line that asks others to add to it. Do not include their link.\n" + POST_RULES });
    }
  }
  if (!jobs.length) return { added: 0, slots: [] as string[] };
  const texts = await llm(jobs.map((j) => j.prompt)).catch(() => jobs.map(() => ""));
  let added = 0;
  for (const [i, jb] of jobs.entries()) {
    let t = texts[i];
    if (!t) t = await exaWrite(jb.prompt, jb.q || jb.s.what).catch(() => "");
    if (!t || /^skip/i.test(t)) continue;
    t = t + (jb.append ?? "");
    const extra = { 7: jb.link || "", 8: jb.their || "", 10: jb.why };
    const have = find(date, jb.s.slot);
    if (have) {   // fill the placeholder in place (cells are 0-based here: 7 Their link, 8 Their post, 9 Our version, 10 What we changed)
      const c = [...(have.cells ?? [])]; while (c.length < 29) c.push("");
      c[7] = jb.link || ""; c[8] = jb.their || ""; c[9] = t; c[10] = jb.why;
      const { error } = await db.from("crm_sheet").update({ cells: c, updated_at: new Date().toISOString() }).eq("tab", "Our Posts").eq("row", have.row); if (error) continue;
    } else {
      const { error } = await db.from("crm_sheet").insert({ tab: "Our Posts", row: next++, cells: cellsFor(tx, jb.s, t, extra) }); if (error) continue;
    }
    added++;
  }
  return { added, slots: jobs.map((j) => j.s.slot) };
  }
}
// Exa writes the text when the AI model's daily budget is spent: a search on the topic with our writing prompt as its instructions.
async function exaWrite(prompt: string, query: string): Promise<string> {
  const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: clip(query, 200), numResults: 3, systemPrompt: clip(prompt, 6000),
      outputSchema: { type: "object", required: ["text"], properties: { text: { type: "string", description: "The finished text, written exactly as the instructions ask, ready to post. Short lines, with a blank line (two newline characters) between each line or block, like a real X post. Nothing else." } } } }) });
  if (!r.ok) return "";
  const t = String((await r.json())?.output?.content?.text ?? "").trim();
  return noDash(t.replace(/^"|"$/g, "").replace(/#\w+/g, "").trim());
}

// 5. Followers of our client's founders (16 Nov): people who follow Shreenabh (@ShreenabhA) and Karan (@karanwalia_ai) of Aktoria
//    (YC S26, our client). Each run reads the next 3 pages of their followers, keeps only founders and C-suite at funded B2B startups
//    (pre-seed to Series C, judged once), writes their 3 ideas ahead (sent as X follow-up 1), and adds them to the DM Pipeline, where
//    they wait in X > Pipeline > To approve. Opener: they follow Shreenabh / Karan, and 3 quick ideas on offer. Never a pitch first.
//    Settings and progress: crm_lead_settings "x_follow_src".
const FOLLOW_SRC_DEFAULT = { client: "Aktoria", client_note: "Aktoria (YC S26), one of the founders we work with", accounts: { ShreenabhA: { name: "Shreenabh" }, karanwalia_ai: { name: "Karan" } } as Record<string, any> };
// (16 Nov) Competitors (CRM > Competitors, setting "competitors"): their company and founders' X accounts. Their audience is our ICP,
// so the extension reads their posts, the replies under their busiest posts and their followers; fits go to X > Pipeline > To approve
// with our own value-first opener (the competitor is never mentioned). Everyone judged is listed on the Competitors page.
async function compAccounts(): Promise<Record<string, any>> {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "competitors").maybeSingle();
  const out: Record<string, any> = {};
  for (const c of (((data?.value as any) ?? []) as any[])) { if (c.archived) continue;
    for (const h of [c.x, ...((c.founders ?? []) as any[]).map((f) => f.x)]) { const k = String(h ?? "").replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//, "").replace(/[/?].*$/, "").trim();
      if (/^\w{1,15}$/.test(k)) out[k] = { name: c.name, comp: c.name, ...(c.followers === false ? { dom_done: "not read: posts and replies only" } : {}) }; } }
  return out;
}
async function compAudienceSave(rows: any[]) {
  if (!rows.length) return;
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "comp_audience").maybeSingle();
  const have: any[] = Array.isArray(data?.value) ? (data!.value as any[]) : []; const seen = new Set(rows.map((r) => r.handle));
  const old = new Map(have.map((r) => [r.handle, r]));   // Reyansh's choices (trash, sent to LinkedIn/X) and the bot's research stay
  const keep = (r: any) => { const o: any = old.get(r.handle); if (!o) return r; const k: any = {};
    for (const f of ["sent_li", "sent_x", "lead_id", "linkedin", "yc", "funding", "country", "one_liner", "err"]) if (o[f] != null) k[f] = o[f];
    if (["trash", "sent"].includes(o.status)) k.status = o.status; return { ...r, ...k }; };
  await db.from("crm_lead_settings").upsert({ key: "comp_audience", value: [...rows.map(keep), ...have.filter((r) => !seen.has(r.handle))].slice(0, 600) }, { onConflict: "key" });
}
const F_FOUNDER = /(co-?founder|founder|\bceo\b|\bcto\b|\bcoo\b|\bcmo\b|\bcro\b|chief|building @|founding)/i;
const F_NOT = /(crypto|web3|defi|nft|onchain|blockchain|\bvc\b|venture|investor|investing|angel|\bfund\b|capital|partner at|recruit|talent|hiring manager|student|intern|looking for (a )?(job|role)|open to work|journalist|reporter|newsletter|podcast|ghostwrit|clipping|agency|lead gen|outbound for|we help (startups|founders|b2b)|growth studio|marketing studio)/i;
async function followSource(maxAdd = 10, given?: any[]) {
  const t0 = Date.now();   // Supabase stops a run at 150 s: judging stops at 75 s so there is time to write ideas and save
  const { data: st } = await db.from("crm_lead_settings").select("value").eq("key", "x_follow_src").maybeSingle();
  const cfg: any = { ...FOLLOW_SRC_DEFAULT, ...(st?.value ?? {}) };
  for (const h of Object.keys(FOLLOW_SRC_DEFAULT.accounts)) cfg.accounts[h] = { ...FOLLOW_SRC_DEFAULT.accounts[h], ...(cfg.accounts?.[h] ?? {}) };
  if (given) for (const [h, a] of Object.entries(await compAccounts().catch(() => ({})))) cfg.accounts[h] = { ...a, ...(cfg.accounts?.[h] ?? {}) };
  // 1. Next pages of followers (3 pages of 200 per account per run), skipping accounts already read to the end.
  const people = new Map<string, any>();
  for (const f of given ?? []) { const h = String(f.userName || ""); if (h && !people.has(h.toLowerCase())) people.set(h.toLowerCase(), f); }
  for (const [acc, a] of Object.entries<any>(cfg.accounts)) {
    if (given || a.done) continue;
    for (let p = 0; p < 2; p++) {
      const j = await tw("/twitter/user/followers?userName=" + acc + "&pageSize=200&cursor=" + encodeURIComponent(a.cursor || ""));
      for (const f of j.followers ?? []) { const h = String(f.userName || f.screen_name || ""); if (h && !people.has(h.toLowerCase())) people.set(h.toLowerCase(), { ...f, _via: acc }); }
      a.read = (a.read ?? 0) + (j.followers ?? []).length;
      if (!j.has_next_page || !j.next_cursor) { a.done = true; a.cursor = ""; break; }
      a.cursor = j.next_cursor;
    }
  }
  // 2. Cheap checks, then skip anyone already judged or already in the pipeline.
  const { data: pl } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Pipeline").gte("row", 4);
  const inPipe = new Set((pl ?? []).map((r) => String(r.cells?.[10] || "").replace(/^@/, "").toLowerCase()).filter(Boolean));
  const hs = [...people.keys()];
  const seen = new Set<string>();
  for (let i = 0; i < hs.length; i += 300) { const { data } = await db.from("crm_x_people").select("handle").in("handle", hs.slice(i, i + 300)).not("judged_at", "is", null); for (const r of data ?? []) seen.add(r.handle); }
  const cands = [...people.values()].filter((f) => { const h = String(f.userName || f.screen_name).toLowerCase(), bio = String(f.description || "");
    return h !== HANDLE.toLowerCase() && !Object.keys(cfg.accounts).some((a) => a.toLowerCase() === h) && !inPipe.has(h) && !seen.has(h) && f.can_dm !== false &&
      (f.followers_count == null || ((f.followers_count ?? 0) >= 40 && (f.followers_count ?? 0) <= 200000)) && !F_NOT.test(bio) &&
      (F_FOUNDER.test(bio) || (!bio && (f._via === "search" || String(f._via).startsWith("comp:")) && /\b(we|our|we're|i'm building|my startup)\b/i.test(String(f._ctx || "")))); });   // raise/launch posts from a search come without a bio
  // 3. Judge (Exa through exaFetch): only founders / C-suite at funded B2B startups, pre-seed to Series C, count.
  const schema = { type: "object", required: ["fit", "why", "company", "role", "what", "stage"], properties: {
    fit: { type: "string", enum: ["Core buyer", "Good fit", "Not a buyer"], description: "Core buyer = founder, co-founder or C-suite (CEO, CTO, COO, CMO, CRO) at a B2B or B2B2C software or deep tech startup that has raised pre-seed, seed, Series A, B or C (or is in YC or a top accelerator), roughly 2 to 100 people. Good fit = startup founder but not clearly funded or not B2B. Not a buyer = everyone else: investors, agencies, consultants, students, job seekers, big-company employees, consumer apps, crypto." },
    why: { type: "string", description: "One plain sentence: who they are and the evidence for the verdict" }, company: { type: "string" }, role: { type: "string" },
    what: { type: "string", description: "What the company builds, in one short sentence" }, stage: { type: "string", description: "Latest known round and when, e.g. 'Seed, $4M, Oct 2026' or 'YC S26', or 'unknown'" } } };
  const judged: any[] = []; let cost = 0;
  // people who passed the bio check last time but weren't judged yet go first; the rest wait for the next run
  const slim = (f: any) => ({ userName: f.userName || f.screen_name, name: f.name, description: f.description, followers_count: f.followers_count, id: f.id, can_dm: f.can_dm, _via: f._via, _ctx: f._ctx, _url: f._url });
  const queue = [...(cfg.queue ?? []).filter((q: any) => !seen.has(String(q.userName).toLowerCase()) && !inPipe.has(String(q.userName).toLowerCase())), ...cands.map(slim)];
  const batchList = queue.slice(0, 24);
  let judgedN = 0;
  for (let i = 0; i < batchList.length && Date.now() - t0 < 75e3; i += 6) {
    judgedN = i + 6;
    const out = await Promise.all(batchList.slice(i, i + 6).map(async (f) => {
      const bio = String(f.description || ""), at = (bio.match(/@([A-Za-z0-9_]{2,15})/) || [])[1] || "";
      const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
        body: JSON.stringify({ query: (at ? at + " " : "") + (bio ? clip(bio, 120) : f.name + " " + clip(String(f._ctx || ""), 150)) + " startup funding", numResults: 4, outputSchema: schema,
          systemPrompt: "Is this person a founder or C-suite at a funded B2B startup? " + f.name + " (@" + (f.userName || f.screen_name) + ")" + (f.followers_count != null ? ", " + f.followers_count + " followers on X" : "") +
            (bio ? ", bio: \"" + clip(bio, 250) + "\"" : "") + (f._ctx ? ". Their recent X post: \"" + clip(String(f._ctx), 300) + "\"" : "") + ". Use the search results to find their company and its funding. Only facts from the results." }) }).catch(() => null);
      const j = r && r.ok ? await r.json() : null; cost += j?.costDollars?.total ?? 0;
      return { f, o: j?.output?.content ?? null };
    }));
    judged.push(...out);
  }
  cfg.queue = queue.slice(Math.min(judgedN, batchList.length), 400);   // the ones not judged in time wait for the next run
  // (17 Nov) People from a competitor's audience wait on CRM > Competitors > Leads for Reyansh to send them to LinkedIn or X (or trash them).
  const fromComp = (x: any) => String(x.f._via).startsWith("comp:") || !!cfg.accounts[x.f._via]?.comp;
  // (19 Nov) the company must be named in their own bio or the post that surfaced them: the judge once matched a bio to a company he never worked at
  const ckey = (t: string) => String(t || "").toLowerCase().replace(/\(.*?\)|\b(inc|labs?|ai|hq|co|technologies|the)\b/g, "").replace(/[^a-z0-9]/g, "");
  const ownWords = (x: any) => { const k = ckey(x.o?.company || "").slice(0, 12); return k.length >= 3 && ckey(String(x.f.description || "") + " " + String(x.f._ctx || "") + " " + String(x.f.name || "")).includes(k); };
  const fits = judged.filter((x) => x.o?.fit === "Core buyer" && !fromComp(x) && !/^unknown$/i.test(String(x.o.stage || "").trim()) && ownWords(x)).slice(0, maxAdd);
  // 4. Their 3 ideas, written ahead (X follow-up 1 sends them).
  const tips = fits.length ? await llm(fits.map((x) => "Write 3 short, specific ideas for how " + (x.o.company || "this startup") + " could get more inbound from X and LinkedIn, for its founder " + x.f.name + ". " +
    "What they build: " + x.o.what + ". Their X bio: \"" + clip(String(x.f.description || ""), 200) + "\". Each idea is one numbered line (1., 2., 3.), under 200 characters, concrete (a post format, a list to tag, a reply habit, a profile fix), " +
    "written to the founder as 'you'. No pitch, no links, no em dashes, no hashtags. Answer with the 3 lines only.")).catch(() => []) : [];
  // 5. Save: everyone judged (so nobody is paid for twice), then the fits into the DM Pipeline.
  const nowIso = new Date().toISOString();
  const rowsX = judged.map((x, i) => { const fi = fits.indexOf(x); return { handle: String(x.f.userName || x.f.screen_name).toLowerCase(), name: x.f.name || "", bio: clip(String(x.f.description || ""), 300),
    followers: x.f.followers_count ?? null, fit: x.o?.fit === "Core buyer" ? "hot" : x.o?.fit === "Good fit" ? "warm" : "not a fit", why: noDash(x.o?.why || "Could not judge"), role: x.o?.role || "", company: x.o?.company || "",
    company_what: x.o?.what || "", company_stage: x.o?.stage || "", found_by: x.f._via === "search" ? "x-search" : "follows:" + x.f._via, added: fi >= 0, judged_at: nowIso, tips: fi >= 0 ? noDash(String(tips[fi] || "")) : "" }; });
  if (rowsX.length) await db.from("crm_x_people").upsert(rowsX, { onConflict: "handle" });
  const compRows = judged.filter((x) => String(x.f._via).startsWith("comp:") || cfg.accounts[x.f._via]?.comp).map((x) => ({ handle: String(x.f.userName || x.f.screen_name).toLowerCase(), name: x.f.name || "",
    comp: String(x.f._via).startsWith("comp:") ? String(x.f._via).slice(5) : cfg.accounts[x.f._via]?.comp, how: String(x.f._via).startsWith("comp:") ? "replied" : "follows", text: clip(String(x.f._ctx || x.f.description || ""), 240),
    url: x.f._url || "", fit: x.o?.fit || "Not judged", why: noDash(x.o?.why || ""), company: x.o?.company || "", role: x.o?.role || "", stage: x.o?.stage || "", what: clip(String(x.o?.what || ""), 200), bio: clip(String(x.f.description || ""), 200), followers: x.f.followers_count ?? null,
    status: x.o?.fit === "Core buyer" ? "fit" : "not", at: new Date().toISOString() }));
  await compAudienceSave(compRows).catch(() => {});
  let next = Math.max(3, ...(pl ?? []).map((r) => r.row)) + 1; const writes: any[] = []; const added: string[] = [];
  for (const [i, x] of fits.entries()) {
    if (!String(tips[i] || "").trim()) continue;   // the ideas must exist before we offer them
    const h = String(x.f.userName || x.f.screen_name), first = String(x.f.name || h).trim().split(/\s+/)[0], co = x.o.company && !/^unknown$/i.test(x.o.company) ? x.o.company : "your company";
    const via = cfg.accounts[x.f._via]?.name || x.f._via, fromSearch = x.f._via === "search";
    const compName = String(x.f._via).startsWith("comp:") ? String(x.f._via).slice(5) : cfg.accounts[x.f._via]?.comp || "";
    const round = String(x.o.stage || "").split(",")[0].trim();
    // (16 Nov) found through a raise / launch post: the opener is about their post; otherwise about following our client's founder
    const opener = compName ? "Hey " + first + ", had a look at what you're building at " + co + " and I have 3 quick ideas that could lift your inbound on X, want me to send them over?" : fromSearch ? "Hey " + first + ", saw your post about " + co + (round && !/unknown/i.test(round) ? ", congrats on the " + round.replace(/^(pre-?seed|seed|series [a-c])$/i, (m) => m.toLowerCase().replace(/^series/, "Series")) : "") + ". I have 3 quick ideas that could lift your inbound on X, want me to send them over?"
      : "Hey " + first + ", saw you follow " + via + " from " + cfg.client_note + ". Had a look at what you're building at " + co + " and I have 3 quick ideas that could lift your inbound on X, want me to send them over?";
    const row = next++;
    writes.push({ row, col: 3, values: [[x.f.name || h, co, x.o.role || "Founder", ACCOUNT, "X DM", fromSearch || compName ? "Cold" : "Warm", compName ? (String(x.f._via).startsWith("comp:") ? "Engages with " : "Follows ") + compName : fromSearch ? "Raised recently" : "Follows " + cfg.client, "9", h, "", "",
      compName ? (String(x.f._via).startsWith("comp:") ? "Replied to " + compName + " (competitor): " + clip(String(x.f._ctx || ""), 150) : "Follows @" + x.f._via + " (" + compName + ", a competitor). " + clip(String(x.o.what || ""), 120)) : fromSearch ? "Posted on X: " + clip(String(x.f._ctx || ""), 170) : "Follows @" + x.f._via + " (" + cfg.client + ", our client). " + clip(String(x.o.what || ""), 140), fromSearch ? (x.f._url || "https://x.com/" + h) : "https://x.com/" + h, istStamp(new Date()), "C1", opener, "To send", ""]] });
    writes.push({ row, col: 28, values: [["Added by x-grow (" + (fromSearch ? "raise / launch post read from your X tab" : "followers of @" + x.f._via) + ") on " + istStamp(new Date()) + ". " + noDash(x.o.why || "") + (x.f.description ? " Bio: " + clip(String(x.f.description || ""), 160) : "")]] });
    writes.push({ row, col: 35, values: [[x.o.stage || ""]] });
    if (x.f.id) writes.push({ row, col: 38, values: [[String(x.f.id)]] });
    added.push(x.f.name + " (@" + h + ")");
  }
  if (writes.length) { const { data: res, error } = await db.rpc("crm_call", { body: { action: "rows", writes } }); if (error || !String(res).startsWith("ok")) throw new Error("Saving follower leads failed: " + (error?.message ?? res)); }
  await db.from("crm_lead_settings").upsert({ key: "x_follow_src", value: { ...cfg, last: nowIso, last_result: { read: people.size, checked: cands.length, judged: judged.length, added: added.length } } }, { onConflict: "key" });
  return { read: people.size, passed_bio_check: cands.length, waiting: (cfg.queue ?? []).length, judged: judged.length, added: added.length, people: added, cost_exa: Math.round(cost * 1000) / 1000 };
}

// 6. Reading X through Reyansh's own signed-in X tab (16 Nov). twitterapi.io ran out of credits and Exa no longer indexes x.com
//    (0 results for x.com posts, no tweet category; its "people" search returns LinkedIn profiles, which we use to judge ICP).
//    So the Chrome extension reads X itself: every few minutes it asks read_plan for one job, opens that X page in its own tab
//    (a search, a followers list), scrapes what X shows, and posts it back to read_done. Jobs:
//      replies:      fresh posts by ICP people (DM Pipeline founders + people judged Core buyer), every 20 minutes. They get a
//                    reply draft and are approved straight away (Reyansh chose full automation); the extension posts them.
//      leads:        raise / launch / GTM-hiring posts from the last week, every 3 hours -> ICP judge -> X > Pipeline > To approve.
//      my_followers: our newest followers, every 6 hours -> judged -> Engaged (+ an automatic DM for Core buyers).
//      follow_src:   followers of our client's founders (@ShreenabhA, @karanwalia_ai), until read to the end.
const READ_EVERY: Record<string, number> = { replies: 20, my_followers: 60, leads: 180, follow_src: 60, our_posts: 120, comp_posts: 60, comp_replies: 90 };
const LEAD_QUERIES = [
  '("we raised" OR "just raised" OR "excited to announce" OR "thrilled to announce") ("seed round" OR "pre-seed" OR "Series A" OR "Series B") -filter:replies min_faves:5',
  '("launching today" OR "we\'re live" OR "just launched") ("YC" OR "Y Combinator" OR "(F26)" OR "(W26)" OR "(S26)") -filter:replies min_faves:5',
  '("hiring" OR "we\'re hiring") ("founding GTM" OR "first GTM" OR "founding AE" OR "first marketer" OR "head of growth") -filter:replies',
  '("closed our" OR "raised a $" OR "led by") ("seed" OR "Series A") (B2B OR SaaS OR AI OR agents) -filter:replies min_faves:5',
  '("YC F26" OR "YC S26" OR "YC W26" OR "(F26)" OR "(S26)") (founder OR "we\'re building" OR "we built" OR customers) -filter:replies',
  '("pre-seed" OR "seed round") ("we\'re hiring" OR "our first customers" OR "founding team") (B2B OR SaaS OR AI) -filter:replies',
];
async function icpHandles(): Promise<string[]> {
  const { data: pl } = await db.from("crm_sheet").select("cells").eq("tab", "DM Pipeline").gte("row", 4);
  const a = (pl ?? []).filter((r) => !/do not contact|not now|customer/i.test(String(r.cells?.[18] || ""))).map((r) => String(r.cells?.[10] || "").replace(/^@/, "").trim());
  const { data: xp } = await db.from("crm_x_people").select("handle").eq("fit", "hot").limit(1000);
  const { data: pe } = await db.from("crm_sheet").select("cells").eq("tab", "Post Engagers").gte("row", 4);
  const eng = (pe ?? []).filter((r) => r.cells?.[12] === "Core buyer").map((r) => String(r.cells?.[5] || ""));
  return [...new Set([...a, ...(xp ?? []).map((r) => r.handle), ...eng].map((h) => h.toLowerCase()).filter((h) => /^\w{2,15}$/.test(h) && h !== HANDLE.toLowerCase()))];
}
const searchUrl = (q: string) => "https://x.com/search?q=" + encodeURIComponent(q) + "&src=typed_query&f=live";
// (16 Nov) Our posts' numbers (views, likes, replies) and our follower count, read off our profile by the extension, saved the way
// the tracker always saved them (Post Tracking snapshots + the matching Our Posts rows), so Post metrics and the 10K line stay live.
const istDate2 = (d: Date) => { const x = new Date(d.getTime() + 330 * 60e3); return x.getUTCDate() + " " + MON[x.getUTCMonth()] + " " + x.getUTCFullYear(); };
const istTime2 = (d: Date) => { const x = new Date(d.getTime() + 330 * 60e3), H = x.getUTCHours(), M = x.getUTCMinutes(); return ((H % 12) || 12) + ":" + String(M).padStart(2, "0") + " " + (H < 12 ? "AM" : "PM"); };
const snipKey2 = (s: string) => String(s || "").replace(/https?:\/\/\S+/g, "").replace(/@\w+/g, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
const dbSnip2 = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
async function ourPostsDone(items: any[]) {
  const fol = items.find((i) => i && i._followers); const followers = fol ? num(fol._followers) : null;
  const posts = items.filter((i) => i && i.url && String(i.handle || "").toLowerCase() === HANDLE.toLowerCase() && !i.reply && Date.now() - (Date.parse(i.time || "") || 0) < 14 * 864e5);
  const { data: op } = await db.from("crm_sheet").select("row,cells").eq("tab", "Our Posts").gte("row", 4).order("row");
  const drafts = (op ?? []).filter((r: any) => (r.cells?.[3] || "") === ACCOUNT && !/linkedin/i.test(r.cells?.[4] || ""));
  const used = new Set<number>(); const trackPosts: any[] = [], newPosts: any[] = [], snapshots: any[] = []; const now = new Date();
  for (const t of posts) {
    const L = String(t.url).split("?")[0];
    let row = drafts.find((r: any) => String(r.cells?.[16] || "").toLowerCase().split("?")[0] === L.toLowerCase());
    if (!row) row = drafts.find((r: any) => !r.cells?.[16] && !used.has(r.row) && snipKey2(r.cells?.[9]) && snipKey2(r.cells?.[9]) === snipKey2(t.text));
    const nums = { views: num(t.views) ?? "", likes: num(t.likes) ?? 0, replies: num(t.replies) ?? 0, reposts: 0, quotes: 0, bookmarks: 0 };
    if (row) { used.add(row.row); trackPosts.push({ row: row.row, link: L, snippet: dbSnip2(row.cells?.[9]), ...nums }); }
    else { const d = new Date(t.time || now);
      newPosts.push(["", istDate2(d), istTime2(d), ACCOUNT, "X", "", "Our own", "", "", t.text || "", "Posted straight on X", "", "", "", "Posted", "", L,
        String(nums.views), String(nums.likes), String(nums.replies), "0", "0", "0", "", "", "", "", ""]); }
    snapshots.push([istStamp(now), ACCOUNT, L, String(nums.views), String(nums.likes), String(nums.replies), "0", "0", "0", followers != null ? String(followers) : ""]);
  }
  if (!posts.length && followers != null) snapshots.push([istStamp(now), ACCOUNT, "https://x.com/" + HANDLE, "", "", "", "", "", "", String(followers)]);
  const { data: res, error } = await db.rpc("crm_call", { body: { action: "track", posts: trackPosts, snapshots, newPosts, engagers: [] } });
  if (error) throw error;
  await db.from("crm_sync_runs").insert({ platform: "x", started_at: now.toISOString(), finished_at: new Date().toISOString(), ok: true, summary: { our_posts: posts.length, followers, matched: trackPosts.length, new_posts: newPosts.length } }).then(() => {}, () => {});
  return { ok: true, posts: posts.length, followers, result: String(res ?? "") };
}

// (17 Nov, Reyansh) The bots work when SF / US / Canada are awake: hours, daily caps and weekends run on US Pacific time (DST aware).
function ptParts(t = Date.now()) {
  const o: Record<string, string> = {}; for (const p of new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(new Date(t))) o[p.type] = p.value;
  const h = +o.hour % 24, offMs = Date.UTC(+o.year, +o.month - 1, +o.day, h, +o.minute) - Math.floor(t / 60e3) * 60e3;
  return { hour: h + +o.minute / 60, weekend: o.weekday === "Sat" || o.weekday === "Sun", dayStartIso: new Date(Date.UTC(+o.year, +o.month - 1, +o.day) - offMs).toISOString() };
}
const ptHour = () => ptParts().hour, ptDayStart = () => ptParts().dayStartIso;
async function readPlan(b: any) {
  const { data: st } = await db.from("crm_lead_settings").select("value").eq("key", "x_read").maybeSingle();
  const s: any = st?.value ?? {}; s.at = s.at ?? {}; const now = Date.now();
  // (16 Nov) 30 replies on ICP posts a day: compare what's posted + queued with the pace for this hour (IST day)
  // (17 Nov) paced over the US Pacific working day (8:00 to 21:00 PT), when our buyers are online
  const pt = ptParts(now), dayStart = pt.dayStartIso, hr = pt.hour;
  const { count: doneToday } = await db.from("crm_x_reply").select("url", { count: "exact", head: true }).eq("status", "done").eq("done_by", "x bot").gte("done_at", dayStart);
  const { count: queued } = await db.from("crm_x_reply").select("url", { count: "exact", head: true }).in("status", ["approved", "sending"]);
  const have = (doneToday ?? 0) + (queued ?? 0), pace = Math.ceil(30 * Math.min(1, Math.max(0, hr - 8 + 2) / 13));
  const behind = have < pace;
  const every: Record<string, number> = { ...READ_EVERY, ...(behind ? { replies: 10, leads: 90, follow_src: 30 } : {}) };
  const due = (k: string) => now - (Date.parse(s.at[k] ?? "") || 0) > every[k] * 60e3;
  if (hr >= 18) {   // after 18:00 PT: can we still reach 30? one reply per 15+ minutes until 21:00 PT
    const canStill = (doneToday ?? 0) + Math.min(queued ?? 0, Math.floor(Math.max(0, 21 - hr) * 60 / 15));
    const { data: xb } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle();
    const cool = Date.parse((xb?.value as any)?.cooldown_until ?? "") > now;
    const reason = canStill >= 30 ? null : cool ? "X asked us to slow down (cooldown until " + String((xb?.value as any)?.cooldown_until).slice(0, 16).replace("T", " ") + " UTC), so replies are paused"
      : (queued ?? 0) === 0 ? "Ran out of fresh posts by ICP founders today: " + (doneToday ?? 0) + " replies posted, nothing left to reply to. The reader is widening (more raise/launch and YC searches, followers of our client's founders)"
      : "Not enough time left: " + (doneToday ?? 0) + " posted and " + (queued ?? 0) + " queued, but only " + Math.floor(Math.max(0, 21 - hr) * 60 / 15) + " more fit before midnight at 15+ minutes apart";
    const { data: bs } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot_status").maybeSingle();
    await db.from("crm_lead_settings").upsert({ key: "x_bot_status", value: { ...((bs?.value as any) ?? {}), reply_short_reason: reason, reply_short_at: reason ? new Date().toISOString() : null } }, { onConflict: "key" });
  }
  let job: any = null;
  // (22 Nov, Reyansh) X replies are done by Instinct now: while x_bot.replies_paused is on, the extension stops searching for posts to reply to.
  const { data: xbr } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle();
  const repliesOff = !!(xbr?.value as any)?.replies_paused;
  // (16 Nov) our own posts and follower count, every 2 hours, off our profile page (the old X data service is off)
  if (due("our_posts")) job = { kind: "our_posts", url: "https://x.com/" + HANDLE, scrolls: 6 };
  if (!job && !repliesOff && due("replies")) {
    const hs = await icpHandles(); const per = 14, chunks = Math.max(1, Math.ceil(hs.length / per)); const i = (s.reply_turn ?? 0) % chunks;
    const part = hs.slice(i * per, i * per + per);
    if (part.length) { job = { kind: "replies", url: searchUrl("(" + part.map((h) => "from:" + h).join(" OR ") + ") -filter:replies -filter:retweets"), scrolls: 3 }; s.reply_turn = i + 1; }
  }
  if (!job && due("my_followers")) job = { kind: "my_followers", url: "https://x.com/" + HANDLE + "/followers", scrolls: 3 };
  if (!job && due("leads")) { const i = (s.lead_turn ?? 0) % LEAD_QUERIES.length; const since = new Date(now - 7 * 864e5).toISOString().slice(0, 10);
    job = { kind: "leads", url: searchUrl(LEAD_QUERIES[i] + " since:" + since), scrolls: 4 }; s.lead_turn = i + 1; }
  if (!job && due("comp_posts")) { const ca = Object.keys(await compAccounts().catch(() => ({})));
    if (ca.length) { const i = (s.comp_turn ?? 0) % ca.length; job = { kind: "comp_posts", url: "https://x.com/" + ca[i], scrolls: 3, via: ca[i] }; s.comp_turn = i + 1; } }
  if (!job && due("comp_replies")) {
    const { data: cp } = await db.from("crm_lead_settings").select("value").eq("key", "comp_posts").maybeSingle(); const read = new Set<string>(s.comp_read ?? []);
    const best = (((cp?.value as any) ?? []) as any[]).filter((p) => !read.has(p.url) && Date.now() - Date.parse(p.time || "") < 7 * 864e5 && (num(p.replies) ?? 0) >= 3).sort((a, b) => (num(b.replies) ?? 0) - (num(a.replies) ?? 0))[0];
    if (best) { job = { kind: "comp_replies", url: best.url, scrolls: 5, via: best.comp }; s.comp_read = [best.url, ...(s.comp_read ?? [])].slice(0, 300); } }
  if (!job && due("follow_src")) {
    const { data: fs } = await db.from("crm_lead_settings").select("value").eq("key", "x_follow_src").maybeSingle();
    const acc = Object.entries<any>({ ...FOLLOW_SRC_DEFAULT.accounts, ...(await compAccounts().catch(() => ({}))), ...((fs?.value as any)?.accounts ?? {}) }).find(([, a]) => !a.dom_done);
    if (acc) job = { kind: "follow_src", url: "https://x.com/" + acc[0] + "/followers", scrolls: 150, via: acc[0] };
  }
  if (job) { s.at[job.kind] = new Date().toISOString(); await db.from("crm_lead_settings").upsert({ key: "x_read", value: s }, { onConflict: "key" }); }
  return { job };
}
const num = (v: any) => { const m = String(v ?? "").replace(/,/g, "").match(/([\d.]+)\s*([KkMm])?/); if (!m) return null; return Math.round(+m[1] * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1)); };
async function readDone(b: any) {
  const job = b.job ?? {}, items: any[] = Array.isArray(b.items) ? b.items.slice(0, 400) : [];
  if (job.kind === "our_posts") return await ourPostsDone(items);
  if (job.kind === "comp_posts") {
    const ca = await compAccounts().catch(() => ({} as Record<string, any>)); const comp = ca[job.via]?.comp || job.via;
    const posts = items.filter((p) => p.url && String(p.handle).toLowerCase() === String(job.via).toLowerCase() && !p.reply).map((p) => ({ url: p.url, handle: p.handle, comp, text: String(p.text || "").slice(0, 1500),
      time: p.time, likes: p.likes, replies: p.replies, views: p.views, reposts: p.reposts ?? null, seen: new Date().toISOString() }));
    const { data } = await db.from("crm_lead_settings").select("value").eq("key", "comp_posts").maybeSingle();
    const have: any[] = Array.isArray(data?.value) ? (data!.value as any[]) : []; const urls = new Set(posts.map((p) => p.url));
    const all = [...posts, ...have.filter((p) => !urls.has(p.url))].sort((a, b) => Date.parse(b.time || "") - Date.parse(a.time || "")).slice(0, 500);
    await db.from("crm_lead_settings").upsert({ key: "comp_posts", value: all }, { onConflict: "key" });
    return { found: items.length, posts: posts.length };
  }
  if (job.kind === "comp_replies") {
    const author = String((String(job.url).match(/x\.com\/(\w{1,15})\/status/) || [])[1] || "").toLowerCase();
    const ca = await compAccounts().catch(() => ({} as Record<string, any>)); const compH = new Set(Object.keys(ca).map((h) => h.toLowerCase()));
    const people = items.filter((u) => u.handle && String(u.handle).toLowerCase() !== author && !compH.has(String(u.handle).toLowerCase()) && String(u.handle).toLowerCase() !== HANDLE.toLowerCase())
      .map((u) => ({ userName: u.handle, name: u.name || u.handle, description: "", followers_count: null, id: null, can_dm: true, _via: "comp:" + (job.via || author), _ctx: u.text || "", _url: u.url || "" }));
    return await followSource(10, people);
  }
  if (job.kind === "replies") {
    const icp = new Set(await icpHandles()); const now = Date.now();
    const posts = items.filter((p) => p.url && p.handle && icp.has(String(p.handle).toLowerCase()) && !p.reply && p.time && now - Date.parse(p.time) < 6 * 3600e3 && String(p.text || "").trim().length > 15);
    if (!posts.length) return { found: items.length, new: 0 };
    const { data: have } = await db.from("crm_x_reply").select("url").in("url", posts.map((p) => p.url));
    const known = new Set((have ?? []).map((r) => r.url));
    const fresh = posts.filter((p) => !known.has(p.url)).map((p) => ({ url: p.url, author: p.handle, name: p.name || "", followers: null, kind: "lead", post_text: String(p.text).slice(0, 2000),
      posted_at: new Date(p.time).toISOString(), views: num(p.views), likes: num(p.likes), replies: num(p.replies), draft: "", status: "new" as string }));
    if (!fresh.length) return { found: items.length, new: 0 };
    const d = COMPOSIO ? await draftReplies(fresh).catch(() => ({} as Record<string, string>)) : {};
    fresh.forEach((r, i) => { r.draft = noDash(d[String(i)] || ""); if (r.draft) r.status = "approved"; });   // full automation: ICP + a draft = approved
    const { error } = await db.from("crm_x_reply").insert(fresh); if (error) throw error;
    return { found: items.length, new: fresh.length, approved: fresh.filter((r) => r.status === "approved").length };
  }
  if (job.kind === "my_followers") { const r: any = await newFollowers(items.map((u) => ({ id: "h:" + String(u.handle).toLowerCase(), userName: u.handle, name: u.name, description: u.bio || "", followers_count: null, can_dm: true }))); r.warm = await warmDMs(); return r; }
  if (job.kind === "follow_src" || job.kind === "leads") {
    const people = items.filter((u) => u.handle).map((u) => ({ userName: u.handle, name: u.name || u.handle, description: u.bio || "", followers_count: null, id: null, can_dm: true,
      _via: job.kind === "leads" ? "search" : job.via, _ctx: u.text || "", _url: u.url || "" }));
    const r = await followSource(10, people);
    if (job.kind === "follow_src" && b.end) {   // the extension scrolled to the end of their followers list
      const { data: fs } = await db.from("crm_lead_settings").select("value").eq("key", "x_follow_src").maybeSingle();
      const v: any = fs?.value ?? {}; v.accounts = v.accounts ?? {}; v.accounts[job.via] = { ...(v.accounts[job.via] ?? {}), dom_done: new Date().toISOString() };
      await db.from("crm_lead_settings").upsert({ key: "x_follow_src", value: v }, { onConflict: "key" });
    }
    return r;
  }
  return { error: "Unknown job" };
}

// 3. Warm DMs on autopilot (15 Nov): everyone the CRM judged worth a DM (replied, quoted, commented a keyword, tagged, followed)
//    gets a DM Pipeline row (script W1, Warm) and a task for the X bot, which sends it from Reyansh's X tab within its daily cap
//    (warm people go before cold ones). Follow-ups 1 and 2 come from W1. At most 10 a run.
async function warmDMs() {
  const { data: pe } = await db.from("crm_sheet").select("row,cells").eq("tab", "Post Engagers").gte("row", 4);
  const week = Date.now() - 7 * 864e5;
  const MONS: Record<string, number> = Object.fromEntries(MON.map((m, i) => [m, i]));
  const when = (s: string) => { const m = String(s || "").match(/^(\d{1,2}) (\w{3}) (\d{4})/); return m ? Date.UTC(+m[3], MONS[m[2]] ?? 0, +m[1]) : 0; };
  const todo = (pe ?? []).filter((r) => { const c = r.cells ?? []; return (c[15] || "To message") === "To message" && c[18] === "DM + reply" && (c[4] === "Followed" || c[12] === "Core buyer") && String(c[14] || "").trim() && c[5] && when(c[0]) >= week; });   // (16 Nov) only the ICP (founder or C-suite at a funded B2B startup) gets an automatic DM; the rest stay on Engaged
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
    const row = next++, name = c[6] || h, how = c[4] || "Engaged";
    // (19 Nov, Reyansh: no cross-wiring) the DM says nothing about who they are or what they build: the old judge-written DMs guessed
    // ("founder of DTechies" to someone who isn't). Followers get the thank-you line; engagers a plain thanks for joining in.
    const fn = String(name).trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, ""), nm = fn && String(name).trim().split(/\s+/).length >= 2 ? " " + fn : "";
    const dm = how === "Followed" ? "Thanks for the follow" + (nm ? "," + nm : "") + "! Curious what brought you here, was it the " + FOLLOW_TOPIC + " posts?"
      : "hey" + nm.toLowerCase() + ", thanks for jumping into the conversation on my post. curious what you're working on right now?";
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
const FOLLOW_TOPIC = "GTM";   // "was it the GTM posts?"
async function newFollowers(given?: any[]) {
  const list: any[] = given ?? ((await tw("/twitter/user/followers?userName=" + HANDLE + "&pageSize=200")).followers ?? []).filter((f: any) => f?.id);
  const { count } = await db.from("crm_x_followers").select("id", { count: "exact", head: true });
  const { data: seen } = await db.from("crm_x_followers").select("id").in("id", list.map((f) => String(f.id)));
  const { data: seenH } = await db.from("crm_x_followers").select("handle").in("handle", list.map((f) => String(f.userName || f.screen_name || "")));
  const known = new Set([...(seen ?? []).map((r) => r.id), ...(seenH ?? []).map((r) => "h:" + String(r.handle).toLowerCase())]);
  const fresh = list.filter((f) => !known.has(String(f.id)) && !known.has("h:" + String(f.userName || f.screen_name || "").toLowerCase()));
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
      // (19 Nov, Reyansh) every new follower gets this line; only obvious spam is skipped
      const spam = /(crypto|web3|nft|defi|onlyfans|airdrop|forex|giveaway|promo|dm for)/i.test(String(f.description || "") + " " + String(f.name || ""));
      const dm = "Thanks for the follow, " + String(first).replace(/[^\p{L}'-]/gu, "") + "! Curious what brought you here, was it the " + FOLLOW_TOPIC + " posts?";
      engagers.push([istStamp(now), ACCOUNT, "https://x.com/" + h, "(followed us)", "Followed", h, f.name || "", clip(String(f.description || ""), 200),
        String(f.followers_count ?? ""), f.can_dm ? "Yes" : "", "", "https://x.com/" + h, o?.fit || "Other", ACCOUNT, dm,
        spam ? "Dismissed" : "To message", "", "", spam ? "Skip" : "DM + reply" /* (19 Nov) every follower gets the thank-you DM */, noDash(o?.why || "Followed us on X."), String(f.id)]);
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
