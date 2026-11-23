// Mail library for the email pipeline: no Supabase here, so it can be tested on its own (supabase/functions/email-bot/mail.test.ts).
// Sending is plain SMTP over TLS (smtp.gmail.com:465) and reading is plain IMAP over TLS (imap.gmail.com:993), each with the
// inbox's Google app password. Written by hand so every header (Message-ID, In-Reply-To, References) is under our control.

export const enc = new TextEncoder(), dec = new TextDecoder();

// ───────── addresses ─────────
const FREE = /(^|\.)(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|zoho|yandex|qq|163|126|hey|fastmail|mail|inbox|rocketmail)\.[a-z.]+$/i;
const ROLE = /^(info|hello|hi|contact|sales|team|support|admin|office|help|enquiries|inquiries|marketing|press|careers|jobs|billing|accounts|noreply|no-reply|donotreply|hr|legal|security|privacy|abuse|postmaster|webmaster|mail|general|founders?|ceo|cto|cfo|coo|partnerships?|hiring|recruiting|media|pr)$/i;
export const emailOk = (e: string) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(e.trim());
export const isFreeMail = (e: string) => FREE.test(e.trim().split("@")[1] ?? "");
export const isRole = (e: string) => ROLE.test(e.trim().split("@")[0] ?? "");
export const normEmail = (e: string) => String(e ?? "").trim().toLowerCase();
export const companyKey = (s: string) => String(s ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/\b(inc|llc|ltd|labs?|ai|hq|co|corp|technologies|the|robotics|systems|software)\b/g, "").replace(/[^a-z0-9]/g, "").slice(0, 24);

// ───────── time: prospect's working hours, business days ─────────
export function localParts(d: Date, tz: string): { date: string; hour: number; dow: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: g("year") + "-" + g("month") + "-" + g("day"), hour: +g("hour"), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
}
export function validTz(tz: string, fallback: string): string { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return fallback; } }
/** Monday to Friday, from <= local hour < to, and not a holiday. */
export function inWindow(now: Date, tz: string, from: number, to: number, holidays: string[]): boolean {
  const l = localParts(now, tz); return l.dow >= 1 && l.dow <= 5 && l.hour >= from && l.hour < to && !holidays.includes(l.date);
}
/** The instant n business days after `from` (weekends and holidays don't count), measured in the prospect's calendar. */
export function addBusinessDays(from: Date, n: number, tz: string, holidays: string[]): Date {
  let d = new Date(from.getTime()), left = n;
  while (left > 0) { d = new Date(d.getTime() + 864e5); const l = localParts(d, tz); if (l.dow >= 1 && l.dow <= 5 && !holidays.includes(l.date)) left--; }
  return d;
}

// ───────── drafts ─────────
export const SIGNATURE = "Emily Jones\nGrowth Lead, SOVE7GN\nA2/84, Rajouri Garden, New Delhi 110027, India";
export const OPT_OUT = 'Not relevant? Reply "no" and I won\'t email again.';
export type Templates = { subject: string; e1: string; e2: string; e2_nodrop: string; e3: string; e4: string; e5: string; e6: string; e7: string };
export const STEPS = 7;
// {first} {company} {n} {list} {fact} {channel_line}. Editable in the CRM settings (crm_lead_settings 'email_templates'); these are the defaults.
// Email 1 is Reyansh's wording (23 Nov), tidied. Email 2 is the lead list (same idea as the LinkedIn day 0 message), email 3 the LinkedIn
// day 3 question. No links anywhere, and no domain name (a sove7gn.org mention can be auto-linked and hurts delivery).
export const DEFAULT_TEMPLATES: Templates = {
  subject: "Sales calls for {company}",
  e1: "Hi {first},\n\nMy name is Emily and I work with Reyansh Juneja at SOVE7GN. We are a growth studio for seed to Series C founders: we scale their social media and turn it into hot leads, using real-time data to decide who to reach and when. We work with 10+ founders, and one of them got more than 30 enterprise sales calls in 2 weeks.\n\nLet's talk?",
  e2: "Hi {first},\n\nI looked into {company} and found {n} companies that look ready to buy what you sell right now. A few of them:\n\n{list}\n\nLet me know if you want the full list.",
  e2_nodrop: "Hi {first},\n\nQuick follow up on my note. We build lists of companies that are actively looking for what {company} sells, using real-time signals like hiring and funding. Want me to put one together for you?",
  e3: "Hi {first},\n\nCurious: if you could fix one thing this quarter, is it getting found, getting replies, or getting calls booked?",
  e4: "Hi {first},\n\nTwo things you can try this week, no cost:\n\n1. Speed to lead. People who like or comment on your posts are warm for about a day. Message them within the hour with one question about what brought them there.\n\n2. Be everywhere. Pick your 50 best-fit buyers and reach each one on LinkedIn, X and email in the same week. Seeing you three times makes the next message feel warm.",
  e5: "Hi {first},\n\nIf we worked together, week one for {company} would be: pick the 50 buyers most likely to need you, post twice a week on what they worry about, and message everyone who engages the same day.\n\nWant me to send the plan for {company}? Just reply \"plan\".",
  e6: "Hi {first},\n\nIs growing sales calls not a priority right now, or is it just bad timing? If it is timing, I will check back in January. If someone else owns this at {company}, who should I talk to?",
  e7: "Hi {first},\n\nI'll close this out so I don't clog your inbox. If more sales calls from founder content becomes a priority, reply \"growth\" and I'll pick it back up. Good luck with {company}.",
};
const lowerFirst = (s: string) => /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
/** "Workmagic.io" reads as a link to a spam filter: drop the domain ending in the copy. */
export const cleanCompany = (c: string) => c.trim().replace(/\.(io|ai|com|co|app|xyz|dev|net|org|so|gg|tech)$/i, "");
export function firstNameOf(name: string): string {
  const w = String(name ?? "").replace(/[^\p{L}\s'-]/gu, " ").replace(/\b(dr|prof|mr|mrs|ms|phd|md)\b/gi, " ").trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return w.length >= 2 ? w.charAt(0).toUpperCase() + w.slice(1) : "";
}
/** One real fact from the lead's research: a funding round (if recent and clean), else what the company builds. Never invented. Only used if a template has {fact}. */
export function factFor(l: { company: string; funding?: string; one_liner?: string }, now = new Date()): string | null {
  const co = l.company.trim();
  const f = String(l.funding ?? "").split(/\s+[·•]\s+/).map((x) => x.trim());
  if (f.length >= 2 && /^(pre-?seed|seed|series [a-e]\+?)$/i.test(f[0])) {
    const when = f[2] ? Date.parse("1 " + f[2]) : NaN;
    if (!isNaN(when) && now.getTime() - when < 300 * 864e5) return "Congrats on " + co + "'s " + f[0] + (f[1] && /^\$/.test(f[1]) ? " (" + f[1] + ")" : "");
  }
  let o = String(l.one_liner ?? "").replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  if (o.length >= 20) { if (o.length > 120) o = o.slice(0, 120).replace(/\s+\S*$/, ""); return "Saw what " + co + " is building: " + lowerFirst(o); }
  return null;
}
/** Lines for the lead-list email from a lead page's `leads` array: a proper company name and, for a job post, what they are hiring for. */
export function dropItems(leads: any[], max = 2): string[] {
  const out: string[] = [];
  for (const l of leads ?? []) {
    let name = String(l.opener ?? "").match(/\b(?:saw|noticed)\s+(.{2,40}?)\s+(?:is|are|just|has|raised|posted|announced|launched)\b/i)?.[1]?.trim() || String(l.company ?? "").trim();
    name = name.replace(/^that\s+/i, "");
    if (!name || name.length > 40) continue;
    const job = l.channel === "jobs" ? String(l.quote ?? "").match(/^(.{4,60}?)\s+at\s/i)?.[1]?.trim() : "";
    out.push((out.length + 1) + ". " + name + (job ? ", hiring " + (/^[aeiou]/i.test(job) ? "an " : "a ") + job : ""));
    if (out.length >= max) break;
  }
  return out;
}
export type Lead = { name: string; company: string; funding?: string; one_liner?: string; channel: string };
export type Drop = { n: number; items: string[] } | null;
export function buildDrafts(l: Lead, t: Templates = DEFAULT_TEMPLATES, now = new Date(), drop: Drop = null) {
  const co = cleanCompany(l.company), first = firstNameOf(l.name), usesFact = /\{fact\}/.test(t.e1), fact = usesFact ? factFor({ ...l, company: co }, now) : null;
  const ch = l.channel === "x" ? "X" : "LinkedIn", hasDrop = !!drop && drop.items.length >= 2 && drop.n >= 2;
  const fill = (s: string) => s.replace(/\{first\}/g, first || "there").replace(/\{company\}/g, co).replace(/\{fact\}/g, fact ?? "").replace(/\{n\}/g, String(drop?.n ?? "")).replace(/\{list\}/g, drop?.items.join("\n") ?? "")
    .replace(/\{channel_line\}/g, "Reyansh reached out on " + ch + "; figured email might be easier.");
  const subject = fill(t.subject).replace(/[^\x20-\x7e]/g, "").trim() || "Quick question";
  const full = (b: string) => b + "\n\n" + OPT_OUT + "\n\n" + SIGNATURE;
  let e1 = fill(t.e1); if (usesFact && !fact) e1 = e1.replace(/^(Hi [^\n]*,\n\n)\. /, "$1").replace(/\n\n\. /, "\n\n");
  const warnings: string[] = [];
  if (usesFact && !fact) warnings.push("No real fact about them in the CRM: add one before approving");
  if (!first) warnings.push("No usable first name");
  const out: Record<string, string> = { e1: full(e1), e2: full(fill(hasDrop ? t.e2 : t.e2_nodrop)) };
  for (const k of ["e3", "e4", "e5", "e6", "e7"] as const) out[k] = full(fill(t[k]));
  return { subject, ...out, fact: fact ?? "", warnings, has_drop: hasDrop } as { subject: string; e1: string; e2: string; e3: string; e4: string; e5: string; e6: string; e7: string; fact: string; warnings: string[]; has_drop: boolean };
}

// ───────── copy rules (the handoff's) ─────────
const BANNED = /\b(leverag\w*|unlock\w*|game-?changer\w*|elevat\w*|delv\w*|seamless\w*|robust\w*|synerg\w*|empower\w*)\b/i;
const words = (s: string) => (s.match(/\S+/g) ?? []).length;
export function stripSignature(b: string) { const i = b.lastIndexOf("\n\n" + SIGNATURE.split("\n")[0]); return i >= 0 ? b.slice(0, i) : b; }
export function lintEmail(step: number, body: string, firstTouch = ""): string[] {
  const p: string[] = [], core = body.replace(SIGNATURE, "");   // everything except the signature is checked, wherever it sits
  if (!body.trim().endsWith(SIGNATURE)) p.push("Signature is missing, changed, or not at the end");
  if (!core.includes(OPT_OUT)) p.push("Opt-out line is missing");
  if (words(core) > 90) p.push("Over 90 words (" + words(core) + ")");
  if (/[—–]/.test(body)) p.push("Has a dash (em or en)");
  if (/!/.test(body)) p.push("Has an exclamation mark");
  const b = body.match(BANNED); if (b) p.push('Banned word: "' + b[0] + '"');
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|io|ai|co|xyz|app)\b/i.test(core)) p.push("Has a link or domain (none allowed)");
  if (/\{[a-z_]+\}|\[[^\]]+\]/i.test(body)) p.push("Unfilled placeholder");
  if (!/^Hi [^\n,]+,\n/.test(body)) p.push("Should start with a greeting (Hi <name>,)");
  if (firstTouch && step === 1) {   // only the first email must differ from the LinkedIn/X message (the lead-list email deliberately echoes it)
    const w = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean), a = w(firstTouch), c = w(core);
    const grams = new Set<string>(); for (let i = 0; i + 8 <= a.length; i++) grams.add(a.slice(i, i + 8).join(" "));
    for (let i = 0; i + 8 <= c.length; i++) if (grams.has(c.slice(i, i + 8).join(" "))) { p.push("Repeats the LinkedIn/X message word for word"); break; }
  }
  return p;
}

// ───────── message building ─────────
export function qp(s: string): string {
  const out: string[] = [];
  for (const line of s.replace(/\r\n/g, "\n").split("\n")) {
    const bytes = enc.encode(line); let cur = "";
    const push = (t: string) => { if (cur.length + t.length > 75) { out.push(cur + "="); cur = ""; } cur += t; };
    bytes.forEach((c, i) => {
      const last = i === bytes.length - 1;
      if ((c >= 33 && c <= 126 && c !== 61) || ((c === 32 || c === 9) && !last)) push(String.fromCharCode(c));
      else push("=" + c.toString(16).toUpperCase().padStart(2, "0"));
    });
    out.push(cur);
  }
  return out.join("\r\n");
}
const rfcDate = (d: Date) => d.toUTCString().replace("GMT", "+0000");
const hdrAscii = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + btoa(String.fromCharCode(...enc.encode(s))) + "?=";
export type Msg = { from: string; fromName: string; to: string; toName?: string; subject: string; body: string; messageId: string; inReplyTo?: string; references?: string[]; date?: Date; unsubscribeMailto?: string };
export function buildMessage(m: Msg): string {
  const h = [
    "Date: " + rfcDate(m.date ?? new Date()),
    "From: " + hdrAscii(m.fromName) + " <" + m.from + ">",
    "To: " + (m.toName && /^[\x20-\x7e]*$/.test(m.toName) ? m.toName.replace(/[",<>]/g, "") + " " : "") + "<" + m.to + ">",
    "Subject: " + hdrAscii(m.subject),
    "Message-ID: " + m.messageId,
  ];
  if (m.inReplyTo) h.push("In-Reply-To: " + m.inReplyTo);
  if (m.references?.length) h.push("References: " + m.references.join(" "));
  if (m.unsubscribeMailto) h.push("List-Unsubscribe: <mailto:" + m.unsubscribeMailto + "?subject=unsubscribe>");
  h.push("MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: quoted-printable");
  return h.join("\r\n") + "\r\n\r\n" + qp(m.body) + "\r\n";
}
export const newMessageId = (domain: string) => "<" + crypto.randomUUID().replace(/-/g, "") + "@" + domain + ">";

// ───────── connections ─────────
export type Conn = { read(p: Uint8Array): Promise<number | null>; write(p: Uint8Array): Promise<number>; close(): void };
export type Connect = (host: string, port: number) => Promise<Conn>;
export const tlsConnect: Connect = async (hostname, port) => await Promise.race([Deno.connectTls({ hostname, port }) as Promise<Conn>, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("connect timeout")), 12000))]);

class Reader {
  buf = new Uint8Array(0);
  constructor(public conn: Conn, public ms = 25000) {}
  async fill() {
    const tmp = new Uint8Array(32768);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const n = await Promise.race([this.conn.read(tmp), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("read timeout")), this.ms); })]).finally(() => clearTimeout(timer));
    if (n === null) throw new Error("connection closed by the server");
    const nb = new Uint8Array(this.buf.length + n); nb.set(this.buf); nb.set(tmp.subarray(0, n), this.buf.length); this.buf = nb;
  }
  private crlf(): number { for (let i = 0; i + 1 < this.buf.length; i++) if (this.buf[i] === 13 && this.buf[i + 1] === 10) return i; return -1; }
  async line(): Promise<string> { for (;;) { const i = this.crlf(); if (i >= 0) { const l = dec.decode(this.buf.subarray(0, i)); this.buf = this.buf.subarray(i + 2); return l; } await this.fill(); } }
  async bytes(n: number): Promise<Uint8Array> { while (this.buf.length < n) await this.fill(); const o = this.buf.slice(0, n); this.buf = this.buf.subarray(n); return o; }
}
const send = (c: Conn, s: string) => c.write(enc.encode(s));

// ───────── SMTP ─────────
export type SmtpResult = { ok: boolean; stage: string; code?: number; response: string; permanent?: boolean };
/** dryRun = log in and ask the server to accept the recipient, then stop before any message is sent. */
export async function smtpSend(a: { user: string; pass: string; host?: string; port?: number; connect?: Connect }, m: Msg, dryRun = false): Promise<SmtpResult> {
  const conn = await (a.connect ?? tlsConnect)(a.host ?? "smtp.gmail.com", a.port ?? 465), r = new Reader(conn);
  const reply = async (): Promise<{ code: number; text: string }> => {
    let text = "", code = 0;
    for (;;) { const l = await r.line(); text += (text ? " | " : "") + l.slice(4); code = +l.slice(0, 3); if (l[3] !== "-") break; }
    return { code, text };
  };
  const step = async (stage: string, cmd: string | null, expect: number[]): Promise<SmtpResult | null> => {
    if (cmd !== null) await send(conn, cmd + "\r\n");
    const x = await reply();
    return expect.includes(x.code) ? null : { ok: false, stage, code: x.code, response: x.text.slice(0, 300), permanent: x.code >= 500 };
  };
  try {
    let f = await step("greeting", null, [220]); if (f) return f;
    f = await step("ehlo", "EHLO " + (m.from.split("@")[1] ?? "localhost"), [250]); if (f) return f;
    f = await step("auth", "AUTH PLAIN " + btoa("\0" + a.user + "\0" + a.pass), [235]); if (f) return { ...f, permanent: false };
    f = await step("mail from", "MAIL FROM:<" + m.from + ">", [250]); if (f) return f;
    f = await step("rcpt to", "RCPT TO:<" + m.to + ">", [250, 251]); if (f) return f;
    if (dryRun) { await send(conn, "RSET\r\n"); await reply().catch(() => {}); await send(conn, "QUIT\r\n"); return { ok: true, stage: "rcpt accepted (nothing sent)", response: "ok" }; }
    f = await step("data", "DATA", [354]); if (f) return f;
    const text = buildMessage(m).replace(/\r\n\./g, "\r\n..").replace(/^\./, "..");
    await send(conn, text + ".\r\n");
    const fin = await reply();
    if (fin.code !== 250) return { ok: false, stage: "message", code: fin.code, response: fin.text.slice(0, 300), permanent: fin.code >= 500 };
    await send(conn, "QUIT\r\n");
    return { ok: true, stage: "sent", code: 250, response: fin.text.slice(0, 200) };
  } catch (e) {
    return { ok: false, stage: "connection", response: String((e as Error).message ?? e).slice(0, 200) };
  } finally { try { conn.close(); } catch (_) { /* closed */ } }
}

// ───────── IMAP ─────────
export type ImapMsg = { uid: number; from: string; subject: string; inReplyTo: string; references: string; messageId: string; autoSubmitted: string; date: string; text: string };
export class Imap {
  r: Reader; n = 0;
  constructor(public conn: Conn) { this.r = new Reader(conn); }
  static async open(user: string, pass: string, connect: Connect = tlsConnect, host = "imap.gmail.com", port = 993): Promise<Imap> {
    const im = new Imap(await connect(host, port)); await im.r.line();   // greeting
    const x = await im.cmd("LOGIN " + q(user) + " " + q(pass));
    if (x.status !== "OK") { im.close(); throw new Error("IMAP login refused: " + x.text.slice(0, 120)); }
    return im;
  }
  /** One tagged command; returns the untagged lines (with any literals) and the final status. */
  async cmd(c: string): Promise<{ status: string; text: string; lines: { line: string; lits: { before: string; data: Uint8Array }[] }[] }> {
    const tag = "A" + String(++this.n).padStart(3, "0"); await send(this.conn, tag + " " + c + "\r\n");
    const lines: { line: string; lits: { before: string; data: Uint8Array }[] }[] = [];
    for (;;) {
      let line = await this.r.line(); const lits: { before: string; data: Uint8Array }[] = [];
      for (;;) { const m = line.match(/\{(\d+)\}$/); if (!m) break; const data = await this.r.bytes(+m[1]); lits.push({ before: line, data }); line += " " + await this.r.line(); }
      if (line.startsWith(tag + " ")) { const [, status, ...rest] = line.split(" "); return { status, text: rest.join(" "), lines }; }
      lines.push({ line, lits });
    }
  }
  async select(box = "INBOX"): Promise<{ uidnext: number; uidvalidity: number; exists: number }> {
    const x = await this.cmd("EXAMINE " + q(box));   // read-only: never marks anything as read
    if (x.status !== "OK") throw new Error("Couldn't open " + box + ": " + x.text);
    const all = x.lines.map((l) => l.line).join("\n");
    return { uidnext: +(all.match(/UIDNEXT (\d+)/)?.[1] ?? 0), uidvalidity: +(all.match(/UIDVALIDITY (\d+)/)?.[1] ?? 0), exists: +(all.match(/(\d+) EXISTS/)?.[1] ?? 0) };
  }
  async uidsAfter(last: number): Promise<number[]> {
    const x = await this.cmd("UID SEARCH UID " + (last + 1) + ":*");
    return (x.lines.find((l) => l.line.startsWith("* SEARCH"))?.line.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean).map(Number) ?? []).filter((u) => u > last);
  }
  async fetch(uids: number[]): Promise<ImapMsg[]> {
    if (!uids.length) return [];
    const x = await this.cmd("UID FETCH " + uids.join(",") + " (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT IN-REPLY-TO REFERENCES MESSAGE-ID AUTO-SUBMITTED DATE)] BODY.PEEK[TEXT]<0.3000>)");
    const out: ImapMsg[] = [];
    for (const l of x.lines) {
      if (!/ FETCH /.test(l.line)) continue;
      const uid = +(l.line.match(/UID (\d+)/)?.[1] ?? 0); if (!uid) continue;
      const head = dec.decode(l.lits.find((t) => /HEADER/i.test(t.before))?.data ?? new Uint8Array()), text = dec.decode(l.lits.find((t) => /TEXT/i.test(t.before))?.data ?? new Uint8Array());
      const hv = (n: string) => (head.replace(/\r?\n[ \t]+/g, " ").match(new RegExp("^" + n + ":[ \\t]*(.*)$", "im"))?.[1] ?? "").trim();
      out.push({ uid, from: hv("From"), subject: hv("Subject"), inReplyTo: hv("In-Reply-To"), references: hv("References"), messageId: hv("Message-ID"), autoSubmitted: hv("Auto-Submitted"), date: hv("Date"), text });
    }
    return out;
  }
  close() { try { this.conn.close(); } catch (_) { /* closed */ } }
}
const q = (s: string) => '"' + s.replace(/(["\\])/g, "\\$1") + '"';

// ───────── reading a message ─────────
export const addrOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from.match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? "").trim().toLowerCase();
export function decodeText(t: string): string {
  let s = t.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return s.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}
/** What the person actually wrote: no quoted history. */
export function replyOnly(t: string): string {
  const s = decodeText(t), cut = s.search(/\n\s*On .{2,120} wrote:|\n\s*-{2,} ?Original Message|\n\s*From:\s/i);
  return (cut > 0 ? s.slice(0, cut) : s).split("\n").filter((l) => !l.trim().startsWith(">")).join("\n").trim();
}
export type Kind = "bounce_hard" | "bounce_soft" | "auto_reply" | "reply";
export function classify(m: ImapMsg): Kind {
  const from = addrOf(m.from), subj = m.subject.toLowerCase(), body = decodeText(m.text).toLowerCase();
  if (/mailer-daemon|postmaster/.test(from) || /undeliver|delivery status notification|delivery has failed|failure notice|returned mail|mail delivery failed|address not found|couldn't be delivered|could not be delivered/.test(subj)) {
    const soft = /\b4\.\d\.\d\b|mailbox full|over quota|quota exceeded|try again later|temporar/.test(body) && !/\b5\.\d\.\d\b/.test(body);
    return soft ? "bounce_soft" : "bounce_hard";
  }
  if ((m.autoSubmitted && !/^no$/i.test(m.autoSubmitted)) || /^(auto:|automatic reply|out of office|autoreply|auto-reply|vacation)/.test(subj) || /^(no-?reply|noreply|donotreply)@/.test(from)) return "auto_reply";
  return "reply";
}
/** "no", "stop", "unsubscribe", "not interested", "remove me": add to do-not-contact. */
export const isOptOut = (reply: string) => /^\W*(no\b|nope\b|stop\b|unsubscribe\b|remove me|not interested|please remove|don'?t (email|contact)|do not (email|contact))/i.test(reply.trim()) || /\b(unsubscribe|remove me from|stop (emailing|contacting)|do not contact)\b/i.test(reply.slice(0, 300));
export function bouncedRecipients(m: ImapMsg): string[] {
  const t = decodeText(m.text), found = new Set<string>();
  for (const re of [/Final-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/gi, /(?:to|for|address(?:es)?|recipient)\s*:?\s*<?([A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[a-z]{2,})>?/gi, /<([A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[a-z]{2,})>/g])
    for (const x of t.matchAll(re)) found.add(x[1].toLowerCase().replace(/[.,;:)]+$/, ""));
  return [...found].filter((e) => !/mailer-daemon|postmaster|googlemail\.com$/.test(e));
}
