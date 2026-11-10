// Everything the bot does on LinkedIn, run inside a linkedin.com tab (so it's your own signed-in session, same as clicking).
// liOp is injected with chrome.scripting.executeScript, so it must not use anything from outside its own body.
// It uses the same internal endpoints LinkedIn's web app calls. If LinkedIn changes one, only this file needs fixing.
export async function liOp(op, a = {}) {
  const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)/) || [])[1] || "";
  const H = { "csrf-token": csrf, "x-restli-protocol-version": "2.0.0", "x-li-lang": "en_US", accept: "application/vnd.linkedin.normalized+json+2.1" };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (lo, hi) => sleep(lo + Math.random() * (hi - lo));
  async function get(path) {
    const r = await fetch("/voyager/api/" + path, { headers: H, credentials: "include" });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error("signed out (" + r.status + ")"), { code: r.status });
    if (!r.ok) throw Object.assign(new Error("GET " + path.split("?")[0] + " answered " + r.status), { code: r.status });
    return r.json();
  }
  async function post(path, body) {
    const r = await fetch("/voyager/api/" + path, { method: "POST", headers: { ...H, "content-type": "application/json; charset=UTF-8" }, credentials: "include", body: JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
    return { status: r.status, ok: r.ok, json: j, text: t.slice(0, 400) };
  }
  const inc = (j) => (j && j.included) || [];
  const acoa = (s) => (String(s || "").match(/ACoA[\w-]{10,}/) || [])[0] || "";
  const vanity = (s) => { const m = String(s || "").match(/\/in\/([^/?#]+)/); return m && !/^ACoA/.test(m[1]) ? decodeURIComponent(m[1]) : ""; };
  const txt = (x) => (x && typeof x === "object" ? x.text || "" : x || "");

  async function me() {
    if (!csrf) return { signed_in: false };
    try {
      const j = await get("me");
      const mini = inc(j).find((x) => x.publicIdentifier) || {};
      const urn = acoa(mini.dashEntityUrn || mini.entityUrn || (j.data && j.data["*miniProfile"]));
      return { signed_in: !!urn, urn, pid: mini.publicIdentifier || "", name: [mini.firstName, mini.lastName].filter(Boolean).join(" ") };
    } catch (e) { return { signed_in: false, error: String(e.message) }; }
  }

  // A person's member id (ACoA...), vanity name, connection and contact email.
  async function lookup(x) {
    let urn = x.urn || acoa(x.profile), pid = x.pid || vanity(x.profile), connected = false, email = "", name = "";
    if (!urn || !pid) {
      // Their profile page always carries both.
      const r = await fetch("/in/" + encodeURIComponent(pid || urn) + "/", { credentials: "include" });
      const html = await r.text();
      if (!pid) pid = vanity(r.url) || (html.match(/"publicIdentifier":"([^"]+)"/) || [])[1] || "";
      if (!urn) urn = (html.match(/urn:li:fsd_profile:(ACoA[\w-]+)/) || [])[1] || "";
    }
    try {
      const j = await get("identity/dash/profiles?q=memberIdentity&memberIdentity=" + encodeURIComponent(pid || urn) +
        "&decorationId=com.linkedin.voyager.dash.deco.identity.profile.TopCardSupplementary-120");
      const p = inc(j).find((e) => acoa(e.entityUrn) && e.publicIdentifier) || {};
      if (!urn) urn = acoa(p.entityUrn); if (!pid) pid = p.publicIdentifier || "";
      name = [p.firstName, p.lastName].filter(Boolean).join(" ");
      const rel = inc(j).find((e) => /MemberRelationship/.test(e.$type || "") && String(e.entityUrn || "").includes(urn));
      if (rel) connected = !!(rel.memberRelationship && rel.memberRelationship.connection) || !!(rel.memberRelationshipUnion && rel.memberRelationshipUnion.connection);
    } catch (_) {}
    if (x.want_email !== false) {
      try {
        const c = await get("identity/profiles/" + encodeURIComponent(pid || urn) + "/profileContactInfo");
        email = (c.data && c.data.emailAddress) || "";
        if (email || (c.data && (c.data.phoneNumbers || c.data.websites))) connected = connected || !!email;
      } catch (_) {}
    }
    return { urn, pid, connected, email, name };
  }

  // Our posts from the last N days, with everyone who reacted or commented, in the shape social-sync expects.
  async function engagers(x) {
    const out = [], since = Date.now() - (x.days || 30) * 86400e3;
    let posts = [];
    try {
      const j = await get("identity/profileUpdatesV2?count=20&includeLongTermHistory=true&moduleKey=member-shares%3Aphone&numComments=0&q=memberShareFeed&start=0&profileUrn=" +
        encodeURIComponent("urn:li:fsd_profile:" + x.me.urn));
      for (const u of inc(j)) {
        const urn = (u.updateMetadata && u.updateMetadata.urn) || (u.metadata && u.metadata.backendUrn) || "";
        const act = (String(urn).match(/urn:li:activity:(\d+)/) || [])[1];
        if (!act || posts.some((p) => p.id === act)) continue;
        if (u.header || (u.resharedUpdate && !u.commentary)) continue;              // reposts of other people's posts
        const at = Number(BigInt(act) >> 22n);                                        // the id holds the post time
        if (at < since) continue;
        posts.push({ id: act, content: txt(u.commentary && u.commentary.text), at });
      }
    } catch (e) { out.err = String(e.message); }
    for (const id of x.extra_posts || []) if (!posts.some((p) => p.id === id)) { const at = Number(BigInt(id) >> 22n); if (at >= since) posts.push({ id, content: "", at }); }
    for (const p of posts) {
      const counts = { likes: 0, comments: 0 };
      // Reactions (all types), 100 at a time.
      for (let start = 0; start < 1000; start += 100) {
        let j; try { j = await get("voyagerSocialDashReactions?decorationId=com.linkedin.voyager.dash.deco.social.ReactionsByTypeWithProfileActions-13&count=100&q=reactionType&start=" + start +
          "&threadUrn=" + encodeURIComponent("urn:li:activity:" + p.id)); } catch (e) { out.err = String(e.message); break; }
        const rs = inc(j).filter((e) => /Reaction$/.test(e.$type || "") && e.reactorLockup);
        for (const r of rs) {
          const L = r.reactorLockup, link = L.navigationUrl || "";
          const id = acoa(r.actorUrn || link || (r.preDashEntityUrn || ""));
          if (!id) continue;
          out.push({ type: "reaction", postId: p.id, reactionType: r.reactionType || "LIKE",
            actor: { id, linkedinUrl: link.split("?")[0] || "https://www.linkedin.com/in/" + id, name: txt(L.title), position: txt(L.subtitle) } });
          counts.likes++;
        }
        if (rs.length < 100) break;
        await jitter(800, 1600);
      }
      // Comments (LinkedIn retired feed/comments in 2026; see commentsOf).
      const cm = await commentsOf(p.id, x.cqid);
      if (cm.err) out.err = cm.err;
      out.via = cm.via;
      for (const c of cm.list) {
        if (c.id === x.me.urn || (x.me.pid && c.pid === x.me.pid)) continue;
        out.push({ type: "comment", postId: p.id, commentary: c.text, createdAt: c.at,
          actor: { id: c.id || c.pid, linkedinUrl: "https://www.linkedin.com/in/" + (c.pid || c.id), name: c.name, position: c.headline } });
        counts.comments++;
      }
      out.push({ type: "post", id: p.id, linkedinUrl: "https://www.linkedin.com/feed/update/urn:li:activity:" + p.id + "/", content: p.content,
        postedAt: { date: new Date(p.at).toISOString() }, engagement: counts,
        author: { id: x.me.urn, linkedinUrl: "https://www.linkedin.com/in/" + x.me.pid, name: x.me.name, publicIdentifier: x.me.pid } });
      await jitter(1200, 2500);
    }
    return { items: out, posts: posts.length, err: out.err || "" };
  }

  // Comments on one post: LinkedIn's web app now uses voyagerSocialDashComments, either as GraphQL (query id learned from a
  // post page, cqid) or as a plain finder. Tries each and uses the first one LinkedIn answers.
  async function commentsOf(postId, cqid) {
    const enc = (v) => encodeURIComponent(v).replace(/\(/g, "%28").replace(/\)/g, "%29");
    const act = "urn:li:activity:" + postId;
    const sd = "urn:li:fsd_socialDetail:(" + act + "," + act + ",urn:li:highlightedReply:-)";
    const tries = [];
    if (cqid) tries.push({ via: "graphql", url: (st) => "graphql?includeWebMetadata=true&variables=(count:100,numReplies:0,socialDetailUrn:" + enc(sd) + ",sortOrder:RELEVANCE,start:" + st + ")&queryId=" + cqid });
    tries.push({ via: "finder", url: (st) => "voyagerSocialDashComments?count=100&numReplies=0&q=comments&socialDetailUrn=" + enc(sd) + "&sortOrder=RELEVANCE&start=" + st });
    let err = "";
    for (const t of tries) {
      const list = [], seen = new Set();
      try {
        for (let st = 0; st < 500; st += 100) {
          const j = await get(t.url(st));
          const cs = inc(j).filter((e) => /\.Comment$/.test(e.$type || ""));
          const profs = new Map(inc(j).filter((e) => e.publicIdentifier).map((q) => [acoa(q.entityUrn), q]));
          for (const c of cs) {
            if (seen.has(c.entityUrn)) continue; seen.add(c.entityUrn);
            const who = c.commenter || {};
            const id = acoa(JSON.stringify([who.actor, who.actorUnion, who.commenterProfileId, who.navigationUrl, who.image]));
            const prof = profs.get(id) || {};
            const pid = prof.publicIdentifier || vanity(who.navigationUrl);
            if (!id && !pid) continue;
            list.push({ id, pid, name: txt(who.title) || [prof.firstName, prof.lastName].filter(Boolean).join(" "), headline: txt(who.subtitle) || prof.headline || "",
              text: txt(c.commentary), at: c.createdAt ? new Date(c.createdAt).toISOString() : null });
          }
          if (cs.length < 100) break;
          await jitter(800, 1600);
        }
        return { list, via: t.via, err: "" };
      } catch (e) { err = t.via + ": " + String(e.message || e); }
    }
    return { list: [], via: "", err: err || "no way to read comments" };
  }

  // Our newest post's id (to open its page once and learn the comments query id).
  async function latestPost(x) {
    try {
      const j = await get("identity/profileUpdatesV2?count=5&includeLongTermHistory=true&moduleKey=member-shares%3Aphone&numComments=0&q=memberShareFeed&start=0&profileUrn=" + encodeURIComponent("urn:li:fsd_profile:" + x.me.urn));
      return { id: ((JSON.stringify(j).match(/urn:li:activity:(\d+)/) || [])[1]) || "" };
    } catch (e) { return { id: "", err: String(e.message) }; }
  }

  // Who connected with us recently.
  async function connections() {
    const out = [];
    const j = await get("relationships/dash/connections?decorationId=com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-16&count=80&q=search&sortType=RECENTLY_ADDED&start=0");
    const profs = new Map(inc(j).filter((e) => e.publicIdentifier).map((p) => [acoa(p.entityUrn), p]));
    for (const c of inc(j).filter((e) => /Connection$/.test(e.$type || ""))) {
      const id = acoa(c.connectedMember || c["*connectedMemberResolutionResult"] || c.entityUrn);
      if (!id) continue;
      const p = profs.get(id) || {};
      out.push({ urn: id, pid: p.publicIdentifier || "", name: [p.firstName, p.lastName].filter(Boolean).join(" "), at: c.createdAt ? new Date(c.createdAt).toISOString() : null });
    }
    return out;
  }

  // Our latest DM threads: when the other person last wrote, and when we did.
  async function threads(x) {
    if (!x.qid) return { need_qid: true };
    const vars = "(mailboxUrn:" + encodeURIComponent("urn:li:fsd_profile:" + x.me.urn) + ")";
    const r = await fetch("/voyager/api/voyagerMessagingGraphQL/graphql?queryId=" + x.qid + "&variables=" + vars,
      { headers: { ...H, accept: "application/graphql" }, credentials: "include" });
    if (r.status === 400 || r.status === 404) return { need_qid: true };
    if (!r.ok) throw new Error("messaging answered " + r.status);
    const j = await r.json();
    // Walk the answer: every message with a sender, a time and a conversation.
    const convs = new Map();
    const walk = (o, conv) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach((v) => walk(v, conv)); return; }
      const cu = typeof o.entityUrn === "string" && o.entityUrn.startsWith("urn:li:msg_conversation:") ? o.entityUrn : conv;
      if (cu && cu !== conv) {
        const people = JSON.stringify(o.conversationParticipants || []).match(/ACoA[\w-]{10,}/g) || [];
        const c = convs.get(cu) || { people: new Set(), msgs: [] };
        people.forEach((p) => c.people.add(p)); convs.set(cu, c);
      }
      if (o.deliveredAt && o.sender && o.body) {
        const from = acoa(JSON.stringify(o.sender.hostIdentityUrn || o.sender.entityUrn || o.sender));
        const c = convs.get(cu) || { people: new Set(), msgs: [] }; convs.set(cu, c);
        c.msgs.push({ from, at: o.deliveredAt, text: txt(o.body) });
      }
      for (const k in o) if (k !== "body") walk(o[k], cu);
    };
    walk(j.data || j, "");
    const out = [];
    for (const c of convs.values()) {
      const them = [...c.people].find((p) => p !== x.me.urn);
      if (!them || c.people.size > 2) continue;                                   // skip group chats
      const mine = c.msgs.filter((m) => m.from === x.me.urn).sort((p, q) => q.at - p.at)[0];
      const theirs = c.msgs.filter((m) => m.from === them).sort((p, q) => q.at - p.at)[0];
      out.push({ urn: them, them_at: theirs ? new Date(theirs.at).toISOString() : null, them_text: theirs ? theirs.text.slice(0, 600) : "",
        me_at: mine ? new Date(mine.at).toISOString() : null });
    }
    return { threads: out };
  }

  // Finds the current messaging query id from the requests the messaging page made (call after opening /messaging/).
  function findQid() {
    const urls = performance.getEntriesByType("resource").map((e) => e.name);
    const q = urls.map((u) => (u.match(/queryId=(messengerConversations\.[0-9a-f]+)/) || [])[1]).find(Boolean);
    const all = [...new Set(urls.map((u) => (u.match(/queryId=(\w+\.[0-9a-f]+)/) || [])[1]).filter(Boolean))];
    return { qid: q || "", qids: all.slice(0, 30) };
  }

  async function invite(x) {
    const body = { invitee: { inviteeUnion: { memberProfile: "urn:li:fsd_profile:" + x.urn } } };
    if (x.text) body.customMessage = x.text;
    const r = await post("voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2", body);
    if (r.ok) return { ok: true };
    const t = r.text || "";
    if (/CANT_RESEND_YET|already.*invit|INVITATION_ALREADY|pending/i.test(t)) return { already: "pending" };
    if (/already.*connect|FIRST_DEGREE|ALREADY_CONNECTED/i.test(t)) return { already: "connected" };
    if (/WEEKLY_LIMIT|weekly|quota|limit/i.test(t)) return { ok: false, error: "LinkedIn's weekly invitation limit reached", limit: true };
    return { ok: false, error: "LinkedIn answered " + r.status + ": " + t.slice(0, 200) };
  }

  async function message(x) {
    const rand = new Uint8Array(16); crypto.getRandomValues(rand);
    const body = { message: { body: { attributes: [], text: x.text }, renderContentUnions: [], originToken: crypto.randomUUID() },
      mailboxUrn: "urn:li:fsd_profile:" + x.me.urn, trackingId: String.fromCharCode(...rand), dedupeByClientGeneratedToken: false,
      hostRecipientUrns: ["urn:li:fsd_profile:" + x.urn] };
    const r = await post("voyagerMessagingDashMessengerMessages?action=createMessage", body);
    if (r.ok) return { ok: true };
    return { ok: false, error: "LinkedIn answered " + r.status + ": " + (r.text || "").slice(0, 200) };
  }

  // Read-only check of every call, with the shape of each answer, so a broken one can be fixed without guessing.
  async function diagnose(x) {
    const D = { at: new Date().toISOString(), lines: [], steps: {}, qid: x.qid || "", qids: x.qids || [] };
    const shape = (j) => ({ dataKeys: j && j.data && typeof j.data === "object" ? Object.keys(j.data).slice(0, 15) : [], types: [...new Set(inc(j).map((e) => e.$type))].slice(0, 20) });
    const sample = (e) => e ? Object.fromEntries(Object.entries(e).slice(0, 30).map(([k, v]) => [k, v && typeof v === "object" ? "{" + Object.keys(v).slice(0, 10).join(",") + "}" : String(v).slice(0, 90)])) : null;
    const step = async (name, fn) => { try { D.steps[name] = await fn(); } catch (e) { D.steps[name] = { err: String(e.message || e) }; } };
    const m = await me(); D.me = { signed_in: m.signed_in, has_urn: !!m.urn, pid: m.pid, err: m.error || "" };
    D.lines.push(m.signed_in ? "Signed in as " + m.name : "Not signed in to LinkedIn" + (m.error ? " (" + m.error + ")" : ""));
    if (!m.signed_in) return D;
    let postId = "";
    await step("posts", async () => {
      const j = await get("identity/profileUpdatesV2?count=20&includeLongTermHistory=true&moduleKey=member-shares%3Aphone&numComments=0&q=memberShareFeed&start=0&profileUrn=" + encodeURIComponent("urn:li:fsd_profile:" + m.urn));
      const acts = [...new Set((JSON.stringify(j).match(/urn:li:activity:\d+/g) || []))];
      postId = (acts[0] || "").split(":").pop();
      return { ...shape(j), activities: acts.length };
    });
    if (!postId && (x.extra_posts || []).length) postId = x.extra_posts[0];
    D.steps.post_used = postId;
    if (postId) {
      await step("reactions", async () => {
        const j = await get("voyagerSocialDashReactions?decorationId=com.linkedin.voyager.dash.deco.social.ReactionsByTypeWithProfileActions-13&count=10&q=reactionType&start=0&threadUrn=" + encodeURIComponent("urn:li:activity:" + postId));
        const r = inc(j).find((e) => /Reaction$/.test(e.$type || ""));
        return { ...shape(j), sample: sample(r), lockup: r && r.reactorLockup ? sample(r.reactorLockup) : null };
      });
      await step("comments", async () => {
        const c = await commentsOf(postId, x.cqid);
        return { via: c.via, count: c.list.length, err: c.err, cqid: x.cqid || "", first: c.list[0] ? { id: !!c.list[0].id, pid: !!c.list[0].pid, name: !!c.list[0].name, headline: !!c.list[0].headline, text: !!c.list[0].text, at: !!c.list[0].at } : null };
      });
      await step("engagers_parsed", async () => { const e = await engagers({ me: m, days: 60, extra_posts: [postId], cqid: x.cqid }); return { posts: e.posts, items: e.items.length, reactions: e.items.filter((i) => i.type === "reaction").length, comments: e.items.filter((i) => i.type === "comment").length, err: e.err }; });
    }
    let someone = null;
    await step("connections", async () => {
      const j = await get("relationships/dash/connections?decorationId=com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-16&count=10&q=search&sortType=RECENTLY_ADDED&start=0");
      const c = inc(j).find((e) => /Connection$/.test(e.$type || ""));
      let parsed = []; try { parsed = await connections(); } catch (_) {}
      someone = parsed[0] || null;
      return { ...shape(j), sample: sample(c), parsed: parsed.length, first_has_pid: !!(someone && someone.pid), first_has_at: !!(someone && someone.at) };
    });
    if (someone) await step("lookup", async () => { const r = await lookup({ urn: someone.urn, pid: someone.pid }); return { urn: !!r.urn, pid: !!r.pid, connected: r.connected, email_found: !!r.email }; });
    await step("threads", async () => {
      if (!D.qid) return { err: "no messaging query id found" };
      const t = await threads({ me: m, qid: D.qid });
      if (t.need_qid) return { err: "query id rejected" };
      const r = await fetch("/voyager/api/voyagerMessagingGraphQL/graphql?queryId=" + D.qid + "&variables=(mailboxUrn:" + encodeURIComponent("urn:li:fsd_profile:" + m.urn) + ")", { headers: { ...H, accept: "application/graphql" }, credentials: "include" });
      const raw = await r.text();
      return { parsed: t.threads.length, with_reply_time: t.threads.filter((z) => z.them_at).length, with_my_time: t.threads.filter((z) => z.me_at).length,
        raw_start: raw.slice(0, 700).replace(/ACoA[\w-]+/g, "ACoA_").replace(/"text":"[^"]*"/g, '"text":"_"') };
    });
    const fake = "ACoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    await step("invite_probe", async () => { const r = await post("voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2", { invitee: { inviteeUnion: { memberProfile: "urn:li:fsd_profile:" + fake } } }); return { status: r.status, text: r.text.slice(0, 250) }; });
    await step("message_probe", async () => { const r = await post("voyagerMessagingDashMessengerMessages?action=createMessage", { message: { body: { attributes: [], text: "test" }, renderContentUnions: [], originToken: crypto.randomUUID() }, mailboxUrn: "urn:li:fsd_profile:" + m.urn, trackingId: "aaaaaaaaaaaaaaaa", dedupeByClientGeneratedToken: false, hostRecipientUrns: ["urn:li:fsd_profile:" + fake] }); return { status: r.status, text: r.text.slice(0, 250) }; });
    const S = D.steps, ok = (k) => S[k] && !S[k].err;
    D.lines.push("Your posts: " + (ok("posts") ? S.posts.activities + " found" : "couldn't read (" + (S.posts && S.posts.err) + ")"));
    if (S.engagers_parsed) D.lines.push("Likes and comments read: " + (S.engagers_parsed.reactions || 0) + " likes, " + (S.engagers_parsed.comments || 0) + " comments" + (S.engagers_parsed.err ? " (" + S.engagers_parsed.err + ")" : ""));
    D.lines.push("Connections: " + (ok("connections") ? S.connections.parsed + " read" : "couldn't read (" + (S.connections && S.connections.err) + ")"));
    D.lines.push("Messages: " + (ok("threads") ? S.threads.parsed + " chats read" : "couldn't read (" + (S.threads && S.threads.err) + ")"));
    D.lines.push("Sending requests: " + (S.invite_probe && S.invite_probe.status ? "LinkedIn answered " + S.invite_probe.status : "?") + " · Sending DMs: " + (S.message_probe && S.message_probe.status ? "LinkedIn answered " + S.message_probe.status : "?"));
    return D;
  }

  switch (op) {
    case "me": return me();
    case "lookup": return lookup(a);
    case "engagers": return engagers(a);
    case "connections": return connections();
    case "threads": return threads(a);
    case "findQid": return findQid();
    case "diagnose": return diagnose(a);
    case "latestPost": return latestPost(a);
    case "invite": return invite(a);
    case "message": return message(a);
    default: throw new Error("unknown op " + op);
  }
}
