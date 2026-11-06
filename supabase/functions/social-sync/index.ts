// social-sync (7 Nov): checks our latest LinkedIn posts, saves their numbers and everyone who liked or commented, judges
// each new person against who we sell to, and adds good fits to Leads. Runs on a schedule (pg_cron, twice a day) and
// from the "Check now" button. Apify reads LinkedIn without anyone's login; Exa looks up each person.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const APIFY = Deno.env.get("APIFY_TOKEN") ?? "";
const EXA = Deno.env.get("EXA_API_KEY") ?? "";
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const MAX_POSTS = 8;         // newest posts checked each run
const MAX_JUDGED = 40;       // new people looked up per run (about $0.007 each)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// The schedule sends the cron secret; people on the team send their own sign-in.
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
  // One run at a time: the database allows a single unfinished run per platform (a run stuck for 5 minutes counts as failed).
  await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error: "Didn’t finish" })
    .eq("platform", "linkedin").is("finished_at", null).lt("started_at", new Date(Date.now() - 5 * 60e3).toISOString());
  const { data: run, error: busy } = await db.from("crm_sync_runs").insert({ platform: "linkedin" }).select("id").single();
  if (busy) return json({ skipped: "A check is already running. Give it a minute." });
  try {
    const summary = await syncLinkedIn();
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", run.id);
    return json(summary);
  } catch (e) {
    const error = String((e as Error).message ?? e);
    if (run) await db.from("crm_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", run.id);
    return json({ error }, 500);
  }
});

const keyOf = (url: string) => String(url || "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "https://www.");
// A person's key: their LinkedIn member id as a profile link (what a like returns); their link if there's no id.
const personKey = (a: any) => a?.id ? "https://www.linkedin.com/in/" + String(a.id).toLowerCase() : keyOf(a?.linkedinUrl);
const isVanity = (url: string) => !!url && !/\/in\/acoa/i.test(url);
const firstLine = (s: string) => String(s || "").split("\n").map((x) => x.trim()).find(Boolean) ?? "";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

type Settings = { linkedin_profile?: string; icp?: string; add_hot?: boolean; add_warm?: boolean; enabled?: boolean; owner?: string };

async function syncLinkedIn() {
  const { data: rows } = await db.from("crm_lead_settings").select("key,value").in("key", ["automation", "stages"]);
  const set = (rows?.find((r) => r.key === "automation")?.value ?? {}) as Settings;
  const firstStage = ((rows?.find((r) => r.key === "stages")?.value ?? []) as { name: string }[])[0]?.name ?? "New";
  if (set.enabled === false) return { skipped: "Automation is switched off." };
  if (!set.linkedin_profile) return { skipped: "No LinkedIn profile is set on the Setup page." };
  if (!APIFY) throw new Error("APIFY_TOKEN is missing.");

  // 1. Our newest posts, with everyone who reacted or commented.
  const res = await fetch("https://api.apify.com/v2/acts/harvestapi~linkedin-profile-posts/run-sync-get-dataset-items?timeout=110", {
    method: "POST",
    headers: { Authorization: "Bearer " + APIFY, "Content-Type": "application/json" },
    body: JSON.stringify({ targetUrls: [set.linkedin_profile], maxPosts: MAX_POSTS, includeQuotePosts: true, includeReposts: false,
      scrapeReactions: true, maxReactions: 300, scrapeComments: true, maxComments: 100 }),
  });
  if (!res.ok) throw new Error("Apify answered " + res.status + ": " + (await res.text()).slice(0, 200));
  const items = await res.json() as any[];
  const posts = items.filter((i) => i.type === "post");
  const now = new Date().toISOString();

  // 2. Post numbers, plus a dated copy so the tracker can show growth.
  const postRows = posts.map((p) => ({ platform: "linkedin", post_id: String(p.id), url: p.linkedinUrl ?? "", text: p.content ?? "",
    posted_at: p.postedAt?.date ?? null, likes: p.engagement?.likes ?? 0, comments: p.engagement?.comments ?? 0,
    reposts: p.engagement?.shares ?? 0, reactions: p.engagement?.reactions ?? [], checked_at: now }));
  if (postRows.length) {
    const { error } = await db.from("crm_social_posts").upsert(postRows, { onConflict: "platform,post_id" });
    if (error) throw error;
    await db.from("crm_social_checks").insert(postRows.map((p) => ({ platform: "linkedin", post_id: p.post_id, at: now, likes: p.likes, comments: p.comments, reposts: p.reposts })));
  }
  const textOf = new Map(postRows.map((p) => [p.post_id, p.text]));

  // 3. Everyone who engaged. Our own likes and replies are marked so they never become leads.
  const me = posts[0]?.author ?? {};
  const meKey = keyOf(me.linkedinUrl ?? set.linkedin_profile);
  const isSelf = (a: any) => (!!me.id && a?.id === me.id) || keyOf(a?.linkedinUrl) === meKey || (!!me.name && a?.name === me.name) ||
    (!!me.publicIdentifier && keyOf(a?.linkedinUrl).endsWith("/in/" + String(me.publicIdentifier).toLowerCase()));
  const acts = items.filter((i) => (i.type === "reaction" || i.type === "comment") && i.actor?.linkedinUrl);
  const people = new Map<string, any>();
  for (const a of acts) {
    const k = personKey(a.actor), had = people.get(k);
    people.set(k, { platform: "linkedin", person_key: k, name: a.actor.name ?? "", headline: a.actor.position || had?.headline || "",
      profile_url: isVanity(a.actor.linkedinUrl) || !had ? a.actor.linkedinUrl : had.profile_url,   // keep the readable link when there is one
      picture_url: a.actor.pictureUrl || had?.picture_url || "", is_self: isSelf(a.actor), last_seen: now });
  }
  if (people.size) {
    const { error } = await db.from("crm_social_people").upsert([...people.values()], { onConflict: "platform,person_key" });
    if (error) throw error;
  }
  // People first saved under their readable link (before 7 Nov, commenters were keyed that way) move to their member-id key,
  // keeping how they were judged and their lead.
  for (const a of acts) {
    const oldKey = keyOf(a.actor.linkedinUrl), newKey = personKey(a.actor);
    if (oldKey === newKey || !isVanity(a.actor.linkedinUrl)) continue;
    const { data: old } = await db.from("crm_social_people").select("*").eq("platform", "linkedin").eq("person_key", oldKey).maybeSingle();
    if (!old) continue;
    if (old.fit) await db.from("crm_social_people").update({ fit: old.fit, why: old.why, role: old.role, company: old.company, company_what: old.company_what,
      company_stage: old.company_stage, found_online: old.found_online, judged_at: old.judged_at, fit_by: old.fit_by, lead_id: old.lead_id })
      .eq("platform", "linkedin").eq("person_key", newKey).eq("fit", "");
    await db.from("crm_social_people").delete().eq("platform", "linkedin").eq("person_key", oldKey);   // its engagements are saved again below
  }
  const engRows = acts.map((a) => ({ platform: "linkedin", post_id: String(a.postId), person_key: personKey(a.actor),
    kind: a.type === "comment" ? "commented" : "liked", reaction: a.reactionType ?? "", said: a.commentary ?? "",
    at: a.createdAt ?? null }));
  const uniq = new Map(engRows.map((e) => [e.post_id + "|" + e.person_key + "|" + e.kind, e]));
  // Only the rows this insert actually adds are new since the last run (they go into the leads' history).
  let fresh: any[] = [];
  if (uniq.size) {
    const { data: added, error } = await db.from("crm_social_engagements")
      .upsert([...uniq.values()], { onConflict: "platform,post_id,person_key,kind", ignoreDuplicates: true }).select("post_id,person_key,kind");
    if (error) throw error;
    const isNew = new Set((added ?? []).map((e) => e.post_id + "|" + e.person_key + "|" + e.kind));
    fresh = [...uniq.values()].filter((e) => isNew.has(e.post_id + "|" + e.person_key + "|" + e.kind));
  }

  // 4. Judge new people (headline first; Exa adds what it can find about their company).
  const { data: todo } = await db.from("crm_social_people").select("*").eq("platform", "linkedin").eq("fit", "").eq("is_self", false).is("judged_at", null)
    .order("first_seen", { ascending: false }).limit(MAX_JUDGED);
  let judged = 0, cost = 0;
  for (let i = 0; i < (todo ?? []).length; i += 5) {
    const batch = todo!.slice(i, i + 5);
    const saidBy = (k: string) => [...uniq.values()].find((e) => e.person_key === k && e.said)?.said ?? "";
    const out = await Promise.all(batch.map((p) => judge(p, saidBy(p.person_key), set.icp ?? "").catch((e) => ({ error: String(e) }))));
    for (let j = 0; j < batch.length; j++) {
      const o: any = out[j] ?? {};
      cost += o.cost ?? 0;
      const ok = !o.error && ["hot", "warm", "not a fit"].includes(o.fit);
      const { error } = await db.from("crm_social_people").update(ok
        ? { fit: o.fit, why: o.why ?? "", role: o.role ?? "", company: o.company ?? "", company_what: o.company_what ?? "", company_stage: o.company_stage ?? "",
            found_online: o.found_online ?? null, judged_at: new Date().toISOString(), fit_by: "auto" }
        : { fit: "warm", why: "Couldn’t be checked automatically. Have a look yourself.", judged_at: new Date().toISOString(), fit_by: "auto" })
        .eq("platform", "linkedin").eq("person_key", batch[j].person_key);
      if (!error) judged++;
    }
  }

  // 5. Good fits become leads, labelled with what they did; people already in Leads get the new activity in their history.
  const wanted = ["hot", ...(set.add_warm ? ["warm"] : [])];
  const { data: fits } = set.add_hot === false && !set.add_warm ? { data: [] } :
    await db.from("crm_social_people").select("*").eq("platform", "linkedin").eq("is_self", false).is("lead_id", null).in("fit", set.add_hot === false ? ["warm"] : wanted);
  let added = 0;
  const { data: allLeads } = await db.from("crm_leads").select("id,linkedin,origin_key");
  const leadByLink = new Map<string, string>();
  for (const l of allLeads ?? []) { if (l.linkedin) leadByLink.set(keyOf(l.linkedin), l.id); if (l.origin_key?.startsWith("li-person:")) leadByLink.set(l.origin_key.slice(10), l.id); }
  const label = (e: any) => (e.kind === "commented" ? "Commented on your post: “" : "Liked your post: “") + clip(firstLine(textOf.get(e.post_id) ?? ""), 70) + "”";
  for (const p of fits ?? []) {
    const did = [...uniq.values()].find((e) => e.person_key === p.person_key && e.kind === "commented") ?? [...uniq.values()].find((e) => e.person_key === p.person_key);
    const origin = "li-person:" + p.person_key;
    let leadId = leadByLink.get(p.person_key) ?? leadByLink.get(keyOf(p.profile_url));
    if (!leadId) {
      const notes = [p.why, p.company_what ? (p.company || "Their company") + ": " + p.company_what : "", p.company_stage && p.company_stage !== "unknown" ? "Stage: " + p.company_stage : "",
        did?.said ? "They said: “" + clip(did.said, 400) + "”" : ""].filter(Boolean).join("\n");
      const { data: lead, error } = await db.from("crm_leads").insert({ name: p.name, role: p.role || clip(p.headline, 120), company: p.company ?? "", linkedin: p.profile_url,
        direction: "Inbound", source: "LinkedIn", source_detail: did ? label(did) : "Engaged with your LinkedIn post", stage: firstStage,
        heat: p.fit === "hot" ? "Hot" : "Warm", notes, owner: set.owner ?? "", origin_key: origin, created_by: "automation" }).select("id").single();
      if (error) continue;
      leadId = lead.id;
      added++;
      await db.from("crm_lead_events").insert({ lead_id: leadId, kind: "note", text: "Found automatically. " + (p.why || ""), by_email: "automation" });
    }
    await db.from("crm_social_people").update({ lead_id: leadId }).eq("platform", "linkedin").eq("person_key", p.person_key);
  }
  // New likes and comments from people who are already leads.
  const freshKeys = [...new Set(fresh.map((e) => e.person_key))];
  const { data: linked } = freshKeys.length ? await db.from("crm_social_people").select("person_key,lead_id").eq("platform", "linkedin").not("lead_id", "is", null)
    .in("person_key", freshKeys) : { data: [] };
  const leadOf = new Map((linked ?? []).map((r) => [r.person_key, r.lead_id]));
  const engagedEvents = fresh.filter((e) => leadOf.has(e.person_key)).map((e) => ({ lead_id: leadOf.get(e.person_key), kind: "engaged",
    text: label(e) + (e.said ? "\n“" + clip(e.said, 400) + "”" : ""), by_email: "automation" }));
  if (engagedEvents.length) await db.from("crm_lead_events").insert(engagedEvents);

  return { posts: postRows.length, people: people.size, new_engagements: fresh.length, judged, leads_added: added, cost_exa: Math.round(cost * 1000) / 1000 };
}

// One Exa call per person: judged mainly from their headline (and comment), with search results used only to learn about
// their company. Nothing found online never makes someone "not a fit".
async function judge(p: any, said: string, icp: string) {
  if (!EXA) throw new Error("EXA_API_KEY is missing.");
  const schema = { type: "object", required: ["fit", "why", "found_online"], properties: {
    fit: { type: "string", enum: ["hot", "warm", "not a fit"] }, why: { type: "string", description: "One plain sentence a founder would understand" },
    role: { type: "string" }, company: { type: "string" }, company_what: { type: "string", description: "What their company does, one short sentence, or empty" },
    company_stage: { type: "string", description: "pre-seed, seed, Series A, Series B+, bootstrapped, public, or unknown" },
    found_online: { type: "boolean", description: "true only if the search results are about this exact person or their company" } } };
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": EXA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: (p.headline || p.name) + " company", numResults: 5, outputSchema: schema,
      systemPrompt: "You judge one person as a sales lead. Their LinkedIn headline is: \"" + p.headline + "\". Name: " + p.name + "." +
        (said ? " They commented on our post: \"" + said.slice(0, 300) + "\"." : " They liked our post.") +
        " Judge the fit mainly from the headline (and comment). Use the search results only to learn about their company; if the results are not about them or their company, set found_online=false and still judge from the headline. Never say not a fit just because nothing was found. " +
        (icp || "Hot = a founder or senior decision maker at a business that could buy from us. Warm = could buy or refer later. Not a fit = everyone else.") }),
  });
  if (!res.ok) throw new Error("Exa answered " + res.status);
  const j = await res.json();
  return { ...(j.output?.content ?? {}), cost: j.costDollars?.total ?? 0 };
}
