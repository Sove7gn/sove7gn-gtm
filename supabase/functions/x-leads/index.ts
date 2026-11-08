// x-leads (9 Nov): finds 30 to 40 new people a day to DM on X and adds them to DM Pipeline, ready to send.
// 1. Searches X for founders posting that they just raised, are hiring their first GTM / growth person, or launched (Apify,
//    logged out, about $0.01 per search). A post from the founder's own account means the handle is real and active.
// 2. Skips anyone already in the pipeline or already judged, investors, agencies and big accounts.
// 3. Exa looks up each person's company and judges them against who we sell to, and writes a one-line personal opener.
// 4. Good fits go into DM Pipeline with the next DM script in turn (A, B, C...), so the scripts can be compared.
// Runs at 7:30 and 12:30 IST (pg_cron) and from the "Find leads now" button. Stops for the day once the target is reached.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const APIFY = Deno.env.get("APIFY_TOKEN") ?? "";
const EXA = Deno.env.get("EXA_API_KEY") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const SELF = "r3yanshjuneja";
const OWNER = "Reyansh";
const ACTOR = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest";
const MAX_JUDGED = 80;      // people looked up per run, at most (about $0.01 each on Exa)
const TIME_BUDGET = 120e3;  // stop judging after this many ms so the run always saves before the 150 s limit
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
  const body = await req.json().catch(() => ({}));
  await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error: "Didn’t finish" })
    .eq("platform", "x-leads").is("finished_at", null).lt("started_at", new Date(Date.now() - 5 * 60e3).toISOString());
  const { data: run, error: busy } = await db.from("crm_sync_runs").insert({ platform: "x-leads" }).select("id").single();
  if (busy) return json({ skipped: "Already looking for leads. Give it two minutes." });
  try {
    const summary = await findLeads(!!body?.force);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", run.id);
    return json(summary);
  } catch (e) {
    const error = String((e as Error).message ?? e);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", run.id);
    return json({ error }, 500);
  }
});

// ---------- helpers ----------
const clip = (s: string, n: number) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const noDash = (s: string) => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+,/g, ",");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ist = (d: Date) => new Date(d.getTime() + 330 * 60e3);   // shift so getUTC* reads IST
const istStamp = (d: Date) => { const x = ist(d); return x.getUTCDate() + " " + MON[x.getUTCMonth()] + " " + x.getUTCFullYear() + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); };
const istDay = (d: Date) => ist(d).toISOString().slice(0, 10);

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

// What we search for. Each one is a reason to talk to them now.
const since = () => istDay(new Date(Date.now() - 14 * 864e5));
const QUERIES = (s: string) => [
  { seg: "Raised recently", max: 80, q: `("we raised" OR "just raised" OR "excited to announce" OR "thrilled to announce" OR "proud to announce" OR "happy to announce") ("seed round" OR "pre-seed" OR "Series A" OR "Series B" OR "Series C" OR "seed funding") -filter:replies -filter:retweets min_faves:5 since:${s}` },
  { seg: "Raised recently", max: 60, q: `("raised a $" OR "raised $" OR "closed our $" OR "our $" OR "just closed" OR "we closed") ("seed" OR "Series A" OR "Series B" OR "round") (B2B OR SaaS OR AI OR platform OR enterprise OR agents) -filter:replies -filter:retweets min_faves:5 since:${s}` },
  { seg: "Raised recently", max: 50, q: `("led by" OR "backed by" OR "participation from") ("seed" OR "pre-seed" OR "Series A") ("we're building" OR "we are building" OR "today we" OR "we just") -filter:replies -filter:retweets min_faves:5 since:${s}` },
  { seg: "Hiring signal", max: 80, q: `("hiring" OR "looking for" OR "we're hiring") ("founding GTM" OR "first GTM" OR "founding growth" OR "first marketer" OR "founding marketer" OR "GTM engineer" OR "founding AE" OR "first sales hire" OR "head of growth" OR "head of marketing" OR "growth lead" OR "founding sales") -filter:replies -filter:retweets min_faves:2 since:${s}` },
  { seg: "YC launch", max: 60, q: `("YC" OR "Y Combinator" OR "@ycombinator") ("we raised" OR "we're launching" OR "just launched" OR "launching today" OR "Launch YC" OR "we're live") -filter:replies -filter:retweets min_faves:10 since:${s}` },
  { seg: "YC launch", max: 60, q: `("YC F26" OR "YC S26" OR "YC W26" OR "YC P26" OR "YC X26" OR "(F26)" OR "(S26)" OR "(P26)") -filter:replies -filter:retweets since:${s}` },
  { seg: "Founder-led sales", max: 50, q: `("founder-led sales" OR "founder led sales" OR "doing sales myself" OR "our first 10 customers" OR "our first 100 customers" OR "first paying customers" OR "first enterprise customer" OR "cold outreach" OR "outbound is") -filter:replies -filter:retweets min_faves:10 since:${s}` },
];
const SEG_RANK: Record<string, number> = { "Raised recently": 0, "Hiring signal": 1, "YC launch": 2, "Founder-led sales": 3 };

const FOUNDERISH = /(co-?founder|founder|\bceo\b|\bcmo\b|\bcro\b|\bcoo\b|chief|head of (growth|marketing|sales|gtm)|building @|building\b|\bbuilt\b)/i;
const NOT_BUYER = /(crypto|web3|defi|\$[A-Z]{2,6}|onchain|blockchain|\bvc\b|venture|investor|investing|\bpartner at\b|angel|\bfund\b|capital\b|journalist|reporter|editor at|recruit|talent|newsletter|podcast|ghostwrit|clipping|agency|lead gen|outbound for|we help (startups|founders|b2b)|growth studio|gtm studio|consultant|freelanc|student)/i;

const ICP = "We sell a done-for-you GTM service (founder content on X and LinkedIn, warm-signal DMs, outbound, booked sales calls) for $20,000 a month. " +
  "Hot = a co-founder, CEO, C-suite or CMO at a B2B or B2B2C software or deep tech startup of roughly 5 to 50 people that raised pre-seed to Series C in the last 6 months " +
  "(or is clearly funded and hiring for GTM, growth or marketing now), where the founder still runs sales and marketing. YC or a top accelerator is a plus. " +
  "Warm = the same kind of company but unclear funding or size, or a senior non-founder (VP, head of growth) there. " +
  "Not a fit = crypto, web3, token or trading projects, investors and VCs, agencies and anyone selling GTM, outbound, content or lead gen (they are competitors), consumer-only apps, crypto tokens, " +
  "companies over 200 people or public, job seekers, students, journalists, and anyone with no company.";

async function judge(author: any, tweet: any, seg: string) {
  const bio = String(author.profile_bio?.description || author.description || "");
  const at = (bio.match(/@([A-Za-z0-9_]{2,15})/) || [])[1] || "";
  const query = (at ? at + " " : "") + clip(bio, 120) + " startup funding";
  const schema = { type: "object", required: ["fit", "name", "company", "why"], properties: {
    fit: { type: "string", enum: ["hot", "warm", "not a fit"] },
    name: { type: "string", description: "Their full name as a person (not the company)" },
    role: { type: "string", description: "Their role, short, e.g. Co-founder & CEO" },
    company: { type: "string", description: "Their company name" },
    what: { type: "string", description: "What the company sells and to whom, one short sentence" },
    stage: { type: "string", description: "Latest round and when, e.g. 'Seed, $4M, Oct 2026', or 'Unknown'" },
    team: { type: "string", enum: ["1-10", "11-50", "51-200", "200+", "unknown"] },
    is_person: { type: "boolean", description: "true only if this X account belongs to one named person; false for company, product or project accounts" },
    why: { type: "string", description: "One plain sentence: why they fit or not" } } };
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query, numResults: 4, outputSchema: schema,
      systemPrompt: "Judge one person as a sales lead. Their X name: \"" + author.name + "\" (@" + author.userName + "), " + (author.followers ?? 0) + " followers. " +
        "Their X bio: \"" + clip(bio, 300) + "\". Their recent post (" + seg + "): \"" + clip(tweet.text, 600) + "\". " +
        "Use the search results only to learn about their company; if the results are not about them, judge from the bio and post. " + ICP }),
  });
  if (!res.ok) throw new Error("Exa answered " + res.status);
  const j = await res.json();
  return { ...(j.output?.content ?? {}), cost: j.costDollars?.total ?? 0, source: j.results?.[0]?.url ?? "" };
}

// The [hook] in the DM scripts: one plain sentence a person would write, nothing clever.
const ROLE = /(founding gtm|first gtm|gtm engineer|founding growth|head of growth|head of marketing|marketing lead|growth lead|first marketer|founding marketer|founding ae|first sales hire|founding sales)/i;
function hookFor(seg: string, stage: string, text: string) {
  if (seg === "Hiring signal") { const m = String(text || "").match(ROLE); return m ? "Saw you're hiring a " + m[1].toLowerCase().replace("gtm", "GTM").replace(/ ae$/, " AE") + "." : "Saw you're hiring for growth."; }
  if (seg === "YC launch") return "Congrats on the YC launch.";
  const m = (String(stage || "") + " " + String(text || "")).match(/(pre-?seed|seed|series [abc])/i);
  if (!m) return "Congrats on the raise.";
  const r = m[1].toLowerCase();
  return r.startsWith("series") ? "Congrats on the Series " + r.slice(-1).toUpperCase() + "." : r.startsWith("pre") ? "Congrats on the pre-seed round." : "Congrats on the seed round.";
}

// ---------- the run ----------
async function findLeads(force: boolean) {
  const t0 = Date.now();
  if (!APIFY || !EXA) throw new Error("APIFY_TOKEN or EXA_API_KEY is missing.");
  const { data: st } = await db.from("crm_state").select("key,value").in("key", ["x_leads", "x_leads_day"]);
  const set = JSON.parse(st?.find((r) => r.key === "x_leads")?.value || "{}");
  if (set.enabled === false && !force) return { skipped: "Lead finding is switched off." };
  const target = Number(set.target) || 40;
  const today = istDay(new Date());
  const day = JSON.parse(st?.find((r) => r.key === "x_leads_day")?.value || "{}");
  const addedToday = day.date === today ? Number(day.added) || 0 : 0;
  const want = target - addedToday;
  if (want <= 0 && !force) return { skipped: "Today's " + target + " leads are already in.", added_today: addedToday };

  // The pipeline as it is: who's in it, where the next row goes, and how often each script has been handed out.
  const { data: rows, error } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Pipeline").gte("row", 3).order("row");
  if (error) throw error;
  const head = (rows!.find((r) => r.row === 3)?.cells ?? []).map((x: string) => String(x || "").trim());
  const ix = (k: string) => head.indexOf(k);
  const body = rows!.filter((r) => r.row >= 4 && r.cells?.[ix("Name")]);
  const haveHandle = new Set(body.map((r) => String(r.cells[ix("X handle")] || "").replace(/^@/, "").toLowerCase()).filter(Boolean));
  const haveCompany = new Map<string, number>();
  for (const r of body) { const c = String(r.cells[ix("Company")] || "").trim().toLowerCase(); if (c) haveCompany.set(c, (haveCompany.get(c) ?? 0) + 1); }
  let next = Math.max(3, ...rows!.map((r) => r.row)) + 1;

  const { data: tplRows } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Templates").gte("row", 11).order("row");
  const scripts = (tplRows ?? []).map((r) => ({ id: String(r.cells?.[0] || "").trim(), opener: String(r.cells?.[4] || ""), verdict: String(r.cells?.[12] || "") }))
    .filter((t) => /^[A-Z]\d+[A-Z]?$/.test(t.id) && t.opener && !/^off/i.test(t.verdict));
  const used = new Map(scripts.map((t) => [t.id, body.filter((r) => r.cells[ix("Template")] === t.id).length]));
  const nextScript = () => { if (!scripts.length) return ""; const t = [...scripts].sort((a, b) => (used.get(a.id)! - used.get(b.id)!) || a.id.localeCompare(b.id))[0]; used.set(t.id, used.get(t.id)! + 1); return t.id; };

  const { data: judgedBefore } = await db.from("crm_x_people").select("handle").not("judged_at", "is", null);
  const seen = new Set((judgedBefore ?? []).map((p) => p.handle));

  // 1. Search X (five searches at once is Apify's limit).
  const s = since();
  const Q = QUERIES(s), results: any[][] = [];
  for (let i = 0; i < Q.length; i += 4)   // Apify runs five jobs at once at most; the other jobs may be running too
    results.push(...await Promise.all(Q.slice(i, i + 4).map((q) => xSearch(q.q, q.max).then((items) => items.map((x) => ({ ...x, _seg: q.seg }))).catch((e) => { console.log("search failed", String(e)); return []; }))));
  const tweets = results.flat();
  const best = new Map<string, any>();
  for (const t of tweets) {
    const h = String(t.author.userName).toLowerCase();
    const had = best.get(h);
    if (!had || (SEG_RANK[t._seg] ?? 9) < (SEG_RANK[had._seg] ?? 9) || ((SEG_RANK[t._seg] === SEG_RANK[had._seg]) && (t.likeCount ?? 0) > (had.likeCount ?? 0))) best.set(h, t);
  }

  // 2. Cheap checks before paying for a lookup.
  const cands = [...best.entries()].filter(([h, t]) => {
    const a = t.author, bio = String(a.profile_bio?.description || a.description || "");
    if (h === SELF || haveHandle.has(h) || seen.has(h)) return false;
    if ((a.followers ?? 0) < 60 || (a.followers ?? 0) > 150000) return false;
    if (NOT_BUYER.test(bio)) return false;
    return FOUNDERISH.test(bio) || /\b(we|our)\b/i.test(String(t.text || "").slice(0, 200));
  }).sort((x, y) => (SEG_RANK[x[1]._seg] - SEG_RANK[y[1]._seg]) || ((y[1].likeCount ?? 0) - (x[1].likeCount ?? 0)));

  // 3. Judge in groups of 8 until today's target is met.
  let hot = 0, judged = 0, cost = 0, warm = 0;
  const writes: any[] = [];
  const people: any[] = [];
  const goal = force ? Math.max(want, 10) : want;
  for (let i = 0; i < cands.length && i < MAX_JUDGED && hot < goal && Date.now() - t0 < TIME_BUDGET; i += 8) {
    const batch = cands.slice(i, i + 8);
    const out = await Promise.all(batch.map(([, t]) => judge(t.author, t, t._seg).catch((e) => ({ error: String(e) }))));
    for (let j = 0; j < batch.length; j++) {
      const [h, t] = batch[j], o: any = out[j] ?? {}, a = t.author;
      cost += o.cost ?? 0;
      if (o.error || !o.fit) continue;
      judged++;
      const bio = String(a.profile_bio?.description || a.description || "");
      const person = { handle: h, name: o.name || a.name || "", bio: clip(bio, 300), followers: a.followers ?? null, fit: o.fit, why: noDash(o.why || ""),
        role: o.role || "", company: o.company || "", company_what: o.what || "", company_stage: o.stage || "", found_by: "leads", added: false, judged_at: new Date().toISOString() };
      people.push(person);
      if (o.fit === "warm") warm++;
      const co = String(o.company || "").trim();
      if (o.fit !== "hot" || hot >= goal || o.is_person === false || o.team === "200+") continue;
      if (/engineer|developer|scientist|designer|intern|advisor/i.test(o.role || "") && !/founder|ceo|chief/i.test(o.role || "")) continue;   // not the buyer
      if (!o.name || /unknown|founder$/i.test(o.name) || (co && o.name.toLowerCase() === co.toLowerCase())) continue;
      if (co && (haveCompany.get(co.toLowerCase()) ?? 0) >= 2) continue;   // two people per company at most
      hot++;
      person.added = true;
      if (co) haveCompany.set(co.toLowerCase(), (haveCompany.get(co.toLowerCase()) ?? 0) + 1);
      haveHandle.add(h);
      const posted = t.createdAt ? new Date(t.createdAt) : new Date();
      const fit = (/founder|ceo|cmo|chief/i.test(o.role || "") ? 9 : 8) + (t._seg === "Raised recently" || t._seg === "Hiring signal" ? 1 : 0);
      const r = next++;
      writes.push({ row: r, col: 3, values: [[o.name || a.name, co || "Unknown", o.role || "Founder", OWNER, "X DM", "Cold", t._seg, String(Math.min(10, fit)),
        a.userName, "", "", "Posted on X: “" + clip(t.text, 180) + "”", t.url || t.twitterUrl || "", istStamp(posted), nextScript(), "", "To send", ""]] });
      writes.push({ row: r, col: 28, values: [["Found by the lead finder on " + istStamp(new Date()) + ". " + noDash(o.why || "") + (o.what ? " " + co + ": " + noDash(o.what) : "") +
        " X: " + (a.followers ?? 0) + " followers. Bio: " + clip(bio, 160)]] });
      writes.push({ row: r, col: 32, values: [[String((haveCompany.get(co.toLowerCase()) ?? 1)), "Done-for-you GTM: " + clip(noDash(o.why || ""), 140), "",
        o.stage && !/unknown/i.test(o.stage) ? o.stage : (t._seg === "Raised recently" ? "Raised recently (see post)" : "Unknown"), o.source || t.url || "", hookFor(t._seg, o.stage, t.text)]] });
    }
  }

  // 4. Save: judged people first (so nobody is paid for twice), then the new pipeline rows in one call.
  if (people.length) { const { error: e } = await db.from("crm_x_people").upsert(people, { onConflict: "handle" }); if (e) throw e; }
  if (writes.length) {
    const { data: res, error: e } = await db.rpc("crm_call", { body: { action: "rows", writes } });
    if (e) throw e;
    if (!String(res).startsWith("ok")) throw new Error("Saving the leads failed: " + res);
  }
  await db.from("crm_state").upsert({ key: "x_leads_day", value: JSON.stringify({ date: today, added: addedToday + hot }) });
  return { searched: tweets.length, people_found: best.size, checked: cands.length, judged, added: hot, warm, added_today: addedToday + hot, target,
    cost_exa: Math.round(cost * 1000) / 1000, seconds: Math.round((Date.now() - t0) / 1000) };
}
