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
  if (/^linkedin profile$/i.test(String(args.category ?? ""))) args.category = "people";   // (15 Nov) Composio only takes "people"
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
      // (15 Nov) A big result (a funding search with 25 articles) comes back only as a preview; the whole thing sits in a file in
      // Composio's sandbox, which we read back with jq (just the parts our code uses).
      const file = out?.data?.remote_file_info?.file_path;
      if (!one.data && file) {
        const jq = "jq -c '.results[0].response.data | {costDollars, output: {content: .output.content}, results: [(.results // [])[] | {url, title, text: ((.text // \"\")[0:300])}]}' " + file;
        const r2 = await fetch("https://connect.composio.dev/mcp", { method: "POST",
          headers: { "x-consumer-api-key": CMP_KEY_, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "COMPOSIO_REMOTE_BASH_TOOL", arguments: { command: jq } } }) });
        const t2 = await r2.text(); const l2 = t2.match(/^data: (.*)$/m);
        const o2 = JSON.parse(JSON.parse(l2 ? l2[1] : t2).result?.content?.[0]?.text ?? "{}");
        const stdout = String(o2?.data?.stdout ?? "").trim();
        if (!stdout) throw new Error("Exa via Composio: couldn't read the full result (" + String(o2?.data?.stderr ?? o2?.error ?? "").slice(0, 120) + ")");
        return new Response(stdout, { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify(one.data ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) { if (attempt === 1) return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 502 }); }
  }
  return new Response("{}", { status: 502 });
}


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
// LinkedIn pages put badges inside the name ("Ed Cooke Verified Profile 2nd", "Jo Lee • 3rd+"): keep the name only.
const cleanName = (n: unknown) => String(n ?? "").replace(/\b(Verified|Premium)( Profile)?\b/gi, " ").replace(/[•·]?\s*\b(1st|2nd|3rd\+?)(?=\s|$)/gi, " ")
  .replace(/\((he|she|they)\/[a-z]+\)/gi, " ").replace(/\s+/g, " ").trim();
const sameName = (a: unknown, b: unknown) => { const k = (x: unknown) => cleanName(x).toLowerCase().replace(/[^a-z]/g, ""); return !!k(a) && k(a) === k(b); };
const ACTIVE = /^(new|contacted|follow up)$/i;
// Follow-up order after the 3 tips: 1 booking link, 3 the VSL, 5 how they get customers, 2 bump, 6 next week?, 7 last nudge.
// (14 Nov) Each person gets each of these at most once (li.fu_sent keeps which ones went out), so nobody hears the same thing twice.
const TIPS_FU = [1, 3, 5, 2, 6, 7];
// (14 Nov) A connection note that promised them 3 ideas / tips / tricks. Once they accept, the very next message is those ideas,
// written for them, whatever else happens (no pitch first). Then: they reply, Reyansh takes it; no reply in 24 hours, TIPS_FU.
const PROMISE_RE = /\b(3|three)\s+(quick\s+|small\s+|simple\s+|inbound\s+|easy\s+)*(tips|ideas|tricks)\b/i;
const promised = (l: Lead) => !!(l.fields?.li?.promised || l.fields?.li?.src === "list");
const tipsGot = (l: Lead) => !!(l.fields?.tips?.sent_at || l.fields?.li?.tips_dm);
const IDEAS_RE = /here they are|here are the 3 ideas|sending over 3 quick ideas|sending them over anyway|\b(3|three)\s+(quick\s+|small\s+|inbound\s+)*(tips|ideas|tricks)\b/i;
const CAL = "https://cal.com/sove7gn-gtm/30min";
// ───────── LinkedIn sequence v2 (16 Nov) ─────────
// No greetings, one question per message, help before any ask, and never a booking link to someone who hasn't replied.
// Day 0: the request, then the moment they accept, idea 1 + one question. Day 3 the question alone. Day 5 ideas 2 and 3 with no
// ask. Day 8 a client story. Day 12 a clean close, then stop (Cold lead). A reply stops it at once. Everyone who hadn't had a
// message after accepting on 16 Nov goes on v2 (li.seq = 2); people already in the old sequence finish it.
// Texts are edited on the CRM's Bots page (li_bot.v2). {idea1} {idea2} {idea3} {company} {first} fill in.
type V2Texts = { first: string; first_np: string; first_x: string; fu: string[] };
const V2_DAYS = [3, 5, 8, 12];
const V2_DEFAULT: V2Texts = {
  first: "Here's the first one, the one I'd do this week.\n\n{idea1}\n\nQuick q so the other two actually land: {is_company} getting customers mostly from referrals right now, or outbound too?",
  first_np: "One thing I'd do at {company} this week.\n\n{idea1}\n\nQuick q: {is_company} getting customers mostly from referrals right now, or outbound too?",
  first_x: "Sent you 3 ideas for {company_s} inbound over on X. Quick q: {is_company} getting customers mostly from referrals right now, or outbound too?",
  fu: [
    "Curious, is most of {company_s} pipeline coming from referrals right now?",
    "Said I'd send the other two, so here they are regardless.\n\n{idea2}\n\n{idea3}\n\nNo ask, just thought they'd be useful for {company}.",
    "Had a founder in almost exactly your spot a few months back. All referrals, nothing repeatable. We put their founder content and warm signal DMs on autopilot: 100K views on X and 30 enterprise calls in a week.\n\nHappy to walk you through exactly how it was set up, whether or not you ever work with us.",
    "Doesn't look like the timing's right, so I'll stop here rather than clog your inbox. If inbound ever becomes the priority, just say the word and I'll pick it back up.",
  ],
};
// The 3 ideas as separate pieces: no "Hey X, here they are", no numbers, no internal tags like "(midbound automation)", no pitch at the end.
function ideasOf(l: Lead): string[] {
  const raw = String(l.fields?.tips?.text ?? "").replace(/\r/g, "");
  return raw.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => /^\d[.)]\s/.test(p))
    .map((p) => p.replace(/^\d[.)]\s*/, "").replace(/\s*\([^()]{2,60}\)\s*$/, "").replace(/\s*[—–]\s*/g, ", ").trim()).slice(0, 3);
}
function v2Fill(text: string, l: Lead): string {
  const co = l.company && !/^unknown$/i.test(l.company) ? l.company : "";
  const id = ideasOf(l);
  return String(text ?? "").replace(/\{idea1\}/g, id[0] ?? "").replace(/\{idea2\}/g, id[1] ?? "").replace(/\{idea3\}/g, id[2] ?? "")
    .replace(/\{is_company\}/g, co ? "is " + co : "are you").replace(/\{company_s\}/g, co ? co + (/s$/i.test(co) ? "'" : "'s") : "your")
    .replace(/\{company\}/g, co || "your company").replace(/\{first\}/g, firstName(l.name)).replace(/\n{3,}/g, "\n\n").trim();
}
// Two concrete call times to offer (next two weekdays, 4pm and 11am IST), for answers to people who replied.
function callSlots(): string {
  const out: string[] = []; const d = new Date(Date.now() + 330 * 60e3); const DN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let i = 1; out.length < 2 && i < 8; i++) { const x = new Date(d.getTime() + i * 864e5); const w = x.getUTCDay(); if (w === 0 || w === 6) continue; out.push(DN[w] + (out.length ? " 11am" : " 4pm")); }
  return out.join(" or ") + " IST";
}
// (14 Nov) The lead behind an X handle (to know if they already got the 3 ideas on LinkedIn, and to mark it when X sends them).
async function leadByHandle(h: string): Promise<any> {
  const x = String(h ?? "").replace(/^@/, ""); if (!x) return null;
  const { data } = await db.from("crm_leads").select("id,name,company,fields").or("x_handle.ilike.@" + x + ",x_handle.ilike." + x).eq("archived", false).limit(1);
  return data?.[0] ?? null;
}
// The tips as a LinkedIn message: right after they accept, or (if a pitch went out first by mistake) as the next message.
function tipsDM(l: Lead, late = false, kept = true): string {
  const body = String(l.fields?.tips?.text ?? "").replace(/^Hey [^,\n]*,\s*here they are:\s*/i, "").replace(/^Thanks for connecting[^\n]*\n+/i, "").trim();
  if (!body) return "";
  return (late ? "Hey " + firstName(l.name) + ", as promised when we connected, here are the 3 ideas:" : kept ? "Thanks for connecting, " + firstName(l.name) + "! As promised, here they are:"
    : "Thanks for connecting, " + firstName(l.name) + "! Wanted to share 3 quick ideas for " + (l.company && !/^unknown$/i.test(l.company) ? l.company + "'s" : "your") + " inbound:") + "\n\n" + body;
}     // stages the bot may still message in

async function allowed(req: Request): Promise<boolean> {
  if (TOKEN && req.headers.get("x-bot-token") === TOKEN) return true;
  if (CRON && req.headers.get("x-cron-secret") === CRON) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.from("crm_team").select("email").limit(1);
  return !!data?.length;
}

// ───────── Competitors (16 Nov, CRM > Competitors) ─────────
// comp_daily runs off the 15-minute job, one small piece of work per run:
//   ads    once a day: every competitor's Google and YouTube ads from Google's Ads Transparency Center (public, no login)
//          -> setting comp_ads { name: { domain, at, total, ads: [...] } }
//   intel  each competitor once a week: who they sell to, their offer, price, CTA, proof and the clients they name (Exa reads
//          their site and what's written about them) -> setting comp_intel; their founders of named clients become leads
//   li     once a day: 4 LinkedIn posts from lead-gen agencies with lots of comments -> setting li_comp_posts. The extension
//          opens them with its usual "niche" job (hello hands them over, no extension change) and sends everyone who commented.
//   judge  commenters waiting: each one is background-checked; only founders/C-suite at funded B2B startups outside India with
//          money to spend become LinkedIn leads (Leads found, waiting for Reyansh's OK). Setting li_comp_people.
// The competitor is never mentioned in anything we send.
const DM_ROLE = /founder|\bceo\b|chief|\bcto\b|\bcoo\b|\bcmo\b|\bcro\b|president|owner|managing director|head of (growth|marketing|sales|gtm|revenue)|\bvp\b|vice president/i;
async function getSet<T>(key: string, def: T): Promise<T> {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? def) as T;
}
const putSet = (key: string, value: unknown) => db.from("crm_lead_settings").upsert({ key, value, updated_at: now() }, { onConflict: "key" });
const domainOf = (u: unknown) => String(u ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
const compList = async () => ((await getSet<any[]>("competitors", [])) ?? []).filter((c) => !c.archived && c.name);

async function googleAds(domain: string) {
  const body = "f.req=" + encodeURIComponent(JSON.stringify({ "2": 40, "3": { "12": { "1": domain, "2": true } }, "7": { "1": 1 } }));
  const r = await fetch("https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives?authuser=0", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 Chrome/130.0" }, body });
  if (!r.ok) throw new Error("Google ads library answered " + r.status);
  const j: any = await r.json();
  const sec = (x: any) => (x?.["1"] ? new Date(+x["1"] * 1000).toISOString().slice(0, 10) : "");
  const ads = ((j?.["1"] ?? []) as any[]).map((c) => {
    const html = String(c?.["3"]?.["3"]?.["2"] ?? ""), img = (html.match(/src="([^"]+)"/) || [])[1] || "";
    return { id: c["2"], adv_id: c["1"], adv: c["12"] ?? "", fmt: ({ 1: "Text", 2: "Image", 3: "Video" } as any)[c["4"]] ?? "Ad", first: sec(c["6"]), last: sec(c["7"]), img,
      url: "https://adstransparency.google.com/advertiser/" + c["1"] + "/creative/" + c["2"] + "?region=anywhere" };
  });
  return { ads, more: !!j?.["2"] };
}
async function compAds() {
  const C = (await compList()).filter((c) => domainOf(c.website));
  const have = await getSet<Record<string, any>>("comp_ads", {});
  const out: Record<string, any> = { ...have };
  const res = await Promise.all(C.slice(0, 60).map(async (c) => {
    const d = domainOf(c.website);
    try { const g = await googleAds(d); return [c.name, { domain: d, at: now(), total: g.ads.length + (g.more ? "+" : ""), ads: g.ads.slice(0, 24) }]; }
    catch (e) { return [c.name, { ...(have[c.name] ?? {}), domain: d, at: now(), error: String((e as Error).message ?? e).slice(0, 160) }]; }
  }));
  for (const [k, v] of res) out[k as string] = v;
  await putSet("comp_ads", out);
  return { checked: res.length, with_ads: res.filter(([, v]: any) => v.ads?.length).length };
}

// Who they sell to and who already buys from them: Exa reads their site, case studies and what's written about them.
async function compIntel(c: any) {
  const d = domainOf(c.website);
  const schema = { type: "object", properties: {
    icp: { type: "string", description: "Who they sell to: company type, stage, size, region, the buyer's role" },
    offer: { type: "string", description: "What they sell, in one or two plain sentences" },
    pricing: { type: "string", description: "Their price or price range if anyone mentions it, else empty" },
    cta: { type: "string", description: "What their site and posts ask people to do (book a call, comment a word, free audit...)" },
    proof: { type: "string", description: "The results they claim (numbers, case studies)" },
    clients: { type: "array", items: { type: "string" }, description: "Companies named as their clients or case studies, each as 'Company: what we know (person and role if named)'" },
    channels: { type: "string", description: "Where they find their own clients (LinkedIn content, X, cold email, ads, referrals)" },
    weak: { type: "string", description: "Weak spots or complaints about them, if any" },
    beat: { type: "string", description: "How a founder-led growth studio doing organic content on LinkedIn and X plus warm DMs could win against them, one or two sentences" } } };
  const q = [c.name, d, c.what].filter(Boolean).join(" ") + " clients case studies results pricing";
  const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, numResults: 8, outputSchema: schema, ...(d ? {} : {}),
      systemPrompt: "Research the company " + c.name + (d ? " (" + d + ")" : "") + ", a " + (c.type || "lead generation agency") + ". " + (c.what ? "They sell: " + c.what + ". " : "") +
        "Only use facts about this exact company. List only clients that are clearly named as theirs. Plain words, no dashes." }) });
  if (!res.ok) throw new Error("Exa answered " + res.status + ": " + (await res.text()).slice(0, 160));
  const o: any = (await res.json()).output?.content ?? {};
  const clients = (Array.isArray(o.clients) ? o.clients : String(o.clients ?? "").split(/;|\n/)).map((s: unknown) => String(s ?? "").trim()).filter(Boolean).slice(0, 15)
    .map((s: string) => { const [co, ...rest] = s.split(":"); return { company: co.trim().slice(0, 80), note: rest.join(":").trim().slice(0, 240) }; });
  return { at: now(), icp: o.icp ?? "", offer: o.offer ?? "", pricing: o.pricing ?? "", cta: o.cta ?? "", proof: o.proof ?? "", channels: o.channels ?? "", weak: o.weak ?? "", beat: o.beat ?? "", clients };
}

// The daily LinkedIn method: posts by lead-gen agencies where people pile into the comments (lead magnets, case studies).
const COMP_LI_Q = [
  "B2B lead generation agency founder post comment below and I'll send you the playbook",
  "we booked sales meetings for a B2B SaaS client in 30 days outbound agency case study",
  "LinkedIn ghostwriting agency for B2B founders inbound leads comment and I'll DM you",
  "outbound agency founder how we generate pipeline for funded startups comment for the template",
  "GTM agency founder post free lead generation system comment to get it",
  "cold email agency founder case study meetings booked SaaS comment below",
];
async function compLiFind(want = 4) {
  const posts = await getSet<any[]>("li_comp_posts", []);
  const seen = new Set(posts.map((p) => p.url)), seenAuthor = new Set(posts.filter((p) => Date.now() - Date.parse(p.found_at) < 14 * 864e5).map((p) => p.author_url));
  const C = await compList();
  const vanity: Record<string, string> = {};
  for (const c of C) for (const f of (c.founders ?? [])) { const v = (String(f.linkedin ?? "").match(/\/in\/([^/?#]+)/) || [])[1]; if (v) vanity[decodeURIComponent(v).toLowerCase()] = c.name; }
  const day = Math.floor(Date.now() / 864e5), since = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const named = C.filter((c) => c.followers !== false).flatMap((c) => (c.founders ?? []).map((f: any) => f.name + " " + c.name + " LinkedIn post")).filter(Boolean);
  const qs = [COMP_LI_Q[day % COMP_LI_Q.length], COMP_LI_Q[(day + 2) % COMP_LI_Q.length], ...(named.length ? [named[day % named.length]] : [])];
  const found = (await Promise.all(qs.map(async (query) => {
    const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
      body: JSON.stringify({ query, numResults: 15, includeDomains: ["linkedin.com"], startPublishedDate: since, contents: { text: { maxCharacters: 1200 } } }) });
    if (!r.ok) return [];
    return ((await r.json()).results ?? []) as any[];
  }))).flat();
  const cands: any[] = [];
  for (const x of found) {
    const url = String(x.url || "").split("?")[0];
    if (!/linkedin\.com\/(posts|feed\/update)\//i.test(url) || seen.has(url)) continue;
    const v = ((url.match(/linkedin\.com\/posts\/([^_/]+)_/i) || [])[1] || "").toLowerCase();
    const authorUrl = v ? "https://www.linkedin.com/in/" + v : "";
    if (authorUrl && seenAuthor.has(authorUrl)) continue;
    const raw = String(x.text || ""), n = +((raw.match(/(\d[\d,]*)\s+comments?\b/i) || [])[1] || "0").replace(/,/g, "");
    seen.add(url); if (authorUrl) seenAuthor.add(authorUrl);
    cands.push({ id: String(cands.length), url, authorUrl, author: x.author || "", comp: vanity[v] || "", text: raw.replace(/^#\s*/, "").slice(0, 1100), n, at: x.publishedDate || null });
    if (cands.length >= 24) break;
  }
  if (!cands.length) return { found: 0 };
  const res = await llmMany(cands.map((c) => ({ id: c.id, prompt: "A LinkedIn post" + (c.author ? " by " + c.author : "") + ":\n\"\"\"\n" + c.text + "\n\"\"\"\n" +
    "Answer with JSON only: {\"agency\": true only if the author runs or works at an agency or service that gets clients for B2B companies (lead generation, outbound, cold email, " +
    "LinkedIn ghostwriting, content, GTM, appointment setting, growth), \"company\": their agency's name, \"author\": the author's full name, \"headline\": their role in a few words, " +
    "\"magnet\": true if the post asks people to comment to get something, \"why\": what kind of person would comment here, one short sentence}" })));
  const rows: any[] = [];
  for (const c of cands) {
    let s: any = null; try { s = JSON.parse(String(res[c.id] ?? "").replace(/^```(json)?|```$/gm, "").trim()); } catch { continue; }
    if (!s?.agency && !c.comp) continue;
    const ag = c.comp || (/^(unknown|n\/a|none|)$/i.test(String(s?.company ?? "").trim()) ? "" : String(s.company).trim());
    rows.push({ id: "p" + Date.now().toString(36) + c.id, url: c.url, author: s?.author || c.author, author_url: c.authorUrl, headline: s?.headline || "", agency: ag,
      known: !!c.comp, magnet: !!s?.magnet, why: s?.why || "", text: c.text.slice(0, 900), comments: c.n, posted_at: c.at, found_at: now(), status: "new" });
  }
  // Most comments first (that's where the leads are); a known competitor or a comment-to-get post counts for a bit extra.
  const score = (r: any) => (r.comments || 0) + (r.known ? 25 : 0) + (r.magnet ? 40 : 0);
  rows.sort((a, b) => score(b) - score(a));
  const pick = rows.slice(0, want);
  await putSet("li_comp_posts", [...pick, ...posts].slice(0, 300));
  return { looked_at: cands.length, agencies: rows.length, added: pick.length };
}
// For hello(): up to 3 posts the extension hasn't read yet. They ride on its "niche" job, marked "comp:<id>".
async function compLiDue(mark: boolean) {
  const posts = await getSet<any[]>("li_comp_posts", []);
  let changed = false;
  for (const p of posts) if (p.status === "reading" && Date.now() - Date.parse(p.read_at) > 12 * 3600e3) {
    if ((p.tries ?? 1) >= 2) { p.status = "read"; p.note = "No comments came back from LinkedIn"; } else p.status = "new"; changed = true; }
  const due = posts.filter((p) => p.status === "new").slice(0, 3);
  if (mark) for (const p of due) { p.status = "reading"; p.read_at = now(); p.tries = (p.tries ?? 0) + 1; changed = true; }
  if (changed) await putSet("li_comp_posts", posts);
  return due.map((p) => ({ url: p.url, author: "comp:" + p.id }));
}
const INTENT = /\b(interested|dm(ed)? me|send (it|me|over)|how (much|do|does|can)|pricing|price|cost|need (this|help|it)|looking for|yes please|keen|would love|i want|me too|please share|share (it|this)|drop (it|the link)|count me in)\b/i;
// The extension's commenters for those posts: kept, then background-checked by comp_daily.
async function compLiPeople(list: any[], me: any) {
  const posts = await getSet<any[]>("li_comp_posts", []);
  const ppl = await getSet<any[]>("li_comp_people", []);
  const byKey = new Map(ppl.map((p) => [p.key, p]));
  const meKeys = new Set([String(me?.urn ?? "").toLowerCase(), String(me?.pid ?? "").toLowerCase()].filter(Boolean));
  let n = 0;
  for (const p of list) {
    const pid = String(p.post_author).slice(5), post = posts.find((x) => x.id === pid); if (!post) continue;
    post.status = "read"; post.read_done = now(); post.commenters = (post.commenters ?? 0) + 1;
    if (meKeys.has(String(p.urn ?? "").toLowerCase()) || meKeys.has(String(p.pid ?? "").toLowerCase())) continue;
    const key = keyOfP(p); if (!key || byKey.has(key)) continue;
    if (sameName(p.name, post.author)) continue;   // the author answering under their own post
    const said = String(p.said ?? "").trim();
    byKey.set(key, { key, urn: p.urn || "", pid: p.pid || "", name: cleanName(p.name), headline: String(p.headline ?? "").slice(0, 200), said: said.slice(0, 400), post_id: pid, agency: post.agency || post.author,
      post_url: post.url, how: "commented", intent: INTENT.test(said) ? "Asked for it" : said.split(/\s+/).length <= 3 && said.length > 0 ? "Comment-to-get" : "", status: "pending", at: now() });
    n++;
  }
  await putSet("li_comp_posts", posts);
  await putSet("li_comp_people", [...byKey.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 900));
  return n;
}
async function judgeComp(p: { name: string; headline: string; said?: string; company?: string }) {
  const schema = { type: "object", required: ["fit", "why"], properties: {
    fit: { type: "string", enum: ["hot", "warm", "not a fit"] }, why: { type: "string", description: "One plain sentence" },
    role: { type: "string" }, company: { type: "string" }, company_what: { type: "string", description: "What the company does, one short line" },
    funding: { type: "string", description: "Money raised from investors, short, like 'Seed, $3M (2025)'. 'none found' if nothing" },
    yc: { type: "string", description: "Y Combinator batch like 'W24' if they are a YC company, else empty" },
    b2b: { type: "boolean", description: "true if the company sells to businesses" }, agency: { type: "boolean", description: "true if the company is an agency, consultancy, freelancer or service business" },
    country: { type: "string", description: "Where the company or the person is based" } } };
  const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: (p.company || p.headline || p.name) + " startup funding", numResults: 5, outputSchema: schema,
      systemPrompt: "Background check on one person as a sales lead. LinkedIn headline: \"" + p.headline + "\". Name: " + p.name + "." + (p.said ? " They commented: \"" + String(p.said).slice(0, 200) + "\"." : "") +
        " Hot only if they are a founder or C-level at a B2B startup that has raised money and could pay an agency for lead generation. Agencies, freelancers, coaches, consultants, job seekers and employees are not a fit." }) });
  if (!res.ok) throw new Error("Exa answered " + res.status + ": " + (await res.text()).slice(0, 160));
  return (await res.json()).output?.content ?? {};
}
// Raised money? From the funding line (or the old "funded" field), and a YC batch counts.
const fundedOf = (o: any) => o.funded === "raised" || !!String(o.yc ?? "").trim() || (/\$|€|£|pre-seed|seed|series|angel|raised|backed|venture/i.test(String(o.funding ?? "")) && !/none|not found|unknown|bootstrap|no (known )?funding/i.test(String(o.funding ?? "")));
// Our ICP, strictly: decision maker, B2B, not an agency, raised money, not based in a non tier-1 country.
function compCore(o: any, headline: string, buyer = false): string {
  const role = String(o.role || headline || "");
  if (!DM_ROLE.test(role)) return "Not a decision maker";
  if (o.agency === true || /\bagency|freelanc|consultan|coach\b/i.test(headline)) return "Agency, freelancer or consultant";
  if (o.b2b === false) return "Sells to consumers";
  const amt = (() => { const m = String(o.funding ?? "").match(/\$\s?([\d.,]+)\s?(k|m|b|million|billion)?/i); if (!m) return 0; const n = +m[1].replace(/,/g, ""); const u = (m[2] || "").toLowerCase();
    return n * (u.startsWith("b") ? 1e9 : u.startsWith("m") ? 1e6 : u === "k" ? 1e3 : 1); })();
  if (amt > 30e6) return "Too big (raised " + String(o.funding).slice(0, 40) + ")";   // (17 Nov) past Series B they hire a team, not us
  if (!buyer && !fundedOf(o)) return /bootstrap/i.test(String(o.funding ?? o.funded ?? "")) ? "Bootstrapped (no raise found)" : "No funding found";
  const ctry = String(o.country ?? "").trim();
  if (ctry && !/^(unknown|n\/a|remote|global)$/i.test(ctry) && !TIER1.test(ctry)) return "Based in " + ctry;
  if (o.fit === "not a fit") return o.why ? clip(String(o.why), 90) : "Not our ICP";
  return "";
}
async function compLead(p: any, o: any, why: string, extra: Record<string, unknown> = {}) {
  const key = p.key || keyOfP(p);
  const { data: dup } = await db.from("crm_leads").select("id").or("origin_key.like.%" + key.split("/in/")[1] + "%,linkedin.ilike.%" + key.split("/in/")[1] + "%").limit(1);
  if (dup?.length) return dup[0].id as string;
  const li: any = { src: "comp", urn: p.urn || undefined, pid: p.pid || undefined, said: p.said ?? "", comp: p.agency ?? "", comp_post: p.post_url ?? "", ...extra };
  const { data: lead, error } = await db.from("crm_leads").insert({ name: p.name ?? "", role: o.role || clip(p.headline ?? "", 120), company: o.company ?? "",
    linkedin: p.pid ? "https://www.linkedin.com/in/" + p.pid : key, direction: "Outbound", source: "LinkedIn", stage: "New", heat: "Hot",
    source_detail: (extra.buyer ? "A client of " : "Commented on a LinkedIn post by ") + (p.agency || "a lead-gen agency") + (extra.buyer ? " (competitor)" : " (lead-gen agency)"),
    notes: [why, o.company_what ? (o.company || "Their company") + ": " + o.company_what : "", o.yc ? "YC " + o.yc : "", fundedOf(o) ? "Funding: " + (o.funding || "raised") : ""].filter(Boolean).join("\n"),
    origin_key: "li-src:comp:" + key, created_by: "automation",
    x_handle: p.handle ? "@" + String(p.handle).replace(/^@/, "") : "",
    fields: { li, li_icp: { funding: fundedOf(o) ? (o.funding || "Raised") : "", one_liner: clip(String(o.company_what ?? ""), 200), hq_country: o.country ?? "", yc: o.yc ?? "" } } }).select("id").single();
  if (error || !lead) return "";
  await db.from("crm_lead_events").insert({ lead_id: lead.id, kind: "note", text: "Found automatically: " + (extra.buyer ? "named as a client of " + p.agency : "commented on " + (p.agency || "an agency") + "'s LinkedIn post" + (p.said ? ": “" + clip(p.said, 160) + "”" : "")) + ". " + why, by_email: "automation" });
  return lead.id as string;
}
async function compJudge(max = 6) {
  const ppl = await getSet<any[]>("li_comp_people", []);
  const added = 0;   // (17 Nov) nobody goes into a pipeline by themselves: Reyansh sends them from Competitors > Leads (comp_send)
  const todo = ppl.filter((p) => p.status === "pending").slice(0, max);
  await Promise.all(todo.map(async (p) => {
    let o: any = {}; try { o = await judgeComp(p); } catch (e) { p.err = String((e as Error).message ?? e).slice(0, 120); p.tries = (p.tries ?? 0) + 1; if (p.tries >= 3) p.status = "not"; return; }
    const no = compCore(o, p.headline);
    Object.assign(p, { role: o.role ?? "", company: o.company ?? "", company_what: o.company_what ?? "", funding: o.funding ?? "", yc: o.yc ?? "", funded: fundedOf(o) ? "raised" : "unknown", country: o.country ?? "", why: no || o.why || "", judged_at: now(), status: no ? "not" : "fit" });
  }));
  await putSet("li_comp_people", ppl);
  return { judged: todo.length, added, waiting: ppl.filter((p) => p.status === "pending").length };
}
// Named clients of a competitor: find the founder on LinkedIn, background-check, add as a lead (Leads found, needs Reyansh's OK).
async function compPersonAdd(p: any) {
  const ppl = await getSet<any[]>("li_comp_people", []);
  if (ppl.some((x) => x.key === p.key)) return;
  await putSet("li_comp_people", [p, ...ppl].slice(0, 900));
}
async function compBuyers(max = 3) {
  const intel = await getSet<Record<string, any>>("comp_intel", {});
  let n = 0;
  // Clients added to Leads found before 17 Nov show in the same list, marked as sent.
  for (const [comp, it] of Object.entries(intel)) for (const cl of (it.clients ?? []) as any[]) if (cl.lead_id && !cl.listed) { cl.listed = true; n += 0;
    const pid = decodeURIComponent((String(cl.linkedin).match(/\/in\/([^/?#]+)/) || [])[1] || "");
    if (pid) await compPersonAdd({ key: "https://www.linkedin.com/in/" + pid.toLowerCase(), pid, urn: "", name: cl.person, headline: cl.role ?? "", said: "", how: "client", agency: comp, role: cl.role ?? "",
      company: cl.company, company_what: cl.note ?? "", funding: cl.funding ?? (cl.funded === "raised" ? "Raised" : ""), yc: cl.yc ?? "", country: cl.country ?? "", why: "Named as a client of " + comp,
      status: "sent", sent_li: cl.looked ?? now(), lead_id: cl.lead_id, judged_at: now(), at: cl.looked ?? now() }); }
  for (const [comp, it] of Object.entries(intel)) for (const cl of (it.clients ?? []) as any[]) {
    if (n >= max) break; if (cl.looked) continue; cl.looked = now(); n++;
    try {
      const schema = { type: "object", properties: { name: { type: "string" }, role: { type: "string" }, linkedin: { type: "string", description: "Their LinkedIn profile URL" },
        company_what: { type: "string", description: "What the company does, one short line" }, funding: { type: "string", description: "Money raised, short, like 'Seed, $3M (2025)', or 'none found'" },
        yc: { type: "string", description: "YC batch like 'W24' if a YC company, else empty" }, b2b: { type: "boolean" }, agency: { type: "boolean" }, country: { type: "string" } } };
      const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "founder CEO of " + cl.company, category: "people", numResults: 5, outputSchema: schema,
          systemPrompt: "Find the founder or CEO of the company " + cl.company + " (" + clip(cl.note || "", 120) + "). Give their LinkedIn URL only if it is clearly them." }) });
      const j: any = r.ok ? await r.json() : {}; const o = j.output?.content ?? {};
      const url = String(o.linkedin || (j.results ?? []).map((x: any) => x.url).find((u: string) => /linkedin\.com\/in\//.test(u)) || "");
      const pid = decodeURIComponent((url.match(/\/in\/([^/?#]+)/) || [])[1] || "");
      Object.assign(cl, { person: o.name ?? "", role: o.role ?? "", linkedin: pid ? "https://www.linkedin.com/in/" + pid : "", funding: o.funding ?? "", yc: o.yc ?? "", country: o.country ?? "" });
      if (!pid || !o.name) { cl.why = "Founder not found on LinkedIn"; continue; }
      const no = compCore({ ...o, company: cl.company, fit: "hot" }, o.role ?? "");   // (17 Nov) clients need a raise on record too
      cl.why = no || "Fits";
      await compPersonAdd({ key: "https://www.linkedin.com/in/" + pid.toLowerCase(), pid, urn: "", name: o.name, headline: o.role ?? "", said: "", how: "client", agency: comp, post_url: "",
        role: o.role ?? "", company: cl.company, company_what: o.company_what || cl.note || "", funding: o.funding ?? "", yc: o.yc ?? "", country: o.country ?? "", why: no || "Named as a client of " + comp,
        status: no ? "not" : "fit", judged_at: now(), at: now() });
    } catch (e) { cl.why = "Lookup failed: " + String((e as Error).message ?? e).slice(0, 80); }
  }
  await putSet("comp_intel", intel);
  return { looked: n };
}
// (17 Nov) Competitors > Leads: Reyansh sends a person to the LinkedIn pipeline (Leads found) or the X pipeline (To send), or trashes them.
// who: "li" = li_comp_people (LinkedIn commenters, competitors' clients), "x" = comp_audience (X repliers and followers).
async function findLiExa(name: string, company: string): Promise<string> {
  const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: name + " " + company, category: "people", numResults: 5 }) });
  const j: any = r.ok ? await r.json() : {}; const first = String(name).split(/\s+/)[0].toLowerCase();
  const hit = (j.results ?? []).find((x: any) => /linkedin\.com\/in\//.test(x.url) && String(x.title ?? "").toLowerCase().includes(first)) ?? (j.results ?? []).find((x: any) => /linkedin\.com\/in\//.test(x.url));
  return hit ? String(hit.url).split("?")[0] : "";
}
async function findXExa(name: string, company: string): Promise<string> {
  const r = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: name + " " + company + " on X", includeDomains: ["x.com", "twitter.com"], numResults: 8 }) });
  const j: any = r.ok ? await r.json() : {}; const first = String(name).split(/\s+/)[0].toLowerCase();
  const hs = (j.results ?? []).map((x: any) => ({ h: (String(x.url).match(/(?:x|twitter)\.com\/(\w{1,15})(?:[/?#]|$)/i) || [])[1] || "", t: String(x.title ?? "") + " " + String(x.author ?? "") }))
    .filter((x: any) => x.h && !/^(home|search|i|intent|share|hashtag|explore|status)$/i.test(x.h));
  const hit = hs.find((x: any) => x.t.toLowerCase().includes(first)) ?? null;
  return hit ? hit.h : await findX(name, company).catch(() => "");
}
async function comp_send(b: any) {
  const who = b.who === "x" ? "x" : "li", key = String(b.key ?? ""), to = String(b.to ?? "");
  const setKey = who === "x" ? "comp_audience" : "li_comp_people";
  const list = await getSet<any[]>(setKey, []);
  const p = list.find((x) => (who === "x" ? x.handle : x.key) === key);
  if (!p) return { ok: false, msg: "Not found" };
  const save = async () => { const cur = await getSet<any[]>(setKey, []); const i = cur.findIndex((x) => (who === "x" ? x.handle : x.key) === key); if (i >= 0) cur[i] = { ...cur[i], ...p }; await putSet(setKey, cur); };
  if (to === "trash") { p.status = "trash"; p.trashed_at = now(); await save(); return { ok: true, msg: "Trashed" }; }
  const o = { role: p.role, company: p.company, company_what: p.company_what || p.what, funding: p.funding || p.stage, yc: p.yc, country: p.country, funded: p.funded };
  if (to === "li") {
    let li = who === "li" ? (p.pid ? "https://www.linkedin.com/in/" + p.pid : p.key) : p.linkedin || "";
    if (!li) { li = await findLiExa(p.name, p.company || "").catch(() => ""); if (li) p.linkedin = li; }
    if (!li) { p.err = "LinkedIn profile not found"; await save(); return { ok: false, msg: "Couldn't find their LinkedIn profile" }; }
    const pid = decodeURIComponent((li.match(/\/in\/([^/?#]+)/) || [])[1] || "");
    const id = await compLead({ key: "https://www.linkedin.com/in/" + pid.toLowerCase(), pid, urn: who === "li" ? p.urn : "", name: p.name, headline: p.headline || p.role || "", said: p.said || p.text || "",
      agency: p.agency || p.comp || "", post_url: p.post_url || p.url || "", handle: who === "x" ? p.handle : "" }, o, "Sent from Competitors > Leads.", p.how === "client" ? { buyer: p.agency } : {});
    if (!id) return { ok: false, msg: "Couldn't add them" };
    Object.assign(p, { lead_id: id, sent_li: now(), status: "sent" }); await save();
    return { ok: true, msg: "In LinkedIn › Leads found" };
  }
  if (to === "x") {
    let h = who === "x" ? p.handle : String(p.x_handle ?? "").replace(/^@/, "");
    if (!h) { h = await findXExa(p.name, p.company || "").catch(() => ""); if (h) p.x_handle = h; }
    if (!h) { p.err = "X account not found"; await save(); return { ok: false, msg: "Couldn't find their X account" }; }
    const res = await toXPipeline({ name: p.name, company: p.company || "", role: p.role || "Founder", linkedin: who === "li" ? (p.pid ? "https://www.linkedin.com/in/" + p.pid : p.key) : p.linkedin || "", x_handle: "@" + h,
      source_detail: p.company_what || p.what || "", fields: { signal: { kind: "comp", headline: [p.yc ? "YC " + p.yc : "", p.funding || p.stage || "", p.company_what || p.what || ""].filter(Boolean).join(" · "), url: "", why: p.why || "", stage: p.funding || p.stage || "" } } }, "");
    if (!/^added|already/.test(res)) return { ok: false, msg: res };
    Object.assign(p, { sent_x: now(), status: "sent" }); await save();
    return { ok: true, msg: /already/.test(res) ? "Already in the X pipeline" : "In X › To send" };
  }
  return { ok: false, msg: "Unknown choice" };
}
async function comp_daily(b: any) {
  const st = await getSet<any>("comp_status", {}), ago = (k: string) => Date.now() - (Date.parse(st[k] ?? "") || 0);
  const out: any = {};
  try {
    if (b.job === "ads" || ago("ads_at") > 20 * 3600e3) { st.ads_at = now(); await putSet("comp_status", st); out.ads = await compAds(); }
    else if (b.job === "li" || ago("li_at") > 20 * 3600e3) { st.li_at = now(); await putSet("comp_status", st); out.li = await compLiFind(+(b.want ?? 4)); }
    else {
      const intel = await getSet<Record<string, any>>("comp_intel", {});
      const C = (await compList()).filter((c) => /agency/i.test(String(c.type ?? "")) && c.followers !== false || /^roger$/i.test(c.name));   // (17 Nov) agencies and Roger only
      const next = b.name ? C.find((c) => c.name === b.name) : C.find((c) => (c.followers !== false || c.website) && Date.now() - (Date.parse(intel[c.name]?.at ?? "") || 0) > 7 * 864e5);
      if (next && (b.name || ago("intel_at") > 40 * 60e3)) {
        st.intel_at = now(); await putSet("comp_status", st);
        try { const it = await compIntel(next); const old = intel[next.name]?.clients ?? [];
          it.clients = it.clients.map((c: any) => old.find((x: any) => x.company.toLowerCase() === c.company.toLowerCase()) ?? c);
          intel[next.name] = it; out.intel = next.name; }
        catch (e) { intel[next.name] = { ...(intel[next.name] ?? {}), at: now(), error: String((e as Error).message ?? e).slice(0, 160) }; out.intel_error = intel[next.name].error; }
        await putSet("comp_intel", intel);
      }
      out.judge = await compJudge(+(b.max ?? 6));
      out.buyers = await compBuyers(4);
    }
  } catch (e) { out.error = String((e as Error).message ?? e).slice(0, 200); }
  st.last = now(); st.last_result = out; await putSet("comp_status", st);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (url.searchParams.get("cal") === "1") return calBooking(req);
  if (url.searchParams.has("visitor")) return visitorHook(req, url.searchParams.get("visitor") ?? "");
  if (!(await allowed(req))) return json({ error: "Not allowed. Check the bot key in the extension's settings." }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    const out = await ({ hello, engagers, state, plan, claim, done, contact, status, enrich, people, warmed, withdrawn, briefs, tips, x_plan, x_claim, x_done, xr_plan, xr_done, x_inbox, x_inbox_targets, x_job, guard, reconcile_li, catchup_apply, catchup_scan, li_move, li_add, refresh, poll, inmail_draft, inmail_test, inmail_tested, funding: (b: any) => funding(b).catch((e) => signalFail("funding", e)), magnets_check, launches: (b: any) => launches(b).catch((e) => signalFail("launches", e)), hiring: (b: any) => hiring(b).catch((e) => signalFail("hiring", e)), signals_daily, signal_find, signal_approve, signal_trash, prospects, day_stats, import_list, x_from_li, xv2_preview, xv2_prepare, comp_daily, comp_send } as Record<string, (b: any) => Promise<unknown>>)[body.action]?.(body);
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
  gap_days: number; hours: { from: number; to: number }; note: string; dm1: string; fu: string[]; rush: boolean; localTime: boolean; v2: V2Texts };
async function settings(): Promise<Bot> {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot").maybeSingle();
  const v = (data?.value ?? {}) as Partial<Bot>;
  return { mode: v.mode === "auto" ? "auto" : "review", paused: !!v.paused, include_warm: !!v.include_warm, week_cap: +(v.week_cap ?? 150),
    notes_month: +(v.notes_month ?? 250), followups: Math.min(+(v.followups ?? 7), (v.fu ?? []).length || 7), gap_days: +(v.gap_days ?? 1),
    hours: { from: +(v.hours?.from ?? 10), to: +(v.hours?.to ?? 24) }, note: v.note ?? "", dm1: v.dm1 ?? "", fu: v.fu ?? [],
    v2: { ...V2_DEFAULT, ...(((v as any).v2 ?? {}) as Partial<V2Texts>), fu: V2_DEFAULT.fu.map((d, i) => String((((v as any).v2 ?? {}).fu ?? [])[i] || d)) },
    // Fast mode (11 Nov): until rush_until, approved items go out as soon as they can (no local-time window, 30 min after the warm touch).
    rush: !!(v as any).rush_until && Date.parse((v as any).rush_until) > Date.now(),
    // (12 Nov) local_time false = only Reyansh's IST window counts (hours), not each person's local morning.
    localTime: (v as any).local_time !== false };
}
async function saveStatus(patch: Record<string, unknown>) {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  await db.from("crm_lead_settings").upsert({ key: "li_bot_status", value: { ...(data?.value ?? {}), ...patch }, updated_at: now() });
}
// (17 Nov, Reyansh) The bots work when SF / US / Canada are awake: hours, daily caps and weekends run on US Pacific time (DST aware).
function ptParts(t = Date.now()) {
  const o: Record<string, string> = {}; for (const p of new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(new Date(t))) o[p.type] = p.value;
  const h = +o.hour % 24, offMs = Date.UTC(+o.year, +o.month - 1, +o.day, h, +o.minute) - Math.floor(t / 60e3) * 60e3;
  return { hour: h + +o.minute / 60, weekend: o.weekday === "Sat" || o.weekday === "Sun", dayStartIso: new Date(Date.UTC(+o.year, +o.month - 1, +o.day) - offMs).toISOString() };
}
const ptHour = () => ptParts().hour, ptDayStart = () => ptParts().dayStartIso;
const istHour = () => { const d = new Date(Date.now() + 5.5 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const inHours = (h: { from: number; to: number }) => { const x = ptHour(); return h.from <= h.to ? x >= h.from && x < h.to : x >= h.from || x < h.to; };

async function hello(b: any) {
  const set = await settings();
  const { data: st } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  const lastScan = Date.parse((st?.value as any)?.last_scan ?? "") || 0;
  // Refresh in the CRM (13 Nov) asks for a fresh read of our posts' numbers and engagers on the next sync.
  const wantScan = (Date.parse((st?.value as any)?.refresh_at ?? "") || 0) > lastScan;
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
  const sv: any = st?.value ?? {}, ago = (k: string) => Date.now() - (Date.parse(sv[k] ?? "") || 0);
  const { data: np } = await db.from("crm_li_suggest").select("url,author").eq("status", "done").gte("day", new Date(Date.now() - 4 * 86400e3).toISOString().slice(0, 10)).limit(8);
  // (16 Nov) Lead-gen agencies' posts (Competitors > LinkedIn comments) go first in the same job; their commenters come back marked comp:<id>.
  const compDue = await compLiDue(false).catch(() => [] as any[]);
  const doNiche = ago("last_niche") > 6 * 3600e3 || (compDue.length > 0 && ago("last_niche") > 90 * 60e3);
  const compPosts = doNiche && compDue.length ? await compLiDue(true).catch(() => [] as any[]) : [];
  return { probe, paused: set.paused, mode: set.mode, in_hours: inHours(set.hours), hours: set.hours,
    do_views: ago("last_viewed") > 6 * 3600e3, do_invites: ago("last_inbound") > 40 * 60e3, do_withdraw: ago("last_withdraw") > 20 * 3600e3,
    do_niche: doNiche, niche_posts: [...compPosts, ...(np ?? []).map((x: any) => ({ url: x.url, author: x.author }))].slice(0, 5),
    scan_engagers: wantScan || Date.now() - lastScan > 3 * 3600e3, scan_days: 30, extra_posts: (known ?? []).map((k) => String(k.post_id)).filter((x) => /^\d+$/.test(x)) };
}
async function status(b: any) { await saveStatus({ seen: now(), ...(b.error ? { last_error: String(b.error).slice(0, 500), last_error_at: now() } : {}), ...(b.note ? { last_note: String(b.note).slice(0, 300) } : {}), ...(b.diag ? { diag: b.diag } : {}) }); return { ok: true }; }

// ───────── InMail (14 Nov): only for high-intent people we're not connected to; 30 credits a month ─────────
// inmail_draft: the CRM picks the people (score 8+, a real sign of intent); each gets a subject and a short note written for them,
// waiting for Reyansh's OK (never sent without it). inmail_test: asks the extension to open an InMail to someone and fill it in
// without sending, so we know it works before a credit is spent; inmail_tested is its answer.
const INMAIL_MONTH = 30;
const VSL_LINK = "https://youtu.be/gTgn6jZaj7w";
async function inmail_draft(b: any) {
  const ids = (Array.isArray(b.lead_ids) ? b.lead_ids : []).slice(0, 10);
  if (!ids.length) return { made: 0 };
  const { data: ls } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key").in("id", ids);
  const { data: had } = await db.from("crm_li_tasks").select("lead_id").eq("kind", "inmail").in("lead_id", ids);
  const skip = new Set((had ?? []).map((t: any) => t.lead_id));
  const todo = ((ls ?? []) as Lead[]).filter((l) => !skip.has(l.id) && !l.fields?.li?.acc && !l.fields?.li?.dm && !l.fields?.li?.inmail);
  const items = todo.map((l) => {
    const li = l.fields?.li ?? {}, ic = l.fields?.li_icp ?? {}, iv = l.fields?.gtm?.intel ?? {};
    const how = ({ liked: "liked one of my LinkedIn posts", commented: "commented on one of my LinkedIn posts", viewed: "viewed my LinkedIn profile", tagged: "I tagged them in one of my LinkedIn posts (a list of founders worth watching)",
      inbound: "sent me a connection request", niche: "commented on a founder's post I also commented on", outbound: "I sent them a connection request that's still pending" } as Record<string, string>)[srcOf(l)] ?? "engaged with my posts";
    const facts = [l.role ? "Role: " + l.role : "", l.company ? "Company: " + l.company : "", ic.one_liner ? "What the company does: " + ic.one_liner : "", ic.funding || iv.round?.v ? "Funding: " + (ic.funding || [iv.round?.v, iv.amount?.v].filter(Boolean).join(" ")) : "",
      l.source_detail ? "What they did: " + clip(String(l.source_detail), 300) : ""].filter(Boolean).join("\n");
    return { id: l.id, prompt: [
      "Write a LinkedIn InMail from Reyansh, founder of SOVE7GN, to " + l.name + ". We are not connected. They " + how + ".",
      facts,
      "SOVE7GN is a GTM growth studio for funded seed to Series C founders: founder content on X and LinkedIn, warm-signal outreach (inbound, midbound, outbound), all linked into one CRM, turned into booked sales calls.",
      "Proof you may use once: we got one of the YC companies we work with 100K views on X and 30 enterprise calls booked in a week. A 3-minute video of how it works: " + VSL_LINK,
      "Rules: subject under 45 characters, specific to them, no clickbait, no emojis. Body 60 to 100 words, plain and warm, like a founder writing to a founder.",
      "Open with the real reason you're writing (what they did, or something specific about their company). One line on what we do. The proof line. End with one easy question (open to a quick 15-minute chat, or would they like the video).",
      "No dashes used as punctuation, no 'I hope this finds you well', no hype words, no bullet points. Use their first name once. Sign off as Reyansh.",
      "Answer with JSON only: {\"subject\": \"...\", \"body\": \"...\"}"].filter(Boolean).join("\n\n") };
  });
  const out = items.length ? await llmMany(items) : {};
  const rows: any[] = [];
  for (const l of todo) {
    const j = parseJson(out[l.id] ?? "");
    if (!j?.body) continue;
    const body = String(j.body).replace(/\s*[\u2014\u2013]\s*/g, ", ").trim(), subject = clip(String(j.subject ?? "").replace(/["\u201c\u201d]/g, "").trim(), 60);
    rows.push({ lead_id: l.id, kind: "inmail", step: 0, subject, text: clip(body, 1900), status: "review" });
  }
  if (rows.length) { const { error } = await db.from("crm_li_tasks").upsert(rows, { onConflict: "lead_id,kind,step", ignoreDuplicates: true }); if (error) throw error; }
  for (const r of rows) await log(r.lead_id, "InMail written, waiting for your OK on LinkedIn > Bot and outreach: " + r.subject, "engaged");
  return { made: rows.length, asked: ids.length };
}
async function inmail_test(b: any) {
  const { data: l } = await db.from("crm_leads").select("id,name,linkedin,fields").eq("id", b.lead_id).maybeSingle();
  if (!l) return { ok: false, error: "No such lead" };
  await saveStatus({ inmail_test: { lead_id: l.id, name: l.name, urn: urnOf(l as any), pid: pidOf(l as any), profile: (l as any).linkedin, at: now() } });
  return { ok: true };
}
async function inmail_tested(b: any) {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  const cur: any = (data?.value as any)?.inmail_test ?? {};
  const r = b.result ?? {};
  await saveStatus({ inmail_test: { ...cur, done: now(), result: r }, ...(r.credits != null ? { inmail_credits: r.credits, inmail_credits_at: now() } : {}) });
  return { ok: true };
}

// ═════════ 14 Nov: three more ways in ═════════
// 1. Lead magnets. Our posts end with "DM me LIST" (or comment it). Anyone who DMs or comments a keyword gets the asset we set
//    for it (crm_lead_settings "magnets": [{ word, text, on }]), sent at once with no approval, since they asked; a keyword with no
//    asset yet is flagged on the lead and in the CRM so Reyansh can answer by hand. Either way they're In talks.
type Magnet = { word: string; text: string; on: boolean };
async function magnetList(): Promise<Magnet[]> {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "magnets").maybeSingle();
  return ((data?.value ?? []) as any[]).map((m) => ({ word: String(m.word ?? "").trim().toUpperCase(), text: String(m.text ?? ""), on: m.on !== false })).filter((m) => m.word.length >= 3);
}
// "LIST", "list please", "Hey! LIST 🙌" count; a long message that only mentions the word doesn't.
const askedFor = (text: string, ms: Magnet[]) => { const t = String(text ?? "").trim(); if (!t || t.split(/\s+/).length > 12) return null;
  return ms.find((m) => new RegExp("(^|[^A-Za-z])" + m.word + "([^A-Za-z]|$)", "i").test(t)) ?? null; };
async function magnetHit(l: Lead, m: Magnet, how: string, said: string) {
  const li = { ...(l.fields?.li ?? {}) }; const at = now();
  if ((li.magnets ?? {})[m.word]) return false;
  li.magnets = { ...(li.magnets ?? {}), [m.word]: at };
  const ready = !!(m.on && m.text.trim() && (how === "dm" || li.acc));   // a DM means we're connected; a comment needs a connection
  await saveLi(l, li, ACTIVE.test(l.stage) ? { stage: "In talks" } : {});
  await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "message", text: "Asked for " + m.word + " (" + how + "): “" + clip(said, 300) + "”", by_email: "linkedin" });
  if (ready) await db.from("crm_li_tasks").upsert({ lead_id: l.id, kind: "magnet", step: Math.abs([...m.word].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 100000,
    subject: m.word, text: fill(m.text, l), status: "ready", decided_by: "auto: they asked" }, { onConflict: "lead_id,kind,step", ignoreDuplicates: true });
  else await log(l.id, m.text.trim() ? "Asked for " + m.word + " but we're not connected yet: answer them on LinkedIn." : "Asked for " + m.word + ", but no asset is set for it yet: send it by hand, or add it on LinkedIn > Bot and outreach.", "note");
  return true;
}
async function magnetDMs(threads: any[]) {
  const ms = await magnetList(); if (!ms.length) return 0;
  const fresh = threads.filter((t) => t.them_at && Date.now() - Date.parse(t.them_at) < 4 * 864e5 && (!t.me_at || Date.parse(t.them_at) > Date.parse(t.me_at)) && askedFor(t.them_text, ms));
  let n = 0;
  for (const t of fresh) {
    const urn = String(t.urn ?? ""); if (!urn) continue;
    let { data: l } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key").eq("archived", false)
      .or("fields->li->>urn.eq." + urn + ",linkedin.ilike.%" + urn + "%").limit(1).maybeSingle();
    if (!l) {   // someone we don't know yet: a lead to answer, named once the bot looks them up
      const ins = await db.from("crm_leads").insert({ name: "LinkedIn member", source: "LinkedIn", stage: "In talks", heat: "Hot", linkedin: "https://www.linkedin.com/in/" + urn,
        origin_key: "li-src:magnet:" + urn.toLowerCase(), source_detail: "DMed us a lead magnet keyword: “" + clip(String(t.them_text), 200) + "”", fields: { li: { urn, acc: now(), src: "magnet" } } }).select("*").maybeSingle();
      l = ins.data; if (!l) continue;
    }
    if (await magnetHit(l as Lead, askedFor(t.them_text, ms)!, "dm", t.them_text)) n++;
  }
  return n;
}
// Comments with the keyword under our posts (from the engagers the extension reads): connected people get the asset as a DM.
async function magnets_check(_b: any) {
  const ms = await magnetList(); if (!ms.length) return { asked: 0 };
  const { data: es } = await db.from("crm_social_engagements").select("person_key,said,first_seen").eq("platform", "linkedin").eq("kind", "commented").gte("first_seen", new Date(Date.now() - 7 * 864e5).toISOString()).limit(500);
  let n = 0;
  for (const e of es ?? []) {
    const m = askedFor(e.said, ms); if (!m) continue;
    const { data: l } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key").eq("archived", false).eq("origin_key", "li-person:" + e.person_key).maybeSingle();
    if (l && await magnetHit(l as Lead, m, "comment", e.said)) n++;
  }
  return { asked: n };
}

// 2. Funding trigger (daily): founders of B2B startups (seed to Series C) who announced a round in the last two days, found on
//    LinkedIn and added as hot leads (source "funding"), so the bot writes them a "congrats on the raise" request for approval.
async function funding(b: any) {
  if (!EXA) return { skipped: "No Exa key" };
  const since = new Date(Date.now() - (+(b.days ?? 2)) * 864e5).toISOString();
  const schema = { type: "object", required: ["rounds"], properties: { rounds: { type: "array", items: { type: "object", properties: {
    company: { type: "string" }, what_it_does: { type: "string", description: "one line" }, sells_to_businesses: { type: "boolean", description: "true if B2B or B2B2C" },
    round: { type: "string", description: "Pre-seed, Seed, Series A, Series B or Series C" }, amount_usd: { type: "number" },
    founder_names: { type: "array", items: { type: "string" }, description: "founders or CEO named in the article" }, investors: { type: "string", description: "lead and other investors named" },
    source_url: { type: "string" } } } } } };   // (15 Nov) 10 fields at most through Composio: date and use of funds dropped
  const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "startup announces seed or Series A or Series B funding round, founders quoted", category: "news", numResults: 25, startPublishedDate: since, outputSchema: schema,
      systemPrompt: "List each startup funding round announced in these results: company, what it does, whether it sells to businesses, the round, the amount in USD, the founders named, and the article URL. Only facts the results state." }) });
  if (!res.ok) throw new Error("Exa answered " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json(); let cost = j.costDollars?.total ?? 0;
  const rounds = ((j.output?.content?.rounds ?? []) as any[]).filter((r) => r.company && r.sells_to_businesses !== false && /pre-?seed|seed|series [abc]\b/i.test(String(r.round ?? "")) && (r.founder_names ?? []).length);
  const { data: have } = await db.from("crm_leads").select("name,company,linkedin").eq("source", "LinkedIn").limit(5000);
  const key = (n: unknown, c: unknown) => String(n ?? "").toLowerCase().replace(/[^a-z]/g, "") + "|" + String(c ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = new Set((have ?? []).map((l: any) => key(l.name, l.company))), knownLi = new Set((have ?? []).map((l: any) => String(l.linkedin ?? "").toLowerCase().replace(/\/+$/, "")).filter(Boolean));
  let added = 0; const out: string[] = []; const K2 = await knownLeads();
  for (const r of rounds.slice(0, +(b.max ?? 10))) {
    // Exa sometimes gives the amount in millions (70 for $70M): small numbers are read as millions; anything odd is left out.
    const usd = +r.amount_usd > 0 && +r.amount_usd < 5000 ? +r.amount_usd * 1e6 : +r.amount_usd || 0;
    const amt = usd >= 1e5 && usd <= 5e8 ? "$" + (usd >= 1e6 ? Math.round(usd / 1e5) / 10 + "M" : Math.round(usd / 1e3) + "K") : "";
    const name = String(r.founder_names[0]).trim(); if (!name || known.has(key(name, r.company))) continue;
    const res2 = await addSignal("funding", { company: String(r.company).trim(), name, what: r.what_it_does, detail: "Raised " + [amt, r.round].filter(Boolean).join(" ") + (r.investors ? " from " + clip(String(r.investors), 80) : ""),
      url: String(r.source_url ?? ""), extra: { round: r.round ?? "", amount: amt, investors: clip(String(r.investors ?? ""), 160), date: String(r.announced ?? "").slice(0, 10), use: clip(String(r.use_of_funds ?? ""), 160) } }, K2);
    if (res2) { added++; known.add(key(name, r.company)); out.push(res2.who + " " + [r.round, amt].filter(Boolean).join(" ")); cost += res2.cost; }
  }
  await saveStatus({ last_funding: now(), last_funding_result: { found: rounds.length, added, people: out, cost } });
  return { found: rounds.length, added, people: out, cost };
}

// 4. Launches and hiring (14 Nov), daily with the funding search: founders launching on Product Hunt, Show HN or Launch HN
//    (they want distribution that day), and startups hiring a growth, GTM or founding marketing role (they need exactly us).
//    Same path as funding: find the founder on LinkedIn, skip anyone known, add as a hot lead with the signal and its link.
async function exaJson(body: any): Promise<{ out: any; cost: number }> {
  const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Exa answered " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json(); return { out: j, cost: j.costDollars?.total ?? 0 };
}
async function knownLeads() {
  const { data: have } = await db.from("crm_leads").select("name,company,linkedin").eq("source", "LinkedIn").limit(5000);
  const co = (c: unknown) => String(c ?? "").toLowerCase().replace(/\b(inc|labs?|ai|hq|co)\b/g, "").replace(/[^a-z0-9]/g, "");
  return { co, companies: new Set((have ?? []).map((l: any) => co(l.company)).filter(Boolean)), li: new Set((have ?? []).map((l: any) => String(l.linkedin ?? "").toLowerCase().replace(/\/+$/, "")).filter(Boolean)) };
}
// One founder for a company: by name when the source names one, else the founder or CEO whose LinkedIn headline names the company.
async function founderOf(company: string, name = ""): Promise<{ url: string; name: string; title: string; cost: number } | null> {
  const { out, cost } = await exaJson({ query: (name ? name + " " : "") + company + " founder CEO", category: "linkedin profile", numResults: 5, contents: { text: { maxCharacters: 600 } } });
  const first = name.split(/\s+/)[0], c = company.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ")[0];
  const hit = (out.results ?? []).find((x: any) => /linkedin\.com\/in\//.test(x.url ?? "") && (name ? new RegExp(first, "i").test(String(x.title ?? "") + " " + String(x.url ?? ""))
    : ((String(x.title ?? "") + " " + String(x.text ?? "").slice(0, 600)).toLowerCase().includes(c) && /founder|ceo|co-founder|cofounder/i.test(String(x.title ?? "") + " " + String(x.text ?? "").slice(0, 600)))));
  if (!hit) return null;
  const t = String(hit.title ?? "");
  // People results (15 Nov) can carry only the name as title; the headline is the first plain line of the profile text.
  const head = String(hit.text ?? "").split("\n").map((x: string) => x.trim()).find((x: string) => x && !x.startsWith("#")) ?? "";
  return { url: String(hit.url).split("?")[0].replace(/\/+$/, ""), name: name || t.split(/ [-|–] /)[0].trim(), title: (t.split(/ [-|–] /)[1] || head).slice(0, 80) || "Founder", cost };
}
// (15 Nov) A LinkedIn member's headline by their profile id: role and company ("Founder @ Hyperspell | ..." / "CEO at X").
async function headlineOf(pid: string, name: string): Promise<{ role: string; company: string } | null> {
  const { out } = await exaJson({ query: name + " LinkedIn", category: "linkedin profile", numResults: 5, contents: { text: { maxCharacters: 500 } } });
  const hit = (out.results ?? []).find((x: any) => String(x.url ?? "").toLowerCase().replace(/\/+$/, "").endsWith("/in/" + pid.toLowerCase()));
  if (!hit) return null;
  const t = String(hit.title ?? ""), head = (t.split(/ [-|–] /)[1] || String(hit.text ?? "").split("\n").map((x: string) => x.trim()).find((x: string) => x && !x.startsWith("#")) || "").trim();
  const m = head.match(/^(.*?)\s+(?:@|at)\s+([^|,·]+)/i);
  return { role: (m ? m[1] : head.split("|")[0]).trim().slice(0, 120), company: (m ? m[2] : "").trim().slice(0, 80) };
}
// guess: the founder was matched by company name only (Product Hunt's feed names the hunter, not the makers), so the lead comes
// in Warm, for Reyansh to check on Leads > Signals, and the bot doesn't write them a request on its own.
// Their X account (14 Nov): twitterapi.io's people search by name. A match needs the same name, and their bio or website naming
// the company (or an exact name match when the company is a common word). Exa no longer indexes X profiles.
async function findX(name: string, company: string): Promise<string> {
  if (!TWAPI || !name) return "";
  try {
    const r = await fetch("https://api.twitterapi.io/twitter/user/search?query=" + encodeURIComponent(name), { headers: { "X-API-Key": TWAPI } });
    if (!r.ok) return "";
    const users = ((await r.json()).users ?? []) as any[];
    const norm = (x: unknown) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
    const n = norm(name), co = norm(String(company).replace(/\b(inc|labs?|ai|hq|co)\b/gi, "")), first = norm(name.split(/\s+/)[0]);
    const scored = users.map((u) => { const nm = norm(u.name), bio = norm(String(u.description ?? "") + " " + String(u.url ?? "") + " " + JSON.stringify(u.entities ?? ""));
      return { u, s: (nm === n ? 2 : nm.includes(first) ? 1 : 0) + (co.length >= 3 && bio.includes(co) ? 3 : 0) }; }).filter((x) => x.s >= 3 || (x.s === 2 && users.length <= 3));
    scored.sort((a, b) => b.s - a.s);
    return scored[0] ? String(scored[0].u.userName ?? scored[0].u.username ?? scored[0].u.screen_name ?? "") : "";
  } catch (_) { return ""; }
}
const WHY: Record<string, string> = { funding: "Just raised: founders spend on GTM right after a round, and they're hiring for it now.",
  hiring: "Hiring for growth or GTM: they need pipeline now, and we can run it faster than a new hire can ramp.",
  launch: "Just launched: they want distribution this week, and launch traffic fades fast without a system behind it." };
async function addSignal(kind: string, it: { company: string; name?: string; what?: string; detail: string; url: string; guess?: boolean; extra?: Record<string, unknown> }, K: any) {
  if (!it.company || K.companies.has(K.co(it.company))) return null;
  // A search that can't run at all (out of credits, Exa down) stops the whole run so the page says why; a person not found is just skipped.
  const f = await founderOf(it.company, it.name ?? "").catch((e) => { if (/40[0-9]|50[0-9]|credit/i.test(String(e))) throw e; return null; }); if (!f || !f.name) return null;
  if (K.li.has(f.url.toLowerCase())) return null;
  const x = await findX(f.name, it.company);
  const { error } = await db.from("crm_leads").insert({ name: f.name, company: it.company, role: f.title, source: "LinkedIn", stage: "New", heat: "Warm", linkedin: f.url, x_handle: x ? "@" + x : "",
    origin_key: "li-src:" + kind + ":" + f.url.toLowerCase(), source_detail: it.detail + (it.url ? " (" + clip(it.url, 160) + ")" : ""),
    fields: { li: { src: kind, signal: it.detail, signal_url: it.url, signal_status: "new", ...(it.guess ? { check: "founder matched by company name: check it's the right person" } : {}) },
      signal: { kind, headline: it.detail, url: it.url, what: clip(String(it.what ?? ""), 240), why: WHY[kind] ?? "", found_at: now(), guess: !!it.guess, ...(it.extra ?? {}) },
      li_icp: { one_liner: clip(String(it.what ?? ""), 200) } } });
  if (error) return null;
  K.companies.add(K.co(it.company)); K.li.add(f.url.toLowerCase());
  return { who: f.name + " (" + it.company + ")", cost: f.cost };
}
async function launches(b: any) {
  if (!EXA) return { skipped: "No Exa key" };
  const K = await knownLeads(), max = +(b.max ?? 8), people: string[] = []; let cost = 0, found = 0;
  // Hacker News: Launch HN (YC companies launching) and Show HN posts that took off, from HN's free search API.
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;   // Launch HN is a few a week; Show HN needs 30+ points
  const hn = async (q: string) => { const r = await fetch("https://hn.algolia.com/api/v1/search_by_date?" + q + "&numericFilters=created_at_i>" + since + "&hitsPerPage=50"); return r.ok ? (await r.json()).hits ?? [] : []; };
  const items: any[] = [];
  for (const h of await hn("query=%22Launch%20HN%22&tags=story")) { const m = String(h.title ?? "").match(/^Launch HN:\s*([^(–\-:]+?)\s*(\(YC [^)]+\))?\s*[–\-:]\s*(.+)$/i); if (m) items.push({ company: m[1].trim(), what: m[3], detail: "Launched on Hacker News (Launch HN" + (m[2] ? ", " + m[2].slice(1, -1) : "") + ")", url: "https://news.ycombinator.com/item?id=" + h.objectID }); }
  for (const h of await hn("tags=show_hn")) { if ((h.points ?? 0) < 30) continue; const m = String(h.title ?? "").match(/^Show HN:\s*([^–\-:]+?)\s*[–\-:]\s*(.+)$/i); if (m) items.push({ company: m[1].trim(), what: m[2], detail: "Show HN with " + h.points + " points", url: "https://news.ycombinator.com/item?id=" + h.objectID }); }
  // Product Hunt: the public launch feed (no key needed), launches from the last two days whose tagline reads B2B.
  try {
    const r = await fetch("https://www.producthunt.com/feed", { headers: { "User-Agent": "Mozilla/5.0 (compatible; SOVE7GN CRM)" } });
    const x = r.ok ? await r.text() : "";
    const dec = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|’/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const B2B = /\b(team|teams|sales|b2b|saas|crm|developer|developers|api|agent|agents|workflow|automation|enterprise|business|businesses|startup|founder|marketing|analytics|data|devops|security|finance|ops|hiring|recruit|customer|support|revenue|pipeline|leads?)\b/i;
    const B2C = /\b(game|dating|recipe|wallpaper|meme|photo filter|kids|fitness|diet|horoscope|music player)\b/i;
    for (const e of x.split("<entry>").slice(1)) {
      const at = Date.parse((e.match(/<updated>([^<]+)/) || [])[1] || ""), title = dec((e.match(/<title>([^<]+)/) || [])[1] || ""), link = (e.match(/href="(https:\/\/www\.producthunt\.com\/products\/[^"?]+)/) || [])[1] || "";
      const tag = dec(((e.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "").split("Discussion")[0]);
      if (!title || !at || Date.now() - at > 2 * 864e5 || !B2B.test(tag + " " + title) || B2C.test(tag)) continue;
      items.push({ company: title.replace(/\s+(AI|App|\.io|\.ai)$/i, "").trim(), what: tag, detail: "Launched " + title + " on Product Hunt", url: link, guess: true });
    }
  } catch (_) { /* Product Hunt is best effort */ }
  found = items.length;
  for (const it of items) { if (people.length >= max) break; const r = await addSignal("launch", it, K); if (r) { people.push(r.who); cost += r.cost; } }
  await saveStatus({ last_launches: now(), last_launches_result: { found, added: people.length, people, cost } });
  return { found, added: people.length, people, cost };
}
async function hiring(b: any) {
  if (!EXA) return { skipped: "No Exa key" };
  const K = await knownLeads(), max = +(b.max ?? 8), people: string[] = []; let cost = 0;
  const { out, cost: c } = await exaJson({ query: "startup job opening: Head of Growth, Founding GTM, Growth Marketer, Head of Marketing, first marketing hire, GTM Engineer at a seed to Series C B2B startup",
    includeDomains: ["ycombinator.com", "wellfound.com", "jobs.ashbyhq.com", "boards.greenhouse.io", "jobs.lever.co", "workatastartup.com"], numResults: 30, startPublishedDate: new Date(Date.now() - 4 * 864e5).toISOString(),
    outputSchema: { type: "object", required: ["jobs"], properties: { jobs: { type: "array", items: { type: "object", properties: { company: { type: "string" }, role: { type: "string" }, what_company_does: { type: "string" },
      sells_to_businesses: { type: "boolean" }, stage: { type: "string", description: "Pre-seed, Seed, Series A, B, C, later, or unknown" }, url: { type: "string" } } } } } },
    systemPrompt: "List each job opening in these results for a growth, GTM, marketing or demand generation role: company, role title, what the company does, whether it sells to businesses, its funding stage, and the job URL. Only facts the results state." });
  cost += c;
  const jobs = ((out.output?.content?.jobs ?? []) as any[]).filter((j) => j.company && /growth|gtm|go.to.market|marketing|demand|revops|founding/i.test(String(j.role ?? "")) && j.sells_to_businesses !== false && !/series [d-z]|later|public/i.test(String(j.stage ?? "")));
  for (const j of jobs) { if (people.length >= max) break; const r = await addSignal("hiring", { company: String(j.company).trim(), what: j.what_company_does, detail: "Hiring a " + clip(String(j.role), 60) + (j.stage && !/unknown/i.test(j.stage) ? " (" + j.stage + ")" : ""), url: j.url ?? "",
        extra: { role: clip(String(j.role), 80), stage: j.stage && !/unknown/i.test(j.stage) ? j.stage : "", job_url: j.url ?? "" } }, K); if (r) { people.push(r.who); cost += r.cost; } }
  await saveStatus({ last_hiring: now(), last_hiring_result: { found: jobs.length, added: people.length, people, cost } });
  return { found: jobs.length, added: people.length, people, cost };
}
// The daily job (cron li-bot-signals, 9:00 IST): launches, then hiring. Funding runs on its own at 8:30.
// (15 Nov) Shown on Leads > Signals when a run can't search at all (e.g. Exa out of credits), instead of a silent "0 added".
async function signalFail(kind: string, e: unknown) {
  const msg = String((e as Error)?.message ?? e);
  const why = /402|credit/i.test(msg) ? "Exa is out of credits: top up at dashboard.exa.ai" : "Search failed: " + clip(msg, 140);
  await saveStatus({ ["last_" + kind]: now(), ["last_" + kind + "_result"]: { found: 0, added: 0, people: [], cost: 0, error: why } });
  return { error: why };
}
async function signals_daily(b: any) {
  const a = await launches(b).catch((e) => ({ error: String(e) })), h = await hiring(b).catch((e) => ({ error: String(e) }));
  return { launches: a, hiring: h };
}

// Signals review (14 Nov), from Leads > Signals: find their LinkedIn and X again, add them to outreach, or trash them.
async function signalLead(id: string) { const { data } = await db.from("crm_leads").select("*").eq("id", id).maybeSingle(); return data as any; }
async function signal_find(b: any) {
  const l = await signalLead(b.lead_id); if (!l) return { ok: false, error: "No such lead" };
  const patch: any = {}; let cost = 0;
  if (!l.linkedin || b.relook) { const f = await founderOf(l.company, b.relook ? "" : l.name).catch(() => null); if (f) { patch.linkedin = f.url; if (!l.name || b.relook) patch.name = f.name; patch.role = f.title; cost += f.cost; } }
  const x = await findX(patch.name ?? l.name, l.company); if (x) patch.x_handle = "@" + x;
  if (Object.keys(patch).length) await db.from("crm_leads").update(patch).eq("id", l.id);
  return { ok: true, linkedin: patch.linkedin ?? l.linkedin, x: patch.x_handle ?? l.x_handle ?? "", cost };
}
async function signal_approve(b: any) {
  const l = await signalLead(b.lead_id); if (!l) return { ok: false, error: "No such lead" };
  const li = { ...(l.fields?.li ?? {}), signal_status: "approved", approved_at: now() };
  await db.from("crm_leads").update({ heat: "Hot", archived: false, fields: { ...(l.fields ?? {}), li } }).eq("id", l.id);
  await log(l.id, "Added to outreach from Leads > Signals (" + (l.fields?.signal?.headline ?? l.source_detail ?? "signal") + ").", "engaged");
  // A request written before review and set aside would block a new one (one per person): clear it so the next plan writes it.
  await db.from("crm_li_tasks").delete().eq("lead_id", l.id).eq("kind", "invite").eq("status", "skipped");
  let x = "";
  if (b.x !== false && l.x_handle) x = await toXPipeline(l).catch((e) => "not added: " + String(e).slice(0, 80));
  if (x) await db.from("crm_leads").update({ fields: { ...(l.fields ?? {}), li: { ...li, x_pipeline: x } } }).eq("id", l.id);
  return { ok: true, linkedin: !!l.linkedin, x };
}
async function signal_trash(b: any) {
  const l = await signalLead(b.lead_id); if (!l) return { ok: false, error: "No such lead" };
  const li = { ...(l.fields?.li ?? {}), signal_status: "trashed", trashed_at: now() };
  await db.from("crm_leads").update({ archived: true, fields: { ...(l.fields ?? {}), li } }).eq("id", l.id);
  await stopTasks(l.id, "Trashed on Leads > Signals");
  return { ok: true };
}
// A row in the X DM Pipeline (same columns the X lead finder writes), with the signal as the hook. It shows on X > Send today.
async function toXPipeline(l: any, opener = ""): Promise<string> {
  const h = String(l.x_handle ?? "").replace(/^@/, ""); if (!h) return "no X handle";
  const { data: rows } = await db.from("crm_sheet").select("tab,row,cells").in("tab", ["DM Pipeline", "DM Templates"]).order("row").limit(5000);
  const P = (rows ?? []).filter((r: any) => r.tab === "DM Pipeline"), hdr = P.find((r: any) => (r.cells ?? []).includes("X handle"));
  if (!hdr) return "no DM Pipeline header";
  const ix = (k: string) => (hdr.cells as string[]).indexOf(k);
  if (P.some((r: any) => r.row > hdr.row && String(r.cells?.[ix("X handle")] ?? "").replace(/^@/, "").toLowerCase() === h.toLowerCase())) return "already in the X pipeline";
  const T = (rows ?? []).filter((r: any) => r.tab === "DM Templates"), th = T.find((r: any) => (r.cells ?? [])[0] === "ID");
  const live = th ? T.filter((r: any) => r.row > th.row && /^[A-Z]\d+[A-Z]?$/.test(String(r.cells?.[0] ?? "")) && !/^off/i.test(String(r.cells?.[(th.cells as string[]).indexOf("Verdict")] ?? ""))).map((r: any) => String(r.cells[0])) : [];
  const used = (id: string) => P.filter((r: any) => r.row > hdr.row && r.cells?.[ix("Template")] === id).length;
  const tpl = live.sort((a: string, b: string) => used(a) - used(b))[0] ?? "";
  const next = Math.max(...P.map((r: any) => r.row)) + 1, sig = l.fields?.signal ?? {}, kind = sig.kind ?? l.fields?.li?.src ?? "";
  const seg = kind === "comp" ? "Competitor audience" : kind === "funding" ? "Raised recently" : kind === "hiring" ? "Hiring signal" : kind === "list" ? clip(String(l.fields?.li?.list ?? "Founder list"), 40) : kind === "from_li" ? "From LinkedIn" : "Launch";
  const hook = kind === "comp" ? "" : kind === "funding" ? "Congrats on the " + ([sig.round, sig.amount].filter(Boolean).join(" ") || "raise") + "." : kind === "hiring" ? "Saw you're hiring a " + (sig.role || "growth lead") + "." : kind === "launch" ? "Congrats on the launch." : "";
  const ist = new Date(Date.now() + IST_MS); const stamp = ist.getUTCDate() + " " + MON3[ist.getUTCMonth()] + " " + ist.getUTCFullYear() + " " + String(ist.getUTCHours()).padStart(2, "0") + ":" + String(ist.getUTCMinutes()).padStart(2, "0");
  const via = kind === "comp" ? "Sent from Competitors > Leads on " : kind === "from_li" ? "Added from LinkedIn (handle found by the bot) on " : "Added from Leads > Signals on ";
  const writes = [{ row: next, col: ix("Name") + 1, values: [[l.name, l.company || "Unknown", l.role || "Founder", "Reyansh", "X DM", "Cold", seg, "9", h, l.linkedin || "", "", clip(String(sig.headline ?? l.source_detail ?? ""), 180), sig.url || "", stamp, opener ? "" : tpl, opener, "To send"]] },
    { row: next, col: ix("Notes") + 1, values: [[via + stamp + ". " + (sig.why ?? "") + (sig.what ? " " + l.company + ": " + sig.what : "")]] },
    { row: next, col: ix("Funding stage") + 1, values: [[kind === "funding" ? [sig.round, sig.amount, sig.date].filter(Boolean).join(", ") : sig.stage || "", sig.url || "", hook]] }];
  const { error } = await db.rpc("crm_call", { body: { action: "rows", writes } });
  if (error) return "not added: " + error.message;
  return "added to X > Send today";
}

// 30 new people a day (14 Nov): 20 first touches on LinkedIn + 10 X DMs (settings li_bot.daily_new / x_bot.daily_new).
// day_stats: where today stands. prospects (daily 7:00 IST, and from the CRM): when fewer LinkedIn first touches are sent or queued
// today than the target, an ICP search on LinkedIn profiles fills the gap with founders at B2B startups, seed to Series C.
// They go through the same research and fit check; their requests wait for Reyansh's OK like any other first touch.
async function dayStats() {
  const dayStart = ptDayStart();
  const { data: bs } = await db.from("crm_lead_settings").select("key,value").in("key", ["li_bot", "x_bot"]);
  const v = (k: string) => (bs ?? []).find((r: any) => r.key === k)?.value ?? {};
  const liT = +(v("li_bot").daily_new ?? 20) || 20, xT = +(v("x_bot").daily_new ?? 10) || 10;
  const first = ["invite", "dm", "inmail", "accept"];
  const { count: liSent } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).in("kind", first).eq("status", "sent").gte("sent_at", dayStart);
  const { count: liWait } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).in("kind", first).in("status", ["review", "ready", "sending"]);
  const { count: xSent } = await db.from("crm_x_tasks").select("id", { count: "exact", head: true }).eq("kind", "dm").eq("status", "sent").gte("sent_at", dayStart);
  const { count: xWait } = await db.from("crm_x_tasks").select("id", { count: "exact", head: true }).eq("kind", "dm").in("status", ["ready", "sending"]);
  return { li_target: liT, x_target: xT, li_sent: liSent ?? 0, li_waiting: liWait ?? 0, x_sent: xSent ?? 0, x_waiting: xWait ?? 0 };
}
async function day_stats(_b: any) { return await dayStats(); }
const ICP_QUERIES = ["founder and CEO of a seed-stage B2B SaaS startup", "co-founder CEO of a Series A AI startup selling to businesses", "Y Combinator founder building B2B software 2026",
  "founder of a venture-backed developer tools startup", "co-founder of a Series B B2B fintech or vertical SaaS startup", "founder CEO of an AI agents startup for enterprises, recently raised"];
async function prospects(b: any) {
  if (!EXA) return { skipped: "No Exa key" };
  const d = await dayStats();
  // Uncontacted fits already waiting in the pool count too: the next plan run writes their requests.
  const leads = await pool(await settings());
  const ready = leads.filter((l) => !l.fields?.li?.req && !l.fields?.li?.dm && !l.fields?.li?.stop && !notFit(l)).length;
  // (16 Nov) Fits not written up yet don't count: Leads found always gets topped up to today's target with new founders.
  const need = Math.max(0, d.li_target - d.li_sent - d.li_waiting);
  if (!need && !b.force) return { need: 0, ...d, ready };
  const K = await knownLeads(); const added: string[] = []; let cost = 0, tried = 0;
  const startQ = new Date().getUTCDate() % ICP_QUERIES.length;
  for (let i = 0; i < ICP_QUERIES.length && added.length < (b.force ? +(b.max ?? 10) : need); i++) {
    const q = ICP_QUERIES[(startQ + i) % ICP_QUERIES.length];
    const { out, cost: c } = await exaJson({ query: q, category: "linkedin profile", numResults: 25,
      outputSchema: { type: "object", required: ["people"], properties: { people: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, title: { type: "string", description: "current job title" }, company: { type: "string", description: "current company name only" },
        linkedin_url: { type: "string" }, is_founder_or_ceo: { type: "boolean" }, sells_to_businesses: { type: "boolean" }, company_stage: { type: "string", description: "pre-seed, seed, Series A, B, C, later, or unknown" } } } } } },
      systemPrompt: "List each person whose LinkedIn profile is in these results: their name, current title, current company (name only), the profile URL, whether they are a founder or CEO of that company, whether the company sells to businesses, and its funding stage if stated." }).catch(() => ({ out: {}, cost: 0 }));
    cost += c; tried++;
    for (const p of out.output?.content?.people ?? []) {
      if (added.length >= (b.force ? +(b.max ?? 10) : need)) break;
      const url = String(p.linkedin_url ?? "").split("?")[0].replace(/\/+$/, ""), name = String(p.name ?? "").trim(), co = String(p.company ?? "").trim();
      if (!/linkedin\.com\/in\//.test(url) || K.li.has(url.toLowerCase()) || !name || !co || p.is_founder_or_ceo === false || p.sells_to_businesses === false) continue;
      if (/series [d-z]|later|public|acquired/i.test(String(p.company_stage ?? "")) || K.companies.has(K.co(co))) continue;
      const { error } = await db.from("crm_leads").insert({ name, company: co, role: clip(String(p.title || "Founder"), 120), source: "LinkedIn", stage: "New", heat: "Hot", linkedin: url,
        origin_key: "li-src:prospect:" + url.toLowerCase(), direction: "Outbound", source_detail: "Found by the daily ICP search: “" + q + "”",
        fields: { li: { src: "prospect" }, ...(p.company_stage && !/unknown/i.test(p.company_stage) ? { li_icp: { funding: p.company_stage } } : {}) } });
      if (!error) { added.push(name + " (" + co + ")"); K.li.add(url.toLowerCase()); K.companies.add(K.co(co)); }
    }
  }
  await saveStatus({ last_prospects: now(), last_prospects_result: { need, added: added.length, people: added.slice(0, 12), cost, ...d } });
  return { need, added: added.length, people: added, cost, ...d, ready };
}

// Founder lists (14 Nov): a list Reyansh built (name, company, LinkedIn, X, warm link, round, first DM). Each person becomes a hot
// LinkedIn lead with a connection note and first DM written for them (both wait for his OK), and an X DM Pipeline row with the
// list's first DM as the opener (sent from X > Send today). Someone already in Leads gets the list's details added instead.
async function import_list(b: any) {
  const rows = Array.isArray(b.rows) ? b.rows : []; const list = String(b.list ?? "Founder list");
  const out = { added: 0, merged: 0, x: 0, notes: 0, skipped: [] as string[] };
  const { data: have } = await db.from("crm_leads").select("id,name,company,linkedin,fields,x_handle,stage,archived").eq("source", "LinkedIn").limit(8000);
  const slug = (u: unknown) => String(u ?? "").toLowerCase().replace(/^https?:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/in\//, "").replace(/[/?#].*$/, "");
  const bySlug = new Map((have ?? []).map((l: any) => [slug(l.linkedin), l]));
  for (const r of rows) {
    const li0 = String(r.linkedin ?? "").replace(/\/+$/, ""); const sg = slug(li0); if (!sg) { out.skipped.push(r.name + ": no LinkedIn"); continue; }
    const x = String(r.x ?? "").replace(/^@/, "");
    const note = clip(String(r.note ?? ""), 300), dm1 = String(r.li_dm ?? r.dm ?? ""), xdm = String(r.dm ?? "");   // LinkedIn first DM / X opener
    const extra = { list, warm: r.warm ?? "", dm1, note: undefined as unknown };
    let l: any = bySlug.get(sg) ?? (have ?? []).find((h: any) => String(h.name ?? "").toLowerCase() === String(r.name ?? "").toLowerCase() && String(h.company ?? "").toLowerCase() === String(r.company ?? "").toLowerCase());
    const detail = list + ": " + [r.batch ? "YC " + r.batch : "", r.round, r.warm ? "follows " + r.warm + " from Aktoria" : ""].filter(Boolean).join(" · ");
    // (16 Nov) Everything the list knows about them goes on their card: funding, investor, accelerator, team size, where, education.
    const m = r.meta ?? {}; const day = now().slice(0, 10), src = String(m.source ?? "");
    const iv = (v: unknown) => (v == null || v === "" ? undefined : { v, src, at: day, by: "list" });
    const intel = Object.fromEntries(Object.entries({ accelerator: iv(m.accelerator), employees: iv(m.headcount ? +m.headcount || undefined : undefined), round: iv(m.round_std),
      amount: iv(m.amount_usd || undefined), date: iv(m.announced), hq: iv(m.hq), description: iv(m.what), investors: iv(m.lead_investor), education: iv(m.education),
      founder_location: iv(m.location), email: iv(m.email) }).filter(([, v]) => v));
    const icp = { funding: m.funding ?? r.round ?? "", one_liner: clip(String(m.what ?? r.what ?? ""), 200), hq_city: m.hq_city ?? "", hq_country: m.hq_country ?? "", at: m.funding ? now() : undefined };
    if (l && l.archived) { out.skipped.push(r.name + ": already in the CRM, archived (old flow), left alone"); continue; }
    if (l) {
      const li = { ...(l.fields?.li ?? {}), list, warm: r.warm ?? "", ...(l.fields?.li?.dm ? {} : { dm1 }) };
      const g0 = l.fields?.gtm ?? {};
      await db.from("crm_leads").update({ heat: "Hot", x_handle: l.x_handle || (x ? "@" + x : ""), email: l.email || m.email || "", fields: { ...(l.fields ?? {}), li,
        li_icp: { ...icp, ...Object.fromEntries(Object.entries(l.fields?.li_icp ?? {}).filter(([, v]) => v)) }, gtm: { ...g0, intel: { ...intel, ...(g0.intel ?? {}) } } } }).eq("id", l.id);
      await log(l.id, "Also on " + detail, "engaged"); out.merged++;
    } else {
      const ins = await db.from("crm_leads").insert({ name: r.name, company: r.company, role: r.role || "Founder", source: "LinkedIn", stage: "New", heat: "Hot", linkedin: li0, x_handle: x ? "@" + x : "",
        origin_key: "li-src:list:" + sg, direction: "Outbound", source_detail: detail, notes: [r.what ? r.company + ": " + r.what : "", m.source ? "Source: " + m.source : ""].filter(Boolean).join("\n"),
        email: m.email || "", website: m.website || "", group_name: list,
        fields: { li: { src: "list", list, warm: r.warm ?? "", dm1 }, li_icp: icp, gtm: { intel } } }).select("*").maybeSingle();
      l = ins.data; if (!l) { out.skipped.push(r.name + ": " + (ins.error?.message ?? "not added")); continue; }
      out.added++;
    }
    // The connection note, written for them: waits for Reyansh's OK on LinkedIn > Pipeline (never replaces one already sent).
    if (note && !l.fields?.li?.req) {
      await db.from("crm_li_tasks").delete().eq("lead_id", l.id).eq("kind", "invite").in("status", ["review", "skipped"]);
      const { error } = await db.from("crm_li_tasks").insert({ lead_id: l.id, kind: "invite", step: 0, text: note, status: "review" });
      if (!error) out.notes++;
    }
    if (x) { const w = await toXPipeline({ ...l, x_handle: "@" + x, fields: { ...(l.fields ?? {}), signal: { kind: "list", headline: detail, url: li0, why: "" } } }, xdm).catch(() => "");
      if (/added/.test(w)) out.x++; }
  }
  return out;
}

// 3b. LinkedIn leads on X too (15 Nov). Every LinkedIn lead we're working with (fits the ICP, researched, not won or lost)
// gets their X handle looked up (twitterapi.io, once each) and a row in the X DM Pipeline, which puts them in X > Pipeline > To
// approve. The opener follows the same pattern as everywhere: offer the 3 ideas (follow-up 1 sends them, then the booking link,
// then the VSL), never pitch first; anyone who already got the ideas on LinkedIn gets the call ask instead (x_plan rewrites it).
// (16 Nov) First DMs waiting in X > Pipeline > To approve get their v2 opener written ahead (ideas saved, Opener column
// rewritten, Template X2), so what Reyansh approves is exactly what goes out. A few rows per run (every 15 minutes).
async function xv2_prepare(b: any) {
  const { data: rows } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Pipeline").order("row").limit(4000);
  const all = rows ?? []; const h = all.find((r: any) => (r.cells ?? []).includes("X handle")); if (!h) return { done: 0 };
  const T2 = await xv2Texts(); let done = 0; const max = +(b.max ?? 6);
  const { data: q } = await db.from("crm_x_tasks").select("row").eq("kind", "dm").in("status", ["ready", "sending"]);
  const queued = new Set((q ?? []).map((t: any) => t.row));
  for (const r of all.filter((x: any) => x.row > h.row)) {
    if (done >= max) break;
    const c: Record<string, string> = {}; (h.cells as string[]).forEach((k, i) => { if (k) c[k] = String(r.cells?.[i] ?? ""); });
    if (!c["Name"] || !c["X handle"] || !/^(to send|)$/i.test(c["Status"] || "") || /^X2/.test(c["Template"] || "") || queued.has(r.row)) continue;
    if (Object.values(c).some((v) => v === "Followed us")) continue;
    const ld = await leadByHandle(c["X handle"]); const gotLi = !!(ld && (ld.fields?.tips?.sent_at || ld.fields?.li?.tips_dm));
    const ideas = gotLi ? [] : await xIdeasFor(c["X handle"], c).catch(() => []); if (!gotLi && !ideas.length) continue;
    const text = xv2Fill(gotLi ? T2.first_li : T2.first, c, ideas);
    await db.rpc("crm_call", { body: { action: "pipeline", row: r.row, name: c["Name"], company: c["Company"], cells: { Template: gotLi ? "X2L" : "X2", "Opener (30-40 words)": text } } });
    done++;
  }
  return { done };
}
// (16 Nov) What a DM Pipeline row's X v2 opener and follow-ups would say (nothing is sent; the ideas get saved for later).
async function xv2_preview(b: any) {
  const c = await pipeRow(+b.row); if (!c) return { error: "no such row" };
  const T2 = await xv2Texts(); const ideas = await xIdeasFor(c["X handle"], c);
  return { name: c["Name"], company: c["Company"], ideas, first: xv2Fill(T2.first, c, ideas), fu: T2.fu.map((f: string) => xv2Fill(f, c, ideas)) };
}
async function x_from_li(b: any) {
  const leads = await pool(await settings());
  const live = leads.filter((l) => /^li-(person|src):/.test(String(l.origin_key ?? "")) && !/^(won|lost|cold lead)$/i.test(String(l.stage ?? "")) && !notFit(l) &&
    l.fields?.li?.stop !== "skipped" && !["new", "trashed"].includes(String(l.fields?.li?.signal_status ?? "")) && (l.fields?.li_icp?.at || l.fields?.li?.src === "list") && !l.fields?.x_li?.done);
  let looked = 0, added = 0, none = 0; const people: string[] = [];
  for (const l of live) {
    if (looked >= +(b.max ?? 12) && !l.x_handle) continue;
    let h = String(l.x_handle ?? "").replace(/^@/, "");
    if (!h) {
      if (l.fields?.x_li?.looked) continue;
      looked++;
      h = await findX(l.name, l.company ?? "").catch(() => "");
      l.fields = { ...(l.fields ?? {}), x_li: { looked: now(), found: h || "" } };
      await db.from("crm_leads").update({ fields: l.fields, ...(h ? { x_handle: "@" + h } : {}) }).eq("id", l.id);
      if (!h) { none++; continue; }
    }
    const first = firstName(l.name), co = l.company && !/^unknown$/i.test(l.company) ? l.company : "your company", li = l.fields?.li ?? {};
    const onLi = li.acc || li.dm || li.req;
    const opener = onLi ? "Hey " + first + ", we're connected on LinkedIn too. Have 3 quick ideas that could lift " + co + (/s$/i.test(co) ? "'" : "'s") + " inbound, want me to send them over?"
      : "Hey " + first + ", came across what you're building at " + co + ". We got a YC company 100K+ views on X and multiple enterprise sales calls in 2 weeks, all organic. Have 3 quick ideas that could lift " + co + (/s$/i.test(co) ? "'" : "'s") + " inbound, want me to send them over?";
    const w = await toXPipeline({ ...l, x_handle: "@" + h, fields: { ...(l.fields ?? {}), signal: { kind: "from_li", headline: "From LinkedIn: " + clip(String(l.source_detail ?? ""), 150), url: l.linkedin ?? "", why: "" } } }, opener).catch(() => "");
    if (/added|already/.test(w)) { await db.from("crm_leads").update({ fields: { ...(l.fields ?? {}), x_li: { ...(l.fields?.x_li ?? {}), done: now(), handle: h } } }).eq("id", l.id); }
    if (/added/.test(w)) { added++; people.push(l.name + " (@" + h + ")"); }
  }
  await saveStatus({ last_x_from_li: now(), last_x_from_li_result: { looked, added, none, people: people.slice(0, 12) } });
  return { looked, added, none, people };
}

// 3. Website visitors (RB2B or any tool that posts JSON): li-bot?visitor=<VISITOR_KEY>. Each identified visitor becomes a hot lead
//    (source "site"), or a known lead gets the visit on its history.
const VISITOR_KEY = Deno.env.get("VISITOR_KEY") ?? "";
async function visitorHook(req: Request, key: string) {
  if (!VISITOR_KEY || key !== VISITOR_KEY) return json({ error: "Bad key" }, 401);
  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body) ? body : [body];
  let added = 0, seen = 0;
  for (const v of list) {
    const pick = (...ks: string[]) => { for (const k of ks) { const val = v[k] ?? v[k.toLowerCase()] ?? v[k.replace(/ /g, "_").toLowerCase()]; if (val) return String(val).trim(); } return ""; };
    const li = pick("LinkedIn URL", "linkedin_url", "linkedin", "LinkedInUrl").split("?")[0].replace(/\/+$/, "");
    const name = pick("Full Name", "name") || [pick("First Name", "first_name"), pick("Last Name", "last_name")].filter(Boolean).join(" ");
    const page = pick("Captured URL", "page", "url"), co = pick("Company Name", "company"), title = pick("Title", "job_title", "title");
    if (!li && !name) continue;
    const { data: l } = li ? await db.from("crm_leads").select("id,fields,stage").ilike("linkedin", li + "%").limit(1).maybeSingle() : { data: null };
    const note = "Visited " + (page || "sove7gn.org") + (title || co ? " (" + [title, co].filter(Boolean).join(", ") + ")" : "");
    if (l) { await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "engaged", text: note, by_email: "automation" });
      await db.from("crm_leads").update({ heat: "Hot", fields: { ...(l.fields ?? {}), li: { ...((l.fields ?? {}).li ?? {}), site_at: now() } } }).eq("id", l.id); seen++; continue; }
    const { error } = await db.from("crm_leads").insert({ name: name || "Website visitor", company: co, role: title, source: "LinkedIn", stage: "New", heat: "Hot", linkedin: li,
      origin_key: "li-src:site:" + (li || name).toLowerCase(), source_detail: note, fields: { li: { src: "site", site_at: now() } } });
    if (!error) added++;
  }
  return json({ ok: true, added, seen });
}

// ───────── Refresh (13 Nov): the CRM's Refresh button asks the extension for a LinkedIn read now ─────────
// refresh: called by the CRM. poll: the extension asks every few minutes whether a read was asked for (then runs its sync).
async function refresh(_b: any) {
  await saveStatus({ refresh_at: now() });
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  const seen = Date.parse((data?.value as any)?.seen ?? "") || 0;
  return { ok: true, extension_seen_min: seen ? Math.round((Date.now() - seen) / 60e3) : null };
}
async function poll(_b: any) {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  const v: any = data?.value ?? {};
  const it = v.inmail_test && !v.inmail_test.done && Date.now() - (Date.parse(v.inmail_test.at ?? "") || 0) < 3600e3 ? v.inmail_test : null;
  const { data: cu } = await db.from("crm_lead_settings").select("value").eq("key", "catchup").maybeSingle(); const cv: any = cu?.value ?? {};
  return { reconcile: (Date.parse(cv.req_at ?? "") || 0) > (Date.parse(cv.li_at ?? "") || 0) && Date.now() - (Date.parse(cv.req_at ?? "") || 0) < 3600e3,
    sync: (Date.parse(v.refresh_at ?? "") || 0) > (Date.parse(v.last_scan ?? "") || 0) && (Date.now() - (Date.parse(v.refresh_at ?? "") || 0)) < 3600e3,
    inmail_test: it ? { urn: it.urn, pid: it.pid, profile: it.profile, name: it.name } : null };
}

// ───────── Moving a LinkedIn post to another day (13 Nov) ─────────
// LinkedIn posts live in the LinkedIn queue sheet (Queue tab: Post text, Image URL, Date, Slot, Status...), which the CRM only
// reads. The calendar saves each move in crm_lead_settings li_moves {key: {row, date "YYYY-MM-DD", text, at}} and shows it at
// once; this writes the new Date into the sheet (Queue column C) through Composio Google Sheets and marks the move applied.
// Moves still waiting (Google Sheets not connected yet, or a failed write) are retried by the 15-minute briefs job.
async function li_move(_b: any) {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_moves").maybeSingle();
  const moves = { ...((data?.value ?? {}) as Record<string, any>) };
  const todo = Object.entries(moves).filter(([, m]) => m && !m.applied && /^\d{4}-\d{2}-\d{2}$/.test(String(m.date ?? "")));
  if (!todo.length) return { applied: 0, waiting: 0, connected: null };
  const { data: rows } = await db.from("crm_sheet").select("cells").eq("tab", "Settings");
  const sheet = String(((rows ?? []).find((r: any) => String(r.cells?.[0] ?? "").trim() === "LinkedIn sheet")?.cells ?? [])[1] ?? "").trim();
  if (!sheet) return { applied: 0, waiting: todo.length, error: "No LinkedIn sheet in Settings" };
  let alias = "";
  try {
    const out = await mcp("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "googlesheets", action: "list" }] });
    const acc = (out?.data?.results?.googlesheets?.accounts ?? []).find((a: any) => a.status === "active");
    alias = acc ? acc.alias || acc.id : "";
  } catch (_) { /* treated as not connected */ }
  if (!alias) return { applied: 0, waiting: todo.length, connected: false };
  // Find each post's row by its text (rows can shift when someone edits the sheet), falling back to the row we saw.
  const r = await fetch("https://docs.google.com/spreadsheets/d/" + encodeURIComponent(sheet) + "/export?format=csv&gid=0", { cache: "no-store" });
  const grid = r.ok ? csv(await r.text()) : [];
  const key = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 80).toLowerCase();
  const rowOf = new Map<string, number>();
  grid.forEach((row, i) => { if (i > 0 && row[0] && !rowOf.has(key(row[0]))) rowOf.set(key(row[0]), i + 1); });
  const data2: any[] = [], hit: string[] = [];
  for (const [k, m] of todo) {
    // The row we saw first, when it still holds this post (a copy of the same post further down must not take its date).
    const row = (m.row && key(grid[m.row - 1]?.[0]) === k ? +m.row : 0) || rowOf.get(k) || rowOf.get(key(m.text)) || 0;
    if (!row) { moves[k] = { ...m, error: "Couldn't find this post in the queue sheet" }; continue; }
    data2.push({ range: "Queue!C" + row, values: [[m.date]], majorDimension: "ROWS" }); hit.push(k);
  }
  let applied = 0, error = "";
  if (data2.length) {
    try {
      const out = await mcp("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{ tool_slug: "GOOGLESHEETS_UPDATE_VALUES_BATCH",
        arguments: { spreadsheet_id: sheet, valueInputOption: "USER_ENTERED", data: data2 }, account: alias }], sync_response_to_workbench: false });
      const res = (out?.data?.results ?? [])[0];
      const ok = res && (res.successful ?? res.response?.successful) !== false && !res.error && !res.response?.error;
      if (!ok) throw new Error(String(res?.error ?? res?.response?.error ?? "Google Sheets didn't accept it").slice(0, 200));
      for (const k of hit) { moves[k] = { ...moves[k], applied: now(), error: "" }; applied++; }
    } catch (e) { error = String((e as Error).message ?? e); for (const k of hit) moves[k] = { ...moves[k], error }; }
  }
  await db.from("crm_lead_settings").upsert({ key: "li_moves", value: moves, updated_at: now() });
  return { applied, waiting: todo.length - applied, connected: true, error };
}
// ───────── Adding a LinkedIn post from the calendar (14 Nov) ─────────
// { text, image?, date "YYYY-MM-DD" (ET, like the queue), slot 1..4 } -> a new Queued row at the end of the Queue tab.
async function li_add(b: any) {
  const text = String(b.text ?? "").trim(), date = String(b.date ?? ""), slot = Math.min(4, Math.max(1, +b.slot || 3));
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Write the post and pick a day" };
  const { data: rows } = await db.from("crm_sheet").select("cells").eq("tab", "Settings");
  const sheet = String(((rows ?? []).find((r: any) => String(r.cells?.[0] ?? "").trim() === "LinkedIn sheet")?.cells ?? [])[1] ?? "").trim();
  if (!sheet) return { ok: false, error: "No LinkedIn sheet in Settings" };
  const out0 = await mcp("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "googlesheets", action: "list" }] }).catch(() => ({}));
  const acc = (out0?.data?.results?.googlesheets?.accounts ?? []).find((a: any) => a.status === "active");
  if (!acc) return { ok: false, connected: false, error: "Google Sheets isn't connected in Composio" };
  const r = await fetch("https://docs.google.com/spreadsheets/d/" + encodeURIComponent(sheet) + "/export?format=csv&gid=0", { cache: "no-store" });
  const grid = r.ok ? csv(await r.text()) : [];
  if (!grid.length) return { ok: false, error: "Couldn't read the queue sheet" };
  let last = grid.length; while (last > 1 && !(grid[last - 1] ?? []).some((c) => String(c).trim())) last--;
  const row = last + 1;
  const SLOTS = ["1 (8:30 AM ET)", "2 (11:30 AM ET)", "3 (2:30 PM ET)", "4 (5:30 PM ET)"];
  const img = String(b.image ?? "").trim().replace(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+).*$/, "https://drive.google.com/uc?export=view&id=$1");
  const out = await mcp("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{ tool_slug: "GOOGLESHEETS_UPDATE_VALUES_BATCH",
    arguments: { spreadsheet_id: sheet, valueInputOption: "USER_ENTERED", data: [{ range: "Queue!A" + row + ":E" + row, values: [[text, img, date, SLOTS[slot - 1], "Queued"]], majorDimension: "ROWS" }] }, account: acc.alias || acc.id }], sync_response_to_workbench: false });
  const res = (out?.data?.results ?? [])[0];
  if (!res || res.error || res.response?.error || res.response?.successful === false) return { ok: false, error: String(res?.error ?? res?.response?.error ?? "Google Sheets didn't accept it").slice(0, 200) };
  return { ok: true, row };
}
function csv(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (ch !== "\r") cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

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
// Post engagers who fit (Hot, or Warm when that's switched on), plus anyone we already reached on LinkedIn (by hand before the
// bot, or by the bot), so their follow-ups keep going.
async function pool(set?: Bot): Promise<Lead[]> {
  const heats = set?.include_warm ? ["Hot", "Warm"] : ["Hot"];
  const { data, error } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key")
    .eq("source", "LinkedIn").eq("archived", false).limit(3000);
  if (error) throw error;
  // (14 Nov) Signals (funding, launches, hiring) wait on Leads > Signals until Reyansh approves them; trashed ones never come back.
  return ((data ?? []) as Lead[]).filter((l) => !["new", "trashed"].includes(String(l.fields?.li?.signal_status ?? "")))
    .filter((l) => (isOurs(l) && heats.includes(l.heat)) || !!(l.fields?.li?.req || l.fields?.li?.dm || l.fields?.li?.acc || l.fields?.li?.src === "inbound"));
}
const isEngager = (l: Lead) => String(l.origin_key ?? "").startsWith("li-person:");
// Who we never message, from what we know (same rule as the CRM's Pipeline): unknown never rules anyone out.
function notFit(l: Lead): string {
  if (l.fields?.li?.src === "list") return "";   // (14 Nov) people from a founder list Reyansh built are his ICP call, never second-guessed
  const role = String(l.role ?? "").trim(), I = l.fields?.gtm?.intel ?? {}, v = (k: string) => I[k]?.v;
  if (role && !/^unknown$/i.test(role) && !/founder|\bceo\b|chief|\bcto\b|\bcoo\b|\bcmo\b|\bcpo\b|\bcfo\b|\bcro\b|president|owner|managing director|head of (growth|marketing|sales|gtm|revenue|business)|\bvp\b|vice president/i.test(role)) return "Not a decision maker";
  if (v("model") === "B2C") return "Sells to consumers (B2C)";
  if (v("model") === "Services / agency") return "Agency or services business";
  if (+v("employees") > 100) return "Too big (" + v("employees") + " people)";
  if (v("round") === "Series D+") return "Later than Series C";
  return whereFit(l);
}
// Founders living in the US, Canada, the UK or another tier-1 country, at tech companies (from the research step).
const TIER1 = /\b(united states|usa|u\.s\.|america|canada|united kingdom|uk|england|scotland|wales|britain|ireland|australia|new zealand|germany|france|netherlands|belgium|luxembourg|switzerland|austria|sweden|norway|denmark|finland|iceland|spain|portugal|italy|singapore|israel|japan|south korea|korea)\b/i;
function whereFit(l: Lead): string {
  const ic = l.fields?.li_icp ?? {}, hq = String(l.fields?.gtm?.intel?.hq?.v ?? ic.hq_country ?? "").trim(), lives = String(ic.founder_country ?? "").trim();
  const known = (x: string) => x && !/^(unknown|n\/a|none|remote)$/i.test(x);
  if (known(lives) && !TIER1.test(lives)) return "Founder based in " + lives;
  if (!known(lives) && known(hq) && !TIER1.test(hq)) return "Company based in " + hq;
  if (ic.is_tech === false) return "Not a tech company" + (ic.kind ? " (" + ic.kind + ")" : "");
  return "";
}
async function saveLi(l: Lead, li: any, extra: Record<string, unknown> = {}) {
  l.fields = { ...(l.fields ?? {}), li };
  const { error } = await db.from("crm_leads").update({ fields: l.fields, ...extra }).eq("id", l.id);
  if (error) throw error;
}
const log = (lead_id: string, text: string, kind = "message") => db.from("crm_lead_events").insert({ lead_id, kind, text, by_email: BY });
async function botSentNear(leadId: string, at: string) {
  const t = Date.parse(at); if (!t) return false;
  const { count } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("status", "sent")
    .gte("sent_at", new Date(t - 5 * 60e3).toISOString()).lte("sent_at", new Date(t + 5 * 60e3).toISOString());
  return (count ?? 0) > 0;
}
// (16 Nov) Right before the extension sends a LinkedIn message it hands over that person's latest chat: if they wrote since the
// bot's last message, the reply is handled now (sorted, stage, answer) and nothing goes out; if Reyansh wrote himself, they become
// "by hand" and nothing goes out.
async function guard(b: any) {
  const { data: t } = await db.from("crm_li_tasks").select("id,lead_id,kind").eq("id", b.id).maybeSingle();
  if (!t) return { stop: true, why: "task gone" };
  const { data: l } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key").eq("id", t.lead_id).maybeSingle();
  if (!l) return { stop: true, why: "lead gone" };
  const li = (l as any).fields?.li ?? {}; const th = b.thread ?? {};
  if (li.stop === "by hand") { await db.from("crm_li_tasks").update({ status: "skipped", error: "You're handling them by hand" }).eq("id", t.id); return { stop: true, why: "you're handling them by hand" }; }
  const lastThem = Math.max(Date.parse(li.replied_last || li.replied || "") || 0, 0);
  const lastBot = Date.parse(li.last || li.dm || li.req || "") || 0;
  if (th.them_at && Date.parse(th.them_at) > lastThem + 1000 && Date.parse(th.them_at) > (Date.parse(li.req || "") || 0)) {
    if (t.kind === "reply" || t.kind === "close") { /* answering is the point, unless they wrote again: re-sort below */ }
    await state({ connections: [], threads: [{ ...th, urn: th.urn || li.urn }] });
    await db.from("crm_li_tasks").update({ status: "skipped", error: "They just replied" }).eq("id", t.id).in("status", ["sending", "ready"]);
    return { stop: true, why: "they just replied, so the reply is sorted and the answer is waiting for your OK" };
  }
  if (th.me_at && Date.parse(th.me_at) > lastBot + 3 * 60e3 && !(await botSentNear(l.id, th.me_at))) {
    await saveLi(l as Lead, { ...li, prev_stop: li.stop ?? null, stop: "by hand", hand_at: th.me_at });
    await stopTasks(l.id, "You messaged them yourself");
    await log(l.id, "You messaged them yourself on LinkedIn, so the bots stopped. Press Resume follow-ups in the CRM to hand them back.", "note");
    return { stop: true, why: "you messaged them yourself, so they're yours now" };
  }
  return { stop: false };
}
async function stopTasks(leadId: string, why: string) {
  await db.from("crm_li_tasks").update({ status: "skipped", error: why }).eq("lead_id", leadId).neq("kind", "magnet").in("status", ["review", "ready", "sending"]);
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
  // (15 Nov) Recent connections the CRM doesn't know (requests Reyansh sent by hand before the bot, accepted now): added as leads,
  // researched by the next runs, and only those who fit the ICP get the 3 ideas and the follow-ups (see plan).
  // (16 Nov, Reyansh) Old connections the CRM didn't know are no longer added as leads: they were mostly not a fit and cluttered the pipeline.
  const unknown: any[] = [];
  if (unknown.length) {
    const { data: all } = await db.from("crm_leads").select("linkedin,fields").eq("source", "LinkedIn").limit(8000);
    const seen = new Set<string>(); for (const l of all ?? []) { const x: any = l; for (const v of [x.fields?.li?.urn, x.fields?.li?.pid, String(x.linkedin ?? "").toLowerCase().replace(/\/+$/, "").split("/in/")[1]]) if (v) seen.add(String(v).toLowerCase()); }
    for (const c of unknown.slice(0, 40)) {
      if (seen.has(String(c.urn).toLowerCase()) || seen.has(String(c.pid).toLowerCase())) continue;
      const url = "https://www.linkedin.com/in/" + c.pid;
      const pr = await headlineOf(c.pid, c.name).catch(() => null);         // their headline: role and company, for the fit check
      const { error } = await db.from("crm_leads").insert({ name: c.name, source: "LinkedIn", stage: "New", heat: "Hot", linkedin: url, direction: "Outbound",
        role: pr?.role ?? "", company: pr?.company ?? "",
        origin_key: "li-src:connection:" + url.toLowerCase(), source_detail: "Accepted your LinkedIn request " + (c.at ? String(c.at).slice(0, 10) : "") + " (sent before the bot)",
        fields: { li: { src: "connection", acc: c.at || now(), urn: c.urn, pid: c.pid } } });
      if (!error) { seen.add(String(c.pid).toLowerCase()); accepted++; }
    }
  }
  const asked = await magnetDMs(b.threads ?? []).catch(() => 0);
  for (const t of b.threads ?? []) {
    const l = find(t); if (!l || !t.them_at) continue;
    const li = { ...(l.fields?.li ?? {}) };
    const since = Math.max(Date.parse(li.req || li.dm || li.inmail || "") || 0, (Date.parse(li.prev_replied ?? "") || 0) + 1000);
    if (!li.replied && !li.stop && since && t.me_at && li.acc && !tipsGot(l) && (promised(l) || !li.dm) && Date.parse(t.me_at) > (Date.parse(li.acc) || 0)) {
      const at = new Date(t.me_at).toISOString();
      l.fields = { ...(l.fields ?? {}), tips: { ...(l.fields?.tips ?? {}), sent_at: at, by_hand: true } };
      await saveLi(l, { ...li, dm: at, last: at, fu: 0, tips_dm: at });
      await stopTasks(l.id, "You sent them the 3 ideas yourself");
      await log(l.id, "You sent them the 3 ideas yourself on LinkedIn. If they don't reply in 24 hours, the follow-ups start (booking link, then the VSL).", "note");
      continue;
    }
    // (16 Nov, Reyansh's rule) A message he sent himself means he has taken this person over: the bots never message them again
    // until he presses "Resume follow-ups" in the CRM. Bot-sent messages are told apart by a task sent within 5 minutes.
    if (li.stop !== "by hand" && since && t.me_at && Date.parse(t.me_at) > (Date.parse(li.last || "") || 0) + 3 * 60e3 && !(await botSentNear(l.id, t.me_at))) {
      await saveLi(l, { ...li, prev_stop: li.stop ?? null, stop: "by hand", hand_at: t.me_at, answered: li.replied ? t.me_at : li.answered });
      await stopTasks(l.id, "You messaged them yourself");
      await log(l.id, "You messaged them yourself on LinkedIn, so the bots stopped. Press Resume follow-ups in the CRM to hand them back.", "note");
      continue;
    }
    // (16 Nov) Every reply, not only the first: a later reply is sorted again with a new draft; our own message after their
    // reply marks it answered. The reply rules decide the stage and whether an answer (or a closing message) is queued.
    if (li.replied) {
      const lastThem = Date.parse(li.replied_last || li.replied) || 0;
      if (t.me_at && Date.parse(t.me_at) > lastThem && !li.answered) { li.answered = t.me_at; await saveLi(l, li); }
      if (Date.parse(t.them_at) <= lastThem + 1000) continue;
    } else if (!since || Date.parse(t.them_at) <= since) continue;
    if (!li.replied) li.replied = t.them_at;
    li.replied_last = t.them_at; li.answered = null; if (li.stop !== "by hand") li.stop = "replied"; if (t.urn) li.urn = t.urn;
    const said = String(t.them_text ?? "");
    const sr = await sortReply(l, said, "LinkedIn").catch(() => ({ label: "other", draft: "" }));
    li.reply_label = sr.label; li.draft = sr.draft; li.reply_text = clip(said, 600);
    const R = await replyPlan(l, sr, "LinkedIn");
    await saveLi(l, li, R.move);
    await stopTasks(l.id, "They replied");
    await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "message", text: "Replied on LinkedIn (" + REPLY_LABEL[sr.label] + "): “" + clip(said, 600) + "”", by_email: "linkedin" });
    if (R.status && li.stop !== "by hand") await db.from("crm_li_tasks").insert({ lead_id: l.id, kind: R.kind, step: 0, text: R.text, subject: "", status: R.status });
    replied++;
  }
  // (16 Nov) What this run saw, for the Bots page and for checking reply detection: chats read, chats with a message from
  // them, how many matched a lead, and a few unmatched ids.
  const th = (b.threads ?? []) as any[], withThem = th.filter((t) => t.them_at), matched = withThem.filter((t) => find(t));
  await saveStatus({ last_state: now(), state_seen: { chats: th.length, from_them: withThem.length, matched: matched.length,
    newest_them: withThem.map((t) => t.them_at).sort().pop() ?? null, unmatched: withThem.filter((t) => !find(t)).slice(0, 5).map((t) => ({ urn: t.urn, pid: t.pid ?? "", name: t.name ?? "" })) } }).catch(() => {});
  return { accepted, replied, asked };
}

// ───────── plan: queue what's due, hand out what's approved ─────────
const firstName = (n: string) => {
  const parts = String(n || "").replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|prof)$/i.test(w));
  const f = parts[0] ?? "";
  return f ? f[0].toUpperCase() + (f === f.toUpperCase() ? f.slice(1).toLowerCase() : f.slice(1)) : "there";
};
// (14 Nov) {hook} goes in first: openers can carry {company} / {first} of their own.
const fill = (tpl: string, l: Lead, hook = "") => tpl.replaceAll("{hook}", hook).replaceAll("{first}", firstName(l.name)).replaceAll("{company}", l.company || "your company")
  .replaceAll("{where}", l.x_handle ? "X and LinkedIn" : "LinkedIn").replaceAll("{hook}", hook).replace(/[ \t]{2,}/g, " ").replace(/\s*[—–]\s*/g, ", ").trim();

async function plan(_b: any) {
  const set = await settings();
  const leads = await pool(set);
  const { data: open } = await db.from("crm_li_tasks").select("lead_id,kind,step,status,subject,updated_at").in("lead_id", leads.map((l) => l.id).slice(0, 2000));
  const { data: dmTexts } = await db.from("crm_li_tasks").select("lead_id,kind,step,text").eq("kind", "dm").eq("status", "skipped").in("lead_id", leads.filter((l) => l.fields?.li?.acc && !l.fields?.tips?.sent_at && (l.fields?.li?.promised || l.fields?.li?.src === "list")).map((l) => l.id).slice(0, 500));
  for (const d of dmTexts ?? []) { const o = (open ?? []).find((x: any) => x.lead_id === d.lead_id && x.kind === "dm" && x.step === d.step && x.status === "skipped"); if (o) (o as any).text = d.text; }
  const tipsWanted: string[] = [];
  const tasksOf = new Map<string, any[]>();
  for (const t of open ?? []) tasksOf.set(t.lead_id, [...(tasksOf.get(t.lead_id) ?? []), t]);
  const status = set.mode === "auto" ? "ready" : "review";
  const m0 = new Date(); m0.setUTCDate(1); m0.setUTCHours(0, 0, 0, 0);
  const { count: notesUsed } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("kind", "invite").eq("status", "sent").neq("text", "").gte("sent_at", m0.toISOString());
  let notesLeft = set.notes_month - (notesUsed ?? 0);
  const newRows: any[] = [], needHook: Lead[] = [];
  const sc = await scripts();
  const angleLeads = [...leads];
  // The same person can be in Leads twice (from our posts and from outreach done by hand). Never message a copy of someone
  // the other copy already reached.
  const nameKey = (l: Lead) => String(l.name ?? "").toLowerCase().normalize("NFD").replace(/[^a-z]+/g, "");
  const reached = new Map<string, { req: boolean; dm: boolean; id: string }>();
  for (const l of leads) { const x = l.fields?.li ?? {}; const k = nameKey(l); if (!k || !(x.req || x.acc || x.dm || x.replied)) continue;
    const r = reached.get(k) ?? { req: false, dm: false, id: l.id }; r.req = r.req || !!(x.req || x.acc); r.dm = r.dm || !!x.dm || !!x.replied; reached.set(k, r); }
  const twin = (l: Lead, what: "req" | "dm") => { const r = reached.get(nameKey(l)); return !!r && r[what] && !((l.fields?.li ?? {})[what]); };
  const twins = leads.filter((l) => twin(l, "req") || twin(l, "dm")).map((l) => l.id);
  if (twins.length) await db.from("crm_li_tasks").update({ status: "skipped", error: "Same person as another lead we already reached" }).in("status", ["review", "ready"]).in("kind", ["invite", "dm"]).in("lead_id", twins);
  let finished = 0;
  for (const l of leads) {
    const li = { ...(l.fields?.li ?? {}) };
    const ts = tasksOf.get(l.id) ?? [];
    // (14 Nov) They replied, we sent the 3 tips, and they went quiet: after 24 hours their follow-ups start again (tips order below).
    const tipsAt = Date.parse(l.fields?.tips?.sent_at ?? "") || 0;
    if (li.seq !== 2 && tipsAt && li.replied && Date.parse(li.replied) < tipsAt && Date.now() - tipsAt >= 22 * 3600e3 && !li.restarted && /^(new|contacted|follow up|in talks)$/i.test(l.stage)) {
      const r = { ...li, prev_replied: li.replied, restarted: now(), dm: li.dm || l.fields.tips.sent_at, fu: 0, last: l.fields.tips.sent_at };
      delete r.replied; delete r.stop; delete r.draft;
      await saveLi(l, r, { stage: "Follow up" });
      await log(l.id, "No reply in 24 hours after the 3 tips, so their LinkedIn follow-ups start again (booking link first, then the VSL).", "note");
      Object.assign(li, r); delete li.replied; delete li.stop; l.stage = "Follow up";
    }
    if (li.stop || li.replied || !ACTIVE.test(l.stage)) continue;
    // (16 Nov) An old-style 3 ideas message still waiting to go to someone who just accepted becomes the v2 first message.
    const oldQ = ts.find((t) => t.kind === "dm" && t.step === 0 && ["review", "ready"].includes(t.status) && !/^v2/.test(String(t.subject ?? "")));
    if (oldQ && !li.dm && li.acc && ideasOf(l).length) {
      await db.from("crm_li_tasks").update({ subject: "v2", text: v2Fill(promised(l) || li.req ? set.v2.first : set.v2.first_np, l) }).eq("lead_id", l.id).eq("kind", "dm").eq("step", 0).in("status", ["review", "ready"]);
    }
    if (ts.some((t) => ["review", "ready", "sending"].includes(t.status))) continue;
    const had = (kind: string, step = 0) => ts.find((t) => t.kind === kind && t.step === step);
    if (srcOf(l) === "inbound" && !li.acc && !li.dm) {                    // they sent us a request: accept it and send the first message
      if (notFit(l) || twin(l, "dm")) continue;
      const t = had("accept");
      if (t?.status === "skipped") { await saveLi(l, { ...li, stop: "skipped" }); continue; }
      if (!t) {
        if (!ideasOf(l).length) { tipsWanted.push(l.id); continue; }       // (16 Nov) v2 for inbound too: the idea first, never the old pitch
        await saveLi(l, { ...li, seq: 2 });
        newRows.push({ lead_id: l.id, kind: "accept", step: 0, subject: "v2", text: v2Fill(set.v2.first_np, l), status }); }
      continue;
    }
    if (!li.req && !li.acc && !li.dm) {                                    // (12 Nov) anyone already messaged goes on to follow-ups
      if (!isOurs(l) || notFit(l) || twin(l, "req")) continue;              // only our own sources who fit get a request
      const t = had("invite");
      if (t?.status === "skipped") { await saveLi(l, { ...li, stop: "skipped" }); continue; }
      if (t?.status === "failed") continue;                                // shown on Outreach with Retry
      if (!t) needHook.push(l);
      continue;
    }
    // (14 Nov) End to end: Reyansh approves the connection request only. Whoever accepts gets their 3 ideas as the next message,
    // sent on its own (no approval); people promised them who got something else first get them next.
    if (li.src === "connection" && !li.dm && (!l.fields?.li_icp?.at || notFit(l) || !/founder|\bceo\b|chief|owner|president|managing director/i.test(String(l.role ?? "")))) continue;
    // (16 Nov) Sequence v2: everyone who accepted and hasn't had a message yet, and everyone already on it.
    if (li.seq === 2 || (li.acc && !li.dm && (isOurs(l) || li.req || promised(l)))) {
      if (!li.dm) {
        if (twin(l, "dm")) continue;
        const t = had("dm", 0);
        if (t?.status === "skipped") { await saveLi(l, { ...li, stop: "skipped" }); continue; }
        if (t && t.status !== "failed") continue;
        const viaX = tipsGot(l) && l.fields?.tips?.on === "X";
        if (!viaX && !ideasOf(l).length) { tipsWanted.push(l.id); continue; }          // ideas written by the tips run, then sent
        const text = v2Fill(viaX ? set.v2.first_x : promised(l) || li.req ? set.v2.first : set.v2.first_np, l);
        newRows.push({ lead_id: l.id, kind: "dm", step: 0, subject: viaX ? "v2x" : "v2", text, status: "ready" });
        continue;
      }
      const n = (li.fu ?? 0) + 1;
      if (n > V2_DAYS.length) {
        await saveLi(l, { ...li, stop: "no reply" }, { stage: "Cold lead" });
        await log(l.id, "No reply to the idea and " + V2_DAYS.length + " follow-ups on LinkedIn. Moved to Cold lead.", "note");
        finished++; continue;
      }
      const base = Date.parse(li.dm) || 0, last = Date.parse(li.last || li.dm) || 0;
      if (Date.now() < base + V2_DAYS[n - 1] * 86400e3 - 2 * 3600e3 || Date.now() - last < 20 * 3600e3) continue;
      const step = 200 + n, t = had("followup", step);
      if (t?.status === "skipped") { await saveLi(l, { ...li, fu: n, last: now() }); continue; }
      if (t) continue;
      // ideas 2 and 3: skipped for people who already got all 3 on X, or whose ideas never got written
      if (n === 2 && (li.v2x || ideasOf(l).length < 3)) { await saveLi(l, { ...li, fu: n }); continue; }
      newRows.push({ lead_id: l.id, kind: "followup", step, subject: "v2-" + n, text: v2Fill(set.v2.fu[n - 1], l), status: "ready" });
      continue;
    }
    // (16 Nov, Reyansh) The old LinkedIn sequence is stopped for good: anyone it reached stays where they are and gets nothing
    // more from the bot (no late 3 ideas, no booking link, no VSL, no old follow-ups). Only sequence v2 above sends messages.
    continue;
    if (li.acc && !tipsGot(l) && !twin(l, "dm") && (promised(l) || (!li.dm && (isOurs(l) || li.req)))) {
      const t = had("dm", li.dm ? 1 : 0);
      if (t?.status === "skipped" && /here they are|here are the 3 ideas/i.test(String(t.text ?? ""))) {
        // Reyansh skipped the bot's copy because he sent the ideas himself: count them as sent, follow-ups 24 hours on.
        const at = String(t.updated_at ?? now());
        l.fields = { ...(l.fields ?? {}), tips: { ...(l.fields?.tips ?? {}), sent_at: at, by_hand: true } };
        await saveLi(l, { ...li, dm: li.dm || at, last: at, fu: 0, tips_dm: at });
        await log(l.id, "The 3 ideas went out by hand. If they don't reply in 24 hours, the follow-ups start (booking link, then the VSL).", "note");
        continue;
      }
      if (t && t.status !== "failed") continue;
      if (!l.fields?.tips?.text) { tipsWanted.push(l.id); continue; }       // written by the tips run (every 15 minutes), then sent
      newRows.push({ lead_id: l.id, kind: "dm", step: li.dm ? 1 : 0, text: tipsDM(l, !!li.dm, promised(l)), status: "ready" });
      continue;
    }
    if (li.acc && !li.dm && tipsGot(l) && !twin(l, "dm")) {
      if (!had("dm")) newRows.push({ lead_id: l.id, kind: "dm", step: 0, status: "ready", subject: "fu1",
        text: "Thanks for connecting, " + firstName(l.name) + "! I sent over 3 ideas for " + (l.company && !/^unknown$/i.test(l.company) ? l.company + "'s" : "your") + " inbound on X. Happy to walk you through how we'd set them up, here's my calendar if easier: " + CAL });
      continue;
    }
    if (li.acc && !li.dm) {
      if ((!isOurs(l) && !li.req) || twin(l, "dm")) continue;              // anyone who accepted our request (or engaged with us); opens with how we met
      const t = had("dm");
      if (t?.status === "skipped") { await saveLi(l, { ...li, stop: "skipped" }); continue; }
      if (!t) { const angle = li.angle || await nextAngle(sc, angleLeads); if (!li.angle) { li.angle = angle; await saveLi(l, li); angleLeads.push(l); }
        newRows.push({ lead_id: l.id, kind: "dm", step: 0, text: l.fields?.li?.dm1 ? fill(String(l.fields.li.dm1), l) : firstDM(sc, l, angle), status }); }
      continue;
    }
    if (li.dm) {
      const n = (li.fu ?? 0) + 1, due = (Date.parse(li.last || li.dm) || 0) + set.gap_days * 86400e3 - 2 * 3600e3;
      if (Date.now() < due) continue;
      // (14 Nov) After the 3 tips (they end on the call ask) the follow-ups go: booking link, then the VSL, then the rest, a day apart.
      // Skips "want the 3 ideas?" since they have them. Order in TIPS_FU (numbers of the follow-ups in li_bot.fu).
      const tipsSeq = tipsGot(l);
      const sentT: number[] = li.fu_sent ?? [];
      const nextT = tipsSeq ? TIPS_FU.filter((k) => k <= set.fu.length && !sentT.includes(k))[0] : n;
      const maxFu = tipsSeq ? (nextT ? n : n - 1) : set.followups;
      if (n > maxFu) {
        await saveLi(l, { ...li, stop: "no reply" }, { stage: "Cold lead" });
        await log(l.id, "No reply after DM 1 and " + maxFu + " follow-ups on LinkedIn. Moved to Cold lead.", "note");
        finished++; continue;
      }
      const stepNo = li.restarted || tipsSeq ? 100 + n : n;   // after the tips (or a restart) tasks are 101, 102... so old ones never block them
      const t = had("followup", stepNo);
      if (t?.status === "skipped") { await saveLi(l, { ...li, fu: n, last: now(), ...(tipsSeq && nextT ? { fu_sent: [...sentT, nextT] } : {}) }); continue; }
      // (12 Nov) Follow-ups never wait for approval: Reyansh approves the first touch only. One a day (gap_days 1) up to 7.
      // (14 Nov) A follow-up that offers the 3 ideas sends them instead (written for them), so nobody gets asked for what we can just give.
      let fuText = fill(set.fu[nextT - 1] ?? "", l);
      if (/\b(3|three)\s+(quick\s+)?ideas\b/i.test(fuText) && !tipsSeq) {
        if (!l.fields?.tips?.text) { tipsWanted.push(l.id); continue; }
        fuText = String(l.fields.tips.text).replace(/^Hey [^,\n]*,\s*here they are:\s*/i, "Hey " + firstName(l.name) + ", sending over 3 quick ideas for " + (l.company && !/^unknown$/i.test(l.company) ? l.company + "'s" : "your") + " inbound:\n\n");
      }
      if (!t) newRows.push({ lead_id: l.id, kind: "followup", step: stepNo, subject: "fu" + nextT, text: fuText, status: "ready" });
    }
  }
  // Connection notes: one short opener per person, written from what we know about them.
  if (needHook.length) {
    const eng = needHook.slice(0, 40).filter((l) => String(l.origin_key ?? "").startsWith("li-person:"));
    const hooks = eng.length ? await writeHooks(eng) : new Map<string, string>();
    for (const l of needHook.slice(0, 40)) if (!hooks.has(l.id)) hooks.set(l.id, opener(sc, l));
    for (const l of needHook.slice(0, 40)) {
      let text = "";
      if (notesLeft > 0) {
        text = fill(set.note, l, hooks.get(l.id) ?? "");
        if (text.length > 300) text = fill(set.note, l, "thanks for checking out my post.");
        if (text.length > 300) text = clip(text, 300);
        text = text.replace(/^\s+/, ""); text = text.charAt(0).toUpperCase() + text.slice(1);   // (16 Nov) the note opens on the hook
        notesLeft--;
      }
      // An approved signal was already OK'd on Leads > Signals, so its request goes straight out.
      newRows.push({ lead_id: l.id, kind: "invite", step: 0, text, status: l.fields?.li?.signal_status === "approved" ? "ready" : status });
    }
  }
  // Requests already written for people who turned out not to fit (after their research came in) are taken back.
  const unfit = leads.filter((l) => !l.fields?.li?.req && notFit(l)).map((l) => l.id);
  if (unfit.length) await db.from("crm_li_tasks").update({ status: "skipped", error: "Not a fit for our ICP" }).eq("kind", "invite").in("status", ["review", "ready"]).in("lead_id", unfit);
  if (newRows.length) {
    // (14 Nov) Every row gets the same columns: a batch where only some rows carry subject sends null for the rest, which the
    // table refuses (subject is NOT NULL), and then nothing at all gets queued.
    const rows = newRows.map((r) => ({ subject: "", ...r }));
    const { error } = await db.from("crm_li_tasks").upsert(rows, { onConflict: "lead_id,kind,step", ignoreDuplicates: true });
    if (error) throw error;
  }

  // Hand out what's approved, at a human pace: a few per run, and never past LinkedIn's weekly request ceiling.
  await db.from("crm_li_tasks").update({ status: "ready" }).eq("status", "sending").lt("created_at", new Date(Date.now() - 3600e3).toISOString());
  let tasks: any[] = [];
  if (!set.paused && inHours(set.hours)) {
    const wk = new Date(Date.now() - 7 * 86400e3).toISOString();
    const { count: weekSent } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("kind", "invite").eq("status", "sent").gte("sent_at", wk);
    // (17 Nov) Human pace: at most 2 requests and 2 messages handed out per 20-minute check, and daily caps (60% on weekends).
    const dayStartLi = ptDayStart();
    const { count: invToday } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("kind", "invite").eq("status", "sent").gte("sent_at", dayStartLi);
    const { count: msgToday } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).neq("kind", "invite").eq("status", "sent").gte("sent_at", dayStartLi);
    const lb: any = (await db.from("crm_lead_settings").select("value").eq("key", "li_bot").maybeSingle()).data?.value ?? {};
    const dayInv = Math.floor((+lb.day_invites || 20) * weekendFactor()), dayMsg = Math.floor((+lb.day_msgs || 30) * weekendFactor());
    const invitesLeft = Math.max(0, Math.min(2, set.week_cap - (weekSent ?? 0), dayInv - (invToday ?? 0)));
    const msgsLeft = Math.max(0, Math.min(2, dayMsg - (msgToday ?? 0)));
    // (16 Nov) A request that failed on the warm touch (LinkedIn's tab too slow to like their post) goes again without it.
    await db.from("crm_li_tasks").update({ status: "ready", error: "no warm touch (it timed out)" }).eq("kind", "invite").eq("status", "failed").ilike("error", "%likeLatest%");
    const { data: ready } = await db.from("crm_li_tasks").select("id,lead_id,kind,step,text,subject,error").eq("status", "ready").order("created_at").limit(40);
    const { data: ls } = (ready ?? []).length ? await db.from("crm_leads").select("id,name,linkedin,fields,stage,archived").in("id", (ready ?? []).map((t) => t.lead_id)) : { data: [] };
    const L = new Map((ls ?? []).map((l: any) => [l.id, l]));
    const ok = (t: any) => { const l: any = L.get(t.lead_id); return l && !l.archived && l.fields?.li?.stop !== "by hand" && (t.kind === "magnet" || t.kind === "reply" || t.kind === "close" || (!l.fields?.li?.replied && (set.rush || !set.localTime || goodTime(l, t.kind)))); };
    const inv = (ready ?? []).filter((t) => t.kind === "invite" && ok(t)).slice(0, invitesLeft);
    // InMails (14 Nov): 30 credits a month on Premium, so never more than what's left this month (IST), and 2 per run at most.
    const m0 = new Date(Date.now() + 19800e3); const monthStart = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth(), 1) - 19800e3).toISOString();
    const { count: imSent } = await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("kind", "inmail").eq("status", "sent").gte("sent_at", monthStart);
    const imLeft = Math.max(0, Math.min(2, INMAIL_MONTH - (imSent ?? 0)));
    // Only an extension that can really send an InMail (1.2.8+, which says its version here) gets one; an older copy would send it
    // as a plain message, fail, and mark them not connected.
    const pv = String(_b?.version ?? "0").split(".").map((x: string) => +x || 0), canIm = pv[0] > 1 || (pv[0] === 1 && (pv[1] > 2 || (pv[1] === 2 && pv[2] >= 8)));
    const ims = canIm ? (ready ?? []).filter((t) => t.kind === "inmail" && ok(t)).slice(0, imLeft) : [];
    const msg = [...(ready ?? []).filter((t) => t.kind !== "invite" && t.kind !== "inmail" && ok(t)).slice(0, msgsLeft), ...ims];
    tasks = [...msg, ...inv];
    if (tasks.length) {
      // A request goes out at least 45 minutes after the warm touch (12 Nov, was 3 hours) (visit their profile, like their latest post).
      tasks = tasks.filter((t) => { const w = Date.parse(L.get(t.lead_id)?.fields?.li?.warm ?? "") || 0; return t.kind !== "invite" || !w || Date.now() - w > (set.rush ? 0.5 : 0.75) * 3600e3; })
        .map((t) => { const l: any = L.get(t.lead_id); return { ...t, name: l.name, urn: urnOf(l), pid: pidOf(l), profile: l.linkedin, warm: t.kind === "invite" && !l.fields?.li?.warm && !/no warm touch/.test(String(t.error ?? "")), inv: l.fields?.li?.inv ?? null }; });
      if (tasks.length) await db.from("crm_li_tasks").update({ status: "sending" }).in("id", tasks.map((t) => t.id));
    }
  }
  // People whose LinkedIn id we still need (to send anything), or whose email we haven't looked for since they connected.
  // (12 Nov) Extensions before 1.2.2 read the LinkedIn id off the profile page and often got someone else's: no lookups for them,
  // and nothing handed out that would need one.
  const { data: vs } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot_status").maybeSingle();
  const ver = String((vs?.value as any)?.version ?? "0").split(".").map((x) => +x || 0);
  const goodLookup = ver[0] > 1 || (ver[0] === 1 && (ver[1] > 2 || (ver[1] === 2 && ver[2] >= 2)));
  if (!goodLookup && tasks.length) {
    const noUrn = tasks.filter((t: any) => !t.urn).map((t: any) => t.id);
    if (noUrn.length) { await db.from("crm_li_tasks").update({ status: "ready" }).in("id", noUrn); tasks = tasks.filter((t: any) => t.urn); }
  }
  const lookups = !goodLookup ? [] : leads.filter((l) => { const li = l.fields?.li ?? {}; return (!urnOf(l) && !li.lookup_fail) || (li.acc && !li.ci && !l.email); })
    .slice(0, 8).map((l) => ({ lead_id: l.id, urn: urnOf(l), pid: pidOf(l), profile: l.linkedin, connected: !!l.fields?.li?.acc }));
  let enriched: any = null;
  try { enriched = await enrich({ limit: 8 }); } catch (_) { /* research is a bonus; never block sending */ }
  await saveStatus({ last_plan: now(), queued: newRows.length, handed_out: tasks.length, enriched });
  return { queued: newRows.length, finished, tasks, lookups, paused: set.paused, in_hours: inHours(set.hours) };
}

// claim: right before sending, make sure it's still approved (not skipped, not already sent, they haven't replied).
async function claim(b: any) {
  const { data } = await db.from("crm_li_tasks").update({ status: "sending" }).eq("id", b.id).in("status", ["sending", "ready"]).select("id,lead_id,kind");
  if (!data?.length) return { ok: false };
  const { data: l } = await db.from("crm_leads").select("fields,archived").eq("id", data[0].lead_id).maybeSingle();
  if (!l || l.archived || l.fields?.li?.stop === "by hand" || (!["magnet", "reply", "close"].includes(data[0].kind) && (l.fields?.li?.replied || l.fields?.li?.stop))) {
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
  if (b.urn && await urnTaken(b.urn, lead)) b.urn = "";
  if (b.urn) li.urn = b.urn; if (b.pid) li.pid = b.pid;
  const at = now();
  if (t.kind === "reply" || t.kind === "close") {
    if (!b.ok) { await db.from("crm_li_tasks").update({ status: "failed", error: clip(String(b.error ?? "Failed"), 300) }).eq("id", t.id); return { ok: true }; }
    await db.from("crm_li_tasks").update({ status: "sent", sent_at: at }).eq("id", t.id);
    li.answered = at; li.last = at; await saveLi(lead, li);
    await log(lead.id, (t.kind === "close" ? "Sent the closing message on LinkedIn:\n" : "Answered on LinkedIn:\n") + t.text);
    return { ok: true };
  }
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
  if (!b.ok && /NOT_FIRST_DEGREE/i.test(String(b.error ?? "")) && !li.relooked && li.pid) {
    // (12 Nov) Usually a wrong LinkedIn id, not a lost connection: forget the id, look them up again by their handle, and retry once.
    delete li.urn; li.relooked = at;
    await db.from("crm_li_tasks").update({ status: "ready", error: "Retrying after looking up their LinkedIn id again" }).eq("id", t.id);
    await saveLi(lead, li); return { ok: true };
  }
  if (!b.ok && /NOT_FIRST_DEGREE/i.test(String(b.error ?? ""))) {     // not connected (any more): can't message them, stop the sequence
    await db.from("crm_li_tasks").update({ status: "skipped", error: "Not connected on LinkedIn, so they can't be messaged" }).eq("id", t.id);
    li.stop = "not connected"; delete li.acc;
    await saveLi(lead, li); await log(lead.id, "LinkedIn says we're not connected, so the follow-ups stopped. Send them a connection request by hand if you want to continue.", "note");
    return { ok: true };
  }
  if (!b.ok) {
    await db.from("crm_li_tasks").update({ status: "failed", error: clip(String(b.error ?? "Failed"), 300) }).eq("id", t.id);
    await saveLi(lead, li); return { ok: true };
  }
  await db.from("crm_li_tasks").update({ status: "sent", sent_at: at, error: "" }).eq("id", t.id);
  const stage: Record<string, unknown> = {};
  if (t.kind === "invite") {
    li.req = at; li.note = !!t.text; li.last = at; if (PROMISE_RE.test(String(t.text ?? ""))) li.promised = true;
    if (/^new$/i.test(lead.stage)) stage.stage = "Contacted";
    await log(lead.id, t.text ? "LinkedIn connection request sent, with this note:\n" + t.text : "LinkedIn connection request sent (no note left this month)");
  } else if (t.kind === "accept") {
    li.acc = at; li.dm = at; li.last = at; li.fu = 0;
    if (/^new$/i.test(lead.stage)) stage.stage = "Contacted";
    await log(lead.id, "Accepted their LinkedIn request and sent the first message (" + (ANGLE_LABEL[li.angle] ?? "advice") + "):\n" + t.text);
  } else if (t.kind === "dm") {
    li.dm = at; li.last = at; li.fu = 0;
    if (t.subject === "v2" || t.subject === "v2x") { li.seq = 2; if (t.subject === "v2x") li.v2x = true; }
    if (t.subject === "fu1") li.fu_sent = [...new Set([...(li.fu_sent ?? []), 1])];
    if (/here they are|here are the 3 ideas/i.test(String(t.text ?? ""))) { li.tips_dm = at; lead.fields = { ...(lead.fields ?? {}), tips: { ...(lead.fields?.tips ?? {}), sent_at: at } }; }
    if (/^new$/i.test(lead.stage)) stage.stage = "Contacted";
    await log(lead.id, "LinkedIn first message sent (" + (ANGLE_LABEL[li.angle] ?? "advice") + "):\n" + t.text);
  } else if (t.kind === "followup") {
    li.fu = t.step % 100; li.last = at;
    const k = +(String(t.subject ?? "").match(/^fu(\d+)$/)?.[1] ?? (t.step < 100 ? t.step : 0)); if (k) li.fu_sent = [...new Set([...(li.fu_sent ?? []), k])];
    if (/sending over 3 quick ideas|here they are/i.test(String(t.text ?? "")) || t.subject === "v2-2") lead.fields = { ...(lead.fields ?? {}), tips: { ...(lead.fields?.tips ?? {}), sent_at: at } };
    if (/^(new|contacted)$/i.test(lead.stage)) stage.stage = "Follow up";
    await log(lead.id, "LinkedIn follow-up " + (t.step % 100) + " sent:\n" + t.text);
  } else if (t.kind === "magnet") {
    li.magnet_sent = { ...(li.magnet_sent ?? {}), [String(t.subject || "asset")]: at }; li.last = at;
    await log(lead.id, "Sent them the " + (t.subject || "asset") + " they asked for:\n" + t.text);
  } else if (t.kind === "inmail") {
    if (b.credits != null) await saveStatus({ inmail_credits: b.credits, inmail_credits_at: now() });
    li.inmail = at; li.last = at;
    if (/^new$/i.test(lead.stage)) stage.stage = "Contacted";
    await log(lead.id, "LinkedIn InMail sent" + (t.subject ? " (" + t.subject + ")" : "") + ":\n" + t.text);
  }
  await saveLi(lead, li, { ...stage, last_touch: at });
  return { ok: true };
}

// ───────── contact: their LinkedIn id, and email if they share it ─────────
// (12 Nov) A LinkedIn id belongs to one person: never give a lead an id another lead (with a different name) already has.
async function urnTaken(urn: string, lead: { id: string; name?: string }): Promise<boolean> {
  if (!urn) return false;
  const { data } = await db.from("crm_leads").select("id,name").filter("fields->li->>urn", "eq", urn).neq("id", lead.id).eq("archived", false).limit(5);
  return (data ?? []).some((x: any) => String(x.name ?? "").toLowerCase().trim() !== String(lead.name ?? "").toLowerCase().trim());
}
async function contact(b: any) {
  const { data: l } = await db.from("crm_leads").select("id,name,email,linkedin,fields,stage,heat,company,role,x_handle,source_detail,origin_key").eq("id", b.lead_id).maybeSingle();
  if (!l) return { error: "No such lead" };
  const lead = l as Lead;
  const li = { ...(lead.fields?.li ?? {}) };
  if (b.urn && await urnTaken(b.urn, lead)) b.urn = "";
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
      if (!/^I\b/.test(s)) s = s[0].toLowerCase() + s.slice(1);   // keep "I" capital
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
  // The call itself (11 Nov): when, and the Google Meet link cal.com made, kept on the lead for the Daily brief and the lead card.
  const meet = String(p.videoCallData?.url ?? p.metadata?.videoCallUrl ?? (/^https?:/.test(String(p.location ?? "")) ? p.location : "") ?? "");
  // GTM or clipping: what they wrote, then the event's name (the GTM Discovery Call on cal.com/sove7gn-gtm is GTM).
  const said = JSON.stringify(p.responses ?? {}) + " " + String(p.description ?? "") + " " + String(p.additionalNotes ?? "");
  const kind = /clip|ugc|reel/i.test(said) ? "clipping" : /clip/i.test(String(p.title ?? "")) ? "clipping" : "gtm";
  const call = { at: p.startTime ? Date.parse(p.startTime) : null, meet, kind, status: "booked", title: String(p.title ?? "").slice(0, 120), src: "cal.com", seen: now() };
  let { data: l } = email ? await db.from("crm_leads").select("id,fields,stage").eq("archived", false).ilike("email", email).limit(1).maybeSingle() : { data: null };
  if (!l && name) ({ data: l } = await db.from("crm_leads").select("id,fields,stage").eq("archived", false).ilike("name", name).order("updated_at", { ascending: false }).limit(1).maybeSingle());
  if (!l) {
    const { data: n, error } = await db.from("crm_leads").insert({ name: name || email, email, direction: "Inbound", source: "Referral", source_detail: "Booked on cal.com",
      stage: "Call booked", created_by: "automation", fields: { call } }).select("id,fields,stage").single();
    if (error) throw error;
    l = n;
  } else {
    const li = { ...((l as any).fields?.li ?? {}) };
    if (li.req || li.dm) li.stop = "booked";
    await db.from("crm_leads").update({ stage: "Call booked", fields: { ...((l as any).fields ?? {}), li, call }, ...(email ? { email } : {}) }).eq("id", (l as any).id);
    await stopTasks((l as any).id, "They booked a call");
  }
  await db.from("crm_lead_events").insert({ lead_id: (l as any).id, kind: "meeting", text: "Booked a call on cal.com" + (when ? " for " + when : "") + (meet ? ": " + meet : ""), by_email: "cal.com" });
  return json({ ok: true });
}

// ───────── enrich: what each LinkedIn lead is building and their latest round (feeds the 1 to 10 score) ─────────
// One Exa search per person with a structured answer (Exa allows at most 10 fields). Facts go into the lead's intelligence card (fields.gtm.intel) with
// the page they came from, so the CRM's ICP score counts them as evidence. A short line about them goes in fields.li_icp.
const EXA = Deno.env.get("EXA_API_KEY") ?? "";   // also used by people() and briefs()
const TWAPI = Deno.env.get("TWITTERAPI_KEY") ?? "";   // X follower counts for call dossiers
const ROUNDS = ["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Series D+", "Bootstrapped", "Grant / other"];
const MODELS = ["B2B", "B2B2C", "B2C", "Marketplace", "Services / agency"];
async function enrich(b: any) {
  if (!EXA) return { error: "EXA_API_KEY is missing" };
  const limit = Math.min(+(b.limit ?? 8), 60);
  const { data, error } = await db.from("crm_leads").select("id,name,company,role,linkedin,fields,notes")
    .eq("source", "LinkedIn").eq("archived", false).or("origin_key.like.li-person:%,origin_key.like.li-src:%").in("heat", ["Hot", "Warm"]).limit(2000);   // li-src: tagged, viewers, inbound, niche (12 Nov)
  if (error) throw error;
  const due = (l: any) => !l.fields?.li_icp?.at || (l.fields?.li_icp?.err && Date.now() - Date.parse(l.fields.li_icp.at) > 6 * 3600e3) || !l.fields?.li_icp?.geo2 || (!l.fields?.li_icp?.geo3 && !notFit(l));
  // (12 Nov) People waiting for Reyansh's approval go first, so their score is real before he decides; then people not yet contacted.
  const { data: rv } = await db.from("crm_li_tasks").select("lead_id").in("status", ["review", "ready"]).limit(1000);
  const waiting = new Set((rv ?? []).map((t: any) => t.lead_id));
  const rank = (l: any) => (waiting.has(l.id) || l.fields?.li?.acc ? 0 : 2) + (l.fields?.li?.req ? 1 : 0);
  const todo = (data ?? []).filter(due).sort((a: any, c: any) => rank(a) - rank(c)).slice(0, limit);
  let done = 0, cost = 0;
  for (let i = 0; i < todo.length; i += 4) {
    const out = await Promise.all(todo.slice(i, i + 4).map(async (l: any) => {
      const fresh = !l.fields?.li_icp?.at || l.fields?.li_icp?.err;
      const [a, g] = await Promise.all([fresh ? lookUp(l).catch((e) => ({ error: String(e) })) : Promise.resolve(null), whereLookUp(l).catch(() => null)]);
      return { a, g };
    }));
    for (let j = 0; j < out.length; j++) {
      const l: any = todo[i + j], o: any = out[j].a, g: any = out[j].g;
      cost += (o?.cost ?? 0) + (g?.cost ?? 0);
      const f = { ...(l.fields ?? {}) };
      const now = new Date().toISOString(), day = now.slice(0, 10);
      if (!o) { /* researched before: only the location / tech lookup is new */ }
      else if (o.error) { f.li_icp = { at: now, err: String(o.error).slice(0, 200) }; }
      else {
        const src = /^https?:\/\//.test(o.source_url ?? "") ? o.source_url : "";
        const g = { ...(f.gtm ?? {}) }, I = { ...(g.intel ?? {}) };
        const put = (k: string, v: unknown) => { if (v == null || v === "" || I[k]) return; I[k] = { v, src, at: day, by: "li-bot" }; };
        if (o.about_this_company) {
          put("description", String(o.one_liner ?? "").slice(0, 300));
          if (MODELS.includes(o.model)) put("model", o.model);
          if (o.industry) put("industry", String(o.industry).slice(0, 80));
          if (Number.isFinite(+o.employees) && +o.employees > 0) put("employees", Math.round(+o.employees));
          if (ROUNDS.includes(o.round)) put("round", o.round);
          if (+o.round_amount_usd > 0) put("amount", Math.round(+o.round_amount_usd));
          const d = String(o.round_date ?? "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
          if (d && Date.parse(d[1] + "-" + d[2] + "-" + (d[3] ?? "01")) <= Date.now()) put("date", d[1] + "-" + d[2] + "-" + (d[3] ?? "01"));
          if (+o.total_raised_usd > 0) put("total", Math.round(+o.total_raised_usd));
          if (o.investors) put("investors", String(o.investors).slice(0, 120));
          if (o.accelerator && !/^(none|no|n\/a|unknown|empty.*|-)$/i.test(String(o.accelerator).trim())) put("accelerator", String(o.accelerator).slice(0, 40));
          if (o.hiring_growth_roles) put("hiring", String(o.hiring_growth_roles).slice(0, 120));
          if (/^https?:\/\//.test(o.website ?? "")) put("website", o.website);
        }
        if (/founder|ceo|chief executive/i.test(l.role ?? "") && !I.founder) I.founder = { v: "Yes", src: "", at: day, by: "li-bot" };
        g.intel = I; g.v = 1; g.at = now; f.gtm = g;
        f.li_icp = { at: now, one_liner: o.about_this_company ? String(o.one_liner ?? "").slice(0, 160) : "", funding: o.about_this_company ? fundingLine(o) : "", src };
      }
      if (f.li_icp && !f.li_icp.err) {
        const ic = { ...f.li_icp, geo_at: now, geo2: now, geo3: now };
        if (g && g.about_this_person) {
          const clean = (x: unknown) => String(x ?? "").trim().replace(/^the\s+/i, "").slice(0, 60);
          if (clean(g.company_hq_country) && !/unknown/i.test(String(g.company_hq_country))) ic.hq_country = clean(g.company_hq_country);
          if (clean(g.founder_lives_in_country) && !/unknown/i.test(String(g.founder_lives_in_country))) ic.founder_country = clean(g.founder_lives_in_country);
          if (clean(g.company_hq_city) && !/unknown/i.test(String(g.company_hq_city))) ic.hq_city = clean(g.company_hq_city);
          if (typeof g.is_tech_company === "boolean") ic.is_tech = g.is_tech_company;
          const xh = String(g.x_handle ?? "").trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
          if (/^[A-Za-z0-9_]{2,15}$/.test(xh)) ic.x = xh;
          if (g.what_kind_of_company) ic.kind = String(g.what_kind_of_company).slice(0, 60);
          const gi = { ...(f.gtm?.intel ?? {}) };
          if (ic.hq_country && !gi.hq) { gi.hq = { v: ic.hq_country, src: /^https?:\/\//.test(g.source_url ?? "") ? g.source_url : "", at: day, by: "li-bot" }; f.gtm = { ...(f.gtm ?? {}), intel: gi }; }
        }
        f.li_icp = ic;
      }
      const { error: e2 } = await db.from("crm_leads").update({ fields: f }).eq("id", l.id);
      if (!e2) done++;
    }
  }
  return { enriched: done, left: (data ?? []).filter(due).length - done, cost_exa: Math.round(cost * 1000) / 1000 };
}
const money = (n: number) => n >= 1e9 ? "$" + (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + n;
function fundingLine(o: any) {
  if (!ROUNDS.includes(o.round)) return "";
  const d = String(o.round_date ?? "").match(/^(\d{4})-(\d{2})/);
  const when = d ? new Date(+d[1], +d[2] - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" }) : "";
  return [o.round, +o.round_amount_usd > 0 ? money(+o.round_amount_usd) : "", when].filter(Boolean).join(" · ");
}
async function lookUp(l: any) {
  const schema = { type: "object", required: ["about_this_company", "one_liner"], properties: {
    about_this_company: { type: "boolean", description: "true only if the results are about this person's current company" },
    one_liner: { type: "string", description: "What the company builds and for whom, in plain words, under 15 words, no buzzwords. Example: 'AI note-taker for doctors that writes visit summaries'" },
    model: { type: "string", enum: [...MODELS, "unknown"] }, industry: { type: "string", description: "e.g. AI software, fintech, devtools, biotech" },
    employees: { type: "number", description: "team size if stated, else 0" },
    round: { type: "string", enum: [...ROUNDS, "unknown"], description: "their most recent funding round" },
    round_amount_usd: { type: "number", description: "amount of that round in USD, 0 if unknown" }, round_date: { type: "string", description: "YYYY-MM or YYYY-MM-DD of that round, empty if unknown" },
    accelerator: { type: "string", description: "e.g. YC W25, Techstars, empty if none" },
    source_url: { type: "string", description: "the result URL that best supports the funding facts" } } };
  const q = [l.company && !/^unknown$/i.test(l.company) ? l.company : "", l.name, "startup funding round"].filter(Boolean).join(" ");
  const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, numResults: 6, outputSchema: schema,
      systemPrompt: "Research one startup lead. Person: " + l.name + ". LinkedIn headline: \"" + (l.role ?? "") + "\". Company: " + (l.company || "unknown") + ". " +
        "Find what their company builds and its most recent funding round. Only use facts the results state; never guess. If the results are about a different person or company, set about_this_company=false." }) });
  if (!res.ok) throw new Error("Exa answered " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json();
  return { ...(j.output?.content ?? {}), cost: j.costDollars?.total ?? 0 };
}
// Where the founder lives, where the company is based, and whether it's a tech company (the filter's second half).
async function whereLookUp(l: any) {
  const schema = { type: "object", required: ["about_this_person"], properties: {
    about_this_person: { type: "boolean", description: "true only if the results are about this person or their current company" },
    founder_lives_in_country: { type: "string", description: "country where this person lives or works now, e.g. United States, India, United Kingdom; 'unknown' if not stated" },
    company_hq_country: { type: "string", description: "country of the company's headquarters; 'unknown' if not stated" },
    x_handle: { type: "string", description: "this person's X (Twitter) handle if the results show it, like @name; empty if not found" },
    company_hq_city: { type: "string", description: "city of the company's headquarters, e.g. San Francisco, New York, London, Bengaluru; 'unknown' if not stated" },
    is_tech_company: { type: "boolean", description: "true if the company builds software, AI, hardware, deep tech, biotech, fintech or another technology product; false for food, restaurants, retail, consumer goods, agencies, consulting, real estate and similar" },
    what_kind_of_company: { type: "string", description: "two to four words, e.g. B2B AI software, food delivery, marketing agency" },
    source_url: { type: "string" } } };
  const q = [l.name, l.company && !/^unknown$/i.test(l.company) ? l.company : "", "founder location headquarters"].filter(Boolean).join(" ");
  const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, numResults: 6, outputSchema: schema,
      systemPrompt: "One startup lead. Person: " + l.name + ". LinkedIn headline: \"" + (l.role ?? "") + "\". Company: " + (l.company || "unknown") + ". " +
        "Say where this person lives and where the company is based, only from what the results state (a LinkedIn profile location counts). Never guess from a name. Say if the company is a technology company." }) });
  if (!res.ok) throw new Error("Exa answered " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json();
  return { ...(j.output?.content ?? {}), cost: j.costDollars?.total ?? 0 };
}

// ═════════ v2 (11 Nov): where each lead came from, A/B/C message angles, sending at their local morning, the warm touch,
// withdrawing stale requests, new sources (profile views, requests sent to us, people we tag, commenters on founder posts we
// commented on), sorting replies, and a call brief with a pitch script when a call is booked. ═════════

// Where a lead came from, and which of the three it is (midbound: engaged with us; inbound: came to us; outbound: we went to them).
const SRC_LABEL: Record<string, string> = { liked: "Liked our post", commented: "Commented on our post", viewed: "Viewed our profile", inbound: "Sent us a connection request",
  tagged: "We tagged them in a post", niche: "Commented on a founder post we commented on", outbound: "We reached out first",
  funding: "Just announced a funding round", site: "Visited sove7gn.org", magnet: "Asked for one of our lead magnets",
  launch: "Just launched (Product Hunt or Hacker News)", hiring: "Hiring for growth or GTM", prospect: "Found by our ICP search", list: "From a founder list we built",
  comp: "Commented on a lead-gen agency's post, or named as their client" };
function srcOf(l: Lead): string {
  const li = l.fields?.li ?? {};
  if (li.src) return li.src;
  const o = String(l.origin_key ?? "");
  if (o.startsWith("li-src:")) return o.split(":")[1] || "outbound";
  if (o.startsWith("li-person:")) return /comment/i.test(l.source_detail ?? "") ? "commented" : "liked";
  return "outbound";
}
const boundOf = (src: string) => ["liked", "commented", "viewed", "site", "magnet"].includes(src) ? "midbound" : src === "inbound" ? "inbound" : "outbound";
const isOurs = (l: Lead) => /^li-(person|src):/.test(String(l.origin_key ?? ""));

const DEF_OPENERS: Record<string, string> = {
  liked: "saw you engage with my recent post & thought I'd reach out.",
  commented: "thanks for the comment on my recent post, really liked your take.",
  viewed: "noticed you checked out my profile, so thought I'd say hi.",
  inbound: "thanks for the connection request!",
  tagged: "hope you liked the post I tagged you in.",
  niche: "saw your comment on {post_author}'s post and liked your take.",
  outbound: "thanks for connecting!",
  funding: "congrats on the raise, saw the news and loved what you're building.",
  site: "came across what you're building at {company} and wanted to connect.",
  magnet: "thanks for reaching out about the post!",
  launch: "congrats on the {company} launch, really liked what you're building.",
  hiring: "saw {company} is growing the GTM side, exciting stage to be at.",
  prospect: "came across what you're building at {company} and wanted to connect.",
  list: "came across what you're building at {company} and wanted to connect.",
  comp: "came across what you're building at {company} and wanted to connect.",   // (16 Nov) never mentions the agency or the post
};
const DEF_ANGLES: Record<string, string> = {
  advice: "I'm Reyansh. Been building startups for the past couple of years and was also featured on Shark Tank.\n\nCurrently building something of my own in GTM space and would love to hear your thoughts and get some advice. Open to a 15-minute call sometime this week?",
  pitch: "I'm Reyansh, I run SOVE7GN. We're a growth studio for funded B2B founders: we run your founder content on LinkedIn and X plus warm outreach, and turn it into booked sales calls.\n\nWould a quick 15-minute call this week make sense to see if it's a fit for {company}?",
  freebie: "I'm Reyansh. I had a look at {company} and put together 3 small ideas that could bring in more inbound (content angles and who to reach).\n\nWant me to send them over? Happy to walk you through them on a quick call too.",
};
const ANGLE_LABEL: Record<string, string> = { advice: "A · Ask for advice", pitch: "B · Direct pitch", freebie: "C · Free ideas" };
type Scripts = { openers: Record<string, string>; angles: Record<string, string>; on: string[]; inmail: string };
async function scripts(): Promise<Scripts> {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot").maybeSingle();
  const v: any = data?.value ?? {};
  const on = (Array.isArray(v.angles_on) ? v.angles_on : ["advice", "pitch", "freebie"]).filter((a: string) => DEF_ANGLES[a]);
  return { openers: { ...DEF_OPENERS, ...(v.openers ?? {}) }, angles: { ...DEF_ANGLES, ...(v.angles ?? {}) }, on: on.length ? on : ["advice"],
    inmail: v.inmail ?? "Hey {first}, sent you a connection request a little while back. {opener_plain}\n\nI'm Reyansh, building SOVE7GN, a growth studio for funded B2B founders. Would love 15 minutes to hear how you're thinking about GTM at {company}. Open to a quick call?" };
}
function opener(sc: Scripts, l: Lead): string {
  const li = l.fields?.li ?? {};
  // They wrote the post we commented on (their reply sat under their own post): don't call it "a comment on <them>'s post".
  if (srcOf(l) === "niche" && sameName(li.post_author, l.name)) return "saw your recent post and the conversation under it, and liked your take.";
  return (sc.openers[srcOf(l)] ?? sc.openers.outbound).replaceAll("{post_author}", li.post_author || "a founder");
}
function firstDM(sc: Scripts, l: Lead, angle: string): string {
  return fill("Hey {first}, " + opener(sc, l) + "\n\n" + (sc.angles[angle] ?? sc.angles.advice), l);
}
// Which angle the next first message uses. Until every angle has 15 sent, the one with the fewest (an even test). After
// that it learns: 70% of the time the angle with the best reply rate so far, 30% the others (so a late bloomer can still win).
async function nextAngle(sc: Scripts, leads: Lead[]): Promise<string> {
  const n: Record<string, number> = {}, r: Record<string, number> = {};
  for (const a of sc.on) { n[a] = 0; r[a] = 0; }
  for (const l of leads) { const x = l.fields?.li ?? {}; const a = x.angle; if (!a || n[a] == null) continue; n[a]++; if (x.dm && x.replied) r[a]++; }
  if (sc.on.some((a) => n[a] < 15)) return sc.on.slice().sort((a, b) => n[a] - n[b])[0];
  const rate = (a: string) => (r[a] + 1) / (n[a] + 2);
  const best = sc.on.slice().sort((a, b) => rate(b) - rate(a))[0], rest = sc.on.filter((a) => a !== best);
  return !rest.length || Math.random() < 0.7 ? best : rest[Math.floor(Math.random() * rest.length)];
}

// ───────── their local time ─────────
const CITY_TZ: [RegExp, string][] = [
  [/san francisco|bay area|palo alto|mountain view|menlo park|san jose|oakland|berkeley|sunnyvale|santa clara|redwood|los angeles|\bla\b|san diego|seattle|portland|vancouver|las vegas|irvine|santa monica|sacramento/i, "America/Los_Angeles"],
  [/denver|boulder|salt lake|phoenix|calgary/i, "America/Denver"],
  [/chicago|austin|dallas|houston|minneapolis|st\.? louis|kansas city|nashville|new orleans|madison|milwaukee/i, "America/Chicago"],
  [/new york|nyc|brooklyn|boston|cambridge|miami|atlanta|washington|\bdc\b|philadelphia|pittsburgh|toronto|montreal|ottawa|raleigh|durham|charlotte|baltimore|detroit|columbus|waterloo/i, "America/New_York"],
  [/london|manchester|edinburgh|cambridge, uk|oxford|bristol|dublin|lisbon/i, "Europe/London"],
  [/berlin|munich|paris|amsterdam|stockholm|copenhagen|oslo|zurich|geneva|vienna|madrid|barcelona|brussels|milan|rome|helsinki|prague|warsaw|luxembourg/i, "Europe/Berlin"],
  [/tel aviv|jerusalem|haifa/i, "Asia/Jerusalem"], [/singapore/i, "Asia/Singapore"], [/tokyo/i, "Asia/Tokyo"], [/seoul/i, "Asia/Seoul"],
  [/sydney|melbourne|brisbane/i, "Australia/Sydney"], [/auckland/i, "Pacific/Auckland"], [/dubai|abu dhabi/i, "Asia/Dubai"],
  [/bengaluru|bangalore|mumbai|delhi|gurgaon|gurugram|noida|pune|hyderabad|chennai|kolkata|ahmedabad/i, "Asia/Kolkata"],
];
const COUNTRY_TZ: [RegExp, string][] = [[/united states|usa|america/i, "America/New_York"], [/canada/i, "America/Toronto"], [/united kingdom|uk|england|scotland|wales|ireland|portugal/i, "Europe/London"],
  [/germany|france|netherlands|belgium|switzerland|austria|sweden|norway|denmark|finland|spain|italy|luxembourg|poland/i, "Europe/Berlin"], [/israel/i, "Asia/Jerusalem"], [/singapore/i, "Asia/Singapore"],
  [/japan/i, "Asia/Tokyo"], [/korea/i, "Asia/Seoul"], [/australia/i, "Australia/Sydney"], [/new zealand/i, "Pacific/Auckland"], [/india/i, "Asia/Kolkata"], [/emirates|uae/i, "Asia/Dubai"]];
function tzOf(l: any): string {
  const ic = l.fields?.li_icp ?? {}, city = String(ic.hq_city ?? ""), country = String(ic.founder_country || ic.hq_country || l.fields?.gtm?.intel?.hq?.v || "");
  if (city) for (const [re, tz] of CITY_TZ) if (re.test(city)) return tz;
  if (country) for (const [re, tz] of COUNTRY_TZ) if (re.test(country)) return tz;
  return "";
}
function localHour(tz: string): number | null {
  if (!tz) return null;
  try { const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
    const h = +(p.find((x) => x.type === "hour")?.value ?? "0") % 24, m = +(p.find((x) => x.type === "minute")?.value ?? "0"); return h + m / 60; } catch { return null; }
}
// Messages land in their morning (8:00 to 12:00 their time); connection requests in their working day (8:00 to 20:00).
function goodTime(l: any, kind: string): boolean {
  const h = localHour(tzOf(l));
  if (h == null) return true;
  return kind === "invite" ? h >= 8 && h < 20 : h >= 8 && h < 12;
}

// ───────── language model (Composio's workbench), several prompts at once ─────────
async function llmMany(items: { id: string; prompt: string }[]): Promise<Record<string, string>> {
  if (!COMPOSIO || !items.length) return {};
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(items))));
  const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
    "items = json.loads(base64.b64decode('" + payload + "').decode())",
    "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
    "with ThreadPoolExecutor(8) as ex: res = dict(ex.map(one, items))", "print('@@' + json.dumps(res))"].join("\n");
  const outp = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Write text for the CRM" });
  return JSON.parse(String(outp?.data?.stdout ?? "").split("@@").pop() || "{}");
}
const parseJson = (s: string) => { try { return JSON.parse(String(s ?? "").replace(/^```(json)?|```$/gm, "").trim()); } catch { return null; } };

// ───────── people from the new sources ─────────
// kind: viewed (profile views), inbound (sent us a request), tagged (we tagged them), niche (commented on a founder post we
// commented on). Each person is judged once against the ICP (Exa, like social-sync); good fits become leads with their source.
// People who are already leads get the touch added to their history (a profile view adds to their score).
const keyOfP = (p: any) => p.urn ? "https://www.linkedin.com/in/" + String(p.urn).toLowerCase() : p.pid ? "https://www.linkedin.com/in/" + String(p.pid).toLowerCase() : "";
async function people(b: any) {
  const kind = String(b.kind ?? "");
  let list = (Array.isArray(b.people) ? b.people : []).filter((p: any) => p && (p.urn || p.pid));
  // (16 Nov) Commenters on lead-gen agencies' posts: kept for their own background check (comp_daily), not judged here.
  const comp = kind === "niche" ? list.filter((p: any) => /^comp:/.test(String(p.post_author ?? ""))) : [];
  let compN = 0;
  if (comp.length) { compN = await compLiPeople(comp, b.me).catch(() => 0); list = list.filter((p: any) => !comp.includes(p)); }
  list = list.slice(0, 80);
  if (!SRC_LABEL[kind]) return { added: 0 };
  if (!list.length) { await saveStatus({ ["last_" + kind]: now() }); return { added: 0, seen: 0, comp: compN }; }
  const { data: auto } = await db.from("crm_lead_settings").select("value").eq("key", "automation").maybeSingle();
  const icp = (auto?.value as any)?.icp ?? "";
  const meKeys = new Set([String(b.me?.urn ?? "").toLowerCase(), String(b.me?.pid ?? "").toLowerCase()].filter(Boolean));
  const leads = (await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key").eq("source", "LinkedIn").eq("archived", false).limit(4000)).data as Lead[] ?? [];
  const byId = new Map<string, Lead>(); for (const l of leads) for (const k of idsOf(l)) byId.set(k, l);
  let added = 0, touched = 0, judged = 0;
  const at = now(), what = (p: any) => kind === "viewed" ? "Viewed your LinkedIn profile" : kind === "inbound" ? "Sent you a LinkedIn connection request" + (p.message ? ": “" + clip(p.message, 300) + "”" : "") :
    kind === "tagged" ? "Tagged in your LinkedIn post" + (p.post_text ? ": “" + clip(p.post_text, 80) + "”" : "") : (sameName(p.post_author, p.name) ? "Replied under their own post, which we commented on" : "Commented on " + (p.post_author || "a founder") + "'s post we commented on") + (p.said ? ": “" + clip(p.said, 200) + "”" : "");
  for (const p of list) {
    p.name = cleanName(p.name); if (p.post_author) p.post_author = cleanName(p.post_author);
    if (meKeys.has(String(p.urn ?? "").toLowerCase()) || meKeys.has(String(p.pid ?? "").toLowerCase())) continue;
    const l = byId.get(String(p.urn ?? "").toLowerCase()) ?? byId.get(String(p.pid ?? "").toLowerCase());
    if (l) {   // already a lead: note the touch once
      const li = { ...(l.fields?.li ?? {}) }, flag = { viewed: "viewed", inbound: "inbound_at", tagged: "tagged", niche: "niche" }[kind as "viewed"]!;
      if (li[flag]) continue;
      li[flag] = at;
      if (kind === "inbound" && !li.req && !li.acc && !li.dm) { li.src = "inbound"; li.inv = p.inv ?? null; li.said = p.message ?? ""; }
      if (p.urn) li.urn = li.urn || p.urn; if (p.pid) li.pid = li.pid || p.pid;
      await saveLi(l, li); await log(l.id, what(p), "note"); touched++; continue;
    }
    const key = keyOfP(p);
    const { data: sp } = await db.from("crm_social_people").select("fit,judged_at,lead_id").eq("platform", "linkedin").eq("person_key", key).maybeSingle();
    // (14 Nov) People we tagged are our ICP by choice: they always become leads, whatever the fit check said.
    if (sp?.judged_at && sp.fit !== "hot" && kind !== "tagged") continue;   // judged before and not a fit
    let fit = sp?.fit ?? "", o: any = {};
    if (!sp?.judged_at) {
      if (judged >= 25) continue;                                        // the rest wait for the next run
      await db.from("crm_social_people").upsert({ platform: "linkedin", person_key: key, name: p.name ?? "", headline: p.headline ?? "", profile_url: p.pid ? "https://www.linkedin.com/in/" + p.pid : "https://www.linkedin.com/in/" + p.urn, is_self: false, last_seen: at }, { onConflict: "platform,person_key" });
      try { o = await judgeP({ name: p.name ?? "", headline: p.headline ?? "" }, p.said ?? p.message ?? "", icp); } catch (_) { o = {}; }
      judged++;
      fit = ["hot", "warm", "not a fit"].includes(o.fit) ? o.fit : "warm";
      await db.from("crm_social_people").update({ fit, why: o.why ?? "", role: o.role ?? "", company: o.company ?? "", company_what: o.company_what ?? "", company_stage: o.company_stage ?? "", judged_at: at, fit_by: "auto" })
        .eq("platform", "linkedin").eq("person_key", key);
    }
    if (fit !== "hot" && kind !== "tagged") continue;
    const li: any = { src: kind, urn: p.urn || undefined, pid: p.pid || undefined, said: p.said ?? p.message ?? "", post_author: p.post_author ?? "", [kind === "inbound" ? "inbound_at" : kind]: at };
    if (kind === "inbound") li.inv = p.inv ?? null;
    const { data: lead, error } = await db.from("crm_leads").insert({ name: p.name ?? "", role: o.role || clip(p.headline ?? "", 120), company: o.company ?? "", linkedin: p.pid ? "https://www.linkedin.com/in/" + p.pid : "https://www.linkedin.com/in/" + p.urn,
      direction: kind === "tagged" || kind === "niche" ? "Outbound" : "Inbound", source: "LinkedIn", source_detail: what(p), stage: "New", heat: "Hot",
      notes: [o.why, o.company_what ? (o.company || "Their company") + ": " + o.company_what : "", o.company_stage && o.company_stage !== "unknown" ? "Stage: " + o.company_stage : ""].filter(Boolean).join("\n"),
      origin_key: "li-src:" + kind + ":" + key, fields: { li }, created_by: "automation" }).select("id").single();
    if (error || !lead) continue;
    await db.from("crm_social_people").update({ lead_id: lead.id }).eq("platform", "linkedin").eq("person_key", key);
    await db.from("crm_lead_events").insert({ lead_id: lead.id, kind: "note", text: "Found automatically: " + what(p) + ". " + (o.why ?? ""), by_email: "automation" });
    added++;
  }
  await saveStatus({ ["last_" + kind]: at });
  return { added, touched, judged };
}
async function judgeP(p: { name: string; headline: string }, said: string, icp: string) {
  if (!EXA) throw new Error("EXA_API_KEY is missing.");
  const schema = { type: "object", required: ["fit", "why"], properties: {
    fit: { type: "string", enum: ["hot", "warm", "not a fit"] }, why: { type: "string", description: "One plain sentence a founder would understand" },
    role: { type: "string" }, company: { type: "string" }, company_what: { type: "string" }, company_stage: { type: "string" } } };
  const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: (p.headline || p.name) + " company", numResults: 5, outputSchema: schema,
      systemPrompt: "You judge one person as a sales lead. Their LinkedIn headline is: \"" + p.headline + "\". Name: " + p.name + "." + (said ? " They wrote: \"" + said.slice(0, 300) + "\"." : "") +
        " Judge mainly from the headline; use the results only to learn about their company. Never say not a fit just because nothing was found. " + (icp || "Hot = a founder or senior decision maker at a startup that could buy from us.") }) });
  if (!res.ok) throw new Error("Exa answered " + res.status + ": " + (await res.text()).slice(0, 200));
  return (await res.json()).output?.content ?? {};
}

// ───────── warm touch done (profile visited, latest post liked): the request goes out a few hours later ─────────
async function warmed(b: any) {
  const { data: t } = await db.from("crm_li_tasks").select("id,lead_id").eq("id", b.id).maybeSingle();
  if (!t) return { ok: false };
  const { data: l } = await db.from("crm_leads").select("id,fields").eq("id", t.lead_id).maybeSingle();
  if (l) {
    const li = { ...((l as any).fields?.li ?? {}), warm: now() };
    await db.from("crm_leads").update({ fields: { ...((l as any).fields ?? {}), li } }).eq("id", t.lead_id);
    await log(t.lead_id, "Visited their LinkedIn profile" + (b.liked ? " and liked their latest post" : "") + " before sending the request", "note");
  }
  await db.from("crm_li_tasks").update({ status: "ready" }).eq("id", t.id).eq("status", "sending");
  return { ok: true };
}

// ───────── requests nobody accepted in 3 weeks, withdrawn by the extension ─────────
async function withdrawn(b: any) {
  const list = Array.isArray(b.people) ? b.people : [];
  const leads = (await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key").eq("source", "LinkedIn").eq("archived", false).limit(4000)).data as Lead[] ?? [];
  const byId = new Map<string, Lead>(); for (const l of leads) for (const k of idsOf(l)) byId.set(k, l);
  const byName = new Map<string, Lead>(); for (const l of leads) byName.set(String(l.name ?? "").toLowerCase().trim(), l);
  let n = 0;
  for (const p of list) {
    const l = byId.get(String(p.urn ?? "").toLowerCase()) ?? byId.get(String(p.pid ?? "").toLowerCase()) ?? byName.get(String(p.name ?? "").toLowerCase().trim());
    if (!l) continue;
    const li = { ...(l.fields?.li ?? {}) };
    if (li.acc || li.dm || li.replied) continue;
    li.withdrawn = now(); li.stop = "withdrawn";
    await saveLi(l, li, ACTIVE.test(l.stage) ? { stage: "Lost" } : {});
    await log(l.id, "Withdrew our LinkedIn connection request: not accepted after " + (p.age || "3+ weeks") + ".", "note");
    n++;
  }
  await saveStatus({ last_withdraw: now(), last_withdraw_n: list.length });
  return { matched: n, withdrawn: list.length };
}

// ───────── replies: sorted, with an answer drafted ─────────
async function sortReply(l: Lead, text: string, chan = "LinkedIn"): Promise<{ label: string; draft: string }> {
  const li = l.fields?.li ?? {}, ic = l.fields?.li_icp ?? {};
  const prompt = "You help Reyansh (founder of SOVE7GN, a done-for-you GTM growth studio for funded B2B founders) answer a " + chan + " reply from a lead. We often offered them 3 free ideas for their inbound; a yes to that counts as interested.\n" +
    "Lead: " + l.name + ", " + (l.role || "") + (l.company ? " at " + l.company : "") + (ic.one_liner ? ". Company: " + ic.one_liner : "") + ".\n" +
    "Our last message angle: " + (li.angle || "advice") + ". They wrote: \"" + clip(text, 800) + "\"\n" +
    "Return JSON only: {\"label\": one of \"interested\" (wants to talk or asks for the call/ideas), \"question\" (asks something), \"not_now\" (busy, later, maybe next month), \"not_interested\" (no, not relevant, unsubscribe), \"other\"; " +
    "\"draft\": a short, warm reply in plain words, no dashes, no hashtags, under 60 words. No greeting: never start with Hey, Hi or their name, open straight on what they said. One question per message at most. Never end the conversation unless they said no: a thanks or a short acknowledgement gets one useful line plus one easy question about how they get customers today. If interested or a question, answer it, then ask for the call exactly like this: \"Worth a quick 15 minutes? If it's not a fit, I'll tell you straight. Does " + callSlots() + " work better?\" Never send a booking link unless they ask for a link. If not_now, thank them and say you'll check back in a month. If not_interested, thank them politely and close.}";
  const r = await llmMany([{ id: "r", prompt }]).catch(() => ({} as Record<string, string>));
  const j = parseJson(r.r ?? "") ?? {};
  const label = ["interested", "question", "not_now", "not_interested", "other"].includes(j.label) ? j.label : "other";
  return { label, draft: String(j.draft ?? "").replace(/\s*[—–]\s*/g, ", ").slice(0, 600) };
}

// ───────── catch-up (16 Nov) ─────────
// Reyansh's last week of LinkedIn and X chats compared with the CRM: who we messaged (by hand or not), who replied, who connected
// and never got a message. Each person is a card in Needs you: Add to pipeline (the CRM catches up to where the chat really is and
// the bots take over from there) or Ignore. Stored in crm_lead_settings "catchup" {at, items, decided}.
const nnm = (x: string) => String(x ?? "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
async function reconcile_li(b: any) {
  await db.from("crm_lead_settings").upsert({ key: "li_chats", value: { at: new Date().toISOString(), threads: (b.threads ?? []).slice(0, 400), conns: (b.conns ?? []).slice(0, 200) } });
  const { data: cu } = await db.from("crm_lead_settings").select("value").eq("key", "catchup").maybeSingle();
  await db.from("crm_lead_settings").upsert({ key: "catchup", value: { ...((cu?.value as any) ?? {}), li_at: new Date().toISOString() } });
  const n = await buildCatchup();
  return { ok: true, items: n };
}
async function catchup_scan(_b: any) {
  const { data: cu } = await db.from("crm_lead_settings").select("value").eq("key", "catchup").maybeSingle();
  await db.from("crm_lead_settings").upsert({ key: "catchup", value: { ...((cu?.value as any) ?? {}), req_at: new Date().toISOString() } });
  await buildCatchup();
  return { ok: true };
}
async function buildCatchup(): Promise<number> {
  const week = Date.now() - 7 * 864e5;
  const [{ data: lc }, { data: xc }, { data: cu }] = await Promise.all([
    db.from("crm_lead_settings").select("value").eq("key", "li_chats").maybeSingle(), db.from("crm_lead_settings").select("value").eq("key", "x_chats").maybeSingle(),
    db.from("crm_lead_settings").select("value").eq("key", "catchup").maybeSingle()]);
  const prev: any = cu?.value ?? {}; const decided: Record<string, string> = prev.decided ?? {};
  // the database answers at most 1,000 rows at a time: read every lead, page by page
  const L: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data: pg } = await db.from("crm_leads").select("id,name,company,role,stage,source,x_handle,linkedin,fields,archived").order("created_at").range(from, from + 999);
    L.push(...(pg ?? [])); if (!pg || pg.length < 1000) break;
  }
  const byUrn = new Map<string, any>(), byName = new Map<string, any>(), byH = new Map<string, any>();
  for (const l of L) { const li = l.fields?.li ?? {}; for (const k of [li.urn, li.pid]) if (k) byUrn.set(String(k).toLowerCase(), l);
    const n = nnm(l.name); if (n && !byName.has(n)) byName.set(n, l); const h = String(l.x_handle ?? "").replace(/^@/, "").toLowerCase(); if (h) byH.set(h, l); }
  const bg = (l: any) => { if (!l) return {}; const ic = l.fields?.li_icp ?? {}, iv = l.fields?.gtm?.intel ?? {};
    return { company: l.company || "", role: l.role || "", what: ic.one_liner || iv.description?.v || "", funding: ic.funding || [iv.round?.v, iv.amount?.v].filter(Boolean).join(" ") || "", lead_id: l.id, stage: l.stage, archived: !!l.archived }; };
  const items: any[] = [];
  // LinkedIn chats
  const lv: any = lc?.value ?? {};
  for (const t of (lv.threads ?? []) as any[]) {
    const lastAt = Date.parse(t.last_at || t.them_at || t.me_at || "") || 0; if (lastAt < week || !t.urn) continue;
    const l = byUrn.get(String(t.urn).toLowerCase()) ?? (t.them_name ? byName.get(nnm(t.them_name)) : null); const li = l?.fields?.li ?? {};
    if (l?.archived) continue;
    let why = "";
    if (t.last_from === "them") { const handled = (Date.parse(li.replied_last || li.replied || "") || 0) >= lastAt - 1000 && (li.answered || li.stop === "by hand"); if (!handled) why = "They wrote, no answer yet"; }
    else if (t.last_from === "me" && !l) why = "You messaged them, they're not in the CRM";
    else if (t.last_from === "me" && l && !li.dm && !li.stop) why = "You messaged them, the CRM shows no message";
    if (!why) continue;
    items.push({ key: "li:" + t.urn, plat: "LinkedIn", why, name: t.them_name || l?.name || "Someone", headline: t.them_headline || l?.role || "", url: t.them_url || l?.linkedin || "", urn: t.urn,
      last_from: t.last_from, last_text: String(t.last_text ?? "").slice(0, 400), last_at: new Date(lastAt).toISOString(), n_me: t.n_me ?? 0, n_them: t.n_them ?? 0, first_me: t.first_me_at ?? t.me_at ?? null, ...bg(l) });
  }
  // LinkedIn connections this week with no message from us
  const talked = new Set(((lv.threads ?? []) as any[]).filter((t: any) => (t.n_me ?? 0) > 0 || t.me_at).map((t: any) => String(t.urn).toLowerCase()));
  for (const c of (lv.conns ?? []) as any[]) {
    if (!c.urn || (Date.parse(c.at || "") || 0) < week || talked.has(String(c.urn).toLowerCase())) continue;
    const l = byUrn.get(String(c.urn).toLowerCase()) ?? byUrn.get(String(c.pid ?? "").toLowerCase()); const li = l?.fields?.li ?? {};
    if (l?.archived || li.dm || li.stop) continue;
    if (l && (await db.from("crm_li_tasks").select("id", { count: "exact", head: true }).eq("lead_id", l.id).in("kind", ["dm", "accept"]).in("status", ["review", "ready", "sending", "sent"])).count) continue;
    items.push({ key: "li:" + c.urn, plat: "LinkedIn", why: "Connected, no message yet", name: c.name || l?.name || "Someone", headline: l?.role || "", url: c.pid ? "https://www.linkedin.com/in/" + c.pid : l?.linkedin || "",
      urn: c.urn, pid: c.pid, conn_at: c.at, last_from: "", last_text: "", last_at: c.at, n_me: 0, n_them: 0, ...bg(l) });
  }
  // X chats (from the chat page)
  const xv: any = xc?.value ?? {}; const me = String(xv.me ?? "");
  const { data: rows } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Pipeline").order("row").limit(4000);
  const all = rows ?? []; const h = all.find((r: any) => (r.cells ?? []).filter(Boolean).length > 5);
  const obj = (r: any) => { const o: Record<string, string> = {}; ((h?.cells ?? []) as string[]).forEach((k, i) => { if (k) o[k] = String(r.cells?.[i] ?? ""); }); return o; };
  const pRows = h ? all.filter((r: any) => r.row > h.row).map((r: any) => ({ r, c: obj(r) })) : [];
  const { data: oa } = await db.from("crm_x_tasks").select("row").in("kind", ["reply", "close"]).in("status", ["review", "ready", "sending"]).limit(1000);
  const openAns = new Set((oa ?? []).map((t: any) => t.row));
  for (const d of (xv.rows ?? []) as any[]) {
    const lines = String(d.text ?? "").split("\n").map((x: string) => x.trim()).filter(Boolean); if (lines.length < 2) continue;
    const name = lines[0];
    if (/^(message requests?|start (a )?conversation|new (chat|message)|messages|chat|requests)$/i.test(name) || /^new chat$/i.test(lines[lines.length - 1])) continue;
    const prev = [...lines].reverse().find((x: string) => !/^(\d+[smhdw]|now|yesterday|\d{1,2}:\d{2}( ?[ap]m)?|[A-Z][a-z]{2} \d{1,2}(, \d{4})?)$/i.test(x)) || "";
    if (prev === name) continue;
    const ids = String(d.href ?? "").match(/(\d{5,})[-:](\d{5,})/); const uid = ids ? (ids[1] === me ? ids[2] : ids[1]) : "";
    const handle = ((String(d.text).match(/@([A-Za-z0-9_]{1,15})/) || [])[1] || "").toLowerCase();
    const pr = pRows.find((x: any) => (uid && String(x.c["X user ID"]) === uid) || (handle && String(x.c["X handle"]).replace(/^@/, "").toLowerCase() === handle) || nnm(x.c["Name"]) === nnm(name));
    const l = (handle && byH.get(handle)) || (pr ? byH.get(String(pr.c["X handle"]).replace(/^@/, "").toLowerCase()) : null) || byName.get(nnm(name));
    if (l?.archived || (pr && openAns.has(pr.r.row))) continue;
    const mine = /^you:/i.test(prev); const st = pr?.c["Status"] || ""; const res = pr?.c["DM result"] || "";
    let why = "";
    if (!mine && !/by hand/i.test(res) && !(l?.fields?.x?.replied && (l.fields.x.answered || /^by hand/i.test(res)))) why = pr ? (/^(replied|call booked|customer)$/i.test(st) ? "They wrote, no answer yet" : "They wrote, the CRM shows no reply") : "They wrote, they're not in the CRM";
    else if (mine && !pr) why = "You messaged them, they're not in the CRM";
    else if (mine && pr && /^to send$/i.test(st)) why = "You messaged them, the CRM shows To send";
    if (!why) continue;
    items.push({ key: "x:" + (uid || handle || nnm(name)), plat: "X", why, name, headline: pr ? [pr.c["Role"], pr.c["Company"]].filter(Boolean).join(" · ") : "", handle: handle || String(pr?.c["X handle"] ?? "").replace(/^@/, ""),
      uid, row: pr?.r.row ?? null, href: d.href || "", last_from: mine ? "me" : "them", last_text: prev.replace(/^you:\s*/i, "").slice(0, 400), last_at: xv.at,
      funding_row: pr?.c["Funding stage"] || "", ...bg(l), funding: bg(l).funding || pr?.c["Funding stage"] || "" });
  }
  const { data: rm } = await db.from("crm_removed").select("lead_id,li_urn,x").limit(5000);
  const rmL = new Set((rm ?? []).map((r: any) => r.lead_id).filter(Boolean)), rmU = new Set((rm ?? []).map((r: any) => r.li_urn).filter(Boolean)), rmX = new Set((rm ?? []).map((r: any) => r.x).filter(Boolean));
  const out = items.filter((x) => !decided[x.key] && !(x.lead_id && rmL.has(x.lead_id)) && !(x.urn && rmU.has(String(x.urn).toLowerCase())) && !(x.handle && rmX.has(String(x.handle).toLowerCase())));
  await db.from("crm_lead_settings").upsert({ key: "catchup", value: { ...prev, at: new Date().toISOString(), items: out, decided } });
  return out.length;
}
async function catchup_apply(b0: any) {
  const b = { ...b0, action: b0.what ?? b0.action };   // (16 Nov) the choice comes as "what" ("action" is the request's own name)
  const { data: cu } = await db.from("crm_lead_settings").select("value").eq("key", "catchup").maybeSingle();
  const v: any = cu?.value ?? {}; const it = (v.items ?? []).find((x: any) => x.key === b.key); if (!it) return { ok: false, error: "Already handled" };
  const decided = { ...(v.decided ?? {}), [it.key]: b.action }; const items = (v.items ?? []).filter((x: any) => x.key !== it.key);
  const save = () => db.from("crm_lead_settings").upsert({ key: "catchup", value: { ...v, items, decided } });
  if (b.action !== "add") { await save(); if (it.lead_id && b.action === "trash") await db.from("crm_leads").update({ archived: true }).eq("id", it.lead_id); return { ok: true }; }
  const now2 = new Date().toISOString();
  if (it.plat === "LinkedIn") {
    let l: any = it.lead_id ? (await db.from("crm_leads").select("*").eq("id", it.lead_id).maybeSingle()).data : null;
    const parts = String(it.headline || "").split(/ at | @ /i);
    if (!l) { const ins = await db.from("crm_leads").insert({ name: it.name, source: "LinkedIn", stage: "New", heat: "Hot", direction: "Outbound", linkedin: it.url || "", role: parts[0]?.slice(0, 120) || "", company: (parts[1] || "").slice(0, 120),
        origin_key: "li-src:catchup:" + String(it.urn).toLowerCase(), source_detail: "Added from your LinkedIn chats (catch-up " + now2.slice(0, 10) + ")", fields: { li: { src: "outbound", urn: it.urn, pid: it.pid || "" } } }).select("*").maybeSingle();
      l = ins.data; if (!l) return { ok: false, error: ins.error?.message ?? "Couldn't add them" }; }
    const li: any = { ...(l.fields?.li ?? {}), urn: it.urn };
    if (it.conn_at && !li.acc) li.acc = it.conn_at;
    if ((it.n_me ?? 0) > 0) { li.dm = li.dm || it.first_me || it.last_at; li.fu = Math.max(+li.fu || 0, Math.min(7, (it.n_me ?? 1) - 1)); li.last = it.last_from === "me" ? it.last_at : (li.last || it.last_at); li.req = li.req || li.acc || li.dm; li.acc = li.acc || li.dm; }
    delete li.stop; let stage = l.stage;
    if (it.last_from === "them") {
      li.replied = li.replied || it.last_at; li.replied_last = it.last_at; li.answered = null; li.stop = "replied";
      const sr = await sortReply(l, it.last_text || "", "LinkedIn").catch(() => ({ label: "other", draft: "" })); li.reply_label = sr.label; li.draft = sr.draft; li.reply_text = it.last_text;
      const R = await replyPlan({ ...l, fields: { ...(l.fields ?? {}), li } }, sr, "LinkedIn"); stage = (R.move.stage as string) || "In talks";
      if (R.status) await db.from("crm_li_tasks").insert({ lead_id: l.id, kind: R.kind, step: 0, text: R.text, subject: "", status: R.status });
    } else if ((it.n_me ?? 0) > 0) stage = /^(new)$/i.test(stage) ? "Contacted" : stage;
    await db.from("crm_leads").update({ fields: { ...(l.fields ?? {}), li }, stage, archived: false, last_touch: it.last_at || now2 }).eq("id", l.id);
    await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "note", text: "Caught up from your LinkedIn chats: " + it.why.toLowerCase() + (it.last_text ? " (last: “" + clip(it.last_text, 160) + "”)" : "") + ". The bots take over from here.", by_email: BY });
  } else {
    if (it.row) {
      const cells: Record<string, unknown> = { "DM result": "" };
      if (it.last_from === "them") { cells.Status = "Replied"; cells["Replied on"] = sheetSerial(new Date(), true); }
      else if (/to send/i.test(it.why)) { cells.Status = "Sent"; cells["Sent on"] = sheetSerial(new Date(it.last_at || Date.now()), true); }
      const { data: r0 } = await db.from("crm_sheet").select("cells").eq("tab", "DM Pipeline").eq("row", it.row).maybeSingle();
      await db.rpc("crm_call", { body: { action: "pipeline", row: it.row, name: it.name, company: "", cells } });
      if (it.last_from === "them" && it.uid) await x_inbox({ me: { id: "" }, items: [{ from: it.uid, to: "", text: it.last_text, at: Date.now() }] });
    } else if (it.handle) {
      let l: any = it.lead_id ? (await db.from("crm_leads").select("*").eq("id", it.lead_id).maybeSingle()).data : null;
      if (!l) l = (await db.from("crm_leads").insert({ name: it.name, source: "X", stage: it.last_from === "them" ? "In talks" : "Contacted", heat: "Hot", direction: "Outbound", x_handle: "@" + it.handle,
        origin_key: "x-catchup:" + it.handle.toLowerCase(), source_detail: "Added from your X chats (catch-up " + now2.slice(0, 10) + ")", fields: { x: it.last_from === "them" ? { replied: now2, replied_last: now2, reply_text: it.last_text } : {} } }).select("*").maybeSingle()).data;
      if (l) await toXPipeline(l, "");
    } else return { ok: false, error: "No X handle seen for them: open their chat once so the bot can read it" };
  }
  await save();
  return { ok: true };
}

// ───────── reply rules (16 Nov) ─────────
// What happens when someone writes back, per kind of reply. Edited on the CRM's Bots page (crm_lead_settings "reply_rules").
// send: "review" = the answer waits for Reyansh's OK, "auto" = it goes out on its own, "off" = only a draft on their card.
const REPLY_LABEL: Record<string, string> = { interested: "interested", question: "a question", not_now: "not now", not_interested: "not interested", other: "replied" };
const CLOSE_DEFAULT = "No worries at all {first}, I won't bother you again. In case it's useful later: we built the whole GTM engine for Aktoria (a YC company) and got them 30+ sales calls in 2 weeks, all organic. Feel free to reach out anytime.";
async function replyRules() {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "reply_rules").maybeSingle();
  const v: any = data?.value ?? {};
  const d: any = { interested: { stage: "In talks", send: "review" }, question: { stage: "In talks", send: "review" }, not_now: { stage: "Cold lead", send: "review" },
    not_interested: { stage: "Lost", send: "review" }, other: { stage: "In talks", send: "review" } };
  for (const k of Object.keys(d)) d[k] = { ...d[k], ...(v[k] ?? {}) };
  return { ...d, close_text: String(v.close_text || CLOSE_DEFAULT) };
}
async function replyPlan(l: any, sr: { label: string; draft: string }, chan: string) {
  const R = await replyRules(); const rule = R[sr.label] ?? R.other;
  const move: Record<string, unknown> = {};
  if (l?.id && !/^(call booked|proposal sent|won)$/i.test(l.stage || "") && rule.stage && l.stage !== rule.stage) { move.stage = rule.stage; move.stage_at = now(); }
  const first = firstName(l?.name || ""), co = l?.company && !/^unknown$/i.test(l.company) ? l.company : "your company";
  let text = sr.draft, kind = "reply";
  if (sr.label === "not_interested") { text = String(R.close_text).replace(/\{first\}/g, first).replace(/\{company\}/g, co); kind = "close"; }
  else if (sr.label === "interested" && l?.fields?.tips?.text && !l?.fields?.tips?.sent_at) text = String(l.fields.tips.text);
  const status = !text || rule.send === "off" ? null : rule.send === "auto" ? "ready" : "review";
  return { move, text, kind, status, label: sr.label, chan };
}

// (16 Nov) What each X job in the extension last did (dms, replies, inbox, reader), shown on the CRM's Bots page.
async function x_job(b: any) {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot_status").maybeSingle();
  const v: any = data?.value ?? {}; const jobs = { ...(v.jobs ?? {}) };
  jobs[String(b.name ?? "job")] = { at: new Date().toISOString(), ok: !!b.ok, note: String(b.note ?? "").slice(0, 300) };
  await db.from("crm_lead_settings").upsert({ key: "x_bot_status", value: { ...v, jobs, seen: new Date().toISOString(), version: b.version ?? v.version } });
  return { ok: true };
}

// Which X chats the extension should open this run: people we DMed in the last 3 weeks who aren't closed, oldest checked first.
async function x_inbox_targets(_b: any) {
  const since = new Date(Date.now() - 21 * 864e5).toISOString();
  const { data: xt } = await db.from("crm_x_tasks").select("user_id,row").eq("status", "sent").gte("sent_at", since).limit(3000);
  const uids = [...new Set((xt ?? []).map((t: any) => String(t.user_id ?? "")).filter(Boolean))];
  const { data: sv } = await db.from("crm_lead_settings").select("value").eq("key", "x_inbox_checked").maybeSingle(); const checked: Record<string, number> = { ...((sv?.value as any) ?? {}) };
  const pick = uids.sort((a, b) => (checked[a] || 0) - (checked[b] || 0)).slice(0, 15);
  const now2 = Date.now(); for (const u of pick) checked[u] = now2;
  for (const k of Object.keys(checked)) if (!uids.includes(k)) delete checked[k];
  await db.from("crm_lead_settings").upsert({ key: "x_inbox_checked", value: checked });
  return { user_ids: pick };
}

// ───────── X inbox (16 Nov): the extension reads the X DM inbox; replies to our DMs are caught, sorted and answered ─────────
async function x_inbox(b: any) {
  const me = String(b.me?.id ?? "");
  const raw = (b.items ?? []).filter((m: any) => m && m.from && m.text).map((m: any) => ({ ...m, from: String(m.from), to: String(m.to ?? ""), at: +m.at || 0 }));
  const items = raw.filter((m: any) => m.from !== me);
  // (16 Nov) Rows read off the Messages page (new X chats are encrypted, so only the page shows them): a row whose last
  // message isn't ours ("You: ...") and that we haven't seen before counts as their reply, matched by @handle or chat link.
  const domRows = (b.dom ?? []).filter((d: any) => d && d.text);
  const domHits: { handle: string; uid: string; name?: string; text: string }[] = [];
  for (const d of domRows) {
    const lines = String(d.text).split("\n").map((x: string) => x.trim()).filter(Boolean);
    const handle = ((String(d.text).match(/@([A-Za-z0-9_]{1,15})/) || [])[1] || "").toLowerCase();
    const ids = String(d.href ?? "").match(/(\d{5,})-(\d{5,})/) || String(d.href ?? "").match(/(\d{5,}):(\d{5,})/); const uid = ids ? (ids[1] === me ? ids[2] : ids[1]) : "";
    const last = lines[lines.length - 1] || "";
    // the list shows a time ("2h", "Nov 13") as a line of its own; the last real line is the preview
    const prev = [...lines].reverse().find((x: string) => !/^(\d+[smhdw]|now|yesterday|\d{1,2}:\d{2}( ?[ap]m)?|[A-Z][a-z]{2} \d{1,2}(, \d{4})?)$/i.test(x)) || "";
    const name = String(lines[0] ?? "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
    if ((!handle && !uid && !name) || prev === lines[0] || /^(you|you sent|you:|you reacted)/i.test(prev)) continue;
    domHits.push({ handle, uid, name, text: prev.slice(0, 400) } as any);
  }
  // our own last message to each person: if it's after their reply, Reyansh already answered by hand
  const myLast = new Map<string, number>(); for (const m of raw) if (m.from === me && m.to) myLast.set(m.to, Math.max(myLast.get(m.to) || 0, m.at));
  await xStatus({ inbox_at: new Date().toISOString(), inbox_seen: items.length, inbox_ext: b.debug ?? null });
  if (!raw.length && !domRows.length) return { ok: true, replied: 0 };
  const { data: rows } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Pipeline").order("row").limit(4000);
  const all = rows ?? []; const h = all.find((r: any) => (r.cells ?? []).filter(Boolean).length > 5); if (!h) return { ok: false };
  const obj = (r: any) => { const o: Record<string, string> = {}; (h.cells as string[]).forEach((k, i) => { if (k) o[k] = String(r.cells?.[i] ?? ""); }); return o; };
  const byUid = new Map<string, any>();
  for (const r of all) if (r.row > h.row) { const u = String(obj(r)["X user ID"] ?? "").trim(); if (u) byUid.set(u, r); }
  const { data: xt } = await db.from("crm_x_tasks").select("row,user_id,status,sent_at,kind").limit(10000);
  for (const t of xt ?? []) if (t.user_id && !byUid.has(String(t.user_id))) { const r = all.find((x: any) => x.row === t.row); if (r) byUid.set(String(t.user_id), r); }
  // their messages count from our FIRST DM on (a follow-up may have gone out after they replied)
  const firstSent = new Map<number, number>(); for (const t of xt ?? []) if (t.status === "sent") { const v = Date.parse(t.sent_at) || 0; if (v && (!firstSent.get(t.row) || v < firstSent.get(t.row)!)) firstSent.set(t.row, v); }
  const { data: sv } = await db.from("crm_lead_settings").select("value").eq("key", "x_inbox").maybeSingle(); const seen: Record<string, any> = { ...((sv?.value as any) ?? {}) };
  // page rows become messages: matched to a pipeline row by chat id or @handle, ignored if it's one of our own sent texts or seen before
  const byHandle = new Map<string, any>(); for (const r of all) if (r.row > h.row) { const hh = String(obj(r)["X handle"] ?? "").replace(/^@/, "").toLowerCase(); if (hh) byHandle.set(hh, r); }
  const nn = (x: string) => String(x ?? "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const sentRows = new Set((xt ?? []).filter((t: any) => t.status === "sent").map((t: any) => t.row));
  const byName = new Map<string, any>(); for (const r of all) if (r.row > h.row && sentRows.has(r.row)) { const n = nn(obj(r)["Name"]); if (n && n.length > 3) byName.set(n, r); }
  const { data: ours } = await db.from("crm_x_tasks").select("row,text").eq("status", "sent").limit(10000);
  const ourText = (row: number, t: string) => (ours ?? []).some((o: any) => o.row === row && String(o.text ?? "").replace(/\s+/g, " ").slice(0, 40).toLowerCase() === t.replace(/\s+/g, " ").slice(0, 40).toLowerCase());
  for (const d of domHits) {
    const r = (d.uid && byUid.get(d.uid)) || (d.handle && byHandle.get(d.handle)) || (d.name && byName.get(d.name)); if (!r) continue;
    const uid = d.uid || String(obj(r)["X user ID"] ?? "") || [...byUid.entries()].find(([, v]) => v === r)?.[0] || "";
    if (!uid || ourText(r.row, d.text) || seen["dom:" + r.row] === d.text) continue;
    seen["dom:" + r.row] = d.text; items.push({ from: uid, to: me, text: d.text, at: Date.now(), via: "page" });
  }
  const { data: oa } = await db.from("crm_x_tasks").select("row").in("kind", ["reply", "close"]).in("status", ["review", "ready", "sending"]).limit(2000);
  const openAns = new Set((oa ?? []).map((t: any) => t.row));
  // (16 Nov, Reyansh's rule) his own X messages the bot didn't send: the person is his now (DM result "By hand"), bot stops.
  const norm = (x: string) => String(x ?? "").replace(/^you:\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 28);
  const sentBy = new Map<number, string[]>(); for (const o of ours ?? []) { const a = sentBy.get(o.row) || []; a.push(norm(o.text)); sentBy.set(o.row, a); }
  const isOurs = (row: number, text: string) => { const n = norm(text); return !n || (sentBy.get(row) || []).some((x) => x && (x.startsWith(n.slice(0, 20)) || n.startsWith(x.slice(0, 20)))); };
  const manual = new Map<number, string>();
  for (const m of raw) if (m.from === me && m.to) { const r = byUid.get(m.to); if (r && (firstSent.get(r.row) || 0) && m.at > (firstSent.get(r.row) || 0) && !isOurs(r.row, m.text)) manual.set(r.row, m.text); }
  for (const d of domRows) {
    const lines = String(d.text).split("\n").map((x: string) => x.trim()).filter(Boolean); const last = lines[lines.length - 1] || "";
    if (!/^you:/i.test(last)) continue;
    const ids = String(d.href ?? "").match(/(\d{5,})[-:](\d{5,})/); const uid = ids ? (ids[1] === me ? ids[2] : ids[1]) : "";
    const handle = ((String(d.text).match(/@([A-Za-z0-9_]{1,15})/) || [])[1] || "").toLowerCase(); const nm = String(lines[0] ?? "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
    const r = (uid && byUid.get(uid)) || (handle && byHandle.get(handle)) || (nm && byName.get(nm));
    if (r && (firstSent.get(r.row) || 0) && !isOurs(r.row, last)) manual.set(r.row, last.replace(/^you:\s*/i, ""));
  }
  let handed = 0;
  for (const [row, text] of manual) {
    const r = all.find((x: any) => x.row === row); if (!r) continue; const c = obj(r);
    if (/^by hand/i.test(c["DM result"] || "")) continue;
    await db.rpc("crm_call", { body: { action: "pipeline", row, name: c["Name"], company: c["Company"], cells: { "DM result": "By hand · you messaged them" + (c["DM result"] ? " · " + c["DM result"] : "") } } });
    await db.from("crm_x_tasks").update({ status: "skipped", error: "You messaged them yourself" }).eq("row", row).in("status", ["review", "ready", "sending"]);
    const ld = await leadByHandle(String(c["X handle"] ?? "").replace(/^@/, ""));
    if (ld) await db.from("crm_lead_events").insert({ lead_id: ld.id, kind: "note", text: "You messaged them yourself on X (“" + clip(text, 160) + "”), so the bots stopped. Press Resume follow-ups in the CRM to hand them back.", by_email: "x" });
    handed++;
  }
  let replied = 0;
  for (const uid of [...new Set(items.map((m: any) => m.from))]) {
    const r = byUid.get(uid as string); if (!r) continue;
    if (openAns.has(r.row)) continue;                       // an answer for them is already waiting for your OK
    const c = obj(r); const ls = firstSent.get(r.row) || 0; const sn = +seen[r.row] || 0;
    const mine = items.filter((m: any) => m.from === uid && m.at > Math.max(ls, sn)).sort((a: any, b2: any) => a.at - b2.at);
    if (!ls || !mine.length) continue;
    const at = mine[mine.length - 1].at; seen[r.row] = at;
    const said = mine.map((m: any) => m.text).join("\n"); const iso = new Date(at).toISOString();
    const handle = String(c["X handle"] ?? "").replace(/^@/, ""); const byHand = /^by hand/i.test(c["DM result"] || "");
    const answeredAt = (myLast.get(uid as string) || 0) > at ? new Date(myLast.get(uid as string)!).toISOString() : null;
    let l: any = handle ? await leadByHandle(handle) : null;
    const pseudo: any = l ?? { name: c["Name"], company: c["Company"], role: c["Role"], fields: {} };
    const sr = await sortReply(pseudo, said, "X").catch(() => ({ label: "other", draft: "" }));
    const cells: Record<string, unknown> = { "DM result": (byHand ? "By hand · " : "") + "Replied: " + REPLY_LABEL[sr.label] };
    if (!c["Replied on"]) { cells.Status = "Replied"; cells["Replied on"] = sheetSerial(new Date(at), true); }
    await db.rpc("crm_call", { body: { action: "pipeline", row: r.row, name: c["Name"], company: c["Company"], cells } });
    await db.from("crm_x_tasks").update({ status: "skipped", error: "They replied" }).eq("row", r.row).in("status", ["ready", "sending", "review"]).in("kind", ["dm", "fu1", "fu2", ...X_FU_KINDS]);
    if (!l && handle) l = await leadByHandle(handle);
    const R = await replyPlan(l ?? pseudo, sr, "X");
    if (l) {
      const x = { ...(l.fields?.x ?? {}) }; x.replied = x.replied || iso; x.replied_last = iso; x.reply_label = sr.label; x.draft = R.text || sr.draft; x.reply_text = clip(said, 600); x.answered = answeredAt;
      await db.from("crm_leads").update({ fields: { ...(l.fields ?? {}), x }, last_touch: answeredAt || iso, ...(answeredAt ? {} : R.move) }).eq("id", l.id);
      await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "message", text: "Replied on X (" + REPLY_LABEL[sr.label] + "): “" + clip(said, 600) + "”", by_email: "x" });
    }
    if (R.status && !byHand && !answeredAt) await db.from("crm_x_tasks").insert({ row: r.row, name: c["Name"], company: c["Company"], handle, user_id: uid, kind: R.kind, text: R.text, status: "review", decided_by: "auto: reply" });   // (16 Nov) X answers: copied and sent by hand from Needs you
    replied++;
  }
  await db.from("crm_lead_settings").upsert({ key: "x_inbox", value: seen });
  if (domRows.length) {
    await db.from("crm_lead_settings").upsert({ key: "x_chats", value: { at: new Date().toISOString(), me, rows: domRows.slice(0, 150) } });
    const { data: cu } = await db.from("crm_lead_settings").select("value").eq("key", "catchup").maybeSingle();
    if (Date.now() - (Date.parse((cu?.value as any)?.at ?? "") || 0) > 3600e3) await buildCatchup().catch(() => null);
  }
  if (handed) await xStatus({ inbox_handed: handed, inbox_handed_at: new Date().toISOString() });
  await xStatus({ inbox_debug: { me, ext: b.debug ?? null, dom_rows: domRows.length, dom_hits: domHits.length, senders: [...new Set(items.map((m: any) => m.from))].slice(0, 40), known: [...new Set(items.map((m: any) => m.from))].filter((u) => byUid.has(u as string)), at_range: [Math.min(...items.map((m: any) => m.at)), Math.max(...items.map((m: any) => m.at))], replied } });
  return { ok: true, replied };
}

// ───────── call brief: when a GTM call is booked, research them and write the call plan ─────────
// (12 Nov, Reyansh's format) We don't open with a pitch. Reyansh says what he's building in 1 or 2 lines, walks them through the
// inbound / midbound / outbound system on X, LinkedIn and email, asks what they think and what's hard for them right now, drops a
// real result, and reads whether they'd want a pilot. Results come from PROOF (or li_bot.proof in settings), never made up.
const SYSTEM_TEXT = [
  "What SOVE7GN is building: a GTM engine for funded B2B founders that runs their inbound, midbound and outbound on X, LinkedIn and email, so the founder gets sales calls without hiring a marketing or SDR team.",
  "INBOUND (people come to them): founder content on X and LinkedIn, about 3 posts a day built on formats that already went viral for others in their space, plus tracking what each post brings in.",
  "MIDBOUND (people who already showed interest): everyone who likes, comments, replies or views their profile is checked against their ideal customer; good fits get a personal reply and a DM the same day.",
  "OUTBOUND (people who don't know them yet): every day we find recently funded founders and buyers who fit, warm them up first (profile visit, a like), then a LinkedIn request with a note, X DMs and cold email from separate domains, with follow-ups until they reply, and the calls go on the founder's calendar.",
  "Everything lands in one CRM with a morning brief of who to follow up with.",
].join("\n");
const PROOF = ["For a YC founder we got 100K views on TikTok and several sales calls booked, completely inbound.",
  "We set up an entire GTM funnel for a YC company and got them 30+ sales calls booked within 2 weeks (100K+ views on X), purely with organic inbound, midbound and outbound automations."];

async function briefs(b: any) {
  const { data } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,heat,email,x_handle,fields,source_detail,origin_key,notes,source,website,pitch,closed_for").eq("archived", false)
    .in("stage", ["Call booked", "Proposal sent"]).in("source", ["LinkedIn", "X"]).limit(200);
  // Only calls booked for the GTM service (clipping and UGC leads don't get one).
  const gtm = (data ?? []).filter((l: any) => !/clip|ugc|reel/i.test(String(l.pitch ?? "") + " " + String(l.closed_for ?? "")) && l.fields?.call?.kind !== "clipping");
  const { data: bs } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot").maybeSingle();
  const proof: string[] = Array.isArray((bs?.value as any)?.proof) && (bs?.value as any).proof.length ? (bs?.value as any).proof : PROOF;
  const todo = gtm.filter((l: any) => !l.fields?.brief?.at || b.force_id === l.id).slice(0, +(b.limit ?? 3));
  let made = 0;
  for (const l of todo as any[]) {
    const { data: ev } = await db.from("crm_lead_events").select("at,kind,text,by_email").eq("lead_id", l.id).order("at", { ascending: true }).limit(40);
    const ic = l.fields?.li_icp ?? {}, I = l.fields?.gtm?.intel ?? {}, li = l.fields?.li ?? {}, v = (k: string) => I[k]?.v ?? "";
    // (12 Nov, locked by Reyansh) The dossier is a script he reads out, in a fixed order: key facts, the idea (one line, then
    // inbound, midbound, outbound and how they feed each other through one CRM), questions about their business, then the pilot.
    // The model only fills the parts about them; the order and our wording live here so every dossier reads the same way.
    let co: any = {};
    if (EXA && (l.company || ic.one_liner || l.name)) {
      try {
        const schema = { type: "object", properties: {
          product: { type: "string", description: "what they sell, in one sentence" }, customers: { type: "string", description: "who buys it" },
          total_raised: { type: "string", description: "total funding and the latest round with amount, month and lead investor" }, team_size: { type: "string" },
          milestones: { type: "string", description: "recent launches, customers, revenue, users, awards, accelerator" },
          how_they_sell_today: { type: "string", description: "founder-led sales, outbound, PLG, ads, content; what is known" },
          x_handle: { type: "string", description: "the founder's personal X (Twitter) handle, without @" }, x_followers: { type: "string" },
          linkedin_followers: { type: "string", description: "followers on the founder's LinkedIn profile" }, recent_news: { type: "string" } } };
        const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
          body: JSON.stringify({ query: (l.company || "") + " " + (l.name || "") + " founder", numResults: 8, outputSchema: schema,
            systemPrompt: "Research this startup and its founder for a sales call. Company: " + (l.company || "unknown") + ". Founder: " + l.name + " (" + (l.role || "") + "). " +
              (ic.one_liner ? "They build: " + ic.one_liner + ". " : "") + "Only state facts from the results; leave a field empty if it isn't there." }) });
        if (res.ok) co = (await res.json()).output?.content ?? {};
        // Research says "Not available" or "Unknown" when it found nothing: treat that as empty.
        for (const k of Object.keys(co)) if (/^(not (available|found|stated|known|specified|provided|disclosed)|unknown|n\/?a|none|null)\b/i.test(String(co[k] ?? "").trim())) co[k] = "";
      } catch (_) { /* the dossier still gets written from what we have */ }
    }
    // Their X: the handle on the lead first, then what research found; followers read live from X when we can.
    const xh = String(l.x_handle || (/^@?[A-Za-z0-9_]{2,15}$/.test(String(co.x_handle ?? "").trim()) ? co.x_handle : "") || "").replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "").split(/[/?\s]/)[0];
    let xFollowers = co.x_followers ? String(co.x_followers) : "";
    if (xh && TWAPI) {
      try { const r = await fetch("https://api.twitterapi.io/twitter/user/info?userName=" + encodeURIComponent(xh), { headers: { "X-API-Key": TWAPI } });
        // 0 followers almost always means research guessed the wrong handle: then show no count.
        if (r.ok) { const u = (await r.json())?.data; if (u?.followers != null) xFollowers = Number(u.followers) > 0 ? Number(u.followers).toLocaleString("en-US") : ""; } } catch (_) { /* keep research's number */ }
    }
    const liUrl = l.linkedin || (li.pid ? "https://www.linkedin.com/in/" + li.pid : "");
    const src = srcOf(l as Lead), angle = li.angle || "";
    const convo = (ev ?? []).filter((e: any) => ["message", "note", "meeting", "call", "engaged"].includes(e.kind)).map((e: any) => String(e.at).slice(0, 10) + " " + clip(String(e.text), 300)).join("\n");
    const pitchLed = angle === "pitch" || /gtm|growth|service|pricing|proposal|pilot/i.test(convo);
    const facts = ["Lead: " + l.name + ", " + (l.role || "") + (l.company ? " at " + l.company : ""), ic.one_liner ? "What they build: " + ic.one_liner : (v("description") ? "What they build: " + v("description") : ""),
      ic.funding ? "Latest round: " + ic.funding : "", v("employees") ? "Team size: " + v("employees") : "", [ic.hq_city, ic.hq_country].filter(Boolean).length ? "Based in: " + [ic.hq_city, ic.hq_country].filter(Boolean).join(", ") : "",
      v("accelerator") ? "Accelerator: " + v("accelerator") : "", "How they found us: " + (SRC_LABEL[src] ?? src) + (l.source_detail ? " (" + l.source_detail + ")" : ""),
      ...Object.entries(co).filter(([, x]) => x).map(([k, x]) => k.replace(/_/g, " ") + ": " + clip(String(x), 400)), convo ? "Conversation so far:\n" + convo : ""].filter(Boolean).join("\n");
    const first = String(l.name || "").replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/)[0] || "there";
    const company = l.company || "your company";
    const prompt = "Reyansh (founder of SOVE7GN, a GTM growth studio for seed to Series C founders) has a sales call with " + l.name + (l.company ? " of " + l.company : "") + ". " +
      "Fill in the parts of his call script that are about them. Every value must be complete, natural spoken sentences he can read out word for word: no fragments, no bullet stubs, " +
      "no labels like 'Inbound:' at the start, no dashes as punctuation, no emojis. Only use facts below; never invent numbers, customers or news.\n\n" +
      "Facts:\n" + facts + "\n\n" +
      "Answer with JSON only:\n" +
      "{\"replace_what\": \"what we replace for a company at their stage, as a phrase that fits after 'We essentially replace', e.g. 'the marketing hire and the SDR you would otherwise need'\",\n" +
      " \"inbound_example\": \"one or two sentences starting 'For " + company + ", ...' with a post idea their buyers would care about\",\n" +
      " \"midbound_example\": \"one sentence starting 'For you, that would be ...' naming who would be engaging and what we'd send them\",\n" +
      " \"outbound_example\": \"one sentence starting 'For " + company + ", we would go after ...' naming the exact kind of buyer\",\n" +
      " \"congrats\": \"one or two sentences opening the questions: 'I wanted to understand more about " + company + ". I read up on it, and congrats on ...' naming a real recent raise, launch or milestone from the facts (if there is none, praise something specific they built)\",\n" +
      " \"questions\": [\"6 full questions, in order, that get them to explain how they do GTM now, how many leads come in inbound each month and from where, who does sales and content, what they've tried that didn't work, what happens to people who engage with their posts, and what a great quarter would look like; make them specific to their business so they end up explaining why they need this\"],\n" +
      " \"listen_for\": [\"3 short problems they are likely to mention, in their words\"]}";
    const r = await llmMany([{ id: "b", prompt }]).catch(() => ({} as Record<string, string>));
    const j = parseJson(r.b ?? "") ?? {};
    const clean = (x: unknown) => String(x ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
    if (!clean(j.replace_what) || !Array.isArray(j.questions)) continue;
    const pilot = String((bs?.value as any)?.pilot || "So here's what I'd suggest. Let's do a one month pilot and see how it works. We take care of one social handle for you, X or LinkedIn, whichever matters more for " + company + ", and we guarantee 30 sales calls in that month. If it works, we talk about running all three channels. Does that sound worth trying?");
    const cnt = (x: unknown) => clean(x).replace(/\s*followers?\.?$/i, "");
    co.linkedin_followers = cnt(co.linkedin_followers); xFollowers = cnt(xFollowers);
    const keyFacts = [
      "X: " + (xh ? "@" + xh + (xFollowers ? ", " + xFollowers + " followers" : "") + " · https://x.com/" + xh : "not found yet"),
      "LinkedIn: " + (co.linkedin_followers ? clean(co.linkedin_followers) + " followers" : "followers not found") + (liUrl ? " · " + liUrl : ""),
      "Raised: " + (clean(co.total_raised) || clean(ic.funding) || "not found"),
      co.team_size || v("employees") ? "Team: " + clean(co.team_size || v("employees")) : "",
      co.product || ic.one_liner ? "They sell: " + clean(co.product || ic.one_liner) + (co.customers ? " Buyers: " + clean(co.customers) : "") : "",
      co.milestones ? "Milestones: " + clean(co.milestones) : "",
      co.how_they_sell_today ? "How they sell today: " + clean(co.how_they_sell_today) : "",
    ].filter(Boolean).map((x) => "• " + x).join("\n");
    const text = [
      "KEY FACTS", keyFacts, "",
      "PART 1: THE IDEA (read this out)",
      "Thanks for making the time, " + first + ". Before I ask about " + company + ", let me quickly tell you what we're building.",
      "We're building a GTM growth studio for founders from seed to Series C. We essentially replace " + clean(j.replace_what) + ", and we run your content and outreach for you, so you get a steady flow of organic sales calls booked through X, LinkedIn and email.",
      "Let me go one level deeper. We focus on three channels.",
      "The first is inbound. We write and post founder content on X and LinkedIn, around three posts a day, built on formats that have already gone viral in your space, so the right buyers start coming to you. The output is a growing audience of buyers and people reaching out on their own. " + clean(j.inbound_example),
      "The second is midbound. Everyone who likes, comments, replies or views your profile is already warm, and most founders never follow up with them. We check each one against your ideal customer every day and send the good fits a personal reply and a DM the same day. The output is real conversations with people who already know you. " + clean(j.midbound_example),
      "The third is outbound. Every day we find recently funded founders and buyers who fit, warm them up first with a profile visit and a like, then reach out with a LinkedIn note, an X DM and cold email from separate domains, and follow up until they reply. The output is sales calls on your calendar. " + clean(j.outbound_example),
      "And finally, all three run into one CRM, and they push each other. Your posts give outbound something to reference, so cold messages land warmer. Outbound brings new people to your profile, who then see your posts. And everyone who engages with a post becomes midbound and gets a DM. Every morning you get one list of who to follow up with across X, LinkedIn and email.",
      "That's the whole idea. Happy to answer anything.",
      "If they ask for proof, have these ready:\n" + ["The Aktoria case study.", ...proof].map((x) => "• " + x).join("\n"),
      "",
      "PART 2: QUESTIONS ABOUT THEIR BUSINESS",
      clean(j.congrats),
      ...j.questions.slice(0, 7).map((q: unknown, i: number) => (i + 1) + ". " + clean(q)),
      "Listen for: " + (Array.isArray(j.listen_for) ? j.listen_for.map((x: unknown) => clean(x).replace(/[.;]+$/, "")).join("; ") : "") + ".",
      "",
      "PART 3: THE PILOT (read this out)",
      "From what you've told me, [repeat the 2 or 3 problems they just named]. These are exactly the problems we've solved for the founders we work with. " + (proof[1] ?? proof[0] ?? ""),
      pilot,
    ].join("\n\n").replace(/\n{3,}/g, "\n\n");
    const factsOut = { x_handle: xh, x_followers: xFollowers, li_followers: clean(co.linkedin_followers), raised: clean(co.total_raised) || clean(ic.funding), linkedin: liUrl };
    await db.from("crm_leads").update({ fields: { ...(l.fields ?? {}), brief: { at: now(), text: text.slice(0, 12000), mode: pitchLed ? "pitch" : "advice", company: co, facts: factsOut, v: 3 } } }).eq("id", l.id);
    await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "note", text: "Call dossier ready (script: the idea, questions, the pilot). Leads > Call dossiers.", by_email: "automation" });
    made++;
  }
  // The 15 minute job also writes the 3 tips for anyone who said yes to them.
  const tp: any = b.force_id ? {} : await tips({ limit: 4 }).catch(() => ({}));
  if (!b.force_id) await li_move({}).catch(() => ({}));
  if (!b.force_id) await x_from_li({ max: 6 }).catch(() => ({}));
  if (!b.force_id) await xv2_prepare({ max: 2 }).catch(() => ({}));    // (16 Nov) X first DMs get their v2 opener ahead       // (15 Nov) LinkedIn leads into the X pipeline, X handle found by the bot
  if (!b.force_id) await magnets_check({}).catch(() => ({}));
  // (16 Nov) Competitors: ads, ICP and buyers, agency posts and their commenters, in its own run so it never slows this one.
  if (!b.force_id) { const pr = fetch(SB_URL + "/functions/v1/li-bot", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": CRON }, body: JSON.stringify({ action: "comp_daily" }) }).then((r) => r.text()).catch(() => "");
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(pr); } catch (_) {} }            // LinkedIn posts moved on the calendar, still to write to the sheet
  return { made, waiting: gtm.filter((l: any) => !l.fields?.brief?.at).length - made, tips: tp.made ?? 0 };
}

// ───────── 3 tips: when someone says yes to "I have 3 small ideas that could bring in more inbound" ─────────
// (12 Nov) Five things we do in our GTM service. For each person we look up what their company sells and who buys it, pick the
// 3 that fit them best, tweak each with an example for their company, and write the LinkedIn message. It lands on the lead
// (fields.tips) for Reyansh to read, edit and send from Leads > All leads. Runs with the 15 minute job and from the CRM.
// The five can be changed in settings (li_bot.tips).
const TIPS = [
  { id: "midbound", title: "Track midbound", text: "Everyone who likes, comments on or replies to your posts, or views your profile, is a warm lead. Check each one against your ideal customer every day and send good fits a personal reply and a DM the same day. Most founders never follow up on these and they convert far better than cold." },
  { id: "crm", title: "One data matrix for every channel", text: "Put X, LinkedIn, email and your other tools (calendar, forms, product signups) into one CRM, so every person has one history: what they engaged with, what you sent, where they are. Then one morning list tells you who to follow up with today." },
  { id: "posts", title: "Three kinds of posts", text: "Rotate three post types on LinkedIn and X: account tagging posts (a list of 4 to 6 companies or founders your buyers care about, tagged, which works as a lead magnet and gets them to engage), founder led posts (lessons from building), and data centric posts (numbers, teardowns, benchmarks from your space)." },
  { id: "abtest", title: "A/B test your DMs", text: "Run 2 or 3 DM scripts side by side for midbound and outbound (for example a direct pitch, asking for advice, and giving value first), track reply rate per script, and keep the winner once each has about 15 sends." },
  { id: "warm", title: "Warm up before outbound", text: "Before a cold request or DM, visit their profile and like a recent post a few hours earlier, send in their local morning, and follow up a few times until they reply. Acceptance and reply rates go up a lot compared with sending cold." },
];
const TIPS_CTA = "Would love to jump on a quick call and see how I can set this up for {company}. We guarantee at least 25 calls in your first month, completely organic, or I refund you everything.";
const TIPS_CASE = "BTW, we set up an entire GTM funnel for a YC company got them 30+ sales calls booked within 2 weeks (100K+ Views on X) - purely doing organic inbound/midbound/outbound automations.";
async function tips(b: any) {
  const { data: bs } = await db.from("crm_lead_settings").select("value").eq("key", "li_bot").maybeSingle();
  const list: any[] = Array.isArray((bs?.value as any)?.tips) && (bs?.value as any).tips.length >= 3 ? (bs?.value as any).tips : TIPS;
  let leads: any[] = [];
  if (b.force_id) {
    leads = (await db.from("crm_leads").select("id,name,company,role,linkedin,stage,fields,source,website").eq("id", b.force_id)).data ?? [];
  } else {
    // People who replied after we offered the ideas (the note or a DM said "ideas" or "tips"), with no tips written yet.
    const { data: offered } = await db.from("crm_li_tasks").select("lead_id").eq("status", "sent").or("text.ilike.%idea%,text.ilike.%tips%").limit(2000);
    const ids = [...new Set((offered ?? []).map((t: any) => t.lead_id))];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,fields,source,website").in("id", ids.slice(i, i + 200)).eq("archived", false);
      leads.push(...(data ?? []).filter((l: any) => l.fields?.li?.replied && !l.fields?.tips?.at && l.fields?.li?.reply_label !== "not_interested"));
    }
    // (14 Nov) Everyone whose connection note promised 3 ideas gets them written ahead: accepted first, then requests still out.
    const { data: prom } = await db.from("crm_leads").select("id,name,company,role,linkedin,stage,fields,source,website").eq("archived", false).eq("source", "LinkedIn")
      .is("fields->tips->>at", null).or("fields->li->>promised.eq.true,fields->li->>src.eq.list,fields->li->>acc.not.is.null,fields->li->>fu.eq.3").limit(300);
    const pr = (prom ?? []).filter((l: any) => !(l.fields?.li?.src === "connection" && (!l.fields?.li_icp?.at || notFit(l) || !/founder|\bceo\b|chief|owner|president|managing director/i.test(String(l.role ?? "")))))
      .filter((l: any) => (l.fields?.li?.req || l.fields?.li?.acc) && !(l.fields?.li?.acc && l.fields?.li?.dm && !l.fields?.li?.promised && l.fields?.li?.src !== "list") && !l.fields?.li?.replied).sort((a: any, b2: any) => (b2.fields?.li?.acc ? 1 : 0) - (a.fields?.li?.acc ? 1 : 0));
    leads = [...pr.filter((l: any) => l.fields?.li?.acc), ...leads, ...pr.filter((l: any) => !l.fields?.li?.acc)].slice(0, +(b.limit ?? 4));
  }
  let made = 0;
  for (const l of leads) {
    const ic = l.fields?.li_icp ?? {}, I = l.fields?.gtm?.intel ?? {}, v = (k: string) => I[k]?.v ?? "";
    let co: any = l.fields?.brief?.company ?? {};
    if (EXA && !co.product && (l.company || ic.one_liner)) {
      try {
        const schema = { type: "object", properties: { product: { type: "string", description: "what they sell" }, customers: { type: "string", description: "who buys it: roles, company types" },
          how_they_sell_today: { type: "string", description: "founder-led sales, outbound, PLG, ads, content; what is known" }, channels: { type: "string", description: "where they post or show up: LinkedIn, X, blog, events" }, stage: { type: "string", description: "funding stage and team size" } } };
        const res = await exaFetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
          body: JSON.stringify({ query: (l.company || "") + " " + (l.name || "") + " startup", numResults: 6, outputSchema: schema,
            systemPrompt: "What does this startup sell and who buys it? Company: " + (l.company || "unknown") + ". Founder: " + l.name + " (" + (l.role || "") + "). " + (ic.one_liner ? "They build: " + ic.one_liner + ". " : "") + "Only facts from the results." }) });
        if (res.ok) co = (await res.json()).output?.content ?? {};
      } catch (_) { /* tips still get written from what we know */ }
    }
    const { data: ev } = await db.from("crm_lead_events").select("at,kind,text").eq("lead_id", l.id).in("kind", ["message", "note"]).order("at", { ascending: false }).limit(6);
    const facts = ["Name: " + l.name, l.role ? "Role: " + l.role : "", l.company ? "Company: " + l.company : "", ic.one_liner ? "What they build: " + ic.one_liner : v("description") ? "What they build: " + v("description") : "",
      ic.funding ? "Funding: " + ic.funding : "", ...Object.entries(co).filter(([, x]) => x).map(([k, x]) => k.replace(/_/g, " ") + ": " + clip(String(x), 300)),
      (ev ?? []).length ? "Latest messages:\n" + (ev ?? []).map((e: any) => clip(String(e.text), 240)).join("\n") : ""].filter(Boolean).join("\n");
    const prompt = "Reyansh (founder of SOVE7GN, a GTM studio) told this LinkedIn connection he had 3 small ideas that could bring them more inbound, and they said yes. " +
      "Here are the 5 things we do for clients:\n" + list.map((t: any, i: number) => (i + 1) + ". [" + t.id + "] " + t.title + ": " + t.text).join("\n") + "\n\n" +
      "About them:\n" + facts + "\n\n" +
      "Pick the 3 that would help THIS company most, given what they sell and who their buyers are. Rewrite each so it is about them: name their buyers, " +
      "give one concrete example for their company (for account tagging posts, say which kind of accounts they'd tag; for midbound, who would be engaging; and so on). " +
      "Then write the LinkedIn message Reyansh sends: start 'Hey " + (String(l.name || "").replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/)[0] || "there") + ", here they are:', then the 3 numbered ideas " +
      "(each 2 or 3 short sentences, a short title first). End EACH idea with a short bracket that names the GTM play behind it in our words, so we sound like we know the playbook, " +
      "for example '(midbound automation)', '(lead magnet posts to create midbound traffic)', '(outbound to people you expect at an upcoming event, then use those data points as posts for inbound)'. " +
      "The bracket can add a smart twist that connects inbound, midbound and outbound. Stop after the 3rd idea: no closing line, we add our own. " +
      "No pitch, no prices, no links, plain words, sounds like a founder typing, no dashes as punctuation, no emojis, under 1,200 characters in total.\n" +
      "Style example (another founder, don't copy the content):\n" +
      "1. Follow up with warm signals (midbound automation). Check who engages with your posts or views your profile, especially immunotherapy researchers and R&D leaders. If one comments on your readout post, send a personal note the same day.\n" +
      "2. Post for the teams you want to reach. Rotate founder lessons, data teardowns, and posts tagging 4 to 6 labs or companies your buyers follow. (lead magnet posts to create midbound traffic)\n\n" +
      "Answer with JSON only: {\"picked\": [3 ids], \"why\": \"one line on why these 3\", \"message\": \"the message\"}";
    const r = await llmMany([{ id: "t", prompt }]).catch(() => ({} as Record<string, string>));
    const j = parseJson(r.t ?? "") ?? {};
    // Every message ends with our case study, word for word (Reyansh's line, 12 Nov; li_bot.tips_case overrides it).
    // (14 Nov) The note already gave our results, so the tips end on the call ask with the guarantee instead (Reyansh). {company} is filled in.
    const caseLine = String((bs?.value as any)?.tips_cta || TIPS_CTA).replaceAll("{company}", l.company && !/^unknown$/i.test(l.company) ? l.company : "you");
    const body = String(j.message ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\n+(happy to|let me know|if useful|would love)[^\n]*$/i, "").replace(/\n+(?=\d\.\s)/g, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
    const text = body ? body + "\n\n" + caseLine : "";
    if (!text) continue;
    const fields = { ...(l.fields ?? {}), tips: { at: now(), text: text.slice(0, 2000), picked: Array.isArray(j.picked) ? j.picked.slice(0, 3) : [], why: String(j.why ?? "").slice(0, 300), company: co } };
    await db.from("crm_leads").update({ fields }).eq("id", l.id);
    await db.from("crm_lead_events").insert({ lead_id: l.id, kind: "note", text: "3 tips written for them (" + (fields.tips.picked.join(", ") || "picked for them") + "). Read, edit and send from Leads > All leads.", by_email: "automation" });
    made++;
  }
  return { made };
}

// ═════════ X DMs (12 Nov): the same extension sends approved X DMs from Reyansh's signed-in X tab ═════════
// Send today's "Send with bot" puts a row in crm_x_tasks (ready). x_plan hands out a few at a time (40 a day at most, 9:00 to
// 23:30 IST), looking up missing X user ids through twitterapi.io. x_claim checks the person is still waiting for that message
// (no reply, not sent by hand meanwhile). x_done writes the DM Pipeline row exactly like Mark sent / Can't DM do in the CRM.
// Settings: crm_lead_settings x_bot { paused, cap }. Status for the CRM: x_bot_status.
const IST_MS = 330 * 60e3;
// (17 Nov, Reyansh: don't get banned) People do less on weekends: every daily cap is 60% on Saturday and Sunday (IST).
const weekendFactor = () => (ptParts().weekend ? 0.6 : 1);
const inHoursPT = (from: number, to: number) => { const x = ptHour(); return from <= to ? x >= from && x < to : x >= from || x < to; };
const sheetSerial = (d: Date, withTime: boolean) => {       // the CRM keeps sheet dates as day serials in IST, like Google Sheets
  const t = new Date(d.getTime() + IST_MS);
  const ms = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), withTime ? t.getUTCHours() : 0, withTime ? t.getUTCMinutes() : 0);
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 864e5 * 1e6) / 1e6;
};
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
async function xSettings() {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle();
  const v: any = data?.value ?? {};
  // (14 Nov) X said "this request looks like it might be automated": after that the bot holds off for 24 hours by itself
  // (cooldown_until), and it sends at most one DM every gap_min minutes (default 12, plus a random few) so it never bursts.
  const cool = Date.parse(v.cooldown_until ?? "") > Date.now();
  return { paused: !!v.paused || cool, cooling: cool, cooldown_until: v.cooldown_until ?? null, cap: Math.max(1, Math.floor(Math.min(80, +(v.cap ?? 40) || 40) * weekendFactor())), gap: Math.max(5, +(v.gap_min ?? 12) || 12), from: +(v.from ?? 9), to: +(v.to ?? 23.5),
    fu: X_FU_MORE.map((d, i) => String((Array.isArray(v.fu) ? v.fu[i] : "") || d)) };
}
// X follow-ups 3 to 7 (13 Nov; 1 and 2 come from each DM Templates version). One a day after follow-up 2, until they reply.
// Follow-up 3 is the VSL. Edited on X > Pipeline > Scripts (saved in x_bot.fu). {first} and {company} are filled in.
const VSL = "https://youtu.be/gTgn6jZaj7w";
const X_FU_MORE = [
  "Hey {first}, sharing a short VSL we made: " + VSL + "\n\nWe got one of the YC companies we work with 100K views on X and 30 enterprise calls booked in a week. If this sounds interesting, would love your thoughts, and to work together.",
  "Curious how {company} is getting new customers right now. Mostly referrals, or outbound too?",
  "Happy to send over 3 quick ideas for {company}'s inbound here in text if a call is too much this week. Want them?",
  "No worries if the timing's off, {first}. Would next week work better for a quick chat? https://cal.com/sove7gn-gtm/30min",
  "Last nudge from me, {first}. If inbound becomes a priority, here's the link: https://cal.com/sove7gn-gtm/30min. Rooting for {company}.",
];
const X_FU_KINDS = ["fu3", "fu4", "fu5", "fu6", "fu7"];
// ───────── X sequence v2 (16 Nov, Reyansh): the same shape as LinkedIn v2, with no request first ─────────
// Day 0 the first DM goes straight in with value: one idea written for them + one question, and the other two offered.
// Day 3 the question alone. Day 5 ideas 2 and 3, no ask. Day 8 a client story. Day 12 a clean close, then stop.
// A reply stops it. Rows on it carry Template "X2" (or "X2L" when they already got the 3 ideas on LinkedIn) in the DM Pipeline.
// Texts: x_bot.v2 { first, first_li, fu[4] } override these; {first} {company} {company_s} {is_company} {idea1..3} fill in.
const XV2_DAYS = [3, 5, 8, 12], XV2_KINDS = ["fu1", "fu2", "fu3", "fu4"];
const XV2_DEFAULT = {
  first: "Hey {first}, was researching {company} and had one inbound idea you could use this week:\n\n{idea1}\n\nI've got 2 more for you. Quick q so they actually fit: {is_company} getting customers mostly from referrals right now, or outbound too?",
  first_li: "Hey {first}, we're connected on LinkedIn too, I sent you 3 ideas for {company_s} inbound there. Quick q: {is_company} getting customers mostly from referrals right now, or outbound too?",
  fu: [
    "Curious, is most of {company_s} pipeline coming from referrals right now?",
    "Said I'd send the other two, so here they are regardless.\n\n{idea2}\n\n{idea3}\n\nNo ask, just thought they'd be useful for {company}.",
    "Had a founder in almost exactly your spot a few months back. All referrals, nothing repeatable. We put their founder content and warm signal DMs on autopilot: 100K views on X and 30 enterprise calls in a week.\n\nHappy to walk you through exactly how it was set up, whether or not you ever work with us.",
    "Doesn't look like the timing's right, so I'll stop here rather than clog your inbox. If inbound ever becomes the priority, just say the word and I'll pick it back up.",
  ],
  fu2_li: "Did any of the 3 ideas I sent on LinkedIn land for {company}? Happy to go deeper on whichever fits best.",
};
const splitIdeas = (raw: string) => String(raw ?? "").replace(/\r/g, "").split(/\n+/).map((p) => p.trim()).filter((p) => /^\d[.)]\s/.test(p))
  .map((p) => p.replace(/^\d[.)]\s*/, "").replace(/\s*\([^()]{2,60}\)\s*$/, "").replace(/\s*[—–]\s*/g, ", ").trim()).slice(0, 3);
// Their 3 ideas: from their lead (LinkedIn tips), else crm_x_people, else written now from what the DM Pipeline row says, and saved.
async function xIdeasFor(handle: string, c: Record<string, string>): Promise<string[]> {
  const h = String(handle ?? "").replace(/^@/, "").toLowerCase(); if (!h) return [];
  const ld = await leadByHandle(h);
  const fromLead = ld ? ideasOf(ld as Lead) : []; if (fromLead.length >= 3) return fromLead;
  const { data: xp } = await db.from("crm_x_people").select("handle,tips").eq("handle", h).maybeSingle();
  const fromX = splitIdeas(String((xp as any)?.tips ?? "")); if (fromX.length >= 3) return fromX;
  const co = c["Company"] && !/^unknown$/i.test(c["Company"]) ? c["Company"] : "";
  const facts = ["Founder: " + (c["Name"] ?? ""), c["Role"] ? "Role: " + c["Role"] : "", co ? "Company: " + co : "", c["Signal (why now)"] ? "Why now: " + clip(String(c["Signal (why now)"]), 300) : "",
    c["Notes"] ? "Notes: " + clip(String(c["Notes"]), 300) : "", c["Funding stage"] ? "Funding: " + c["Funding stage"] : ""].filter(Boolean).join("\n");
  const r = await llmMany([{ id: "i", prompt: "Write 3 short, specific ideas for how this B2B startup could get more inbound from X and LinkedIn. About them:\n" + facts +
    "\n\nEach idea is 1 or 2 plain sentences about THEIR buyers and THEIR product (name the kind of accounts to tag, the post to write, the people to follow up with). No pitch, no links, no dashes as punctuation, no emojis. Answer with exactly 3 lines, numbered 1. 2. 3." }]).catch(() => ({} as Record<string, string>));
  const ideas = splitIdeas(String(r.i ?? "")); if (ideas.length < 3) return ideas;
  const tips = ideas.map((x, i) => (i + 1) + ". " + x).join("\n");
  if (xp) await db.from("crm_x_people").update({ tips }).eq("handle", h);
  else await db.from("crm_x_people").insert({ handle: h, name: c["Name"] ?? "", bio: "", fit: "", why: "", role: c["Role"] ?? "", company: co, company_what: "", company_stage: "", found_by: "x-dm", added: false, tips }).then(() => {}, () => {});
  return ideas;
}
function xv2Fill(text: string, c: Record<string, string>, ideas: string[]): string {
  const co = c["Company"] && !/^unknown$/i.test(c["Company"]) ? c["Company"] : "";
  return String(text ?? "").replace(/\{idea1\}/g, ideas[0] ?? "").replace(/\{idea2\}/g, ideas[1] ?? "").replace(/\{idea3\}/g, ideas[2] ?? "")
    .replace(/\{is_company\}/g, co ? "is " + co : "are you").replace(/\{company_s\}/g, co ? co + (/s$/i.test(co) ? "'" : "'s") : "your")
    .replace(/\{company\}/g, co || "your company").replace(/\{first\}/g, String(c["Name"] ?? "").trim().split(/\s+/)[0] || "there").replace(/\n{3,}/g, "\n\n").trim();
}
async function xv2Texts() { const { data } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle(); const v: any = (data?.value as any)?.v2 ?? {};
  return { ...XV2_DEFAULT, ...v, fu: XV2_DEFAULT.fu.map((d, i) => String((v.fu ?? [])[i] || d)) }; }
async function xStatus(patch: Record<string, unknown>) {
  const { data } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot_status").maybeSingle();
  await db.from("crm_lead_settings").upsert({ key: "x_bot_status", value: { ...((data?.value as any) ?? {}), ...patch } });
}
async function pipeRow(row: number) {
  const { data: rows } = await db.from("crm_sheet").select("row,cells").eq("tab", "DM Pipeline").order("row").limit(4000);
  const all = rows ?? []; const h = all.find((r: any) => (r.cells ?? []).filter(Boolean).length > 5);
  const r = all.find((x: any) => x.row === row);
  if (!h || !r) return null;
  const c: Record<string, string> = {}; (h.cells as string[]).forEach((k, i) => { if (k) c[k] = String(r.cells?.[i] ?? ""); });
  return c;
}

// (12 Nov) X follow-ups queue themselves, no approval: Reyansh approves the first DM only. 24 hours after the first DM with no
// reply, follow-up 1; 24 hours after that, follow-up 2 (the two follow-ups in each DM script). Texts come from the DM Templates
// tab and are filled in like the CRM does ([first name], [company]; the [hook] is only for openers).
const MONX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function sheetTime(v: unknown): number | null {      // "10 Nov 2026, 13:32" or "12 Nov 2026" (IST) or a day serial
  const s = String(v ?? "").trim(); if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Date.UTC(1899, 11, 30) + +s * 864e5 - IST_MS;
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (!m || MONX[m[2].toLowerCase()] == null) return null;
  return Date.UTC(+m[3], MONX[m[2].toLowerCase()], +m[1], +(m[4] ?? 0), +(m[5] ?? 0)) - IST_MS;
}
async function xAutoFollowups(): Promise<number> {
  const { data: rows } = await db.from("crm_sheet").select("tab,row,cells").in("tab", ["DM Pipeline", "DM Templates"]).order("row").limit(5000);
  const P = (rows ?? []).filter((r: any) => r.tab === "DM Pipeline"), T = (rows ?? []).filter((r: any) => r.tab === "DM Templates");
  const ph = P.find((r: any) => (r.cells ?? []).filter(Boolean).length > 5), th = T.find((r: any) => (r.cells ?? [])[0] === "ID");
  if (!ph || !th) return 0;
  const obj = (h: any, r: any) => { const o: Record<string, string> = {}; (h.cells as string[]).forEach((k, i) => { if (k) o[k] = String(r.cells?.[i] ?? ""); }); return o; };
  const tpl = new Map(T.filter((r: any) => r.row > th.row).map((r: any) => obj(th, r)).filter((t) => t.ID).map((t) => [t.ID, t]));
  const pick = (t: Record<string, string>, prefix: string) => { const k = Object.keys(t).find((x) => x.startsWith(prefix)); return k ? t[k] : ""; };
  const { data: had } = await db.from("crm_x_tasks").select("row,kind,status,sent_at").in("kind", ["fu1", "fu2", ...X_FU_KINDS]).limit(10000);
  const done = new Set((had ?? []).map((t: any) => t.row + ":" + t.kind));
  const sentAt = new Map((had ?? []).filter((t: any) => t.status === "sent").map((t: any) => [t.row + ":" + t.kind, Date.parse(t.sent_at) || 0]));
  const more = (await xSettings()).fu; let v2t: any = null;
  const now = Date.now(), add: any[] = [];
  for (const r of P.filter((x: any) => x.row > ph.row)) {
    const c = obj(ph, r); const name = c["Name"]; const handle = String(c["X handle"] ?? "").replace(/^@/, "");
    if (!name || !handle || c["Replied on"] || /^by hand/i.test(c["DM result"] || "") || /^(not specified|unknown)$/i.test(name.trim())) continue;
    if (Object.values(c).some((v) => v === "Followed us")) continue;   // (16 Nov) people who only followed us get no follow-ups
    const st = c["Status"] || "", sent = sheetTime(c["Sent on"]), f1 = sheetTime(c["FU1 sent"]);
    if (/^X2/.test(c["Template"] || "")) {
      if (!sent || !/^(sent|fu1 sent|fu2 sent)$/i.test(st)) continue;
      const i = XV2_KINDS.findIndex((k) => !done.has(r.row + ":" + k)); if (i < 0) continue;
      const lastAt = i === 0 ? sent : (sentAt.get(r.row + ":" + XV2_KINDS[i - 1]) ?? 0);
      if (!lastAt || now < sent + XV2_DAYS[i] * 864e5 - 2 * 3600e3 || now - lastAt < 20 * 3600e3) continue;
      const T2 = v2t ?? (v2t = await xv2Texts());
      const viaLi = c["Template"] === "X2L";
      const ideas = i === 1 && !viaLi ? await xIdeasFor(handle, c).catch(() => []) : [];
      const raw = i === 1 && (viaLi || ideas.length < 3) ? T2.fu2_li : T2.fu[i];
      const text = xv2Fill(raw, c, ideas); if (!text) continue;
      add.push({ row: r.row, name, company: c["Company"] ?? "", handle, user_id: c["X user ID"] || null, kind: XV2_KINDS[i], text, status: "ready", decided_by: "auto: v2 follow-up" });
      if (add.length >= 30) break;
      continue;
    }
    // (16 Nov, Reyansh) The old X sequence is stopped: people it reached stay where they are and get no more follow-ups.
    continue;
    let kind = "";
    if (/^sent$/i.test(st) && !c["FU1 sent"] && sent && now - sent >= 24 * 3600e3) kind = "fu1";
    else if (/^fu1 sent$/i.test(st) && !c["FU2 sent"] && f1 && now - f1 >= 24 * 3600e3) kind = "fu2";   // FU1 is a day, so this is the next day or later
    else if (/^fu2 sent$/i.test(st)) {
      // Follow-ups 3..7 live only in crm_x_tasks (the sheet keeps Status "FU2 sent"): the next one not made yet, a day after the last.
      const i = X_FU_KINDS.findIndex((k) => !done.has(r.row + ":" + k));
      const last = i === 0 ? sheetTime(c["FU2 sent"]) : i > 0 ? sentAt.get(r.row + ":" + X_FU_KINDS[i - 1]) ?? 0 : 0;
      if (i >= 0 && last && now - last >= 24 * 3600e3) kind = X_FU_KINDS[i];
    }
    if (!kind || done.has(r.row + ":" + kind)) continue;
    const first = String(name).trim().split(/\s+/)[0];
    const company = c["Company"] && !/^unknown$/i.test(c["Company"]) ? c["Company"] : "your company";
    const n = X_FU_KINDS.indexOf(kind);
    // (16 Nov) a DM sent by hand with no follow-up script ("Inbound" and the like) follows the warm or cold script
    const t = tpl.get(c["Template"]) ?? tpl.get(/warm/i.test(c["Warm/Cold"] || "") ? "W1" : "A1");
    // (14 Nov) Openers that offered 3 ideas: follow-up 1 sends them (written for this person), follow-up 2 the booking link.
    const offered = /\b(3|three)\s+(quick\s+|small\s+|inbound\s+)*(tips|ideas|tricks)\b/i.test(String(c["Opener (30-40 words)"] ?? ""));
    let raw = "";
    if (offered && (kind === "fu1" || kind === "fu2")) {
      if (kind === "fu1") {
        const { data: ld } = await db.from("crm_leads").select("fields").or("x_handle.ilike.@" + handle + ",x_handle.ilike." + handle).limit(1);
        let body = String((ld?.[0] as any)?.fields?.tips?.text ?? "").replace(/^Hey [^,\n]*,\s*here they are:\s*/i, "").trim();
        if (!body) {   // (16 Nov) X-only leads (e.g. followers of our client's founders): their ideas were written ahead into crm_x_people
          const { data: xp } = await db.from("crm_x_people").select("tips").eq("handle", handle.toLowerCase()).maybeSingle();
          body = String((xp as any)?.tips ?? "").trim();
        }
        raw = body ? "Hey {first}, sending them over anyway, 3 ideas for {company}:\n\n" + body : "";
      } else raw = "Hey {first}, if it's easier, here's my calendar to talk it through: https://cal.com/sove7gn-gtm/30min";
      if (!raw) continue;
    } else {
      if (!t && n < 0) continue;
      raw = n >= 0 ? more[n] : pick(t!, kind === "fu1" ? "Follow-up 1" : "Follow-up 2");
      if (n === 2 && offered) raw = "Just bumping this up in case it got buried, {first}.";
    }
    const text = raw.replace(/\[first name\]|\{first\}/gi, first).replace(/\[company\]|\{company\}/gi, company).replace(/[ \t]*\[hook\][ \t]*/gi, " ").replace(/ {2,}/g, " ").trim();
    if (!text) continue;
    add.push({ row: r.row, name, company: c["Company"] ?? "", handle, user_id: c["X user ID"] || null, kind, text, status: "ready", decided_by: "auto: follow-up" });
    if (add.length >= 30) break;
  }
  if (add.length) await db.from("crm_x_tasks").insert(add);
  return add.length;
}

async function x_plan(b: any) {
  const set = await xSettings(), now = Date.now();
  const autoFu = await xAutoFollowups().catch(() => 0);
  await xStatus({ seen: new Date().toISOString(), me: b.me ?? null, version: b.version ?? "" });
  await db.from("crm_x_tasks").update({ status: "ready" }).eq("status", "sending").lt("claimed_at", new Date(now - 3600e3).toISOString());
  const dayStart = ptDayStart();
  // (17 Nov) Replies to posts have their own cap (x_bot.reply_cap), so only DMs and follow-ups count here.
  const { data: sentRows } = await db.from("crm_x_tasks").select("kind").eq("status", "sent").gte("sent_at", dayStart).not("kind", "in", "(reply,close)").limit(500);
  const sentToday = (sentRows ?? []).length, dmToday = (sentRows ?? []).filter((r: any) => r.kind === "dm").length, fuToday = sentToday - dmToday;
  const left = Math.max(0, set.cap - (sentToday ?? 0));
  const inHours = inHoursPT(set.from, set.to);
  if (set.paused || !inHours || !left || !b.me?.signed_in) return { tasks: [], paused: set.paused, in_hours: inHours, left, sent_today: sentToday ?? 0 };
  const { data: lastSent } = await db.from("crm_x_tasks").select("sent_at").eq("status", "sent").not("kind", "in", "(reply,close)").order("sent_at", { ascending: false }).limit(1);
  const since = Date.now() - (Date.parse(lastSent?.[0]?.sent_at ?? "") || 0), gapMs = (set.gap + Math.random() * 6) * 60e3;
  if (since < gapMs) return { tasks: [], paused: false, in_hours: true, left, sent_today: sentToday ?? 0, wait_min: Math.ceil((gapMs - since) / 60e3) };
  // 15 Nov: warm people (replied, commented, followed; queued by x-grow) go before cold DMs and follow-ups.
  const { data: pool } = await db.from("crm_x_tasks").select("*").eq("status", "ready").not("kind", "in", "(reply,close)").order("created_at").limit(200);
  // (16 Nov) Order: warm people, then follow-ups (they're due on a day), then cold first DMs.
  // (17 Nov) New founders get their share: until x_bot.daily_new (10) first DMs are out today, first DMs and follow-ups take turns.
  const { data: xb } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle();
  const dailyNew = +((xb?.value as any)?.daily_new ?? 10) || 10, dmFirst = dmToday < dailyNew && fuToday >= dmToday;
  const rank = (t: any) => (String(t.decided_by ?? "").startsWith("auto: warm") ? 0 : (t.kind === "dm") === dmFirst ? 1 : 2);
  const ready = [...(pool ?? [])].sort((a: any, b: any) => rank(a) - rank(b)).slice(0, 1);
  const tasks: any[] = [];
  for (const t of ready ?? []) {
    let uid = String(t.user_id ?? "");
    if (!uid && t.handle && TWAPI) {
      try { const r = await fetch("https://api.twitterapi.io/twitter/user/info?userName=" + encodeURIComponent(String(t.handle).replace(/^@/, "")), { headers: { "X-API-Key": TWAPI } });
        if (r.ok) uid = String((await r.json())?.data?.id ?? ""); } catch (_) { /* tried below */ }
      if (uid) await db.from("crm_x_tasks").update({ user_id: uid }).eq("id", t.id);
    }
    if (!uid && !t.handle) { await db.from("crm_x_tasks").update({ status: "failed", error: "No X handle" }).eq("id", t.id); continue; }
    let text = String(t.text ?? "");
    if (t.kind !== "reply" && t.kind !== "close" && IDEAS_RE.test(text)) {
      const ld = await leadByHandle(t.handle);
      if (ld && (ld.fields?.tips?.sent_at || ld.fields?.li?.tips_dm)) {
        const first = firstName(t.name), co = ld.company && !/^unknown$/i.test(ld.company) ? ld.company : "your company";
        text = t.kind === "dm" ? "Hey " + first + ", we're connected on LinkedIn too, I sent you 3 ideas for " + co + "'s inbound there. Would love to jump on a quick call and show you how we'd set them up: " + CAL
          : /sending them over anyway/i.test(text) ? "Hey " + first + ", if it's easier to talk through the ideas I sent on LinkedIn, here's my calendar: " + CAL
          : "Just bumping this up in case it got buried, " + first + ".";
        await db.from("crm_x_tasks").update({ text }).eq("id", t.id);
      }
    }
    if (t.kind === "dm" && !/v2/.test(String(t.decided_by ?? ""))) {
      try {
        const c = await pipeRow(t.row);
        if (c && /^(to send|)$/i.test(c["Status"] || "") && !/^X2/.test(c["Template"] || "")) {
          const ld = await leadByHandle(t.handle); const gotLi = !!(ld && (ld.fields?.tips?.sent_at || ld.fields?.li?.tips_dm));
          const T2 = await xv2Texts(); const ideas = gotLi ? [] : await xIdeasFor(t.handle, c).catch(() => []);
          if (gotLi || ideas.length) {
            text = xv2Fill(gotLi ? T2.first_li : T2.first, c, ideas);
            await db.from("crm_x_tasks").update({ text, decided_by: String(t.decided_by ?? "") + " v2" }).eq("id", t.id);
            await db.rpc("crm_call", { body: { action: "pipeline", row: t.row, name: c["Name"], company: c["Company"], cells: { Template: gotLi ? "X2L" : "X2" } } });
          }
        }
      } catch (_) { /* the DM goes out as it was */ }
    }
    tasks.push({ id: t.id, name: t.name, handle: t.handle, user_id: uid, kind: t.kind, text });
  }
  if (tasks.length) await db.from("crm_x_tasks").update({ status: "sending", claimed_at: new Date().toISOString() }).in("id", tasks.map((t) => t.id));
  return { tasks, paused: false, in_hours: true, left, sent_today: sentToday ?? 0, auto_followups: autoFu };
}
// Right before sending: is this message still the right one? (no reply, not sent by hand, row still theirs)
// ───────── X replies by the extension (16 Nov) ─────────
// Reyansh approves reply drafts on X > Outbound > Replies; the extension posts them from his own X tab: opens the post, likes it,
// opens X's reply box with the draft filled in and presses Post. At most x_bot.reply_cap a day (default 30), one every
// x_bot.reply_gap_min minutes or more (default 15, plus a random 0 to 10), only in his sending hours, and never while X's
// "looks automated" cooldown is on (the same cooldown the DMs use). Posts older than 20 hours are dropped: a late reply looks odd.
async function xr_plan(b: any) {
  const xs = await xSettings(), now = Date.now();
  const { data: xb } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle();
  const v: any = xb?.value ?? {};
  const cap = Math.max(0, Math.floor(Math.min(60, +(v.reply_cap ?? 30)) * weekendFactor())), gap = Math.max(10, +(v.reply_gap_min ?? 15) || 15);
  await db.from("crm_x_reply").update({ status: "approved", claimed_at: null }).eq("status", "sending").lt("claimed_at", new Date(now - 30 * 60e3).toISOString());
  await db.from("crm_x_reply").update({ status: "failed", error: "The post was more than 20 hours old by the time it came up" }).eq("status", "approved").lt("posted_at", new Date(now - 20 * 3600e3).toISOString());
  const dayStart = ptDayStart();
  const { count: postedToday } = await db.from("crm_x_reply").select("url", { count: "exact", head: true }).eq("status", "done").eq("done_by", "x bot").gte("done_at", dayStart);
  const { count: waiting } = await db.from("crm_x_reply").select("url", { count: "exact", head: true }).eq("status", "approved");
  const base = { posted_today: postedToday ?? 0, cap, waiting: waiting ?? 0, paused: xs.paused || !!v.replies_paused };
  if (!b.me?.signed_in || xs.paused || v.replies_paused || !cap || (postedToday ?? 0) >= cap) return { ...base, tasks: [] };
  if (!inHoursPT(xs.from, xs.to)) return { ...base, tasks: [], in_hours: false };
  const { data: last } = await db.from("crm_x_reply").select("done_at").eq("status", "done").eq("done_by", "x bot").order("done_at", { ascending: false }).limit(1);
  const since = now - (Date.parse(last?.[0]?.done_at ?? "") || 0);
  const wait = (gap + Math.random() * 10) * 60e3;
  if (since < wait) return { ...base, tasks: [], wait_min: Math.ceil((wait - since) / 60e3) };
  // newest post first (a reply in the first hour is worth most), leads before creators when equally fresh
  const { data: ready } = await db.from("crm_x_reply").select("url,author,name,draft,kind,posted_at").eq("status", "approved").neq("draft", "")
    .gte("posted_at", new Date(now - 20 * 3600e3).toISOString()).order("posted_at", { ascending: false }).limit(20);
  // (16 Nov) never more than one reply per person a day: their other approved posts wait (and drop after 20 hours)
  const { data: today } = await db.from("crm_x_reply").select("author").eq("status", "done").gte("done_at", dayStart);   // by the bot or by hand: one reply per person a day
  const doneBy = new Set((today ?? []).map((r: any) => String(r.author).toLowerCase()));
  const t = (ready ?? []).filter((r: any) => !doneBy.has(String(r.author).toLowerCase())).sort((a: any, c: any) => (c.kind === "lead" ? 1 : 0) - (a.kind === "lead" ? 1 : 0))[0];
  if (!t) return { ...base, tasks: [] };
  const { data: got } = await db.from("crm_x_reply").update({ status: "sending", claimed_at: new Date().toISOString() }).eq("url", t.url).eq("status", "approved").select("url");
  if (!got?.length) return { ...base, tasks: [] };
  const id = (String(t.url).match(/status\/(\d+)/) || [])[1] || "";
  return { ...base, tasks: [{ url: t.url, id, text: t.draft, name: t.name || t.author, author: t.author }] };
}
async function xr_done(b: any) {
  const url = String(b.url ?? ""); if (!url) return { error: "No url" };
  const now = new Date().toISOString();
  if (b.ok) {
    await db.from("crm_x_reply").update({ status: "done", done_at: now, done_by: "x bot", error: b.liked === false ? "Posted (the like didn't go through)" : "" }).eq("url", url);   // (16 Nov) "done" + a non-email done_by: Leads > Notifications shows it as posted by the bot
    await xStatus({ last_reply_at: now });
    return { ok: true };
  }
  const err = clip(String(b.error ?? "Failed"), 300);
  if (b.limit || /automated|spam|rate limit|try again later|over capacity/i.test(err)) {   // X pushed back: same 24-hour cooldown as the DMs
    const { data: xb } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle();
    const cur: any = xb?.value ?? {}, until = new Date(Date.now() + 24 * 3600e3).toISOString();
    await db.from("crm_lead_settings").upsert({ key: "x_bot", value: { ...cur, cooldown_until: until, cooldown_why: "Replies: " + err } });
    await db.from("crm_x_reply").update({ status: "approved", claimed_at: null, error: "X asked us to slow down; trying again after a 24 hour pause" }).eq("url", url);
    await xStatus({ last_error: "X pushed back on a reply, so the bot paused DMs and replies for 24 hours: " + err, last_error_at: now });
    return { ok: true, cooldown: until };
  }
  await db.from("crm_x_reply").update({ status: "failed", done_at: now, error: err }).eq("url", url);
  return { ok: true };
}

async function x_claim(b: any) {
  const { data: t } = await db.from("crm_x_tasks").select("*").eq("id", b.id).maybeSingle();
  if (!t || !["sending", "ready"].includes(t.status)) return { ok: false };
  const c = await pipeRow(t.row);
  const skip = async (why: string) => { await db.from("crm_x_tasks").update({ status: "skipped", error: why }).eq("id", t.id); return { ok: false, why }; };
  const xs = await xSettings();
  if (xs.paused) { await db.from("crm_x_tasks").update({ status: "ready", claimed_at: null }).eq("id", t.id); return { ok: false, why: xs.cooling ? "X asked us to slow down, waiting until " + String(xs.cooldown_until).slice(11, 16) + " UTC" : "X sending is paused" }; }
  if (!c || c["Name"] !== t.name) return await skip("Their row in the DM Pipeline moved or changed");
  if (/^by hand/i.test(c["DM result"] || "")) return await skip("You're handling them by hand");
  if (t.kind === "reply" || t.kind === "close") return { ok: true };
  if (t.kind !== "dm") {
    const { data: xs2 } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot_status").maybeSingle();
    const ia = Date.parse((xs2?.value as any)?.inbox_at ?? "") || 0;
    if (Date.now() - ia > 20 * 60e3) { await db.from("crm_x_tasks").update({ status: "ready", claimed_at: null }).eq("id", t.id); return { ok: false, why: "waiting for a fresh inbox check first" }; }
  }
  // (12 Nov) No "Hey Not," messages, no cold DM to someone we're already talking to, and nobody twice.
  if (/^(not specified|unknown|n\/?a|none|null|-)?$/i.test(String(t.name ?? "").trim()) || !/^[\p{L}]{2,}/u.test(String(t.name ?? "").trim())) return await skip("No real name on their row");
  const h = String(t.handle ?? "").replace(/^@/, "").toLowerCase();
  const { data: talk } = await db.from("crm_leads").select("name,stage,source,x_handle").eq("archived", false).in("stage", ["In talks", "Call booked", "Proposal sent", "Won"]).limit(2000);
  const hit = (talk ?? []).find((l: any) => String(l.name ?? "").toLowerCase().trim() === String(t.name).toLowerCase().trim() || (h && String(l.x_handle ?? "").replace(/^@/, "").toLowerCase() === h));
  if (hit) return await skip("Already talking to them (" + hit.stage + " on " + hit.source + ")");
  const { count: dup } = await db.from("crm_x_tasks").select("id", { count: "exact", head: true }).neq("id", t.id).eq("kind", t.kind).eq("status", "sent")
    .or("name.eq." + JSON.stringify(t.name) + (h ? ",handle.ilike." + h : "")).gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString());
  if ((dup ?? 0) > 0) return await skip("Already sent this message to them");
  if (c["Replied on"]) return await skip("They replied");
  const st = c["Status"] || "To send";
  const want = t.kind === "dm" ? /^(to send|)$/i : t.kind === "fu1" ? /^sent$/i : t.kind === "fu2" ? /^fu1 sent$/i : /^fu2 sent$/i;
  if (!want.test(st)) return await skip("Already " + st + " (sent by hand?)");
  return { ok: true };
}
async function x_done(b: any) {
  const { data: t } = await db.from("crm_x_tasks").select("*").eq("id", b.id).maybeSingle();
  if (!t) return { error: "No such task" };
  // (16 Nov) The extension finds their account on their profile page (the paid lookup is out of credits).
  if (/^\d+$/.test(String(b.user_id ?? "")) && !/^\d+$/.test(String(t.user_id ?? ""))) await db.from("crm_x_tasks").update({ user_id: String(b.user_id) }).eq(t.handle ? "handle" : "id", t.handle || t.id).or("user_id.is.null,user_id.like.h:%");
  if (b.no_account) { await db.from("crm_x_tasks").update({ status: "failed", error: "Couldn't find their X account (@" + t.handle + ")" }).eq("id", t.id); return { ok: true }; }
  const c = await pipeRow(t.row); const now = new Date();
  const write = async (cells: Record<string, unknown>) => {
    if (!c) return "no row";
    const { data, error } = await db.rpc("crm_call", { body: { action: "pipeline", row: t.row, name: c["Name"], company: c["Company"], cells } });
    return error ? error.message : String(data ?? "");
  };
  if (b.cant) {           // their DMs are closed or need a passcode: same as the Can't DM button
    const w = await write({ Status: "Not now", "DM result": "Not sent on X (" + new Date(now.getTime() + IST_MS).getUTCDate() + " " + MON3[new Date(now.getTime() + IST_MS).getUTCMonth()] + "): DMs closed or need a passcode" });
    await db.from("crm_x_tasks").update({ status: "skipped", error: "Their DMs are closed or need a passcode" + (/^ok/.test(w) ? "" : " (row not updated: " + w + ")") }).eq("id", t.id);
    return { ok: true };
  }
  if (!b.ok && /automated|spam|malicious|rate limit|over capacity|\b(226|88|429)\b/i.test(String(b.error ?? "")) || b.limit) {
    const { data: xb } = await db.from("crm_lead_settings").select("value").eq("key", "x_bot").maybeSingle();
    const until = new Date(Date.now() + 24 * 3600e3).toISOString(), cur: any = xb?.value ?? {};
    await db.from("crm_lead_settings").upsert({ key: "x_bot", value: { ...cur, cooldown_until: until, cap: Math.min(+(cur.cap ?? 40) || 40, 15), cooldown_why: clip(String(b.error ?? "X limit"), 200) }, updated_at: now.toISOString() });
    await db.from("crm_x_tasks").update({ status: "ready", claimed_at: null, error: "X asked us to slow down; trying again after a 24 hour pause" }).eq("id", t.id);
    await xStatus({ last_error: "X flagged the DMs as automated, so sending paused for 24 hours (then 15 a day max)", last_error_at: now.toISOString() });
    return { ok: true, cooldown: until };
  }
  if (!b.ok) {
    await db.from("crm_x_tasks").update({ status: "failed", error: clip(String(b.error ?? "Failed"), 300) }).eq("id", t.id);
    await xStatus({ last_error: clip(String(b.error ?? "Failed"), 300), last_error_at: now.toISOString() });
    return { ok: true };
  }
  if (b.ok && (t.kind === "reply" || t.kind === "close")) {
    await db.from("crm_x_tasks").update({ status: "sent", sent_at: now.toISOString() }).eq("id", t.id);
    const ld = await leadByHandle(t.handle);
    if (ld) { const tipsSent = IDEAS_RE.test(String(t.text ?? "")) && !ld.fields?.tips?.sent_at ? { tips: { ...(ld.fields?.tips ?? {}), sent_at: now.toISOString(), on: "X" } } : {};
      await db.from("crm_leads").update({ fields: { ...(ld.fields ?? {}), ...tipsSent, x: { ...(ld.fields?.x ?? {}), answered: now.toISOString() } }, last_touch: now.toISOString() }).eq("id", ld.id);
      await db.from("crm_lead_events").insert({ lead_id: ld.id, kind: "message", text: (t.kind === "close" ? "Sent the closing message on X:\n" : "Answered on X:\n") + t.text, by_email: "x bot" }); }
    return { ok: true };
  }
  const cells: Record<string, unknown> | null = t.kind === "dm" ? { Status: "Sent", "Sent on": sheetSerial(now, true) } : t.kind === "fu1" ? { Status: "FU1 sent", "FU1 sent": sheetSerial(now, false) }
    : t.kind === "fu2" ? { Status: "FU2 sent", "FU2 sent": sheetSerial(now, false) } : null;      // fu3..fu7: kept in crm_x_tasks only
  const w = cells ? await write(cells) : "ok";
  await db.from("crm_x_tasks").update({ status: "sent", sent_at: now.toISOString(), error: /^ok/.test(w) ? null : "Sent, but the row didn't update: " + w }).eq("id", t.id);
  if (/sending them over anyway|here they are/i.test(String(t.text ?? ""))) {
    const ld = await leadByHandle(t.handle);
    if (ld && !ld.fields?.tips?.sent_at) {
      await db.from("crm_leads").update({ fields: { ...(ld.fields ?? {}), tips: { ...(ld.fields?.tips ?? {}), sent_at: now.toISOString(), on: "X" } } }).eq("id", ld.id);
      await db.from("crm_li_tasks").update({ status: "skipped", error: "They got the 3 ideas on X" }).eq("lead_id", ld.id).in("kind", ["dm", "followup"]).in("status", ["review", "ready"]).filter("text", "imatch", "here they are|here are the 3 ideas|sending over 3 quick ideas");
    }
  }
  return { ok: true };
}
