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
      const nc = new Map(inc(j).filter((e) => /SocialActivityCounts$/.test(e.$type || "")).map((e) => [(String(e.entityUrn || e.urn || "").match(/activity:(\d+)/) || [])[1], e.numComments]));
      for (const p of posts) p.numComments = nc.has(p.id) ? +nc.get(p.id) || 0 : null;
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
      const cm = x.cqid ? await commentsOf(p.id, x.cqid) : { list: [], via: "", err: "" };
      if (cm.err) out.err = cm.err;
      if (!cm.via) out.dom = [...(out.dom || []), { id: p.id, n: p.numComments }];
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
    return { items: out, posts: posts.length, err: out.err || "", dom: out.dom || [] };
  }

  // Comments on one post: LinkedIn's web app now uses voyagerSocialDashComments, either as GraphQL (query id learned from a
  // post page, cqid) or as a plain finder. Tries each and uses the first one LinkedIn answers.
  async function commentsOf(postId, cqid) {
    const enc = (v) => encodeURIComponent(v).replace(/\(/g, "%28").replace(/\)/g, "%29");
    const act = "urn:li:activity:" + postId;
    const sd = "urn:li:fsd_socialDetail:(" + act + "," + act + ",urn:li:highlightedReply:-)";
    const tries = [];
    if (cqid) tries.push({ via: "graphql", url: (st) => "graphql?includeWebMetadata=true&variables=(count:100,numReplies:0,socialDetailUrn:" + enc(sd) + ",sortOrder:RELEVANCE,start:" + st + ")&queryId=" + cqid });
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

  // Comments as shown on the post page open in this tab. LinkedIn's new post pages have no stable class names, so a comment
  // is found by its shape: an author profile link, a block of text around it, and a "Reply" button, with no other person's
  // link inside. Opens every "load more" first.
  async function domComments(x) {
    for (let i = 0; i < 30 && document.querySelectorAll("a[href*='/in/']").length < 2; i++) await sleep(500);
    await sleep(1500);
    const label = (b) => ((b.innerText || "") + " " + (b.getAttribute("aria-label") || "")).toLowerCase();
    for (let i = 0; i < 25; i++) {
      window.scrollTo(0, document.body.scrollHeight); await sleep(900);
      const more = [...document.querySelectorAll("button, [role=button]")].find((b) => /load more comments|show more comments|see more comments|more comments|previous replies|show more replies/.test(label(b)) && b.offsetParent);
      if (!more) break;
      more.scrollIntoView({ block: "center" }); more.click(); await sleep(1400 + Math.random() * 900);
    }
    const prof = (h) => { const id = acoa(h), pid = vanity(h); return id || pid ? (id || pid).toLowerCase() : ""; };
    const meKeys = new Set([String(x.me && x.me.urn || "").toLowerCase(), String(x.me && x.me.pid || "").toLowerCase()]);
    const anchors = [...document.querySelectorAll("a[href*='/in/']")].filter((l) => !l.closest("header, nav, aside") && prof(l.href) && !meKeys.has(prof(l.href)));
    const isReply = (el) => [...el.querySelectorAll("button, [role=button], span")].some((b) => /^reply$/i.test((b.innerText || "").trim()) || /^reply/i.test(b.getAttribute("aria-label") || ""));
    const blocks = new Map();
    for (const l of anchors) {
      const key = prof(l.href);
      let node = l, best = null;
      for (let up = 0; up < 14 && node.parentElement; up++) {
        const par = node.parentElement;
        const others = [...par.querySelectorAll("a[href*='/in/']")].some((o) => prof(o.href) && prof(o.href) !== key && !meKeys.has(prof(o.href)) && !l.contains(o));
        if (others) break;
        node = par;
        if (isReply(node)) { best = node; break; }
      }
      if (!best || blocks.has(best)) continue;
      blocks.set(best, { key, href: l.href.split("?")[0], name: (l.innerText || l.getAttribute("aria-label") || "").trim() });
    }
    const list = [], seen = new Set();
    for (const [el, info] of blocks) {
      const lines = el.innerText.split("\n").map((t) => t.trim()).filter(Boolean);
      const junk = /^(like|reply|replies|\d+\s*(m|h|d|w|mo|yr)s?|\d+|•|·|edited|author|follow|connect|see translation|…more|more|\d+(st|nd|rd|th)\+?|1st|2nd|3rd\+?|· (1st|2nd|3rd\+?))$/i;
      const name = (lines[0] || info.name).split("\n")[0].replace(/^View\s+/i, "").replace(/[’']s\s+profile.*$/i, "").slice(0, 120);
      const rest = lines.slice(1).filter((t) => !junk.test(t) && t !== name);
      const headline = rest[0] || "";
      const text = rest.slice(1).sort((p, q) => q.length - p.length)[0] || "";
      const id = acoa(info.href), pid = vanity(info.href);
      if (seen.has(info.key + "|" + text.slice(0, 40))) continue; seen.add(info.key + "|" + text.slice(0, 40));
      list.push({ id, pid, name, headline: headline.slice(0, 200), text: text.slice(0, 1000) });
    }
    return { list, found: blocks.size, anchors: anchors.length, url: location.pathname };
  }

  // For fixing the reader: where known commenters' names sit on the page, as a chain of parent elements.
  function domProbe(x) {
    const out = [];
    const attrs = (e) => [e.tagName.toLowerCase(), e.getAttribute("role") && "role=" + e.getAttribute("role"), e.getAttribute("data-testid") && "testid=" + e.getAttribute("data-testid").slice(0, 40),
      e.getAttribute("componentkey") && "ck=" + e.getAttribute("componentkey").slice(0, 40), e.getAttribute("aria-label") && "aria=" + e.getAttribute("aria-label").slice(0, 40),
      e.className && typeof e.className === "string" && "cls=" + e.className.slice(0, 50)].filter(Boolean).join(" ");
    for (const n of (x.names || []).slice(0, 3)) {
      const first = n.split(/\s+/)[0];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let hit = null; while (w.nextNode()) { if (w.currentNode.nodeValue.includes(first)) { hit = w.currentNode.parentElement; break; } }
      if (!hit) { out.push({ name: first, found: false }); continue; }
      const chain = []; let e = hit;
      for (let i = 0; i < 12 && e; i++, e = e.parentElement) chain.push(attrs(e) + " | links:" + e.querySelectorAll("a[href*='/in/']").length + " len:" + (e.innerText || "").length);
      out.push({ name: first, found: true, chain });
    }
    const withComment = [...document.querySelectorAll("*")].filter((e) => /comment/i.test([e.getAttribute("data-testid"), e.getAttribute("componentkey"), e.getAttribute("aria-label"), typeof e.className === "string" ? e.className : ""].join(" "))).slice(0, 12).map(attrs);
    return { probes: out, comment_attrs: withComment, buttons: [...new Set([...document.querySelectorAll("button")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 30)).filter(Boolean))].slice(0, 40) };
  }

  // Every LinkedIn API call this page made (paths only), to see how a page loads its data.
  function netlog() {
    return { calls: [...new Set(performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /\/voyager\/api\/|\/flagship-web\/|sdui|rsc/.test(u)).map((u) => u.split("?")[0].replace(/ACoA[\w-]+/g, "ACoA_").replace(/\d{10,}/g, "N")))].slice(0, 40) };
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

  // ───────── v2 (11 Nov): new sources, warm touch, accepting requests, withdrawing old ones ─────────
  // People listed on the page open in this tab (profile viewers, invitation cards...): one entry per profile link, with the
  // name and headline read from the card around it.
  async function domPeople(x) {
    for (let i = 0; i < 24 && document.querySelectorAll("a[href*='/in/']").length < 4; i++) await sleep(500);
    for (let i = 0; i < 4; i++) { window.scrollTo(0, document.body.scrollHeight); await sleep(900); }
    const meKeys = new Set([String(x.me && x.me.urn || "").toLowerCase(), String(x.me && x.me.pid || "").toLowerCase()]);
    const prof = (h) => (acoa(h) || vanity(h) || "").toLowerCase();
    const seen = new Map();
    for (const a of document.querySelectorAll("a[href*='/in/']")) {
      if (a.closest("header, nav, aside, footer, [role=navigation], [role=banner], [role=complementary]")) continue;
      const k = prof(a.href); if (!k || meKeys.has(k) || seen.has(k)) continue;
      let card = a; for (let i = 0; i < 6 && card.parentElement && card.innerText.length < 40; i++) card = card.parentElement;
      card = a.closest("li") || card;
      const lines = (card.innerText || "").split("\n").map((t) => t.trim()).filter(Boolean);
      const junk = /^(view|connect|message|follow|following|pending|accept|ignore|withdraw|more|·|•|\d+(st|nd|rd|th)\+?|premium|see all|\d+\s*(m|h|d|w|mo|yr)s?)$/i;
      const name = ((a.innerText || "").split("\n").map((t) => t.trim()).filter(Boolean)[0] || lines[0] || "").replace(/^View\s+/i, "").replace(/[’']s\s+profile.*$/i, "").slice(0, 120);
      const rest = lines.filter((t) => t !== name && !junk.test(t) && !/^(viewed|sent|invited|\d+ mutual)/i.test(t));
      const message = (lines.find((t) => t.length > 60 && /[.?!]/.test(t) && t !== rest[0]) || "").slice(0, 600);
      seen.set(k, { urn: acoa(a.href), pid: vanity(a.href), name, headline: (rest[0] || "").slice(0, 200), message: x.messages ? message : "" });
    }
    return { people: [...seen.values()].filter((p) => p.name && !/linkedin member|someone/i.test(p.name)), url: location.pathname };
  }

  // Connection requests people sent us (LinkedIn's own list), with what's needed to accept them.
  async function invitesReceived() {
    const j = await get("relationships/invitationViews?includeInsights=true&q=receivedInvitation&start=0&count=50");
    const I = inc(j), byUrn = new Map(I.filter((e) => e.publicIdentifier).map((m) => [String(m.entityUrn), m]));
    const out = [];
    for (const v of I.filter((e) => e.sharedSecret && /Invitation/.test(e.$type || ""))) {
      const id = (String(v.entityUrn || "").match(/(\d+)$/) || [])[1];
      const m = byUrn.get(String(v["*fromMember"] || (v.fromMember && v.fromMember["*miniProfile"]) || "")) || {};
      const urn = acoa(m.entityUrn || m.dashEntityUrn || JSON.stringify(v.fromMember || v["*fromMember"] || ""));
      if (!urn && !m.publicIdentifier) continue;
      if (v.invitationType && v.invitationType !== "CONNECTION") continue;
      out.push({ urn, pid: m.publicIdentifier || "", name: [m.firstName, m.lastName].filter(Boolean).join(" "), headline: m.occupation || "", message: v.message || "", inv: id ? { id, secret: v.sharedSecret } : null });
    }
    return { people: out };
  }
  async function acceptInvite(x) {
    if (x.inv && x.inv.id) {
      const r = await post("relationships/invitations/" + x.inv.id + "?action=accept", { invitationId: x.inv.id, invitationSharedSecret: x.inv.secret, isGenericInvitation: false });
      if (r.ok) return { ok: true, via: "api" };
    }
    // On the invitation manager page: the Accept button on their card.
    const key = (x.pid || x.urn || "").toLowerCase();
    for (let i = 0; i < 20 && !document.querySelector("a[href*='/in/']"); i++) await sleep(500);
    const link = [...document.querySelectorAll("a[href*='/in/']")].find((a) => (acoa(a.href) || vanity(a.href) || "").toLowerCase() === key);
    let card = link; for (let i = 0; i < 8 && card && !card.querySelector("button"); i++) card = card.parentElement;
    const btn = card && [...card.querySelectorAll("button")].find((b) => /^accept/i.test((b.innerText || b.getAttribute("aria-label") || "").trim()));
    if (!btn) return { ok: false, error: "Couldn't find their request to accept" };
    btn.click(); await sleep(1500);
    return { ok: true, via: "page" };
  }

  // Warm touch: like their latest post (the profile visit happens by opening their profile in the tab first).
  async function likeLatest(x) {
    if (!x.urn) return { liked: false };
    try {
      const j = await get("identity/profileUpdatesV2?count=5&includeLongTermHistory=true&moduleKey=member-shares%3Aphone&numComments=0&q=memberShareFeed&start=0&profileUrn=" + encodeURIComponent("urn:li:fsd_profile:" + x.urn));
      const act = (JSON.stringify(j).match(/urn:li:activity:(\d+)/) || [])[1];
      if (!act || Date.now() - Number(BigInt(act) >> 22n) > 60 * 86400e3) return { liked: false, reason: "no recent post" };
      if (x.dry) return { liked: false, reason: "dry run", post: act };
      const r = await post("voyagerSocialDashReactions?threadUrn=" + encodeURIComponent("urn:li:activity:" + act), { reactionType: "LIKE" });
      return { liked: r.ok, status: r.status };
    } catch (e) { return { liked: false, reason: String(e.message) }; }
  }

  // On "Sent invitations": withdraw requests older than maxDays (oldest first), up to limit. dry = only count them.
  async function domWithdraw(x) {
    const maxDays = x.maxDays || 21, limit = x.limit || 25, out = [];
    const isW = (b) => /^withdraw/i.test((b.innerText || "").trim()) || /^withdraw/i.test(b.getAttribute("aria-label") || "");
    for (let i = 0; i < 24 && ![...document.querySelectorAll("button, [role=button]")].some(isW); i++) await sleep(500);
    for (let i = 0; i < 12; i++) {                                      // load the whole list
      window.scrollTo(0, document.body.scrollHeight); await sleep(900);
      const more = [...document.querySelectorAll("button")].find((b) => /show more|load more|see more/i.test(b.innerText || "") && b.offsetParent);
      if (more) { more.click(); await sleep(1500); } else if (i > 2) break;
    }
    const days = (t) => { const m = String(t).match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i); if (!m) return /yesterday/i.test(t) ? 1 : 0;
      return +m[1] * ({ minute: 0, hour: 0, day: 1, week: 7, month: 30, year: 365 })[m[2].toLowerCase()]; };
    const btns = [...document.querySelectorAll("button, [role=button]")].filter(isW).filter((b, i, a) => !a.some((o) => o !== b && o.contains(b)));
    const items = btns.map((b) => { let c = b; for (let i = 0; i < 8 && c.parentElement && !c.querySelector("a[href*='/in/']"); i++) c = c.parentElement;
      const a = c.querySelector("a[href*='/in/']"); return { b, a, age: days(c.innerText || ""), name: a ? (a.innerText || "").split("\n")[0].trim() : "", ageText: ((c.innerText || "").match(/\d+\s*\w+\s*ago/i) || [""])[0] }; })
      .filter((it) => it.age >= maxDays).sort((p, q) => q.age - p.age);
    if (x.dry) return { eligible: items.length, total: btns.length, withdrawn: [] };
    for (const it of items.slice(0, limit)) {
      it.b.scrollIntoView({ block: "center" }); it.b.click(); await sleep(900 + Math.random() * 600);
      const dlg = document.querySelector("[role=dialog], [role=alertdialog]");
      const ok = dlg && [...dlg.querySelectorAll("button, [role=button]")].find((b) => /^withdraw/i.test((b.innerText || b.getAttribute("aria-label") || "").trim()));
      if (ok) { ok.click(); await sleep(1500 + Math.random() * 1500); }
      out.push({ urn: it.a ? acoa(it.a.href) : "", pid: it.a ? vanity(it.a.href) : "", name: it.name, age: it.ageText });
    }
    return { eligible: items.length, total: btns.length, withdrawn: out };
  }

  // How the page open in this tab is built (for fixing a reader): links to people, buttons, and one sample card.
  async function pageProbe() {
    for (let i = 0; i < 20 && document.querySelectorAll("a[href*='/in/']").length < 4; i++) await sleep(500);
    window.scrollTo(0, document.body.scrollHeight); await sleep(1500);
    const people = [...document.querySelectorAll("a[href*='/in/']")].filter((a) => !a.closest("header, nav, [role=navigation]"));
    const btn = [...new Set([...document.querySelectorAll("button, [role=button]")].map((b) => ((b.innerText || b.getAttribute("aria-label") || "").trim().split("\n")[0]).slice(0, 30)).filter(Boolean))].slice(0, 50);
    let card = people[3] || people[0]; for (let i = 0; card && i < 6 && card.innerText.length < 60; i++) card = card.parentElement;
    return { href: location.href.split("?")[0], title: document.title.slice(0, 60), people_links: people.length, has_main: !!document.querySelector("main"), iframes: document.querySelectorAll("iframe").length,
      buttons: btn, sample: card ? card.innerText.replace(/\s+/g, " ").slice(0, 300) : "", text_start: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 400) };
  }

  // People we tagged in our posts (from the same list of our posts the engagers scan reads).
  async function tagged(x) {
    const j = await get("identity/profileUpdatesV2?count=20&includeLongTermHistory=true&moduleKey=member-shares%3Aphone&numComments=0&q=memberShareFeed&start=0&profileUrn=" + encodeURIComponent("urn:li:fsd_profile:" + x.me.urn));
    const I = inc(j), minis = new Map(I.filter((e) => e.publicIdentifier).map((m) => [acoa(m.entityUrn || m.dashEntityUrn), m]));
    const since = Date.now() - (x.days || 30) * 86400e3, out = new Map();
    for (const u of I) {
      const act = (String((u.updateMetadata && u.updateMetadata.urn) || "").match(/urn:li:activity:(\d+)/) || [])[1];
      if (!act || Number(BigInt(act) >> 22n) < since || !u.commentary) continue;
      const text = txt(u.commentary.text || u.commentary);
      for (const id of new Set((JSON.stringify(u.commentary).match(/ACoA[\w-]{10,}/g) || []))) {
        if (id === x.me.urn || out.has(id)) continue;
        const m = minis.get(id) || {};
        out.set(id, { urn: id, pid: m.publicIdentifier || "", name: [m.firstName, m.lastName].filter(Boolean).join(" "), headline: m.occupation || "", post_text: text.split("\n")[0].slice(0, 160) });
      }
    }
    return { people: [...out.values()].filter((p) => p.name) };
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
    case "domComments": return domComments(a);
    case "domProbe": return domProbe(a);
    case "netlog": return netlog();
    case "domPeople": return domPeople(a);
    case "pageProbe": return pageProbe();
    case "invitesReceived": return invitesReceived();
    case "acceptInvite": return acceptInvite(a);
    case "likeLatest": return likeLatest(a);
    case "domWithdraw": return domWithdraw(a);
    case "tagged": return tagged(a);
    case "invite": return invite(a);
    case "message": return message(a);
    default: throw new Error("unknown op " + op);
  }
}
