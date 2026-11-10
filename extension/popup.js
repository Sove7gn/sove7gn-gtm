const $ = (id) => document.getElementById(id);
const ago = (iso) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60e3); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; };

async function render() {
  const { key, last, queue = [], logs = [], me } = await chrome.storage.local.get(["key", "last", "queue", "logs", "me"]);
  $("setup").classList.toggle("hide", !!key);
  const s = !key ? "Paste the bot key to start." :
    !last ? "Hasn't run yet. Press Run now." :
    !last.signed_in ? "<b>Signed out of LinkedIn.</b> Sign in to LinkedIn in this Chrome." :
    "<b>" + (last.paused ? "Paused" : last.mode === "auto" ? "Auto mode" : "Review mode") + "</b> · signed in as " + ((me && me.name) || "you") +
      "<br>Last check " + ago(last.at) + " · " + queue.length + " waiting to send" + (last.in_hours ? "" : " · outside sending hours");
  $("status").innerHTML = s;
  $("logs").innerHTML = logs.slice(0, 15).map((l) => '<li class="' + (l.err ? "err" : "") + '"><small>' + ago(l.at) + "</small>" + l.line.replace(/</g, "&lt;") + "</li>").join("");
}
$("save").onclick = async () => { const k = $("key").value.trim(); if (!k) return; await chrome.storage.local.set({ key: k }); $("key").value = ""; render(); };
$("rekey").onclick = (e) => { e.preventDefault(); $("setup").classList.remove("hide"); };
$("run").onclick = async () => { $("run").textContent = "Running…"; $("run").disabled = true; await chrome.runtime.sendMessage({ cmd: "sync" }); $("run").textContent = "Run now"; $("run").disabled = false; render(); };
$("test").onclick = async () => {
  $("test").textContent = "Testing…"; $("test").disabled = true;
  const r = await chrome.runtime.sendMessage({ cmd: "test" });
  $("test-out").classList.remove("hide");
  $("test-out").innerHTML = r.error ? r.error : r.lines.map((x) => "• " + x.replace(/</g, "&lt;")).join("<br>");
  $("test").textContent = "Test LinkedIn"; $("test").disabled = false;
};
$("crm").onclick = () => chrome.tabs.create({ url: "https://sove7gn.github.io/sove7gn-gtm/#liOut" });
chrome.action.setBadgeText({ text: "" });
render();
