// Says which keys in .env.local are filled in, without printing any value.
import { readFileSync, existsSync } from "node:fs";

const file = new URL("../.env.local", import.meta.url);
if (!existsSync(file)) { console.log(".env.local is missing."); process.exit(1); }
const rows = readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean);
for (const [, k, v] of rows) {
  const val = v.trim();
  let note = val ? "filled" : "empty";
  if (k === "NEXT_PUBLIC_SUPABASE_URL" && val && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(val)) note = "filled, but doesn't look like https://<ref>.supabase.co";
  if (k === "DATABASE_URL" && val && !/^postgres(ql)?:\/\//.test(val)) note = "filled, but doesn't start with postgresql://";
  if (k === "DATABASE_URL" && /\[YOUR-PASSWORD\]/.test(val)) note = "still has [YOUR-PASSWORD] in it";
  console.log(`${k.padEnd(32)} ${note}`);
}
const token = new URL("../.secrets/github_token.txt", import.meta.url);
console.log(`${"GitHub token (.secrets)".padEnd(32)} ${existsSync(token) && readFileSync(token, "utf8").trim() ? "filled" : "empty"}`);
