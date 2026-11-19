// Calls one of your Edge Functions with the cron secret from .env.local. Usage: node scripts/invoke.mjs li-bot '{"action":"state"}'
import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l=>l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^['"]|['"]$/g,'')]));
const r=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/'+process.argv[2],{method:'POST',headers:{'Content-Type':'application/json','x-cron-secret':env.CRON_SECRET},body:process.argv[3]||'{}'});
console.log(r.status,(await r.text()).slice(0,2000));
