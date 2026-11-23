// Run: deno test --allow-net supabase/functions/email-bot/mail.test.ts
// Everything here runs against local fake servers. Nothing is sent anywhere.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import * as M from "./mail.ts";

const lead = { name: "Priya Shah", company: "Ledgerly", funding: "Seed · $2M · Oct 2026", one_liner: "Payments software for small credit unions.", channel: "linkedin" };
const drop = { n: 7, items: ["1. AtriCure, hiring an Accounts Payable Specialist", "2. DV Trading, hiring an Accounts Payable Specialist"] };
const TOUCH = "Hope you liked the post I tagged you in. Was researching Ledgerly and found a few companies looking for what you sell right now. Put them on one page for you, happy to send it over :)";
const KEYS = ["e1", "e2", "e3", "e4", "e5", "e6", "e7"] as const;

Deno.test("all seven emails follow the handoff's copy rules", () => {
  const d = M.buildDrafts(lead, M.DEFAULT_TEMPLATES, new Date("2026-11-23"), drop);
  KEYS.forEach((k, i) => assertEquals(M.lintEmail(i + 1, d[k], TOUCH), [], k));
  assertEquals(d.has_drop, true); assertEquals(d.warnings, []);
  assertStringIncludes(d.e1, "Hi Priya,"); assertStringIncludes(d.e1, "My name is Emily and I work with Reyansh Juneja at SOVE7GN");
  assertStringIncludes(d.e1, "10+ founders"); assertStringIncludes(d.e1, "more than 30 enterprise sales calls in 2 weeks"); assertStringIncludes(d.e1, "Let's talk?");
  assertStringIncludes(d.e2, "found 7 companies"); assertStringIncludes(d.e2, "1. AtriCure, hiring an Accounts Payable Specialist\n2. DV Trading"); assertStringIncludes(d.e2, "Let me know if you want the full list.");
  assertStringIncludes(d.e3, "Curious: if you could fix one thing this quarter");
  assertStringIncludes(d.e4, "Speed to lead"); assertStringIncludes(d.e4, "Be everywhere");
  for (const k of KEYS) { assertStringIncludes(d[k], M.OPT_OUT); assert(d[k].endsWith(M.SIGNATURE)); }
  assertEquals(d.subject, "Sales calls for Ledgerly");
  assert(!/https?:|www\.|sove7gn\.org|gtm\./i.test(KEYS.map((k) => d[k]).join(" ")), "no link or domain anywhere");
});
Deno.test("without a ready lead page, email 2 is the no-list version (never an empty list)", () => {
  for (const nodrop of [null, { n: 1, items: ["1. A"] }, { n: 7, items: [] }]) {
    const d = M.buildDrafts(lead, M.DEFAULT_TEMPLATES, new Date("2026-11-23"), nodrop);
    assertEquals(d.has_drop, false); assertStringIncludes(d.e2, "Quick follow up on my note"); assert(!/\{|found \d+ companies/.test(d.e2)); assertEquals(M.lintEmail(2, d.e2, TOUCH), []);
  }
});
Deno.test("every email is under 90 words and the opt-out and signature are always there", () => {
  const d = M.buildDrafts({ ...lead, company: "A Rather Long Company Name Incorporated" }, M.DEFAULT_TEMPLATES, new Date(), drop);
  KEYS.forEach((k, i) => assert(M.lintEmail(i + 1, d[k]).length === 0, k));
});
Deno.test("lead page companies become clean list lines", () => {
  const leads = [
    { company: "Atricure", opener: "Judd, saw AtriCure is hiring an Accounts Payable Specialist. Growing AP teams...", channel: "jobs", quote: "Accounts Payable Specialist at Atricure" },
    { company: "Dvtrading", opener: "James, saw DV Trading is hiring a Procurement Lead. Many firms...", channel: "jobs", quote: "Procurement Lead at Dvtrading" },
    { company: "Third", opener: "x", channel: "post", quote: "" }];
  assertEquals(M.dropItems(leads), ["1. AtriCure, hiring an Accounts Payable Specialist", "2. DV Trading, hiring a Procurement Lead"]);
  assertEquals(M.dropItems([{ company: "Northpass", opener: "", channel: "post", quote: "" }, { company: "Corelane", opener: "", channel: "post" }]), ["1. Northpass", "2. Corelane"]);
  assertEquals(M.dropItems([]), []);
  assertEquals(M.dropItems([{ company: "Mecka.ai", opener: "", channel: "post" }, { company: "Verne", opener: "", channel: "post" }]), ["1. Mecka", "2. Verne"]);
});
Deno.test("a template with {fact} uses a real fact, falls back to what they build, and flags a missing one", () => {
  const T = { ...M.DEFAULT_TEMPLATES, e1: "Hi {first},\n\n{fact}. {channel_line}\n\nWorth a call?" };
  const a = M.buildDrafts(lead, T, new Date("2026-11-23")); assertStringIncludes(a.e1, "Congrats on Ledgerly's Seed ($2M)"); assertStringIncludes(a.e1, "Reyansh reached out on LinkedIn; figured email might be easier.");
  assertStringIncludes(M.buildDrafts({ ...lead, funding: "Seed · $2M · Jan 2025" }, T, new Date("2026-11-23")).e1, "Saw what Ledgerly is building: payments software");
  assertStringIncludes(M.buildDrafts({ ...lead, funding: "", company: "Workmagic.io", one_liner: "AI marketing platform automating outreach" }, T).e1, "Saw what Workmagic is building: AI marketing platform");
  const none = M.buildDrafts({ ...lead, funding: "", one_liner: "" }, T); assert(none.warnings.some((w) => /No real fact/.test(w))); assert(!/\{fact\}|\. \./.test(none.e1));
  assertEquals(M.buildDrafts({ ...lead, funding: "", one_liner: "" }).warnings, [], "the default template needs no fact");
});
Deno.test("lint catches every banned thing", () => {
  const ok = M.buildDrafts(lead, M.DEFAULT_TEMPLATES, new Date(), drop).e1;
  assert(M.lintEmail(1, ok.replace("Let's talk?", "Let's talk — now?")).some((p) => /dash/.test(p)));
  assert(M.lintEmail(1, ok.replace("Let's talk?", "Let's talk!")).some((p) => /exclamation/.test(p)));
  assert(M.lintEmail(1, ok.replace("growth studio", "leveraging studio")).some((p) => /Banned/.test(p)));
  assert(M.lintEmail(1, ok + "\nsee sove7gn.org").some((p) => /link/.test(p)));
  assert(M.lintEmail(1, ok.replace("My name", "Visit gtm.sove7gn.org. My name")).some((p) => /link/.test(p)));
  assert(M.lintEmail(1, ok.replace(M.SIGNATURE, "Emily")).some((p) => /Signature/.test(p)));
  assert(M.lintEmail(1, ok.replace(M.OPT_OUT, "")).some((p) => /Opt-out/.test(p)));
  assert(M.lintEmail(1, ok.replace("Hi Priya,", "Hi {first},")).some((p) => /placeholder/.test(p)));
  assert(M.lintEmail(1, ok.replace("Let's talk?", "word ".repeat(80))).some((p) => /Over 90/.test(p)));
  assert(M.lintEmail(1, ok, "We are a growth studio for seed to Series C founders: we scale their social media and more").some((p) => /word for word/.test(p)));
  assertEquals(M.lintEmail(2, ok, "We are a growth studio for seed to Series C founders: we scale their social media"), [], "only email 1 is compared with the first touch");
});
Deno.test("address rules", () => {
  assert(M.isFreeMail("kaushikg3333@gmail.com")); assert(!M.isFreeMail("tarun@gauntlet.xyz"));
  assert(M.isRole("info@acme.com")); assert(M.isRole("Sales@acme.com")); assert(!M.isRole("jane@acme.com"));
  assert(M.emailOk("a.b+c@acme.co")); assert(!M.emailOk("not an email"));
  assertEquals(M.companyKey("Ledgerly, Inc."), M.companyKey("ledgerly")); assertEquals(M.firstNameOf("Dr. Jason Cornelius, PhD"), "Jason"); assertEquals(M.firstNameOf("🚀"), "");
});
Deno.test("windows and business days are in the prospect's time zone", () => {
  const H = ["2026-11-26", "2026-11-27"], ny = "America/New_York";
  assert(M.inWindow(new Date("2026-11-23T15:00:00Z"), ny, 8, 17, H));      // Mon 10:00 NY
  assert(!M.inWindow(new Date("2026-11-23T11:00:00Z"), ny, 8, 17, H));     // Mon 06:00 NY
  assert(!M.inWindow(new Date("2026-11-28T16:00:00Z"), ny, 8, 17, H));     // Saturday
  assert(!M.inWindow(new Date("2026-11-26T16:00:00Z"), ny, 8, 17, H));     // Thanksgiving
  assert(M.inWindow(new Date("2026-11-23T18:00:00Z"), "America/Los_Angeles", 8, 17, H));   // Mon 10:00 PT
  assert(M.inWindow(new Date("2026-11-24T00:30:00Z"), "America/Los_Angeles", 8, 17, H));   // Mon 16:30 PT, still open
  assert(!M.inWindow(new Date("2026-11-24T02:00:00Z"), "America/Los_Angeles", 8, 17, H));  // Mon 18:00 PT, closed
});
Deno.test("day 3 and day 7 skip weekends and Thanksgiving", () => {
  const H = ["2026-11-26", "2026-11-27"], t0 = new Date("2026-11-23T15:00:00Z"), ny = "America/New_York";   // Monday
  assertEquals(M.localParts(M.addBusinessDays(t0, 3, ny, H), ny).date, "2026-11-30");          // Tue, Wed, then Thu/Fri are holidays, Sat/Sun: Mon 30th is the 3rd
  assertEquals(M.localParts(M.addBusinessDays(new Date("2026-11-19T15:00:00Z"), 3, ny, H), ny).date, "2026-11-24");   // Thu 19 -> Fri 20 (1), Mon 23 (2), Tue 24 (3)
});

Deno.test("message headers, threading and quoted-printable", () => {
  const msg = M.buildMessage({ from: "emily@getsove7gn.com", fromName: "Emily Jones", to: "priya@ledgerly.com", toName: "Priya Shah", subject: "Re: Sales calls for Ledgerly", body: "Hi Priya,\n\nCafé = ok. " + "long ".repeat(30) + "\n.dot line", messageId: "<abc@getsove7gn.com>", inReplyTo: "<first@getsove7gn.com>", references: ["<first@getsove7gn.com>"], date: new Date("2026-11-23T15:00:00Z"), unsubscribeMailto: "emily@getsove7gn.com" });
  for (const h of ["From: Emily Jones <emily@getsove7gn.com>", "To: Priya Shah <priya@ledgerly.com>", "Subject: Re: Sales calls for Ledgerly", "Message-ID: <abc@getsove7gn.com>", "In-Reply-To: <first@getsove7gn.com>", "References: <first@getsove7gn.com>", "Content-Transfer-Encoding: quoted-printable", "List-Unsubscribe: <mailto:emily@getsove7gn.com?subject=unsubscribe>", "Date: Mon, 23 Nov 2026 15:00:00 +0000"]) assertStringIncludes(msg, h);
  assertStringIncludes(msg, "Caf=C3=A9 =3D ok.");
  for (const line of msg.split("\r\n")) assert(line.length <= 78, "line too long: " + line.length);
});

// A fake SMTP server so the whole conversation, including the dot-stuffing, is tested without sending anything.
async function fakeSmtp(opts: { rejectRcpt?: boolean; badAuth?: boolean }) {
  const listener = Deno.listen({ port: 0 }), port = (listener.addr as Deno.NetAddr).port, seen: string[] = []; let data = "";
  (async () => {
    const c = await listener.accept(), w = (s: string) => c.write(M.enc.encode(s + "\r\n")); await w("220 fake ESMTP");
    let buf = "", inData = false; const b = new Uint8Array(8192);
    for (;;) {
      const n = await c.read(b); if (n === null) break; buf += M.dec.decode(b.subarray(0, n));
      while (true) {
        if (inData) { const i = buf.indexOf("\r\n.\r\n"); if (i < 0) break; data = buf.slice(0, i + 2); buf = buf.slice(i + 5); inData = false; await w("250 2.0.0 OK queued as FAKE123"); continue; }
        const i = buf.indexOf("\r\n"); if (i < 0) break; const line = buf.slice(0, i); buf = buf.slice(i + 2); seen.push(line.startsWith("AUTH") ? "AUTH ***" : line);
        if (line.startsWith("EHLO")) await w("250-fake\r\n250 AUTH PLAIN"); else if (line.startsWith("AUTH")) await w(opts.badAuth ? "535 5.7.8 bad credentials" : "235 2.7.0 Accepted");
        else if (line.startsWith("MAIL")) await w("250 OK"); else if (line.startsWith("RCPT")) await w(opts.rejectRcpt ? "550 5.1.1 no such user" : "250 OK");
        else if (line === "DATA") { await w("354 go"); inData = true; } else if (line === "RSET") await w("250 OK"); else if (line === "QUIT") { await w("221 bye"); c.close(); return; }
      }
    }
  })();
  return { port, seen, data: () => data, close: () => listener.close() };
}
const connectLocal = (port: number): M.Connect => async () => await Deno.connect({ hostname: "127.0.0.1", port }) as unknown as M.Conn;
const sample: M.Msg = { from: "emily@getsove7gn.com", fromName: "Emily Jones", to: "priya@ledgerly.com", subject: "Sales calls for Ledgerly", body: "Hi Priya,\n\n.leading dot\nend", messageId: "<m1@getsove7gn.com>" };

Deno.test("SMTP: a full send, dot-stuffed", async () => {
  const s = await fakeSmtp({}); const r = await M.smtpSend({ user: "emily@getsove7gn.com", pass: "x", connect: connectLocal(s.port) }, sample);
  assertEquals(r.ok, true); assertEquals(r.stage, "sent"); assertStringIncludes(r.response, "FAKE123");
  assertEquals(s.seen.slice(0, 5), ["EHLO getsove7gn.com", "AUTH ***", "MAIL FROM:<emily@getsove7gn.com>", "RCPT TO:<priya@ledgerly.com>", "DATA"]);
  assertStringIncludes(s.data(), "\r\n..leading dot"); assertStringIncludes(s.data(), "Message-ID: <m1@getsove7gn.com>"); s.close();
});
Deno.test("SMTP: dry run stops before any message", async () => {
  const s = await fakeSmtp({}); const r = await M.smtpSend({ user: "u", pass: "x", connect: connectLocal(s.port) }, sample, true);
  assertEquals(r.ok, true); assert(!s.seen.includes("DATA")); assertEquals(s.data(), ""); s.close();
});
Deno.test("SMTP: a refused recipient is permanent, bad login is not", async () => {
  let s = await fakeSmtp({ rejectRcpt: true }); let r = await M.smtpSend({ user: "u", pass: "x", connect: connectLocal(s.port) }, sample);
  assertEquals(r.ok, false); assertEquals(r.stage, "rcpt to"); assertEquals(r.permanent, true); s.close();
  s = await fakeSmtp({ badAuth: true }); r = await M.smtpSend({ user: "u", pass: "x", connect: connectLocal(s.port) }, sample);
  assertEquals(r.stage, "auth"); assertEquals(r.permanent, false); s.close();
});

// A fake IMAP server speaking just enough: LOGIN, EXAMINE, UID SEARCH, UID FETCH with literals.
Deno.test("IMAP: read-only select, new-message search, literal fetch", async () => {
  const listener = Deno.listen({ port: 0 }), port = (listener.addr as Deno.NetAddr).port, cmds: string[] = [];
  const head = "From: Priya Shah <priya@ledgerly.com>\r\nSubject: Re: Sales calls for Ledgerly\r\nIn-Reply-To: <m1@getsove7gn.com>\r\nMessage-ID: <r1@ledgerly.com>\r\n\r\n", text = "no thanks, please stop\r\n\r\nOn Mon, Nov 23, 2026 at 10:00 AM Emily Jones <emily@getsove7gn.com> wrote:\r\n> Hi Priya";
  (async () => {
    const c = await listener.accept(), w = (s: string) => c.write(M.enc.encode(s)); await w("* OK ready\r\n"); const b = new Uint8Array(4096);
    for (;;) {
      const n = await c.read(b); if (n === null) break; for (const line of M.dec.decode(b.subarray(0, n)).split("\r\n").filter(Boolean)) {
        const [tag, ...rest] = line.split(" "), cmd = rest.join(" "); cmds.push(cmd.startsWith("LOGIN") ? "LOGIN ***" : cmd);
        if (cmd.startsWith("LOGIN")) await w(tag + " OK logged in\r\n");
        else if (cmd.startsWith("EXAMINE")) await w("* 3 EXISTS\r\n* OK [UIDVALIDITY 777] ok\r\n* OK [UIDNEXT 42] next\r\n" + tag + " OK [READ-ONLY] done\r\n");
        else if (cmd.startsWith("UID SEARCH")) await w("* SEARCH 40 41\r\n" + tag + " OK done\r\n");
        else if (cmd.startsWith("UID FETCH")) await w("* 1 FETCH (UID 41 BODY[HEADER.FIELDS (FROM SUBJECT)] {" + head.length + "}\r\n" + head + " BODY[TEXT]<0> {" + text.length + "}\r\n" + text + ")\r\n" + tag + " OK done\r\n");
        else if (cmd.startsWith("LOGOUT")) { await w("* BYE\r\n" + tag + " OK\r\n"); c.close(); return; }
      }
    }
  })();
  const im = await M.Imap.open("emily@getsove7gn.com", "pw", connectLocal(port)), sel = await im.select();
  assertEquals(sel, { uidnext: 42, uidvalidity: 777, exists: 3 });
  assertEquals(await im.uidsAfter(40), [41]);       // 40 is dropped: IMAP's "n:*" always includes the newest message
  const [m] = await im.fetch([41]); im.close(); listener.close();
  assertEquals(m.uid, 41); assertEquals(M.addrOf(m.from), "priya@ledgerly.com"); assertEquals(m.inReplyTo, "<m1@getsove7gn.com>");
  assertEquals(M.classify(m), "reply"); assertEquals(M.replyOnly(m.text), "no thanks, please stop"); assert(M.isOptOut(M.replyOnly(m.text)));
  assert(cmds.some((c) => c.startsWith("EXAMINE")) && !cmds.some((c) => /^SELECT/.test(c)), "must be read-only");
});

Deno.test("classifying bounces, auto replies and real replies", () => {
  const base = { uid: 1, from: "", subject: "", inReplyTo: "", references: "", messageId: "", autoSubmitted: "", date: "", text: "" };
  assertEquals(M.classify({ ...base, from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", text: "Final-Recipient: rfc822; jane@acme.com\r\nStatus: 5.1.1\r\n550 5.1.1 user unknown" }), "bounce_hard");
  assertEquals(M.classify({ ...base, from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Delay)", text: "Status: 4.2.2 mailbox full, try again later" }), "bounce_soft");
  assertEquals(M.bouncedRecipients({ ...base, text: "Final-Recipient: rfc822; jane@acme.com\r\nAction: failed" }), ["jane@acme.com"]);
  assertEquals(M.classify({ ...base, from: "jane@acme.com", subject: "Out of office until Dec 1" }), "auto_reply");
  assertEquals(M.classify({ ...base, from: "jane@acme.com", subject: "Re: hi", autoSubmitted: "auto-replied" }), "auto_reply");
  assertEquals(M.classify({ ...base, from: "jane@acme.com", subject: "Re: hi", text: "Sure, send it over" }), "reply");
  for (const t of ["no", "No thanks", "stop", "Unsubscribe", "not interested", "Please remove me"]) assert(M.isOptOut(t), t);
  assert(!M.isOptOut("Not right now, but send it over next quarter")); assert(!M.isOptOut("Sure, tell me more"));
});
