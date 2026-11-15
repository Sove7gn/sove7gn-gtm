/* SOVE7GN CRM v2 (16 Nov). A new screen on top of the same data and the same page logic as the current CRM:
   data.js (window.AK) loads and saves; logic.js (window.AK_LOGIC) works out every list, card and button exactly as the current
   CRM does. This file only draws them: one white sidebar, every platform on one screen, one person panel.
   Plan: _research/CRM_REDESIGN_PLAN.md. Phase 1 = shell, search, person panel, Today, Needs you. Other pages link to the current CRM. */
(function(){
"use strict";
const AK=window.AK;
const CFG=window.CRM_CONFIG||{};
const ME=((CFG.accounts||[])[0]||{}).name||'there';
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const D=864e5;
const ms=x=>{const v=Date.parse(x||'');return isNaN(v)?0:v;};
const safe=(fn,d)=>{try{return fn();}catch(e){console.error('[v2]',e);return d;}};
const plural=(n,one,many)=>n+' '+(n===1?one:(many||one+'s'));
// Plain words (plan: "Plain words"): what the shared logic says, said without the jargon.
const plainWords=s=>String(s==null?'':s).replace(/Replies on ICP posts/g,'Replies on buyers’ posts').replace(/ICP posts/g,'buyers’ posts')
  .replace(/fit our ICP|fits our ICP|fit the ICP/g,'fit who we sell to').replace(/\bICP\b/g,'good-fit').replace(/\bthe VSL\b/g,'the video').replace(/\bVSL\b/g,'video')
  .replace(/\bDM 1\b/g,'first message').replace(/\bIn talks since\b/g,'Talking since').replace(/\bIn talks\b/g,'Replied').replace(/TOFU · Reach/g,'Get seen').replace(/MOFU · Trust/g,'Build trust').replace(/BOFU · Convert/g,'Book calls');

/* ---------- the shared page logic, run without its old screen ---------- */
let renderQ=false;
class Shim{constructor(props){this.props=props||{};this.state={};}
  setState(u,cb){const p=typeof u==='function'?u(this.state):u;if(p&&typeof p==='object'){intercept(p);Object.assign(this.state,p);}schedule();if(cb)setTimeout(cb,0);}}
const Comp=window.AK_LOGIC(Shim,{createRef:()=>({current:null})});
const L=new Comp({});
Object.assign(L.state,{plat:'Leads',lch:'',owner:'Everyone'});

/* ---------- v2's own state ---------- */
const PAGES_KEY='v2-page';
const hashPage=()=>{const m=location.hash.match(/^#\/([a-z]+)$/i);return m?m[1]:'';};
const V={page:(()=>{const h=hashPage();if(h)return h;try{return localStorage.getItem(PAGES_KEY)||'today';}catch(e){return 'today';}})(),
  ptab:'next',pal:false,palQ:'',palSel:0,menu:false,brief:false,more:{},rpQueued:false,f:{},q:{},nums:false,calEd:null};

// Where the old pages live now. Pages not built yet open as a short note with links to the current CRM.
const GO_MAP={home:'today',leads:'today',leadBrief:'today',notifs:'bots',leadSignals:'needs',gtmNow:'outbound',liPipe:'pipeline',pipeline:'pipeline',leadBoard:'pipeline',leadList:'pipeline',
  leadDossier:'calls',liOut:'bots',leadSetup:'settings',leadAdd:'settings',inbox:'needs',engaged:'midbound',replies:'replies',gtmEngage:'replies',xShared:'midbound',liPeople:'midbound',
  liMid:'midbound',liInbox:'inbound',calendar:'calendar',tracker:'results',posts:'ideas',send:'outbound',scripts:'messages',growth:'results',comps:'ideas',pdm:'midbound'};
function intercept(p){
  if('plat' in p)delete p.plat;
  if('page' in p){const pg=p.page;delete p.page;nav(GO_MAP[pg]||pg,true);}
  if(p.lid||p.cid)V.ptab='next';
  if('pal' in p){if(p.pal)setTimeout(openSearch,0);delete p.pal;}
}
L.go=(page,extra)=>{if(extra){const e={...extra};delete e.plat;delete e.page;Object.assign(L.state,e);}nav(GO_MAP[page]||page);};
L.openPal=()=>openSearch();
L.load=()=>{L.state.loading=false;L.state.entered=true;schedule();};

const NAV=[
  {g:'',items:[['today','Home','⌂'],['needs','Needs you','✓'],['calendar','Calendar','▦'],['results','Post metrics','↗']]},
  {g:'Internal CRM',items:[['outbound','Outbound','→'],['midbound','Midbound','♥'],['inbound','Inbound','←'],['pipeline','Pipelines','≡'],['replies','Reply to their posts','↩'],['calls','Calls','☏'],['ideas','Post ideas','✦'],['bots','Bots','⚙'],['messages','Messages','✉'],['settings','Settings','⚒']]}];
const PAGE=Object.fromEntries(NAV.flatMap(g=>g.items.map(([id,label,ic,phase])=>[id,{id,label,ic,phase:phase||1,grp:g.g}])));
if(!PAGE[V.page])V.page='today';
const INFO={results:'How our posts do on LinkedIn and X.',ideas:'Drafts, posts to copy next and comment-a-word DMs.',today:'Your numbers against today’s goals, the calls coming up and whether the bots are running, on LinkedIn, X and Instagram together.',
  needs:'Everything waiting on you, every platform in one list: answer the people who wrote back, approve what the bots will send, then send the few things only you can.',
  outbound:'Everyone we found and reach out to first: just raised, just launched, hiring for growth, our own search and the founder lists.',
  replies:'Posts by the people we sell to, with a reply or comment ready: 30 replies a day on X, plus LinkedIn comments.',
  midbound:'Everyone who liked, commented, replied, followed, viewed our profile, visited the site or asked for a lead magnet, with what to say on every channel.',
  calendar:'Every post for the week, LinkedIn, X and Instagram on one calendar.',results:'How our posts are doing on every platform, best and worst, and followers against the 10,000 goal.',
  ideas:'Our drafts next to the posts they copy, competitors’ best posts and questions for the founders.',inbound:'People who came to us first: messaged us, sent a request, or booked a call on their own.',
  pipeline:'Where everyone is. LinkedIn and X keep their own boards; Email gets one when it’s set up.',calls:'Calls coming up with their Meet links, and the prep for each call.',
  bots:'The LinkedIn and X bots: on or paused, ask first or send on their own, limits, what went out and what didn’t.',messages:'Every message the bots and you send, and which ones get replies.',
  settings:'Who we sell to, where leads come from and when, your own fields, imports.'};
const OLD={outbound:[['X','send','X › Send today'],['Leads','leadSignals','Leads › Signals'],['Leads','gtmNow','Leads › Right now']],
  replies:[['X','replies','X › Replies'],['LinkedIn','gtmEngage','LinkedIn › Engagement']],
  midbound:[['X','engaged','X › Engaged'],['LinkedIn','liPeople','LinkedIn › Liked our posts'],['LinkedIn','liMid','LinkedIn › Replied to us'],['X','xShared','X › From LinkedIn']],
  calendar:[['X','calendar','X › Calendar'],['LinkedIn','calendar','LinkedIn › Calendar']],results:[['X','tracker','X › Post tracker'],['LinkedIn','tracker','LinkedIn › Post tracker'],['X','home','X › Growth']],
  ideas:[['X','posts','X › Inspiration']],inbound:[['LinkedIn','liInbox','LinkedIn › Messages to us']],
  pipeline:[['LinkedIn','liPipe','LinkedIn › Pipeline'],['X','pipeline','X › Pipeline'],['Leads','leadBoard','Leads › Pipeline'],['Leads','leadList','Leads › All leads']],
  calls:[['Leads','leadDossier','Leads › Call dossiers']],bots:[['LinkedIn','liOut','LinkedIn › Bot and outreach'],['Leads','notifs','Leads › Notifications']],
  messages:[['X','pipeline','X › Pipeline › Scripts'],['LinkedIn','liOut','LinkedIn › Bot and outreach']],settings:[['Leads','leadSetup','Leads › Setup'],['Leads','leadAdd','Leads › Add people']]};
function openOld(plat,page){try{localStorage.setItem('ak-crm-plat',JSON.stringify(plat));localStorage.setItem('ak-crm-page',page);}catch(e){}window.open('../','_blank','noopener');}

function nav(page,quiet){if(!PAGE[page])page='today';if(page!==V.page)V.more={};V.page=page;V.menu=false;try{localStorage.setItem(PAGES_KEY,page);}catch(e){}
  if(location.hash!=='#/'+page)history.replaceState(null,'','#/'+page);L.state.lid=null;L.state.cid=null;const m=document.getElementById('main');if(m)m.scrollTop=0;if(!quiet)schedule();else schedule();}
window.addEventListener('hashchange',()=>{const h=hashPage();if(h&&h!==V.page)nav(h);});

/* ---------- actions: every button points at a function made during the last draw ---------- */
let A=[];
const on=fn=>{A.push(fn);return A.length-1;};
const act=(fn,stop)=>' data-a="'+on(e=>{if(stop!==false&&e)e.stopPropagation();fn(e);})+'"';
const inp=fn=>' data-i="'+on(fn)+'"';
const blur=fn=>' data-b="'+on(fn)+'"';
const chg=fn=>' data-c="'+on(fn)+'"';
const key=fn=>' data-k="'+on(fn)+'"';
const cb=fn=>typeof fn==='function'?fn:()=>{};
document.addEventListener('click',e=>{const t=e.target.closest('[data-a]');if(!t||!document.getElementById('app').contains(t))return;const f=A[+t.dataset.a];if(f){e.preventDefault();f(e);}});
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.i){const f=A[+t.dataset.i];if(f)f(e);}});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.c){const f=A[+t.dataset.c];if(f)f(e);}});
document.addEventListener('keydown',e=>{const t=e.target;if(t.dataset&&t.dataset.k){const f=A[+t.dataset.k];if(f)f(e);}});
document.addEventListener('focusout',e=>{const t=e.target;if(t.dataset&&t.dataset.b){const f=A[+t.dataset.b];if(f)f(e);}if(pending)setTimeout(()=>{if(!editing())render();},60);});

/* ---------- small pieces ---------- */
const AVP=[['#E8EEFC','#2D4FA8'],['#E4F4EA','#1E6B3E'],['#EFE8FB','#5B3BA6'],['#FBF0E0','#8A5300'],['#E2F1F5','#1D5C6B'],['#FBE6E3','#9A3127']];
const avc=s=>{s=String(s||'?').replace(/^@/,'');let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;const p=AVP[h%AVP.length];return{bg:p[0],fg:p[1],ini:s.split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'};};
const avatar=(name,plat)=>{const a=avc(name);return '<div class="av" style="background:'+a.bg+';color:'+a.fg+'">'+esc(a.ini)+(plat?platMark(plat):'')+'</div>';};
const PLAT={LinkedIn:['li','in'],X:['x','𝕏'],Instagram:['ig','IG'],Email:['em','@'],WhatsApp:['wa','W']};
const platMark=p=>{const x=PLAT[p]||PLAT.X;return '<span class="plat '+x[0]+'" title="'+esc(p)+'">'+x[1]+'</span>';};
const pill=(t,cls)=>t?'<span class="pill '+(cls||'')+'">'+esc(t)+'</span>':'';
const btn=(label,fn,cls,extra)=>'<button type="button" class="btn '+(cls||'')+'"'+act(cb(fn))+(extra||'')+'>'+esc(label)+'</button>';
const canEdit=()=>AK.canEdit();
const fitOf=n=>{n=parseFloat(n);if(!(n>0))return null;return n>=8?['Great fit','great']:n>=6?['Good fit','good']:n>=4?['Maybe','maybe']:['Weak fit','weak'];};
const fitPill=n=>{const f=fitOf(n);return f?'<span class="pill '+f[1]+'" title="Fit '+esc(String(n).replace('/10',''))+' out of 10">'+f[0]+'</span>':'';};
const moreBtn=(k,total,shown)=>total>shown?'<div style="padding:8px 16px 12px"><button type="button" class="btn ghost sm"'+act(()=>{V.more[k]=true;schedule();})+'>Show '+(total-shown)+' more</button></div>':'';
const lim=(k,arr,n)=>V.more[k]?arr:arr.slice(0,n||8);
const ta=(val,onIn,onBlur,rows,extra)=>'<textarea class="in" rows="'+(rows||3)+'"'+(onIn?inp(onIn):'')+(onBlur?blur(onBlur):'')+(canEdit()?'':' readonly')+(extra||'')+'>'+esc(val)+'</textarea>';
const since=t=>t?L.since(t):'';

/* ---------- one memo per draw: the heavy lists are worked out once and shared by the nav badge, Today and Needs you ---------- */
let RC={};
const memo=(k,fn)=>k in RC?RC[k]:(RC[k]=safe(fn,null));
function withState(tmp,fn){const old={};for(const k in tmp){old[k]=L.state[k];L.state[k]=tmp[k];}try{return fn();}finally{Object.assign(L.state,old);}}
const LIo=l=>((l&&l.fields)||{}).li||{};

function needs(){return memo('needs',()=>{
  const P=L.allPeople();
  const lp=withState({lpExp:'all',lpQ:'',lpMin:0,lpOut:false},()=>safe(()=>L.liPipeVals(),{cols:[]}));
  const xp=withState({xpExp:'all',xpQ:'',xpMin:0},()=>safe(()=>L.xPipeVals(P),{cols:[]}));
  const rp=safe(()=>L.repliesVals(),{rows:[]});
  const sg=withState({sgView:'new',sgKind:'all'},()=>safe(()=>L.leadSignalsVals(),{cards:[]}));
  const tips=withState({tipsSent:false},()=>safe(()=>L.tipsVals(),{items:[]}));
  const dv=safe(()=>L.dailyVals(),{});
  const col=(B,id)=>(B.cols||[]).find(c=>c.id===id)||{cards:[]};
  const byId=new Map((AK.LD.rows||[]).map(l=>[l.id,l]));
  const now=Date.now();
  const liAnswer=col(lp,'talks').cards.filter(k=>{const l=byId.get(k.id),x=LIo(l);return x.replied&&!x.answered&&ms(x.replied)>now-14*D;});
  const xAnswer=safe(()=>L.lists(P).rep,[]);
  const liWait=(lp.cols||[]).flatMap(c=>c.cards.filter(k=>k.hasMsg||k.isFailed));
  const xWait=col(xp,'review').cards.filter(k=>k.hasMsg||k.isFailed);
  const sigs=(sg.cards||[]);
  // 3 ideas: most are written ahead and the bot sends them once the person accepts. Only these need you: they replied
  // (said yes to the ideas), or they accepted and no first message is waiting or going out from the bot.
  const botFirst=new Set((AK.LBT.rows||[]).filter(t=>(t.kind==='dm'||t.kind==='accept')&&['review','ready','sending'].includes(t.status)).map(t=>t.lead_id));
  const allTips=(tips.items||[]).filter(t=>t.notSent);
  const tipItems=allTips.filter(t=>{const x=LIo(byId.get(t.id));return x.replied||(x.acc&&!x.dm&&!botFirst.has(t.id));});
  const tipsAhead=allTips.length-tipItems.length;
  const fol=[...((dv.li||{}).items||[]).map(x=>({...x,plat:'LinkedIn'})),...((dv.x||{}).items||[]).map(x=>({...x,plat:'X'})),...((dv.ig||{}).items||[]).map(x=>({...x,plat:'Instagram'}))];
  const rpOpen=+(rp.openN||0);
  return{lp,xp,rp,sg,tips,tipsAhead,dv,liAnswer,xAnswer,liWait,xWait,sigs,tipItems,fol,liFound:col(lp,'found'),xReview:col(xp,'review'),
    nAnswer:liAnswer.length+xAnswer.length,nApprove:liWait.length+xWait.length+rpOpen+sigs.length,nHand:tipItems.length+fol.length};});}

/* ---------- shell ---------- */
let pending=false;
const editing=()=>{const a=document.activeElement;return !!a&&/^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName)&&!a.closest('.pal')&&document.getElementById('app').contains(a);};
function schedule(){if(renderQ)return;renderQ=true;setTimeout(()=>{renderQ=false;render();},0);}
function mount(){
  document.getElementById('app').innerHTML='<div class="app"><aside class="rail" id="rail"></aside><div style="display:flex;flex-direction:column;min-width:0;min-height:0">'
    +'<div class="top" id="top"></div><main class="main" id="main"><div class="col" id="col"></div></main></div></div><div id="ov"></div><div id="palc"></div>';
  L.mainRef.current=document.getElementById('main');
}
function render(){
  if(editing()){pending=true;return;}
  pending=false;A=[];RC={};
  L.viewOnlyRole=false;L.founder=!AK.canEdit();
  const keep={};document.querySelectorAll('[data-keep]').forEach(el=>{keep[el.dataset.keep]=el.scrollTop;});
  const g=AK.gate();
  document.getElementById('rail').className='rail'+(V.menu?' open':'');
  document.getElementById('rail').innerHTML=railHtml(g);
  document.getElementById('top').innerHTML='<button type="button" class="btn sm"'+act(()=>{V.menu=!V.menu;schedule();})+'>☰</button><b>'+esc(PAGE[V.page].label)+'</b><span class="sp"></span><button type="button" class="btn sm"'+act(openSearch)+'>Search</button>';
  document.getElementById('col').innerHTML=pageHtml(g);
  document.getElementById('ov').innerHTML=(g?'':panelHtml()+briefHtml()+calEditHtml())+toastHtml()+(DRY?'<div class="dry">Dry run: nothing is saved or sent</div>':'');
  document.querySelectorAll('[data-keep]').forEach(el=>{if(keep[el.dataset.keep]!=null)el.scrollTop=keep[el.dataset.keep];});
  document.title=PAGE[V.page].label+' · '+(AK.BRAND||'SOVE7GN')+' CRM';
}
function railHtml(g){
  const n=g?null:needs();const tot=n?n.nAnswer+n.nApprove+n.nHand:0;
  let h='<div class="brand"><div class="logo">'+esc((AK.BRAND||'S')[0])+'</div>'+esc(AK.BRAND||'SOVE7GN')+'</div><nav class="nav">';
  for(const grp of NAV){if(grp.g)h+='<div class="grp"><span>'+esc(grp.g)+'</span></div>';
    for(const [id,label,ic,phase] of grp.items){const badge=id==='needs'&&tot?'<span class="badge">'+(tot>99?'99+':tot)+'</span>':phase>1?'<span class="soon">soon</span>':'';
      h+='<button type="button" class="'+(V.page===id?'on':'')+'"'+act(()=>nav(id))+' title="'+esc(INFO[id]||'')+'"><span class="ic">'+ic+'</span>'+esc(label)+badge+'</button>';}}
  h+='</nav><div class="rail-foot"><button type="button"'+act(openSearch)+'>⌕ Search<kbd>Ctrl K</kbd></button>'
    +'<button type="button"'+act(()=>{AK.refresh();L.toast('Getting the latest numbers, replies and leads.');})+'>↻ Refresh'+(AK.lastUpdate()?'<span style="margin-left:auto;font-size:11px;color:var(--faint)">'+esc(AK.ago(AK.lastUpdate()))+'</span>':'')+'</button>'
    +'<button type="button"'+act(()=>window.open('../','_blank','noopener'))+'>⧉ Open the current CRM</button>'
    +(AK.canEdit()?'<button type="button"'+act(()=>AK.signOut())+'>⎋ Sign out</button>':'')+'</div>';
  return h;
}
function pageHtml(g){
  if(g){if(g.wait)return '<div class="empty" style="padding:80px 0">'+esc(g.title||'Loading…')+'</div>';
    return '<div class="card" style="margin-top:40px"><div class="sec-b"><h2 style="margin:0 0 6px;font-size:16px">'+esc(g.title)+'</h2><p class="note">'+esc(g.body||'')+'</p>'+(g.action==='retry'?btn('Try again',()=>location.reload(),'pri'):'')+'</div></div>';}
  const f={today:pgToday,needs:pgNeeds,outbound:pgOutbound,midbound:pgMidbound,inbound:pgInbound,replies:pgReplies,pipeline:pgPipeline,calls:pgCalls,calendar:pgCalendar,results:pgResults,ideas:pgIdeas,bots:pgBots,messages:pgMessages,settings:pgSettings}[V.page];
  const ld=AK.leadsState();
  if(f&&!ld.loaded)return '<div class="empty" style="padding:80px 0">Loading leads…</div>';
  if(f)return safe(f,'<div class="errline">This page couldn’t be drawn. Open the current CRM while it’s fixed.</div>');
  return pgSoon(V.page);
}
function head(title,info,right){return '<div class="ph"><div><h1>'+esc(title)+'</h1><p>'+esc(info||'')+'</p></div><span class="sp"></span>'+(right?'<div class="right">'+right+'</div>':'')+'</div>';}
function pgSoon(id){const p=PAGE[id];
  return head(p.label,INFO[id])+'<div class="soonbox"><h2>Coming in phase '+p.phase+' of the redesign</h2><div>Until then, everything on this page is in the current CRM:</div><div class="chips">'
    +(OLD[id]||[]).map(([pl,pg,label])=>'<button type="button" class="chip"'+act(()=>openOld(pl,pg))+'>'+esc(label)+' ↗</button>').join('')+'</div></div>';}

/* ---------- one way to show people everywhere (after Drona's CRM): filter chips, a search box, then one-line rows.
   Each row says who, what, and one button. Everything else lives in the person panel (click the row). ---------- */
const ell=(t,cls)=>'<div class="ell'+(cls?' '+cls:'')+'" title="'+esc(t)+'">'+esc(t)+'</div>';
const pcell=(name,sub,plat)=>'<div class="pc">'+avatar(name,plat)+'<div class="pc-t"><div class="ell nm">'+esc(name)+'</div>'+(sub?ell(sub,'meta'):'')+'</div></div>';
const ACTS=(main,more)=>'<div class="ra">'+(main?btn(main[0],main[1],'pri sm'):'')+(more||[]).filter(Boolean).map(m=>btn(m[0],m[1],'sm ghost')).join('')+'</div>';
function table(tk,cols,rows,empty,per){
  per=per||40;const shown=V.more[tk]?rows:rows.slice(0,per);const gt='grid-template-columns:'+cols.map(c=>c[1]).join(' ');
  if(!rows.length)return '<div class="tb"><div class="empty">'+esc(empty||'Nobody here.')+'</div></div>';
  return '<div class="tb"><div class="tb-h" style="'+gt+'">'+cols.map(c=>'<div>'+esc(c[0])+'</div>').join('')+'</div>'
    +shown.map(r=>'<div class="tb-r" style="'+gt+'"'+(r.open?act(r.open,false):'')+'>'+r.cells.map((c,i)=>'<div class="tc" data-h="'+esc(cols[i][0])+'">'+c+'</div>').join('')+'</div>').join('')
    +(rows.length>shown.length?'<div class="tb-more">'+btn('Show '+(rows.length-shown.length)+' more',()=>{V.more[tk]=true;schedule();},'ghost sm')+'</div>':'')+'</div>';
}
function chipsBar(fk,opts,right){ // opts: [[id,label,count]]
  const cur=V.f[fk]||opts[0][0];
  return '<div class="bar"><div class="chips">'+opts.filter(o=>o[0]==='all'||o[2]).map(([id,label,n])=>'<button type="button" class="chip'+(cur===id?' on':'')+'"'+act(()=>{V.f[fk]=id;V.more={};schedule();})+'>'+esc(label)+(n!=null?' <span class="c">'+n+'</span>':'')+'</button>').join('')+'</div><span class="sp"></span>'
    +'<input class="in search" placeholder="Search" value="'+esc(V.q[fk]||'')+'"'+inp(e=>{V.q[fk]=e.target.value;})+chg(()=>schedule())+key(e=>{if(e.key==='Enter'){e.target.blur();}})+'>'+(right||'')+'</div>';
}
const matchQ=(fk,...parts)=>{const q=String(V.q[fk]||'').trim().toLowerCase();return !q||parts.join(' ').toLowerCase().includes(q);};
const tabsBar=(fk,opts)=>{const cur=V.f[fk]||opts[0][0];return '<div class="seg">'+opts.map(([id,label,n])=>'<button type="button" class="'+(cur===id?'on':'')+'"'+act(()=>{V.f[fk]=id;V.more={};schedule();})+'>'+esc(label)+(n!=null?' <span class="c">'+n+'</span>':'')+'</button>').join('')+'</div>';};

/* indexes, made once per draw */
function IX(){return memo('ix',()=>{
  const task=new Map();for(const t of (AK.LBT.rows||[]))if(['review','ready','sending','failed'].includes(t.status)&&!task.has(t.lead_id))task.set(t.lead_id,t);
  const byH=new Map(),byN=new Map();for(const c of (AK.M.contacts||[])){const h=String(c['X handle']||'').replace(/^@/,'').toLowerCase();if(h&&!byH.has(h))byH.set(h,c);const n=window.GTM?GTM.normName(c.Name):c.Name;if(n&&!byN.has(n))byN.set(n,c);}
  const xt=new Map();for(const t of (AK.XT.rows||[])){const a=xt.get(t.row)||[];a.push(t);xt.set(t.row,a);}
  return{task,byH,byN,xt};});}
function xOf(l){const I=IX();const h=String(l.x_handle||((l.fields||{}).li_icp||{}).x||'').replace(/^@/,'').toLowerCase();return (h&&I.byH.get(h))||(l.name&&I.byN.get(window.GTM?GTM.normName(l.name):l.name))||null;}
function liShort(l){const x=LIo(l),t=IX().task.get(l.id);
  if(t)return t.status==='review'?'Waiting for your OK':t.status==='failed'?'Didn’t go through':'Sending soon';
  if(x.replied)return 'Replied';if(x.stop==='no reply')return 'No reply';if(x.dm)return +x.fu?'Follow-up '+x.fu:'First message sent';if(x.acc)return 'Accepted';if(x.req)return 'Request sent';return l.linkedin?'Not contacted':'–';}
const X_SHORT={'To send':'Waiting for your OK','Sent':'First DM sent','FU1 sent':'Follow-up 1','FU2 sent':'Follow-up 2','Replied':'Replied','Call booked':'Call booked','Customer':'Client','Not now':'Closed','No reply':'Closed','Do not contact':'Closed'};
function xShort(c){if(!c)return '–';const T=(IX().xt.get(c._row)||[]);if(T.some(t=>t.status==='ready'||t.status==='sending'))return 'Queued for the bot';
  const s=T.filter(t=>t.status==='sent').sort((a,b)=>ms(b.sent_at)-ms(a.sent_at))[0];if(s&&!/^(Replied|Call booked|Customer)$/.test(c._status))return s.kind==='dm'?'First DM sent':'Follow-up '+String(s.kind).replace('fu','');return X_SHORT[c._status]||c._status||'–';}
const stTone=t=>/Replied|Call booked|Client|Won/.test(t)?'ok':/Waiting for your OK|Didn/.test(t)?'warn':/^–$|Not contacted|Closed|No reply/.test(t)?'':'blue';
const stPill=t=>t&&t!=='–'?pill(t,stTone(t)):'<span class="faint">–</span>';
function fitN(l){const S=memo('fit:'+l.id,()=>L.liPipeScore(l));return S?S.n:null;}
const leadsOpen=()=>(AK.LD.rows||[]).filter(l=>!l.archived);
const OUT_SRC={funding:'Just raised',launch:'Just launched',hiring:'Hiring for growth',prospect:'Our search',list:'Founder lists',connection:'Old connections',outbound:'We reached out',tagged:'We tagged them',niche:'Commented on a founder post'};
const MID_SRC={liked:'Liked our post',commented:'Commented',viewed:'Viewed our profile',site:'Visited our site',magnet:'Asked for a lead magnet'};
const whenTxt=t=>t?since(t):'';

/* ---------- Today ---------- */
function pgToday(){
  const sc=L.scoreVals();const P=L.allPeople();const gr=safe(()=>L.growthVals(P),null);const N=needs();const dv=N.dv||{};
  const hr=new Date().getHours();const hi=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const date=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
  const o=sc.overall||[];const xr=((sc.x||{}).rows||[])[2]||{t:'0',y:'0',w:'0'};
  const frac=v=>{const m=String(v||'').match(/(\d+)\s*\/\s*(\d+)/);return m?Math.min(100,+m[1]/Math.max(1,+m[2])*100):null;};
  const stat=(l,v,d,bar,cls)=>'<div class="stat '+(cls||'')+'"><div class="l">'+esc(l)+'</div><div class="v">'+esc(v)+'</div>'+(d?'<div class="d">'+esc(d)+'</div>':'')+(bar!=null?'<div class="bar"><i style="width:'+bar+'%"></i></div>':'')+'</div>';
  let h=head(hi+', '+ME,date,btn('Morning brief',()=>{V.brief=true;schedule();}));
  h+='<div class="stats six">'
    +(o[0]?stat('New people reached',o[0].v,o[0].d,frac(o[0].v)):'')
    +stat('X replies on buyers’ posts',xr.t+' / 30','Yesterday '+xr.y,frac(xr.t+'/30'))
    +(o[1]?stat('Replied to us',o[1].v,o[1].d):'')
    +(o[2]?stat('Calls booked',o[2].v,'Coming up'):'')
    +(o[3]?stat('Clients this month',o[3].v,o[3].d||'',null,+o[3].v?'good':''):'')
    +(gr?stat('X followers',gr.now+' / '+gr.goal,gr.daysLeft+' days left · line says '+gr.onTrack,parseFloat(gr.pct)||0):'')+'</div>';
  const go=t=>()=>{V.f.needs=t;nav('needs');};
  h+='<h2 class="h2">Waiting on you</h2><div class="todo3">'
    +[['answer','Answer',N.nAnswer,'People who wrote back'],['approve','Approve',N.nApprove,'What the bots will send'],['hand','Send by hand',N.nHand,'Only you can send these']]
      .map(([t,l,n,d])=>'<button type="button" class="t3'+(n?'':' zero')+'"'+act(go(t))+'><div class="n">'+n+'</div><div class="l">'+esc(l)+'</div><div class="d">'+esc(d)+'</div></button>').join('')+'</div>';
  // calls with a time, from now on
  const now=Date.now();
  const calls=leadsOpen().map(l=>({l,c:(l.fields||{}).call||{}})).filter(z=>z.c.at&&+z.c.at>now-2*36e5&&!/declined|cancelled/.test(z.c.status||'')).sort((a,b)=>a.c.at-b.c.at);
  h+='<h2 class="h2">Calls coming up</h2>'+table('tcalls',[['Who','minmax(0,2fr)'],['When','minmax(0,1.3fr)'],['','auto']],calls.map(({l,c})=>({open:()=>L.openLead(l.id),
    cells:[pcell(l.name||l.email||'Someone',[l.company,(c.kind==='clipping'?'Clipping call':'GTM call')].filter(Boolean).join(' · '),l.source),
      esc(new Date(+c.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+' IST'),
      ACTS(c.meet?['Join Meet',()=>window.open(c.meet,'_blank','noopener')]:null,[['Prep',()=>{L.openLead(l.id);V.ptab='research';}]])]})),'No calls with a time yet. See Calls for booked calls without one.');
  // bots, one line each
  const li=sc.li||{},x=sc.x||{};const bad=a=>(a||[]).filter(z=>!/ok\)/.test(z.dot));
  const line=(plat,arr)=>{const b=bad(arr);const z=b[0]||(arr||[])[0];return z?'<div class="hl">'+platMark(plat)+'<span class="dot '+(b.length?'warn':'ok')+'"></span><span>'+esc(plainWords(z.text))+'</span></div>':'';};
  h+='<h2 class="h2">Bots</h2><div class="card sec-b" style="margin:0">'+line('LinkedIn',li.health)+line('X',x.health)+'</div>';
  // the numbers, folded away
  const tr=(plat,r)=>'<tr><td>'+platMark(plat)+' &nbsp;'+esc(plainWords(r.label))+'</td>'+['t','y','w'].map(k=>'<td class="num'+(+r[k]?'':' zero')+'">'+esc(r[k])+'</td>').join('')+'</tr>';
  h+='<div style="margin-top:20px">'+btn(V.nums?'Hide the numbers':'Show the numbers: today, yesterday, 7 days',()=>{V.nums=!V.nums;schedule();},'ghost sm')+'</div>'
    +(V.nums?'<div class="card" style="margin-top:8px"><table class="t"><thead><tr><th></th><th class="num">Today</th><th class="num">Yesterday</th><th class="num">7 days</th></tr></thead><tbody>'
      +(li.rows||[]).map(r=>tr('LinkedIn',r)).join('')+(x.rows||[]).map(r=>tr('X',r)).join('')+'</tbody></table></div>':'');
  return h;
}

/* ---------- Needs you: one to-do list, one line per thing ---------- */
function todos(){return memo('todos',()=>{
  const N=needs();const out=[];const byId=new Map((AK.LD.rows||[]).map(l=>[l.id,l]));
  for(const k of N.liAnswer){const l=byId.get(k.id);const x=LIo(l);
    out.push({t:'answer',plat:'LinkedIn',name:k.name,sub:k.sub,what:'Answer their reply',detail:k.hasDraft?'Suggested: '+k.draft:plainWords(k.status),when:whenTxt(x.replied),open:k.open,
      main:[k.hasDraft?'Copy reply':'Open chat',k.hasDraft?k.copyDraft:k.profile],more:[canEdit()&&['Answered',()=>AK.leadSave(l.id,{fields:{...(l.fields||{}),li:{...x,answered:new Date().toISOString()}}})]]});}
  for(const p of N.xAnswer){const open=()=>{const id=String(p.xid||'').trim(),hd=String(p.handle||'').replace(/^@/,'');const u=/^\d+$/.test(id)?'https://x.com/messages/compose?recipient_id='+id:hd?'https://x.com/'+hd:'';if(u)window.open(u,'_blank','noopener');};
    out.push({t:'answer',plat:'X',name:p.name,sub:[p.role,p.company].filter(Boolean).join(' · '),what:'Answer their reply',detail:p.result||'They wrote back on X',when:p.c&&p.c['Replied on']||'',open:()=>L.openC(p.id),
      main:['Open chat',open],more:[canEdit()&&['Call booked',()=>L.setStage(p.id,'Call booked','Call booked with '+p.first)],canEdit()&&['Close',()=>L.setStage(p.id,'Closed')]]});}
  const rp=N.rp||{};
  if(+rp.openN)out.push({t:'approve',plat:'X',name:'Replies on buyers’ posts',sub:(rp.doneN||0)+' of 30 done today',what:'Approve '+rp.openN+' replies',detail:'Replies to founders’ and creators’ posts, written for you',when:'',open:()=>nav('replies'),main:['Open',()=>nav('replies')]});
  for(const k of N.liWait)out.push({t:'approve',plat:'LinkedIn',name:k.name,sub:k.sub,fit:k.score,what:k.isFailed?'Didn’t go through':'Approve '+plainWords(k.msgKind||'message').toLowerCase(),detail:k.isFailed?k.status:k.msg,when:'',open:k.open,
    main:canEdit()?(k.isFailed?['Try again',k.retry]:['Approve',k.approve]):null,more:[canEdit()&&k.hasMsg&&['Skip',k.skip]]});
  for(const k of N.xWait)out.push({t:'approve',plat:'X',name:k.name,sub:k.sub,fit:k.score,what:k.isFailed?'Didn’t go through':'Approve first DM',detail:k.isFailed?k.status:k.msg,when:'',open:k.open,
    main:canEdit()?(k.isFailed?['Try again',k.retry]:['Approve',k.approve]):null,more:[canEdit()&&k.hasMsg&&['Skip',k.skip]]});
  for(const k of N.sigs)out.push({t:'approve',plat:'LinkedIn',name:k.name,sub:k.sub,fit:k.score,what:'New signal: '+String(k.kindLabel||'').replace(/^\S+\s/,''),detail:k.headline,when:k.when,open:k.open,
    main:canEdit()?['Add to outreach',k.add]:null,more:[canEdit()&&['Not a fit',k.trash]]});
  for(const t of N.tipItems)out.push({t:'hand',plat:'LinkedIn',name:t.name,sub:t.sub,what:'Send their 3 ideas',detail:t.meta,when:'',open:t.openLead,
    main:['Copy + open chat',()=>{t.copy();if(t.hasChat)t.openChat();}],more:[t.canEdit&&['Mark sent',t.markSent]]});
  for(const it of N.fol)out.push({t:'hand',plat:it.chan==='WhatsApp'?'WhatsApp':it.plat,name:it.name,sub:it.sub,what:'Follow up on '+it.chan,detail:plainWords(it.why),when:'',open:it.hasLead?it.openLead:null,
    main:it.hasLink?[it.chan==='WhatsApp'?'WhatsApp':'Open',it.open]:null,more:[it.canSpoke&&['Done',it.spoke]]});
  return out;});}
function pgNeeds(){
  const T=todos();const N=needs();const c=t=>T.filter(x=>x.t===t).length;
  const cur=V.f.needs||'all';const list=T.filter(x=>cur==='all'||x.t===cur);
  let h=head('Needs you','Everything waiting on you, every platform. Click a row to see the full message.');
  const bulk=cur==='approve'&&canEdit()?(N.liFound.hasAll?btn(N.liFound.allLabel+' on LinkedIn',N.liFound.all,'sm'):'')+(N.xReview.hasAll?btn(N.xReview.allLabel+' X DMs',N.xReview.all,'sm'):''):'';
  h+=tabsBar('needs',[['all','All',T.length],['answer','Answer',c('answer')],['approve','Approve',c('approve')],['hand','Send by hand',c('hand')]])+(bulk?'<div class="bar" style="margin-top:12px"><span class="sp"></span>'+bulk+'</div>':'');
  const TXT={answer:'Answer',approve:'Approve',hand:'By hand'};
  h+='<div style="margin-top:12px">'+table('needs:'+cur,[['Who','minmax(0,1.6fr)'],['To do','minmax(0,1.3fr)'],['Detail','minmax(0,2fr)'],['','auto']],
    list.map(x=>({open:x.open,cells:[pcell(x.name,x.sub,x.plat),'<div class="ell"><b class="todo-w">'+esc(x.what)+'</b></div>'+(cur==='all'?'<div class="meta">'+TXT[x.t]+(x.when?' · '+esc(x.when):'')+'</div>':x.when?'<div class="meta">'+esc(x.when)+'</div>':''),
      ell(String(x.detail||'').replace(/\s+/g,' '),'meta')+(x.fit?'<div>'+fitPill(x.fit)+'</div>':''),ACTS(x.main,x.more)]})),'Nothing waiting on you here. Nice.')+'</div>';
  return h;
}

/* ---------- Outbound ---------- */
function pgOutbound(){
  const rows=[];const usedX=new Set();
  for(const l of leadsOpen()){const s=srcOf(l);if(!OUT_SRC[s]||l.source!=='LinkedIn')continue;const c=xOf(l);if(c)usedX.add(c._key);rows.push({l,c,src:s});}
  for(const c of (AK.M.contacts||[]))if(!usedX.has(c._key))rows.push({c,src:'x'});
  const lab=r=>r.src==='x'?'Found on X':OUT_SRC[r.src];
  const cnt={};for(const r of rows)cnt[r.src]=(cnt[r.src]||0)+1;
  const opts=[['all','All',rows.length],...Object.keys(OUT_SRC).map(k=>[k,OUT_SRC[k],cnt[k]||0]),['x','Found on X',cnt.x||0]];
  const cur=V.f.out||'all';
  const list=rows.filter(r=>(cur==='all'||r.src===cur)&&matchQ('out',r.l?r.l.name:'',r.l?r.l.company:'',r.c?r.c.Name:'',r.c?r.c.Company:''))
    .map(r=>({...r,fit:r.l?fitN(r.l):r.c._fit,t:r.l?ms(LIo(r.l).last||LIo(r.l).req||r.l.created_at):0})).sort((a,b)=>(b.fit||0)-(a.fit||0)||b.t-a.t);
  const right=canEdit()?btn('Find more on X',()=>AK.xRun('x-leads'),'sm')+btn('Check funding news',()=>AK.liFunding(),'sm ghost'):'';
  const reached=rows.filter(r=>(r.l&&liReached(r.l))||xReached(r.c)).length,replied=rows.filter(r=>(r.l&&liReplied(r.l))||xReplied(r.c)).length;
  const calls=rows.filter(r=>(r.l&&isCallSt(r.l.stage))||(r.c&&r.c._status==='Call booked')).length,waitOk=rows.filter(r=>(r.l&&(IX().task.get(r.l.id)||{}).status==='review')||(r.c&&r.c._status==='To send')).length;
  let h=head('Outbound',INFO.outbound)+strip([['People found',String(rows.length),(cnt.x||0)+' on X · '+(rows.length-(cnt.x||0))+' on LinkedIn'],['Reached',String(reached),'got a request or a DM'],['Replied',String(replied),'Reply rate '+pct(replied,reached)],['Calls booked',String(calls),'from outbound'],['Waiting for your OK',String(waitOk),'first touches']])+chipsBar('out',opts,right);
  h+=table('out',[['Who','minmax(0,2fr)'],['Found by','minmax(0,1.1fr)'],['LinkedIn','minmax(0,1fr)'],['X','minmax(0,1fr)'],['Fit','90px']],list.map(r=>{
    const name=r.l?r.l.name:r.c.Name,sub=r.l?[r.l.role,r.l.company].filter(Boolean).join(' · '):[r.c.Role,r.c.Company].filter(Boolean).join(' · ');
    return{open:r.l?()=>L.openLead(r.l.id):()=>L.openC(r.c._key),cells:[pcell(name||'(no name)',sub,r.l?'LinkedIn':'X'),'<span class="meta">'+esc(lab(r))+'</span>',stPill(r.l?liShort(r.l):'–'),stPill(r.c?xShort(r.c):'–'),fitPill(r.fit)||'<span class="faint">–</span>']};}),'Nobody matches.');
  return h;
}

/* ---------- Midbound ---------- */
function pgMidbound(){
  const rows=[];
  for(const l of leadsOpen()){const s=srcOf(l);if(!MID_SRC[s])continue;rows.push({l,src:s,c:xOf(l)});}
  for(const e of (AK.M.engagers||[]))if((e.Status||'To message')==='To message'&&!/^Skip/.test(String(e.Verdict||'')))rows.push({e,src:'x'});
  const cnt={};for(const r of rows)cnt[r.src]=(cnt[r.src]||0)+1;
  const opts=[['all','All',rows.length],...Object.keys(MID_SRC).map(k=>[k,MID_SRC[k],cnt[k]||0]),['x','Engaged on X',cnt.x||0]];
  const cur=V.f.mid||'all';
  const list=rows.filter(r=>(cur==='all'||r.src===cur)&&matchQ('mid',r.l?r.l.name:r.e.Name||r.e.Handle,r.l?r.l.company:'',r.e?r.e['What they said']:''))
    .map(r=>({...r,t:r.l?ms(r.l.created_at):0})).sort((a,b)=>b.t-a.t);
  const ML=rows.filter(r=>r.l).map(r=>r.l);const newWk=ML.filter(l=>ms(l.created_at)>wk()).length+rows.filter(r=>r.e).length;
  const mReached=ML.filter(liReached).length,mReplied=ML.filter(liReplied).length,mCalls=ML.filter(l=>isCallSt(l.stage)).length;
  let h=head('Midbound',INFO.midbound)+strip([['Engaged with us',String(rows.length),'good fits only'],['New this week',String(newWk),''],['We reached out',String(mReached),pct(mReached,ML.length)+' of them'],['Replied',String(mReplied),'Reply rate '+pct(mReplied,mReached)],['Calls booked',String(mCalls),'from midbound']])+chipsBar('mid',opts);
  h+=table('mid',[['Who','minmax(0,1.8fr)'],['What they did','minmax(0,2fr)'],['LinkedIn','minmax(0,1fr)'],['X','minmax(0,1fr)'],['','auto']],list.map(r=>{
    if(r.e){const e=r.e;const reply=e['Our reply']||'';
      return{open:null,cells:[pcell(e.Name||e.Handle,'@'+String(e.Handle||'').replace(/^@/,'')+(e.Fit?' · '+e.Fit:''),'X'),ell((e['What they said']?'Said: '+e['What they said']:e.Why||'Engaged with our post'),'meta'),'<span class="faint">–</span>',stPill('To reply'),
        ACTS(['Reply',()=>{if(reply)L.copy(reply,'eg'+e._row,'Reply copied. Paste it under their post.');const u=AK.safeUrl(e['Their link']);if(u)window.open(u,'_blank','noopener');}],[canEdit()&&['Done',()=>AK.engagerToPipeline(e)],canEdit()&&['Skip',()=>AK.saveEngager(e,'Dismissed')]])]};}
    const l=r.l;return{open:()=>L.openLead(l.id),cells:[pcell(l.name||'(no name)',[l.role,l.company].filter(Boolean).join(' · '),'LinkedIn'),ell(MID_SRC[r.src]+(l.source_detail?': '+l.source_detail:'')+' · '+since(l.created_at),'meta'),stPill(liShort(l)),stPill(r.c?xShort(r.c):'–'),fitPill(fitN(l))]};}),'Nobody yet.');
  h+='<p class="note" style="margin-top:12px">People who engaged but don’t fit who we sell to are hidden. <button type="button" class="btn ghost sm"'+act(()=>openOld('LinkedIn','liPeople'))+'>See them in the current CRM ↗</button></p>';
  return h;
}

/* ---------- Inbound ---------- */
function pgInbound(){
  const rows=leadsOpen().filter(l=>{const k=srcOf(l);if(MID_SRC[k]||OUT_SRC[k])return false;return k==='inbound'||l.direction==='Inbound'||l.source==='Instagram';});
  const P=l=>l.source==='Instagram'?'Instagram':l.source==='LinkedIn'?'LinkedIn':l.source==='X'?'X':'Other';
  const cnt={};for(const l of rows)cnt[P(l)]=(cnt[P(l)]||0)+1;
  const cur=V.f.inb||'all';
  const list=rows.filter(l=>(cur==='all'||P(l)===cur)&&matchQ('inb',l.name,l.company,l.instagram,l.source_detail)).sort((a,b)=>ms(b.last_touch||b.created_at)-ms(a.last_touch||a.created_at));
  const iNew=rows.filter(l=>ms(l.created_at)>wk()).length,iTalk=rows.filter(l=>/in talks|replied|follow/i.test(l.stage||'')).length,iCalls=rows.filter(l=>isCallSt(l.stage)).length,iWon=rows.filter(l=>/^won$/i.test(l.stage||'')).length;
  let h=head('Inbound',INFO.inbound)+strip([['Came to us',String(rows.length),(cnt.Instagram||0)+' on Instagram'],['New this week',String(iNew),''],['Talking',String(iTalk),''],['Calls booked',String(iCalls),''],['Clients',String(iWon),'won from inbound']])+chipsBar('inb',[['all','All',rows.length],['LinkedIn','LinkedIn',cnt.LinkedIn||0],['Instagram','Instagram',cnt.Instagram||0],['X','X',cnt.X||0],['Other','Other',cnt.Other||0]]);
  h+=table('inb',[['Who','minmax(0,1.8fr)'],['How they came','minmax(0,2fr)'],['Stage','minmax(0,1fr)'],['Last touch','110px']],list.map(l=>({open:()=>L.openLead(l.id),
    cells:[pcell(l.name||l.instagram||'(no name)',[l.role,l.company].filter(Boolean).join(' · ')||(l.instagram?'@'+String(l.instagram).replace(/^@/,''):''),P(l)==='Other'?null:P(l)),ell(l.source_detail||l.source||'',"meta"),stPill(plainWords(l.stage||'')),'<span class="meta">'+esc(whenTxt(l.last_touch||l.created_at))+'</span>']})),'Nobody has come to us yet.');
  return h;
}

/* ---------- Reply to their posts ---------- */
function pgReplies(){
  const rp=safe(()=>L.repliesVals(),{rows:[]});const li=safe(()=>L.lisVals(),{cards:[]});
  const cur=V.f.rep||'x';
  let h=head('Reply to their posts',INFO.replies);
  h+=tabsBar('rep',[['x','X replies',rp.openN||0],['li','LinkedIn comments',(li.cards||[]).filter(c=>c.isNew).length]]);
  if(cur==='x'){
    const right=(rp.hasApproveAll&&canEdit()?btn(rp.approveAllLabel,rp.approveAll,'sm'):'')+btn(rp.runLabel||'Check X now',rp.run,'sm ghost');
    h+='<div class="bar" style="margin-top:12px"><div class="goal"><b>'+esc(rp.doneN||0)+'</b> of 30 today<div class="bar1"><i style="width:'+esc(rp.pct||'0%')+'"></i></div></div><span class="note">'+esc(rp.botLine||'')+'</span><span class="sp"></span>'+right+'</div>';
    h+='<div class="posts">'+((rp.rows||[]).map(r=>'<div class="post">'+'<div class="post-h">'+avatar(r.who,'X')+'<div><b>'+esc(r.who)+'</b> <span class="meta">'+esc(r.sub)+'</span></div><span class="sp"></span>'+pill(r.age&&r.age.label,/Fresh/.test((r.age||{}).label)?'ok':'')+'</div>'
      +'<div class="post-t">'+esc(r.text)+'</div>'+ta(r.draft,null,null,2,chg(e=>r.setDraft(e))+' placeholder="Our reply"')
      +'<div class="post-a">'+(canEdit()?btn('Approve',r.approve,'pri sm'):'')+btn(r.mineLabel,r.mine,'sm')+(canEdit()?btn('Skip',r.skip,'sm ghost'):'')+'</div></div>').join('')||'<div class="tb"><div class="empty">'+esc(rp.noRowsText||'All caught up.')+'</div></div>')+'</div>'
      +(rp.hasMore?'<div style="margin-top:10px">'+btn('Show '+rp.moreN+' more',rp.more,'ghost sm')+'</div>':'')
      +(rp.hasQueued?'<p class="note" style="margin-top:14px">'+esc(rp.queuedLabel)+': the bot posts them 15+ minutes apart.</p>':'');
  }else{
    h+='<div class="bar" style="margin-top:12px"><span class="note">'+esc(li.done+' of '+li.total+' done '+(li.dayLabel||''))+'</span><span class="sp"></span>'+(canEdit()?btn(li.running?'Finding posts…':'Find posts now',li.run,'sm ghost'):'')+'</div>';
    h+='<div class="posts">'+((li.cards||[]).map(c=>'<div class="post" style="opacity:'+c.op+'"><div class="post-h">'+avatar(c.author,'LinkedIn')+'<div><b>'+esc(c.author)+'</b> <span class="meta">'+esc(c.headline)+(c.when?' · '+esc(c.when):'')+'</span></div></div>'
      +'<div class="post-t">'+esc(c.post)+'</div>'+ta(c.comment,c.onComment,c.saveComment,3)
      +'<div class="post-a">'+(c.isNew?btn('Copy + open post',c.copy,'pri sm')+(canEdit()?btn('Done',c.done,'sm')+btn('Skip',c.skip,'sm ghost'):''):pill(c.isDone?'Commented':'Skipped','')+btn('Undo',c.undo,'sm ghost'))+'</div></div>').join('')||'<div class="tb"><div class="empty">'+esc(li.noneText)+'</div></div>')+'</div>'
      +'<p class="note" style="margin-top:14px">Comments on posts by people already in your pipeline are still in the current CRM. <button type="button" class="btn ghost sm"'+act(()=>openOld('LinkedIn','gtmEngage'))+'>Open ↗</button></p>';
  }
  return h;
}

/* ---------- Pipeline: LinkedIn and X keep their own boards ---------- */
function board(B,plat){
  const cols=(B.cols||[]);
  return '<div class="board">'+cols.map(c=>'<div class="bcol"><div class="bcol-h"><span class="dotc" style="background:'+esc(c.dot||'var(--faint)')+'"></span>'+esc(plainWords(c.name))+'<span class="c">'+esc(c.n)+'</span>'
    +(c.hasAll&&canEdit()?'<span class="sp"></span><button type="button" class="btn ghost sm"'+act(cb(c.all))+'>Approve all</button>':'')+'</div><div class="bcol-b">'
    +(c.cards||[]).slice(0,V.more['b:'+plat+c.id]?400:20).map(k=>'<div class="kc"'+act(cb(k.open),false)+'><div class="kc-t"><b class="ell">'+esc(k.name)+'</b>'+fitPill(k.score)+'</div>'+(k.sub?ell(k.sub,'meta'):'')
      +(k.one?ell(k.one,'kc-one'):'')+(k.hasMsg&&canEdit()?'<div class="kc-a">'+btn('Approve',k.approve,'pri sm')+btn('Skip',k.skip,'sm ghost')+'</div>':k.status?ell(plainWords(k.status),'meta'):'')+'</div>').join('')
    +((c.cards||[]).length>20&&!V.more['b:'+plat+c.id]?'<button type="button" class="btn ghost sm"'+act(()=>{V.more['b:'+plat+c.id]=true;schedule();})+'>Show '+((c.cards||[]).length-20)+' more</button>':'')
    +(!(c.cards||[]).length?'<div class="kc-empty">Nobody here</div>':'')+'</div></div>').join('')+'</div>';
}
function pgPipeline(){
  const cur=V.f.pipe||'LinkedIn';const P=L.allPeople();
  let h=head('Pipeline',INFO.pipeline,cur==='Table'&&canEdit()?btn('Export CSV',()=>exportCsv(),'sm'):'');
  h+=tabsBar('pipe',[['LinkedIn','LinkedIn'],['X','X'],['Instagram','Instagram'],['Email','Email'],['Table','Everyone (table)']]);
  if(cur==='LinkedIn'){const B=withState({lpExp:'',lpQ:V.q.pipe||'',lpMin:0,lpOut:false,lpLim:{found:400,req:400,dm:400,fu1:400,fu2:400,fu3:400,fu4:400,fu5:400,fu6:400,fu7:400,talks:400,booked:400,won:400,lost:400}},()=>safe(()=>L.liPipeVals(),{cols:[]}));
    h+='<div class="bar" style="margin-top:12px"><span class="note">'+esc(B.total+' people · '+(B.bot||''))+'</span><span class="sp"></span><input class="in search" placeholder="Search" value="'+esc(V.q.pipe||'')+'"'+inp(e=>{V.q.pipe=e.target.value;})+chg(()=>schedule())+'></div>'+board(B,'li');}
  else if(cur==='X'){const B=withState({xpExp:'',xpQ:V.q.pipe||'',xpMin:0,xpLim:{review:400,dm:400,fu1:400,fu2:400,fu3:400,fu4:400,fu5:400,fu6:400,fu7:400,talks:400,booked:400,won:400,lost:400}},()=>safe(()=>L.xPipeVals(P),{cols:[]}));
    h+='<div class="bar" style="margin-top:12px"><span class="sp"></span><input class="in search" placeholder="Search" value="'+esc(V.q.pipe||'')+'"'+inp(e=>{V.q.pipe=e.target.value;})+chg(()=>schedule())+'></div>'+board(B,'x');}
  else if(cur==='Instagram'){h+='<div class="bar" style="margin-top:12px"><span class="note">Instagram DMs, read every hour</span><span class="sp"></span><input class="in search" placeholder="Search" value="'+esc(V.q.pipe||'')+'"'+inp(e=>{V.q.pipe=e.target.value;})+chg(()=>schedule())+'></div>'+board(igBoard(),'ig');}
  else if(cur==='Email')h+='<div class="soonbox" style="margin-top:16px"><h2>Email isn’t set up yet</h2><div>Its own pipeline shows here once email outreach starts.</div></div>';
  else{const L2=leadsOpen().filter(l=>matchQ('tbl',l.name,l.company,l.source,l.stage));
    h+='<div class="bar" style="margin-top:12px"><span class="note">'+L2.length+' people</span><span class="sp"></span><input class="in search" placeholder="Search" value="'+esc(V.q.tbl||'')+'"'+inp(e=>{V.q.tbl=e.target.value;})+chg(()=>schedule())+'></div>';
    h+=table('tbl',[['Who','minmax(0,2fr)'],['Platform','100px'],['Stage','minmax(0,1fr)'],['Next step','minmax(0,1.4fr)'],['Last touch','110px']],
      L2.sort((a,b)=>ms(b.last_touch||b.created_at)-ms(a.last_touch||a.created_at)).map(l=>({open:()=>L.openLead(l.id),cells:[pcell(l.name||'(no name)',[l.role,l.company].filter(Boolean).join(' · '),PLAT[l.source]?l.source:null),'<span class="meta">'+esc(l.source||'')+'</span>',stPill(plainWords(l.stage||'')),ell(l.next_step||'','meta'),'<span class="meta">'+esc(whenTxt(l.last_touch||l.created_at))+'</span>']})),'Nobody matches.',60);}
  return h;
}
function exportCsv(){const L2=leadsOpen();const cols=['name','company','role','source','stage','email','linkedin','x_handle','instagram','next_step','last_touch','created_at'];
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';const csv=[cols.join(','),...L2.map(l=>cols.map(c=>q(l[c])).join(','))].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='sove7gn-leads.csv';a.click();}

/* ---------- Calls ---------- */
function pgCalls(){
  const now=Date.now();const all=leadsOpen().filter(l=>/^call booked$/i.test(l.stage)||((l.fields||{}).call||{}).at);
  const at=l=>+(((l.fields||{}).call||{}).at||0);
  const up=all.filter(l=>at(l)>now-2*36e5).sort((a,b)=>at(a)-at(b)),noTime=all.filter(l=>!at(l)&&/^call booked$/i.test(l.stage)),past=all.filter(l=>at(l)&&at(l)<=now-2*36e5).sort((a,b)=>at(b)-at(a));
  const dv=needs().dv||{};const strays=((dv.calls||{}).strays)||[];
  const row=l=>{const c=(l.fields||{}).call||{};const b=(l.fields||{}).brief||{};return{open:()=>{L.openLead(l.id);V.ptab='research';},cells:[pcell(l.name||l.email||'Someone',[l.company,l.source].filter(Boolean).join(' · '),PLAT[l.source]?l.source:null),
    '<span class="meta">'+esc(c.at?new Date(+c.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+' IST':'No time yet')+'</span>',
    b.text?pill('Prep ready','ok'):pill(c.kind==='clipping'?'Clipping call':'No prep yet',''),ACTS(c.meet?['Join Meet',()=>window.open(c.meet,'_blank','noopener')]:null,[['Prep',()=>{L.openLead(l.id);V.ptab='research';}]])]};};
  const cols=[['Who','minmax(0,2fr)'],['When','minmax(0,1.4fr)'],['Prep','120px'],['','auto']];
  let h=head('Calls',INFO.calls);
  h+=tabsBar('calls',[['up','Coming up',up.length],['none','No time yet',noTime.length],['past','Past',past.length],['strays','Not in the CRM',strays.length]]);
  const cur=V.f.calls||'up';h+='<div style="margin-top:12px">';
  if(cur==='up')h+=table('cu',cols,up.map(row),'No calls with a time coming up.');
  if(cur==='none')h+=table('cn',cols,noTime.map(row),'Every booked call has a time.');
  if(cur==='past')h+=table('cp',cols,past.map(row),'No past calls.');
  if(cur==='strays')h+=table('cs',[['Who','minmax(0,2fr)'],['When','minmax(0,1.4fr)'],['','auto']],strays.map(s=>({open:null,cells:[pcell(s.name,s.sub,null),'<span class="meta">'+esc(s.when)+'</span>',ACTS(s.canAdd?['Add to CRM',s.add]:null,[s.hasMeet&&['Meet',s.openMeet]])]})),'Every booked call is in the CRM.');
  return h+'</div>';
}

function briefHtml(){
  if(!V.brief)return '';const b=safe(()=>L.dailyVals(),{none:true});
  const close=()=>{V.brief=false;schedule();};
  let body='';
  if(!b.has)body='<div class="empty">No brief yet. It writes itself every morning at 8:00 IST.</div>'+(b.canRun?'<div style="text-align:center">'+btn(b.runLabel,b.run,'pri')+'</div>':'');
  else{
    const stats=a=>(a||[]).map(s=>'<span class="pill line">'+esc(s.label)+' <b>'+esc(s.v)+'</b></span>').join(' ');
    const fl=(t,o,plat)=>'<div class="blk"><h3>'+platMark(plat)+esc(t)+'</h3><div class="chips" style="margin-bottom:8px">'+stats(o.stats)+'</div>'+((o.items||[]).length?'<div class="rows card">'+o.items.map(it=>followItem({...it,plat})).join('')+'</div>':'<div class="note">Nobody to follow up with.</div>')+'</div>';
    body='<div class="chips" style="margin-bottom:14px">'+(b.days||[]).map(d=>'<button type="button" class="chip'+(d.on?' on':'')+'"'+act(cb(d.pick))+'>'+esc(d.label)+'</button>').join('')+'</div>'
      +'<p class="note" style="margin-top:0">'+esc(b.covers)+'</p>'
      +'<div class="stats" style="margin-bottom:16px">'+(b.overall||[]).map(o=>'<div class="stat"><div class="l">'+esc(o.label)+'</div><div class="v">'+esc(o.v)+'</div><div class="d">'+esc(o.d||'')+'</div></div>').join('')+'</div>'
      +fl('LinkedIn: follow up today',b.li||{},'LinkedIn')+fl('X: follow up today',b.x||{},'X')+fl('Instagram: no update in 2+ days (most move to WhatsApp)',b.ig||{},'Instagram');}
  return '<div class="modal"'+act(e=>{if(e.target.classList.contains('modal'))close();},false)+'><div class="box"><div class="mh"><h2>Morning brief'+(b.title?' · '+esc(b.title):'')+'</h2><span style="flex:1"></span>'
    +(b.has?btn(b.copyLabel||'Copy as text',b.copy,'sm')+(b.canRun?btn(b.runLabel,b.run,'sm ghost'):''):'')+btn('Close',close,'sm ghost')+'</div><div class="mb" data-keep="brief">'+body+'</div></div></div>';
}
function followItem(it){
  return '<div class="item">'+avatar(it.name,it.plat==='Instagram'&&it.chan==='WhatsApp'?'WhatsApp':it.plat)+'<div class="body"><div class="who"><span class="nm"'+act(()=>it.hasLead&&it.openLead())+'>'+esc(it.name)+'</span>'+pill(it.chan,it.chan==='WhatsApp'?'ok':'line')+'</div>'
    +(it.sub?'<div class="meta">'+esc(it.sub)+'</div>':'')+'<div class="line">'+esc(plainWords(it.why))+'</div></div><div class="acts">'+(it.hasLink?btn(it.openLabel,it.open,'sm'):'')+(it.canSpoke?btn('Followed up',it.spoke,'sm'):'')+'</div></div>';
}



/* ---------- small number strip at the top of Outbound / Midbound / Inbound (Drona-style micro dashboard) ---------- */
const strip=cells=>'<div class="stats strip">'+cells.map(([l,v,d])=>'<div class="stat"><div class="l">'+esc(l)+'</div><div class="v">'+esc(v)+'</div>'+(d?'<div class="d">'+esc(d)+'</div>':'')+'</div>').join('')+'</div>';
const pct=(a,b)=>b?Math.round(a/b*100)+'%':'–';
const isCallSt=st=>/^(call booked|proposal sent)$/i.test(st||'');
const liReached=l=>{const x=LIo(l);return !!(x.req||x.dm||x.acc||x.replied);};
const liReplied=l=>!!LIo(l).replied||/^(in talks|call booked|proposal sent|won)$/i.test(l.stage||'');
const xReached=c=>!!c&&!/^To send$/.test(c._status||'');
const xReplied=c=>!!c&&/^(Replied|Call booked|Customer)$/.test(c._status||'');
const wk=()=>Date.now()-7*D;

/* ---------- Pipelines: one board per channel ---------- */
function igBoard(){
  const ST=(AK.leadSetting('stages')||[]);const L2=leadsOpen().filter(l=>l.source==='Instagram'&&matchQ('pipe',l.name,l.instagram,l.company));
  return{cols:ST.map(s=>{const cards=L2.filter(l=>l.stage===s.name).sort((a,b)=>ms(b.last_touch||b.created_at)-ms(a.last_touch||a.created_at))
    .map(l=>({id:l.id,name:l.name||('@'+String(l.instagram||'').replace(/^@/,'')),sub:[l.instagram?'@'+String(l.instagram).replace(/^@/,''):'',l.company].filter(Boolean).join(' · '),one:l.next_step||'',status:'Last touch '+whenTxt(l.last_touch||l.created_at),open:()=>L.openLead(l.id)}));
    return{id:s.name,name:s.name,n:String(cards.length),dot:s.color,cards};}).filter(c=>c.cards.length||!/cold|lost/i.test(c.name))};
}

/* ---------- Calendar: LinkedIn and X on one week ---------- */
function calData(plat){return memo('cal'+plat,()=>withState({plat},()=>safe(()=>L.calVals(),null)));}
function calCards(C,i){const out=[];for(const b of ((C||{}).boards||[]))for(const it of (((b.cols||[])[i]||{}).cards||[]))out.push(it);return out;}
function calFind(id){for(const plat of ['X','LinkedIn']){const C=calData(plat);for(let i=0;i<7;i++)for(const c of calCards(C,i))if(c.isCard&&c.id===id)return{c,plat};}return null;}
const ST_TONE=st=>st==='Posted'?'ok':st==='Scheduled'?'blue':st==='Ready to post'?'warn':'';
function pgCalendar(){
  const X=calData('X'),LI=calData('LinkedIn');const base=X||LI;if(!base)return head('Calendar','')+'<div class="empty">Loading…</div>';
  const cur=V.f.cal||'all';const days=((base.boards||[])[0]||{}).cols||[];
  let n=0;const cols=days.map((d,i)=>{const cards=[...(cur!=='LinkedIn'?calCards(X,i).map(c=>({...c,_p:'X'})):[]),...(cur!=='X'?calCards(LI,i).map(c=>({...c,_p:'LinkedIn'})):[])];n+=cards.filter(c=>c.isCard).length;return{d,cards,xcol:(((X||{}).boards||[])[0]||{cols:[]}).cols[i]};});
  let h=head('Calendar','Every post for the week, LinkedIn and X together. Click a post to edit it.',
    btn('←',base.prev,'sm')+'<span class="wk"><b>'+esc(base.weekName)+'</b> <span class="meta">'+esc(base.label)+'</span></span>'+btn('→',base.next,'sm')+(base.weekName!=='This week'?btn('Today',base.now,'sm ghost'):''));
  h+='<div class="bar"><div class="chips">'+[['all','All'],['LinkedIn','LinkedIn'],['X','X']].map(([k,l])=>'<button type="button" class="chip'+(cur===k?' on':'')+'"'+act(()=>{V.f.cal=k;schedule();})+'>'+(k!=='all'?platMark(k)+' ':'')+esc(l)+'</button>').join('')+'</div><span class="sp"></span><span class="note">'+n+' posts this week</span></div>';
  h+='<div class="week">'+cols.map(({d,cards,xcol})=>'<div class="day'+(d.today?' today':'')+'"><div class="day-h"><b>'+esc(d.dow)+'</b> <span class="meta">'+esc(d.date)+'</span></div><div class="day-b">'
    +cards.map(c=>c.isCard?'<div class="cc"'+act(()=>{V.calEd=c.id;schedule();},false)+'><div class="cc-t">'+platMark(c._p)+'<span class="meta">'+esc(c.time||'')+'</span><span class="sp"></span>'+pill(c.st==='Posted'?'Posted':c.st,ST_TONE(c.st))+'</div>'
        +'<div class="cc-x">'+esc(c.short||c.text||'(empty)')+'</div>'+(c.hasMedia?'<div class="meta" style="margin-top:4px">📎 image</div>':'')+'</div>'
      :c.isSlot&&canEdit()&&c._p==='X'?'<button type="button" class="cs"'+act(cb(c.slotNew))+'>+ '+esc(c.slotLabel||'Post')+'</button>':'').join('')
    +(xcol&&xcol.canAdd&&canEdit()&&cur!=='LinkedIn'?'<button type="button" class="cs"'+act(cb(xcol.add))+'>+ Add X post</button>':'')+'</div></div>').join('')+'</div>';
  return h;
}
function calEditHtml(){
  if(!V.calEd)return '';const f=calFind(V.calEd);if(!f){V.calEd=null;return '';}const c=f.c;const close=()=>{V.calEd=null;schedule();};const ro=!canEdit();
  let b='<div class="kv">'
    +(c.canDate?'<label>Day</label><input class="in" type="date" value="'+esc(c.dateIso)+'"'+chg(cb(c.setDate))+(ro?' disabled':'')+'>':'')
    +(c.notLi!==false?'<label>Time (IST)</label><input class="in" value="'+esc(c.time||'')+'" placeholder="7:30 PM"'+inp(cb(c.setTime))+blur(cb(c.saveTime))+(ro?' disabled':'')+'>':'')
    +'<label>Status</label><select class="in"'+chg(cb(c.setStatus))+(ro?' disabled':'')+'>'+(c.stOpts||[]).map(o=>'<option'+(o.v===c.status?' selected':'')+'>'+esc(o.v)+'</option>').join('')+'</select></div>';
  b+='<div class="blk" style="margin-top:14px"><h3>Post</h3>'+ta(c.text,c.setText,c.saveText,10,c.txtRo?' readonly':'')+'</div>';
  if(c.canLink)b+='<div class="blk"><h3>Live link</h3><div class="bar"><input class="in" style="flex:1" placeholder="'+esc(c.linkPh||'Paste the post link')+'" value="'+esc(c.linkVal||'')+'"'+inp(cb(c.setLinkVal))+'>'+btn('Save link',c.saveLink,'sm')+'</div></div>';
  const acts=[btn(c.copyLabel||'Copy',c.copy,'pri sm'),c.canTick?btn(c.st==='Posted'?'Posted ✓ (undo)':'Mark as posted',c.tick,'sm'):'',c.canSched?btn(c.schedLabel,c.toggleSched,'sm'):'',
    c.canUp?'<label class="btn sm">'+esc(c.upLabel||'Add image')+'<input type="file" accept="image/*,video/*" hidden'+chg(cb(c.upload))+'></label>':'',c.hasLink?btn('Open live post',c.openLink,'sm ghost'):'',canEdit()&&c.remove?btn('Take off the calendar',()=>{c.remove();close();},'sm ghost'):''].join('');
  return '<div class="modal"'+act(e=>{if(e.target.classList.contains('modal'))close();},false)+'><div class="box"><div class="mh">'+platMark(f.plat)+'<h2>'+esc(c.dateLabel||'Post')+'</h2>'+pill(c.st,ST_TONE(c.st))+'<span style="flex:1"></span>'+btn('Close',close,'sm ghost')+'</div><div class="mb">'+b+'<div class="under">'+acts+'</div></div></div></div>';
}

/* ---------- Post metrics ---------- */
function pgResults(){
  const xs=safe(()=>AK.trackedPosts(),[])||[],ls=safe(()=>AK.liTracked(),[])||[];const gr=safe(()=>L.growthVals(L.allPeople()),null);
  const all=[...xs.map(t=>({...t,plat:'X'})),...ls.map(t=>({...t,plat:'LinkedIn'}))].sort((a,b)=>(b.first||0)-(a.first||0));
  const week=all.filter(t=>(t.first||0)>=wk());const sum=(a,k)=>a.reduce((s,t)=>s+(+t[k]||0),0);
  const best=week.slice().sort((a,b)=>(b.eng||0)-(a.eng||0))[0];
  let h=head('Post metrics','How our posts do on LinkedIn and X. Click a post to open it.');
  h+=strip([['Posts this week',String(week.length),week.filter(t=>t.plat==='X').length+' on X · '+week.filter(t=>t.plat==='LinkedIn').length+' on LinkedIn'],
    ['X views this week',AK.fmtK(sum(week.filter(t=>t.plat==='X'),'views')),'All time '+AK.fmtK(sum(xs,'views'))],['Engagement this week',AK.fmtK(sum(week,'eng')),'Likes, replies, reposts'],
    ['X followers',gr?gr.now+' / '+gr.goal:'–',gr?gr.daysLeft+' days left · line says '+gr.onTrack:''],['Best this week',best?AK.fmtK(best.eng||0)+' engagement':'–',best?String(best.text||'').replace(/\s+/g,' ').slice(0,60):'']]);
  if(gr&&(gr.mix||[]).length){const NM={Reach:'Get seen',Trust:'Build trust',Convert:'Book calls'};
    h+='<div class="bar" style="margin-top:14px"><span class="note">This week’s mix:</span>'+gr.mix.map(m=>'<span class="pill line">'+esc(NM[m.k]||m.k)+' <b>'+esc(m.n)+' / '+esc(m.tgt)+'</b></span>').join('')+'</div>';}
  const cur=V.f.res||'all';h+=tabsBar('res',[['all','All',all.length],['LinkedIn','LinkedIn',ls.length],['X','X',xs.length]]);
  const list=all.filter(t=>cur==='all'||t.plat===cur);
  h+='<div style="margin-top:12px">'+table('res',[['Post','minmax(0,3fr)'],['Posted','120px'],['Views','80px'],['Engagement','100px'],['Per 1K views','100px']],list.map(t=>({open:t.link?()=>window.open(t.link,'_blank','noopener'):null,
    cells:['<div class="pc">'+platMark(t.plat)+ell(String(t.text||'').replace(/\s+/g,' ')||'(post)')+'</div>','<span class="meta">'+esc(t.first?AK.dayWord(new Date(t.first)):'–')+'</span>',
      '<span class="num">'+esc(t.views!=null?AK.fmtK(t.views):'–')+'</span>','<span class="num">'+esc(t.eng!=null?String(t.eng):'–')+'</span>','<span class="num">'+esc(t.rate!=null?String(Math.round(t.rate*10)/10):'–')+'</span>']})),'No posts tracked yet.')+'</div>';
  return h;
}

/* ---------- Post ideas ---------- */
function pgIdeas(){
  const gr=safe(()=>L.growthVals(L.allPeople()),{})||{};
  const drafts=(AK.M.ours||[]).filter(p=>p['Our version']&&!/posted/i.test(p.Status||''));const next=safe(()=>AK.copyNext(15),[])||[];const asks=safe(()=>AK.founderAsks(),[])||[];
  const cur=V.f.ideas||'drafts';
  let h=head('Post ideas','Drafts next to the posts they copy, what to copy next, and the words people comment to get something.');
  h+=tabsBar('ideas',[['drafts','Drafts',drafts.length],['next','To copy next',next.length],['asks','Questions for the founders',asks.length],['kw','Comment-a-word DMs',(gr.kw||[]).length],['kit','Profile kit',(gr.kit||[]).length]]);
  h+='<div style="margin-top:12px">';
  if(cur==='drafts')h+=table('dr',[['Our draft','minmax(0,2.4fr)'],['Copies','minmax(0,1.6fr)'],['When','110px'],['','auto']],drafts.map(p=>{const o=safe(()=>AK.originalFor(p),null);return{open:null,cells:[ell(String(p['Our version']).replace(/\s+/g,' ')),
    o?ell((o.Competitor||'')+': '+String(o['Full text']||'').replace(/\s+/g,' '),'meta'):'<span class="faint">–</span>','<span class="meta">'+esc(p.Date||'')+'</span>',ACTS(['Copy',()=>L.copy(p['Our version'],'d'+p._row,'Draft copied.')],[o&&o.Link&&['Original',()=>window.open(o.Link,'_blank','noopener')]])]};}),'No drafts waiting.');
  if(cur==='next')h+=table('nx',[['Post','minmax(0,3fr)'],['By','minmax(0,1fr)'],['Views','90px'],['','auto']],next.map(t=>({open:t.Link?()=>window.open(t.Link,'_blank','noopener'):null,cells:[ell(String(t['Full text']||'').replace(/\s+/g,' ')),'<span class="meta">'+esc(t.Competitor||'')+'</span>','<span class="num">'+esc(AK.fmtK(safe(()=>AK.viewsOf(t),0)||0))+'</span>',ACTS(['Copy',()=>L.copy(t['Full text'],'n'+t._row,'Post copied.')])]})),'Nothing to copy right now.');
  if(cur==='asks')h+=table('as',[['Question','minmax(0,3fr)'],['For the post','minmax(0,2fr)'],['','auto']],asks.map(a=>({open:null,cells:[ell(a.p['Founder question']),ell(String(a.p['Our version']||'').replace(/\s+/g,' '),'meta'),ACTS(['Copy',()=>L.copy(a.p['Founder question'],'q'+a.p._row,'Question copied.')])]})),'No questions waiting.');
  if(cur==='kw')h+=table('kw',[['When they comment','minmax(0,1.2fr)'],['DM them','minmax(0,3fr)'],['','auto']],(gr.kw||[]).map(k=>({open:null,cells:['<b>'+esc(k.word)+'</b><div class="meta ell">'+esc(k.label)+'</div>',ell(String(k.text).replace(/\s+/g,' '),'meta'),ACTS(['Copy DM',k.copy])]})),'None set.');
  if(cur==='kit')h+=table('kit',[['What','160px'],['Text','minmax(0,3fr)'],['','auto']],(gr.kit||[]).map(k=>({open:null,cells:['<b>'+esc(k.label)+'</b>',ell(k.text,'meta'),ACTS(['Copy',k.copy])]})),'');
  return h+'</div>';
}

/* ---------- Bots ---------- */
function pgBots(){
  const S=AK.LD.settings||{};const li=S.li_bot||{},lst=S.li_bot_status||{};const xs=(AK.XT.status||{}).x_bot||{},xst=(AK.XT.status||{}).x_bot_status||{};
  const seen=t=>{const v=ms(t);return v&&Date.now()-v<45*6e4;};
  const saveLi=patch=>AK.leadSettingSave('li_bot',{...(AK.LD.settings.li_bot||{}),...patch});
  const LT=AK.LBT.rows||[],byId=new Map((AK.LD.rows||[]).map(l=>[l.id,l]));
  const invWk=LT.filter(t=>t.kind==='invite'&&t.status==='sent'&&ms(t.sent_at)>wk()).length;
  const m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0);const notes=LT.filter(t=>t.kind==='invite'&&t.text&&t.status==='sent'&&ms(t.sent_at)>=m0.getTime()).length;
  const card=(plat,title,on,paused,lines,ctrls)=>'<div class="card bot"><div class="sec-h">'+platMark(plat)+'<h2>'+esc(title)+'</h2><span class="sp"></span>'+pill(paused?'Paused':on?'Running':'Not seen lately',paused?'warn':on?'ok':'bad')+'</div><div class="sec-b">'+lines.map(t=>'<div class="hl"><span class="dot"></span><span>'+t+'</span></div>').join('')+'<div class="under" style="margin-top:10px">'+ctrls+'</div></div></div>';
  let h=head('Bots','The LinkedIn and X bots run inside your Chrome (the SOVE7GN Outreach Bot extension). They only send while Chrome is open.');
  h+='<div class="grid2">'+card('LinkedIn','LinkedIn bot',seen(lst.seen),li.paused,[
      'Last checked in '+esc(since(lst.seen)||'never')+(lst.signed_in===false?' · <b>Chrome is signed out of LinkedIn</b>':''),
      'First messages: <b>'+(li.mode==='auto'?'sent on their own':'wait for your OK')+'</b>',
      'Connection requests this week: <b>'+invWk+' of '+(li.week_cap||150)+'</b> · notes this month: <b>'+notes+' of '+(li.notes_month||250)+'</b>',
      'Sending hours: '+esc(((li.hours||{}).from??10)+':00 to '+((li.hours||{}).to??24)+':00 IST'),
      ...(lst.last_error?['<span style="color:var(--bad)">Last problem: '+esc(String(lst.last_error).slice(0,140))+'</span>']:[])],
    canEdit()?btn(li.mode==='auto'?'Ask me first instead':'Send on its own',()=>saveLi({mode:li.mode==='auto'?'review':'auto'}),'sm')+btn(li.paused?'Resume':'Pause',()=>saveLi({paused:!li.paused}),li.paused?'pri sm':'sm ghost'):'')
    +card('X','X bot',seen(xst.seen),xs.paused,[
      'Last checked in '+esc(since(xst.seen)||'never'),'DMs: up to <b>'+(xs.cap||40)+' a day</b>, '+(xs.gap_min||12)+'+ min apart · replies on posts: up to <b>'+(xs.reply_cap||30)+' a day</b>',
      'Sending hours: '+esc((xs.from??9)+':00 to '+(xs.to??23)+':30 IST'),
      ...(ms(xs.cooldown_until)>Date.now()?['<span style="color:var(--warn)">X asked us to slow down: paused until '+esc(new Date(ms(xs.cooldown_until)).toLocaleString())+'</span>']:[]),
      ...(xst.last_error?['<span style="color:var(--bad)">Last problem: '+esc(String(xst.last_error).slice(0,140))+'</span>']:[])],
    canEdit()?btn(xs.paused?'Resume':'Pause',()=>AK.xtPause(!xs.paused),xs.paused?'pri sm':'sm ghost'):'')+'</div>';
  const failed=LT.filter(t=>t.status==='failed');
  h+='<h2 class="h2">Didn’t go through</h2>'+table('bf',[['Who','minmax(0,1.6fr)'],['What','minmax(0,1fr)'],['Problem','minmax(0,2fr)'],['','auto']],failed.map(t=>{const l=byId.get(t.lead_id)||{};
    return{open:l.id?()=>L.openLead(l.id):null,cells:[pcell(l.name||'Someone',l.company||'','LinkedIn'),'<span class="meta">'+esc(t.kind==='invite'?'Connection request':t.kind==='followup'?'Follow-up':t.kind==='inmail'?'InMail':'First message')+'</span>',ell(t.error||'Unknown problem','meta'),
      ACTS(canEdit()?['Try again',()=>AK.lbtSet(t.id,{status:'ready'})]:null,[canEdit()&&['Skip',()=>AK.lbtSet(t.id,{status:'skipped'})]])]};}),'Nothing failed.');
  const n=safe(()=>L.notifVals(),{items:[],tabs:[],stats:[]});
  h+='<div class="bar" style="margin-top:28px"><h2 class="h2" style="margin:0">What the bots sent</h2><span class="sp"></span>'+btn(n.deskLabel||'Desktop notifications',n.toggleDesk,'sm ghost')+'</div>';
  h+=strip((n.stats||[]).map(s=>[s.label,s.v,'Today']));
  h+='<div class="chips" style="margin:12px 0">'+(n.tabs||[]).map(t=>'<button type="button" class="chip'+(t.on?' on':'')+'"'+act(cb(t.pick))+'>'+esc(t.label)+'</button>').join('')+'</div>';
  h+=table('nt',[['When','90px'],['What','minmax(0,1.2fr)'],['Who','minmax(0,1.4fr)'],['Message','minmax(0,2.4fr)']],(n.items||[]).map(e=>({open:e.hasLead?e.openLead:e.hasLink?e.open:null,
    cells:['<span class="meta">'+esc((e.isDay?e.day+' ':'')+e.time)+'</span>','<div class="pc">'+platMark(e.chan)+'<span class="ell"'+(e.ok?'':' style="color:var(--bad)"')+'>'+esc(e.what)+'</span></div>',ell(e.who,'nm'),ell(String(e.text||e.quote||'').replace(/\s+/g,' '),'meta')]})),n.loading?'Loading…':'Nothing sent yet.',60);
  h+='<details class="note" style="margin-top:20px"><summary>Install or reload the Chrome extension</summary><ol><li>Open chrome://extensions and turn on Developer mode.</li><li>Load unpacked: the GTM.SOVE7GN.ORG/extension folder.</li><li>Pin "SOVE7GN Outreach Bot" and paste the bot key from _research/LI_BOT_KEY.txt.</li><li>Press Test LinkedIn, then Run now. Keep Chrome open.</li></ol></details>';
  return h;
}

/* ---------- Messages ---------- */
function pgMessages(){
  const cur=V.f.msg||'li';let h=head('Messages','Every message the bots send. Change one here and every message not sent yet uses the new text. {first} and {company} fill in for each person.');
  h+=tabsBar('msg',[['li','LinkedIn'],['x','X']])+'<div style="margin-top:12px">';
  if(cur==='li'){const li=AK.LD.settings.li_bot||{};const save=(k,v)=>{const curS=AK.LD.settings.li_bot||{};if(JSON.stringify(curS[k])===JSON.stringify(v))return;AK.leadSettingSave('li_bot',{...curS,[k]:v});};
    const box=(label,hint,val,onSave,max)=>'<div class="msgbox"><div class="mh2"><b>'+esc(label)+'</b><span class="meta">'+esc(hint)+'</span>'+(max?'<span class="sp"></span><span class="count">max '+max+'</span>':'')+'</div>'+ta(val||'',null,e=>onSave(e.target.value),4)+'</div>';
    h+=box('Connection note','Goes with the connection request',li.note,v=>save('note',v),300)+box('First message','After they accept',li.dm1,v=>save('dm1',v));
    (li.fu||[]).forEach((t,i)=>{h+=box('Follow-up '+(i+1),'A day after the last one, if no reply',t,v=>{const a=(AK.LD.settings.li_bot||{}).fu||[];const b=a.slice();b[i]=v;save('fu',b);});});}
  else{const T=(AK.M.templates||[]).filter(t=>t.Opener);
    for(const t of T){const f=(k,label)=>'<div class="msgbox"><div class="mh2"><b>'+esc(label)+'</b></div>'+ta(t[k]||'',null,e=>{if(e.target.value!==t[k])AK.saveTpl(t,{[k]:e.target.value});},3)+'</div>';
      h+='<div class="card sec"><div class="sec-h"><h2>'+esc(t.Intent||t.ID)+'</h2><span class="hint">'+esc(t['Use it for']||'')+'</span><span class="sp"></span>'+pill((t.Sent||0)+' sent · '+(t.Replies||0)+' replies · '+(t['Reply rate']||'–'),'line')+(t.Verdict?pill(t.Verdict,/double|keep/i.test(t.Verdict)?'ok':/rewrite/i.test(t.Verdict)?'bad':''):'')+'</div><div class="sec-b">'
        +f('Opener','First DM')+f('Follow-up 1 (day 3)','Follow-up 1')+f('Follow-up 2 (day 7)','Follow-up 2')+'</div></div>';}}
  return h+'</div>';
}

/* ---------- Settings ---------- */
function pgSettings(){
  let h=head('Settings','Where leads come from, who we sell to, and imports.');
  const run=(label,when,fn)=>({open:null,cells:['<b>'+esc(label)+'</b>','<span class="meta">'+esc(when)+'</span>',ACTS(canEdit()?['Run now',fn]:null)]});
  h+='<h2 class="h2">Where leads come from</h2>'+table('src',[['Source','minmax(0,2fr)'],['Runs on its own','minmax(0,1.4fr)'],['','auto']],[
    run('X lead finder: funded founders on X','7:30 and 12:30 IST',()=>AK.xRun('x-leads')),run('Just raised: funding news','8:30 IST',()=>AK.liFunding()),
    run('Just launched: Product Hunt, Hacker News','9:00 IST',()=>AK.liSignal('launches')),run('Hiring for growth: job boards','9:30 IST',()=>AK.liSignal('hiring')),
    run('Who liked or commented on our LinkedIn posts','9:00 and 21:00 IST',()=>AK.socialRun()),run('Founder posts to comment on (LinkedIn)','7:45 IST',()=>AK.lisRun()),
    run('Posts to reply to on X','Every hour, US daytime',()=>AK.xgRun()),run('Instagram DMs','Every hour',()=>AK.igRun())]);
  const au=AK.leadSetting('automation')||{};
  h+='<h2 class="h2">Who we sell to</h2><div class="card sec-b" style="margin:0"><p class="note" style="margin-top:0">In plain words: who is a great fit, who could be later, who isn’t. The lead finders judge everyone against this.</p>'
    +ta(au.icp||'',null,e=>{const a=AK.leadSetting('automation')||{};if(e.target.value!==a.icp)AK.leadSettingSave('automation',{...a,icp:e.target.value});},6)+'</div>';
  h+='<h2 class="h2">Import your LinkedIn connections</h2><div class="card sec-b" style="margin:0"><p class="note" style="margin-top:0">LinkedIn: Settings › Data privacy › Get a copy of your data › Connections. Upload Connections.csv; everyone not in the CRM is added.</p>'
    +(canEdit()?'<label class="btn sm">Upload Connections.csv<input type="file" accept=".csv,text/csv" hidden'+chg(e=>{const f=e.target.files&&e.target.files[0];if(!f)return;f.text().then(t=>AK.importLiConnections(t));e.target.value='';})+'></label>':'')+'</div>';
  h+='<h2 class="h2">Sign-in</h2><div class="card sec-b" style="margin:0"><p class="note" style="margin:0">Everyone signs in with the team passcode. To change it, run <code>node scripts/set-passcode.mjs</code> in the GTM.SOVE7GN.ORG folder.</p></div>';
  h+='<p class="note" style="margin-top:20px">Stages, groups, your own fields and the fit scoring weights are still edited in the current CRM. <button type="button" class="btn ghost sm"'+act(()=>openOld('Leads','leadSetup'))+'>Open ↗</button></p>';
  return h;
}

/* ---------- person panel: one panel for every platform ---------- */
const LI_SRC={liked:'Liked our post',commented:'Commented on our post',viewed:'Viewed our profile',inbound:'Sent us a request',tagged:'We tagged them in a post',niche:'Commented on a founder post',outbound:'We reached out first',
  funding:'Just raised (funding news)',site:'Visited our website',magnet:'Asked for a lead magnet',prospect:'Found by our search',connection:'An older connection',list:'From our founder list',launch:'Just launched',hiring:'Hiring for growth'};
const BOUND={liked:'Midbound',commented:'Midbound',viewed:'Midbound',site:'Midbound',magnet:'Midbound',inbound:'Inbound'};
const srcOf=l=>{const li=LIo(l);if(li.src)return li.src;const o=String(l.origin_key||'');if(o.startsWith('li-src:'))return o.split(':')[1]||'outbound';if(o.startsWith('li-person:'))return /comment/i.test(l.source_detail||'')?'commented':'liked';return '';};
function xContactFor(l){const h=String(l.x_handle||((l.fields||{}).li_icp||{}).x||'').replace(/^@/,'').toLowerCase();const C=AK.M.contacts||[];
  return (h&&C.find(c=>String(c['X handle']||'').replace(/^@/,'').toLowerCase()===h))||(l.name&&C.find(c=>window.GTM&&GTM.normName(c.Name)===GTM.normName(l.name)))||null;}
function liStatus(l){const x=LIo(l);const t=(AK.LBT.rows||[]).find(r=>r.lead_id===l.id&&['review','ready','sending','failed'].includes(r.status));
  const kind=t?(t.kind==='invite'?'Connection request':t.kind==='followup'?'Follow-up '+(t.step%100):t.kind==='inmail'?'InMail':'First message'):'';
  if(t&&t.status==='review')return kind+' waiting for your OK';if(t&&t.status==='failed')return kind+' didn’t go through';if(t)return kind+' going out soon';
  if(x.replied)return 'Replied '+since(x.replied);if(x.stop==='no reply')return 'No reply after follow-up 7';if(x.dm)return (+x.fu?'Follow-up '+x.fu+' sent':'First message sent')+' '+since(x.last||x.dm);
  if(x.acc)return 'Accepted '+since(x.acc);if(x.req)return 'Request sent '+since(x.req);return l.linkedin?'Not contacted yet':'No LinkedIn found';}
const X_ST={'To send':'First DM waiting for your OK','Sent':'First DM sent','FU1 sent':'Follow-up 1 sent','FU2 sent':'Follow-up 2 sent','Replied':'Replied','Call booked':'Call booked','Customer':'Client','Not now':'Closed: not now','No reply':'Closed: no reply','Do not contact':'Closed: do not contact'};
function xStatus(c){if(!c)return '';const sent=(AK.XT.rows||[]).filter(t=>t.row===c._row&&t.status==='sent').sort((a,b)=>ms(b.sent_at)-ms(a.sent_at))[0];
  const q=(AK.XT.rows||[]).find(t=>t.row===c._row&&(t.status==='ready'||t.status==='sending'));
  if(q)return (q.kind==='dm'?'First DM':'Follow-up '+String(q.kind).replace('fu',''))+' queued for the X bot';
  if(sent&&!/^(Replied|Call booked|Customer)$/.test(c._status))return (sent.kind==='dm'?'First DM':'Follow-up '+String(sent.kind).replace('fu',''))+' sent '+since(sent.sent_at);
  return X_ST[c._status]||c._status||'';}
function field(r){
  const ro=!canEdit()?' disabled':'';
  if(r.isSel)return '<select class="in"'+chg(cb(r.pick))+ro+'>'+(r.opts||[]).map(o=>'<option value="'+esc(o.v)+'"'+(String(o.v)===String(r.val)?' selected':'')+'>'+esc(o.l)+'</option>').join('')+'</select>';
  if(r.isArea)return '<textarea class="in" rows="2" placeholder="'+esc(r.ph||'')+'"'+inp(cb(r.set))+blur(cb(r.save))+ro+'>'+esc(r.val)+'</textarea>';
  return '<input class="in" type="'+(r.isNum?'number':r.isDate?'date':'text')+'" value="'+esc(r.val)+'" placeholder="'+esc(r.ph||'')+'"'+inp(cb(r.set))+blur(cb(r.save))+ro+'>';
}
function panelHtml(){
  const s=L.state;
  if(s.lid&&s.lid!=='new')return safe(leadPanelHtml,'');
  if(s.cid)return safe(xPanelHtml,'');
  return '';
}
function frame(headHtml,tabs,body){
  const close=()=>{if(L.state.lid)L.closeLead();L.setState({cid:null});};
  return '<div class="scrim"'+act(close)+'></div><aside class="panel" role="dialog" aria-label="Person"><div class="p-h">'+headHtml.replace('{{X}}','<button type="button" class="p-close" aria-label="Close"'+act(close)+'>×</button>')+'</div>'
    +'<div class="tabs">'+tabs.map(([k,label])=>'<button type="button" class="'+(V.ptab===k?'on':'')+'"'+act(()=>{V.ptab=k;schedule();})+'>'+esc(label)+'</button>').join('')+'</div>'
    +'<div class="p-b" data-keep="panel">'+body+'</div></aside>';
}
function leadPanelHtml(){
  const lp=L.leadPanel();if(!lp.open)return '';const l=AK.LD.rows.find(r=>r.id===L.state.lid);if(!l)return '';
  const x=LIo(l);const c=xContactFor(l);
  const S=safe(()=>L.liPipeScore(l),null);const notFit=safe(()=>L.liNotFit(l),'');
  const src=srcOf(l);const how=LI_SRC[src]?LI_SRC[src]+' ('+(BOUND[src]||'Outbound')+')':[l.direction,l.source_detail].filter(Boolean).join(' · ');
  const a=avc(l.name||l.company||'?');
  // channels: where they are on each platform
  const ch=[];
  ch.push({p:'LinkedIn',s:liStatus(l),on:!!l.linkedin,b:l.linkedin?['Open',()=>window.open(/^https?:/.test(l.linkedin)?l.linkedin:'https://'+l.linkedin,'_blank','noopener')]:null});
  const xh=String(l.x_handle||((l.fields||{}).li_icp||{}).x||(c&&c['X handle'])||'').replace(/^@/,'');
  ch.push({p:'X',s:c?xStatus(c):xh?'Not in the X pipeline yet':'No X handle found',on:!!(c||xh),b:xh?['Open',()=>window.open('https://x.com/'+xh,'_blank','noopener')]:null});
  if(l.instagram||l.source==='Instagram')ch.push({p:'Instagram',s:(l.instagram?'@'+String(l.instagram).replace(/^@/,'')+' · ':'')+(l.stage||''),on:true,b:l.instagram?['Open',()=>window.open('https://instagram.com/'+String(l.instagram).replace(/^@/,''),'_blank','noopener')]:null});
  ch.push({p:'Email',s:'Not set up yet'+(l.email?' · '+l.email:''),on:false,b:l.email?['Email',()=>{window.location.href='mailto:'+String(l.email).trim();}]:null});
  const chHtml='<div class="chan">'+ch.map(z=>'<div class="c'+(z.on?'':' off')+'"><div class="t">'+platMark(z.p)+esc(z.p)+'</div><div class="s">'+esc(z.s)+'</div>'+(z.b?'<button type="button" class="btn sm"'+act(z.b[1])+'>'+esc(z.b[0])+'</button>':'')+'</div>').join('')+'</div>';
  const track='<div class="track">'+(lp.track||[]).map((t,i)=>{const cur=t.label===l.stage;const idx=(lp.track||[]).findIndex(z=>z.label===l.stage);return '<button type="button" class="'+(cur?'on':i<idx?'past':'')+'" title="'+esc(t.full)+'"'+act(cb(t.set))+(canEdit()?'':' disabled')+'>'+esc(t.label==='In talks'?'Replied':t.label)+'</button>';}).join('')+'</div>';
  const pills=[S?fitPill(S.n):'',notFit?pill('Not a fit: '+notFit,'bad'):'',how?pill(how,'line'):'',l.source&&!LI_SRC[src]?pill(l.source,'line'):''].join('');
  const hd='<div class="p-top"><div class="av" style="background:'+a.bg+';color:'+a.fg+'">'+esc(a.ini)+'</div><div style="min-width:0"><h2>'+esc(lp.name)+'</h2><div class="p-sub">'+esc(lp.sub)+'</div><div class="p-pills">'+pills+'</div></div>{{X}}</div>'+chHtml+track;
  let b='';const tab=V.ptab;
  if(tab==='next'){
    const nx=(lp.deal||[]).filter(r=>/^Next step/.test(r.label));
    b+='<div class="blk"><h3>Next step</h3><div class="kv">'+nx.map(r=>'<label>'+esc(r.label)+'</label>'+field(r)).join('')+'</div></div>';
    // LinkedIn message waiting for an OK, straight from the LinkedIn board
    const card=memo('lpc:'+l.id,()=>{const B=withState({lpExp:'all',lpQ:'',lpMin:0,lpOut:true},()=>L.liPipeVals());for(const col of B.cols)for(const k of col.cards)if(k.id===l.id)return k;return null;});
    if(card&&(card.hasMsg||card.isFailed))b+='<div class="blk"><h3>'+platMark('LinkedIn')+esc(plainWords(card.msgKind||'LinkedIn'))+'<span class="sp"></span>'+(card.chars?'<span class="count">'+esc(card.chars)+'</span>':'')+'</h3>'
      +(card.isFailed?'<div class="errline">'+esc(card.status)+'</div>':'')+(card.hasMsg?ta(card.msg,card.onMsg,card.saveMsg,5):'')
      +'<div class="under">'+(card.hasMsg&&canEdit()?btn('Approve',card.approve,'pri sm')+btn('Skip',card.skip,'sm ghost'):'')+(card.isFailed&&canEdit()?btn('Try again',card.retry,'sm'):'')+'</div></div>';
    if(card&&card.hasDraft)b+='<div class="blk"><h3>'+platMark('LinkedIn')+'Suggested reply ('+esc(card.replyLabel)+')</h3><div class="pmsg"><div class="mt">'+esc(card.draft)+'</div></div>'+btn('Copy reply + open LinkedIn',card.copyDraft,'pri sm')+'</div>';
    if(card&&card.hasInmail)b+='<div class="blk"><h3>'+platMark('LinkedIn')+'InMail</h3><div class="note">Not accepted in a week, and a great fit.</div><div class="under">'+btn('Copy InMail + open profile',card.inmail,'sm')+btn('InMail sent',card.inmailSent,'sm ghost')+'</div></div>';
    // the 3 ideas
    const tp=lp.tip||{};
    if(tp.has)b+='<div class="blk"><h3>'+platMark('LinkedIn')+'Their 3 ideas<span class="sp"></span><span class="note" style="font-weight:400">'+esc(tp.meta)+'</span></h3>'+ta(tp.text,tp.setText,null,8)
      +'<div class="under">'+btn(tp.copyLabel||'Copy',tp.copy,'pri sm')+(tp.hasChat?btn('Open chat',tp.openChat,'sm'):'')+(tp.canEdit?(tp.dirty?btn('Save edits',tp.save,'sm'):'')+(tp.notSent?btn('Mark sent',tp.markSent,'sm'):'')+btn('Write again',tp.rewrite,'sm ghost'):'')+'</div></div>';
    else if(tp.canWrite)b+='<div class="blk"><h3>'+platMark('LinkedIn')+'Their 3 ideas</h3><div class="note">Not written yet. We look up what they sell and pick 3 of our 5 ideas.</div><div class="under">'+btn('Write their 3 ideas',tp.write,'sm')+'</div></div>';
    // X messages, when they're in the X pipeline
    if(c){L.state.lastCid=c._key;const cp=safe(()=>L.panelVals(),null);
      if(cp&&cp.msgs)b+='<div class="blk"><h3>'+platMark('X')+'X messages</h3>'+(cp.hasActions?'<div class="under" style="margin:0 0 8px">'+cp.actions.map(z=>btn(z.label,z.fn,/^Mark|^Book|customer/i.test(z.label)?'pri sm':'sm')).join('')+'</div>':'')
        +cp.msgs.map(m=>'<div class="pmsg" style="opacity:'+m.op+'"><div class="mh">'+esc(m.title)+pill(m.status.label,'line')+'<span style="flex:1"></span>'+btn(m.copyLabel,m.copy,'sm ghost')+'</div><div class="mt">'+esc(plainWords(m.text))+'</div></div>').join('')+'</div>';}
    // call
    const cl=lp.call||{};
    if(cl.has)b+='<div class="blk"><h3>Call</h3><div class="pmsg"><div class="mh">'+esc(cl.kind)+(cl.hasState?pill(cl.state,'bad'):'')+'</div><div class="mt">'+esc(cl.when)+'\n'+esc(cl.src)+'</div></div>'+(cl.hasMeet?btn('Join Meet',cl.openMeet,'pri sm')+' '+btn('Copy link',cl.copyMeet,'sm'):'')+'</div>';
    // log
    b+='<div class="blk"><h3>Log what happened</h3><div class="chips" style="margin-bottom:8px">'+(lp.kinds||[]).map(k=>'<button type="button" class="chip'+(k.bg==='var(--ink)'?' on':'')+'"'+act(cb(k.go))+'>'+esc(k.label)+'</button>').join('')+'</div>'
      +ta(lp.note,lp.setNote,null,3,key(cb(lp.noteKey))+' placeholder="What happened? Ctrl+Enter to add"')+'<div class="under">'+(canEdit()?btn('Add',lp.addNote,'pri sm'):'')+'</div></div>';
  }
  if(tab==='history'){
    const ev=lp.events||[];
    let xd='';if(c){L.state.lastCid=c._key;const cp=safe(()=>L.panelVals(),null);if(cp&&cp.dates)xd='<div class="blk"><h3>'+platMark('X')+'On X</h3>'+cp.dates.map(d=>'<div class="ev"><span class="i">•</span><div>'+esc(d.label)+' <span class="w">'+esc(d.date)+'</span></div></div>').join('')+'</div>';}
    b+='<div class="blk"><h3>Everything that happened</h3>'+(ev.length?ev.map(e=>'<div class="ev"><span class="i">'+esc(e.icon)+'</span><div><div><b>'+esc(e.kind)+'</b> <span class="w">'+esc(e.when)+(e.by?' · '+esc(e.by):'')+'</span>'+(e.canDel&&canEdit()?' <button type="button" class="btn ghost sm"'+act(cb(e.del))+'>Delete</button>':'')+'</div><div class="pre">'+esc(e.text)+'</div></div></div>').join(''):'<div class="note">Nothing logged yet.</div>')+'</div>'+xd;
  }
  if(tab==='research'){
    const g=lp.g||{};
    if(S)b+='<div class="blk"><h3>How good a fit</h3><div class="pmsg"><div class="mh">'+fitPill(S.n)+'<span class="note" style="font-weight:400">'+esc(S.n+' out of 10'+(S.bonus&&S.bonus.length?' · '+S.bonus.join(', '):''))+'</span></div><div class="mt">'+esc((S.sc&&S.sc.reasons||[]).slice(0,6).join('\n'))+((S.sc&&S.sc.gaps||[]).length?'\n\nNot known yet: '+esc(S.sc.gaps.slice(0,5).join(', ')):'')+'</div></div></div>';
    if(g.ok){
      const rd=g.radar||{};
      b+='<div class="blk"><h3>Why now</h3>'+((rd.why||[]).length?rd.why.map(w=>'<div class="ev"><span class="i">•</span><div><b>'+esc(w.label||'')+'</b> '+esc(w.text||'')+' <span class="w">'+esc(w.when||'')+'</span> '+pill(w.kindP&&w.kindP.label,/Verified/.test((w.kindP||{}).label)?'ok':'warn')+(w.hasSrc?' <button type="button" class="btn ghost sm"'+act(cb(w.openSrc))+'>Source ↗</button>':'')+'</div></div>').join(''):'<div class="note">No fresh news about them yet.</div>')
        +(rd.action?'<div class="pmsg" style="margin-top:8px"><div class="mh">What to do</div><div class="mt">'+esc(plainWords(rd.action))+(rd.angle?'\nAngle: '+esc(rd.angle):'')+'</div></div>':'')+'</div>';
      for(const gr of (g.groups||[]))if((gr.rows||[]).length)b+='<div class="blk"><h3>'+esc(gr.label)+'</h3><div class="kv">'+gr.rows.map(f=>'<label>'+esc(f.label)+'</label><div>'+field(f)+((f.hasSrcLink||f.at)?'<div class="note" style="margin-top:2px">'+(f.at?esc(f.at)+' ':'')+(f.hasSrcLink?'<button type="button" class="btn ghost sm"'+act(cb(f.openSrc))+'>Source ↗</button>':'')+'</div>':'')+'</div>').join('')+'</div></div>';
      if((g.research||[]).length)b+='<div class="blk"><h3>Look them up</h3><div class="chips">'+g.research.map(r=>'<button type="button" class="chip"'+act(cb(r.go))+'>'+esc(r.label)+' ↗</button>').join('')+'</div></div>';
      b+='<div class="blk"><h3>Relationship</h3><div class="kv"><label>LinkedIn connection</label>'+(g.connOpts?'<select class="in"'+chg(cb(g.pickConn))+(canEdit()?'':' disabled')+'>'+g.connOpts.map(o=>'<option value="'+esc(o.v)+'"'+(o.v===g.conn?' selected':'')+'>'+esc(o.l)+'</option>').join('')+'</select>':'')
        +'<label>Where they came from</label>'+(g.acqOpts?'<select class="in"'+chg(cb(g.pickAcq))+(canEdit()?'':' disabled')+'>'+g.acqOpts.map(o=>'<option value="'+esc(o.v)+'"'+(o.v===g.acq?' selected':'')+'>'+esc(o.l)+'</option>').join('')+'</select>':'')+'</div></div>';
      if(g.isDq)b+='<div class="blk"><h3>Not a fit</h3><div class="warnline">'+esc(g.dq||'Marked as not a fit')+'</div><div class="under">'+(canEdit()?btn('Put them back',g.undoDq,'sm'):'')+'</div></div>';
      else if(canEdit())b+='<div class="blk"><h3>Not a fit?</h3><div class="kv"><label>Why</label><input class="in" value="'+esc(g.dqVal||'')+'"'+inp(cb(g.setDq))+'></div><div class="under">'+btn('Mark as not a fit',g.doDq,'sm ghost')+'</div></div>';
    }
    if(lp.hasBrief)b+='<div class="blk"><h3>Call prep<span class="sp"></span><span class="note" style="font-weight:400">'+esc(lp.briefMeta)+'</span></h3><div class="pmsg"><div class="mt">'+esc(lp.brief)+'</div></div>'+btn('Copy',lp.copyBrief,'sm')+' '+(canEdit()?btn('Write it again',lp.rebrief,'sm ghost'):'')+'</div>';
    else if(lp.noBrief)b+='<div class="blk"><h3>Call prep</h3><div class="note">Being written (within 15 minutes of the booking).</div>'+(canEdit()?btn('Write it now',lp.rebrief,'sm'):'')+'</div>';
    b+='<div class="blk"><div class="note">Adding a signal by hand and the per-point fit breakdown are still in the current CRM until phase 3. '
      +'<button type="button" class="btn ghost sm"'+act(()=>openOld('Leads','leadList'))+'>Open the current CRM ↗</button></div></div>';
  }
  if(tab==='details'){
    const kv=rows=>'<div class="kv">'+rows.map(r=>'<label>'+esc(r.label==='Lead heat'?'Warmth':r.label)+'</label>'+field(r)).join('')+'</div>';
    b+='<div class="blk"><h3>Contact</h3>'+kv(lp.contact||[])+'</div><div class="blk"><h3>The deal</h3>'+kv((lp.deal||[]).filter(r=>!/^Next step/.test(r.label)))+'</div>'
      +(lp.hasCustom?'<div class="blk"><h3>Your fields</h3>'+kv(lp.custom)+'</div>':'')
      +(lp.hasCats?'<div class="blk"><h3>Categories</h3><div class="chips">'+lp.cats.map(t=>'<button type="button" class="chip'+(t.bg!=='transparent'?' on':'')+'"'+act(cb(t.toggle))+'>'+esc(t.label)+'</button>').join('')+'</div></div>':'')
      +'<div class="blk"><h3>Notes</h3>'+ta(lp.notes,lp.setNotes,lp.saveNotes,4)+'</div>'
      +'<div class="blk"><div class="note">'+esc(lp.added)+'</div><div class="under">'+(canEdit()?btn('Archive',lp.archive,'sm ghost'):'')+'</div></div>';
  }
  return frame(hd,[['next','Next'],['history','History'],['research','Research'],['details','Details']],b);
}
function xPanelHtml(){
  const cp=L.panelVals();if(!cp||!cp.name)return '';const a=avc(cp.name);const c=(AK.M.contacts||[]).find(z=>z._key===cp.id);
  const ch='<div class="chan">'+(cp.reach||[]).map(r=>'<div class="c"><div class="t">'+platMark(r.ic==='in'?'LinkedIn':r.ic==='X'?'X':'Email')+esc(r.label.replace(' · copy',''))+'</div><div class="s">'+esc(r.ic==='X'&&c?xStatus(c):r.sub)+'</div><button type="button" class="btn sm"'+act(cb(r.go))+'>'+(r.ic==='@'?'Copy':'Open')+'</button></div>').join('')
    +'<div class="c off"><div class="t">'+platMark('Email')+'Email</div><div class="s">Not set up yet</div></div></div>';
  const track='<div class="track">'+(cp.track||[]).map(t=>'<button type="button" class="'+(t.fw==='600'?'on':'')+'" title="'+esc(t.full)+'"'+act(cb(t.set))+(canEdit()?'':' disabled')+'>'+esc(t.label)+'</button>').join('')+'</div>';
  const hd='<div class="p-top"><div class="av" style="background:'+a.bg+';color:'+a.fg+'">'+esc(a.ini)+'</div><div style="min-width:0"><h2>'+esc(cp.name)+'</h2><div class="p-sub">'+esc([cp.role,cp.company].filter(x=>x&&x!=='–').join(' · '))+'</div><div class="p-pills">'+pill(cp.stageP.label,'line')+(c&&c._fit?fitPill(c._fit):'')+'</div></div>{{X}}</div>'+ch+track;
  let b='';
  if(V.ptab==='next'){
    const xk=memo('xpc:'+cp.id,()=>{const B=withState({xpExp:'all',xpQ:'',xpMin:0},()=>L.xPipeVals(L.allPeople()));for(const col of B.cols)for(const k of col.cards)if(k.id===cp.id)return k;return null;});
    if(xk&&(xk.hasMsg||xk.isFailed))b+='<div class="blk"><h3>'+platMark('X')+'First DM, waiting for your OK</h3>'+(xk.isFailed?'<div class="errline">'+esc(xk.status||'Didn’t go through')+'</div>':'')
      +(xk.hasMsg?ta(xk.msg,xk.onMsg,xk.saveMsg,5):'')+'<div class="under">'+(xk.hasMsg&&canEdit()?btn('Approve',xk.approve,'pri sm')+btn('Skip',xk.skip,'sm ghost'):'')+(xk.isFailed&&canEdit()?btn('Try again',xk.retry,'sm'):'')+'</div></div>';
    b+=(cp.hasActions?'<div class="blk"><h3>Next</h3><div class="under">'+cp.actions.map(z=>btn(z.label,z.fn,/^Mark|^Book|customer/i.test(z.label)?'pri sm':'sm')).join('')+'</div></div>':'')
      +'<div class="blk"><h3>'+platMark('X')+'Messages</h3>'+cp.msgs.map(m=>'<div class="pmsg" style="opacity:'+m.op+'"><div class="mh">'+esc(m.title)+pill(m.status.label,'line')+'<span style="flex:1"></span>'+btn(m.copyLabel,m.copy,'sm ghost')+'</div><div class="mt">'+esc(plainWords(m.text))+'</div></div>').join('')+'</div>'
      +'<div class="blk"><h3>Call</h3><input class="in" type="datetime-local" value="'+esc(cp.callAt)+'"'+inp(cb(cp.setCall))+blur(cb(cp.saveCall))+(cp.ro?' disabled':'')+'></div>';
  }
  if(V.ptab==='history')b+='<div class="blk"><h3>'+platMark('X')+'On X</h3>'+cp.dates.map(d=>'<div class="ev"><span class="i">•</span><div>'+esc(d.label)+' <span class="w">'+esc(d.date)+'</span></div></div>').join('')+'</div>';
  if(V.ptab==='details')b+='<div class="blk"><h3>What we know</h3>'+cp.facts.map(f=>'<div class="pmsg"><div class="mh">'+esc(f.label)+'</div><div class="mt"><b>'+esc(f.v)+'</b>'+(f.sub?'\n'+esc(f.sub):'')+'</div></div>').join('')+'</div>'
    +'<div class="blk"><h3>Notes</h3>'+ta(cp.note,cp.setNote,cp.saveNote,4)+'</div>';
  return frame(hd,[['next','Next'],['history','History'],['details','Details']],b);
}

/* ---------- toast ---------- */
function toastHtml(){const s=L.state;if(!s.toastOn||!s.toastMsg)return '';
  return '<div class="toast'+(s.toastErr?' err':'')+'" role="status"><span>'+esc(plainWords(s.toastMsg))+'</span>'+(s.toastUndo?'<button type="button"'+act(()=>{const u=L.state.toastUndo;L.setState({toastOn:false});if(u)u();})+'>Undo</button>':'')+'</div>';}

/* ---------- search (Ctrl K): people on every platform, and pages ---------- */
function searchResults(q){
  q=q.trim().toLowerCase();const out=[];
  for(const p of Object.values(PAGE))if(!q||p.label.toLowerCase().includes(q))out.push({kind:'Page',label:p.label,sub:p.grp,go:()=>nav(p.id)});
  if(q){const leads=(AK.LD.rows||[]).filter(l=>!l.archived&&[l.name,l.company,l.x_handle,l.instagram,l.email].join(' ').toLowerCase().includes(q)).slice(0,12);
    const seen=new Set(leads.map(l=>(window.GTM?GTM.normName(l.name):l.name)));
    for(const l of leads)out.push({kind:l.source||'Lead',plat:l.source,label:l.name||l.company||'(no name)',sub:[l.role,l.company].filter(Boolean).join(' · '),go:()=>L.openLead(l.id)});
    for(const c of (AK.M.contacts||[]).filter(c=>[c.Name,c.Company,c['X handle']].join(' ').toLowerCase().includes(q)).slice(0,10)){
      if(seen.has(window.GTM?GTM.normName(c.Name):c.Name))continue;out.push({kind:'X',plat:'X',label:c.Name,sub:[c.Role,c.Company].filter(Boolean).join(' · '),go:()=>L.openC(c._key)});}}
  return out.slice(0,q?20:14);
}
function openSearch(){V.pal=true;V.palQ='';V.palSel=0;drawSearch();setTimeout(()=>{const i=document.getElementById('palq');if(i)i.focus();},20);}
function closeSearch(){V.pal=false;document.getElementById('palc').innerHTML='';}
function drawSearch(onlyRes){
  const R=searchResults(V.palQ);V.palSel=Math.min(V.palSel,Math.max(0,R.length-1));
  const res=R.map((r,i)=>'<button type="button" class="r'+(i===V.palSel?' on':'')+'" data-r="'+i+'">'+(r.plat?platMark(r.plat):'<span class="plat em">↗</span>')+'<span><b>'+esc(r.label)+'</b> <span class="note">'+esc(r.sub||'')+'</span></span><span class="k">'+esc(r.kind)+'</span></button>').join('')||'<div class="empty">Nothing matches.</div>';
  const host=document.getElementById('palc');
  if(onlyRes&&host.querySelector('.res')){host.querySelector('.res').innerHTML=res;}
  else host.innerHTML='<div class="pal"><div class="box"><input id="palq" placeholder="Search people, companies, pages" autocomplete="off" value="'+esc(V.palQ)+'"><div class="res">'+res+'</div></div></div>';
  host._R=R;
}
document.addEventListener('input',e=>{if(e.target.id==='palq'){V.palQ=e.target.value;V.palSel=0;drawSearch(true);}});
document.addEventListener('click',e=>{const host=document.getElementById('palc');if(!host||!V.pal)return;
  const r=e.target.closest('#palc [data-r]');if(r){const x=host._R[+r.dataset.r];closeSearch();if(x)x.go();return;}
  if(e.target.classList.contains('pal'))closeSearch();});
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();openSearch();return;}
  if(V.pal){const host=document.getElementById('palc');const R=host._R||[];
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeSearch();return;}
    if(e.key==='ArrowDown'){e.preventDefault();V.palSel=Math.min(R.length-1,V.palSel+1);drawSearch(true);}
    if(e.key==='ArrowUp'){e.preventDefault();V.palSel=Math.max(0,V.palSel-1);drawSearch(true);}
    if(e.key==='Enter'){e.preventDefault();const x=R[V.palSel];closeSearch();if(x)x.go();}
    return;}
  if(e.key==='Escape'){if(V.brief){V.brief=false;schedule();}else if(V.menu){V.menu=false;schedule();}}
},true);

/* ---------- dry run for local testing: http://localhost:8787/v2/?dry nothing is saved or sent ---------- */
const DRY=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&/[?&]dry\b/.test(location.search);
if(DRY){for(const k of ['write','lbtSet','xgSet','xgDraft','xgRun','sigAct','leadSave','leadNote','leadNoteDelete','leadArchive','leadCreate','liStep','xtQueue','xtCancel','xtPause','liTips','liBrief','briefRun','liFunding','liSignal','liInmail','savePaused','lisSet','lisRun','socialRun','calSave','calNew','calUpload','movePosts','deletePost','savePosted','saveScheduled','leadSettingSave','saveTpl','importLiConnections','xRun','igRun','engagerToPipeline','saveEngager'])
  if(typeof AK[k]==='function'){const name=k;AK[k]=async(...a)=>{console.log('[dry run]',name,a);L.toast('Dry run: '+name+' (not saved)');return true;};}
  for(const k of ['save','signal','signalDel','set','touch','merge','postAdd','postSet','postPosted','intel','intelMany'])
    if(AK.gtm&&typeof AK.gtm[k]==='function'){const name='gtm.'+k;AK.gtm[k]=async(...a)=>{console.log('[dry run]',name,a);L.toast('Dry run: '+name+' (not saved)');return true;};}}

/* ---------- start ---------- */
function start(){mount();L.componentDidMount();AK.hooks.toast=(m,err)=>L.toast(m,null,err);render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
