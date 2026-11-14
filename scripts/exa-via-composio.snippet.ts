// Exa through Composio (15 Nov): our own Exa key ran out of credits, while the Exa account connected in Composio has them.
// exaFetch takes the same arguments as fetch("https://api.exa.ai/search", ...): it tries the Exa key first (when there is one
// and it hasn't said "out of credits" in this run), then sends the same search through Composio's EXA_SEARCH tool, and hands
// back a Response with Exa's usual JSON, so the code around it doesn't change.
const EXA_KEY_ = Deno.env.get("EXA_API_KEY") ?? "";
const CMP_KEY_ = Deno.env.get("COMPOSIO_API_KEY") ?? "";
let exaKeyEmpty_ = false;
async function exaFetch(url: string, init: RequestInit): Promise<Response> {
  if (EXA_KEY_ && !exaKeyEmpty_) {
    const r = await fetch(url, init);
    if (r.ok) return r;
    const t = await r.text();
    if (!(r.status === 402 || /credit|NO_MORE_CREDITS|top up/i.test(t)) || !CMP_KEY_) return new Response(t, { status: r.status });
    exaKeyEmpty_ = true;
  }
  if (!CMP_KEY_) return new Response(JSON.stringify({ error: "No Exa key with credits and no COMPOSIO_API_KEY" }), { status: 500 });
  const args = JSON.parse(String(init.body ?? "{}"));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://connect.composio.dev/mcp", { method: "POST",
        headers: { "x-consumer-api-key": CMP_KEY_, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "COMPOSIO_MULTI_EXECUTE_TOOL",
          arguments: { tools: [{ tool_slug: "EXA_SEARCH", arguments: args }], sync_response_to_workbench: false, thought: "CRM job search" } } }) });
      const txt = await res.text();
      if (!res.ok) throw new Error("Composio answered " + res.status + ": " + txt.slice(0, 160));
      const line = txt.match(/^data: (.*)$/m);
      const j = JSON.parse(line ? line[1] : txt);
      if (j.error) throw new Error("Composio: " + String(j.error.message ?? j.error).slice(0, 160));
      const out = JSON.parse(j.result?.content?.[0]?.text ?? "{}");
      const one = out?.data?.results?.[0]?.response;
      if (!one?.successful) throw new Error("Exa via Composio: " + String(one?.error ?? out?.error ?? "no result").slice(0, 160));
      return new Response(JSON.stringify(one.data ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) { if (attempt === 1) return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 502 }); }
  }
  return new Response("{}", { status: 502 });
}
