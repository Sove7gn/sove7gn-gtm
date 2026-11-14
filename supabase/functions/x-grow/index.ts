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
      .gte("created_at", new Date(Date.now() - (REDRAFT ? 48 : 6) * 3600e3).toISOString()).order("created_at", { ascending: false }).limit(REDRAFT ? 80 : 30);
    const todo = (miss ?? []).filter((r) => r.kind === "lead" || (r.followers ?? 0) >= 1000).slice(0, REDRAFT ? 40 : 12);
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
// (15 Nov v2) Replies that sound like a 20-year-old founder typing on his phone: short, one point, casual, on the post's own topic.
const REPLY_PROMPT = (r: any, i: number) =>
  "You write a reply under an X post, as Reyansh: 20, Indian founder of a small GTM agency for startups, casual and a bit funny, types fast on his phone.\n" +
  "Post by " + r.name + " (@" + r.author + ", " + (r.followers ?? 0) + " followers, " + (r.kind === "lead" ? "a startup founder" : "a creator who posts about sales and growth") + "):\n\"\"\"\n" +
  String(r.post_text).slice(0, 1200) + "\n\"\"\"\n" +
  "First work out what the post is really about (work, a product, sales, a joke, sport, travel, life, news). Reply about THAT. " +
  "If it is not about work (football, food, a meme, a trip, a personal win), reply like a friend would: about that thing only, never bring up GTM, sales, outbound, content or his agency. " +
  "If it is about work, give one direct point of his own (a quick take, a small example, or agreeing and adding one thing). Mention his own work only if it truly fits, in a few words.\n" +
  "Style: 1 or 2 short lines, under 140 characters, plain simple words, lowercase is fine, basic grammar is fine, a little humour when it fits. " +
  "Make a statement, not a question" + (i % 3 === 2 ? " (one short question at the end is allowed this time)" : " (no question this time)") + ". " +
  "Never: pitch, links, hashtags, emojis more than one, em dashes, starting with praise (great, love this, so true, congrats, this is gold), 'it's not X, it's Y', sounding like a LinkedIn post, big words. " +
  "If the post is only a link with no text, or there is nothing natural to say, answer SKIP. Answer with the reply text only.";
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
  for (const [k, v] of Object.entries(res)) { const t = String(v || "").trim().replace(/^"|"$/g, ""); if (t && !/^skip\b/i.test(t) && !/^(great|love|so true|congrats|amazing)\b/i.test(t)) clean[k] = t.slice(0, 280); }
  return clean;
}

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
async function dailyPosts(force = false) {
  const now = new Date(), x = new Date(now.getTime() + 330 * 60e3);
  const date = x.getUTCDate() + " " + MON[x.getUTCMonth()] + " " + x.getUTCFullYear(), dow = x.getUTCDay();
  const { data: op } = await db.from("crm_sheet").select("row,cells").eq("tab", "Our Posts").gte("row", 4);
  const have = (slot: string) => (op ?? []).some((r) => r.cells?.[1] === date && r.cells?.[27] === slot);
  const usedTags = new Set((op ?? []).flatMap((r) => [...String(r.cells?.[9] ?? "").matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase())));
  const jobs: { slot: string; time: string; type: string; prompt: string; their?: string; link?: string; why: string }[] = [];
  // News: Exa picks the story (via exaFetch), the model writes the post.
  if (force || !have("News")) {
    const since = new Date(now.getTime() - 30 * 3600e3).toISOString();
    const schema = { type: "object", required: ["headline", "what", "who", "url"], properties: {
      headline: { type: "string", description: "The single biggest story of the last day that startup founders and people who sell to them are talking about: a big AI model or product launch, a big raise or acquisition, a big move by a well-known founder or company. Prefer AI and startups." },
      what: { type: "string", description: "3 to 5 plain facts about it: who, what, numbers, why founders care" },
      who: { type: "string", description: "The product, company or person name people will search for" }, url: { type: "string" } } };
    const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "biggest AI and startup news today", category: "news", numResults: 8, startPublishedDate: since, outputSchema: schema,
        systemPrompt: "Pick one story only, from the last 24 hours. Use the search results as the source." }) });
    const j = r.ok ? await r.json() : null; const s = j?.output?.content;
    if (s?.headline) jobs.push({ slot: "News", time: "6:30 PM", type: "News take", link: s.url || "", their: s.headline + "\n\n" + s.what,
      why: "News post (TOFU): people search for " + (s.who || "this") + " today, so naming it in line 1 brings them to us. Post within the hour. Source: " + (s.url || "search"),
      prompt: "Write an X post reacting to today's news. Name " + (s.who || "the product or company") + " in the first line. Give Reyansh's take for startup founders: what it means for how they build, sell or get customers. " +
        "News: " + s.headline + ". Facts: " + s.what + "\n" + POST_RULES });
  }
  // Shoutout: Mon, Wed, Fri. The creator's best post of the last 2 days from the reply list, someone not tagged before if possible.
  if ((force || [1, 3, 5].includes(dow)) && (force || !have("Shoutout"))) {
    const { data: cand } = await db.from("crm_x_reply").select("url,author,name,post_text,likes,views,followers").eq("kind", "creator")
      .gte("created_at", new Date(now.getTime() - 2 * 864e5).toISOString()).order("likes", { ascending: false, nullsFirst: false }).limit(30);
    const pick = (cand ?? []).filter((c) => String(c.post_text || "").length > 120 && (c.followers ?? 0) >= 3000).sort((a, b) => (usedTags.has(a.author.toLowerCase()) ? 1 : 0) - (usedTags.has(b.author.toLowerCase()) ? 1 : 0))[0];
    if (pick) jobs.push({ slot: "Shoutout", time: "10:45 PM", type: "Shoutout (tag a bigger creator)", link: pick.url, their: pick.post_text,
      why: "Shoutout (TOFU): makes @" + pick.author + " look good in front of our followers, so they and their audience see us. The link at the end shows their post under ours.",
      prompt: "Write an X post that gives credit to @" + pick.author + " (" + pick.name + ") for this post of theirs:\n\"\"\"\n" + String(pick.post_text).slice(0, 1200) + "\n\"\"\"\n" +
        "Start with @" + pick.author + " and what they got right in one line. Then 2 or 3 short lines on why it matters for startup founders, or how Reyansh is applying it this week (no made-up results). " +
        "End with a line that asks others to add to it. Do not include their link, it is added after.\n" + POST_RULES });
  }
  if (!jobs.length) return { added: 0, note: "Already on the calendar for " + date };
  const texts = await llm(jobs.map((j) => j.prompt));
  const wk = "W" + (Math.floor((Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - Date.UTC(2026, 10, 2)) / (7 * 864e5)) + 1);
  let next = Math.max(3, ...(op ?? []).map((r) => r.row)) + 1, added = 0;
  for (const [i, jb] of jobs.entries()) {
    let t = texts[i]; if (!t || /^skip/i.test(t)) continue;
    if (jb.slot === "Shoutout" && jb.link) t = t + "\n\n" + jb.link;
    const cells = [wk, date, jb.time, ACCOUNT, "X", jb.type, jb.slot === "Shoutout" ? "@" + (jb.link?.match(/x\.com\/(\w+)/)?.[1] ?? "") : "News", jb.link || "", jb.their || "", t, jb.why,
      "None", "", "", "To post", "", "", "", "", "", "", "", "", "", "Founders", "Yes", "", jb.slot, "Reach"];
    const { error } = await db.from("crm_sheet").insert({ tab: "Our Posts", row: next++, cells }); if (!error) added++;
  }
  return { added, slots: jobs.map((j) => j.slot) };
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
