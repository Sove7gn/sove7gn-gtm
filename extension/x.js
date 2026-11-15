// Everything the bot does on X, run inside an x.com tab (your own signed-in session, same as typing in X's message box).
// xOp is injected with chrome.scripting.executeScript, so it must not use anything from outside its own body.
// It uses the same internal endpoints X's web app calls when you open a chat and press send. If X changes one, only this file
// needs fixing. Nothing here follows, likes or posts.
export async function xOp(op, a = {}) {
  const cookie = (k) => decodeURIComponent((document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)")) || [])[1] || "");
  const ct0 = cookie("ct0");
  const myId = (cookie("twid").match(/u=(\d+)/) || [])[1] || "";
  // The public token X's own website sends with every call (the same for everyone; your session is the cookies).
  const BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const H = { authorization: "Bearer " + BEARER, "x-csrf-token": ct0, "x-twitter-active-user": "yes", "x-twitter-auth-type": "OAuth2Session", "x-twitter-client-language": "en" };
  async function call(path, init = {}) {
    const r = await fetch(path, { credentials: "include", ...init, headers: { ...H, ...(init.headers || {}) } });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
    return { status: r.status, ok: r.ok, json: j, text: t.slice(0, 300) };
  }
  const errOf = (r) => { const e = (r.json && r.json.errors && r.json.errors[0]) || null; return e ? { code: e.code, message: e.message } : { code: r.status, message: r.text || "X answered " + r.status }; };

  if (op === "me") return { signed_in: !!(ct0 && myId), id: myId };

  // Can we DM them? Closed DMs, DMs only from people they follow, or the new passcode-locked chats all come back as no.
  if (op === "canDm") {
    const r = await call("/i/api/1.1/dm/permissions.json?recipient_ids=" + encodeURIComponent(a.user_id) + "&dm_users=false");
    if (!r.ok) return { known: false, error: errOf(r).message };
    const s = JSON.stringify(r.json || {});
    const can = /"can_dm"\s*:\s*true/.test(s), cant = /"can_dm"\s*:\s*false/.test(s);
    return { known: can || cant, can, code: (s.match(/"error_code"\s*:\s*(\d+)/) || [])[1] || "" };
  }

  // Send one DM. A 1:1 chat's id is the two user ids, smaller first.
  if (op === "send") {
    if (!ct0 || !myId) return { ok: false, error: "Signed out of X in this Chrome" };
    const [x, y] = [BigInt(myId), BigInt(a.user_id)];
    const conv = x < y ? x + "-" + y : y + "-" + x;
    const body = { conversation_id: conv, recipient_ids: false, request_id: crypto.randomUUID(), text: a.text, cards_platform: "Web-12", include_cards: 1, include_quote_count: true, dm_users: false };
    const r = await call("/i/api/1.1/dm/new2.json?include_ext_alt_text=true&include_reply_count=1&tweet_mode=extended&include_groups=true&include_inbox_timelines=true&supports_reactions=true",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok && r.json && (r.json.entries || r.json.event)) return { ok: true };
    const e = errOf(r);
    // 349: can't message this user; 150: you can't DM people who don't follow you; 215/32: not signed in
    if ([349, 150, 151, 326].includes(+e.code)) return { ok: false, cant: true, error: e.message };
    if ([32, 215].includes(+e.code) || r.status === 401) return { ok: false, error: "X says you're signed out (" + e.message + ")" };
    if (+e.code === 88 || r.status === 429) return { ok: false, limit: true, error: "X rate limit: " + e.message };
    return { ok: false, error: "X answered " + r.status + ": " + e.message };
  }
  // (16 Nov) The DM inbox: the last messages of every chat, so replies to our DMs reach the CRM. Read only, nothing is sent.
  if (op === "inbox") {
    if (!ct0 || !myId) return { ok: false, error: "Signed out of X in this Chrome" };
    const q = "nsfw_filtering_enabled=false&filter_low_quality=false&include_quality=all&dm_secret_conversations_enabled=false&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&dm_users=true&include_groups=true&include_inbox_timelines=true&supports_reactions=true&include_conversation_info=true";
    const r = await call("/i/api/1.1/dm/inbox_initial_state.json?" + q);
    if (!r.ok || !r.json) return { ok: false, error: errOf(r).message };
    const st = r.json.inbox_initial_state || {};
    const pick = (entries) => (entries || []).map((e) => e.message).filter(Boolean).map((m) => ({ id: m.id, conv: m.conversation_id, at: +m.time || 0,
      from: String((m.message_data || {}).sender_id || ""), to: String((m.message_data || {}).recipient_id || ""), text: String((m.message_data || {}).text || "") }));
    let items = pick(st.entries); const pages = [];
    // (16 Nov) The first answer only covers the last few hours: page back through both inboxes (trusted and requests) up to 14 days.
    for (const box of ["trusted", "untrusted"]) {
      let maxId = ((st.inbox_timelines || {})[box] || {}).min_entry_id;
      for (let i = 0; i < 12 && maxId; i++) {
        const p = await call("/i/api/1.1/dm/inbox_timeline/" + box + ".json?max_id=" + maxId + "&" + q);
        const tl = (p.json && p.json.inbox_timeline) || null;
        if (!p.ok || !tl) { pages.push(box + ":" + p.status); break; }
        const got = pick(tl.entries); items = items.concat(got); pages.push(box + ":" + got.length);
        const oldest = Math.min(...got.map((m) => m.at).filter(Boolean), Date.now());
        if (tl.status !== "HAS_MORE" || Date.now() - oldest > 14 * 864e5) break;
        maxId = tl.min_entry_id;
      }
    }
    items = items.filter((m) => m.text && Date.now() - m.at < 14 * 864e5);
    return { ok: true, me: myId, items, pages };
  }
  // (16 Nov) One chat's messages (the inbox call only returns the last few hours): the same call X makes when you open a chat.
  if (op === "conv") {
    if (!ct0 || !myId) return { ok: false, error: "Signed out of X in this Chrome" };
    const [x, y] = [BigInt(myId), BigInt(a.user_id)];
    const conv = x < y ? x + "-" + y : y + "-" + x;
    const r = await call("/i/api/1.1/dm/conversation/" + conv + ".json?context=FETCH_DM_CONVERSATION&include_profile_interstitial_type=1&dm_users=false&include_groups=true&include_inbox_timelines=true&supports_reactions=true&include_conversation_info=true&count=40");
    if (!r.ok || !r.json) return { ok: false, error: r.status + " " + errOf(r).message };
    const tl = r.json.conversation_timeline || {};
    const items = (tl.entries || []).map((e) => e.message).filter(Boolean).map((m) => ({ id: m.id, conv: m.conversation_id, at: +m.time || 0,
      from: String((m.message_data || {}).sender_id || ""), to: String((m.message_data || {}).recipient_id || ""), text: String((m.message_data || {}).text || "") })).filter((m) => m.text);
    return { ok: true, items };
  }
  throw new Error("Unknown X step: " + op);
}
