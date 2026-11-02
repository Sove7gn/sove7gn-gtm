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
  pipeline:"'DM Pipeline'!A2:AJ1000",
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
  engagers:"'Post Engagers'!A3:T2000",  // R "Our reply", S "Verdict", T "Why": written by the engager-replies task
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
const WRITABLE=new Set(["Status","Sent on","FU1 sent","FU2 sent","Replied on","Call on","Notes"]);
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
const M={accounts:[],weekly:[],headers:[],contacts:[],targets:[],stats:[],templates:[],comps:[],people:[],theirs:[],ours:[],drafts:[],tracking:[],engagers:[]};
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
      if(loc&&loc.name===r.Name&&Date.now()-loc.at<6e5){for(const k in loc.cells){const v=loc.cells[k];r[k]=typeof v==="number"?fmtSerial(v,k==="Sent on"||k==="Call on"):v}
        if(loc.cells.Status&&r.Status!==loc.cells.Status)r["Next action"]="Updating…"}
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
async function loadGrids(){
  const out={},page=1000;
  for(let from=0;;from+=page){
    const {data,error}=await sb.from("crm_sheet").select("tab,row,cells").order("tab").order("row").range(from,from+page-1);
    if(error)throw {code:error.code||"load_failed",message:error.message};
    for(const r of data)(out[r.tab]=out[r.tab]||[])[r.row-1]=(r.cells||[]).map(v=>v==null?"":String(v));
    if(data.length<page)break;
  }
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
  let grids;
  try{grids=await loadGrids()}catch(e){for(const k in RANGES)if(!S.raw[k])S.err[k]=e;build();emit();return}
  for(const key in RANGES){
    const r=parseRange(RANGES[key]),g=grids[r.tab]||[];
    S.raw[key]=trimGrid(g.slice(r.r0,r.r1+1).map(row=>row.slice(r.c0,r.c1+1).map(v=>v==null?"":v)));
    S.at[key]=Date.now();S.err[key]=null;
  }
  build();emit();
}
/* Live read (29 Oct): the published copy lags about 5 minutes, so Refresh and every save read the sheet live through the
   Apps Script ("read") and keep doing so every 20 seconds for 6 minutes; after that it's the published copy every minute. */
async function liveLoad(){await publicLoad()}
const goLive=()=>{S.liveUntil=Date.now()+36e4;return liveLoad().catch(()=>publicLoad())};
let ticks=0;
function poll(){ticks++;if(Date.now()<(S.liveUntil||0))return liveLoad().catch(()=>{});if(ticks%3===0)return publicLoad()}
// Refresh: reload the sheet now and ask the team's computer to run the post tracker (new numbers and replies from X).
async function refresh(){
  if(S.pub){
    let asked=false;
    try{await scriptCall({action:"refresh"});asked=true}catch(e){}
    await goLive();
    toast(asked?"Up to date. New numbers and replies from X land once the tracker runs; this page keeps checking.":"Up to date.");
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
const sendable=c=>{const k=fundKind(c);return k!=="early"&&k!=="unknown"};
function messages(c){
  const t=M.templates.find(x=>x.ID===c.Template)||{};
  const fn=firstName(c.Name);
  const fill=s=>String(s||"").replace(/\[first name\]/gi,fn);
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
      if(tm&&om)out.push(type+" posts average "+r1(tm)+" per 1K views, against "+r1(om)+" for everything we post.")}
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
  savePosted,saveScheduled,saveMessaged,restorePost,restoreMessaged,dmsPaused,savePaused,deletePost,undeletePost,addPost,movePosts,calNew,calSave,calUpload,mediaIds,saveEngager,
  typeStats,copyNext,founderAsks,trackedPosts,whyFor,patterns,weekGrid,dmResults,viewsOf,bigFirst,compFor,
};
start();
})();
