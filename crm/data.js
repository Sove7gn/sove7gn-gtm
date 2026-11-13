/* CRM data layer: the Aktoria CRM's model, with the Google Sheet and its Apps Script swapped for Supabase.
   Every tab is stored row by row exactly like the sheet (table crm_sheet: row 1 title, row 2 note, row 3 headers), and every
   save goes through crm_call(), the Apps Script's actions rebuilt in the database with the same checks and answers.
   The sheet's formula columns (DM Pipeline Priority, Next action, FU due dates...; DM Templates totals) are computed here
   when the data loads. Sign-in is Supabase's email link; only emails on the team list can read or save.
   The page (index.html) subscribes with AK.subscribe(fn) and reads AK.model(). */
(function(){
"use strict";
const CFG=window.CRM_CONFIG||{};
const BRAND=CFG.brand||"CRM";
const SB_URL=String(CFG.supabaseUrl||"").replace(/\/+$/,""),SB_KEY=String(CFG.supabaseAnonKey||"");
const SHEET_ID="";
const SERVER="Supabase";
const SHEET_URL=SB_URL?"https://supabase.com/dashboard/project/"+SB_URL.replace(/^https:\/\//,"").split(".")[0]+"/editor":"https://supabase.com/dashboard";
const PIPE_TAB="'DM Pipeline'";
const RANGES={
  pipeline:"'DM Pipeline'!A2:AL1000",
  targets:"'Target Accounts'!A3:N300",
  stats:"'DM Templates'!A3:K6",  // K4 = "DMs paused" switch
  templates:"'DM Templates'!A10:M40",
  comps:"'Competitors'!A3:O60",
  people:"'Competitor People'!A3:H200",
  theirs:"'Their Posts'!A3:AB1000",
  ours:"'Our Posts'!A3:AB1500",
  accounts:"'Our Accounts'!A3:H6",
  weekly:"'Our Accounts'!A8:E40",
  tracking:"'Post Tracking'!A3:J5000",
  engagers:"'Post Engagers'!A3:U2000",  // R "Our reply", S "Verdict", T "Why": written by the engager-replies task
};
const SCRIPT_URL="";
const PAGE_TOKEN="";
// Accounts come from crm/config.json (name -> X handle); the same names fill the Our Accounts tab.
const HANDLES={};for(const a of CFG.accounts||[])if(a&&a.name)HANDLES[a.name]=String(a.x||"").replace(/^@/,"");
const ymd=v=>{const m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3]):null};
const PC=CFG.pilot||{};
const PILOT={start:ymd(PC.start)||new Date(2026,10,2),end:ymd(PC.end)||new Date(2027,0,31),followerTarget:+PC.followerTarget||1000};
const RANGE_NAMES={accounts:"Our Accounts",weekly:"Our Accounts (weekly)",pipeline:"DM Pipeline",targets:"Target Accounts",stats:"DM template totals",templates:"DM Templates",comps:"Competitors",people:"Competitor People",theirs:"Their Posts",ours:"Our Posts",tracking:"Post Tracking",engagers:"Post Engagers"};
const DRAFT_ACCOUNT={};
const STATUSES=["To send","Sent","FU1 sent","FU2 sent","Replied","Call booked","Customer","Not now","No reply","Do not contact"];
const STAGES=["To send","Sent","FU1 sent","FU2 sent","Replied","Call booked","Customer"];
const CLOSED=new Set(["Not now","No reply","Do not contact"]);
// Only plain-value columns. Everything else in DM Pipeline (A, B, U, W, AA, AC, AD, AE) is an ARRAYFORMULA and must never be written.
const WRITABLE=new Set(["Status","Sent on","FU1 sent","FU2 sent","Replied on","Call on","Notes","DM result","Template","Opener (30-40 words)","X handle"]);
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const FOLDERS=CFG.folders||[];
const folderUrl=id=>"https://drive.google.com/drive/folders/"+id;
const BUCKETS=[
  {id:"reply",test:a=>a==="Reply now"},
  {id:"fu",test:a=>/FU[12]/.test(a)&&/(overdue|today)/.test(a)},
  {id:"call",test:a=>a==="Prep the call"},
  {id:"send",test:a=>/^Send today/.test(a)},
  {id:"noreply",test:a=>a==="Mark No reply"},
  {id:"research",test:a=>/first$/.test(a)},
];
const bucket=id=>BUCKETS.find(b=>b.id===id);

/* ---------- state ---------- */
const store={
  get(k,d){try{const v=localStorage.getItem("crm:"+k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem("crm:"+k,JSON.stringify(v))}catch(e){}}
};
const S={
  mcp:undefined, pub:false, raw:{}, at:{}, err:{}, busy:new Set(),
  // Saved here until the sheet catches up (the published copy lags a few minutes).
  postedLocal:{}, statusLocal:{}, messagedLocal:{}, pipeLocal:{}, pausedLocal:null, moveLocal:{},
  // Calendar edits (31 Oct): fields saved but not read back yet, cards still being created, and the last text we wrote per row.
  calLocal:{}, calTemp:[], calText:{}, calAlias:{},
};
const M={accounts:[],weekly:[],headers:[],contacts:[],targets:[],stats:[],templates:[],comps:[],people:[],theirs:[],ours:[],drafts:[],tracking:[],engagers:[],li:[]};
let version=0;
const subs=new Set();
let emitT=null;
function emit(){if(emitT)return;emitT=setTimeout(()=>{emitT=null;version++;cache=null;subs.forEach(f=>{try{f()}catch(e){console.error(e)}})},0)}
const hooks={toast:(msg,isErr)=>{(isErr?console.warn:console.log)("[AK]",msg)}};
const toast=(m,e)=>hooks.toast(m,e);

/* ---------- helpers ---------- */
const num=s=>{if(typeof s==="number")return s;const n=parseFloat(String(s==null?"":s).replace(/,/g,""));return isNaN(n)?null:n};
function fmtK(n){
  if(n==null||isNaN(n))return "–";
  const a=Math.abs(n);
  if(a>=1e6)return (n/1e6).toFixed(a>=1e7?0:1).replace(/\.0$/,"")+"M";
  if(a>=1e3)return (n/1e3).toFixed(a>=1e4?0:1).replace(/\.0$/,"")+"K";
  return String(Math.round(n*10)/10);
}
function col(i){let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function safeUrl(u){
  u=String(u||"").trim();if(!u)return null;
  if(/^https?:\/\//i.test(u))return u;
  if(/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/|$)/i.test(u))return "https://"+u;
  return null;
}
function xUrl(handle){const m=String(handle||"").match(/@([A-Za-z0-9_]{1,15})/)||String(handle||"").match(/^([A-Za-z0-9_]{1,15})$/);return m?"https://x.com/"+m[1]:null}
function host(u){try{return new URL(u).hostname.replace(/^www\./,"")}catch(e){return u}}
function payloadOf(r){
  let p=r&&r.payload;
  if(typeof p==="string"){try{p=JSON.parse(p)}catch(e){p=null}}
  if(!p||typeof p!=="object"){
    const t=r&&Array.isArray(r.content)?(r.content.find(b=>b&&b.type==="text")||{}).text:null;
    try{p=t?JSON.parse(t):null}catch(e){p=null}
  }
  return p;
}
function parseDate(s){
  s=String(s||"").trim();if(!s)return null;
  let m=s.match(/(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
  if(m){const mi=MON.indexOf(m[2].charAt(0).toUpperCase()+m[2].slice(1,3).toLowerCase());if(mi>=0)return new Date(+m[3],mi,+m[1])}
  m=s.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if(m){const mi=MON.indexOf(m[1].charAt(0).toUpperCase()+m[1].slice(1,3).toLowerCase());if(mi>=0)return new Date(+m[3],mi,+m[2])}
  return null;
}
function sheetSerial(d,withTime){
  const ms=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),withTime?d.getHours():0,withTime?d.getMinutes():0);
  return Math.round((ms-Date.UTC(1899,11,30))/864e5*1e6)/1e6;
}
function fmtSerial(v,withTime){
  const d=new Date(Date.UTC(1899,11,30)+v*864e5);
  const day=d.getUTCDate()+" "+MON[d.getUTCMonth()];
  return withTime?day+", "+d.getUTCHours()+":"+String(d.getUTCMinutes()).padStart(2,"0"):day;
}
// "28 Oct" / "28 Oct, 20:57" (how the sheet shows its dates) -> a Date this year, or null.
function cellDate(s){
  const m=String(s||"").match(/^(\d{1,2}) ([A-Z][a-z]{2})(?:[a-z]*,? (\d{4}))?(?:,? (\d{1,2}):(\d{2}))?/);
  if(!m||MON.indexOf(m[2])<0)return parseDate(s);
  return new Date(m[3]?+m[3]:new Date().getFullYear(),MON.indexOf(m[2]),+m[1],m[4]?+m[4]:0,m[5]?+m[5]:0);
}
function ago(ms){
  const s=Math.max(0,Math.round((Date.now()-ms)/1000));
  if(s<45)return "just now";const m=Math.round(s/60);if(m<60)return m+" min ago";
  return Math.round(m/60)+" h ago";
}
// Scraped text sometimes keeps HTML codes (even doubled, like &amp;gt;); a textarea decodes them without running anything.
function decodeEntities(s){if(!s||s.indexOf("&")<0)return s;const t=document.createElement("textarea");let prev;do{prev=s;t.innerHTML=s;s=t.value}while(s!==prev&&s.indexOf("&")>=0);return s}
function pick(o,prefix){for(const k in o)if(k.indexOf(prefix)===0)return o[k];return ""}
const firstName=n=>String(n||"").split(/\s+/)[0]||"";
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
function plain(s){
  s=String(s==null?"":s).replace(/ICP role match/gi,"Right role for us").replace(/\s*\((Apollo|Exa|Hunter|Apify)\)/g,"").replace(/\bICP\b/g,"buyers").replace(/\bHOT\b/g,"Ready to buy").replace(/\bEngager\b/g,"Engaged with a post");
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function median(a){a=a.filter(x=>x!=null).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
const DAY=864e5;
function weekStart(offset){const d=new Date();d.setHours(0,0,0,0);const dow=(d.getDay()+6)%7;return new Date(d.getTime()-dow*DAY+offset*7*DAY)}
const sameDay=(a,b)=>a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
// "Today", "Yesterday", "Tue", or "12 Oct".
function dayWord(d){
  if(!d)return "";const t=new Date();t.setHours(0,0,0,0);const x=new Date(d);x.setHours(0,0,0,0);const n=Math.round((t-x)/DAY);
  return n===0?"Today":n===1?"Yesterday":n===-1?"Tomorrow":n>1&&n<7?DOW[x.getDay()]:x.getDate()+" "+MON[x.getMonth()];
}

/* ---------- data ---------- */
function toObjects(values,hdrIdx,firstRow){
  const hd=(values[hdrIdx]||[]).map(s=>String(s==null?"":s).trim());
  const rows=[];
  for(let i=hdrIdx+1;i<values.length;i++){
    const r=values[i]||[];const o={_row:firstRow+i};
    hd.forEach((k,j)=>{if(k)o[k]=r[j]==null?"":String(r[j]).trim()});
    rows.push(o);
  }
  return {headers:hd,rows};
}
function build(){
  const p=S.raw.pipeline;
  if(p){
    const t=toObjects(p,1,2);M.headers=t.headers;
    M.contacts=t.rows.filter(r=>r.Name).map(r=>{r._key=r.Name+"|"+r.Company;r._pri=num(r.Priority);r._fit=num(r["Fit (1-10)"]);
      // Public page: show a saved change for 10 minutes, while Google's published copy catches up.
      const loc=S.pipeLocal[r._row];
      if(loc&&loc.name===r.Name&&Date.now()-loc.at<6e5){const before=r.Status||"To send";for(const k in loc.cells){const v=loc.cells[k];r[k]=typeof v==="number"?fmtSerial(v,k==="Sent on"||k==="Call on"):v}
        if(loc.cells.Status&&before!==loc.cells.Status){r["Next action"]="Updating…";r.Ready="";r["Queue #"]=""}}
      r._status=r.Status||"To send";return r});
  }else{M.headers=[];M.contacts=[]}
  M.targets=S.raw.targets?toObjects(S.raw.targets,0,3).rows.filter(r=>r.Company):[];
  M.stats=S.raw.stats?toObjects(S.raw.stats,0,3).rows.filter(r=>r.Account):[];
  M.templates=S.raw.templates?toObjects(S.raw.templates,0,10).rows.filter(r=>r.ID):[];
  M.comps=S.raw.comps?toObjects(S.raw.comps,0,3).rows.filter(r=>r.Name):[];
  M.people=S.raw.people?toObjects(S.raw.people,0,3).rows.filter(r=>r.Name&&r.Competitor):[];
  // Rows marked "Earlier research" or "Hidden: ..." in Scraped on stay in the sheet but are hidden here.
  M.theirs=S.raw.theirs?toObjects(S.raw.theirs,0,3).rows.filter(r=>r.Competitor&&(r.Link||r["Full text"])&&!/earlier research|^hidden/i.test(r["Scraped on"]||"")).map(r=>{
    for(const k of ["Full text","Hook"])r[k]=decodeEntities(r[k]);
    r._date=parseDate(r.Date);r._views=num(r.Views);
    const li=/linkedin/i.test(r.Platform);r._li=li;
    const parts=li?[r.Reactions,r.Comments,r.Reposts]:[r.Likes,r.Replies,r.Reposts,r.Quotes,r.Bookmarks];
    const sum=parts.map(num).filter(x=>x!=null);
    r._eng=num(r.Engagement)!=null?num(r.Engagement):(sum.length?sum.reduce((a,b)=>a+b,0):null);
    r._comp=compFor(r.Competitor);r._key="t"+r._row;
    return r;
  }):[];
  // Rank each saved post by engagement, within its competitor and across all, per platform.
  for(const li of [false,true]){
    const same=M.theirs.filter(t=>t._li===li&&t._eng!=null).sort((a,b)=>b._eng-a._eng);
    const byComp=new Map();
    for(const t of same){const k=t._comp?t._comp.Name:t.Competitor;if(!byComp.has(k))byComp.set(k,[]);byComp.get(k).push(t)}
    same.forEach((t,i)=>{const mine=byComp.get(t._comp?t._comp.Name:t.Competitor);t._rank={comp:mine.indexOf(t)+1,compN:mine.length,all:i+1,allN:same.length}});
  }
  // Rank by views too (what the page shows): within each competitor, X posts by views, then engagement.
  const byC=new Map();
  for(const t of M.theirs){const k=t._comp?t._comp.Name:t.Competitor;if(!byC.has(k))byC.set(k,[]);byC.get(k).push(t)}
  for(const list of byC.values()){list.sort(bigFirst);list.forEach((t,i)=>{t._vrank=i+1;t._vrankN=list.length})}
  // Rows deleted in the CRM keep Status "Deleted" in the sheet (so Undo works) and are left out everywhere here.
  M.ours=S.raw.ours?toObjects(S.raw.ours,0,3).rows.filter(r=>r["Our version"]||r["Their post"]||r["Posted link"]||r.Calendar).map(r=>{r._date=parseDate(r.Date);r._key="o"+(S.calAlias[r._row]||r._row);
    const local=S.postedLocal[r._row];if(local&&!r["Posted link"]){r["Posted link"]=local;r.Status="Posted"}
    const st=S.statusLocal[r._row];if(st&&(st.status==="Deleted"||st.was==="Deleted"||!r["Posted link"])&&Date.now()-st.at<6e5)r.Status=st.status;
    const mv=S.moveLocal[r._row];if(mv&&!r["Posted link"]&&Date.now()-mv.at<6e5){r.Date=mv.date;r["Time (IST)"]=mv.time;if(mv.status)r.Status=mv.status;r._date=parseDate(r.Date)}
    calOverlay(r,r._row);r._date=parseDate(r.Date);
    return r}).filter(r=>r.Status!=="Deleted"):[];
  M.li=liPosts();
  // Cards made on the calendar that the sheet hasn't shown yet.
  S.calTemp=S.calTemp.filter(t=>!(t.row&&M.ours.some(r=>r._row===t.row)));
  for(const t of S.calTemp){const r={_row:t.key,_key:"o"+t.key,_temp:true,Date:t.date,"Time (IST)":t.time,Account:t.account,Platform:t.platform||"X","Daily slot":t.slot||"",Competitor:"Our own",
    "What we changed":"Added in the calendar",Status:"Draft",Calendar:"Yes","Our version":""};calOverlay(r,t.key);r._date=parseDate(r.Date);if(r.Status!=="Deleted")M.ours.push(r)}
  M.tracking=S.raw.tracking?toObjects(S.raw.tracking,0,3).rows.filter(r=>r["Post link"]).map(r=>{r._t=Date.parse(String(r["Checked at (IST)"]).replace(" ","T")+"+05:30")||0;return r}):[];
  // LinkedIn snapshots (2 Nov) stay out of the X numbers (views, followers, the weekly grid): kept on their own.
  M.trackingLi=M.tracking.filter(r=>/linkedin\.com/i.test(r["Post link"]));M.tracking=M.tracking.filter(r=>!/linkedin\.com/i.test(r["Post link"]));
  M.engagers=S.raw.engagers?toObjects(S.raw.engagers,0,3).rows.filter(r=>r.Handle).map(r=>{r._key="e"+r._row;
    const ml=S.messagedLocal[r._row];
    if(ml&&ml.undo&&Date.now()-ml.at<6e5){r.Status=ml.status;r["Messaged on"]=ml.when}
    else if(ml&&!ml.undo&&r.Status!=="Messaged"){r.Status="Messaged";r["Messaged on"]=ml.when}
    return r}):[];
  M.accounts=S.raw.accounts?toObjects(S.raw.accounts,0,3).rows.filter(r=>r.Account):[];
  M.weekly=S.raw.weekly?toObjects(S.raw.weekly,0,8).rows.filter(r=>r.Week):[];
  M.drafts=[];
  for(const k in DRAFT_ACCOUNT){
    if(!S.raw[k])continue;
    for(const r of toObjects(S.raw[k],0,3).rows){if(!r.Post)continue;r._account=DRAFT_ACCOUNT[k];r._key=k+r._row;M.drafts.push(r)}
  }
}
function compFor(name){
  const n=norm(name);if(!n)return null;
  return M.comps.find(c=>{const cn=norm(c.Name);return cn&&(n===cn||n.indexOf(cn)===0||cn.indexOf(n)===0)})||null;
}
const viewsOf=t=>num(t.Views)||0;
// X first, then by views, then by engagement.
const bigFirst=(a,b)=>((a._li?1:0)-(b._li?1:0))||(viewsOf(b)-viewsOf(a))||((b._eng||0)-(a._eng||0));
const DENIALS=new Set(["needs_reauth","server_not_connected","selection_required","server_not_found","blocked_by_policy","approval_required","not_in_manifest","consent_required","not_granted","capability_disabled","capability_removed"]);
function ingest(key,result){
  const p=payloadOf(result);
  if(!p||typeof p!=="object"){S.err[key]={code:"bad_shape"};return}
  S.raw[key]=Array.isArray(p.values)?p.values:[];
  S.at[key]=(result.cache&&result.cache.storedAt)||Date.now();
  S.err[key]=null;
}
function watch(key){
  S.mcp.watchTool(SERVER,"get_values",{spreadsheetId:SHEET_ID,range:RANGES[key]},ev=>{
    if(ev.type==="data")ingest(key,ev.result);
    else{S.err[key]=ev.error||{code:"upstream_error"};if(DENIALS.has(S.err[key].code))S.raw[key]=null}
    build();emit();
  },{cache:{staleTime:30000,gcTime:7*864e5},refetchInterval:key==="pipeline"?60000:300000});
}
/* ---------- public mode (outside claude.ai, e.g. GitHub Pages): read the sheet published to the web ---------- */
const GIDS={};
const colNum=s=>[...s].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;
function parseRange(r){
  const m=r.match(/^'?(.+?)'?!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  return {tab:m[1],c0:colNum(m[2]),r0:+m[3]-1,c1:colNum(m[4]),r1:+m[5]-1,a1:m[2]+m[3]+":"+m[4]+m[5]};
}
function parseCSV(t){
  const rows=[];let row=[],f="",q=false;
  for(let i=0;i<t.length;i++){
    const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=ch}
    else if(ch==='"')q=true;
    else if(ch===","){row.push(f);f=""}
    else if(ch==="\n"){row.push(f);rows.push(row);row=[];f=""}
    else if(ch!=="\r")f+=ch;
  }
  if(f||row.length){row.push(f);rows.push(row)}
  return rows;
}
// Match the Sheets API: drop empty cells at the end of a row and empty rows at the end of the range.
function trimGrid(rows){
  const out=rows.map(r=>{let n=r.length;while(n&&r[n-1]==="")n--;return r.slice(0,n)});
  while(out.length&&!out[out.length-1].length)out.pop();
  return out;
}
// The sheet's "File → Share → Publish to web" link: serves each whole tab as CSV, exactly as the cells show.
const PUB_URL="https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISH_ID/pub";
// Rows between a range's first row and its header row (DM Pipeline starts with a summary line).
const HEADER_OFFSET={pipeline:1};
const tabCache={};
async function getCSV(url){
  const res=await fetch(url);
  const text=res.ok?await res.text():"";
  if(!res.ok||/^\s*</.test(text))throw {code:"not_public"};
  return parseCSV(text);
}
const fetchTab=tab=>getCSV(PUB_URL+"?gid="+GIDS[tab]+"&single=true&output=csv&t="+Date.now());
// Fallback while a fresh publish spreads across Google's servers: the link-shared query endpoint.
async function fetchRangeFallback(key,r){
  const off=HEADER_OFFSET[key]||0,start=r.a1.replace(/\d+:/,(r.r0+1+off)+":");
  const rows=await getCSV("https://docs.google.com/spreadsheets/d/"+SHEET_ID+"/gviz/tq?tqx=out:csv&headers=1&gid="+GIDS[r.tab]+"&range="+start+"&t="+Date.now());
  return Array(off).fill([]).concat(rows);
}
/* ---------- Supabase: load every tab, compute the sheet's formula columns ---------- */
let sb=null,session=null,member=null,started=false;
/* Bandwidth (13 Nov, Supabase free plan): every table the page reads has an updated_at that moves on each change, so after
   the first load only changed rows come down. A full reload every 30 minutes (and on a manual Refresh) catches rows removed. */
const INC={};const FULL_EVERY=30*60e3;
async function incLoad(table,col,keyOf,opt={}){
  const st=INC[table]||(INC[table]={since:"",map:new Map(),full:0});
  const full=opt.full||!st.since||Date.now()-st.full>FULL_EVERY;
  const got=[];
  for(let from=0;;from+=1000){let q=sb.from(table).select(opt.cols||"*").order(col,{ascending:true});for(const t of opt.tie||[])q=q.order(t);
    if(!full)q=q.gte(col,st.since);
    const r=await q.range(from,from+999);if(r.error)throw r.error;got.push(...(r.data||[]));if(!r.data||r.data.length<1000)break}
  if(full){st.map=new Map();st.full=Date.now()}
  for(const r of got){st.map.set(keyOf(r),r);if(String(r[col])>st.since)st.since=String(r[col])}
  return {rows:[...st.map.values()],changed:full||got.some(r=>String(r[col])>(opt.prev||""))};
}
const incForget=()=>{for(const k in INC)INC[k].since=""};
async function loadGrids(){
  const out={};
  const {rows}=await incLoad("crm_sheet","updated_at",r=>r.tab+"|"+r.row,{cols:"tab,row,cells,updated_at",tie:["tab","row"]}).catch(error=>{throw {code:error.code||"load_failed",message:error.message}});
  for(const r of rows)(out[r.tab]=out[r.tab]||[])[r.row-1]=(r.cells||[]).map(v=>v==null?"":String(v));
  for(const t in out){const g=out[t];for(let i=0;i<g.length;i++)if(!g[i])g[i]=[]}
  computeFormulas(out);
  return out;
}
const fmtDay=d=>d.getDate()+" "+MON[d.getMonth()];   // how the sheet showed due dates
// The sheet's ARRAYFORMULA columns, computed the same way: DM Pipeline A, B, U, W, AA, AC, AD, AE and the DM Templates numbers.
function computeFormulas(g){
  const P=g["DM Pipeline"],T=g["DM Templates"];
  if(!P||!P[2])return;
  const H=P[2].map(x=>String(x||"").trim()),ix=k=>H.indexOf(k);
  const get=(r,k)=>{const i=ix(k);return i<0?"":String(r[i]==null?"":r[i]).trim()};
  const put=(r,k,v)=>{const i=ix(k);if(i<0)return;while(r.length<=i)r.push("");r[i]=v==null?"":String(v)};
  const paused=String(((T||[])[3]||[])[10]||"").toUpperCase()==="TRUE";
  const now=new Date(),today=new Date(now);today.setHours(0,0,0,0);
  const day0=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()};
  const closed=new Set(["Customer","Not now","No reply","Do not contact"]);
  const SEG={"Inbound engager":3,"Competitor engager":2,"Hiring signal":2};
  const tgt={},sentToday={};
  (T||[]).slice(3,6).forEach(r=>{if(r&&r[0])tgt[String(r[0]).trim()]=num(r[1])||30});
  const rows=P.slice(3).filter(r=>get(r,"Name"));
  for(const r of rows){
    const st=get(r,"Status")||"To send",sent=cellDate(get(r,"Sent on")),fu1=cellDate(get(r,"FU1 sent")),sig=cellDate(get(r,"Signal time"));
    if(sent&&day0(sent)===today.getTime()){const o=get(r,"Owner");sentToday[o]=(sentToday[o]||0)+1}
    put(r,"FU1 due",sent?fmtDay(new Date(sent.getTime()+3*DAY)):"");
    put(r,"FU2 due",fu1?fmtDay(new Date(fu1.getTime()+7*DAY)):"");
    put(r,"Hours to first touch",sent&&sig?Math.max(0,Math.round((sent-sig)/36e5)):"");
    let pri=0;
    if(!closed.has(st)){
      pri=num(get(r,"Fit (1-10)"))||0;
      if(/^warm/i.test(get(r,"Warm/Cold")))pri+=5;
      if(sig){const age=(now-sig)/DAY;if(age<=1)pri+=4;else if(age<=3)pri+=2}
      if(st==="Replied")pri+=6;
      pri+=SEG[get(r,"Segment")]||0;
      pri-=3*Math.max(0,(num(get(r,"Contact # at company"))||1)-1);
    }
    put(r,"Priority",pri);r.$st=st;r.$pri=pri;
  }
  const ready=r=>!get(r,"Name").includes("***")&&!(/x dm/i.test(get(r,"Channel"))&&!get(r,"X handle"));
  const queue={};
  for(const r of rows)if(r.$st==="To send"&&ready(r))(queue[get(r,"Owner")]=queue[get(r,"Owner")]||[]).push(r);
  for(const o in queue)queue[o].sort((a,b)=>b.$pri-a.$pri).forEach((r,k)=>{r.$q=k+1});
  const due=(d,a,b)=>{if(!d)return "Wait";const x=day0(d);return x===today.getTime()?a:x<today.getTime()?b:"Wait"};
  for(const r of rows){
    const st=r.$st,name=get(r,"Name"),o=get(r,"Owner"),warm=/^warm/i.test(get(r,"Warm/Cold"));let na;
    if(st==="On hold")na="On hold (DMs paused)";
    else if(paused&&["To send","Sent","FU1 sent","FU2 sent"].includes(st))na="Paused";
    else if(closed.has(st))na="Closed";
    else if(st==="Call booked")na="Prep the call";
    else if(st==="Replied")na="Reply now";
    else if(st==="To send"){
      if(name.includes("***"))na="Enrich name first";
      else if(/x dm/i.test(get(r,"Channel"))&&!get(r,"X handle"))na="Find X handle first";
      else{const left=Math.max(0,(tgt[o]||30)-(sentToday[o]||0));na=r.$q&&r.$q<=left?(warm?"Send today · warm":"Send today"):"Queued"}
    }
    else if(st==="Sent"){const d=cellDate(get(r,"Sent on"));na=due(d&&new Date(d.getTime()+3*DAY),"Send FU1 today","FU1 overdue")}
    else if(st==="FU1 sent"){const d=cellDate(get(r,"FU1 sent"));na=due(d&&new Date(d.getTime()+7*DAY),"Send FU2 today","FU2 overdue")}
    else if(st==="FU2 sent"){const d=cellDate(get(r,"FU2 sent"));na=d&&now-d>=7*DAY?"Mark No reply":"Wait"}
    else na="Wait";
    put(r,"Next action",na);put(r,"Queue #",r.$q||"");put(r,"Ready",/^Send today/.test(na)?"Yes":"");
    put(r,"Sort key",String(1000-r.$pri).padStart(4,"0")+"|"+name);
    delete r.$st;delete r.$pri;delete r.$q;
  }
  if(!T)return;
  for(let i=3;i<6;i++){const r=T[i];if(!r||!r[0])continue;const a=String(r[0]).trim(),mine=rows.filter(x=>get(x,"Owner")===a);
    const sent=mine.filter(x=>get(x,"Sent on")).length,rep=mine.filter(x=>get(x,"Replied on")).length,target=num(r[1])||30,na=x=>get(x,"Next action");
    const vals=[r[1]||"30",sentToday[a]||0,Math.max(0,target-(sentToday[a]||0)),mine.filter(x=>/^Send today/.test(na(x))).length,
      mine.filter(x=>/FU[12]/.test(na(x))&&/(overdue|today)/.test(na(x))).length,mine.filter(x=>na(x)==="Reply now").length,
      sent,sent?Math.round(rep/sent*100)+"%":"",mine.filter(x=>get(x,"Call on")).length];
    while(r.length<11)r.push("");vals.forEach((v,k)=>{r[1+k]=String(v)})}
  const th=(T[9]||[]).map(x=>String(x||"").trim()),ti=k=>th.indexOf(k);
  for(let i=10;i<T.length;i++){const r=T[i];if(!r||ti("ID")<0||!r[ti("ID")])continue;const id=String(r[ti("ID")]).trim(),used=rows.filter(x=>get(x,"Template")===id);
    const sent=used.filter(x=>get(x,"Sent on")).length,rep=used.filter(x=>get(x,"Replied on")).length;
    const set=(k,v)=>{const j=ti(k);if(j<0)return;while(r.length<=j)r.push("");r[j]=String(v)};
    set("Words",String(r[ti("Opener")]||"").split(/\s+/).filter(Boolean).length);set("Sent",sent);set("Replies",rep);
    set("Reply rate",sent?Math.round(rep/sent*100)+"%":"");set("Calls",used.filter(x=>get(x,"Call on")).length)}
}
async function publicLoad(){
  if(!sb||!session||!member)return;
  S.lastLoad=Date.now();
  let grids;
  try{grids=await loadGrids()}catch(e){for(const k in RANGES)if(!S.raw[k])S.err[k]=e;build();emit();return}
  for(const key in RANGES){
    const r=parseRange(RANGES[key]),g=grids[r.tab]||[];
    S.raw[key]=trimGrid(g.slice(r.r0,r.r1+1).map(row=>row.slice(r.c0,r.c1+1).map(v=>v==null?"":v)));
    S.at[key]=Date.now();S.err[key]=null;
  }
  LI.id=settingsFrom(grids.Settings)["LinkedIn sheet"]||null;
  if(!LI.id)LI.err=new Error("No LinkedIn sheet is set up yet. Add LINKEDIN_SHEET_ID to .env.local and run pnpm db:setup.");
  build();emit();
  if(LI.id)liLoad();
  leadsLoad();
  if(!XJ.loadedAt||Date.now()-XJ.loadedAt>5*6e4){XJ.loadedAt=Date.now();xRunsLoad()}
  if(!LIS.at||Date.now()-LIS.at>10*6e4){LIS.at=Date.now();lisLoad()}
  if(!LBT.at||Date.now()-LBT.at>2*6e4){LBT.at=Date.now();lbtLoad()}
  if(!BR.at||Date.now()-BR.at>15*6e4){BR.at=Date.now();briefLoad()}
  if(!XT.at||Date.now()-XT.at>2*6e4){XT.at=Date.now();xtLoad()}
}
/* Live read (29 Oct): the published copy lags about 5 minutes, so Refresh and every save read the sheet live through the
   Apps Script ("read") and keep doing so every 20 seconds for 6 minutes; after that it's the published copy every minute. */
async function liveLoad(){await publicLoad()}
const goLive=()=>{S.liveUntil=Date.now()+36e4;return liveLoad().catch(()=>publicLoad())};
let ticks=0;
function poll(){if(typeof document!=="undefined"&&document.hidden)return;ticks++;if(Date.now()<(S.liveUntil||0))return liveLoad().catch(()=>{});if(ticks%3===0)return publicLoad()}
// A hidden tab doesn't poll (13 Nov, bandwidth); when it comes back after a minute or more it loads what changed meanwhile.
if(typeof document!=="undefined")document.addEventListener("visibilitychange",()=>{if(!document.hidden&&session&&member&&Date.now()-(S.lastLoad||0)>6e4)publicLoad()});
// Refresh: reload the sheet now and ask the team's computer to run the post tracker (new numbers and replies from X).
// (13 Nov) Refresh covers every channel: X (post tracker), LinkedIn (asks the extension to read our posts' numbers and
// engagers now, and reloads the queue sheet) and Instagram (DM threads), then reloads leads, tasks and post numbers.
async function refresh(){
  if(S.pub){
    toast("Refreshing X, LinkedIn and Instagram. New numbers land over the next few minutes.");
    S.refreshing=Date.now();emit();incForget();BR.at=0;LIS.at=0;XJ.loadedAt=0;
    const li=sb.functions.invoke("li-bot",{body:{action:"refresh"}}).then(({data})=>{S.liAsk=data||null;}).catch(()=>{});
    const jobs=[xRun("x-engage",true,{manual:true}),igRun(true),li,scriptCall({action:"refresh"}).catch(()=>{})];
    await goLive();liLoad(true);leadsLoad();LBT.at=0;XT.at=0;
    await Promise.allSettled(jobs);
    leadsLoad();S.refreshing=0;emit();
    const m=S.liAsk&&S.liAsk.extension_seen_min;
    toast("X and Instagram are up to date. "+(m!=null&&m<30?"LinkedIn numbers come in from your Chrome within about 5 minutes.":"LinkedIn numbers come in once the Outreach Bot extension is running in your Chrome."));
    return;
  }
  if(!S.mcp)return;
  try{await S.mcp.invalidate(SERVER,"get_values")}catch(e){}
  toast("Reloading from the Google Sheet…");
}
async function allow(){
  if(!S.mcp)return;
  try{
    const r=await S.mcp.callTool(SERVER,"get_values",{spreadsheetId:SHEET_ID,range:RANGES.pipeline});
    ingest("pipeline",r);build();
    try{await S.mcp.invalidate(SERVER,"get_values")}catch(e){}
  }catch(e){S.err.pipeline=e}
  emit();
}
// Funding stage from the sheet. Team rule: only DM companies at Series A or later.
function fundKind(c){
  const f=String(c["Funding stage"]||"");
  if(!f)return "";
  if(/^(series|public|acquired)/i.test(f))return "ok";
  if(/^(seed|pre-seed)/i.test(f))return "early";
  return "unknown";
}
const sendable=c=>true;   // 9 Nov: the ICP is pre-seed to Series C, so funding no longer holds anyone back
function messages(c){
  const t=M.templates.find(x=>x.ID===c.Template)||{};
  const fn=firstName(c.Name);
  const hook=String(c.Hook||"").trim();
  const fill=s=>String(s||"").replace(/\[first name\]/gi,fn).replace(/\[company\]/gi,c.Company&&!/^unknown$/i.test(c.Company)?c.Company:"your company")
    .replace(/\s*\[hook\]\s*/gi,hook?" "+hook+" ":" ").replace(/ {2,}/g," ").replace(/^ | $/g,"");
  return {opener:pick(c,"Opener")||fill(t.Opener),fu1:fill(pick(t,"Follow-up 1")),fu2:fill(pick(t,"Follow-up 2"))};
}

/* ---------- writes (DM Pipeline: plain columns only) ---------- */
function statusCells(c,s){
  const cells={Status:s};const now=new Date();
  if(s==="Sent"&&!c["Sent on"])cells["Sent on"]=sheetSerial(now,true);
  if(s==="FU1 sent"&&!c["FU1 sent"])cells["FU1 sent"]=sheetSerial(now,false);
  if(s==="FU2 sent"&&!c["FU2 sent"])cells["FU2 sent"]=sheetSerial(now,false);
  if(s==="Replied"&&!c["Replied on"])cells["Replied on"]=sheetSerial(now,false);
  return cells;
}
// The cells to write back to undo a save: each cell's value from before, dates as sheet serial numbers.
function undoCells(c,cells){
  const out={};
  for(const k of Object.keys(cells)){
    if(!WRITABLE.has(k))continue;
    const v=c[k]==null?"":String(c[k]);
    if(k==="Status"){out[k]=c.Status||"";continue}
    if(k==="Notes"||!v){out[k]=v;continue}
    const d=cellDate(v);out[k]=d?sheetSerial(d,k==="Sent on"||k==="Call on"):v;
  }
  return out;
}
function writeError(e){
  switch(e&&e.code){
    case "row_moved":return "That person's row moved in the sheet (someone sorted or added rows). The list is reloading; try again in a moment.";
    case "tool_error":return "Google Sheets refused the save. Check that your Google account can edit the Aktoria sheet.";
    case "approval_required":case "consent_required":return "This page needs your OK to use Google Sheets. Allow it when claude.ai asks, then try again.";
    case "not_in_manifest":return "Google Sheets is turned off for this page. Turn it on in the artifact's Permissions menu.";
    case "needs_reauth":return "Your Google Sheets connection expired. Reconnect it in claude.ai Settings → Connectors.";
    case "server_not_connected":case "selection_required":return "Add the Google Sheets connector in claude.ai Settings → Connectors, then reload.";
    case "blocked_by_policy":return "Your organization blocks Google Sheets changes from artifacts.";
    case "server_unavailable":case "upstream_error":return "Google Sheets didn't confirm the save. Reloading so you can see whether it went through.";
    default:return "Couldn't save"+(e&&e.code?" ("+e.code+")":"")+". Nothing else was changed.";
  }
}
async function write(c,cells,label,opt){
  opt=opt||{};
  const mcp=S.mcp;
  if((!mcp&&!S.pub)||S.busy.has(c._key))return false;
  S.busy.add(c._key);emit();
  let ok=false;
  if(!mcp){
    // Public page: the Apps Script checks the row's name and company, then writes only the plain columns.
    try{
      const keep={};for(const k of Object.keys(cells))if(WRITABLE.has(k))keep[k]=cells[k];
      await scriptCall({action:"pipeline",row:c._row,name:c.Name,company:c.Company,cells:keep});
      const prev=S.pipeLocal[c._row];
      S.pipeLocal[c._row]={cells:Object.assign({},prev&&prev.name===c.Name?prev.cells:{},keep),at:Date.now(),name:c.Name};
      build();ok=true;if(!opt.quiet)toast("Saved: "+label);
      publicLoad();
    }catch(e){toast("Couldn't save: "+(e&&e.message||e),true)}
    S.busy.delete(c._key);emit();
    return ok;
  }
  try{
    const ni=M.headers.indexOf("Name"),ci=M.headers.indexOf("Company");
    if(ni<0||ci<0)throw {code:"row_moved"};
    const a=Math.min(ni,ci),b=Math.max(ni,ci);
    const chk=await mcp.callTool(SERVER,"get_values",{spreadsheetId:SHEET_ID,range:PIPE_TAB+"!"+col(a)+c._row+":"+col(b)+c._row},{cache:false});
    const v=((payloadOf(chk)||{}).values||[])[0]||[];
    const nm=String(v[ni-a]==null?"":v[ni-a]).trim(),co=String(v[ci-a]==null?"":v[ci-a]).trim();
    if(nm!==c.Name||co!==c.Company)throw {code:"row_moved"};
    const ent=Object.keys(cells).filter(k=>WRITABLE.has(k)).map(k=>({k,i:M.headers.indexOf(k),val:cells[k]})).filter(x=>x.i>=0).sort((x,y)=>x.i-y.i);
    const runs=[];
    for(const e of ent){const last=runs[runs.length-1];if(last&&e.i===last.end+1){last.end=e.i;last.vals.push(e.val)}else runs.push({start:e.i,end:e.i,vals:[e.val]})}
    for(const r of runs){
      await mcp.callTool(SERVER,"update_values",{spreadsheetId:SHEET_ID,range:PIPE_TAB+"!"+col(r.start)+c._row+":"+col(r.end)+c._row,values:[r.vals]},{cache:false});
    }
    for(const e of ent)c[e.k]=typeof e.val==="number"?fmtSerial(e.val,e.k==="Sent on"||e.k==="Call on"):e.val;
    if(cells.Status){c.Status=cells.Status;c._status=cells.Status||"To send";c["Next action"]="Updating…"}
    ok=true;
    if(!opt.quiet)toast("Saved: "+label);
  }catch(e){toast(writeError(e),true)}
  finally{
    S.busy.delete(c._key);
    try{await mcp.invalidate(SERVER,"get_values",{spreadsheetId:SHEET_ID,range:RANGES.pipeline})}catch(e){}
    emit();
  }
  return ok;
}

/* ---------- our posts ---------- */
// Where a planned post stands: posted (has its link), scheduled, parked for later, or still to post.
function postStage(p){
  if(safeUrl(p["Posted link"]))return "posted";
  if(/^scheduled/i.test(p.Status||""))return "scheduled";
  if(/^later/i.test(p.Date||"")||/^later/i.test(p.Status||""))return "later";
  return "topost";
}
function minutesOf(t){const m=String(t||"").match(/(\d{1,2}):(\d{2})\s*([AP]M)?/i);if(!m)return 0;let hr=+m[1]%12;if(!m[3]&&+m[1]>=12)hr=+m[1];if(m[3]&&/pm/i.test(m[3]))hr+=12;
  // Slots after midnight belong to the same evening's run.
  if(hr<6)hr+=24;return hr*60+ +m[2]}
const linkKey=u=>String(u||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^(www\.|mobile\.)/,"").replace(/^twitter\.com/,"x.com").replace(/[?#].*$/,"").replace(/\/+$/,"");
function originalFor(p){const k=linkKey(p["Their link"]);return k?M.theirs.find(t=>linkKey(t.Link)===k)||null:null}
function copiesOf(t){const k=linkKey(t.Link);return k?M.ours.filter(p=>linkKey(p["Their link"])===k):[]}
const rate=(eng,views)=>eng!=null&&views?Math.round(eng/views*10000)/10:null;
function ourEng(p){const v=[p.Likes,p.Replies,p.Reposts,p.Quotes,p.Bookmarks].map(num).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0):null}
/* ---------- new-post alerts (remembered per viewer) ---------- */
const NEW_DAYS=3;
const seenMap=()=>store.get("seen",{});
function markSeen(name){const m=seenMap();m[norm(name)]=Date.now();store.set("seen",m)}
function isNew(p){
  if(!p._date)return false;
  const name=p._comp?p._comp.Name:p.Competitor;
  const since=Math.max(Date.now()-NEW_DAYS*864e5,seenMap()[norm(name)]||0);
  return p._date.getTime()+864e5>since&&Date.now()-p._date.getTime()<NEW_DAYS*864e5;
}
const newPosts=()=>M.theirs.filter(isNew).sort((a,b)=>b._date-a._date);
/* ---------- mark posted / scheduled / messaged (claude.ai: the Sheets connector; public page: the sheet's Apps Script) ---------- */
function ourPostLink(raw,account){
  const li=String(raw||"").trim().match(/^https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:posts|feed\/update)\/[^\s?#]+/i);
  if(li)return li[0];
  const m=String(raw||"").trim().match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/i);
  const hd=HANDLES[account];
  return m&&hd&&m[1].toLowerCase()===hd.toLowerCase()?"https://x.com/"+hd+"/status/"+m[2]:null;
}
async function scriptCall(body){
  if(!sb||!session)throw new Error("Sign in first");
  const {data,error}=await sb.rpc("crm_call",{body});
  if(error)throw new Error(error.message||"The database didn't answer");
  const text=String(data==null?"":data);
  if(/^bad pass/.test(text))throw new Error("This email isn't on the team list, so nothing was saved");
  if(!/^ok/.test(text))throw new Error(text||"The database didn't answer");
  return text;
}
const canEdit=()=>!!session&&!!member;
const putCells=(range,values)=>S.mcp.callTool(SERVER,"update_values",{spreadsheetId:SHEET_ID,range,values},{cache:false});
const reloadRange=key=>{if(S.mcp){try{S.mcp.invalidate(SERVER,"get_values",{spreadsheetId:SHEET_ID,range:RANGES[key]})}catch(e){}}};
async function savePosted(p,raw,opt){
  opt=opt||{};
  const link=ourPostLink(raw,p.Account);
  if(!link){toast("That isn't a post from @"+(HANDLES[p.Account]||"?")+". Paste the link of the post itself (x.com/…/status/…).",true);return false}
  if(S.busy.has(p._key))return false;
  S.busy.add(p._key);emit();let ok=false;
  try{
    if(S.mcp){await putCells("'Our Posts'!O"+p._row,[["Posted"]]);await putCells("'Our Posts'!Q"+p._row,[[link]])}
    else await scriptCall({action:"posted",row:p._row,link});
    S.postedLocal[p._row]=link;build();ok=true;
    if(!opt.quiet)toast("Marked as posted. Views, likes and replies show up in the Post tracker within 3 hours.");
  }catch(e){toast("Couldn't save: "+(e&&e.message||e),true)}
  S.busy.delete(p._key);emit();return ok;
}
async function saveMessaged(e,opt){
  opt=opt||{};
  const when=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  if(S.busy.has(e._key))return false;
  S.busy.add(e._key);emit();let ok=false;
  try{
    if(S.mcp)await putCells("'Post Engagers'!P"+e._row+":Q"+e._row,[["Messaged",when]]);
    else await scriptCall({action:"messaged",row:e._row,handle:e.Handle});
    S.messagedLocal[e._row]={when,at:Date.now()};build();ok=true;
    if(!opt.quiet)toast("Marked "+(e.Name||e.Handle)+" as messaged.");
  }catch(err){toast("Couldn't save: "+(err&&err.message||err),true)}
  S.busy.delete(e._key);emit();return ok;
}
/* Clear a reply off the to-do lists (x): Status "Dismissed"; Undo puts the old status back. */
async function saveEngager(e,status){
  const prev=e.Status||"To message";
  S.messagedLocal[e._row]={undo:true,status,when:e["Messaged on"]||"",at:Date.now()};build();emit();
  try{
    if(S.mcp)await putCells("'Post Engagers'!P"+e._row,[[status]]);
    else await scriptCall({action:"engager",row:e._row,handle:e.Handle,status});
    if(S.pub)goLive();else reloadRange("engagers");
    return prev;
  }catch(err){delete S.messagedLocal[e._row];build();emit();toast("Couldn't save: "+(err&&err.message||err),true);return false}
}
/* Engaged page (9 Nov): "Done" puts the person in DM Pipeline as Contacted and marks them messaged here. */
async function engagerToPipeline(e){
  if(S.busy.has(e._key))return false;
  S.busy.add(e._key);const when=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  S.messagedLocal[e._row]={when,at:Date.now()};build();emit();let ok=false;
  try{await scriptCall({action:"engagerToPipeline",row:e._row,handle:e.Handle});ok=true;toast((e.Name||e.Handle)+" is in the Pipeline as Contacted.");goLive();}
  catch(err){delete S.messagedLocal[e._row];build();toast("Couldn't save: "+(err&&err.message||err),true)}
  S.busy.delete(e._key);emit();return ok;
}
async function saveScheduled(p,on,opt){
  opt=opt||{};
  const status=on?"Scheduled":"Ready to post";
  if(S.busy.has(p._key))return false;
  S.busy.add(p._key);emit();let ok=false;
  try{
    if(S.mcp)await putCells("'Our Posts'!O"+p._row,[[status]]);
    else await scriptCall({action:"scheduled",row:p._row,on:!!on});
    S.statusLocal[p._row]={status,at:Date.now()};build();ok=true;
    if(!opt.quiet)toast(on?"Moved to Scheduled. Add its link there once it's live.":"Moved back to To post.");
  }catch(e){toast("Couldn't save: "+(e&&e.message||e),true)}
  S.busy.delete(p._key);emit();return ok;
}
/* Pause / resume all DMs: one switch, 'DM Templates'!K4. While it's on, the sheet's Next action says "Paused" for
   every unsent or waiting row, so nothing shows as ready to send or follow-up due (replies still show). */
function dmsPaused(){
  const l=S.pausedLocal;if(l&&Date.now()-l.at<6e5)return l.on;
  return String((M.stats[0]||{})["DMs paused"]||"").toUpperCase()==="TRUE";
}
async function savePaused(on){
  if(S.busy.has("pause"))return false;
  S.busy.add("pause");emit();let ok=false;
  try{
    if(S.mcp)await putCells("'DM Templates'!K4",[[!!on]]);
    else await scriptCall({action:"pause",on:!!on});
    S.pausedLocal={on:!!on,at:Date.now()};ok=true;
    reloadRange("stats");reloadRange("pipeline");if(S.pub)publicLoad();
    toast(on?"DMs paused. Nothing shows as ready to send until you press Resume.":"DMs are back on. Send today fills up again.");
  }catch(e){toast("Couldn't save: "+(e&&e.message||e),true)}
  S.busy.delete("pause");emit();return ok;
}
/* DM scripts (9 Nov): edit a version or add one. DM Templates rows 11 on; the page shows the saved text straight away. */
async function saveTpl(t,fields){
  const k="tpl:"+t.ID;if(S.busy.has(k))return false;
  S.busy.add(k);emit();let ok=false;
  try{await scriptCall(Object.assign({action:"tplSave",row:t._row,id:t.ID},fields));Object.assign(t,{Intent:fields.intent??t.Intent,"Use it for":fields.use??t["Use it for"],Opener:fields.opener??t.Opener,Verdict:fields.verdict??t.Verdict});
    if(fields.fu1!=null)for(const h in t)if(h.indexOf("Follow-up 1")===0)t[h]=fields.fu1;
    if(fields.fu2!=null)for(const h in t)if(h.indexOf("Follow-up 2")===0)t[h]=fields.fu2;
    ok=true;toast("Saved "+t.ID+". New messages use it straight away.");publicLoad();}
  catch(e){toast("Couldn't save: "+(e&&e.message||e),true)}
  S.busy.delete(k);emit();return ok;
}
async function addTpl(fields){
  if(S.busy.has("tpl:new"))return false;
  S.busy.add("tpl:new");emit();let ok=false;
  try{await scriptCall(Object.assign({action:"tplAdd"},fields));ok=true;toast("Added "+fields.id+". New leads start getting it in turn.");await publicLoad();}
  catch(e){toast("Couldn't add: "+(e&&e.message||e),true)}
  S.busy.delete("tpl:new");emit();return ok;
}
/* Delete a post from the CRM: Status "Deleted" (never deletes anything on X). Undo puts the old status back. */
const snip=t=>String(t||"").replace(/\s+/g," ").trim().slice(0,40);
async function deletePost(p){
  if(S.busy.has(p._key))return false;
  S.busy.add(p._key);emit();let ok=false;const prev=p.Status||"";
  try{
    if(S.mcp)await putCells("'Our Posts'!O"+p._row,[["Deleted"]]);
    else await scriptCall({action:"deletePost",row:p._row,snippet:snip(p["Our version"])});
    S.statusLocal[p._row]={status:"Deleted",at:Date.now()};build();ok=true;
    if(S.pub)goLive();else reloadRange("ours");
  }catch(e){toast("Couldn't delete: "+(e&&e.message||e),true)}
  S.busy.delete(p._key);emit();return ok?prev:false;
}
async function undeletePost(row,prev){
  try{
    if(S.mcp)await putCells("'Our Posts'!O"+row,[[prev||"Ready to post"]]);
    else await scriptCall({action:"restorePost",row,status:prev||"Ready to post"});
    S.statusLocal[row]={status:prev||"Ready to post",was:"Deleted",at:Date.now()};build();emit();
    if(S.pub)goLive();else reloadRange("ours");return true;
  }catch(e){toast("Couldn't undo: "+(e&&e.message||e),true);return false}
}
/* Calendar: put posts on a day and time, or time "Option" to take one off the calendar (it stays a draft).
   moves = [{o, date:"D Mon YYYY", time, status?}]. Returns the previous values (for Undo) or false. */
async function movePosts(moves){
  if(!moves.length)return [];
  if(S.busy.has("move"))return false;
  S.busy.add("move");let ok=true;
  const prev=moves.map(m=>({o:m.o,date:m.o.Date,time:m.o["Time (IST)"]||"Option",status:m.status?m.o.Status:""}));
  moves.forEach(m=>{S.moveLocal[m.o._row]={date:m.date,time:m.time,status:m.status||"",at:Date.now()}});build();emit();
  try{
    for(const m of moves){
      if(S.mcp){await putCells("'Our Posts'!B"+m.o._row+":C"+m.o._row,[[m.date,m.time]]);if(m.status)await putCells("'Our Posts'!O"+m.o._row,[[m.status]])}
      else await scriptCall({action:"movePost",row:m.o._row,snippet:snip(m.o["Our version"]),date:m.date,time:m.time,status:m.status||""});
    }
    if(S.pub)goLive();else reloadRange("ours");
  }catch(e){ok=false;moves.forEach(m=>delete S.moveLocal[m.o._row]);build();toast("Couldn't save the calendar change: "+(e&&e.message||e),true)}
  S.busy.delete("move");emit();return ok?prev:false;
}
/* Add a post by hand (one the drafts didn't suggest). With a link it's Posted and the tracker follows it. */
async function addPost(f){
  if(S.busy.has("add"))return false;
  S.busy.add("add");emit();let ok=false;
  try{
    const link=f.link?ourPostLink(f.link,f.account):"";
    if(f.link&&!link)throw new Error("that isn't a post from @"+(HANDLES[f.account]||"?")+". Paste the link of the post itself (x.com/…/status/…)");
    if(!link&&!String(f.text||"").trim())throw new Error("add the post text or its link");
    if(S.mcp){
      const when=f.date?new Date(f.date):new Date();const row=3+(S.raw.ours||[]).length;
      const week="W"+Math.max(1,Math.floor((when-new Date(2026,9,25))/6048e5)+1);
      const date=when.getDate()+" "+MON[when.getMonth()]+" "+when.getFullYear();
      await putCells("'Our Posts'!A"+row+":Q"+row,[[week,date,f.time||"",f.account,"X",f.type||"Own post","Our own","","",f.text||"",
        "Added by hand in the CRM","","","",link?"Posted":f.status==="Scheduled"?"Scheduled":"Ready to post","",link]]);
      reloadRange("ours");
    }else{await scriptCall(Object.assign({action:"addPost"},f,{link}));goLive()}
    ok=true;toast(link?"Added. The tracker picks up its numbers and replies on its next run (or press Refresh).":"Added to "+(f.status==="Scheduled"?"Scheduled":"To post")+".");
  }catch(e){toast("Couldn't add: "+(e&&e.message||e),true)}
  S.busy.delete("add");emit();return ok;
}
/* ---------- calendar (31 Oct) ----------
   A post is on the calendar only when its Our Posts column Z (Calendar) says "Yes": nothing lands there on its own.
   Every card edit saves straight to its row; edits wait in a queue so a new card gets its row before anything else is written. */
const CAL_COLS={date:["Date","B"],time:["Time (IST)","C"],type:["Post type","F"],text:["Our version","J"],media:["Media file","N"],
  status:["Status","O"],link:["Posted link","Q"],aimed:["Aimed at","Y"],cal:["Calendar","Z"],slot:["Daily slot","AB"]};
// Saved card fields show at once and stay until the sheet reads them back (or 10 minutes pass).
function calOverlay(r,key){
  const loc=S.calLocal[key];if(!loc)return;
  if(!r._temp&&(Date.now()-loc.at>6e5||Object.keys(loc.f).every(k=>String(r[CAL_COLS[k][0]]||"")===String(loc.f[k])))){if(!loc.pending)delete S.calLocal[key];return}
  for(const k in loc.f)r[CAL_COLS[k][0]]=loc.f[k];
}
const weekOf=ds=>{const d=parseDate(ds);return "W"+Math.max(1,Math.floor(((d||new Date())-PILOT.start)/6048e5)+1)};
const rawText=row=>{const g=S.raw.ours||[];const r=g[row-3];return r?snip(r[9]):""};
let calQ=Promise.resolve();
function queue(fn){const run=calQ.then(fn);calQ=run.then(()=>{},()=>{});return run}
// A new card for an account on a day ("D Mon YYYY"); time is IST ("7:30 PM") or blank. Returns the card's id.
function calNew(account,date,time,platform,slot){
  const key="n"+Date.now().toString(36);platform=platform==="LinkedIn"?"LinkedIn":"X";
  const t={key,account,date,time:time||"",row:null,platform,slot:slot||""};
  S.calTemp.push(t);build();emit();
  t.ready=queue(async()=>{
    let row;
    if(S.mcp){
      row=3+(S.raw.ours||[]).length;
      await putCells("'Our Posts'!A"+row+":Z"+row,[[weekOf(date),date,time||"",account,platform,"","Our own","","","","Added in the calendar","","","","Draft",
        "","","","","","","","","","","Yes"]]);
    }else row=Number(String(await scriptCall({action:"calSave",account,date,time:time||"",cal:"Yes",status:"Draft",platform,slot:slot||""})).split(" ")[1]);
    if(!row)throw new Error("the sheet didn't say which row it used");
    t.row=row;S.calAlias[row]=key;S.calText[row]="";
    if(S.calLocal[key])S.calLocal[row]=S.calLocal[key];
    if(S.pub)goLive();else reloadRange("ours");
    return row;
  }).catch(e=>{toast("Couldn't add the post: "+(e&&e.message||e),true);S.calTemp=S.calTemp.filter(x=>x!==t);build();emit();return null});
  return "o"+key;
}
// Save card fields: {date, time, type, text, media, status, link, aimed, cal}. The card shows them at once.
function calSave(o,fields){
  fields=Object.assign({},fields);
  if(fields.link){const l=ourPostLink(fields.link,o.Account);
    if(!l){toast("That isn't a post from @"+(HANDLES[o.Account]||"?")+". Paste the link of the post itself (x.com/…/status/…).",true);return Promise.resolve(false)}
    fields.link=l;fields.status="Posted"}
  const key=o._row;
  const loc=S.calLocal[key]=S.calLocal[key]||{f:{}};Object.assign(loc.f,fields);loc.at=Date.now();loc.pending=(loc.pending||0)+1;
  build();emit();
  return queue(async()=>{
    let row=o._row;
    if(o._temp){const t=S.calTemp.find(x=>x.key===o._row);row=t?(t.row||await t.ready):Number(Object.keys(S.calAlias).find(r=>S.calAlias[r]===o._row)||0)}
    if(!row)return false;
    if(key!==row)S.calLocal[row]=S.calLocal[key];
    if(S.mcp){
      for(const k in fields){await putCells("'Our Posts'!"+CAL_COLS[k][1]+row,[[fields[k]]]);if(k==="date")await putCells("'Our Posts'!A"+row,[[weekOf(fields.date)]])}
    }else await scriptCall(Object.assign({action:"calSave",row,snippet:S.calText[row]!=null?S.calText[row]:rawText(row)},fields));
    if("text" in fields)S.calText[row]=snip(fields.text);
    loc.pending--;loc.at=Date.now();
    if(S.pub)goLive();else reloadRange("ours");
    return true;
  }).catch(e=>{toast("Couldn't save: "+(e&&e.message||e),true);loc.pending=0;for(const k in fields)delete loc.f[k];build();emit();return false});
}
// Upload a photo or clip for a card to the team's Drive and attach it (column N, one Drive link per line).
const mediaIds=s=>String(s||"").split(/\s+/).map(x=>{const m=x.match(/(?:\/d\/|[?&]id=)([\w-]{20,})/);if(m)return m[1];
  return /^https:\/\/\S+\/storage\/v1\/object\/public\//.test(x)?x:null}).filter(Boolean);
const mediaThumb=m=>/^https?:/.test(m)?m:"https://drive.google.com/thumbnail?id="+m+"&sz=w600";
const mediaOpen=m=>/^https?:/.test(m)?m:"https://drive.google.com/file/d/"+m+"/view";
async function calUpload(o,file){
  if(!sb||!session){toast("Sign in to upload.",true);return false}
  if(file.size>25e6){toast("That file is over 25 MB. Upload a smaller version.",true);return false}
  const k="up"+o._key;S.busy.add(k);emit();
  try{
    const path=Date.now().toString(36)+"-"+String(file.name||"upload").replace(/[^\w.\-]+/g,"_").slice(-80);
    const {error}=await sb.storage.from("crm-media").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
    if(error)throw error;
    const url=sb.storage.from("crm-media").getPublicUrl(path).data.publicUrl;
    const cur=String(o["Media file"]||"").trim();
    return await calSave(o,{media:(cur?cur+"\n":"")+url});
  }catch(e){toast("Couldn't upload: "+(e&&e.message||e),true);return false}
  finally{S.busy.delete(k);emit()}
}

/* Undo on claude.ai: put the exact cells back (the public page's Apps Script has no action that can do this). */
const canRestore=()=>!!S.mcp;
async function restorePost(p,prevStatus,prevLink){
  if(!S.mcp)return false;
  try{
    await putCells("'Our Posts'!O"+p._row,[[prevStatus||""]]);
    await putCells("'Our Posts'!Q"+p._row,[[prevLink||""]]);
    delete S.postedLocal[p._row];S.statusLocal[p._row]={status:prevStatus||"",at:Date.now()};build();emit();reloadRange("ours");return true;
  }catch(e){toast("Couldn't undo: "+(e&&e.message||e.code||e),true);return false}
}
async function restoreMessaged(e,prevStatus,prevWhen){
  if(!S.mcp)return false;
  try{
    await putCells("'Post Engagers'!P"+e._row+":Q"+e._row,[[prevStatus||"",prevWhen||""]]);
    S.messagedLocal[e._row]={undo:true,status:prevStatus||"",when:prevWhen||"",at:Date.now()};build();emit();reloadRange("engagers");return true;
  }catch(err){toast("Couldn't undo: "+(err&&err.message||err.code||err),true);return false}
}

/* ---------- derived lists (same rules as the previous CRM) ---------- */
function typeStats(posts){
  const by=new Map();
  for(const p of posts){const t=p["Post type"];if(!t||p._eng==null)continue;if(!by.has(t))by.set(t,[]);by.get(t).push(p._eng)}
  return Array.from(by,([type,v])=>({type,n:v.length,med:median(v)})).filter(x=>x.n>=2).sort((a,b)=>b.med-a.med);
}
// Biggest posts we haven't copied yet: X by views first, then LinkedIn by engagement, at most 3 per account.
// Hiring and funding posts are left out (not pilot priorities).
const SKIP_COPY=/\b(we('re| are) hiring|join (our|the) team|open roles?|raised|funding|seed round|series [a-c]|pre-seed|backed by)\b/i;
function copyNext(limit){
  const copied=new Set(M.ours.map(o=>linkKey(o["Their link"])));
  const per=new Map(),out=[];
  const list=M.theirs.filter(t=>!copied.has(linkKey(t.Link))&&t._eng!=null&&t["Post type"]!=="Hiring"&&!SKIP_COPY.test(t["Full text"]||""))
    .sort((a,b)=>(a._li?1:0)-(b._li?1:0)||viewsOf(b)-viewsOf(a)||b._eng-a._eng);
  for(const t of list){const k=t._comp?t._comp.Name:t.Competitor;if((per.get(k)||0)>=3)continue;per.set(k,(per.get(k)||0)+1);out.push(t);if(out.length>=limit)break}
  return out;
}
function founderAsks(){
  return M.ours.filter(p=>p["Founder question"]&&!/posted/i.test(p.Status||"")).map(p=>({p,later:/^later/i.test(p.Date||"")||/^later/i.test(p.Status||"")}))
    .sort((a,b)=>a.later-b.later);
}
// Latest numbers per post from Post Tracking (filled every 3 hours), joined to its Our Posts row when it came from the plan.
function trackedPosts(){
  const by=new Map();
  for(const r of M.tracking){const k=linkKey(r["Post link"]);if(!by.has(k))by.set(k,[]);by.get(k).push(r)}
  const plan=new Map(M.ours.filter(p=>safeUrl(p["Posted link"])).map(p=>[linkKey(p["Posted link"]),p]));
  const said=new Map(M.engagers.map(e=>[linkKey(e["Our post link"]),e["Our post"]]));
  const engOf=r=>["Likes","Replies","Reposts","Quotes","Bookmarks"].map(c=>num(r[c])||0).reduce((a,b)=>a+b,0);
  const out=[];
  for(const [k,hist] of by){
    hist.sort((a,b)=>a._t-b._t);
    const last=hist[hist.length-1],prev=hist.length>1?hist[hist.length-2]:null,p=plan.get(k)||null;
    const views=num(last.Views),eng=engOf(last);
    out.push({key:k,link:last["Post link"],account:last.Account,plan:p,hist,views,eng,rate:rate(eng,views),
      likes:num(last.Likes)||0,replies:num(last.Replies)||0,reposts:num(last.Reposts)||0,bookmarks:num(last.Bookmarks)||0,
      grew:prev?(views||0)-(num(prev.Views)||0):null,first:p&&p._date?p._date.getTime()+minutesOf(p["Time (IST)"])*6e4:hist[0]._t,
      text:p?p["Our version"]:(said.get(k)||"")});
  }
  for(const [k,p] of plan)if(!by.has(k))out.push({key:k,link:p["Posted link"],account:p.Account,plan:p,hist:[],views:num(p.Views),eng:ourEng(p),
    rate:rate(ourEng(p),num(p.Views)),likes:num(p.Likes)||0,replies:num(p.Replies)||0,reposts:num(p.Reposts)||0,bookmarks:num(p.Bookmarks)||0,
    grew:null,first:p._date?p._date.getTime():0,text:p["Our version"],pending:true});
  return out;
}
const fmtX=x=>(Math.round(x*10)/10)+"×";
const r1=x=>Math.round(x*10)/10;
// Plain reasons a post did well (or didn't), from its own numbers next to the account's other posts.
function whyFor(t,all){
  const out=[];
  const mine=all.filter(x=>x.account===t.account&&x.rate!=null&&(x.views||0)>=30);
  const med=median(mine.map(x=>x.rate));
  if(t.rate!=null&&med&&mine.length>=2){const x=t.rate/med;
    out.push(x>=1.2?fmtX(x)+" the engagement of "+t.account+"'s usual post ("+r1(t.rate)+" vs "+r1(med)+" per 1K views).":
      x<=.8?"Below "+t.account+"'s usual: "+r1(t.rate)+" per 1K views vs "+r1(med)+".":"About "+t.account+"'s usual engagement ("+r1(t.rate)+" per 1K views).")}
  if(t.replies>=3&&t.eng&&t.replies/t.eng>=.3)out.push("It started a conversation: "+t.replies+" replies. The people are under People to DM.");
  if(t.bookmarks>=2&&t.eng&&t.bookmarks/t.eng>=.15)out.push(t.bookmarks+" people saved it, a sign the content was useful.");
  if(t.reposts>=2)out.push(t.reposts+" reposts carried it past our own followers.");
  const p=t.plan;
  if(p){
    const type=p["Post type"],sameType=all.filter(x=>x.plan&&x.plan["Post type"]===type&&x.rate!=null),allR=all.filter(x=>x.rate!=null);
    if(type&&sameType.length>=2&&allR.length>=4){const tm=median(sameType.map(x=>x.rate)),om=median(allR.map(x=>x.rate));
      if(tm&&om&&Math.abs(tm-om)/om>=.1)out.push((/posts?$/i.test(type)?type.replace(/post$/i,"posts"):type+" posts")+" get "+r1(tm)+" per 1K views on average, against "+r1(om)+" for everything we post.")}
    const o=originalFor(p);
    if(o&&o._rank)out.push("It copies "+(o._comp?o._comp.Name:o.Competitor)+"'s #"+o._rank.comp+" post"+(o._rank.comp<=3?" (a proven format)":"")+".");
    const media=String(p["Media needed"]||"");
    out.push(!media||/^none/i.test(media)?"Text only.":"Posted with media ("+media.split(/[.(:]/)[0].trim().toLowerCase()+").");
    const len=String(p["Our version"]||"").length;if(len)out.push(len<240?"Short: "+len+" characters.":"Long: "+len+" characters.");
    if(p["Time (IST)"])out.push("Went out at "+p["Time (IST)"]+" IST.");
  }
  return out;
}
// Patterns across everything posted so far: which type, account and hour do best (same rule as nextMoves).
function patterns(all){
  const rated=all.filter(x=>x.rate!=null&&(x.views||0)>=30);
  if(rated.length<3)return [];
  const best=keyOf=>{const by=new Map();for(const t of rated){const k=keyOf(t);if(!k)continue;if(!by.has(k))by.set(k,[]);by.get(k).push(t.rate)}
    const rows=Array.from(by,([k,v])=>({k,n:v.length,m:median(v)})).filter(r=>r.n>=2).sort((a,b)=>b.m-a.m);
    return rows.length>=2?{top:rows[0],low:rows[rows.length-1]}:null};
  const hourOf=t=>{const m=String((t.plan&&t.plan["Time (IST)"])||"").match(/^(\d{1,2})/);if(!m)return null;const hr=+m[1];return (hr>12?hr-12:hr===0?12:hr)+(hr>=12?" PM":" AM")+" IST"};
  return [["Best post type",best(t=>t.plan&&t.plan["Post type"])],["Best account",best(t=>t.account)],["Best hour",best(hourOf)]]
    .filter(x=>x[1]).map(([label,b])=>({label,k:b.top.k,sub:r1(b.top.m)+" per 1K views over "+b.top.n+" posts (lowest: "+b.low.k+", "+r1(b.low.m)+")"}));
}
// This week, Monday to Friday (Post tracker). Green: 3 posts and engagement grew vs the day before. Red: nothing posted,
// or engagement gained fell by more than half. Yellow: everything in between. Days still to come stay grey.
function weekGrid(accts){
  const start=weekStart(0),days=Array.from({length:5},(_,i)=>new Date(start.getTime()+i*DAY));
  const engAt=(a,t)=>{const last=new Map();for(const r of M.tracking){if(r.Account!==a||r._t>t||/linkedin\.com/i.test(r["Post link"]||""))continue;const k=linkKey(r["Post link"]);const p=last.get(k);if(!p||r._t>p._t)last.set(k,r)}
    let s=0;for(const r of last.values())s+=["Likes","Replies","Reposts","Quotes","Bookmarks"].map(c=>num(r[c])||0).reduce((x,y)=>x+y,0);return s};
  const gained=(a,d)=>engAt(a,d.getTime()+DAY-1)-engAt(a,d.getTime()-1);
  // X only: LinkedIn posts (Platform "LinkedIn") have their own cadence and calendar.
  const postsOn=(a,d)=>M.ours.filter(p=>p.Account===a&&!/linkedin/i.test(p.Platform||"")&&postStage(p)==="posted"&&sameDay(p._date,d)).length;
  const now=new Date();
  return accts.map(a=>({account:a,cells:days.map(d=>{
    if(d.getTime()>now.getTime())return {k:"future",n:null,day:d,tomorrow:sameDay(d,new Date(now.getTime()+DAY))};
    const n=postsOn(a,d),g=gained(a,d),prev=gained(a,new Date(d.getTime()-DAY));
    const k=n===0||(prev>0&&g<prev*.5)?"red":n>=3&&g>=prev?"green":"yellow";
    return {k,n,g,prev,pct:prev>0?Math.round((g-prev)/prev*100):null,today:sameDay(d,now),day:d};
  })}));
}
// The latest day with X DM results ("Sent 28 Oct ..." / "Not sent on X (28 Oct): ...") and what happened that day.
const dayOf=t=>{const m=(t||"").match(/(\d{1,2}) ([A-Z][a-z]{2})/);return m&&MON.indexOf(m[2])>=0?{tag:m[1]+" "+m[2],t:new Date(new Date().getFullYear(),MON.indexOf(m[2]),+m[1]).getTime()}:null};
function dmResults(list){
  const last=list.filter(c=>/^(sent|not sent)/i.test(c["DM result"]||"")).map(c=>dayOf(c["DM result"])).filter(Boolean).sort((a,b)=>b.t-a.t)[0];
  if(!last)return null;
  const sent=list.filter(c=>(c["DM result"]||"").indexOf("Sent "+last.tag)===0);
  const notSent=list.filter(c=>/^not sent/i.test(c["DM result"]||"")&&(c["DM result"]||"").indexOf(last.tag)>=0);
  const why=new Map();
  for(const c of notSent){const r=String(c["DM result"]).replace(/^not sent on x \([^)]*\):\s*/i,"").split(/[,.;]/)[0].trim()||"Other";why.set(r,(why.get(r)||0)+1)}
  return {tag:last.tag,date:new Date(last.t),sent,notSent,why:Array.from(why,([label,n])=>({label,n})).sort((a,b)=>b.n-a.n)};
}

/* ---------- LinkedIn (3 Nov) ----------
   LinkedIn posts go out on their own from the LinkedIn queue sheet, so that sheet stays the source of truth and the CRM
   only reads it: Queue (planned: Date + slot in ET), Posted (what went out, with the live link) and Performance
   (reactions per post). Its id sits in the Settings tab, which only signed-in team members can read, never in this page. */
const LI={id:null,raw:null,at:0,err:null,busy:false};
const LI_TABS={queue:0,posted:1375424099,perf:102,magnets:106,magPeople:107};
function settingsFrom(grid){const out={};(grid||[]).slice(3).forEach(r=>{const k=String((r&&r[0])||"").trim();if(k)out[k]=String((r&&r[1])||"").trim()});return out}
function parseCsv(t){
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<t.length;i++){const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch}
    else if(ch==='"')q=true;else if(ch===","){row.push(cell);cell=""}else if(ch==="\n"){row.push(cell);rows.push(row);row=[];cell=""}else if(ch!=="\r")cell+=ch}
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows;
}
// Reads the three tabs as CSV (every 5 minutes at most, or now when forced by Refresh).
async function liLoad(force){
  if(!LI.id||LI.busy||(!force&&Date.now()-LI.at<3e5))return;
  LI.busy=true;
  try{
    const get=async gid=>{const r=await fetch("https://docs.google.com/spreadsheets/d/"+encodeURIComponent(LI.id)+"/export?format=csv&gid="+gid,{cache:"no-store"});
      const t=r.ok?await r.text():"";if(!r.ok||/^\s*</.test(t))throw new Error("Couldn't read the LinkedIn sheet. Check it's shared as anyone with the link can view.");
      return parseCsv(t)};
    // The lead magnet tabs only feed Leads > Bring in, so a missing one never breaks the calendar or tracker.
    const [queue,posted,perf,magnets,magPeople]=await Promise.all([LI_TABS.queue,LI_TABS.posted,LI_TABS.perf].map(get).concat([LI_TABS.magnets,LI_TABS.magPeople].map(g=>get(g).catch(()=>[]))));
    LI.raw={queue,posted,perf,magnets,magPeople};LI.err=null;
  }catch(e){LI.err=e}
  finally{LI.at=Date.now();LI.busy=false}
  build();emit();
}
// The sheet's slots are US Eastern ("2 (11:30 AM ET)"); the CRM keeps every time in IST.
const ET_TZ="America/New_York",IST_TZ="Asia/Kolkata";
function tzWall(ms,tz){const o={};new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(new Date(ms)).forEach(x=>{o[x.type]=+x.value||0});return {y:o.year,m:o.month-1,d:o.day,H:o.hour%24,M:o.minute}}
function wallMs(y,m,d,H,M,tz){let g=Date.UTC(y,m,d,H,M);for(let i=0;i<2;i++){const p=tzWall(g,tz);g+=Date.UTC(y,m,d,H,M)-Date.UTC(p.y,p.m,p.d,p.H,p.M)}return g}
const t12=(H,M)=>((H%12)||12)+":"+String(M).padStart(2,"0")+" "+(H<12?"AM":"PM");
// The CRM's rule (minutesOf): a time before 6 AM belongs to the night after its Date, so such posts are dated the day before.
function istRow(at){const p=tzWall(at,IST_TZ),d=tzWall(at-(p.H<6?864e5:0),IST_TZ);return {date:d.d+" "+MON[d.m]+" "+d.y,time:t12(p.H,p.M),at}}
// Where a row sits, in IST: its Date plus its slot's ET time; rows without a Date use "Posted at" (also ET: a 2:30 PM ET
// slot shows "14:31" there).
function liWhen(r){
  const dm=String(r.Date||"").match(/(\d{4})-(\d{2})-(\d{2})/),tm=String(r["Slot (1-4)"]||"").match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if(dm){const y=+dm[1],mo=+dm[2]-1,d=+dm[3];
    if(!tm)return {date:d+" "+MON[mo]+" "+y,time:"",at:new Date(y,mo,d).getTime()};
    let H=+tm[1]%12;if(/pm/i.test(tm[3]))H+=12;
    return istRow(wallMs(y,mo,d,H,+tm[2],ET_TZ))}
  const pa=String(r["Posted at"]||"").match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if(pa){if(pa[4]==null)return {date:+pa[3]+" "+MON[+pa[2]-1]+" "+pa[1],time:"",at:new Date(+pa[1],+pa[2]-1,+pa[3]).getTime()};
    return istRow(wallMs(+pa[1],+pa[2]-1,+pa[3],+pa[4],+pa[5],ET_TZ))}
  return null;
}
// Our Posts-shaped rows (Platform "LinkedIn"), so the calendar and tracker can show them. Posted first, then the queue;
// a queued copy of a post that already went out is dropped. Skipped rows never show.
function liPosts(){
  if(!LI.raw)return [];
  const acc=Object.keys(HANDLES)[0]||"";
  const objs=g=>{const h=(g[0]||[]).map(x=>String(x||"").trim());return g.slice(1).map((r,i)=>{const o={_r:i+2};h.forEach((k,j)=>{if(k)o[k]=String(r[j]==null?"":r[j]).trim()});return o})};
  const perf=new Map(objs(LI.raw.perf).filter(r=>r["Live URL"]).map(r=>[linkKey(r["Live URL"]),r]));
  const out=[],seen=new Set();
  const add=(r,tab)=>{
    const text=r["Post text"]||"",link=safeUrl(r["Live URL"])?r["Live URL"]:"",st=String(r.Status||"").trim().toUpperCase();
    if((!text&&!link)||st==="SKIP")return;
    // A post moved on the calendar shows on its new day at once, until the sheet has the new Date (li-bot li_move writes it).
    const mv=tab==="q"&&text?(leadSetting("li_moves")||{})[liKey(text)]:null;
    const when=liWhen(mv&&mv.date&&!mv.applied?{...r,Date:mv.date}:r);if(!when)return;
    const kt=text?"t:"+text.replace(/\s+/g," ").slice(0,160):"",kl=link?linkKey(link):"";
    if((kt&&seen.has(kt))||(kl&&seen.has(kl)))return;if(kt)seen.add(kt);if(kl)seen.add(kl);
    const pf=kl?perf.get(kl):null;
    const status=link||st==="POSTED"?"Posted":r.Error||st==="ERROR"?"Draft":"Scheduled";
    const qd=String((mv&&mv.date&&!mv.applied?mv.date:r.Date)||"").match(/\d{4}-\d{2}-\d{2}/);
    out.push({_li:true,_qrow:tab==="q"?r._r:0,_qdate:qd?qd[0]:"",_moving:!!(mv&&!mv.applied),_row:"li-"+tab+r._r,_key:"oli"+tab+r._r,Account:acc,Platform:"LinkedIn",Date:when.date,"Time (IST)":when.time,_date:parseDate(when.date),_at:when.at,
      "Our version":text,Status:status,"Posted link":link,Calendar:"Yes",Competitor:"Our own","What we changed":"LinkedIn queue sheet",
      "Post type":pf?pf["Post type"]||"":"","Media file":r["Image URL"]||"",_reactions:pf?num(pf.Reactions):null,_checked:pf?pf["Checked at (IST)"]||"":"",_error:r.Error||""});
  };
  objs(LI.raw.posted).forEach(r=>add(r,"p"));objs(LI.raw.queue).forEach(r=>add(r,"q"));
  return out;
}
const liKey=t=>String(t||"").replace(/\s+/g," ").trim().slice(0,80).toLowerCase();
// Move a LinkedIn post to another day (13 Nov): saved in li_moves (the calendar shows it at once), then li-bot writes the new
// Date into the LinkedIn queue sheet through Composio Google Sheets (or within 15 minutes, once Google Sheets is connected).
async function liMove(o,iso){
  if(!sb||!canEdit()||!o._qrow||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return false;
  const k=liKey(o["Our version"]);const m={...(leadSetting("li_moves")||{})};
  m[k]={row:o._qrow,date:iso,text:String(o["Our version"]||"").slice(0,200),at:new Date().toISOString()};
  const ok=await leadSettingSave("li_moves",m);if(!ok)return false;build();emit();
  const [y,mo,d]=iso.split("-").map(Number);const label=d+" "+MON[mo-1];
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:"li_move"}});if(error)throw error;
    if(data&&data.applied){toast("Moved to "+label+". The LinkedIn queue sheet has the new date.");liLoad(true);}
    else if(data&&data.connected===false)toast("Moved to "+label+" in the CRM. The queue sheet changes too once Sheets is connected in Composio (on its own, no need to move it again).",true);
    else toast("Moved to "+label+" in the CRM. The queue sheet couldn't be changed yet"+(data&&data.error?" ("+data.error+")":"")+"; it retries every 15 minutes.",true);}
  catch(e){toast("Moved to "+label+" in the CRM. The queue sheet updates within 15 minutes.");}
  return true;
}
// Add a LinkedIn post from the calendar (14 Nov): li-bot li_add writes a new Queued row in the queue sheet, then the sheet reloads.
async function liAdd(text,image,iso,slot){
  if(!sb||!canEdit())return false;
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:"li_add",text,image,date:iso,slot}});if(error)throw error;
    if(!data||!data.ok){toast("Couldn't add it: "+((data&&data.error)||"no answer"),true);return false}
    toast("Added to the LinkedIn queue.");await liLoad(true);return true}
  catch(e){toast("Couldn't add it: "+(e.message||e),true);return false}
}
// Posted LinkedIn posts with their latest reactions, shaped like trackedPosts() (LinkedIn shows no views here).
function liTracked(){
  const auto=SOC.posts.filter(p=>p.platform==="linkedin");
  if(auto.length){const hist=new Map();for(const c of SOC.checks)if(c.platform==="linkedin"){if(!hist.has(c.post_id))hist.set(c.post_id,[]);hist.get(c.post_id).push(c)}
    const out=auto.map(p=>({key:"li:"+p.post_id,link:p.url,account:Object.keys(HANDLES)[0]||"",plan:null,hist:(hist.get(p.post_id)||[]).slice().sort((a,b)=>new Date(a.at)-new Date(b.at)),
      views:null,eng:p.likes+p.comments+p.reposts,reactions:p.likes,comments:p.comments,reposts:p.reposts,rate:null,grew:null,first:p.posted_at?new Date(p.posted_at).getTime():0,
      text:p.text,checked:p.checked_at,pending:false,postId:p.post_id,auto:true}));
    const tk=t=>String(t||"").replace(/\s+/g," ").trim().slice(0,80).toLowerCase();const seen=new Set(out.map(t=>tk(t.text)));
    return out.concat(M.li.filter(p=>p["Posted link"]&&!seen.has(tk(p["Our version"]))).map(p=>({key:linkKey(p["Posted link"]),link:p["Posted link"],account:p.Account,plan:p,hist:[],views:null,
      eng:p._reactions,reactions:p._reactions,rate:null,grew:null,first:p._at||0,text:p["Our version"],checked:p._checked,pending:p._reactions==null})))}
  return M.li.filter(p=>p["Posted link"]).map(p=>({key:linkKey(p["Posted link"]),link:p["Posted link"],account:p.Account,plan:p,hist:[],views:null,
    eng:p._reactions,reactions:p._reactions,rate:null,grew:null,first:p._at||0,
    text:p["Our version"],checked:p._checked,pending:p._reactions==null}));
}
const liState=()=>({on:!!LI.id,loaded:!!LI.raw,err:LI.err?String(LI.err.message||LI.err):"",at:LI.at});

/* ---------- Leads (6 Nov) ----------
   Everyone we're talking to, from any channel: plain Supabase tables (crm_leads, crm_lead_events, crm_lead_settings) that
   the page reads and writes directly; row level security keeps them to the team. Saves show at once and roll back if
   Supabase refuses. */
const LD={rows:[],events:[],settings:{},loaded:false,err:null,busy:false,pending:0,gen:0,again:false,at:0};
// Automatic post tracking (7 Nov): filled twice a day by the social-sync Edge Function; read here with the leads.
const SOC={posts:[],checks:[],people:[],eng:[],runs:[],loaded:false,running:false,ig:[],igRuns:[],igRunning:false};
const LEAD_DEFAULTS={stages:[{name:"New",color:"var(--ink-4)",kind:"open"},{name:"Contacted",color:"var(--out)",kind:"open"},{name:"In talks",color:"var(--mid)",kind:"open"},
  {name:"Proposal sent",color:"var(--warn)",kind:"open"},{name:"Won",color:"var(--ok)",kind:"won"},{name:"Lost",color:"var(--bad)",kind:"lost"}],
  sources:["X","LinkedIn","Instagram","Email","Referral","Website","Other"],groups:[],categories:[],fields:[],currency:"USD"};
const leadSetting=k=>LD.settings[k]!=null?LD.settings[k]:LEAD_DEFAULTS[k];
async function leadPages(table,order,tie=["id"]){
  const out=[];
  for(let from=0;;from+=1000){let q=sb.from(table).select("*").order(order,{ascending:false});for(const t of tie)q=q.order(t);
    const r=await q.range(from,from+999);if(r.error)throw r.error;out.push(...(r.data||[]));if(!r.data||r.data.length<1000)return out}
}
async function leadsLoad(){
  if(!sb||!session||!member)return;
  if(LD.busy||LD.pending){LD.again=true;return}
  LD.busy=true;LD.again=false;const gen=LD.gen;
  try{
    // Only rows changed since the last load come down (incLoad); run history and settings are small and read as they are.
    const desc=k=>a=>a.sort((x,y)=>String(y[k]||"")<String(x[k]||"")?-1:String(y[k]||"")>String(x[k]||"")?1:0);
    const slow=Date.now()-(LD.slowAt||0)>5*60e3;if(slow)LD.slowAt=Date.now();
    const [rows,st,events,sp,sc,sppl,seng,runs,igt,igr]=await Promise.all([incLoad("crm_leads","updated_at",r=>r.id).then(x=>desc("updated_at")(x.rows)),   // archived too, so Bring in can restore them
      sb.from("crm_lead_settings").select("key,value").then(r=>{if(r.error)throw r.error;return r.data||[]}),incLoad("crm_lead_events","updated_at",r=>r.id).then(x=>desc("at")(x.rows)),
      incLoad("crm_social_posts","updated_at",r=>r.platform+"|"+r.post_id).then(x=>desc("posted_at")(x.rows)),incLoad("crm_social_checks","at",r=>r.platform+"|"+r.post_id+"|"+r.at).then(x=>desc("at")(x.rows)),
      incLoad("crm_social_people","updated_at",r=>r.platform+"|"+r.person_key).then(x=>desc("last_seen")(x.rows)),incLoad("crm_social_engagements","updated_at",r=>[r.platform,r.post_id,r.person_key,r.kind].join("|")).then(x=>desc("first_seen")(x.rows)),
      slow||!SOC.runs.length?sb.from("crm_sync_runs").select("*").eq("platform","linkedin").order("started_at",{ascending:false}).limit(10).then(r=>{if(r.error)throw r.error;return r.data||[]}):Promise.resolve(SOC.runs),
      incLoad("crm_ig_threads","updated_at",r=>r.account+"|"+r.thread_id).then(x=>desc("checked_at")(x.rows)).catch(()=>[]),   // Instagram DMs (7 Nov)
      slow||!SOC.igRuns.length?sb.from("crm_sync_runs").select("*").eq("platform","instagram").order("started_at",{ascending:false}).limit(5).then(r=>r.data||[]):Promise.resolve(SOC.igRuns)]);
    // A save that started while this was loading has newer data than what came back, so keep the page as it is and load again.
    if(gen===LD.gen&&!LD.pending){LD.rows=rows;LD.settings=Object.fromEntries(st.map(x=>[x.key,x.value]));LD.events=events;LD.loaded=true;LD.at=Date.now();
      SOC.posts=sp;SOC.checks=sc;SOC.people=sppl;SOC.eng=seng;SOC.runs=runs;SOC.ig=igt;SOC.igRuns=igr;SOC.loaded=true}
    else LD.again=true;
    LD.err=null;
  }catch(e){LD.err=e}
  finally{LD.busy=false}
  emit();
  if(LD.again&&!LD.pending)setTimeout(leadsLoad,300);
}
// Runs a Supabase write; on failure says why and reloads, so the page never shows something that wasn't saved.
async function leadWrite(what,run){
  LD.pending++;LD.gen++;emit();
  try{const r=await run();if(r&&r.error)throw r.error;return r?r.data:null}
  catch(e){toast("Couldn't save "+what+": "+(e.message||e),true);return undefined}
  finally{LD.pending--;if(!LD.pending)setTimeout(leadsLoad,300);emit()}
}
const LEAD_COLS=["name","company","role","email","phone","x_handle","linkedin","instagram","website","direction","source","source_detail","stage","group_name",
  "categories","pitch","closed_for","price","currency","pricing_note","next_step","next_date","owner","notes","fields","origin_key","last_touch","archived","heat"];
const leadClean=o=>{const out={};for(const k of LEAD_COLS)if(k in o)out[k]=o[k];if("price" in out)out.price=out.price===""||out.price==null?null:Number(out.price);
  if("next_date" in out&&!out.next_date)out.next_date=null;return out};
async function leadCreate(o){
  const row=leadClean({stage:leadSetting("stages")[0]?.name||"New",currency:leadSetting("currency")||"USD",...o});
  const data=await leadWrite("the lead",()=>sb.from("crm_leads").insert(row).select().single());
  if(data){LD.rows=[data,...LD.rows.filter(r=>r.id!==data.id)];emit();toast("Saved: "+(data.name||"new lead"))}
  return data||null;
}
async function leadSave(id,patch){
  const i=LD.rows.findIndex(r=>r.id===id);if(i<0)return false;
  const clean=leadClean(patch),before=LD.rows[i];
  LD.rows=LD.rows.map(r=>r.id===id?{...r,...clean,updated_at:new Date().toISOString()}:r);emit();
  const data=await leadWrite(before.name||"the lead",()=>sb.from("crm_leads").update(clean).eq("id",id).select().single());
  if(data===undefined){LD.rows=LD.rows.map(r=>r.id===id?before:r);emit();return false}
  if(data)LD.rows=LD.rows.map(r=>r.id===id?data:r);
  return true;
}
// Archive, not delete: Undo brings it back.
async function leadArchive(id,on=true){return leadSave(id,{archived:on})}
/* LinkedIn steps (10 Nov): LinkedIn's API doesn't share invites or messages, so each step is one click on the lead card,
   kept in fields.li (req, note, acc, dm, inmail = when). A DM or InMail moves a New lead to Contacted. */
async function liStep(id,step){
  const l=LD.rows.find(r=>r.id===id);if(!l)return false;const now=new Date().toISOString();
  const li={...((l.fields||{}).li||{})};
  if(step==="req"||step==="reqNote"){li.req=now;li.note=step==="reqNote"}else li[step]=now;
  const patch={fields:{...(l.fields||{}),li},last_touch:now};
  if((step==="dm"||step==="inmail")&&/^new$/i.test(l.stage))patch.stage="Contacted";
  const ok=await leadSave(id,patch);
  if(ok)leadNote(id,"message",{req:"LinkedIn connection request sent",reqNote:"LinkedIn connection request sent, with a note",acc:"Accepted our LinkedIn request",dm:"Sent a LinkedIn DM",inmail:"Sent a LinkedIn InMail"}[step]);
  return ok;
}
async function leadNote(id,kind,text){
  text=String(text||"").trim();if(!text)return false;
  const ev={lead_id:id,kind:kind||"note",text};
  const tmp={...ev,id:"tmp"+Date.now(),at:new Date().toISOString(),by_email:session&&session.user?session.user.email:""};
  LD.events=[tmp,...LD.events];LD.rows=LD.rows.map(r=>r.id===id?{...r,last_touch:tmp.at}:r);emit();
  const data=await leadWrite("the note",()=>sb.from("crm_lead_events").insert(ev).select().single());
  LD.events=data?LD.events.map(e=>e.id===tmp.id?data:e):LD.events.filter(e=>e.id!==tmp.id);emit();
  return !!data;
}
async function leadNoteDelete(eid){
  const before=LD.events;LD.events=LD.events.filter(e=>e.id!==eid);emit();
  const r=await leadWrite("the note",()=>sb.from("crm_lead_events").delete().eq("id",eid));
  if(r===undefined){LD.events=before;emit()}else if(INC.crm_lead_events)INC.crm_lead_events.map.delete(eid);
}
async function leadSettingSave(key,value){
  const before=LD.settings[key];LD.settings={...LD.settings,[key]:value};emit();
  const r=await leadWrite("the setup",()=>sb.from("crm_lead_settings").upsert({key,value,updated_at:new Date().toISOString()}));
  if(r===undefined){LD.settings={...LD.settings,[key]:before};emit();return false}
  return true;
}
// Renaming a stage, group, category or source renames it on every lead that has it.
async function leadRename(kind,from,to){
  const col={stages:"stage",groups:"group_name",sources:"source"}[kind];
  LD.rows=LD.rows.map(r=>col?(r[col]===from?{...r,[col]:to}:r):kind==="categories"&&(r.categories||[]).includes(from)?{...r,categories:r.categories.map(c=>c===from?to:c)}:r);emit();
  await leadWrite("the leads",()=>sb.rpc("crm_lead_rename",{kind,old_name:from,new_name:to}));
}
const leadsState=()=>({loaded:LD.loaded,err:LD.err?String(LD.err.message||LD.err):"",saving:LD.pending>0,at:LD.at});
// People on the LinkedIn sheet worth bringing in: who commented on or DMed about a lead magnet, and the founders it featured.
function liPeople(){
  if(!LI.raw||!LI.raw.magnets)return [];
  const objs=g=>{const h=(g[0]||[]).map(x=>String(x||"").trim());return g.slice(1).map(r=>{const o={};h.forEach((k,j)=>{if(k)o[k]=String(r[j]==null?"":r[j]).trim()});return o})};
  const col=(o,start)=>{const k=Object.keys(o).find(x=>x.toLowerCase().startsWith(start.toLowerCase()));return k?o[k]:""};
  const out=[];
  for(const m of objs(LI.raw.magnets)){const title=col(m,"Title"),word=col(m,"Comment word");
    for(const who of col(m,"Leads who commented").split(/\n|;|\|/).map(x=>x.trim()).filter(x=>x&&!/reactions:|no live url|not checkable|^posted\b/i.test(x)))
      out.push({kind:"engaged",name:who.split(/\s[-–(]/)[0].trim(),raw:who,company:"",title,word,date:col(m,"Date to post")})}
  for(const p of objs(LI.raw.magPeople||[]))if(col(p,"Name"))
    out.push({kind:"featured",name:col(p,"Name"),company:col(p,"Company"),title:col(p,"Lead magnet title"),raw:col(p,"Number on tile"),date:col(p,"Date to post")});
  return out;
}

/* ---------- X jobs (9 Nov): x-leads finds people to DM, x-engage reads post numbers and who replied ---------- */
const XJ={runs:{"x-leads":[],"x":[]},running:{}};
async function xRunsLoad(){
  if(!sb||!session||!member)return;
  try{const {data}=await sb.from("crm_sync_runs").select("*").in("platform",["x-leads","x"]).order("started_at",{ascending:false}).limit(20);
    XJ.runs={"x-leads":(data||[]).filter(r=>r.platform==="x-leads"),"x":(data||[]).filter(r=>r.platform==="x")};emit()}catch(e){}
}
/* LinkedIn comment ideas (9 Nov): the li-engage job's 10 founder posts a day, each with a comment ready to copy. */
const LIS={rows:[],loaded:false,running:false};
async function lisLoad(){
  if(!sb||!session||!member)return;
  try{const {data,error}=await sb.from("crm_li_suggest").select("*").gte("day",new Date(Date.now()-3*864e5).toISOString().slice(0,10)).order("created_at",{ascending:false}).limit(60);
    if(error)throw error;LIS.rows=data||[];LIS.loaded=true;emit()}catch(e){LIS.loaded=true;LIS.err=String(e.message||e);emit()}
}
async function lisSet(url,patch){
  const before=LIS.rows;const who=session&&session.user?session.user.email:"";
  const p={...patch};if(p.status&&p.status!=="new"){p.done_by=who;p.done_at=new Date().toISOString()}
  LIS.rows=LIS.rows.map(r=>r.url===url?{...r,...p}:r);emit();
  const {error}=await sb.from("crm_li_suggest").update(p).eq("url",url);
  if(error){LIS.rows=before;emit();toast("Couldn't save: "+error.message,true);return false}
  return true;
}
async function lisRun(){
  if(!sb||LIS.running)return;LIS.running=true;emit();
  try{const {data,error}=await sb.functions.invoke("li-engage",{body:{}});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    toast(data&&data.skipped?data.skipped:"Found "+((data&&data.added)||0)+" new posts to comment on.")}
  catch(e){toast("Couldn't find posts: "+(e.message||e),true)}
  finally{LIS.running=false;await lisLoad()}
}
/* LinkedIn bot (11 Nov): the Chrome extension's queue (crm_li_tasks). Approve, edit or skip here; the extension sends. */
const LBT={rows:[],loaded:false,running:false,at:0};
async function lbtLoad(){
  if(!sb||!session||!member)return;
  try{const since=new Date(Date.now()-14*864e5).toISOString();
    const [a,b]=await Promise.all([sb.from("crm_li_tasks").select("*").in("status",["review","ready","sending","failed"]).order("created_at").limit(1000),
      sb.from("crm_li_tasks").select("*").in("status",["sent","skipped"]).gte("created_at",since).order("created_at",{ascending:false}).limit(1000)]);
    if(a.error)throw a.error;if(b.error)throw b.error;LBT.rows=[...(a.data||[]),...(b.data||[])];LBT.loaded=true;LBT.err=null;emit()}
  catch(e){LBT.loaded=true;LBT.err=String(e.message||e);emit()}
}
async function lbtSet(ids,patch){
  ids=[].concat(ids);if(!ids.length)return true;const before=LBT.rows;const who=session&&session.user?session.user.email:"";
  const p={...patch};if(p.status)p.decided_by=who;
  LBT.rows=LBT.rows.map(r=>ids.includes(r.id)?{...r,...p}:r);emit();
  for(let i=0;i<ids.length;i+=200){const {error}=await sb.from("crm_li_tasks").update(p).in("id",ids.slice(i,i+200));
    if(error){LBT.rows=before;emit();toast("Couldn't save: "+error.message,true);return false}}
  return true;
}
async function lbtRun(){
  if(!sb||LBT.running)return;LBT.running=true;emit();
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:"plan"}});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    toast(data&&data.queued?data.queued+" new messages written. Check them below.":"Nothing new to write right now.")}
  catch(e){toast("Couldn't write messages: "+(e.message||e),true)}
  finally{LBT.running=false;await lbtLoad()}
}
// X bot (12 Nov): "Send with bot" on Send today queues the DM in crm_x_tasks; the Chrome extension sends it from your X tab and
// marks the row sent (or Can't DM). Rows here are the last 3 days plus anything still waiting.
const XT={rows:[],status:{},loaded:false,at:0};
async function xtLoad(){
  if(!sb||!session||!member)return;
  try{const since=new Date(Date.now()-3*864e5).toISOString();
    const [a,b,c]=await Promise.all([sb.from("crm_x_tasks").select("*").in("status",["ready","sending"]).limit(500),
      sb.from("crm_x_tasks").select("*").gte("created_at",since).order("created_at",{ascending:false}).limit(500),
      sb.from("crm_lead_settings").select("key,value").in("key",["x_bot","x_bot_status"])]);
    if(a.error)throw a.error;const m=new Map();for(const r of [...(b.data||[]),...(a.data||[])])m.set(r.id,r);XT.rows=[...m.values()];
    XT.status={};for(const r of c.data||[])XT.status[r.key]=r.value;XT.loaded=true;emit()}
  catch(e){XT.loaded=true;emit()}
}
const xtActive=(row,kind)=>XT.rows.find(t=>t.row===row&&t.kind===kind&&(t.status==="ready"||t.status==="sending"));
const xtLast=(row,kind)=>XT.rows.filter(t=>t.row===row&&t.kind===kind).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
async function xtQueue(items){
  if(!sb||!canEdit())return false;items=items.filter(x=>x&&x.row&&x.text&&!xtActive(x.row,x.kind));if(!items.length)return true;
  const by=session&&session.user?session.user.email:"";
  const rows=items.map(x=>({row:x.row,name:x.name,company:x.company||"",handle:String(x.handle||"").replace(/^@/,""),user_id:x.user_id?String(x.user_id):null,kind:x.kind,text:x.text,decided_by:by}));
  const tmp=rows.map((r,i)=>({...r,id:"tmp"+i+Date.now(),status:"ready",created_at:new Date().toISOString()}));XT.rows=[...tmp,...XT.rows];emit();
  const {error}=await sb.from("crm_x_tasks").insert(rows);
  if(error){XT.rows=XT.rows.filter(r=>!String(r.id).startsWith("tmp"));emit();toast("Couldn't queue: "+error.message,true);return false}
  toast(items.length===1?"Queued for the bot. It sends from your X tab within a few minutes.":items.length+" DMs queued. The bot sends one every few minutes from your X tab.");
  await xtLoad();return true;
}
async function xtCancel(id){
  if(!sb)return;const r=XT.rows.find(t=>t.id===id);if(r)r.status="skipped";emit();
  const {error}=await sb.from("crm_x_tasks").update({status:"skipped",error:"Cancelled in the CRM"}).eq("id",id).in("status",["ready","sending"]);
  if(error)toast("Couldn't cancel: "+error.message,true);await xtLoad();
}
async function xtPause(on){const cur=XT.status.x_bot||{};XT.status={...XT.status,x_bot:{...cur,paused:!!on}};emit();
  const {error}=await sb.from("crm_lead_settings").upsert({key:"x_bot",value:{...cur,paused:!!on},updated_at:new Date().toISOString()});if(error)toast("Couldn't save: "+error.message,true);}
// Daily brief (11 Nov): the daily-brief job writes one row a day at 8:00 IST (yesterday on LinkedIn, X and Instagram, and who to
// follow up with today). The page reads the last 14; "Write it now" runs the job again for today.
const BR={rows:[],loaded:false,err:null,running:false,at:0};
async function briefLoad(){
  if(!sb||!session||!member)return;
  try{const {data,error}=await sb.from("crm_briefs").select("*").order("day",{ascending:false}).limit(14);
    if(error)throw error;BR.rows=data||[];BR.loaded=true;BR.err=null;emit()}
  catch(e){BR.loaded=true;BR.err=String(e.message||e);emit()}
}
async function briefRun(){
  if(!sb||BR.running)return;BR.running=true;emit();toast("Writing today's brief. About 20 seconds.");
  try{const {data,error}=await sb.functions.invoke("daily-brief",{body:{}});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    toast("Today's brief is ready.")}
  catch(e){toast("Couldn't write the brief: "+(e.message||e),true)}
  finally{BR.running=false;await briefLoad();leadsLoad()}
}
// 3 tips (12 Nov): li-bot looks up what they sell and who buys, picks the 3 best of our 5 tips and writes the LinkedIn message.
async function liTips(id){
  if(!sb)return false;toast("Writing their 3 tips. About 30 seconds.");
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:"tips",force_id:id}});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    toast(data&&data.made?"3 tips ready.":"Couldn't write them yet. Try again in a minute.",!(data&&data.made));leadsLoad();return true}
  catch(e){toast("Couldn't write the tips: "+(e.message||e),true);return false}
}
// Funding search (14 Nov), also every morning at 8:30 IST: founders who just announced a round, added to Leads.
async function liFunding(){
  if(!sb||!canEdit())return false;S.busy.add("funding");emit();toast("Searching the last 2 days of funding news. About a minute.");
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:"funding"}});if(error)throw error;
    toast(data&&data.added?"Added "+data.added+" founder"+(data.added===1?"":"s")+" who just raised: "+(data.people||[]).slice(0,3).join("; "):"Checked "+((data&&data.found)||0)+" rounds in the news. No new founders to add.");return true}
  catch(e){toast("The search didn't finish: "+(e.message||e),true);return false}
  finally{S.busy.delete("funding");emit();setTimeout(leadsLoad,500)}
}
// Launches and hiring signals (14 Nov), also every morning: run one now from Leads > Signals.
async function liSignal(kind){
  if(!sb||!canEdit()||S.busy.has(kind))return false;S.busy.add(kind);emit();toast(kind==="hiring"?"Searching job posts for growth and GTM roles. About 2 minutes.":"Searching Product Hunt and Hacker News launches. About a minute.");
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:kind,max:6}});if(error)throw error;
    toast(data&&data.added?"Added "+data.added+": "+(data.people||[]).slice(0,3).join("; "):"Checked "+((data&&data.found)||0)+". No new founders to add.");return true}
  catch(e){toast("It's still running or didn't finish ("+(e.message||e)+"). New founders appear here when it's done.",true);return false}
  finally{S.busy.delete(kind);emit();setTimeout(leadsLoad,500)}
}
// InMail (14 Nov): li-bot writes a subject and note for each chosen person, waiting for your OK on Bot and outreach.
async function liInmail(ids){
  if(!sb||!canEdit()||!ids.length)return false;S.busy.add("inmail");emit();toast("Writing "+ids.length+" InMail"+(ids.length===1?"":"s")+". About 30 seconds.");
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:"inmail_draft",lead_ids:ids}});if(error)throw error;
    toast(data&&data.made?data.made+" InMail"+(data.made===1?"":"s")+" ready for your OK below.":"Couldn't write them yet. Try again in a minute.",!(data&&data.made));LBT.at=0;lbtLoad();return !!(data&&data.made)}
  catch(e){toast("Couldn't write them: "+(e.message||e),true);return false}
  finally{S.busy.delete("inmail");emit()}
}
async function liInmailTest(id){
  if(!sb||!canEdit())return false;
  try{const {error}=await sb.functions.invoke("li-bot",{body:{action:"inmail_test",lead_id:id}});if(error)throw error;
    toast("Test asked. The extension opens an InMail, fills it in and closes it without sending, within about 3 minutes.");leadsLoad();return true}
  catch(e){toast("Couldn't ask for the test: "+(e.message||e),true);return false}
}
// Call brief (11 Nov): li-bot researches the lead and writes the call plan and pitch (it also runs every 15 minutes on its own).
async function liBrief(id){
  if(!sb)return false;toast("Writing the call brief. About a minute.");
  try{const {data,error}=await sb.functions.invoke("li-bot",{body:{action:"briefs",force_id:id,limit:1}});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    toast(data&&data.made?"Call brief ready.":"Couldn't write it yet. It retries every 15 minutes.");leadsLoad();return true}
  catch(e){toast("Couldn't write the brief: "+(e.message||e),true);return false}
}
/* Likers (10 Nov): X shows likes only to us, so they're pasted in from X's notifications; x-engage looks them up and writes the DM. */
async function addLikers(text){
  const all=[...new Set(String(text||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean))];
  const links=all.filter(x=>/status(es)?\/\d+/.test(x)),handles=all.filter(x=>!/status(es)?\/\d+/.test(x));
  if(links.length){await xRun("x-engage",false,{links});await publicLoad();if(!handles.length)return true}
  if(!handles.length)return false;
  try{const r=await scriptCall({action:"addLikers",handles});const n=+String(r).split(" ")[1]||0;
    if(!n){toast("They're all on the list already.");return true}
    toast("Added "+n+(n===1?" person":" people")+". Looking them up and writing their DMs…");}
  catch(e){toast("Couldn't add them: "+(e&&e.message||e),true);return false}
  await publicLoad();xRun("x-engage",true,{likers:true});return true;
}
async function xRun(slug,quiet,body){
  if(!sb||XJ.running[slug])return null;
  XJ.running[slug]=true;emit();
  try{const {data,error}=await sb.functions.invoke(slug,{body:body||(slug==="x-leads"?{force:true}:{})});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    if(data&&data.skipped){if(!quiet)toast(data.skipped)}
    else if(data&&slug==="x-leads")toast("Added "+data.added+" new "+(data.added===1?"person":"people")+" to DM. "+data.added_today+" today so far.");
    else if(data&&data.added!=null&&!quiet)toast(data.added?"Added "+data.added+(data.added===1?" reply":" replies")+" to Engaged, with a reply and DM ready.":"Nothing new in those links.");
    else if(data&&!quiet)toast("Checked X: "+data.posts+" posts, "+data.new_people+" new "+(data.new_people===1?"person":"people")+" replied, quoted or mentioned you"+(data.tagged?", "+data.tagged+" tagged":"")+".");
    return data}
  catch(e){if(!quiet)toast((slug==="x-leads"?"The lead search":"The X check")+" didn't finish: "+(e.message||e),true);return null}
  finally{XJ.running[slug]=false;await publicLoad();xRunsLoad()}
}

/* ---------- Automatic post tracking (7 Nov) ---------- */
// Runs the tracking job now (the "Check now" button). It takes about a minute.
async function socialRun(){
  if(!sb||SOC.running)return null;
  SOC.running=true;emit();
  try{const {data,error}=await sb.functions.invoke("social-sync",{body:{}});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    if(data&&data.skipped)toast(data.skipped,true);
    else if(data)toast("Checked "+data.posts+" posts: "+data.people+" people, "+data.leads_added+" new "+(data.leads_added===1?"lead":"leads")+".");
    return data}
  catch(e){toast("The check didn't finish: "+(e.message||e),true);return null}
  finally{SOC.running=false;setTimeout(leadsLoad,300);emit()}
}
// Changing a person's fit by hand (it then stays as set).
async function setPersonFit(platform,key,fit){
  const before=SOC.people;const who=session&&session.user?session.user.email:"";
  SOC.people=SOC.people.map(p=>p.platform===platform&&p.person_key===key?{...p,fit,fit_by:who}:p);emit();
  const r=await leadWrite("the change",()=>sb.from("crm_social_people").update({fit,fit_by:who}).eq("platform",platform).eq("person_key",key));
  if(r===undefined){SOC.people=before;emit()}
}
// Adds someone who engaged to Leads by hand (good fits are added on their own).
const linkKeyLi=u=>String(u||"").trim().toLowerCase().replace(/[?#].*$/,"").replace(/\/+$/,"").replace(/^https?:\/\/(www\.)?/,"https://www.");
async function personToLead(person,seed){
  const keys=[linkKeyLi(person.person_key),linkKeyLi(person.profile_url)];
  const known=LD.rows.find(l=>keys.includes(linkKeyLi(l.linkedin))||l.origin_key==="li-person:"+person.person_key);
  if(known&&known.archived)await leadArchive(known.id,false);
  const lead=known||await leadCreate({origin_key:"li-person:"+person.person_key,...seed});
  if(!lead)return null;
  SOC.people=SOC.people.map(p=>p.platform===person.platform&&p.person_key===person.person_key?{...p,lead_id:lead.id}:p);emit();
  await leadWrite("the link",()=>sb.from("crm_social_people").update({lead_id:lead.id}).eq("platform",person.platform).eq("person_key",person.person_key));
  return lead;
}

/* ---------- Instagram DMs (7 Nov) ---------- */
// Reads the DMs now (the "Check now" button on Setup). The ig-sync job also runs every hour on its own.
async function igRun(quiet){
  if(!sb||SOC.igRunning)return null;
  SOC.igRunning=true;emit();
  try{const {data,error}=await sb.functions.invoke("ig-sync",{body:{}});
    if(error){let msg=error.message||String(error);try{const b=await error.context.json();if(b&&b.error)msg=b.error}catch(e){}throw new Error(msg)}
    if(data&&data.skipped){if(!quiet)toast(data.skipped,true);}
    else if(data&&!quiet)toast("Read "+data.threads_read+" DM threads: "+data.leads_added+" new "+(data.leads_added===1?"lead":"leads")+", "+data.filtered+" filtered out.");
    return data}
  catch(e){if(!quiet)toast("The check didn't finish: "+(e.message||e),true);return null}
  finally{SOC.igRunning=false;setTimeout(leadsLoad,300);emit()}
}
// Someone the job filtered out, added to Leads by hand. Their messages follow the next time the thread changes.
async function igToLead(t){
  const handle=String(t.handle||"").toLowerCase();
  const known=LD.rows.find(l=>String(l.instagram||"").toLowerCase().replace(/^@/,"")===handle||l.origin_key==="ig:"+handle);
  if(known&&known.archived)await leadArchive(known.id,false);
  const lead=known||await leadCreate({name:t.name||handle,instagram:"@"+handle,direction:"Inbound",source:"Instagram",source_detail:"DM to @"+t.account,
    ...((leadSetting("stages")||[]).some(s=>s.name==="In talks")?{stage:"In talks"}:{}),heat:"Hot",origin_key:"ig:"+handle,
    notes:[t.followers!=null?Number(t.followers).toLocaleString("en-US")+" followers on Instagram.":"",t.why?"Filtered out automatically ("+t.why+"), added by hand.":""].filter(Boolean).join("\n"),
    fields:{ig_followers:t.followers}});
  if(!lead)return null;
  const who=session&&session.user?session.user.email:"";
  SOC.ig=SOC.ig.map(x=>x.account===t.account&&x.thread_id===t.thread_id?{...x,status:"kept",status_by:who,lead_id:lead.id}:x);emit();
  await leadWrite("the link",()=>sb.from("crm_ig_threads").update({status:"kept",status_by:who,lead_id:lead.id}).eq("account",t.account).eq("thread_id",t.thread_id));
  return lead;
}

/* ---------- GTM intelligence (8 Nov) ----------
   ICP scoring, relationship views, the intelligence card, buying signals and outreach history all live in the lead's
   fields.gtm (rules in crm/src/gtm.js, window.GTM). No new tables. Every write re-reads the row's fields first, so what a
   sync job (ig_*) or a teammate saved a moment ago is never overwritten with an older copy. Nothing here sends anything. */
const G_=()=>window.GTM;
const meEmail=()=>session&&session.user?session.user.email:"";
const todayIso=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const gtmCfg=()=>G_().icpConfig(leadSetting("icp"),window.CRM_CONFIG||{});
async function leadGtmSave(id,update,extra){
  const l=LD.rows.find(r=>r.id===id);if(!l){toast("That lead isn't loaded. Reload and try again.",true);return false}
  let fresh=l.fields||{};
  if(sb){try{const r=await sb.from("crm_leads").select("fields").eq("id",id).single();if(!r.error&&r.data)fresh=r.data.fields||{}}catch(e){}}
  const cur=fresh.gtm&&typeof fresh.gtm==="object"?JSON.parse(JSON.stringify(fresh.gtm)):{};
  let next;try{next=typeof update==="function"?update(cur):{...cur,...(update||{})}}catch(e){toast(e.message||String(e),true);return false}
  if(!next)return false;
  next.v=1;next.at=new Date().toISOString();
  return leadSave(id,{...(extra||{}),fields:{...fresh,gtm:next}});
}
// One fact on the card: {v, src, at}. v '' clears it. Checked before saving; at defaults to today.
async function gtmIntel(id,key,{v,src,at}={}){
  const err=G_().validateIntel(key,v,src,at);if(err){toast(err,true);return false}
  return leadGtmSave(id,g=>{const I={...(g.intel||{})};
    if(v==null||String(v).trim()===""){delete I[key]}
    else{const f=G_().FIELD[key];const val=f.type==="int"||f.type==="num"?Number(v):String(v).trim();I[key]={v:val,src:String(src||"").trim(),at:at||todayIso(),by:meEmail()}}
    return{...g,intel:I}});
}
// Several facts at once (enrichment by a job or by Claude): {key: {v, src, at}}. Stops on the first invalid one.
async function gtmIntelMany(id,patch){
  for(const k in patch){const x=patch[k]||{};const err=G_().validateIntel(k,x.v,x.src,x.at);if(err){toast(err,true);return false}}
  return leadGtmSave(id,g=>{const I={...(g.intel||{})};for(const k in patch){const x=patch[k]||{};const f=G_().FIELD[k];
    if(x.v==null||String(x.v).trim()==="")delete I[k];else I[k]={v:f.type==="int"||f.type==="num"?Number(x.v):String(x.v).trim(),src:String(x.src||"").trim(),at:x.at||todayIso(),by:meEmail()}}
    return{...g,intel:I}});
}
// A buying signal: {type, text, at (when it happened), src}. A signal without a source link is kept as an inference.
async function gtmSignal(id,s){
  s=s||{};if(!G_().SIGNALS[s.type]){toast("Pick what kind of signal it is.",true);return false}
  if(!String(s.text||"").trim()){toast("Say what the signal is, e.g. “Raised a $4M seed led by Accel”.",true);return false}
  if(s.src&&!G_().isUrl(s.src)){toast("The source must be a link starting with http:// or https://",true);return false}
  if(s.at&&!G_().parseDay(s.at)){toast("The date must look like 2026-10-14.",true);return false}
  const sig={id:"s"+Date.now().toString(36),type:s.type,text:String(s.text).trim().slice(0,240),at:s.at||"",seen:todayIso(),src:String(s.src||"").trim(),kind:s.src?"fact":"inference",by:meEmail()};
  return leadGtmSave(id,g=>({...g,signals:[...(g.signals||[]),sig]}));
}
async function gtmSignalDel(id,sid){return leadGtmSave(id,g=>({...g,signals:(g.signals||[]).filter(x=>x.id!==sid)}))}
// Small settings on a lead: rel.acq, rel.conn, icp.dq, icp.ov.<dim> ({pts, why} or null), opp.<why|angle|hook|msg>.
async function gtmSet(id,path,value){
  const ok={"rel.acq":v=>v===""||G_().ACQ.includes(v),"rel.conn":v=>["","connected","pending","none"].includes(v),"icp.dq":v=>typeof v==="string"};
  const p=String(path).split(".");
  if(ok[path]&&!ok[path](value)){toast("That isn't a valid value for "+path+".",true);return false}
  if(p[0]==="icp"&&p[1]==="ov"){const d=(G_().ICP_DEFAULT.weights)[p[2]];if(d==null){toast("Unknown ICP dimension "+p[2]+".",true);return false}
    if(value&&value.pts!=null&&value.pts!==""&&!(Number(value.pts)>=0&&Number(value.pts)<=(gtmCfg().weights[p[2]]||d))){toast("Points for that must be between 0 and "+(gtmCfg().weights[p[2]]||d)+".",true);return false}}
  if(!["rel","icp","opp"].includes(p[0])){toast("Can't set "+path+".",true);return false}
  return leadGtmSave(id,g=>{const out={...g};let o=out;for(let i=0;i<p.length-1;i++){o[p[i]]={...(o[p[i]]||{})};o=o[p[i]]}
    if(value==null||value==="")delete o[p[p.length-1]];else o[p[p.length-1]]=value;return out});
}
// The first stage whose engagement status is this one (New, Contacted, Engaged, Meeting booked, Qualified, …).
const stageFor=status=>(leadSetting("stages")||[]).find(s=>G_().statusOf(s.name,s.kind)===status);
const STATUS_RANK=s=>["New","Contacted","Engaged","Meeting booked","Qualified","Proposal","Won"].indexOf(s);
/* Logs one touch: {dir:'out'|'in', type, ch:'LinkedIn', text, tpl, angle, at}. Never sends anything.
   - We reached out: the lead moves from New to Contacted. A LinkedIn DM means they're connected.
   - They replied, asked, showed interest or booked: the lead becomes Midbound and moves forward to the first engaged stage
     (In talks) or the meeting stage (Call booked), and gets heat Hot, like the outreach job does. Accepting a connection only
     marks them connected. Stages only ever move forward here; Won and Lost are left alone.
   opts.followUpDays sets the next step to a follow-up that many days out. */
async function gtmTouch(id,t,opts){
  const G=G_();t=t||{};opts=opts||{};const l=LD.rows.find(r=>r.id===id);if(!l){toast("That lead isn't loaded. Reload and try again.",true);return false}
  if(!["in","out"].includes(t.dir)||!G.TOUCH_TYPES[t.type]){toast("Pick who it was from and what happened.",true);return false}
  const text=String(t.text||"").trim().slice(0,4000);
  if(G.STAGE_MOVERS.includes(t.type)&&t.type!=="meeting"&&!text){toast("Paste or sum up what they said, so the history shows it.",true);return false}
  // A plain date from the form: today means now; an earlier day means midday that day (not UTC midnight, which would sort
  // a reply logged today before the message we sent this morning).
  const at=!t.at||String(t.at).slice(0,10)===todayIso()?new Date().toISOString():/^\d{4}-\d\d-\d\d$/.test(String(t.at))?new Date(t.at+"T12:00:00").toISOString():!isNaN(new Date(t.at))?new Date(t.at).toISOString():new Date().toISOString();
  if(new Date(at)-Date.now()>864e5){toast("That date is in the future.",true);return false}
  const touch={id:"t"+Date.now().toString(36),at,dir:t.dir,type:t.type,ch:t.ch||"LinkedIn",text,tpl:t.tpl||"",angle:t.angle||"",by:meEmail()};
  const ST=leadSetting("stages")||[];const kind=(ST.find(s=>s.name===l.stage)||{}).kind;const now=G.statusOf(l.stage,kind);
  const extra={};const fwd=st=>{const s=stageFor(st);if(s&&STATUS_RANK(st)>STATUS_RANK(now)&&!["Won","Lost"].includes(now))extra.stage=s.name;};
  const first=G.firstName(l.name);
  if(t.dir==="out"&&G.OUT_TYPES.includes(t.type)&&t.type!=="connection")fwd("Contacted");
  if(t.dir==="in"&&G.STAGE_MOVERS.includes(t.type)){
    if(t.type==="meeting"){fwd("Meeting booked");extra.next_step="Prep the call with "+first;}
    else{if(now==="Nurture"){const s=stageFor("Engaged");if(s)extra.stage=s.name}else fwd("Engaged");extra.next_step="Reply to "+first+" on "+touch.ch;extra.next_date=todayIso();}
    extra.heat="Hot";
  }
  if(opts.followUpDays>0){const d=new Date();d.setDate(d.getDate()+Number(opts.followUpDays));const n=((G.gtmOf(l).touches||[]).filter(x=>x.dir==="out"&&x.type==="followup").length)+(t.type==="followup"?1:0);
    extra.next_step=n>=2?"Last check-in with "+first+" (2 follow-ups sent)":"Follow up with "+first+" on "+touch.ch+" (follow-up "+(n+1)+")";extra.next_date=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
  const ok=await leadGtmSave(id,g=>{const rel={...(g.rel||{})};
    if(t.type==="accepted"||(t.dir==="out"&&t.type==="dm"&&touch.ch==="LinkedIn"))rel.conn="connected";else if(t.type==="connection"&&rel.conn!=="connected")rel.conn="pending";
    return{...g,rel,touches:[...(g.touches||[]),touch].slice(-200)}},extra);
  if(!ok)return false;
  const who=t.dir==="out"?"We → them":"Them → us";const label=G.TOUCH_TYPES[t.type];
  const evKind=t.type==="meeting"?"meeting":t.type==="email"?"email":["dm","followup","reply","question","interest","connection","comment","comment_reply"].includes(t.type)?"message":"note";
  await leadNote(id,evKind,touch.ch+" · "+who+" · "+label+(touch.tpl?" ("+touch.tpl+")":"")+(text?": "+text:""));
  return true;
}
// Possible duplicates, and the lead a new record would duplicate.
const gtmDupes=()=>G_().dupes(LD.rows);
const gtmFind=o=>G_().findDup(LD.rows,o||{});
// Merges a duplicate into the lead we keep: fills the kept lead's empty fields, joins notes, history (touches, signals,
// facts it lacks), then archives the duplicate (Undo-able from Bring in). The outreach job's own lead (li-outreach key) is
// the one to keep, so its key keeps matching.
async function gtmMerge(keepId,dupId){
  const a=LD.rows.find(r=>r.id===keepId),b=LD.rows.find(r=>r.id===dupId);if(!a||!b||a.id===b.id){toast("Pick two different leads to merge.",true);return false}
  const fill={};for(const k of ["company","role","email","phone","x_handle","linkedin","instagram","website","source_detail","group_name","pitch","next_step","owner"])if(!String(a[k]||"").trim()&&String(b[k]||"").trim())fill[k]=b[k];
  if(String(b.notes||"").trim()&&!String(a.notes||"").includes(String(b.notes).trim()))fill.notes=[a.notes,"From the merged duplicate:\n"+b.notes].filter(x=>String(x||"").trim()).join("\n\n");
  const cats=[...new Set([...(a.categories||[]),...(b.categories||[])])];if(cats.length!==(a.categories||[]).length)fill.categories=cats;
  if(!a.heat&&b.heat)fill.heat=b.heat;
  const bg=G_().gtmOf(b);
  const ok=await leadGtmSave(keepId,g=>({...g,intel:{...(bg.intel||{}),...(g.intel||{})},signals:[...(g.signals||[]),...(bg.signals||[]).filter(s=>!(g.signals||[]).some(x=>x.id===s.id))],
    touches:[...(g.touches||[]),...(bg.touches||[]).filter(s=>!(g.touches||[]).some(x=>x.id===s.id))].sort((x,y)=>new Date(x.at)-new Date(y.at)),
    merged:[...(g.merged||[]),{id:b.id,name:b.name,origin_key:b.origin_key||"",at:new Date().toISOString()}]}),fill);
  if(!ok)return false;
  await leadNote(keepId,"note","Merged with a duplicate: "+(b.name||"(no name)")+(b.company?" ("+b.company+")":"")+(b.origin_key?" · "+b.origin_key:""));
  await leadNote(dupId,"note","Archived as a duplicate of "+(a.name||"(no name)")+(a.company?" ("+a.company+")":""));
  await leadArchive(dupId,true);
  return true;
}
/* LinkedIn connections (9 Nov): the Connections.csv from LinkedIn's data export. Everyone not in Leads yet goes into the
   first stage (New) as a LinkedIn lead we haven't messaged; people already in Leads are left as they are. */
function csvRows(text){const out=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c;continue}
    if(c==='"')q=true;else if(c===","){row.push(cell);cell=""}else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);out.push(row);row=[];cell=""}else cell+=c}
  if(cell||row.length){row.push(cell);out.push(row)}return out}
async function importLiConnections(text){
  if(S.busy.has("liImport"))return;S.busy.add("liImport");emit();
  try{
    const rows=csvRows(text);const h=rows.findIndex(r=>r.some(c=>/^\s*first name\s*$/i.test(c))&&r.some(c=>/^\s*url\s*$/i.test(c)));
    if(h<0)throw new Error("That isn't LinkedIn's Connections.csv (no First Name / URL columns).");
    const H=rows[h].map(c=>c.trim().toLowerCase());const ix=k=>H.indexOf(k);
    const norm=u=>String(u||"").trim().toLowerCase().replace(/[?#].*$/,"").replace(/\/+$/,"").replace(/^https?:\/\/(www\.)?/,"https://www.");
    const have=new Set(LD.rows.map(l=>norm(l.linkedin)).filter(Boolean));
    const stage=leadSetting("stages")[0]?.name||"New";const who=session&&session.user?session.user.email:"";
    const add=[];
    for(const r of rows.slice(h+1)){const url=norm(r[ix("url")]);if(!url||have.has(url))continue;have.add(url);
      const name=[r[ix("first name")],r[ix("last name")]].filter(Boolean).join(" ").trim();const on=r[ix("connected on")]||"";
      add.push({name:name||null,company:r[ix("company")]||null,role:r[ix("position")]||null,email:(ix("email address")>=0&&r[ix("email address")])||null,linkedin:url,
        source:"LinkedIn",direction:"Outbound",source_detail:"LinkedIn connection"+(on?" since "+on:""),stage,origin_key:"li-conn:"+url,created_by:who||"import"})}
    if(!add.length){toast("Everyone in that file is already in Leads.");return}
    for(let i=0;i<add.length;i+=200){const {error}=await sb.from("crm_leads").insert(add.slice(i,i+200));if(error)throw error}
    toast("Added "+add.length+" LinkedIn connections to the Pipeline, in "+stage+".");await leadsLoad();
  }catch(e){toast("Couldn't import: "+(e&&e.message||e),true)}
  finally{S.busy.delete("liImport");emit()}
}
/* ICP posts (9 Nov): their LinkedIn posts we comment on, to start a conversation and get them to connect. Kept on the lead
   (gtm.content). The daily job finds posts and drafts comments; a teammate edits and approves; the 30-minute job posts the
   approved ones (at most li_engage.cap a day) and logs each as an outbound touch. Nothing is posted without approval. */
const engageCfg=()=>({cap:10,auto:true,...(leadSetting("li_engage")||{})});
const commentsToday=()=>G_().commentsOn(LD.rows,todayIso());
async function gtmPostAdd(id,p){
  p=p||{};const url=String(p.url||"").trim();
  if(!G_().isLiPost(url)){toast("Paste the post's LinkedIn link (linkedin.com/feed/update/… or linkedin.com/posts/…).",true);return false}
  if(p.at&&!G_().parseDay(p.at)){toast("The post date must look like 2026-11-08.",true);return false}
  const key=G_().normPost(url);
  return leadGtmSave(id,g=>{const C=(g.content||[]).slice();if(C.some(x=>G_().normPost(x.url)===key))throw new Error("That post is already on this lead.");
    C.push({id:"p"+Date.now().toString(36),url,at:p.at||"",text:String(p.text||"").trim().slice(0,600),found:todayIso(),draft:String(p.draft||"").trim().slice(0,1250),status:"new",by:meEmail()||p.by||""});
    return{...g,content:C.slice(-40)}});
}
// Edit the draft, approve (queues it for the 30-minute job), skip, or put it back to review.
async function gtmPostSet(id,pid,patch){
  patch=patch||{};if(patch.status&&!["new","approved","skipped"].includes(patch.status)){toast("Use Mark posted for a comment that's live.",true);return false}
  if(patch.status==="approved"){const l=LD.rows.find(r=>r.id===id);const x=l&&G_().contentOf(l).find(y=>y.id===pid);const d=patch.draft!=null?patch.draft:x&&x.draft;
    if(!String(d||"").trim()){toast("Write the comment before approving it.",true);return false}}
  return leadGtmSave(id,g=>({...g,content:(g.content||[]).map(x=>x.id===pid?{...x,...(patch.draft!=null?{draft:String(patch.draft).slice(0,1250)}:{}),...(patch.status?{status:patch.status,[patch.status+"At"]:new Date().toISOString(),[patch.status+"By"]:meEmail()}:{})}:x)}));
}
// A comment is live on their post: counts toward today's budget and is logged as outreach (so a reply makes them Midbound).
async function gtmPostPosted(id,pid,text){
  const cap=engageCfg().cap;if(commentsToday()>=cap){toast("That's "+cap+" comments today already, the daily limit.",true);return false}
  const l=LD.rows.find(r=>r.id===id);const x=l&&G_().contentOf(l).find(y=>y.id===pid);if(!x){toast("That post isn't on this lead any more.",true);return false}
  const body=String(text||x.draft||"").trim();if(!body){toast("There's no comment text to log.",true);return false}
  const ok=await leadGtmSave(id,g=>({...g,content:(g.content||[]).map(y=>y.id===pid?{...y,draft:body,status:"posted",postedAt:new Date().toISOString(),postedBy:meEmail()}:y)}));
  if(!ok)return false;
  return gtmTouch(id,{dir:"out",type:"comment",ch:"LinkedIn",text:body+" (on "+x.url+")",tpl:"ICP comment",angle:"peer"});
}

// One lead, classified (relationship, source, status, ICP score, radar, tags).
function gtmClassify(id){const l=LD.rows.find(r=>r.id===id);if(!l)return null;return G_().classify(l,LD.events.filter(e=>e.lead_id===id),leadSetting("stages")||[],gtmCfg(),new Date())}

/* ---------- connection state for the page ---------- */
function gate(){
  if(!SB_URL||!SB_KEY)return {title:"Supabase isn't connected yet",body:"Add the project URL and anon key to .env.local, rebuild the page, then reload.",action:"retry"};
  if(!window.supabase)return {title:"Couldn't load the sign-in library",body:"Check your connection, then reload the page.",action:"retry"};
  if(!session||!member)return {wait:true,title:"Sign in to "+BRAND+" CRM"};
  if(S.raw.pipeline)return null;
  const e=S.err.pipeline;
  if(!e)return {wait:true,title:"Loading…"};
  return {title:"Couldn't load the CRM",body:"Supabase answered: "+(e.message||e.code||"an unknown error")+".",action:"retry"};
}
function staleNote(){
  const keys=Object.keys(RANGES).filter(k=>S.err[k]&&(k!=="pipeline"||S.raw.pipeline));
  return keys.length?"Couldn't reload "+keys.map(k=>RANGE_NAMES[k]).join(", ")+" from the sheet. Showing what loaded last.":"";
}
function lastUpdate(){const t=Object.values(S.at).filter(Boolean);return t.length?Math.max(...t):null}

let cache=null;
const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SIGNIN_CSS="#crm-signin{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(246,246,248,.86);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-family:var(--font-sans,system-ui,sans-serif)}"
  +"#crm-signin .c{width:min(380px,100%);background:#fff;border-radius:var(--r-lg,16px);box-shadow:var(--shadow-md,0 8px 30px rgba(0,0,0,.08)),inset 0 0 0 1px var(--hairline,#e6e6ea);padding:24px;display:grid;gap:12px;color:var(--ink,#131418)}"
  +"#crm-signin h1{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em}#crm-signin p,#crm-signin .msg{margin:0;font-size:13px;color:var(--ink-3,#71737c)}"
  +"#crm-signin input{height:40px;padding:0 12px;border:0;border-radius:var(--r-btn,10px);box-shadow:inset 0 0 0 1px var(--hairline-strong,#d6d6dc);font:inherit;outline:none}"
  +"#crm-signin input:focus{box-shadow:inset 0 0 0 2px var(--ink,#131418)}#crm-signin button{height:40px;border:0;border-radius:var(--r-btn,10px);background:var(--ink,#131418);color:#fff;font:inherit;font-weight:500;cursor:pointer}"
  +"#crm-signin button[disabled]{opacity:.5;cursor:default}#crm-signin .err{color:var(--bad-ink,#b42318)}";
function showSignIn(kind){
  const go=()=>{
    let el=document.getElementById("crm-signin");
    if(!el){const st=document.createElement("style");st.textContent=SIGNIN_CSS;document.head.appendChild(st);el=document.createElement("div");el.id="crm-signin";document.body.appendChild(el)}
    el.hidden=false;
    if(kind==="notmember"){
      const em=(session&&session.user&&session.user.email)||"This email";
      el.innerHTML='<div class="c" role="dialog" aria-label="Not on the team list"><h1>'+esc(BRAND)+' CRM</h1><p class="msg">'+esc(em)+' isn\u2019t on the team list yet. Ask the owner to add it, then reload.</p><button type="button" id="crm-out">Use a different email</button></div>';
      el.querySelector("#crm-out").onclick=()=>sb.auth.signOut();return;
    }
    el.innerHTML='<form class="c" aria-label="Sign in"><h1>'+esc(BRAND)+' CRM</h1><p>Sign in with your email. We send you a one-time link.</p>'
      +'<label for="crm-email" style="position:absolute;left:-9999px">Email</label><input id="crm-email" type="email" required autocomplete="email" placeholder="you@company.com">'
      +'<button type="submit">Email me a sign-in link</button><div class="msg" role="status"></div></form>';
    el.querySelector("form").onsubmit=async ev=>{
      ev.preventDefault();const b=el.querySelector("button"),m=el.querySelector(".msg"),email=el.querySelector("#crm-email").value.trim();
      b.disabled=true;m.className="msg";m.textContent="Sending\u2026";
      const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
      b.disabled=false;
      if(error){m.className="msg err";m.textContent="Couldn\u2019t send the link: "+error.message}
      else m.textContent="Check "+email+" for the sign-in link. You can close this tab.";
    };
  };
  if(document.body)go();else document.addEventListener("DOMContentLoaded",go,{once:true});
}
function hideSignIn(){const el=document.getElementById("crm-signin");if(el)el.hidden=true}
async function afterAuth(){
  if(!session){showSignIn();emit();return}
  if(member==null){const {data,error}=await sb.from("crm_team").select("email").limit(1);member=!error&&!!(data&&data.length)}
  if(!member){showSignIn("notmember");emit();return}
  hideSignIn();
  if(!started){started=true;setInterval(poll,20000)}
  publicLoad();
}
async function signOut(){if(sb)await sb.auth.signOut()}
function start(){
  S.mcp=null;S.pub=true;
  if(!SB_URL||!SB_KEY||!window.supabase){emit();return}
  sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"implicit",storageKey:"crm-auth"}});
  sb.auth.onAuthStateChange((ev,s)=>{
    const was=session&&session.user?session.user.id:null;session=s;
    if(!s||!s.user||s.user.id!==was)member=null;
    setTimeout(afterAuth,0);   // never call Supabase inside this callback
  });
}

window.AK={
  S,M,RANGES,HANDLES,PILOT,FOLDERS,SHEET_URL,MON,DOW,DAY,STATUSES,STAGES,CLOSED,WRITABLE,
  hooks,subscribe(f){subs.add(f);return ()=>subs.delete(f)},version:()=>version,start,refresh,allow,gate,staleNote,lastUpdate,
  num,fmtK,safeUrl,xUrl,host,parseDate,cellDate,sheetSerial,fmtSerial,ago,plain,firstName,norm,median,weekStart,sameDay,dayWord,folderUrl,
  bucket,fundKind,sendable,messages,statusCells,undoCells,write,canEdit,canRestore,BRAND,signOut,mediaThumb,mediaOpen,
  postStage,minutesOf,linkKey,originalFor,copiesOf,rate,ourEng,isNew,newPosts,markSeen,ourPostLink,
  savePosted,saveScheduled,saveMessaged,restorePost,restoreMessaged,dmsPaused,savePaused,saveTpl,addTpl,XJ,xRun,engagerToPipeline,importLiConnections,liStep,addLikers,LIS,lisSet,lisRun,LBT,lbtSet,lbtRun,liBrief,liTips,liFunding,liSignal,liInmail,liInmailTest,BR,briefLoad,briefRun,XT,xtLoad,xtQueue,xtCancel,xtActive,xtLast,xtPause,deletePost,undeletePost,addPost,movePosts,calNew,calSave,calUpload,mediaIds,saveEngager,
  typeStats,copyNext,founderAsks,trackedPosts,whyFor,patterns,weekGrid,dmResults,viewsOf,bigFirst,compFor,
  liTracked,liState,liLoad,liMove,liKey,liAdd,liPeople,SOC,socialRun,setPersonFit,personToLead,igRun,igToLead,
  leadsLoad,leadsState,leadSetting,leadCreate,leadSave,leadArchive,leadNote,leadNoteDelete,leadSettingSave,leadRename,LD,
  // GTM intelligence (8 Nov): for the page and for scheduled jobs that enrich leads or log replies. Nothing here sends a message.
  gtm:{save:leadGtmSave,intel:gtmIntel,intelMany:gtmIntelMany,signal:gtmSignal,signalDel:gtmSignalDel,set:gtmSet,touch:gtmTouch,
    dupes:gtmDupes,find:gtmFind,merge:gtmMerge,classify:gtmClassify,cfg:gtmCfg,stageFor,
    postAdd:gtmPostAdd,postSet:gtmPostSet,postPosted:gtmPostPosted,commentsToday,engageCfg},
};
start();
})();
