// lead-drop (18 Nov): a private page of people who need what a prospect sells right now, sent in our first message instead of an idea.
// For each prospect: Exa reads their site (ICP, customers, competitors), searches LinkedIn posts, Hacker News, job boards and funding
// news for buying signals, a strict LLM judge keeps only real buyers (quote checked against the page text), then Exa finds the person
// and the company facts, and a last LLM pass writes the page (crm/leads/index.html reads it by token).
//   GET  ?k=TOKEN                -> the page's JSON (public; counts a view)
//   POST {action:"tick"}         -> cron: queue new prospects, then move one drop on by one stage
//   POST {action:"build", lead_id | handle, name, company, hint, domain} -> queue one now (x-cron-secret)
//   POST {action:"run", token}   -> run every stage of one drop now (testing)
// Stages: queued -> searched -> judged -> ready | thin | failed. thin = fewer than 3 good leads: the bot keeps the old opener.
// Runs on the Exa account connected in Composio and Composio's workbench LLM (no keys of our own needed).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const COMPOSIO = Deno.env.get("COMPOSIO_API_KEY") ?? "";
export const PAGE = "https://sove7gn.github.io/sove7gn-gtm/leads/?k=";
const MIN_LEADS = 3, MAX_LEADS = 8, DAYS = 30;
const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-cron-secret", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const parse = (s: unknown) => { if (s && typeof s === "object") return s as any; try { return JSON.parse(String(s ?? "").replace(/^```(json)?|```$/gm, "").trim()); } catch { return null; } };
const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const coKey = (s: string) => String(s ?? "").toLowerCase().replace(/\b(inc|llc|ltd|labs?|ai|hq|co|corp|technologies|the)\b/g, "").replace(/[^a-z0-9]/g, "");

// ───────── Composio: Exa search and the workbench LLM ─────────
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
type Spend = { cost: number; searched: number };
async function exa(args: Record<string, unknown>, sp: Spend): Promise<any> {
  for (let i = 0; i < 2; i++) {
    try {
      const out = await mcp("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{ tool_slug: "EXA_SEARCH", arguments: args }], sync_response_to_workbench: false, thought: "lead drop research" });
      const one = out?.data?.results?.[0]?.response;
      if (!one?.successful) throw new Error("Exa: " + String(one?.error ?? "no result").slice(0, 160));
      let d = one.data;
      const file = out?.data?.remote_file_info?.file_path;
      if (!d && file) {   // big results come back as a file in Composio's sandbox
        const o2 = await mcp("COMPOSIO_REMOTE_BASH_TOOL", { command: "jq -c '.results[0].response.data | {costDollars, output, results: [(.results // [])[] | {url, title, publishedDate, author, summary, text: ((.text // \"\")[0:1800])}]}' " + file });
        d = JSON.parse(String(o2?.data?.stdout ?? "").trim() || "{}");
      }
      sp.cost += d?.costDollars?.total ?? 0; sp.searched += d?.results?.length ?? 0;
      return d ?? {};
    } catch (e) { if (i) { console.log("exa failed", String((e as Error).message).slice(0, 160)); return { results: [] }; } }
  }
}
const outOf = (d: any) => parse(d?.output?.content ?? d?.output);
// btoa of big UTF-8 strings: chunked so the call stack doesn't overflow
function b64(s: string) { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); }
async function llm(items: { id: string; prompt: string }[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const parts: typeof items[] = []; for (let i = 0; i < items.length; i += 30) parts.push(items.slice(i, i + 30));
  await Promise.all(parts.map(async (part) => {   // small workbench calls, side by side
    const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
      "items = json.loads(base64.b64decode('" + b64(JSON.stringify(part)) + "').decode())",
      "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
      "with ThreadPoolExecutor(10) as ex: res = dict(ex.map(one, items))", "print('@@' + json.dumps(res))"].join("\n");
    const outp = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "lead drop" });
    Object.assign(out, JSON.parse(String(outp?.data?.stdout ?? "").split("@@").pop() || "{}"));
  }));
  return out;
}

// ───────── stage 1: ICP + signal searches ─────────
const ICP_SCHEMA = { type: "object", required: ["sells", "buyer"], properties: {
  domain: { type: "string", description: "the company's own website domain, like kita.ai" },
  sells: { type: "string", description: "what they sell, one plain sentence" },
  buyer: { type: "string", description: "who buys it: industry, company type, stage, size, region" },
  buyer_roles: { type: "array", items: { type: "string" }, description: "job titles that sign or champion the purchase" },
  triggers: { type: "array", items: { type: "string" }, description: "events that make a company need this now" },
  customers: { type: "array", items: { type: "string" }, description: "customers named on their own site (case studies, logo wall, testimonials) or in press about them; empty if none are named" },
  competitors: { type: "array", items: { type: "string" } },
  pain_posts: { type: "array", items: { type: "string" }, description: "5 sentences a buyer would write in a LinkedIn or forum post when they have the problem this product solves, in the buyer's words, not naming this product" },
  hiring_signals: { type: "array", items: { type: "string" }, description: "3 job titles a buyer company hires when it has this problem (the work this product does or supports)" },
  funding_query: { type: "string", description: "a news search for buyer companies that just raised money, like 'SMB lending fintech raises seed round'" },
} };
const JUDGE_SCHEMA = { type: "object", required: ["intent"], properties: {
  intent: { type: "string", enum: ["high", "medium", "none"] }, is_vendor: { type: "boolean" },
  company: { type: "string", description: "the company that would buy" } } };

async function stageSearch(d: any) {
  const sp: Spend = { cost: 0, searched: 0 };
  const hint = [d.hint, d.domain].filter(Boolean).join(" · ");
  const icpRes = await exa({ query: `${d.company} ${d.domain ?? ""} ${d.hint ?? ""} what they sell, customers, case studies`.replace(/\s+/g, " ").trim(), numResults: 8,
    outputSchema: ICP_SCHEMA, contents: { text: { maxCharacters: 1500 } },
    systemPrompt: `Describe the company ${d.company}${hint ? " (" + hint + ")" : ""} and its buyers, using its own site, case studies and press. Ignore other companies with the same name.` }, sp);
  const icp = outOf(icpRes);
  if (!icp?.sells) throw new Error("couldn't work out what " + d.company + " sells");
  const sq = (kind: string) => `Is the author's company a buyer for this product? Product: ${icp.sells}. Buyer: ${icp.buyer}. This is a ${kind}.`;
  const contents = (_kind: string) => ({ text: { maxCharacters: 1800 } });
  void sq; void JUDGE_SCHEMA;
  const jobs: { src: string; args: any }[] = [];
  for (const p of (icp.pain_posts ?? []).slice(0, 5))
    jobs.push({ src: "linkedin", args: { query: p, numResults: 10, includeDomains: ["linkedin.com/posts"], startPublishedDate: daysAgo(DAYS), contents: contents("LinkedIn post") } });
  for (const h of (icp.hiring_signals ?? []).slice(0, 2))
    jobs.push({ src: "linkedin", args: { query: `We're hiring a ${h} to help us scale`, numResults: 10, includeDomains: ["linkedin.com/posts"], startPublishedDate: daysAgo(DAYS), contents: contents("LinkedIn post") } });
  for (const p of (icp.pain_posts ?? []).slice(0, 2))
    jobs.push({ src: "hn", args: { query: p, numResults: 8, includeDomains: ["news.ycombinator.com"], startPublishedDate: daysAgo(60), contents: contents("Hacker News comment") } });
  for (const h of (icp.hiring_signals ?? []).slice(0, 3))
    jobs.push({ src: "jobs", args: { query: `job opening: ${h}`, numResults: 8, includeDomains: ["greenhouse.io", "lever.co", "ashbyhq.com", "workable.com", "ycombinator.com/companies"], startPublishedDate: daysAgo(DAYS), contents: contents("job post") } });
  if (icp.funding_query)
    jobs.push({ src: "news", args: { query: icp.funding_query, numResults: 10, category: "news", startPublishedDate: daysAgo(DAYS), contents: contents("funding news article") } });
  const res = await Promise.all(jobs.map(async (j) => ({ j, r: await exa(j.args, sp) })));
  const seen = new Set<string>(), raw: any[] = [];
  for (const { j, r } of res) for (const x of r.results ?? []) {
    const s = parse(x.summary) ?? {};
    if (seen.has(x.url) || String(x.text ?? "").length < 80) continue; seen.add(x.url);
    raw.push({ src: j.src, url: x.url, title: x.title, date: x.publishedDate, author: x.author, text: String(x.text ?? "").slice(0, 1800), co: s.company ?? "" });
  }
  return { status: "searched", stage: { icp, raw }, cost: sp.cost, searched: sp.searched };
}

// ───────── stage 2: the strict judge ─────────
function judgePrompt(icp: any, x: any, me: string) {
  return `You qualify sales leads for a startup. Be strict: most items are NOT leads.
PRODUCT (${me}): ${icp.sells}
BUYER PROFILE: ${icp.buyer}. Roles: ${(icp.buyer_roles ?? []).join(", ")}.
NEVER LEADS: ${me}, its competitors (${(icp.competitors ?? []).join(", ")}), its current customers (${(icp.customers ?? []).join(", ")}).

ITEM (${x.src === "linkedin" ? "LinkedIn post" : x.src === "hn" ? "Hacker News" : x.src === "jobs" ? "job post" : "news article"}, ${x.date ?? "no date"}): ${x.url}
TITLE: ${x.title ?? ""}
TEXT: ${x.text}

Rules:
- The lead is the company that would BUY the product. It must match the buyer profile (industry and type). Drop vendors, agencies, consultants, investors, media, recruiters, job seekers, competitors, and posts marketing the author's own product or services.
- high = the author's company has this exact problem now and is asking for, evaluating, or complaining about a solution, in this item.
- medium = the company clearly has the problem now (a job post for the exact work the product does at a company that fits the profile, or a post describing the pain) but isn't shopping yet.
- signal = only a trigger (they just raised money, launched, expanded) and they fit the buyer profile closely.
- Drop companies over ~2000 employees unless they explicitly ask for a solution.
- quote: ONE sentence copied word for word from TEXT that shows the need: the work they're hiring for, the problem, or the trigger. Never company boilerplate ("we are a leading...", "we provide...", benefits, EEO text). Never rewrite it.
- person: the author's full name if TEXT or TITLE names them, else "".
Return ONLY JSON: {"keep":true|false,"intent":"high|medium|signal","person":"","role":"","company":"","company_what":"what the buyer company does, 3-6 words, from TEXT","quote":"","why":"","reason":"10 words"}`;
}
async function stageJudge(d: any) {
  const { icp, raw } = d.stage;
  const prev: any[] = d.stage.prev ?? [];
  // up to 60 items per run (2 workbench calls side by side); a big search finishes over two runs
  const ans: Record<string, string> = { ...(d.stage.ans ?? {}) };
  const todo = raw.map((_: any, i: number) => i).filter((i: number) => ans[String(i)] == null).slice(0, 60);
  const got = await llm(todo.map((i: number) => ({ id: String(i), prompt: judgePrompt(icp, raw[i], d.company) })));
  // a failed LLM answer stays unanswered and is retried next run; after 3 runs with no progress the rest count as "no"
  let progress = 0;
  for (const i of todo) if (String(got[String(i)] ?? "").trim()) { ans[String(i)] = got[String(i)]; progress++; }
  const stuck = progress ? 0 : Number(d.stage.stuck ?? 0) + 1;
  if (stuck >= 3) for (const i of todo) ans[String(i)] = "";
  if (raw.some((_: any, i: number) => ans[String(i)] == null)) return { status: "searched", stage: { ...d.stage, ans, stuck } };
  const me = coKey(d.company), banned = new Set([me, ...(icp.competitors ?? []).map(coKey), ...(icp.customers ?? []).map(coKey)].filter(Boolean));
  const rank: Record<string, number> = { high: 0, medium: 1, signal: 2 };
  const byCo = new Map<string, any>(); const dropped: string[] = [];
  raw.forEach((x: any, i: number) => {
    const j = parse(ans[String(i)]);
    if (!j?.keep || !j.company || !rank.hasOwnProperty(j.intent)) return;
    const k = coKey(j.company);
    if (!k || banned.has(k)) return void dropped.push(j.company + ": prospect/competitor/customer");
    // the quote must really be on the page
    const q = norm(j.quote);
    if (q.length < 25 || !norm(x.text + " " + x.title).includes(q.slice(0, Math.min(q.length, 80)))) return void dropped.push(j.company + ": quote not found on page");
    if (x.date && Date.parse(x.date) < Date.now() - (x.src === "hn" || d.stage.topped ? 60 : DAYS + 5) * 864e5) return void dropped.push(j.company + ": too old");
    const o = byCo.get(k);
    if (!o || rank[j.intent] < rank[o.intent]) byCo.set(k, { ...j, src: x.src, url: x.url, title: x.title, date: x.date });
  });
  for (const p of prev) { const k = coKey(p.company); if (k && !byCo.has(k)) byCo.set(k, p); }
  const leads = [...byCo.values()].sort((a, b) => rank[a.intent] - rank[b.intent] || String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, MAX_LEADS);
  if (leads.length < 4 && !d.stage.topped) {
    const more = await widerSearch(d, icp, new Set([...raw.map((x: any) => x.url)]));
    if (more.raw.length) return { status: "searched", stage: { icp, raw: more.raw, prev: leads, topped: true, dropped }, cost: more.cost, searched: more.searched };
  }
  return { status: "judged", stage: { icp, leads, dropped: dropped.slice(0, 60), judged: raw.length + Number(d.stage.judged0 ?? 0), kept: byCo.size, topped: !!d.stage.topped } };
}
// The second round, only for thin drops: buyers' own words about the trigger, their roles posting about the work, 60 days back.
async function widerSearch(d: any, icp: any, seen: Set<string>) {
  const sp: Spend = { cost: 0, searched: 0 };
  const qs: { src: string; args: any }[] = [];
  for (const t of (icp.triggers ?? []).slice(0, 3))
    qs.push({ src: "linkedin", args: { query: `Our team is dealing with this right now: ${t}`, numResults: 10, includeDomains: ["linkedin.com/posts"], startPublishedDate: daysAgo(60), contents: { text: { maxCharacters: 1800 } } } });
  for (const r of (icp.buyer_roles ?? []).slice(0, 2))
    qs.push({ src: "linkedin", args: { query: `${r} sharing what they're building and the problem they're stuck on: ${icp.pain_posts?.[0] ?? icp.sells}`, numResults: 10, includeDomains: ["linkedin.com/posts"], startPublishedDate: daysAgo(60), contents: { text: { maxCharacters: 1800 } } } });
  for (const h of (icp.hiring_signals ?? []).slice(0, 2))
    qs.push({ src: "jobs", args: { query: `${h} job`, numResults: 10, includeDomains: ["greenhouse.io", "lever.co", "ashbyhq.com", "workable.com", "ycombinator.com/companies", "wellfound.com"], startPublishedDate: daysAgo(45), contents: { text: { maxCharacters: 1800 } } } });
  const res = await Promise.all(qs.map(async (j) => ({ j, r: await exa(j.args, sp) })));
  const raw: any[] = [];
  for (const { j, r } of res) for (const x of r.results ?? []) {
    if (seen.has(x.url) || String(x.text ?? "").length < 80) continue; seen.add(x.url);
    raw.push({ src: j.src, url: x.url, title: x.title, date: x.publishedDate, author: x.author, text: String(x.text ?? "").slice(0, 1800) });
  }
  return { raw, cost: sp.cost, searched: sp.searched };
}

// ───────── stage 3: person, company facts, the page text ─────────
const PERSON_SCHEMA = { type: "object", properties: { name: { type: "string" }, role: { type: "string" }, linkedin: { type: "string", description: "their linkedin.com/in/ URL" },
  background: { type: "string", description: "notable past employers (Meta, Google, Stripe...), YC batch or school, short; empty if none" } } };
// The post author's profile, only when the post URL's handle carries the person's name (company pages post too).
const liFromPost = (url: string, person: string) => { const m = String(url).match(/linkedin\.com\/posts\/([^_/?]+)_/); const first = norm(String(person ?? "").split(/\s+/)[0]);
  return m && first.length > 1 && norm(m[1]).includes(first) ? "https://www.linkedin.com/in/" + m[1] : ""; };
const money = (n: number) => n >= 1e9 ? "$" + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "") + "M" : "$" + Math.round(n / 1e3) + "K";
// Company facts from Exa's company records (structured: headcount, HQ, funding), matched on the company name.
async function companyFacts(company: string, what: string, sp: Spend): Promise<any> {
  const r = await exa({ query: (company + " " + what).trim(), category: "company", numResults: 5 }, sp);
  const k = coKey(company);
  const words = String(what ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !/company|platform|startup|based|provider|services?/.test(w));
  const named = (r.results ?? []).map((x: any) => ({ url: x.url, e: x.entities?.[0]?.properties })).filter((x: any) => x.e && (coKey(x.e.name) === k || coKey(x.e.name).startsWith(k) || k.startsWith(coKey(x.e.name))));
  // same-name companies are common (two Voltas): with context, the description must share a word with it; wrong facts are worse than none
  const score = (x: any) => words.filter((w) => String(x.e.description ?? "").toLowerCase().includes(w)).length;
  const hit = words.length ? named.map((x: any) => ({ x, n: score(x) })).filter((y: any) => y.n > 0).sort((a: any, b: any) => b.n - a.n)[0]?.x : named[0];
  if (!hit) return {};
  const e = hit.e, f = e.financials ?? {}, lr = f.fundingLatestRound ?? {};
  const equity = /seed|series|pre-?seed|angel|venture/i.test(String(lr.name ?? "")) && Number(lr.amount) >= 2e5;
  const yr = String(lr.date ?? "").slice(0, 4);
  return { domain: String(hit.url ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""), desc: String(e.description ?? "").slice(0, 300),
    team_size: e.workforce?.total ? "~" + Number(e.workforce.total).toLocaleString("en-US") + " people" : "", hq: e.headquarters?.city ?? "",
    funding: equity ? String(lr.name).replace(/\b\w/g, (c: string) => c.toUpperCase()) + " · " + money(Number(lr.amount)) + (yr ? " · " + yr : "") : (Number(f.fundingTotal) >= 5e5 ? money(Number(f.fundingTotal)) + " raised" : "") };
}
async function stageEnrich(d: any) {
  const sp: Spend = { cost: 0, searched: 0 };
  const { icp, leads } = d.stage;
  const roles = (icp.buyer_roles ?? []).slice(0, 3).join(" or ");
  await Promise.all(leads.map(async (l: any) => {
    const ctx = `the company "${l.company}" (it published this: ${l.title ?? ""}, ${l.url})`;
    l.profile = l.src === "linkedin" ? liFromPost(l.url, l.person) : "";
    // a post by HR or a recruiter: find the person who owns the work instead
    const named = l.person && !/hiring|unknown|not named|^author$/i.test(l.person) && !/\b(hr|human resources|talent|recruit\w*|people (ops|partner))\b/i.test(String(l.role ?? ""));
    if (!named) { l.person = ""; l.role = ""; }
    const p = outOf(await exa(named
      ? { query: `${l.person} ${l.company} LinkedIn`, category: "people", numResults: 5, outputSchema: PERSON_SCHEMA, systemPrompt: `${l.person} at ${ctx}. Their role, LinkedIn URL and notable background. Empty strings if unsure.` }
      : { query: `${roles} at ${l.company}`, category: "people", numResults: 5, outputSchema: PERSON_SCHEMA, systemPrompt: `The person who currently holds one of these roles: ${roles}, at ${ctx}. Must be an employee working there now (founder, executive or team lead), never a board member, investor or advisor. Prefer the person who owns this work. Empty name if not found.` }, sp));
    const badRole = /\b(board|chair(man|woman)?|non-executive|independent director|investor|advisor|adviser|partner at|intern|student|recruiter)\b/i.test(String(p?.role ?? ""));
    if (p?.name && !(badRole && !named) && (named ? norm(p.name).includes(norm(String(l.person).split(" ")[0])) : true)) {
      p.name = String(p.name).split(/\s*(?:,|;|&|\band\b)\s*/)[0]; p.role = String(p.role ?? "").split(/\s*(?:,|;)\s*(?=[A-Z])/)[0];
      l.person = p.name; l.role = l.role || p.role; if (!l.profile && /linkedin\.com\/in\//.test(p.linkedin ?? "")) l.profile = p.linkedin; l.bg = p.background ?? "";
      if (!named) l.role = p.role || l.role;
    } else if (!named) l.person = "";
    l.co = await companyFacts(l.company, l.company_what ?? "", sp);
  }));
  // the page text, one LLM call per lead (so none go missing) plus one for the ICP card
  const rules = `You write part of a free "lead drop" page for ${d.name ? d.name + ", " + (d.role ? d.role + " at " : "at ") : ""}${d.company}. It hands them companies that need what they sell. Warm, plain, specific. No hype, no em dashes, no emojis, no selling of our own services. Never mention weaknesses, doubts or caveats.
WHAT ${d.company} SELLS: ${icp.sells}
BUYERS: ${icp.buyer}. Roles: ${(icp.buyer_roles ?? []).join(", ")}. Triggers: ${(icp.triggers ?? []).join("; ")}.`;
  const items = leads.map((l: any, i: number) => ({ id: "l" + i, prompt: rules + `

THE LEAD: ${JSON.stringify({ intent: l.intent, where: l.src, person: l.person, role: l.role, company: l.company, company_description: l.co.desc, quote: l.quote, why: l.why, person_background: l.bg })}

Return ONLY JSON: {"what":"what the company is in 2-4 words, like 'SMB lender' or 'AI research lab'","bg":"the person's background as one short pill only if notable, like 'ex-Meta', 'ex-Stripe', 'YC W25' or 'Stanford PhD', else empty","fit":"one confident line, max 22 words: the concrete reason this company needs ${d.company} now, tied to what they posted","opener":"one message ${d.company}'s founder could send ${l.person ? l.person.split(" ")[0] : "them"} today, referencing what they posted, max 30 words, ends with a soft question","dm_line":"a short phrase describing this lead for a DM, like 'a Head of Credit at Mercury who's hiring to run manual underwriting' (lowercase start, no period, max 18 words)"}` }));
  items.push({ id: "icp", prompt: rules + `
CUSTOMERS FOUND: ${(icp.customers ?? []).join(", ") || "none"}

Return ONLY JSON: {"summary":"2-3 short sentences (max 60 words) to them in second person: what they sell and exactly who buys, the role that signs and the moment they buy","facts":[{"k":"Industry","v":"max 5 words"},{"k":"Stage","v":"max 4 words"},{"k":"Size","v":"max 4 words"},{"k":"Signs","v":"the 1-2 job titles that sign"},{"k":"Trigger","v":"max 7 words"}],"looksLike":["4-5 short tags"]}` });
  const got = await llm(items);
  const icpText = parse(got.icp);
  if (!icpText?.summary) throw new Error("couldn't write the page text");
  const out = { icp: icpText, leads: leads.map((_: any, i: number) => ({ i, ...(parse(got["l" + i]) ?? {}) })) };
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const board = (u: string) => /greenhouse/.test(u) ? "Greenhouse" : /lever\.co/.test(u) ? "Lever" : /ashby/.test(u) ? "Ashby" : /workable/.test(u) ? "Workable" : /ycombinator/.test(u) ? "YC Jobs" : host(u);
  const clean = (n: string) => String(n ?? "").replace(/,?\s+\b(MBA|PhD|CFA|CPA|FRM|MSc|MS|BA|BSc|PMP|JD|MD)\b\.?/g, "").replace(/\s+/g, " ").trim();
  const pageLeads = leads.map((l: any, i: number) => {
    const w = (out.leads ?? []).find((x: any) => x.i === i);
    if (!w?.opener || !w?.fit) return null;   // nothing finished to show: leave it out
    const days = l.date ? Math.max(0, Math.round((Date.now() - Date.parse(l.date)) / 864e5)) : null;
    return { id: coKey(l.company) || String(i), intent: l.intent, days, age: days == null ? "recent" : days === 0 ? "today" : days === 1 ? "1 day ago" : days + " days ago",
      channel: l.src, source: l.src === "linkedin" ? "LinkedIn post" : l.src === "hn" ? "Hacker News" : l.src === "jobs" ? "Job post · " + board(l.url) : "News · " + host(l.url),
      name: (l.person && l.role ? clean(l.person) : "") || l.company, role: l.person && l.role ? (String(l.role || "Team").split(/\s+(?:at|@)\s+/i)[0].split("|")[0].trim() || "Team") : (w.what || "Company"), company: l.company,
      facts: [l.co.funding, l.co.team_size, l.co.hq, w.what, String(w.bg ?? "").length <= 24 ? w.bg : ""].filter(Boolean).slice(0, 5), quote: l.quote, fit: w.fit || l.why, opener: w.opener || "",
      postUrl: l.url, profileUrl: l.profile || l.url };
  }).filter(Boolean);
  const domain = icp.domain || d.domain || "";
  const data = { preparedFor: { firstName: String(d.name ?? "").split(/\s+/)[0] || "you", name: d.name ?? "", role: d.role ?? "", company: d.company, domain },
    dateLabel: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), status: "live",
    scan: { items: (Number(d.searched ?? 0) + sp.searched).toLocaleString("en-US"), days: d.stage.topped ? 60 : DAYS, channels: 4 },
    icp: { summary: out.icp.summary, facts: out.icp.facts ?? [], customers: (icp.customers ?? []).slice(0, 8), customersSource: "From " + (domain || "your site") + " and press about " + d.company, looksLike: out.icp.looksLike ?? [] },
    leads: pageLeads };
  const best = (out.leads as any[]).find((w) => w.opener && w.fit && w.dm_line);
  return { status: pageLeads.length >= MIN_LEADS ? "ready" : "thin", data, n_leads: pageLeads.length, top_line: String(best?.dm_line ?? "").replace(/\.$/, ""), cost: sp.cost, searched: sp.searched };
}

// ───────── moving drops along ─────────
async function step(row: any) {
  const d = { ...row, stage: row.stage ?? {} };
  try {
    const r: any = row.status === "queued" ? await stageSearch(d) : row.status === "searched" ? await stageJudge(d) : await stageEnrich(d);
    const patch: any = { status: r.status, error: null };
    if (r.stage) patch.stage = r.stage;
    if (r.data) { patch.data = r.data; patch.n_leads = r.n_leads; patch.top_line = r.top_line; patch.ready_at = now(); }
    if (r.cost != null) patch.cost = Number(row.cost ?? 0) + r.cost;
    if (r.searched != null) patch.searched = Number(row.searched ?? 0) + r.searched;
    if (r.data) patch.data.scan.items = Number(patch.searched).toLocaleString("en-US");
    await db.from("crm_lead_drops").update(patch).eq("token", row.token);
    return { token: row.token, company: row.company, status: r.status, n: r.n_leads };
  } catch (e) {
    const tries = Number(row.tries ?? 0) + 1;
    await db.from("crm_lead_drops").update({ tries, error: String((e as Error).message ?? e).slice(0, 300), ...(tries >= 3 ? { status: "failed" } : {}) }).eq("token", row.token);
    return { token: row.token, company: row.company, error: String((e as Error).message ?? e).slice(0, 200) };
  }
}
const token = () => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; const b = crypto.getRandomValues(new Uint8Array(10)); return Array.from(b, (x) => a[x % a.length]).join(""); };

// Who needs a drop: accepted on LinkedIn and waiting for DM 1 (priority 1), X first DMs in the queue (2), LinkedIn requests out (3).
// One drop per company: a second person at the same company gets the same page.
async function enqueue(limit: number) {
  const { data: cfg } = await db.from("crm_lead_settings").select("value").eq("key", "lead_drop").maybeSingle();
  const set: any = cfg?.value ?? {};
  if (set.paused) return 0;
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from("crm_lead_drops").select("token", { count: "exact", head: true }).gte("created_at", since);
  const room = Math.min(limit, Number(set.daily_cap ?? 80) - (count ?? 0));
  if (room <= 0) return 0;
  const { data: have } = await db.from("crm_lead_drops").select("lead_id,handle,company").gte("created_at", new Date(Date.now() - 21 * 864e5).toISOString()).limit(5000);
  const hasLead = new Set((have ?? []).map((h) => h.lead_id).filter(Boolean)), hasHandle = new Set((have ?? []).map((h) => String(h.handle ?? "").toLowerCase()).filter(Boolean));
  const hasCo = new Set((have ?? []).map((h) => coKey(h.company)).filter(Boolean));
  const want: any[] = [];
  const add = (w: any) => { const k = coKey(w.company); if (!k || hasCo.has(k)) return; hasCo.add(k); want.push(w); };
  const leadInfo = async (ids: string[]) => ids.length ? ((await db.from("crm_leads").select("id,name,role,company,x_handle,fields,archived,stage").in("id", ids)).data ?? []) : [];
  const fromLead = (l: any, p: number) => ({ lead_id: l.id, handle: l.x_handle ?? null, name: l.name, role: l.role, company: l.company, hint: l.fields?.li_icp?.one_liner ?? "", priority: p });
  const { data: t1 } = await db.from("crm_li_tasks").select("lead_id").eq("kind", "dm").in("status", ["ready", "review"]).limit(200);
  for (const l of await leadInfo([...new Set((t1 ?? []).map((t) => t.lead_id).filter((x) => x && !hasLead.has(x)))]) as any[]) if (!l.archived) add(fromLead(l, 1));
  const { data: t2 } = await db.from("crm_x_tasks").select("handle,name,company").eq("kind", "dm").in("status", ["ready", "review"]).order("created_at").limit(300);
  for (const t of t2 ?? []) {
    const h = String(t.handle ?? "").replace(/^@/, "").toLowerCase(); if (!h || hasHandle.has(h)) continue;
    const { data: l } = await db.from("crm_leads").select("id,name,role,company,x_handle,fields,archived").ilike("x_handle", h).limit(1).maybeSingle();
    add(l ? { ...fromLead(l, 2), handle: h } : { handle: h, name: t.name, role: "", company: t.company, hint: "", priority: 2 });
    if (want.length >= room * 3) break;
  }
  const { data: t3 } = await db.from("crm_li_tasks").select("lead_id").eq("kind", "invite").in("status", ["sent", "ready", "review"]).order("created_at", { ascending: false }).limit(300);
  for (const l of await leadInfo([...new Set((t3 ?? []).map((t) => t.lead_id).filter((x) => x && !hasLead.has(x)))]) as any[]) if (!l.archived && !/won|lost|cold/i.test(l.stage ?? "")) add(fromLead(l, 3));
  const rows = want.filter((w) => w.company && !/^unknown$/i.test(w.company)).sort((a, b) => a.priority - b.priority).slice(0, room).map((w) => ({ token: token(), status: "queued", ...w }));
  if (rows.length) await db.from("crm_lead_drops").insert(rows);
  return rows.length;
}
async function tick() {
  const queued = await enqueue(4);
  // finish what's started before starting new ones
  const { data } = await db.from("crm_lead_drops").select("*").in("status", ["judged", "searched", "queued"]).lt("tries", 3)
    .order("priority").order("created_at").limit(1);   // oldest first, so started drops finish before new ones start
  const done = data?.[0] ? await step(data[0]) : null;
  return { queued, done };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET") {
    const k = url.searchParams.get("k") ?? "";
    if (!/^[a-z0-9]{6,20}$/.test(k)) return json({ error: "not found" }, 404);
    const { data } = await db.from("crm_lead_drops").select("data,status,views,first_view_at,lead_id,company").eq("token", k).maybeSingle();
    if (!data?.data || !["ready", "thin"].includes(data.status)) return json({ error: "not found" }, 404);
    if (url.searchParams.get("preview") !== "1")
      await db.from("crm_lead_drops").update({ views: (data.views ?? 0) + 1, last_view_at: now(), ...(data.first_view_at ? {} : { first_view_at: now() }) }).eq("token", k);
    return json(data.data);
  }
  if (req.headers.get("x-cron-secret") !== CRON || !CRON) return json({ error: "unauthorized" }, 401);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "tick") return json(await tick());
    if (b.action === "build") {
      const row = { token: token(), status: "queued", priority: 0, lead_id: b.lead_id ?? null, handle: b.handle ?? null, name: b.name ?? "", role: b.role ?? "", company: b.company, hint: b.hint ?? "", domain: b.domain ?? null };
      if (!row.company) return json({ error: "company needed" }, 400);
      await db.from("crm_lead_drops").insert(row);
      return json({ token: row.token, url: PAGE + row.token });
    }
    if (b.action === "run") {   // one stage per call, so each call stays well under the time limit
      const { data: row } = await db.from("crm_lead_drops").select("*").eq("token", b.token).maybeSingle();
      if (!row) return json({ error: "no such drop" }, 404);
      if (!["queued", "searched", "judged"].includes(row.status)) return json({ token: row.token, status: row.status, n: row.n_leads });
      return json(await step(row));
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
