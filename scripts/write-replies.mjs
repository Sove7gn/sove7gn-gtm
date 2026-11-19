// Saves the X replies Claude wrote: posts.json (from scripts/sql.mjs) + plan.json ({"0":"reply text","1":"skip",...}). Approved replies are posted by the extension.
import { readFileSync } from "node:fs"; import postgres from "postgres";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^['"]|['"]$/g,"")]));
const sql = postgres(env.DATABASE_URL,{ssl:"require",max:1});
const posts = JSON.parse(readFileSync(process.argv[2], "utf8")); const plan = JSON.parse(readFileSync(process.argv[3], "utf8"));
let ok = 0, sk = 0;
for (const [i, d] of Object.entries(plan)) { const p = posts[+i]; if (!p) continue;
  if (d === "skip") { await sql`update crm_x_reply set status='skipped', error='Not about building, selling or growing a startup' where url=${p.url} and status in ('new','approved') and coalesce(draft,'')=''`; sk++; }
  else { if (d.length > 200) throw new Error("too long: " + i); await sql`update crm_x_reply set draft=${d}, status='approved' where url=${p.url} and status in ('new','approved')`; ok++; } }
console.log({ approved: ok, skipped: sk }); await sql.end();
