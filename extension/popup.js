const $ = (id) => document.getElementById(id);
const ago = (iso) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60e3); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; };
const esc = (s) => String(s).replace(/</g, "&lt;");

// Everything shown here comes from storage, so it stays right even if this window was closed while the bot worked.
async function render() {
  const { key, last, queue = [], logs = [], me, test, syncing, xlast, xqueue = [] } = await chrome.storage.local.get(["key", "last", "queue", "logs", "me", "test", "syncing", "xlast", "xqueue"]);
  $("setup").classList.toggle("hide", !!key);
  const s = !key ? "Paste the bot key to start." :
    syncing ? "<b>Checking LinkedIn…</b> This can take a few minutes. You can close this window." :
    !last ? "Hasn't run yet. Press Run now." :
    !last.signed_in ? "<b>Signed out of LinkedIn.</b> Sign in to LinkedIn in this Chrome." :
    "<b>" + (last.paused ? "Paused" : last.mode === "auto" ? "Auto mode" : "Review mode") + "</b> · signed in as " + esc((me && me.name) || "you") +
      "<br>Last check " + ago(last.at) + " · " + queue.length + " waiting to send" + (last.in_hours ? "" : " · outside sending hours");
  $("status").innerHTML = "<b>LinkedIn</b> · " + s;
  $("xstatus").innerHTML = !xlast ? "<b>X</b> · waiting for its first check (every 3 minutes)." : !xlast.signed_in ? "<b>X</b> · signed out. Sign in at x.com in this Chrome." :
    "<b>X</b> · " + (xlast.paused ? "paused" : "on") + " · " + (xlast.sent_today || 0) + " sent today, " + (xlast.left ?? "?") + " left · " + xqueue.length + " waiting to send" + (xlast.in_hours ? "" : " · outside sending hours (9:00 to 23:30)") + " · checked " + ago(xlast.at);
  $("run").disabled = !!syncing; $("run").textContent = syncing ? "Running…" : "Run now";
  const testing = !!(test && test.running);
  $("test").disabled = testing; $("test").textContent = testing ? "Testing…" : "Test";
  if (test) { $("test-out").classList.remove("hide"); $("test-out").innerHTML = "<b>Test " + (testing ? "running" : ago(test.at)) + "</b><br>" + test.lines.map((x) => "• " + esc(x)).join("<br>"); }
  $("logs").innerHTML = logs.slice(0, 15).map((l) => '<li class="' + (l.err ? "err" : "") + '"><small>' + ago(l.at) + "</small>" + esc(l.line) + "</li>").join("");
}
$("save").onclick = async () => { const k = $("key").value.trim(); if (!k) return; await chrome.storage.local.set({ key: k }); $("key").value = ""; render(); };
$("rekey").onclick = (e) => { e.preventDefault(); $("setup").classList.remove("hide"); };
$("run").onclick = () => { chrome.runtime.sendMessage({ cmd: "sync" }).catch(() => {}); setTimeout(render, 300); };
$("test").onclick = () => { chrome.runtime.sendMessage({ cmd: "test" }).catch(() => {}); setTimeout(render, 300); };
$("crm").onclick = () => chrome.tabs.create({ url: "https://sove7gn.github.io/sove7gn-gtm/" });
chrome.action.setBadgeText({ text: "" });
render();
setInterval(render, 2000);
