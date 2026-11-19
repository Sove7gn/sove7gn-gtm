// Runs one SQL query on the database in .env.local and prints the rows as JSON. Usage: node scripts/sql.mjs "select ..." [max characters]
import { readFileSync } from "node:fs"; import postgres from "postgres";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^['"]|['"]$/g,"")]));
const sql = postgres(env.DATABASE_URL,{ssl:"require",max:1});
try{ const r = await sql.unsafe(process.argv[2]); console.log(JSON.stringify(r,null,0).slice(0, +process.argv[3]||4000)); } catch(e){ console.error("ERR", e.message); }
await sql.end();
