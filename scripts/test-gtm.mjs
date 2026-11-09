// Checks the GTM intelligence rules (crm/src/gtm.js): ICP scoring never counts UNKNOWN as positive, relationship
// classification (New / Outbound / Midbound / Inbound), acquisition source, engagement status, the Buying Window Radar,
// outreach drafts, dedupe and validation. Run: node scripts/test-gtm.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const ctx = { window: {}, console, Date, Math, Intl, URL };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../crm/src/gtm.js", import.meta.url), "utf8"), ctx);
const G = ctx.window.GTM;
const now = new Date("2026-11-08T12:00:00");
const STAGES = ["New", "Contacted", "In talks", "Follow up", "Call booked", "Proposal sent", "Won", "Cold lead", "Lost"]
  .map((name) => ({ name, kind: name === "Won" ? "won" : name === "Lost" ? "lost" : "open" }));
const cls = (l, ev = []) => G.classify({ fields: {}, ...l }, ev, STAGES, G.ICP_DEFAULT, now);
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log("  ✓ " + name); };
const src = "https://example.com/source";
const full = (extra = {}) => ({ id: "full", name: "Ada Lovelace", company: "Acme AI", role: "Co-founder & CEO", direction: "Outbound", stage: "New",
  fields: { gtm: { rel: { conn: "connected" }, intel: {
    model: { v: "B2B", src }, industry: { v: "AI SaaS", src }, employees: { v: 18, src }, round: { v: "Seed", src }, date: { v: "2026-09-10", src },
    amount: { v: "$4M", src }, founder_led: { v: "Yes", src }, hom: { v: "No", src }, sdr: { v: "None", src }, hiring: { v: "Head of Growth", src },
    li_freq: { v: 1, src }, ...extra } } } });

ok("a fully researched ICP founder scores 100, high priority, high confidence", () => {
  const c = cls(full());
  assert.equal(c.score.score, 100); assert.equal(c.score.band, "high"); assert.equal(c.score.confLabel, "High"); assert.equal(c.score.unknown, 0);
});
ok("nothing known: every dimension UNKNOWN, 0 points, needs research (never assumed positive)", () => {
  const c = cls({ id: "x", name: "Nobody", direction: "Outbound", stage: "New" });
  assert.equal(c.score.score, 0); assert.equal(c.score.unknown, 100); assert.equal(c.score.band, "unverified"); assert.equal(c.score.conf, 0);
  assert.ok(c.score.dims.every((d) => d.pts === null && d.state === "unknown"));
});
ok("known negatives that cap the score below 50 exclude the lead", () => {
  const c = cls({ id: "x", role: "Software engineer", direction: "Outbound", stage: "New", fields: { gtm: { intel: { model: { v: "B2C", src }, employees: { v: 400, src }, round: { v: "Series D+", src }, date: { v: "2022-01-01", src }, total: { v: "$300M", src }, hom: { v: "Yes", src }, sdr: { v: "3+", src }, li_freq: { v: 20, src }, founder_led: { v: "No", src } } } } });
  assert.equal(c.score.band, "excluded"); assert.ok(c.score.max < 50);
});
ok("bands: 85+ high, 70–84 strong, 50–69 research", () => {
  assert.equal(cls(full({ li_freq: { v: 30, src } })).score.band, "high");          // 95
  assert.equal(cls(full({ li_freq: { v: 30, src }, hiring: { v: "none", src }, sdr: { v: "3+", src } })).score.band, "strong"); // 80
  const r = cls(full({ li_freq: { v: 30, src }, hiring: { v: "none", src }, sdr: { v: "3+", src }, hom: { v: "Yes", src }, founder_led: { v: "No", src } })); // 65
  assert.equal(r.score.score, 65); assert.equal(r.score.band, "research");
});
ok("manual override wins, is explained, and disqualify removes it from ICP", () => {
  const l = full(); l.fields.gtm.icp = { ov: { afford: { pts: 0, why: "Told us budget is $3k" } } };
  const c = cls(l); assert.equal(c.score.score, 95); assert.match(c.score.dims.find((d) => d.key === "afford").why, /budget is \$3k/);
  l.fields.gtm.icp.dq = "Competitor"; const d = cls(l); assert.equal(d.score.band, "disqualified"); assert.equal(d.score.icp, false);
});
ok("CRM evidence: YC batch, Series A amount, role are read but marked derived / inference", () => {
  const yc = cls({ id: "y", company: "tday.com", role: "Co-Founder & CEO", notes: "YC S26. Tagged in a post", direction: "Outbound", stage: "Contacted" });
  const a = yc.score.dims.find((d) => d.key === "authority"); assert.equal(a.pts, 15); assert.equal(a.kind, "derived");
  const r = yc.score.dims.find((d) => d.key === "recency"); assert.equal(r.pts, 15); assert.equal(r.kind, "inference");
  assert.ok(yc.tags.includes("YC")); assert.ok(yc.score.conf < 40, "derived evidence keeps confidence low");
  const sa = cls({ id: "s", company: "Arceus", notes: "Series A $17.0M", direction: "Outbound", stage: "Contacted" });
  assert.equal(sa.score.dims.find((d) => d.key === "stage").pts, 10); assert.equal(sa.score.dims.find((d) => d.key === "afford").pts, 5);
  assert.equal(sa.score.dims.find((d) => d.key === "recency").pts, null, "no date → recency UNKNOWN");
  const ai = G.evidence({ notes: "He is a founder.\nRECOVER: Execution infrastructure for insurance property restoration.\nStage: pre-seed" });
  assert.equal(ai.round.v, "Pre-seed"); assert.equal(ai.round.kind, "inference");
});
ok("relationship: invite pending → Outbound; DM sent → Outbound (contacted); post liker → Inbound / Content", () => {
  assert.equal(cls({ direction: "Outbound", stage: "New", source_detail: "LinkedIn invite sent 2026-11-06 (no note)" }).rel, "outbound");
  const c = cls({ direction: "Outbound", stage: "Contacted", source_detail: "LinkedIn DM from Reyansh sent 2026-11-07" });
  assert.equal(c.rel, "outbound"); assert.equal(c.conn, "connected"); assert.equal(c.contacted.at, "2026-11-07");
  const p = cls({ direction: "Inbound", origin_key: "li-person:x", source_detail: "Liked your post: “x”", stage: "New" });
  assert.equal(p.rel, "inbound"); assert.equal(p.acq, "Content");
});
ok("New connection: connected but not contacted", () => {
  const c = cls({ direction: "Outbound", stage: "New", fields: { gtm: { rel: { conn: "connected" } } } });
  assert.equal(c.rel, "new");
  const ev = [{ kind: "note", text: "2026-11-08: accepted invite; nothing sent yet" }];
  assert.equal(cls({ direction: "Outbound", stage: "New", source_detail: "LinkedIn invite sent 2026-11-01 (no note)" }, ev).rel, "new");
});
ok("Midbound: a logged reply moves it; an accepted connection alone does not", () => {
  const acc = cls({ direction: "Outbound", stage: "Contacted", fields: { gtm: { touches: [{ at: "2026-11-05", dir: "out", type: "dm", ch: "LinkedIn" }, { at: "2026-11-06", dir: "in", type: "accepted" }] } } });
  assert.equal(acc.rel, "outbound");
  const rep = cls({ direction: "Outbound", stage: "Contacted", fields: { gtm: { touches: [{ at: "2026-11-05", dir: "out", type: "dm" }, { at: "2026-11-06", dir: "in", type: "reply", text: "Sure" }] } } });
  assert.equal(rep.rel, "midbound"); assert.equal(rep.lastIn.text, "Sure");
  const st = cls({ direction: "Outbound", stage: "Contacted" }, [{ kind: "stage", text: "Contacted → In talks", at: "2026-11-06" }]);
  assert.equal(st.rel, "midbound", "the outreach job's In talks counts as a reply");
});
ok("engagement status comes from the stage and is separate from the source", () => {
  assert.equal(G.statusOf("In talks"), "Engaged"); assert.equal(G.statusOf("Call booked"), "Meeting booked"); assert.equal(G.statusOf("Proposal sent"), "Proposal");
  assert.equal(G.statusOf("Cold lead"), "Nurture"); assert.equal(G.statusOf("Follow up"), "Contacted"); assert.equal(G.statusOf("Signed", "won"), "Won");
  const c = cls({ direction: "Inbound", source: "Referral", stage: "Call booked" }); assert.equal(c.acq, "Referral"); assert.equal(c.status, "Meeting booked");
});
ok("radar: a sourced raise last month + hiring + no marketing lead = HIGH, facts apart from inferences", () => {
  const c = cls(full({ date: { v: "2026-10-01", src } }));
  assert.equal(c.radar.level, "HIGH"); assert.ok(c.radar.why.every((w) => w.kind === "fact"));
  const y = cls({ notes: "YC S26", direction: "Outbound", stage: "New" });
  assert.equal(y.radar.why[0].kind, "inference"); assert.ok(y.radar.score < cls(full({ date: { v: "2026-10-01", src } })).radar.score);
  assert.equal(cls({ direction: "Outbound", stage: "New" }).radar.level, "LOW");
});
ok("drafts: four messages, founder to founder, no agency pitch, no unfilled placeholders", () => {
  const l = full(); const m = G.messages(l, cls(l));
  assert.equal(m.list.length, 4); assert.ok(m.list[0].text.length <= 300);
  for (const x of m.list) { assert.doesNotMatch(x.text, /\{|\}|undefined|null/); assert.doesNotMatch(x.text, /agency|our services|we help companies/i); }
  assert.match(m.list[1].text, /^Thanks for connecting, Ada!/);
  const bare = G.messages({ name: "", company: "" }, cls({ direction: "Outbound", stage: "New" }));
  for (const x of bare.list) assert.doesNotMatch(x.text, /undefined|null|\bat \./);
});
ok("dedupe: LinkedIn URL first, then email, then name + company", () => {
  const rows = [{ id: 1, linkedin: "https://www.linkedin.com/in/Cyruskelly/?utm=x" }, { id: 2, linkedin: "linkedin.com/in/cyruskelly" },
    { id: 3, email: "A@x.com" }, { id: 4, email: "a@x.com " }, { id: 5, name: "Pratham Patel", company: "Clean (tryclean.ai)" }, { id: 6, name: "pratham  patel", company: "Clean" },
    { id: 7, linkedin: "https://www.linkedin.com/in/cyruskelly", archived: true }];
  const d = G.dupes(rows); assert.equal(d.length, 3);
  assert.deepEqual([...d[0].ids], [1, 2]); assert.equal(d[1].why, "Same email"); assert.equal(d[2].why, "Same name and company");
  assert.equal(G.findDup(rows, { linkedin: "https://linkedin.com/in/cyruskelly/" }).id, 1); assert.equal(G.findDup(rows, { name: "Someone" }), null);
});
ok("validation: links, numbers, money and dates", () => {
  assert.equal(G.validateIntel("website", "acme.ai"), "Website must be a link starting with http:// or https://");
  assert.equal(G.validateIntel("website", "https://acme.ai", "https://crunchbase.com/x", "2026-11-01"), "");
  assert.match(G.validateIntel("employees", "lots"), /number/); assert.match(G.validateIntel("amount", "a lot"), /amount/);
  assert.match(G.validateIntel("date", "2027-05-01", "", "", now), /future/); assert.match(G.validateIntel("round", "Series Z"), /one of/);
  assert.match(G.validateIntel("industry", "AI", "not a link"), /source/);
  assert.equal(G.parseMoney("$17.0M"), 17e6); assert.equal(G.parseMoney("500k"), 5e5); assert.equal(G.parseMoney("2.5 million"), 2.5e6);
});
ok("ICP config: saved settings override defaults, config references kept", () => {
  const c = G.icpConfig({ empMax: 80, weights: { afford: 5 } }, { icp: { references: ["Ref A"] } });
  assert.equal(c.empMax, 80); assert.equal(c.weights.authority, 15); assert.deepEqual([...c.references], ["Ref A"]);
});
ok("analytics: response and positive rates by template", () => {
  const items = [
    { l: { source_detail: "LinkedIn DM from Reyansh sent 2026-11-01" }, c: cls({ direction: "Outbound", stage: "In talks", source_detail: "LinkedIn DM from Reyansh sent 2026-11-01" }) },
    { l: { source_detail: "LinkedIn DM from Reyansh sent 2026-11-01" }, c: cls({ direction: "Outbound", stage: "Contacted", source_detail: "LinkedIn DM from Reyansh sent 2026-11-01" }) }];
  const rows = G.groupBy(items, (x) => G.templateOf(x.l, x.c));
  assert.equal(rows[0].name, "Reyansh DM · new connection"); assert.equal(rows[0].sent, 2); assert.equal(rows[0].respRate, "50%");
});
ok("ICP posts: our comment is outreach; a reply to it, or engaging with our post after we reached out, makes them Midbound", () => {
  const commented = cls({ direction: "Outbound", stage: "New", fields: { gtm: { touches: [{ at: "2026-11-05", dir: "out", type: "comment", ch: "LinkedIn", text: "Great point" }] } } });
  assert.equal(commented.rel, "outbound"); assert.ok(commented.contacted);
  const replied = cls({ direction: "Outbound", stage: "Contacted", fields: { gtm: { touches: [{ at: "2026-11-05", dir: "out", type: "comment" }, { at: "2026-11-06", dir: "in", type: "comment_reply", text: "Thanks!" }] } } });
  assert.equal(replied.rel, "midbound"); assert.ok(replied.tags.includes("Midbound"));
  const lead = { direction: "Outbound", stage: "Contacted", source_detail: "LinkedIn DM from Reyansh sent 2026-11-01" };
  assert.equal(cls(lead, [{ kind: "engaged", at: "2026-11-04T10:00:00Z", text: "Liked your post" }]).rel, "midbound", "liked our post after the DM");
  assert.equal(cls(lead, [{ kind: "engaged", at: "2026-10-20T10:00:00Z", text: "Liked your post" }]).rel, "outbound", "engagement before outreach doesn't count");
});
ok("ICP posts: daily comment count and post link checks", () => {
  const rows = [{ fields: { gtm: { content: [{ url: "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000001/", status: "posted", postedAt: "2026-11-08T09:00:00" }, { url: "https://x", status: "approved" }] } } },
    { fields: { gtm: { content: [{ url: "https://www.linkedin.com/posts/a_b-activity-7390000000000000002-x", status: "posted", postedAt: "2026-11-07T09:00:00" }] } } }];
  assert.equal(G.commentsOn(rows, "2026-11-08"), 1);
  assert.equal(G.normPost("https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000001/?x=1"), "urn:7390000000000000001");
  assert.equal(G.normPost("https://www.linkedin.com/posts/a_b-activity-7390000000000000002-x"), "urn:7390000000000000002");
  assert.ok(G.isLiPost("https://www.linkedin.com/posts/abc")); assert.ok(!G.isLiPost("https://example.com/post"));
});
console.log(passed + " checks passed");
