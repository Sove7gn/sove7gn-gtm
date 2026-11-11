/* GTM intelligence (8 Nov): the ICP as one definition, evidence-based ICP scoring, relationship classification
   (New / Outbound / Midbound / Inbound), acquisition source and engagement status, the Buying Window Radar, outreach drafts,
   dedupe and outreach analytics. Pure functions: no DOM, no Supabase. Inlined into the page as window.GTM by build_app.py
   and loaded by scripts/test-gtm.mjs.

   Everything a lead knows lives in lead.fields.gtm (no schema change):
     intel:   {key: {v, src, at, by}}    facts; src is the URL it came from, at the day it was last checked
     signals: [{id, type, text, at, seen, src, kind}]   buying signals; kind 'fact' needs a src, else 'inference'
     icp:     {ov: {dim: {pts, why}}, dq: 'reason'}      manual overrides and disqualification
     rel:     {acq, conn}                acquisition source override; LinkedIn connection: connected / pending / none
     touches: [{id, at, dir, ch, type, text, tpl, angle}] outreach and replies, newest last
     opp:     {why, angle, hook, msg}    our own notes on the opportunity (not facts)
   Unknown is never scored as positive: a dimension with no evidence scores 0 and is shown as Unknown. */
(function(root){
'use strict';
const DAY=864e5;
const clip=(s,n)=>{s=String(s==null?'':s);return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;};
const low=s=>String(s==null?'':s).toLowerCase();
const has=v=>v!=null&&String(v).trim()!=='';
const iso=d=>{const x=new Date(d);return isNaN(x)?'':x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};

/* ---------- the ICP: one definition, editable on Setup (setting "icp"), defaults from the user's spec ---------- */
const ICP_DEFAULT={
  summary:'Funded B2B / B2B2C software, SaaS, AI or deep-tech startups (5–50 people, seed to Series C, raised in the last 6 months) where a founder or C-suite leader owns the growth budget, GTM is still founder-led, there is no Head of Marketing or SDR team, and LinkedIn / X presence is weak. Must be able to afford about $20k a month.',
  models:['B2B','B2B2C'],
  industries:['software','saas','ai','artificial intelligence','machine learning','ml','deep tech','deeptech','devtools','developer','infrastructure','api','data','security','fintech','hardware','biotech','climate'],
  empMin:5,empMax:50,
  stages:['Seed','Series A','Series B','Series C'],
  recencyMonths:6,
  budgetMonth:20000,
  minRaise:2000000,     // raised at least this much (last round or total): affords ~$20k a month
  accelerators:['YC','Y Combinator','Techstars','Antler','Entrepreneur First','500 Global','a16z speedrun','Neo','South Park Commons','Sequoia Arc','HF0','Pear'],
  titles:['founder','co-founder','cofounder','ceo','chief','cto','coo','cmo','cgo','cro','cpo','president','managing director'],
  references:[],        // lookalike profiles (from crm/config.json icp.references)
  weights:{authority:15,industry:10,employees:10,stage:10,recency:15,founder_led:10,no_team:10,growth:10,organic_gap:5,afford:5},
  bands:{high:85,strong:70,research:50},
};
const DIMS=[
  ['authority','Decision-maker authority'],['industry','Industry'],['employees','Employee count'],['stage','Funding stage'],['recency','Funding recency'],
  ['founder_led','Founder-led GTM'],['no_team','No marketing / SDR team'],['growth','Growth signals'],['organic_gap','Organic distribution gap'],['afford','Affordability'],
];
function icpConfig(saved,cfg){
  const base={...ICP_DEFAULT,...((cfg&&cfg.icp)||{})};const s=saved&&typeof saved==='object'?saved:{};
  const out={...base,...s,weights:{...base.weights,...(s.weights||{})},bands:{...base.bands,...(s.bands||{})}};
  if(!Array.isArray(out.references)||!out.references.length)out.references=base.references||[];
  return out;
}

/* ---------- the intelligence card: what we track, grouped ---------- */
const INTEL=[
  {g:'company',label:'Company',fields:[['website','Website','url'],['industry','Industry','text'],['model','Business model','select',['B2B','B2B2C','B2C','Marketplace','Services / agency']],
    ['employees','Employees','int'],['hq','HQ','text'],['company_li','Company LinkedIn','url'],['description','What they do','area'],['accelerator','Accelerator','text']]},
  {g:'funding',label:'Funding',fields:[['round','Latest round','select',['Pre-seed','Seed','Series A','Series B','Series C','Series D+','Bootstrapped','Grant / other']],
    ['amount','Round amount (USD)','money'],['date','Round date','date'],['investors','Lead investors','text'],['total','Total raised (USD)','money']]},
  {g:'person',label:'Decision-maker',fields:[['title','Title','text'],['authority','Authority','select',['Founder / CEO','C-suite','VP / Head of','Manager','Individual contributor']],
    ['founder','Founder','select',['Yes','No']],['prev','Previous companies','text']]},
  {g:'gtm',label:'GTM',fields:[['founder_led','Founder-led GTM','select',['Yes','No']],['hom','Head of Marketing','select',['No','Yes']],['sdr','SDR team','select',['None','1–2','3+']],
    ['mkt_size','Marketing team size','int'],['hiring','GTM hiring (roles open)','text'],['jobs','Job posts','url'],['li_freq','Founder LinkedIn posts / month','num'],
    ['x_freq','Founder X posts / month','num'],['followers','Founder followers (LinkedIn)','int']]},
];
const FIELD=Object.fromEntries(INTEL.flatMap(g=>g.fields.map(f=>[f[0],{key:f[0],label:f[1],type:f[2],opts:f[3]||null,g:g.g}])));
const SIGNALS={raise:'Recent raise',hiring:'GTM hiring',founder_post:'Founder posting about acquisition',launch:'Launch',expansion:'Expansion',mkt_gap:'No marketing team',weak_organic:'Weak organic presence',other:'Other'};
const TOUCH_TYPES={connection:'Connection request',dm:'Direct message',followup:'Follow-up',email:'Email',accepted:'Accepted connection',comment:'Commented on their post',comment_reply:'Replied to our comment',post_engaged:'Engaged with our post',reply:'Reply',question:'Question',interest:'Showed interest',meeting:'Meeting booked',not_interested:'Not interested',other:'Other'};
const OUT_TYPES=['connection','dm','followup','email','comment'];
// These make an outbound lead Midbound (we reached out first, then they engaged); accepting a connection does not.
const QUALIFYING=['reply','question','interest','meeting','comment_reply','post_engaged'];
// Of those, the ones that are a real conversation and move the stage forward (a like on our post doesn't).
const STAGE_MOVERS=['reply','question','interest','meeting','comment_reply'];
const POSITIVE=['interest','meeting'];

// Money as people write it: "$17M", "17.0m", "2.5 million", "500k", "1,200,000".
function parseMoney(v){
  if(v==null||v==='')return null;if(typeof v==='number')return isFinite(v)?v:null;
  const m=String(v).replace(/,/g,'').match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|m|mn|million|b|bn|billion)?\b/i);if(!m)return null;
  const n=parseFloat(m[1]),u=low(m[2]||'');return Math.round(n*(u==='k'?1e3:/^m/.test(u)?1e6:/^b/.test(u)?1e9:1));
}
const fmtMoney=n=>n==null?'':n>=1e9?'$'+(n/1e9).toFixed(n%1e9?1:0)+'B':n>=1e6?'$'+(n/1e6).toFixed(n%1e6?1:0)+'M':n>=1e3?'$'+Math.round(n/1e3)+'k':'$'+n;
// "2026-09", "2026-09-14", "Sep 2026" → a Date (first of the month when only the month is known).
function parseDay(v){
  if(!has(v))return null;const s=String(v).trim();let m=s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if(m){const d=new Date(+m[1],+m[2]-1,+(m[3]||1));return isNaN(d)?null:d;}
  m=s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);if(m){const i=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(low(m[1]));if(i>=0)return new Date(+m[2],i,1);}
  const d=new Date(s);return isNaN(d)?null:d;
}
const isUrl=s=>/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(String(s||'').trim());
// Checks one intel value before it is saved. Returns '' when fine, else what's wrong.
function validateIntel(key,val,src,at,now){
  const f=FIELD[key];if(!f)return 'Unknown field '+key;now=now||new Date();
  if(has(val)){
    if(f.type==='url'&&!isUrl(val))return f.label+' must be a link starting with http:// or https://';
    if((f.type==='int'||f.type==='num')&&!(isFinite(Number(val))&&Number(val)>=0))return f.label+' must be a number';
    if(f.type==='money'&&parseMoney(val)==null)return f.label+' must be an amount, e.g. $2.5M';
    if(f.type==='date'){const d=parseDay(val);if(!d)return f.label+' must be a date, e.g. 2026-09 or 2026-09-14';if(d-now>DAY)return f.label+' can’t be in the future';}
    if(f.type==='select'&&f.opts&&!f.opts.includes(val))return f.label+' must be one of: '+f.opts.join(', ');
  }
  if(has(src)&&!isUrl(src))return 'The source must be a link starting with http:// or https://';
  if(has(at)){const d=parseDay(at);if(!d)return 'Last verified must be a date';if(d-now>DAY)return 'Last verified can’t be in the future';}
  return '';
}

/* ---------- LinkedIn URLs and dedupe ---------- */
function normLi(u){
  let s=String(u||'').trim();if(!s)return '';try{s=decodeURIComponent(s);}catch(e){}
  s=s.toLowerCase().replace(/[?#].*$/,'').replace(/^https?:\/\//,'').replace(/^(www\.|[a-z]{2}\.)?linkedin\.com/,'linkedin.com').replace(/\/+$/,'');
  return /linkedin\.com\/(in|company)\//.test(s)?s:'';
}
const normName=s=>low(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const normCo=s=>normName(String(s||'').replace(/\(.*?\)/g,'')).replace(/\b(inc|llc|ltd|labs|technologies|technology|ai|hq|co|corp|the)\b/g,'').replace(/\s+/g,' ').trim();
// Possible duplicates among live (not archived) leads: same LinkedIn profile first, then same email, then same person at the same company.
function dupes(rows){
  const live=(rows||[]).filter(l=>!l.archived);const out=[];const used=new Set();
  const pass=(why,keyOf)=>{const m=new Map();for(const l of live){if(used.has(l.id))continue;const k=keyOf(l);if(!k)continue;(m.get(k)||m.set(k,[]).get(k)).push(l);}
    for(const [k,list] of m)if(list.length>1){list.forEach(l=>used.add(l.id));out.push({key:why+':'+k,why,ids:list.map(l=>l.id)});}};
  pass('Same LinkedIn profile',l=>normLi(l.linkedin));
  pass('Same email',l=>{const e=low(l.email).trim();return /@/.test(e)?e:'';});
  pass('Same name and company',l=>{const n=normName(l.name),c=normCo(l.company);return n&&c?n+'|'+c:'';});
  return out;
}
// The lead a new record would duplicate, if any (LinkedIn first, then email, then name + company).
function findDup(rows,o){
  const live=(rows||[]).filter(l=>!l.archived);const li=normLi(o.linkedin),em=low(o.email).trim(),n=normName(o.name),c=normCo(o.company);
  return (li&&live.find(l=>normLi(l.linkedin)===li))||(/@/.test(em)&&live.find(l=>low(l.email).trim()===em))||(n&&c&&live.find(l=>normName(l.name)===n&&normCo(l.company)===c))||null;
}

/* ---------- evidence: what we know, from the card first, else read off the CRM record itself ---------- */
const gtmOf=l=>{const g=l&&l.fields&&l.fields.gtm;return g&&typeof g==='object'?g:{};};
// YC batches: W = winter (Jan), X = spring (Apr), S = summer (Jun), F = fall (Sep). Unknown letters give no date.
const BATCH_M={w:0,x:3,s:5,f:8};
function ycBatch(text){const m=String(text||'').match(/\b(?:YC|Y\s?Combinator)\s*[('’]?\s*([WSFXP])\s?'?(\d{2})\b/i);
  if(!m)return null;const L=low(m[1]),y=2000+Number(m[2]);return{label:'YC '+m[1].toUpperCase()+m[2],date:BATCH_M[L]!=null?new Date(y,BATCH_M[L],1):null};}
// One evidence item: {v, src, at, kind}. kind: 'fact' (has a source link), 'manual' (entered, no link), 'derived' (read off the
// CRM record: role, notes, group, which came from the lead sheet or LinkedIn headline), 'inference' (an AI guess or a rule of thumb).
function evidence(l){
  const g=gtmOf(l);const I=g.intel||{};const E={};
  for(const k in I){const x=I[k];if(x&&has(x.v))E[k]={v:x.v,src:x.src||'',at:x.at||'',kind:isUrl(x.src)?'fact':'manual'};}
  const notes=String(l.notes||''),role=String(l.role||''),all=[notes,role,l.group_name,l.company,l.source_detail].join('\n');
  const put=(k,v,kind,why)=>{if(!E[k]&&has(v))E[k]={v,src:'',at:'',kind,why};};
  put('title',role,'derived','CRM role (LinkedIn headline)');
  const yc=ycBatch(all);
  if(yc)put('accelerator',yc.label,'derived','CRM notes');else if(/\bYC founders\b/i.test(l.group_name||''))put('accelerator','YC','derived','CRM group');
  const r=notes.match(/\b(pre-?seed|seed|series\s+[a-e])\b[^\n$]{0,12}(\$\s*[\d.,]+\s*(?:k|m|mn|million|b|bn)?)?/i);
  if(r){const round=/pre/i.test(r[1])?'Pre-seed':/^seed/i.test(r[1])?'Seed':'Series '+r[1].slice(-1).toUpperCase();
    const ai=/^stage:/im.test(notes)&&/stage:\s*(pre-?seed|seed|series)/i.test(notes);   // social-sync's AI read: "Stage: seed"
    put('round',round==='Series E'?'Series D+':round,ai?'inference':'derived',ai?'AI read of their profile (social sync)':'CRM notes');
    if(r[2])put('amount',parseMoney(r[2]),'derived','CRM notes');}
  else if(yc){put('round','Pre-seed','inference','YC standard deal');}
  if(yc&&yc.date)put('date',iso(yc.date),'inference','YC batch start ('+yc.label+')');
  const d=notes.split('\n').map(x=>x.trim()).find(x=>/^[^:]{2,60}:\s.{20,}/.test(x)&&!/^(stage|booking link)/i.test(x));
  if(d)put('description',d.replace(/^[^:]+:\s*/,''),'inference','AI read of their profile (social sync)');
  return E;
}
const KW=(kinds)=>kinds.reduce((a,k)=>a+({fact:1,manual:.8,override:.8,derived:.6,inference:.4}[k]||0),0)/Math.max(1,kinds.length);

/* ---------- ICP score: 100 points, evidence only ---------- */
function score(l,cfg,now){
  cfg=cfg||ICP_DEFAULT;now=now||new Date();const W=cfg.weights;const E=evidence(l);const g=gtmOf(l);const ov=(g.icp&&g.icp.ov)||{};const sig=signals(l,now);
  const ev=k=>E[k];const val=k=>E[k]?E[k].v:null;const D={};
  // A dimension is only as strong as its weakest evidence: any inference makes it an inference, any CRM-derived value makes it derived.
  const dim=(key,pts,state,why,used)=>{const w=W[key]||0;const U2=(used||[]).filter(Boolean);const kinds=U2.map(u=>u.kind||'derived');
    D[key]={key,label:DIMS.find(x=>x[0]===key)[1],w,pts:pts==null?null:Math.max(0,Math.min(w,Math.round(pts))),state,why,
      kind:['inference','derived','manual','fact'].find(k=>kinds.includes(k))||'',src:U2.map(u=>u.src).filter(Boolean)[0]||'',kinds};};
  const U=(key,why)=>dim(key,null,'unknown',why||'Unknown',[]);
  // 1. authority
  { const t=low([val('title'),val('authority')].join(' '));const f=val('founder');
    if(f==='Yes'||/founder|ceo|chief executive/.test(t)||val('authority')==='Founder / CEO')dim('authority',W.authority,'yes','Founder / CEO: owns the growth budget',[ev('founder')||ev('title')||ev('authority')]);
    else if(val('authority')==='C-suite'||/\bc[a-z]o\b|chief|president|managing director/.test(t))dim('authority',W.authority,'yes','C-suite',[ev('title')||ev('authority')]);
    else if(val('authority')==='VP / Head of'||/\bvp\b|vice president|head of|director/.test(t))dim('authority',W.authority*.5,'partial','VP / Head of: influences, may not own the budget',[ev('title')||ev('authority')]);
    else if(has(t))dim('authority',0,'no','Not a decision-maker ('+clip(val('title')||val('authority'),40)+')',[ev('title')||ev('authority')]);
    else U('authority'); }
  // 2. industry
  { const m=val('model'),ind=low([val('industry'),val('description')].join(' '));const sw=cfg.industries.some(k=>new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(ind));
    if(m&&!cfg.models.includes(m))dim('industry',0,'no',m+' (we sell to '+cfg.models.join(' / ')+')',[ev('model')]);
    else if(m&&sw)dim('industry',W.industry,'yes',m+' '+clip(val('industry')||'software',30),[ev('model'),ev('industry')||ev('description')]);
    else if(m)dim('industry',W.industry*.4,'partial',m+', but not clearly software / AI / deep tech',[ev('model')]);
    else if(has(ind)&&sw)dim('industry',W.industry*.5,'partial','Software / AI, business model unknown',[ev('industry')||ev('description')]);
    else if(has(val('industry')))dim('industry',0,'no','Industry: '+clip(val('industry'),40),[ev('industry')]);
    else U('industry'); }
  // 3. employees
  { const n=has(val('employees'))?Number(val('employees')):null;
    if(n==null)U('employees');else if(n>=cfg.empMin&&n<=cfg.empMax)dim('employees',W.employees,'yes',n+' people',[ev('employees')]);
    else if(n>=cfg.empMin-2&&n<=cfg.empMax*2)dim('employees',W.employees*.4,'partial',n+' people (outside '+cfg.empMin+'–'+cfg.empMax+')',[ev('employees')]);
    else dim('employees',0,'no',n+' people (outside '+cfg.empMin+'–'+cfg.empMax+')',[ev('employees')]); }
  // 4. funding stage
  { const r=val('round');
    if(!r)U('stage');else if(cfg.stages.includes(r))dim('stage',W.stage,'yes',r,[ev('round')]);
    else if(r==='Pre-seed')dim('stage',W.stage*.6,'partial','Pre-seed',[ev('round')]);
    else if(r==='Series D+')dim('stage',W.stage*.2,'partial','Later than Series C',[ev('round')]);
    else dim('stage',0,'no',r,[ev('round')]); }
  // 5. funding recency
  { const d=parseDay(val('date'));
    if(!d)U('recency',val('round')?'Round date unknown':'Unknown');else{const mo=(now-d)/(30.44*DAY);const when=Math.max(0,Math.round(mo))+(Math.round(mo)===1?' month ago':' months ago');
      if(mo<=cfg.recencyMonths)dim('recency',W.recency,'yes','Raised '+when,[ev('date')]);else if(mo<=12)dim('recency',W.recency*.4,'partial','Raised '+when,[ev('date')]);
      else dim('recency',0,'no','Last raise '+when,[ev('date')]);} }
  // 6. founder-led GTM
  { const f=val('founder_led');if(f==='Yes')dim('founder_led',W.founder_led,'yes','Founders run sales and marketing',[ev('founder_led')]);else if(f==='No')dim('founder_led',0,'no','GTM is run by a team',[ev('founder_led')]);else U('founder_led'); }
  // 7. no marketing / SDR team: half for no Head of Marketing, half for no SDRs
  { const h=val('hom'),s=val('sdr'),ms=has(val('mkt_size'))?Number(val('mkt_size')):null;const half=W.no_team/2;let p=0,known=0,bits=[],used=[];
    if(h==='No'||ms===0){p+=half;known++;bits.push('no Head of Marketing');used.push(ev('hom')||ev('mkt_size'));}else if(h==='Yes'){known++;bits.push('has a Head of Marketing');used.push(ev('hom'));}
    if(s==='None'){p+=half;known++;bits.push('no SDRs');used.push(ev('sdr'));}else if(s){known++;bits.push('SDRs: '+s);used.push(ev('sdr'));}
    if(!known)U('no_team');else dim('no_team',p,p>=W.no_team?'yes':p>0?'partial':'no',bits.join(', ')+(known<2?' (other half unknown)':''),used); }
  // 8. growth signals: GTM hiring, a launch or an expansion in the last 6 months
  { const s=sig.filter(x=>['hiring','launch','expansion'].includes(x.type)&&(!x.date||now-x.date<=183*DAY));const hire=val('hiring');
    if(s.length)dim('growth',W.growth,'yes',s.map(x=>SIGNALS[x.type]).filter((v,i,a)=>a.indexOf(v)===i).join(', '),s.map(x=>({kind:x.kind,src:x.src})));
    else if(has(hire)&&!/^(no|none|0)$/i.test(String(hire).trim()))dim('growth',W.growth,'yes','Hiring: '+clip(hire,40),[ev('hiring')]);
    else if(has(hire))dim('growth',0,'no','No GTM roles open',[ev('hiring')]);
    else U('growth'); }
  // 9. organic distribution gap: the founder rarely posts, or has a small following
  { const lf=has(val('li_freq'))?Number(val('li_freq')):null,fo=has(val('followers'))?Number(val('followers')):null;
    if(lf==null&&fo==null)U('organic_gap');
    else if((lf!=null&&lf<4)||(fo!=null&&fo<5000))dim('organic_gap',W.organic_gap,'yes',[lf!=null?lf+' LinkedIn posts a month':'',fo!=null?fo.toLocaleString('en-US')+' followers':''].filter(Boolean).join(', '),[ev('li_freq')||ev('followers')]);
    else dim('organic_gap',0,'no','Already active: '+[lf!=null?lf+' posts a month':'',fo!=null?fo.toLocaleString('en-US')+' followers':''].filter(Boolean).join(', '),[ev('li_freq')||ev('followers')]); }
  // 10. affordability: raised enough to pay ~$20k a month
  { const a=parseMoney(val('amount')),t=parseMoney(val('total'));const m=Math.max(a||0,t||0)||null;
    if(m==null)U('afford');else if(m>=cfg.minRaise)dim('afford',W.afford,'yes','Raised '+fmtMoney(m),[ev('total')||ev('amount')]);
    else if(m>=cfg.minRaise/2)dim('afford',W.afford*.4,'partial','Raised '+fmtMoney(m)+': tight for $'+Math.round(cfg.budgetMonth/1000)+'k a month',[ev('total')||ev('amount')]);
    else dim('afford',0,'no','Raised '+fmtMoney(m)+': too small for $'+Math.round(cfg.budgetMonth/1000)+'k a month',[ev('total')||ev('amount')]); }
  // Manual overrides win, and count as known.
  for(const k in ov){if(!D[k]||ov[k]==null||ov[k].pts==null||ov[k].pts==='')continue;const p=Number(ov[k].pts);if(!isFinite(p))continue;
    D[k]={...D[k],pts:Math.max(0,Math.min(D[k].w,Math.round(p))),state:'override',why:'Set by hand'+(ov[k].why?': '+ov[k].why:'')+(D[k].state!=='unknown'?' (evidence said: '+D[k].why+')':''),kind:'override',kinds:['override']};}
  const dims=DIMS.map(([k])=>D[k]);
  const pts=dims.reduce((a,d)=>a+(d.pts||0),0),unk=dims.filter(d=>d.pts==null).reduce((a,d)=>a+d.w,0),tot=dims.reduce((a,d)=>a+d.w,0)||100;
  const conf=Math.round(dims.reduce((a,d)=>a+(d.pts==null?0:d.w*KW(d.kinds.length?d.kinds:['derived'])),0)/tot*100);
  const B=cfg.bands;const dq=g.icp&&g.icp.dq;
  const band=dq?'disqualified':pts>=B.high?'high':pts>=B.strong?'strong':pts>=B.research?'research':pts+unk>=B.research?'unverified':'excluded';
  const reasons=dims.filter(d=>d.pts&&d.pts>=d.w*.5).sort((a,b)=>b.pts-a.pts).map(d=>d.why);
  const gaps=dims.filter(d=>d.pts==null).sort((a,b)=>b.w-a.w).map(d=>d.label);
  return{score:pts,max:pts+unk,unknown:unk,conf,confLabel:conf>=70?'High':conf>=40?'Medium':'Low',band,label:BAND[band].label,icp:['high','strong','research'].includes(band),dq:dq||'',dims,reasons,gaps,
    explain:(dq?'Disqualified by hand: '+dq+'. ':'')+pts+' of 100 from evidence; '+unk+' points unknown'+(gaps.length?' ('+gaps.slice(0,4).join(', ')+(gaps.length>4?'…':'')+')':'')+'. Confidence '+conf+'%.'};
}
const BAND={high:{label:'High priority',tone:'ok'},strong:{label:'Strong fit',tone:'in'},research:{label:'Possible fit',tone:'warn'},unverified:{label:'Not checked yet',tone:'neutral'},excluded:{label:'Excluded',tone:'ghost'},disqualified:{label:'Disqualified',tone:'bad'}};

/* ---------- buying signals and the Buying Window Radar ---------- */
// Explicit signals from the card, plus the ones the evidence implies (a dated round, open GTM roles, no marketing lead, low posting).
function signals(l,now){
  now=now||new Date();const g=gtmOf(l);const E=evidence(l);const out=[];
  for(const s of g.signals||[]){if(!s||!SIGNALS[s.type])continue;const d=parseDay(s.at)||parseDay(s.seen);
    out.push({id:s.id||'',type:s.type,text:s.text||SIGNALS[s.type],date:d,seen:parseDay(s.seen)||d,src:s.src||'',kind:isUrl(s.src)&&s.kind!=='inference'?'fact':'inference',own:true});}
  const e=E.date;const d=e&&parseDay(e.v);
  if(d&&!out.some(s=>s.type==='raise'))out.push({type:'raise',text:(E.round?E.round.v:'Funding round')+(E.amount?' '+fmtMoney(parseMoney(E.amount.v)):'')+(e.kind==='inference'?' ('+(e.why||'inferred')+')':''),date:d,seen:parseDay(e.at)||null,src:e.src,kind:e.kind==='fact'?'fact':'inference'});
  if(E.hiring&&!/^(no|none|0)$/i.test(String(E.hiring.v).trim())&&!out.some(s=>s.type==='hiring'))out.push({type:'hiring',text:'Hiring: '+clip(E.hiring.v,60),date:parseDay(E.hiring.at),seen:parseDay(E.hiring.at),src:E.hiring.src,kind:E.hiring.kind==='fact'?'fact':'inference',derived:true});
  if(E.hom&&E.hom.v==='No'&&!out.some(s=>s.type==='mkt_gap'))out.push({type:'mkt_gap',text:'No Head of Marketing',date:parseDay(E.hom.at),seen:parseDay(E.hom.at),src:E.hom.src,kind:E.hom.kind==='fact'?'fact':'inference',static:true,derived:true});
  const lf=E.li_freq?Number(E.li_freq.v):null;
  if(lf!=null&&lf<4&&!out.some(s=>s.type==='weak_organic'))out.push({type:'weak_organic',text:'Founder posts '+lf+' times a month on LinkedIn',date:parseDay(E.li_freq.at),seen:parseDay(E.li_freq.at),src:E.li_freq.src,kind:E.li_freq.kind==='fact'?'fact':'inference',static:true,derived:true});
  return out;
}
// Points per signal type by age in days: [[max age, points], ...]; static ones don't fade.
const RADAR={raise:[[90,30],[183,22],[365,8]],hiring:[[60,20],[120,10]],founder_post:[[30,20],[90,10]],launch:[[60,15],[120,7]],expansion:[[90,10],[183,5]],mkt_gap:'static:10',weak_organic:'static:10',other:[[60,5]]};
function radar(l,now){
  now=now||new Date();const S=signals(l,now);const best={};
  for(const s of S){const r=RADAR[s.type];let p=0;
    // An undated signal (no event date and no "last verified") gets its lowest tier: we can't tell how fresh it is.
    if(typeof r==='string')p=Number(r.split(':')[1]);else{const age=s.date?(now-s.date)/DAY:null;if(age==null)p=r[r.length-1][1];else for(const [a,v] of r)if(age<=a){p=v;break;}}
    if(s.kind!=='fact')p*=.6;s.pts=Math.round(p);if(!best[s.type]||best[s.type].pts<s.pts)best[s.type]=s;}
  const used=Object.values(best).filter(s=>s.pts>0).sort((a,b)=>b.pts-a.pts);
  const sc=Math.min(100,used.reduce((a,s)=>a+s.pts,0));
  const level=sc>=55?'HIGH':sc>=30?'MEDIUM':'LOW';
  const top=used[0];
  return{score:sc,level,top:top?top.type:'',angle:ANGLES[top?top.type:'peer'],why:used.map(s=>({type:s.type,label:SIGNALS[s.type],text:s.text,when:s.date?iso(s.date):'',seen:s.seen?iso(s.seen):'',kind:s.kind,src:s.src,pts:s.pts,derived:!!s.derived})),all:S};
}
const ANGLES={
  raise:{id:'raise',label:'Post-raise: turn the round into pipeline',q:'now that the round is closed, how are you thinking about pipeline: keep it founder-led, or bring in a GTM hire first?'},
  hiring:{id:'hiring',label:'First GTM hire vs. founder-led distribution',q:'how are you thinking about the first growth hire versus keeping distribution founder-led for a while longer?'},
  founder_post:{id:'founder_post',label:'Respond to what they posted about acquisition',q:'your post on getting customers stuck with me. What has actually worked for you so far?'},
  launch:{id:'launch',label:'Launch distribution',q:'how are you getting the launch in front of buyers beyond the first spike?'},
  expansion:{id:'expansion',label:'New-market awareness',q:'how are you building awareness in the new market before sales gets there?'},
  mkt_gap:{id:'mkt_gap',label:'Founder-led GTM without a marketing team',q:'with no marketing team yet, how much of the founders’ week goes into distribution?'},
  weak_organic:{id:'weak_organic',label:'Founder presence on LinkedIn / X',q:'have you thought about founder-led content on LinkedIn as a channel, or is it not a priority yet?'},
  other:{id:'other',label:'Founder to founder',q:'what is the hardest part of GTM for you right now?'},
  peer:{id:'peer',label:'Founder to founder',q:'what is the hardest part of GTM for you right now?'},
};

/* ---------- relationship, acquisition source, engagement status ---------- */
const STATUSES=['New','Contacted','Engaged','Meeting booked','Qualified','Proposal','Won','Lost','Nurture'];
const ACQ=['Inbound','Outbound','Referral','Content','Event','Other'];
const REL={new:'New connection',outbound:'Outbound',midbound:'Midbound',inbound:'Inbound'};
const STAGE_STATUS={'new':'New','contacted':'Contacted','in talks':'Engaged','follow up':'Contacted','call booked':'Meeting booked','qualified':'Qualified','proposal sent':'Proposal','won':'Won','lost':'Lost','cold lead':'Nurture','nurture':'Nurture'};
function statusOf(stage,kind){const s=low(stage).trim();if(STAGE_STATUS[s])return STAGE_STATUS[s];if(kind==='won')return 'Won';if(kind==='lost')return 'Lost';
  return /proposal/.test(s)?'Proposal':/call|meeting|demo/.test(s)?'Meeting booked':/qualif/.test(s)?'Qualified':/nurture|cold|later/.test(s)?'Nurture':/talk|engag|repl/.test(s)?'Engaged':/contact|sent|follow/.test(s)?'Contacted':'New';}
const ENGAGED_ST=['Engaged','Meeting booked','Qualified','Proposal','Won'];
// Whether they answered at some point: a logged reply, a stage they reached (the outreach job moves replies to In talks), or the stage now.
function engagedEvidence(l,events,stages,contacted){
  const g=gtmOf(l);const T=g.touches||[];const t=T.filter(x=>x.dir==='in'&&QUALIFYING.includes(x.type));if(t.length)return{how:t[t.length-1].type,at:t[t.length-1].at,src:'touch'};
  // They liked or commented on one of our posts after we first reached out (the post sync logs these as 'engaged').
  if(contacted&&contacted.at){const c0=new Date(contacted.at);const e=(events||[]).filter(x=>x.kind==='engaged'&&new Date(x.at)>c0).sort((a,b)=>new Date(b.at)-new Date(a.at))[0];if(e)return{how:'post_engaged',at:e.at,src:'engaged with our post: '+String(e.text||'').slice(0,60)};}
  const kindOf=n=>{const s=(stages||[]).find(x=>x.name===n);return s?s.kind:'';};
  const st=statusOf(l.stage,kindOf(l.stage));
  for(const e of events||[])if(e.kind==='stage'){const to=String(e.text).split('→').pop().trim();if(ENGAGED_ST.includes(statusOf(to,kindOf(to))))return{how:'stage',at:e.at,src:'stage history: '+e.text};}
  if(ENGAGED_ST.includes(st))return{how:'stage',at:l.stage_at,src:'stage '+l.stage};
  return null;
}
// LinkedIn connection: set on the card, else read off what the outreach job wrote (a DM or group chat can only go to a 1st-degree connection).
function connOf(l,events){
  const g=gtmOf(l);if(g.rel&&g.rel.conn)return g.rel.conn;const T=g.touches||[];if(T.some(t=>t.type==='accepted'||(t.dir==='out'&&t.type==='dm'&&t.ch==='LinkedIn')))return 'connected';
  const sd=String(l.source_detail||'');
  if(/\b(DM|message)\b[^;]*\bsent\b|group chat[^;]*sent|accepted|new connection|1st[- ]degree/i.test(sd))return 'connected';
  if((events||[]).some(e=>/accepted (the |their |our )?invite|accepted (the )?connection|now connected/i.test(e.text)))return 'connected';
  if(/invite sent|request sent|pending/i.test(sd))return 'pending';
  if(/followed/i.test(sd))return 'none';
  return '';
}
function contactedOf(l,events,stages){
  const g=gtmOf(l);const T=(g.touches||[]).filter(t=>t.dir==='out'&&t.type!=='connection');if(T.length)return{at:T[0].at,n:T.length,how:T[0].type};
  const sd=String(l.source_detail||'');const m=sd.match(/\b(?:DM|group chat|message)\b[^;]*?\bsent\s+(\d{4}-\d\d-\d\d)/i);if(m)return{at:m[1],n:1,how:'dm'};
  const kindOf=n=>{const s=(stages||[]).find(x=>x.name===n);return s?s.kind:'';};
  const st=statusOf(l.stage,kindOf(l.stage));if(st!=='New')return{at:l.stage_at||l.last_touch||'',n:1,how:'stage'};
  return null;
}
function acqOf(l){
  const g=gtmOf(l);if(g.rel&&ACQ.includes(g.rel.acq))return g.rel.acq;const sd=low(l.source_detail);
  if(l.source==='Referral'||/referr|intro(duced)? by/.test(sd))return 'Referral';
  if(/event|meetup|conference|summit|demo day/.test(sd))return 'Event';
  if(String(l.origin_key||'').startsWith('li-person:')||/liked your post|commented on your post|engaged with your linkedin post|reacted to/.test(sd)&&l.direction==='Inbound')return 'Content';
  if(l.direction==='Inbound')return 'Inbound';if(l.direction==='Outbound')return 'Outbound';return 'Other';
}
// Everything about one lead the views need. events = this lead's events; stages = the stage settings.
function classify(l,events,stages,cfg,now){
  now=now||new Date();const kindOf=n=>{const s=(stages||[]).find(x=>x.name===n);return s?s.kind:'open';};
  const status=statusOf(l.stage,kindOf(l.stage));const contacted=contactedOf(l,events,stages);const eng=engagedEvidence(l,events,stages,contacted);const conn=connOf(l,events);
  const rel=l.direction==='Inbound'?'inbound':eng?'midbound':conn==='connected'&&!contacted?'new':'outbound';
  const g=gtmOf(l);const T=(g.touches||[]).slice().sort((a,b)=>new Date(a.at)-new Date(b.at));
  const sc=score(l,cfg,now);const rd=radar(l,now);const tg=tags(l,sc,rd,cfg);if(rel==='midbound')tg.unshift('Midbound');
  const lastIn=[...T].reverse().find(t=>t.dir==='in');const lastAny=T[T.length-1];
  const fuN=T.filter(t=>t.dir==='out'&&t.type==='followup').length;
  return{id:l.id,rel,relLabel:REL[rel],acq:acqOf(l),status,closed:['Won','Lost'].includes(status),conn,contacted,engaged:eng,score:sc,radar:rd,tags:tg,touches:T,fuN,
    lastIn,lastAny,positive:T.some(t=>t.dir==='in'&&POSITIVE.includes(t.type))||['Meeting booked','Qualified','Proposal','Won'].includes(status)};
}
// Multi-tags, each with the evidence behind it.
const TAGS=['Midbound','YC','AI','Deep Tech','Recently Funded','Founder-led GTM','Hiring Growth','High Intent','Weak Organic Presence'];
function tags(l,sc,rd,cfg){
  const E=evidence(l);const out=[];const txt=low([E.industry&&E.industry.v,E.description&&E.description.v,l.company,l.role].join(' '));
  if(E.accelerator&&/\b(yc|y combinator)\b/i.test(E.accelerator.v))out.push('YC');
  if(/\b(ai|artificial intelligence|machine learning|llm|genai|agents?)\b/.test(txt))out.push('AI');
  if(/deep ?tech|robotic|quantum|biotech|semiconductor|space|fusion|hardware/.test(txt))out.push('Deep Tech');
  const rec=sc.dims.find(d=>d.key==='recency');if(rec&&rec.state==='yes')out.push('Recently Funded');
  if(E.founder_led&&E.founder_led.v==='Yes')out.push('Founder-led GTM');
  if(rd.all.some(s=>s.type==='hiring'))out.push('Hiring Growth');
  if(rd.level==='HIGH')out.push('High Intent');
  if(rd.all.some(s=>s.type==='weak_organic'))out.push('Weak Organic Presence');
  return out;
}

/* ---------- outreach drafts: relationship-first, founder to founder; never sent automatically ---------- */
function firstName(n){const w=String(n||'').trim().split(/\s+/)[0]||'';return /^[A-Za-z][a-z'’-]+$/.test(w)?w:w?w.charAt(0).toUpperCase()+w.slice(1).toLowerCase():'there';}
function messages(l,c,me){
  me=me||'Reyansh';const fn=firstName(l.name);const co=String(l.company||'').replace(/\s*\(.*?\)\s*/g,' ').trim();const E=evidence(l);const rd=c?c.radar:radar(l);
  const top=rd.why[0];const ang=ANGLES[(top&&top.type)||'peer']||ANGLES.peer;const at=co?' at '+co:'';
  const opp=gtmOf(l).opp||{};
  const raiseTxt=E.round&&E.round.kind!=='inference'?'the '+E.round.v+(E.amount&&E.amount.kind!=='inference'?' ('+fmtMoney(parseMoney(E.amount.v))+')':''):'the recent round';
  const hook=has(opp.hook)?opp.hook:
    !top?'I like what you’re building'+at:
    top.type==='raise'&&top.kind==='fact'?'congrats on '+raiseTxt+(co?' for '+co:''):
    top.type==='raise'?'congrats on getting '+(co||'it')+' off the ground':
    top.type==='hiring'?'saw '+(co||'you')+' is hiring for growth':
    top.type==='founder_post'?'your post about getting customers stuck with me':
    top.type==='launch'?'congrats on the launch'+(co?' at '+co:''):
    top.type==='expansion'?'saw '+(co||'you')+' is expanding':
    'I like what you’re building'+at;
  const H=hook.charAt(0).toUpperCase()+hook.slice(1);
  const connect=clip('Hi '+fn+', '+hook+'. I’m '+me+', a founder too, and I spend most of my week on founder-led GTM. Would be good to connect and swap notes.',300);
  const opener='Thanks for connecting, '+fn+'! '+H+'. Quick question, founder to founder: '+(has(opp.angle)?opp.angle:ang.q)+'\nAsking because it’s the problem I think about most while building SOVE7GN, and I’d love to learn how you see it.';
  const fu1='Hey '+fn+', no rush at all. Curious how distribution is going'+at+' right now: is it still mostly you, or have you brought someone in? Happy to share what’s been working for other early-stage founders if useful.';
  const fu2='Last nudge from me, '+fn+'. If it helps, I can put together a short teardown of how '+(co||'your company')+' shows up on LinkedIn and what founders at your stage do differently. No strings either way, and rooting for you.';
  const why=has(opp.why)?opp.why:whyUs(l,c);
  return{angle:ang,hook:H,why,list:[{id:'rf-connect-v1',label:'Connection note',hint:'Only if sending with a note (our invites normally go without one). Max 300 characters.',text:connect},
    {id:'rf-open-v1',label:'Opener (first DM)',hint:'After they accept, or as the first reply.',text:has(opp.msg)?opp.msg:opener},
    {id:'rf-fu1-v1',label:'Follow-up 1',hint:'About 4 days after the opener, if no reply.',text:fu1},{id:'rf-fu2-v1',label:'Follow-up 2',hint:'About a week after follow-up 1. Then stop.',text:fu2}]};
}
function whyUs(l,c){const sc=c?c.score:score(l);const d=Object.fromEntries(sc.dims.map(x=>[x.key,x]));const bits=[];
  if(d.no_team&&d.no_team.pts)bits.push('no marketing team yet');if(d.founder_led&&d.founder_led.pts)bits.push('GTM is founder-led');if(d.organic_gap&&d.organic_gap.pts)bits.push('weak organic presence');
  if(d.recency&&d.recency.state==='yes')bits.push('fresh capital to deploy');if(d.growth&&d.growth.pts)bits.push('growth signals');
  return bits.length?'They likely need us: '+bits.join(', ')+'.':'Unknown until their GTM team and presence are researched.';}

/* ---------- analytics over classified leads ---------- */
// c = classify() result, l = the lead. Legacy outreach (before drafts were logged) is grouped by what source_detail says was sent.
function templateOf(l,c){const t=[...c.touches].reverse().find(x=>x.dir==='out'&&x.tpl);if(t)return t.tpl;const sd=String(l.source_detail||'');
  return /post-engager/i.test(sd)?'Reyansh DM · post engager':/group chat with Naman/i.test(sd)?'Group chat with Naman (old pitch)':/DM from Reyansh/i.test(sd)?'Reyansh DM · new connection':c.contacted?'Not logged':'';}
function angleOf(c){const t=[...c.touches].reverse().find(x=>x.dir==='out'&&x.angle);return t?(ANGLES[t.angle]||{}).label||t.angle:c.contacted?'Not logged':'';}
function personaOf(l){const E=evidence(l);const t=low([E.title&&E.title.v,E.authority&&E.authority.v].join(' '));
  return /founder|ceo/.test(t)?'Founder / CEO':/\bc[a-z]o\b|chief|president/.test(t)?'Other C-suite':has(t)?'Other role':'Unknown';}
function funnelRow(name,list){
  const n=list.length,sent=list.filter(x=>x.c.contacted).length,resp=list.filter(x=>x.c.contacted&&x.c.engaged).length,pos=list.filter(x=>x.c.contacted&&x.c.positive).length;
  const meet=list.filter(x=>['Meeting booked','Qualified','Proposal','Won'].includes(x.c.status)).length,won=list.filter(x=>x.c.status==='Won').length;
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'–';
  return{name,n,sent,resp,pos,meet,won,respRate:pct(resp,sent),posRate:pct(pos,sent),meetRate:pct(meet,n),winRate:pct(won,n)};
}
function groupBy(items,keyOf,order){const m=new Map();for(const x of items){const k=keyOf(x)||'Unknown';(m.get(k)||m.set(k,[]).get(k)).push(x);}
  const keys=[...m.keys()].sort((a,b)=>order?(order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b)):m.get(b).length-m.get(a).length);
  return keys.map(k=>funnelRow(k,m.get(k)));}

/* ---------- ICP posts (9 Nov): their LinkedIn posts we comment on, kept on the lead as gtm.content ----------
   item: {id, url, at (post date), text (excerpt), found, draft (our comment), status: new | approved | posted | skipped, postedAt, by} */
const CONTENT_ST=['new','approved','posted','skipped'];
const contentOf=l=>(gtmOf(l).content||[]).filter(x=>x&&x.url);
// Comments posted on a given day (YYYY-MM-DD, local) across all leads: the 10-a-day budget.
function commentsOn(rows,day){let n=0;for(const l of rows||[])for(const x of contentOf(l))if(x.status==='posted'&&x.postedAt&&iso(new Date(x.postedAt))===day)n++;return n;}
const normPost=u=>{const s=String(u||'').trim();const m=s.match(/urn:li:(?:activity|ugcPost|share):(\d{10,})/i)||s.match(/activity[-:](\d{10,})/i);return m?'urn:'+m[1]:low(s).replace(/[?#].*$/,'').replace(/\/+$/,'');};
const isLiPost=u=>/^https:\/\/(www\.)?linkedin\.com\/(feed\/update|posts)\//i.test(String(u||'').trim());

root.GTM={CONTENT_ST,contentOf,commentsOn,normPost,isLiPost,STAGE_MOVERS,ICP_DEFAULT,DIMS,INTEL,FIELD,SIGNALS,TOUCH_TYPES,OUT_TYPES,QUALIFYING,POSITIVE,STATUSES,ACQ,REL,TAGS,BAND,ANGLES,
  icpConfig,parseMoney,fmtMoney,parseDay,isUrl,validateIntel,normLi,normName,normCo,dupes,findDup,gtmOf,ycBatch,evidence,score,signals,radar,
  statusOf,engagedEvidence,connOf,contactedOf,acqOf,classify,tags,firstName,messages,whyUs,templateOf,angleOf,personaOf,funnelRow,groupBy,iso};
})(typeof window!=='undefined'?window:globalThis);
