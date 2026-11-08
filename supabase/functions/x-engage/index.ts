// x-engage (9 Nov): the X post tracker and midbound, every 6 hours (pg_cron) and from Refresh.
// 1. Reads our posts from the last 10 days with their numbers (Apify, logged out): saved to Post Tracking for the charts,
//    marked Posted in Our Posts when they match a draft, and added there when they were written straight on X.
// 2. Reads everyone who replied to, quoted or mentioned us in that time, looks each new person up once (Exa), and writes them
//    to Post Engagers with a verdict (DM + reply / Reply only / Skip), a public reply and a DM, ready to copy.
// Likes aren't readable without X's own API or a logged-in session, so they're not here yet.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const APIFY = Deno.env.get("APIFY_TOKEN") ?? "";
const EXA = Deno.env.get("EXA_API_KEY") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const ACCOUNT = "Reyansh", HANDLE = "r3yanshJuneja";
const ACTOR = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest";
const MAX_JUDGED = 30;
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
    .eq("platform", "x").is("finished_at", null).lt("started_at", new Date(Date.now() - 5 * 60e3).toISOString());
  // A manual Refresh within 20 minutes of the last check just says so (Apify isn't paid twice for the same numbers).
  const { data: last } = await db.from("crm_sync_runs").select("started_at").eq("platform", "x").eq("ok", true).order("started_at", { ascending: false }).limit(1);
  if (!req.headers.get("x-cron-secret") && last?.[0] && Date.now() - new Date(last[0].started_at).getTime() < 20 * 60e3) return json({ skipped: "Checked X less than 20 minutes ago." });
  const { data: run, error: busy } = await db.from("crm_sync_runs").insert({ platform: "x" }).select("id").single();
  if (busy) return json({ skipped: "A check is already running." });
  try {
    const summary = await syncX();
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", run.id);
    return json(summary);
  } catch (e) {
    const error = String((e as Error).message ?? e);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", run.id);
    return json({ error }, 500);
  }
});

const clip = (s: string, n: number) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const noDash = (s: string) => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+,/g, ",");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ist = (d: Date) => new Date(d.getTime() + 330 * 60e3);
const istDate = (d: Date) => { const x = ist(d); return x.getUTCDate() + " " + MON[x.getUTCMonth()] + " " + x.getUTCFullYear(); };
const istTime = (d: Date) => { const x = ist(d), H = x.getUTCHours(), M = x.getUTCMinutes(); return ((H % 12) || 12) + ":" + String(M).padStart(2, "0") + " " + (H < 12 ? "AM" : "PM"); };
const istStamp = (d: Date) => { const x = ist(d); return istDate(d) + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); };
// The same 40-character key the database uses to match a draft to a live post, with links and @tags taken out.
const snipKey = (s: string) => String(s || "").replace(/https?:\/\/\S+/g, "").replace(/@\w+/g, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
const dbSnip = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);

async function xSearch(query: string, maxItems: number): Promise<any[]> {
  const cap = Math.round((maxItems * 0.25 / 1000 + 0.02) * 100) / 100;
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=90&maxTotalChargeUsd=${cap}`, {
    method: "POST", headers: { Authorization: "Bearer " + APIFY, "Content-Type": "application/json" },
    body: JSON.stringify({ twitterContent: query, queryType: "Latest", maxItems }),
  });
  if (!r.ok) throw new Error("Apify answered " + r.status + ": " + (await r.text()).slice(0, 160));
  const items = await r.json();
  return Array.isArray(items) ? items.filter((i) => i && i.id && i.author?.userName) : [];
}

const ICP = "We sell a done-for-you GTM service (founder content on X and LinkedIn, warm-signal DMs, outbound, booked sales calls) to seed to Series C B2B founders. " +
  "Core buyer = co-founder, CEO, CMO or C-suite at a B2B or B2B2C startup of about 5 to 50 people that raised recently and still runs GTM themselves. " +
  "Good fit = founder or senior GTM person at a startup that could buy later. Related = operators, GTM people, other founders worth a public answer. " +
  "Investor = VCs and angels (worth a reply, they refer founders). Not a buyer = agencies and people selling GTM, outbound or content (competitors), job seekers, bots, spam.";

async function judge(author: any, said: string, ourPost: string, how: string) {
  const bio = String(author.profile_bio?.description || author.description || "");
  const at = (bio.match(/@([A-Za-z0-9_]{2,15})/) || [])[1] || "";
  const schema = { type: "object", required: ["verdict", "fit", "why", "reply"], properties: {
    verdict: { type: "string", enum: ["DM + reply", "Reply only", "Skip"], description: "DM + reply = Core buyer or Good fit. Reply only = worth a public answer. Skip = bots, spam, competitors, nothing to answer." },
    fit: { type: "string", enum: ["Core buyer", "Good fit", "Related", "Investor", "Other", "Not a buyer"] },
    why: { type: "string", description: "One plain sentence: who they are and why this verdict" },
    company: { type: "string" },
    reply: { type: "string", description: "Our public reply under their post, as Reyansh: max 200 characters, specific to what they said, friendly, no pitch, no links, no hashtags, no em dashes, no 'Great point'." },
    dm: { type: "string", description: "Only for DM + reply: a DM from Reyansh, max 300 characters, that mentions what they said, adds one useful thought, and ends with a light question. No pitch in the first line, no links, no em dashes. Empty otherwise." } } };
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: (at ? at + " " : "") + clip(bio, 120) + " company", numResults: 3, outputSchema: schema,
      systemPrompt: "Someone " + how.toLowerCase() + " our X post. Our post: \"" + clip(ourPost, 400) + "\". What they wrote: \"" + clip(said, 400) + "\". " +
        "Them: " + author.name + " (@" + author.userName + "), " + (author.followers ?? 0) + " followers, bio: \"" + clip(bio, 250) + "\". " +
        "Use the search results only to learn about their company. " + ICP }),
  });
  if (!res.ok) throw new Error("Exa answered " + res.status);
  const j = await res.json();
  return { ...(j.output?.content ?? {}), cost: j.costDollars?.total ?? 0 };
}

async function syncX() {
  if (!APIFY || !EXA) throw new Error("APIFY_TOKEN or EXA_API_KEY is missing.");
  const now = new Date();
  const since = ist(new Date(now.getTime() - 10 * 864e5)).toISOString().slice(0, 10);
  const [ours, mentions] = await Promise.all([
    xSearch(`from:${HANDLE} -filter:retweets since:${since}`, 60),
    xSearch(`(to:${HANDLE} OR @${HANDLE} OR url:"${HANDLE}/status") -from:${HANDLE} since:${since}`, 80),
  ]);
  const mine = ours.filter((t) => String(t.author.userName).toLowerCase() === HANDLE.toLowerCase());
  const posts = mine.filter((t) => !t.isReply && !t.inReplyToId && !t.retweeted_tweet);
  const byId = new Map(mine.map((t) => [String(t.id), t]));
  const followers = mine[0]?.author?.followers ?? "";
  const link = (t: any) => "https://x.com/" + HANDLE + "/status/" + t.id;

  // 1. Our posts: numbers, matched to drafts, and new ones added.
  const { data: op } = await db.from("crm_sheet").select("row,cells").eq("tab", "Our Posts").gte("row", 4).order("row");
  const drafts = (op ?? []).filter((r) => (r.cells?.[3] || "") === ACCOUNT && !/linkedin/i.test(r.cells?.[4] || ""));
  const used = new Set<number>();
  const trackPosts: any[] = [], newPosts: any[] = [], snapshots: any[] = [];
  for (const t of posts) {
    const L = link(t);
    let row = drafts.find((r) => String(r.cells?.[16] || "").toLowerCase().split("?")[0] === L.toLowerCase());
    if (!row) row = drafts.find((r) => !r.cells?.[16] && !used.has(r.row) && snipKey(r.cells?.[9]) && snipKey(r.cells?.[9]) === snipKey(t.text));
    const nums = { views: t.viewCount ?? "", likes: t.likeCount ?? 0, replies: t.replyCount ?? 0, reposts: t.retweetCount ?? 0, quotes: t.quoteCount ?? 0, bookmarks: t.bookmarkCount ?? 0 };
    if (row) { used.add(row.row); trackPosts.push({ row: row.row, link: L, snippet: dbSnip(row.cells?.[9]), ...nums }); }
    else {
      const d = new Date(t.createdAt);
      newPosts.push(["", istDate(d), istTime(d), ACCOUNT, "X", "", "Our own", "", "", t.text || "", "Posted straight on X", "", "", "", "Posted", "", L,
        String(nums.views), String(nums.likes), String(nums.replies), String(nums.reposts), String(nums.quotes), String(nums.bookmarks), "", "", "", "", ""]);
    }
    snapshots.push([istStamp(now), ACCOUNT, L, String(nums.views), String(nums.likes), String(nums.replies), String(nums.reposts), String(nums.quotes), String(nums.bookmarks), String(followers)]);
  }

  // 2. Who replied, quoted or mentioned us.
  const { data: pe } = await db.from("crm_sheet").select("cells").eq("tab", "Post Engagers").gte("row", 4);
  const have = new Set((pe ?? []).map((r) => String(r.cells?.[11] || "").toLowerCase().replace(/^.*\/status\//, "")).filter(Boolean));
  const fresh = mentions.filter((t) => String(t.author.userName).toLowerCase() !== HANDLE.toLowerCase() && !have.has(String(t.id)))
    .map((t) => {
      const parent = byId.get(String(t.inReplyToId || "")) ?? byId.get(String(t.quoted_tweet?.id || t.quoted_tweet_results?.result?.rest_id || ""));
      const how = t.quoted_tweet || t.quoted_tweet_results ? "Quoted" : t.inReplyToId && parent ? "Replied" : "Mentioned";
      return { t, parent, how };
    })
    .filter((x) => x.how !== "Mentioned" || /@r3yanshjuneja/i.test(x.t.text || ""))
    .slice(0, 60);
  const engagers: any[] = [], people: any[] = [];
  let judged = 0, cost = 0;
  for (let i = 0; i < fresh.length; i += 6) {
    const batch = fresh.slice(i, i + 6);
    const out = await Promise.all(batch.map((x) => {
      if (judged >= MAX_JUDGED) return Promise.resolve(null);
      return judge(x.t.author, x.t.text || "", x.parent?.text || "", x.how).catch((e) => ({ error: String(e) }));
    }));
    for (let j = 0; j < batch.length; j++) {
      const { t, parent, how } = batch[j], a = t.author, o: any = out[j];
      if (!o || o.error) continue;
      judged++; cost += o.cost ?? 0;
      const bio = String(a.profile_bio?.description || a.description || "");
      engagers.push([istStamp(new Date(t.createdAt || now)), ACCOUNT, parent ? link(parent) : (t.url || ""), clip(parent?.text || "(a mention)", 200), how,
        a.userName, a.name || "", clip(bio, 200), String(a.followers ?? ""), a.canDm ? "Yes" : "", t.text || "", t.url || t.twitterUrl || "",
        o.fit || "", ACCOUNT, noDash(o.dm || ""), o.verdict === "Skip" ? "Dismissed" : "To message", "", noDash(o.reply || ""), o.verdict || "Skip", noDash(o.why || "")]);
      people.push({ handle: String(a.userName).toLowerCase(), name: a.name || "", bio: clip(bio, 300), followers: a.followers ?? null,
        fit: o.verdict === "DM + reply" ? "hot" : o.verdict === "Reply only" ? "warm" : "not a fit", why: noDash(o.why || ""), company: o.company || "",
        found_by: "engage", added: true, judged_at: new Date().toISOString() });
    }
  }

  const { data: res, error } = await db.rpc("crm_call", { body: { action: "track", posts: trackPosts, snapshots, newPosts, engagers } });
  if (error) throw error;
  if (people.length) await db.from("crm_x_people").upsert(people, { onConflict: "handle" });
  return { posts: posts.length, matched: trackPosts.length, new_posts: newPosts.length, mentions: mentions.length, new_people: engagers.length,
    dm_and_reply: engagers.filter((e) => e[18] === "DM + reply").length, saved: String(res), cost_exa: Math.round(cost * 1000) / 1000 };
}
