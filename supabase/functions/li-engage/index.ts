// li-engage (9 Nov): every morning, 10 recent LinkedIn posts by B2B startup founders worth commenting on, each with a
// genuine comment ready to copy (no pitch), for the LinkedIn → Engagement page.
// 1. Exa finds public LinkedIn posts from the last 4 days on topics our buyers write about (about $0.01 a search).
// 2. One language-model call per post (Composio's workbench, the same one the Instagram job uses) checks the author is a
//    founder or CEO of a B2B startup writing their own post, and writes the comment.
// Runs at 7:45 IST and from "Find posts now".
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const EXA = Deno.env.get("EXA_API_KEY") ?? "";
const COMPOSIO = Deno.env.get("COMPOSIO_API_KEY") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const MCP_URL = "https://connect.composio.dev/mcp";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const PER_DAY = 10;
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

async function mcp(name: string, args: Record<string, unknown>) {
  const res = await fetch(MCP_URL, { method: "POST",
    headers: { "x-consumer-api-key": COMPOSIO, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const txt = await res.text();
  if (!res.ok) throw new Error("Composio answered " + res.status + ": " + txt.slice(0, 200));
  const line = txt.match(/^data: (.*)$/m);
  const j = JSON.parse(line ? line[1] : txt);
  if (j.error) throw new Error("Composio: " + String(j.error.message ?? j.error).slice(0, 200));
  return JSON.parse(j.result?.content?.[0]?.text ?? "{}");
}

// Topics our buyers post about: the raise one every day, plus two others in turn.
const QUERIES = [
  "founder post about how we got our first customers at our B2B startup",
  "founder post on lessons from founder-led sales at an early-stage startup",
  "we are hiring our first sales or GTM person, founder post",
  "founder post about building in public and growing a B2B startup",
  "founder post on what we learned from 100 customer calls",
  "startup founder post about distribution being harder than building the product",
];
const RAISE = "founder post: we just raised our seed or Series A round, here is what's next";

const PROMPT = (p: { author: string; text: string }) =>
  "You help Reyansh, 20, who builds go-to-market systems for B2B startups, leave genuine comments on LinkedIn.\n" +
  "Here is a LinkedIn post" + (p.author ? " by " + p.author : "") + ":\n\"\"\"\n" + p.text.slice(0, 1400) + "\n\"\"\"\n" +
  "Answer with JSON only: {\"is_founder\": true only if the author is a founder, co-founder, CEO or CMO of a B2B or B2B2C startup writing about their own company or journey " +
  "(false for VCs, recruiters, agencies, coaches, consultants, job seekers and company pages), \"author\": their full name, \"headline\": their role and company in a few words, " +
  "\"company\": their company, \"comment\": the comment}.\n" +
  "The comment: what a thoughtful founder friend would write. 2 or 3 short sentences, under 260 characters. Pick ONE specific point from the post, add a real thought " +
  "or a short example of your own, and end with a sincere, specific question the author will want to answer. Plain words, sounds like a person typed it. " +
  "Never start with praise (no 'Great post', 'Love this', 'Congrats', 'So true'). No pitch, no mention of what Reyansh sells, no links, hashtags, emojis or em dashes.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await allowed(req))) return json({ error: "Only the team can run this." }, 401);
  if (!EXA || !COMPOSIO) return json({ error: "EXA_API_KEY or COMPOSIO_API_KEY is missing." }, 500);
  try {
    const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
    const { count } = await db.from("crm_li_suggest").select("url", { count: "exact", head: true }).eq("day", today);
    const want = PER_DAY - (count ?? 0);
    if (want <= 0) return json({ skipped: "Today's " + PER_DAY + " posts are already in.", today: count });
    const { data: seenRows } = await db.from("crm_li_suggest").select("url,author_url").gte("day", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
    const seen = new Set((seenRows ?? []).map((r) => r.url));
    const seenAuthors = new Set((seenRows ?? []).map((r) => r.author_url).filter(Boolean));
    const day = Math.floor(Date.now() / 864e5);
    const since = new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10);
    let cost = 0;
    const found = (await Promise.all([RAISE, QUERIES[day % QUERIES.length], QUERIES[(day + 3) % QUERIES.length]].map(async (query) => {
      const r = await fetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": EXA, "Content-Type": "application/json" },
        body: JSON.stringify({ query, numResults: 15, includeDomains: ["linkedin.com"], startPublishedDate: since, contents: { text: { maxCharacters: 1500 } } }) });
      if (!r.ok) return [];
      const j = await r.json(); cost += j.costDollars?.total ?? 0;
      return j.results ?? [];
    }))).flat();
    // Posts only (not profiles), one per author, nothing we suggested in the last 30 days.
    const cands: any[] = [];
    for (const x of found) {
      const url = String(x.url || "").split("?")[0];
      if (!/linkedin\.com\/(posts|feed\/update)\//i.test(url) || seen.has(url)) continue;
      const vanity = (url.match(/linkedin\.com\/posts\/([^_/]+)_/i) || [])[1];
      const authorUrl = vanity ? "https://www.linkedin.com/in/" + vanity : "";
      if (authorUrl && seenAuthors.has(authorUrl)) continue;
      const text = String(x.text || "").replace(/^#\s*/, "").split(/\s*\|\s*\d[\d,]*\s+comments?|\s#\s|\s\|\s*[A-Z][^|]{0,60}\s·\sLinkedIn/)[0].trim();
      if (text.length < 200) continue;
      seen.add(url); if (authorUrl) seenAuthors.add(authorUrl);
      cands.push({ id: String(cands.length), url, authorUrl, author: x.author || "", text, at: x.publishedDate || null });
      if (cands.length >= 24) break;
    }
    if (!cands.length) return json({ added: 0, note: "No new founder posts found today.", cost_exa: cost });
    const items = cands.map((c) => ({ id: c.id, prompt: PROMPT(c) }));
    const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(items))));
    const code = ["import json, base64", "from concurrent.futures import ThreadPoolExecutor",
      "items = json.loads(base64.b64decode('" + payload + "').decode())",
      "def one(x):", "    r, e = invoke_llm(x['prompt'])", "    return x['id'], (r if not e else '')",
      "with ThreadPoolExecutor(8) as ex: res = dict(ex.map(one, items))",
      "print('@@' + json.dumps(res))"].join("\n");
    const outp = await mcp("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Write LinkedIn comment ideas for the CRM" });
    const res = JSON.parse(String(outp?.data?.stdout ?? "").split("@@").pop() || "{}");
    const rows: any[] = [];
    for (const c of cands) {
      if (rows.length >= want) break;
      let s: any = null;
      try { s = JSON.parse(String(res[c.id] ?? "").replace(/^```(json)?|```$/g, "").trim()); } catch { continue; }
      if (!s?.is_founder || !s.comment) continue;
      const comment = String(s.comment).replace(/\s*[—–]\s*/g, ", ").trim();
      if (/^(great|love|congrats|amazing|awesome|so true)\b/i.test(comment)) continue;
      rows.push({ url: c.url, day: today, author: s.author || c.author, author_url: c.authorUrl, headline: s.headline || "", company: s.company || "",
        post_text: c.text.slice(0, 1500), posted_at: c.at, comment });
    }
    if (rows.length) { const { error } = await db.from("crm_li_suggest").insert(rows); if (error) throw error; }
    return json({ looked_at: cands.length, added: rows.length, today: (count ?? 0) + rows.length, cost_exa: Math.round(cost * 1000) / 1000 });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
