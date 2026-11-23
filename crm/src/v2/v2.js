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
  ptab:'next',pal:false,palQ:'',palSel:0,menu:false,brief:false,more:{},rpQueued:false,f:{},q:{},nums:false,calEd:null,calOpen:{},dragging:null,anim:true,pexp:null,edit:null,bmenu:false,cform:null,cuDone:{}};

// Where the old pages live now. Pages not built yet open as a short note with links to the current CRM.
const GO_MAP={home:'today',leads:'today',leadBrief:'today',notifs:'bots',leadSignals:'needs',gtmNow:'outbound',liPipe:'pipeline',pipeline:'pipeline',leadBoard:'pipeline',leadList:'pipeline',
  leadDossier:'calls',liOut:'bots',leadSetup:'settings',leadAdd:'settings',inbox:'needs',engaged:'midbound',replies:'replies',gtmEngage:'replies',xShared:'midbound',liPeople:'midbound',
  liMid:'midbound',liInbox:'inbound',calendar:'calendar',tracker:'results',posts:'competitors',send:'outbound',scripts:'messages',growth:'results',comps:'competitors',pdm:'midbound'};
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
  {g:'Internal CRM',items:[['outbound','Outbound','→'],['midbound','Midbound','♥'],['inbound','Inbound','←'],['pipeline','Pipelines','≡'],['clients','Clients','$'],['replies','Reply to their posts','↩'],['calls','Calls','☏'],['competitors','Competitors','⚔'],['bots','Bots and messages','⚙']]}];
const NAV_C={clients:'#059669',today:'#4F46E5',needs:'#E11D48',calendar:'#D97706',results:'#0D9488',outbound:'#2563EB',midbound:'#7C3AED',inbound:'#059669',pipeline:'#4F46E5',replies:'#DB2777',calls:'#10B981',ideas:'#F59E0B',competitors:'#DC2626',bots:'#475569',messages:'#0EA5E9',settings:'#6B7280'};
const PAGE=Object.fromEntries([...NAV,{g:'',items:[['settings','Settings','⚒'],['messages','Messages','✉'],['trash','Trash','🗑'],['ideas','Post ideas','✦']]}].flatMap(g=>g.items.map(([id,label,ic,phase])=>[id,{id,label,ic,phase:phase||1,grp:g.g}])));
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
function openOld(plat,page){try{localStorage.setItem('ak-crm-plat',JSON.stringify(plat));localStorage.setItem('ak-crm-page',page);}catch(e){}window.open('../old/','_blank','noopener');}

function nav(page,quiet){if(!PAGE[page])page='today';if(page!==V.page){V.more={};V.anim=true;}V.page=page;V.menu=false;try{localStorage.setItem(PAGES_KEY,page);}catch(e){}
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
  const fol=[...((dv.li||{}).items||[]).map(x=>({...x,plat:'LinkedIn'})),...((dv.x||{}).items||[]).filter(x=>x.id&&leadById(x.id)).map(x=>({...x,plat:'X'})),...((dv.ig||{}).items||[]).map(x=>({...x,plat:'Instagram'}))];
  const rpOpen=+(rp.openN||0);
  return{lp,xp,rp,sg,tips,tipsAhead,dv,liAnswer,xAnswer,liWait,xWait,sigs,tipItems,fol,liFound:col(lp,'found'),xReview:col(xp,'review'),
    nAnswer:liAnswer.length+xAnswer.length,nApprove:liWait.length+xWait.length+rpOpen+sigs.length,nHand:tipItems.length+fol.length};});}

/* ---------- shell ---------- */
let pending=false;
const editing=()=>{const a=document.activeElement;return !!a&&/^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName)&&!a.closest('.pal')&&document.getElementById('app').contains(a);};
function schedule(){if(renderQ)return;renderQ=true;const wait=Math.max(0,180-(Date.now()-lastRender));setTimeout(()=>{renderQ=false;render();},wait);}
function mount(){
  document.getElementById('app').innerHTML='<div class="app"><aside class="rail" id="rail"></aside><div style="display:flex;flex-direction:column;min-width:0;min-height:0">'
    +'<div class="top" id="top"></div><main class="main" id="main"><div id="tbar"></div><div class="col" id="col"></div></main></div></div><div id="ov"></div><div id="palc"></div>';
  L.mainRef.current=document.getElementById('main');
}
// (16 Nov) Smooth redraws: each part of the screen is only replaced when its content changed, and every scroll position
// (down and sideways: the calendar week, the pipeline boards, each column, the panel) is kept across a redraw.
const LAST={};let lastRender=0;
function paint(id,html,after){const el=document.getElementById(id);if(!el)return;if(LAST[id]===html)return;
  const keep=[];document.querySelectorAll('[data-keep]').forEach(k=>{if(el.contains(k))keep.push([k.dataset.keep,k.scrollLeft,k.scrollTop]);});
  el.innerHTML=html;LAST[id]=html;if(after)after(el);
  for(const [k,x,y] of keep){const n=el.querySelector('[data-keep="'+CSS.escape(k)+'"]');if(n){n.scrollLeft=x;n.scrollTop=y;}}}
// no redraw while the mouse is held down (a drag about to start) or while something is being scrolled
document.addEventListener('pointerdown',e=>{if(e.button===0)V.hold=true;},true);
document.addEventListener('pointerup',()=>{V.hold=false;if(pending)setTimeout(render,60);},true);
for(const ev of ['pointercancel','dragend','dragstart'])document.addEventListener(ev,()=>{V.hold=false;},true);
window.addEventListener('blur',()=>{V.hold=false;});
document.addEventListener('scroll',()=>{V.scrollAt=Date.now();},true);
// (16 Nov) Drag to scroll anywhere: hold the mouse on empty space (or a card in the pipeline) and drag. Sideways moves the
// calendar week or the board; up and down moves the column under the pointer, or the page. A drag of 5px or more isn't a click.
let pan=null,eatClick=false;
document.addEventListener('pointerdown',e=>{if(e.button!==0||e.pointerType==='touch')return;const main=document.getElementById('main');if(!main||!main.contains(e.target))return;
  if(e.target.closest('input,textarea,select,button,a,label,[draggable=true],.chip,.seg,.tb-s,.pmsg,.fs-m,.rc-p,.post-t,.side-x,.pc2-x'))return;
  const h=e.target.closest('.week2,.board2,.kgrid');const v=e.target.closest('.bc-b')||main;
  pan={h,v,x:e.clientX,y:e.clientY,l:h?h.scrollLeft:0,t:v.scrollTop,moved:false};},true);
document.addEventListener('pointermove',e=>{if(!pan)return;const dx=e.clientX-pan.x,dy=e.clientY-pan.y;
  if(!pan.moved&&Math.abs(dx)<5&&Math.abs(dy)<5)return;pan.moved=true;document.body.classList.add('panning');
  if(pan.h)pan.h.scrollLeft=pan.l-dx;pan.v.scrollTop=pan.t-dy;V.scrollAt=Date.now();e.preventDefault();},true);
document.addEventListener('pointerup',()=>{if(pan&&pan.moved){eatClick=true;setTimeout(()=>{eatClick=false;},60);}pan=null;document.body.classList.remove('panning');},true);
document.addEventListener('click',e=>{if(eatClick){e.stopPropagation();e.preventDefault();eatClick=false;}},true);
function render(){
  if(editing()||V.dragging||V.hold){pending=true;return;}
  const sw=Date.now()-(V.scrollAt||0);if(sw<600){pending=true;setTimeout(()=>{if(pending)render();},620-sw);return;}
  pending=false;A=[];RC={};lastRender=Date.now();
  L.viewOnlyRole=false;L.founder=!AK.canEdit();
  const g=AK.gate();
  document.getElementById('rail').className='rail'+(V.menu?' open':'');
  paint('rail',railHtml(g));
  paint('top','<button type="button" class="btn sm"'+act(()=>{V.menu=!V.menu;schedule();})+'>☰</button><b>'+esc(PAGE[V.page].label)+'</b><span class="sp"></span><button type="button" class="btn sm"'+act(openSearch)+'>Search</button>');
  paint('tbar',g?'':tbarHtml());if(!g)safe(replyAlerts);
  const anim=!!V.anim;V.anim=false;
  paint('col',pageHtml(g),el=>el.classList.toggle('anim',anim));
  paint('ov',(g?'':panelHtml()+briefHtml()+calEditHtml()+editHtml()+clientFormHtml()+compFormHtml()+compDetailHtml())+toastHtml()+(DRY?'<div class="dry">Dry run: nothing is saved or sent</div>':''));
  document.title=PAGE[V.page].label+' · '+(AK.BRAND||'SOVE7GN')+' CRM';
}
function railHtml(g){
  const n=g?null:needs();const tot=n?n.nAnswer+n.nApprove+n.nHand+catchupRows().length:0;
  let h='<button type="button" class="brand"'+act(()=>{V.bmenu=!V.bmenu;schedule();})+'><div class="logo">'+esc((AK.BRAND||'S')[0])+'</div>'+esc(AK.BRAND||'SOVE7GN')+'<span class="caret">▾</span></button>'+brandMenu()+'<nav class="nav">';
  for(const grp of NAV){if(grp.g)h+='<div class="grp"><span>'+esc(grp.g)+'</span></div>';
    for(const [id,label,ic,phase] of grp.items){const badge=id==='needs'&&tot?'<span class="badge">'+(tot>99?'99+':tot)+'</span>':phase>1?'<span class="soon">soon</span>':'';
      h+='<button type="button" class="'+(V.page===id?'on':'')+'"'+act(()=>nav(id))+' title="'+esc(INFO[id]||'')+'"><span class="ic" style="--ic:'+(NAV_C[id]||'#6B7280')+'">'+ic+'</span>'+esc(label)+badge+'</button>';}}
  h+='</nav>';
  return h;
}
function pageHtml(g){
  if(g){if(g.wait)return '<div class="empty" style="padding:80px 0">'+esc(g.title||'Loading…')+'</div>';
    return '<div class="card" style="margin-top:40px"><div class="sec-b"><h2 style="margin:0 0 6px;font-size:16px">'+esc(g.title)+'</h2><p class="note">'+esc(g.body||'')+'</p>'+(g.action==='retry'?btn('Try again',()=>location.reload(),'pri'):'')+'</div></div>';}
  const f={today:pgToday,needs:pgNeeds,outbound:pgOutbound,midbound:pgMidbound,inbound:pgInbound,replies:pgReplies,pipeline:pgPipeline,calls:pgCalls,clients:pgClients,competitors:pgCompetitors,calendar:pgCalendar,results:pgResults,ideas:pgIdeas,bots:pgBots,messages:()=>{V.page='bots';return pgBots();},settings:pgSettings,trash:pgTrash}[V.page];
  const ld=AK.leadsState();
  if(f&&!ld.loaded&&!['calendar','results','ideas','competitors','bots','settings','messages','replies'].includes(V.page))return '<div class="empty" style="padding:80px 0">Loading leads…</div>';
  if(f)return safe(f,'<div class="errline">This page couldn’t be drawn. Open the current CRM while it’s fixed.</div>');
  return pgSoon(V.page);
}
function head(title,info,right){const pg=PAGE[V.page]||{};return '<div class="ph"><div><h1><span class="hic" style="--ic:'+(NAV_C[V.page]||'#6B7280')+'">'+(pg.ic||'')+'</span>'+esc(title)+'</h1><p>'+esc(info||'')+'</p></div><span class="sp"></span>'+(right?'<div class="right">'+right+'</div>':'')+'</div>';}
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
    out.push({rm:rmOfLead(l),t:'answer',plat:'LinkedIn',name:k.name,sub:k.sub,what:'Answer their reply',detail:k.hasDraft?'Suggested: '+k.draft:plainWords(k.status),when:whenTxt(x.replied),open:k.open,
      main:[k.hasDraft?'Copy reply':'Open chat',k.hasDraft?k.copyDraft:k.profile],more:[canEdit()&&['Answered',()=>AK.leadSave(l.id,{fields:{...(l.fields||{}),li:{...x,answered:new Date().toISOString()}}})]]});}
  for(const t of (AK.XT.rows||[]).filter(t=>t.status==='review')){const c=(AK.M.contacts||[]).find(x=>x._row===t.row);const ld=leadForContact(c);const x=((ld||{}).fields||{}).x||{};
    // (16 Nov) Answers to X replies (the 3 ideas when they said yes, a closing note when they said no) are sent by hand: copy, paste in their chat, press I sent it.
    if(['reply','close'].includes(t.kind)){const hd=String(t.handle||'').replace(/^@/,'');const goChat=()=>{const u=/^\d+$/.test(String(t.user_id||''))?'https://x.com/messages/compose?recipient_id='+t.user_id:hd?'https://x.com/'+hd:'';if(u)window.open(u,'_blank','noopener');};
      out.push({rm:{...(rmOfContact(c)||{}),x:String(t.handle||'').replace(/^@/,''),name:t.name},t:'answer',plat:'X',name:t.name||'Someone',sub:c?[c.Role,c.Company].filter(Boolean).join(' · '):'',what:t.kind==='close'?'They said no: closing note ready':'They replied: answer ready to paste',detail:(x.reply_text?'They said: “'+x.reply_text+'” → ':'')+t.text,when:since(t.created_at),
        open:c?()=>L.openC(c._key):null,main:['Copy answer + open chat',()=>{L.copy(t.text,'xt'+t.id,'Answer copied. Paste it in the X chat.');goChat();}],more:[canEdit()&&['I sent it',()=>AK.xtSet(t.id,{status:'sent',sent_at:new Date().toISOString()})],canEdit()&&['Skip',()=>AK.xtSet(t.id,{status:'skipped'})]]});continue;}
    out.push({rm:{...(rmOfContact(c)||{}),x:String(t.handle||'').replace(/^@/,''),name:t.name},t:'approve',plat:'X',name:t.name||'Someone',sub:c?[c.Role,c.Company].filter(Boolean).join(' · '):'',what:'Approve',detail:t.text,when:since(t.created_at),
      open:c?()=>L.openC(c._key):null,main:canEdit()?['Approve',()=>AK.xtSet(t.id,{status:'ready'})]:null,more:[canEdit()&&['Skip',()=>AK.xtSet(t.id,{status:'skipped'})]]});}
  for(const p of N.xAnswer){const open=()=>{const id=String(p.xid||'').trim(),hd=String(p.handle||'').replace(/^@/,'');const u=/^\d+$/.test(id)?'https://x.com/messages/compose?recipient_id='+id:hd?'https://x.com/'+hd:'';if(u)window.open(u,'_blank','noopener');};
    const ld=leadForContact(p.c);const xx=((ld||{}).fields||{}).x||{};if(xx.answered&&ms(xx.answered)>=ms(xx.replied_last))continue;if((AK.XT.rows||[]).some(t=>t.row===p.row&&['review','ready','sending'].includes(t.status)&&['reply','close'].includes(t.kind)))continue;
    const lab=LABEL_C[xx.reply_label]||null;
    out.push({rm:rmOfContact(p.c)||rmFor(p.id),t:'answer',plat:'X',name:p.name,sub:[p.role,p.company].filter(Boolean).join(' · '),what:lab?'Replied: '+lab[0]:'Answer their reply',detail:xx.reply_text?'“'+xx.reply_text+'”'+(xx.draft?' → '+xx.draft:''):(p.result||'They wrote back on X'),when:p.c&&p.c['Replied on']||'',open:()=>L.openC(p.id),
      main:xx.draft?['Copy answer + open chat',()=>{L.copy(xx.draft,'xa'+p.id,'Answer copied. Paste it in the X chat.');open();}]:['Open chat',open],more:[ld&&canEdit()&&['Answered',()=>AK.leadSave(ld.id,{fields:{...(ld.fields||{}),x:{...xx,answered:new Date().toISOString()}}})],canEdit()&&['Call booked',()=>L.setStage(p.id,'Call booked','Call booked with '+p.first)],canEdit()&&['Close',()=>L.setStage(p.id,'Closed')]]});}
  const rp=N.rp||{};
  if(+rp.openN)out.push({t:'approve',plat:'X',name:'Replies on buyers’ posts',sub:(rp.doneN||0)+' of 30 done today',what:'Approve '+rp.openN+' replies',detail:'Replies to founders’ and creators’ posts, written for you',when:'',open:()=>nav('replies'),main:['Open',()=>nav('replies')]});
  for(const k of N.liWait)out.push({rm:rmFor(k.id),t:'approve',plat:'LinkedIn',name:k.name,sub:k.sub,fit:k.score,what:k.isFailed?'Didn’t go through':'Approve '+plainWords(k.msgKind||'message').toLowerCase(),detail:k.isFailed?k.status:k.msg,when:'',open:k.open,
    main:canEdit()?(k.isFailed?['Try again',k.retry]:['Approve',k.approve]):null,more:[canEdit()&&k.hasMsg&&['Skip',k.skip]]});
  for(const k of N.xWait)out.push({rm:rmFor(k.id),t:'approve',plat:'X',name:k.name,sub:k.sub,fit:k.score,what:k.isFailed?'Didn’t go through':'Approve first DM',detail:k.isFailed?k.status:k.msg,when:'',open:k.open,
    main:canEdit()?(k.isFailed?['Try again',k.retry]:['Approve',k.approve]):null,more:[canEdit()&&k.hasMsg&&['Skip',k.skip]]});
  for(const k of N.sigs)out.push({rm:rmFor(k.id),t:'approve',plat:'LinkedIn',name:k.name,sub:k.sub,fit:k.score,what:'New signal: '+String(k.kindLabel||'').replace(/^\S+\s/,''),detail:k.headline,when:k.when,open:k.open,
    main:canEdit()?['Add to outreach',k.add]:null,more:[canEdit()&&['Not a fit',k.trash]]});
  for(const t of N.tipItems)out.push({rm:rmFor(t.id),t:'hand',plat:'LinkedIn',name:t.name,sub:t.sub,what:'Send their 3 ideas',detail:t.meta,when:'',open:t.openLead,
    main:['Copy + open chat',()=>{t.copy();if(t.hasChat)t.openChat();}],more:[t.canEdit&&['Mark sent',t.markSent]]});
  for(const it of N.fol)out.push({rm:rmFor(it.id)||(/linkedin\.com\/in\//.test(it.link||'')?{link:it.link,name:it.name}:null),t:'hand',plat:it.chan==='WhatsApp'?'WhatsApp':it.plat,name:it.name,sub:it.sub,what:'Follow up on '+it.chan,detail:plainWords(it.why),when:'',open:it.hasLead?it.openLead:null,
    main:it.hasLink?[it.chan==='WhatsApp'?'WhatsApp':'Open',it.open]:null,more:[it.canSpoke&&['Done',it.spoke]]});
  return out.filter(o=>!gone(o.rm));});}
function pgNeeds(){
  const T=todos();const N=needs();const c=t=>T.filter(x=>x.t===t).length;
  const cur=V.f.needs||'all';const list=T.filter(x=>cur==='all'||x.t===cur);
  let h=head('Needs you','Everything waiting on you, every platform. Click a row to see the full message.');
  const bulk=cur==='approve'&&canEdit()?(N.liFound.hasAll?btn(N.liFound.allLabel+' on LinkedIn',N.liFound.all,'sm'):'')+(N.xReview.hasAll?btn(N.xReview.allLabel+' X DMs',N.xReview.all,'sm'):''):'';
  h+=tabsBar('needs',[['all','All',T.length],['answer','Answer',c('answer')],['approve','Approve',c('approve')],['hand','Send by hand',c('hand')],['catchup','Catch up',catchupRows().length]])+(bulk?'<div class="bar" style="margin-top:12px"><span class="sp"></span>'+bulk+'</div>':'');
  if(cur==='catchup')return h+catchupHtml();
  const TXT={answer:'Answer',approve:'Approve',hand:'By hand'};
  h+='<div style="margin-top:12px">'+table('needs:'+cur,[['Who','minmax(0,1.6fr)'],['To do','minmax(0,1.3fr)'],['Detail','minmax(0,2fr)'],['','auto']],
    list.map(x=>({open:x.open,cells:[pcell(x.name,x.sub,x.plat),'<div class="ell"><b class="todo-w">'+esc(x.what)+'</b></div>'+(cur==='all'?'<div class="meta">'+TXT[x.t]+(x.when?' · '+esc(x.when):'')+'</div>':x.when?'<div class="meta">'+esc(x.when)+'</div>':''),
      ell(String(x.detail||'').replace(/\s+/g,' '),'meta')+(x.fit?'<div>'+fitPill(x.fit)+'</div>':''),ACTS(x.main,x.more)+trashBtn(x.rm)]})),'Nothing waiting on you here. Nice.')+'</div>';
  return h;
}

/* ---------- Outbound ---------- */
/* ---------- Midbound ---------- */
/* ---------- Inbound ---------- */
/* ---------- Reply to their posts ---------- */
/* ---------- Pipeline: LinkedIn and X keep their own boards ---------- */
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
      +safe(()=>{const R=AK.BR.rows||[];const bo=((R.find(x=>x.day===(L.state||{}).briefDay)||R[0]||{}).data||{}).bots;if(!bo)return '';
        return '<div class="blk"><h3>Bots: what went out</h3><div class="rows card">'+bo.out.map(t=>'<div class="note" style="padding:6px 10px">'+esc(t)+'</div>').join('')+'</div>'
          +'<h3 style="margin-top:12px">'+(bo.broke.length?'What broke':'Nothing broke')+'</h3>'+(bo.broke.length?'<div class="rows card">'+bo.broke.map(t=>'<div class="note" style="padding:6px 10px;color:#b42318">'+esc(t)+'</div>').join('')+'</div>':'')
          +(bo.waiting?'<p class="note">'+bo.waiting+' answers or approvals wait for you in Needs you.</p>':'')+'</div>';},'')
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
const strip=cells=>'<div class="stats strip">'+cells.map(([l,v,d,c])=>'<div class="stat" style="--c:'+(c||'var(--fg)')+'"><div class="l"><i class="sd"></i>'+esc(l)+'</div><div class="v">'+esc(v)+'</div>'+(d?'<div class="d">'+esc(d)+'</div>':'')+'</div>').join('')+'</div>';
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
/* ---------- Post metrics ---------- */
/* ---------- Post ideas ---------- */
/* ---------- Bots ---------- */
function botsHealth(){
  const S=AK.LD.settings||{};const li=S.li_bot||{},lst=S.li_bot_status||{};const xs=(AK.XT.status||{}).x_bot||{},xst=(AK.XT.status||{}).x_bot_status||{};
  const seen=t=>{const v=ms(t);return v&&Date.now()-v<45*6e4;};
  const saveLi=patch=>AK.leadSettingSave('li_bot',{...(AK.LD.settings.li_bot||{}),...patch});
  const LT=AK.LBT.rows||[],byId=new Map((AK.LD.rows||[]).map(l=>[l.id,l]));
  const invWk=LT.filter(t=>t.kind==='invite'&&t.status==='sent'&&ms(t.sent_at)>wk()).length;
  const m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0);const notes=LT.filter(t=>t.kind==='invite'&&t.text&&t.status==='sent'&&ms(t.sent_at)>=m0.getTime()).length;
  const card=(plat,title,on,paused,lines,ctrls)=>'<div class="card bot"><div class="sec-h">'+platMark(plat)+'<h2>'+esc(title)+'</h2><span class="sp"></span>'+pill(paused?'Paused':on?'Running':'Not seen lately',paused?'warn':on?'ok':'bad')+'</div><div class="sec-b">'+lines.map(t=>'<div class="hl"><span class="dot"></span><span>'+t+'</span></div>').join('')+'<div class="under" style="margin-top:10px">'+ctrls+'</div></div></div>';
  let h='<p class="note" style="margin-top:0">The LinkedIn and X bots run inside your Chrome (the SOVE7GN Outreach Bot extension). They only send while Chrome is open.</p>';
  h+='<div class="grid2">'+card('LinkedIn','LinkedIn bot',seen(lst.seen),li.paused,[
      'Last checked in '+esc(since(lst.seen)||'never')+(lst.signed_in===false?' · <b>Chrome is signed out of LinkedIn</b>':''),
      'First messages: <b>'+(li.mode==='auto'?'sent on their own':'wait for your OK')+'</b>',
      'Connection requests this week: <b>'+invWk+' of '+(li.week_cap||150)+'</b> · notes this month: <b>'+notes+' of '+(li.notes_month||250)+'</b>',
      'Sending hours: '+esc(((li.hours||{}).from??8)+':00 to '+((li.hours||{}).to??20)+':00 Pacific (US), when SF / US / Canada are online; 60% on weekends'),
      ...(lst.last_error?['<span style="color:var(--bad)">Last problem: '+esc(String(lst.last_error).slice(0,140))+'</span>']:[])],
    canEdit()?btn(li.mode==='auto'?'Ask me first instead':'Send on its own',()=>saveLi({mode:li.mode==='auto'?'review':'auto'}),'sm')+btn(li.paused?'Resume':'Pause',()=>saveLi({paused:!li.paused}),li.paused?'pri sm':'sm ghost'):'')
    +card('X','X bot',seen(xst.seen),xs.paused,[
      'Last checked in '+esc(since(xst.seen)||'never'),'DMs: up to <b>'+(xs.cap||40)+' a day</b>, '+(xs.gap_min||12)+'+ min apart · replies on posts: up to <b>'+(xs.reply_cap||30)+' a day</b>',
      'Sending hours: '+esc((xs.from??8)+':00 to '+(xs.to??21)+':00 Pacific (US), when SF / US / Canada are online; 60% on weekends'),
      ...(ms(xs.cooldown_until)>Date.now()?['<span style="color:var(--warn)">X asked us to slow down: paused until '+esc(new Date(ms(xs.cooldown_until)).toLocaleString())+'</span>']:[]),
      ...(xst.last_error?['<span style="color:var(--bad)">Last problem: '+esc(String(xst.last_error).slice(0,140))+'</span>']:[])],
    canEdit()?btn(xs.paused?'Resume':'Pause',()=>AK.xtPause(!xs.paused),xs.paused?'pri sm':'sm ghost'):'')+'</div>';
  const J=(((AK.XT.status||{}).x_bot_status||{}).jobs)||{};const JN={linkedin:'LinkedIn check',dms:'Sending X DMs',replies:'Replies on posts',inbox:'Reading X replies',chat:'X chat access',reader:'Reading X posts'};
  if(Object.keys(J).length)h+='<h2 class="h2">X jobs in your Chrome</h2>'+table('xj',[['Job','minmax(0,1fr)'],['Last run','120px'],['What happened','minmax(0,2.4fr)']],Object.keys(JN).filter(k=>J[k]).map(k=>({open:null,cells:['<div class="pc"><span class="dot '+(J[k].ok?'ok':'warn')+'" style="margin:0"></span><b>'+esc(JN[k])+'</b></div>','<span class="meta">'+esc(since(J[k].at))+'</span>',ell(J[k].note||'','meta')]})),'');
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


/* ================= round 3 (16 Nov): colour, charts, the rich calendar and pipeline cards back from the old CRM ================= */

/* stage bar: where someone is, from found to client, on every platform together */
const STEPS=['Found','Reached','Connected','Messaged','Following up','Replied','Call booked','Client'];
const STEP_C=['#9AA0AA','#3B82F6','#0EA5E9','#6366F1','#F59E0B','#8B5CF6','#10B981','#059669'];
function stepOf(l,c){let i=0;
  if(l){const x=LIo(l),g=String(l.stage||'').toLowerCase();i=g==='won'?7:/call booked|proposal/.test(g)?6:(x.replied||g==='in talks')?5:+x.fu>0?4:x.dm?3:x.acc?2:x.req?1:0;
    if(l.source==='Instagram')i=Math.max(i,g==='won'?7:/call/.test(g)?6:/talk|repl|follow/.test(g)?5:3);}
  if(c){const s=c._status||'';const T=(IX().xt.get(c._row)||[]).filter(t=>t.status==='sent');const fu=T.some(t=>/^fu/.test(t.kind));
    const j=s==='Customer'?7:s==='Call booked'?6:s==='Replied'?5:(/FU/.test(s)||fu)?4:s==='Sent'||T.length?3:0;i=Math.max(i,j);}
  return i;}
const sbar=i=>'<div class="sb" title="'+esc(STEPS[i])+'"><div class="sb-t">'+STEPS.map((_,k)=>'<i style="background:'+(k<=i?STEP_C[i]:'var(--line)')+'"></i>').join('')+'</div><span style="color:'+STEP_C[i]+'">'+esc(STEPS[i])+'</span></div>';

/* latest update per person (events from every platform) */
function lastEv(){return memo('lastev',()=>{const m=new Map();for(const e of (AK.LD.events||[])){const p=m.get(e.lead_id);if(!p||ms(e.at)>ms(p.at))m.set(e.lead_id,e);}return m;});}
const EV_ICON={message:'✉',note:'✎',call:'☏',email:'@',meeting:'◷',stage:'→',created:'+',engaged:'♥'};
function latestTxt(l,c){const e=l?lastEv().get(l.id):null;
  let t=e?String(e.text||'').split('\n')[0].replace(/\s+/g,' '):'',at=e?e.at:'';
  if(c){const s=(IX().xt.get(c._row)||[]).filter(x=>x.status==='sent').sort((a,b)=>ms(b.sent_at)-ms(a.sent_at))[0];if(s&&ms(s.sent_at)>ms(at)){t=(s.kind==='dm'?'First DM sent on X':'X follow-up '+String(s.kind).replace('fu','')+' sent');at=s.sent_at;}}
  return t?'<div class="lt"><span>'+esc(t.slice(0,90))+'</span><span class="faint"> · '+esc(since(at))+'</span></div>':'<span class="faint">–</span>';}
function feed(leads,title){
  const ids=new Set(leads.map(l=>l.id));const E=(AK.LD.events||[]).filter(e=>ids.has(e.lead_id)&&e.kind!=='created').sort((a,b)=>ms(b.at)-ms(a.at)).slice(0,6);if(!E.length)return '';
  const byId=new Map(leads.map(l=>[l.id,l]));
  return '<div class="feed"><div class="feed-h"><span class="live"></span>'+esc(title||'Latest updates')+'</div>'+E.map(e=>{const l=byId.get(e.lead_id)||{};
    return '<button type="button" class="fe"'+act(()=>L.openLead(l.id))+'><span class="fe-i">'+(EV_ICON[e.kind]||'•')+'</span><b>'+esc(l.name||'Someone')+'</b><span class="ell meta">'+esc(String(e.text||'').split('\n')[0])+'</span><span class="faint">'+esc(since(e.at))+'</span></button>';}).join('')+'</div>';}

/* small charts, drawn as SVG */
function barChart(series,labels,h){h=h||120;const n=labels.length;const max=Math.max(1,...series.flatMap(s=>s.data));const W=100/n;
  return '<div class="chart"><svg viewBox="0 0 100 '+h+'" preserveAspectRatio="none" style="height:'+h+'px">'+labels.map((_,i)=>series.map((s,k)=>{const bw=W*0.7/series.length,x=i*W+W*0.15+k*bw,v=s.data[i]||0,bh=v/max*(h-6);
    return '<rect x="'+x.toFixed(2)+'" y="'+(h-bh).toFixed(2)+'" width="'+(bw*0.9).toFixed(2)+'" height="'+bh.toFixed(2)+'" rx="0.6" fill="'+s.c+'"><title>'+esc(labels[i]+': '+s.n+' '+v)+'</title></rect>';}).join('')).join('')
    +'</svg><div class="chart-x">'+labels.map((l,i)=>'<span>'+(i%2===0?esc(l):'')+'</span>').join('')+'</div><div class="legend">'+series.map(s=>'<span><i style="background:'+s.c+'"></i>'+esc(s.n)+'</span>').join('')+'</div></div>';}
const hbars=(rows,c)=>{const max=Math.max(1,...rows.map(r=>r.v));return '<div class="hb">'+rows.map(r=>'<div class="hb-r"'+(r.go?act(r.go):'')+'><div class="hb-l ell">'+r.l+'</div><div class="hb-b"><i style="width:'+(r.v/max*100).toFixed(1)+'%;background:'+(r.c||c)+'"></i></div><div class="hb-v">'+esc(r.vl||r.v)+'</div></div>').join('')+'</div>';};
const ring=(p,c,label)=>{const r=16,C=2*Math.PI*r,o=C*(1-Math.min(1,p));return '<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="'+r+'" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="20" cy="20" r="'+r+'" fill="none" stroke="'+c+'" stroke-width="5" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+o.toFixed(1)+'" transform="rotate(-90 20 20)"/><text x="20" y="23" text-anchor="middle" font-size="9" font-weight="600" fill="var(--fg)">'+esc(label)+'</text></svg>';};

/* colours for post tags */
const SLOT_C={'Account tag':'#DB2777','Founder':'#2563EB','Data & product':'#0D9488','AI tool':'#7C3AED','News':'#D97706','Article':'#475569','Shoutout':'#E11D48','Other':'#6B7280'};
const FUN={Reach:['TOFU','Get seen','#059669'],Trust:['MOFU','Build trust','#7C3AED'],Convert:['BOFU','Book calls','#EA580C']};
const tagp=(t,c)=>t?'<span class="tg" style="color:'+c+';background:'+c+'14;border-color:'+c+'33">'+esc(t)+'</span>':'';
const stp=st=>{const m={Posted:['#059669','Posted'],Scheduled:['#2563EB','Scheduled'],'Ready to post':['#D97706','Ready'],Draft:['#6B7280','Draft']}[st]||['#6B7280',st||'Draft'];return tagp(m[1],m[0]);};

/* ---------- Calendar: the full posts again, every platform on one week, drag a post to another day ---------- */
function pgCalendar(){
  const X=calData('X'),LI=calData('LinkedIn');const base=X||LI;if(!base)return head('Calendar','')+'<div class="empty">Loading…</div>';
  const cur=V.f.cal||'all';const days=((base.boards||[])[0]||{}).cols||[];
  const all=[];const cols=days.map((d,i)=>{const cards=[...(cur!=='LinkedIn'?calCards(X,i).map(c=>({...c,_p:'X'})):[]),...(cur!=='X'?calCards(LI,i).map(c=>({...c,_p:'LinkedIn'})):[])];cards.filter(c=>c.isCard).forEach(c=>all.push(c));return{d,i,cards,xcol:(((X||{}).boards||[])[0]||{cols:[]}).cols[i]};});
  const cnt=s=>all.filter(c=>c.st===s).length;
  let h=head('Calendar','Your posts for the week, LinkedIn and X together. Drag a post to another day; click Edit to change it.',
    btn('←',base.prev,'sm')+'<span class="wk"><b>'+esc(base.weekName)+'</b> <span class="meta">'+esc(base.label)+'</span></span>'+btn('→',base.next,'sm')+(base.weekName!=='This week'?btn('Today',base.now,'sm ghost'):''));
  h+='<div class="bar"><div class="chips">'+[['all','All'],['LinkedIn','LinkedIn'],['X','X']].map(([k,l])=>'<button type="button" class="chip'+(cur===k?' on':'')+'"'+act(()=>{V.f.cal=k;schedule();})+'>'+(k!=='all'?platMark(k)+' ':'')+esc(l)+'</button>').join('')+'</div><span class="sp"></span>'
    +'<span class="wsum">'+stp('Posted')+' '+cnt('Posted')+' &nbsp;'+stp('Scheduled')+' '+cnt('Scheduled')+' &nbsp;'+stp('Ready to post')+' '+cnt('Ready to post')+' &nbsp;'+stp('Draft')+' '+cnt('Draft')+'</span></div>';
  h+='<div class="week2" data-keep="week">'+cols.map(({d,i,cards,xcol})=>'<div class="day2'+(d.today?' today':'')+'" data-drop="'+i+'"><div class="day2-h"><b>'+esc(d.dow)+'</b><span>'+esc(d.date)+'</span>'+(d.today?'<span class="tg" style="color:#fff;background:var(--fg);border-color:var(--fg)">Today</span>':'')+'<span class="sp"></span><span class="faint">'+cards.filter(c=>c.isCard).length+'</span></div><div class="day2-b">'
    +cards.map(c=>c.isCard?calCardHtml(c):c.isSlot&&canEdit()&&c._p==='X'?'<button type="button" class="cs"'+act(cb(c.slotNew))+'>+ '+esc(c.slotLabel||'Post')+(c.slotHint?' <span class="faint">'+esc(c.slotHint)+'</span>':'')+'</button>':'').join('')
    +(xcol&&xcol.canAdd&&canEdit()&&cur!=='LinkedIn'?'<button type="button" class="cs"'+act(cb(xcol.add))+'>+ Add a post</button>':'')+'</div></div>').join('')+'</div>';
  return h;
}
function calCardHtml(c){
  const open=!!(V.calOpen||{})[c.id];const f=FUN[c.funnel]||null;const tiles=((c.stats||{}).tiles||[]).filter(t=>t.n&&t.n!=='–');
  const img=(c.media||[])[0];
  return '<div class="pc2'+(c.st==='Posted'?' done':'')+'"'+(c.drag==='true'&&canEdit()?' draggable="true" data-ds="'+esc(c.id)+'" data-dp="'+c._p+'"':'')+'>'
    +'<div class="pc2-t">'+platMark(c._p)+'<b>'+esc(c.time||'')+'</b>'+stp(c.st)+'<span class="sp"></span>'
    +(c.canTick?'<button type="button" class="tick'+(c.st==='Posted'?' on':'')+'" title="'+esc(c.tickTitle||'Mark as posted')+'"'+act(cb(c.tick))+'>✓</button>':'')+'</div>'
    +'<div class="pc2-tags">'+tagp(c.slot,SLOT_C[c.slot]||'#6B7280')+(f?'<span title="'+esc(f[1])+'">'+tagp(f[0]+' · '+f[1],f[2])+'</span>':'')+'</div>'
    +(img&&img.src?'<img class="pc2-img" src="'+esc(img.src)+'" alt="" loading="lazy"'+act(cb(img.open))+'>':'')
    +'<div class="pc2-x'+(open?' open':'')+'">'+esc(c.text||'(empty)')+'</div>'
    +(String(c.text||'').length>220?'<button type="button" class="more"'+act(()=>{V.calOpen={...(V.calOpen||{}),[c.id]:!open};schedule();})+'>'+(open?'Show less':'Read more')+'</button>':'')
    +(c.hasLink?'<div class="pc2-live"><span class="live"></span>'+(tiles.length?tiles.map(t=>'<span><b>'+esc(t.n)+'</b> '+esc(t.l)+'</span>').join(''):'<span>Live</span>')+'<button type="button" class="more"'+act(cb(c.openLink))+'>Open ↗</button></div>':'')
    +'<div class="pc2-a">'+btn(c.copyLabel||'Copy',c.copy,'sm')+btn('Edit',()=>{V.calEd=c.id;schedule();},'sm ghost')+'</div></div>';
}
function calEditHtml(){
  if(!V.calEd)return '';const f=calFind(V.calEd);if(!f){V.calEd=null;return '';}const c=f.c;const close=()=>{V.calEd=null;schedule();};const ro=!canEdit();
  const sel=(val,opts,fn)=>'<select class="in"'+chg(cb(fn))+(ro?' disabled':'')+'>'+opts.map(([v,l])=>'<option value="'+esc(v)+'"'+(String(v)===String(val||'')?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>';
  let b='<div class="kv">'
    +(c.canDate?'<label>Day</label><input class="in" type="date" value="'+esc(c.dateIso)+'"'+chg(cb(c.setDate))+(ro?' disabled':'')+'>':'')
    +'<label>Time (IST)</label><input class="in" value="'+esc(c.time||'')+'" placeholder="7:30 PM"'+inp(cb(c.setTime))+blur(cb(c.saveTime))+(ro?' disabled':'')+'>'
    +'<label>Status</label>'+sel(c.status,(c.stOpts||[]).map(o=>[o.v,o.v]),c.setStatus)
    +(c.setSlot?'<label>Type</label>'+sel(c.slot,['',...Object.keys(SLOT_C)].map(v=>[v,v||'–']),c.setSlot):'')
    +(c.setFunnel?'<label>Funnel</label>'+sel(c.funnel,[['','–'],['Reach','TOFU · Get seen'],['Trust','MOFU · Build trust'],['Convert','BOFU · Book calls']],c.setFunnel):'')+'</div>';
  b+='<div class="blk" style="margin-top:14px"><h3>Post</h3>'+ta(c.text,c.setText,c.saveText,12,c.txtRo?' readonly':'')+'</div>';
  if((c.media||[]).length)b+='<div class="blk"><h3>Media</h3><div class="chips">'+c.media.map(m=>'<img class="thumb" src="'+esc(m.src)+'" alt=""'+act(cb(m.open))+'>').join('')+'</div></div>';
  if(c.hasSug)b+='<div class="blk"><h3>Suggested image</h3><div class="bar"><img class="thumb" src="'+esc(c.sugThumb)+'" alt=""><span class="note">'+esc(c.sugName)+' · '+esc(c.sugWhy||'')+'</span>'+btn('Use it',c.useSug,'sm')+'</div></div>';
  if(c.canLink)b+='<div class="blk"><h3>Live link</h3><div class="bar"><input class="in" style="flex:1" placeholder="'+esc(c.linkPh||'Paste the post link')+'" value="'+esc(c.linkVal||'')+'"'+inp(cb(c.setLinkVal))+'>'+btn('Save link',c.saveLink,'sm')+'</div></div>';
  const acts=[btn(c.copyLabel||'Copy',c.copy,'pri sm'),c.canTick?btn(c.st==='Posted'?'Posted ✓ (undo)':'Mark as posted',c.tick,'sm'):'',c.canSched?btn(c.schedLabel,c.toggleSched,'sm'):'',
    c.canUp?'<label class="btn sm">'+esc(c.upLabel||'Add image')+'<input type="file" accept="image/*,video/*" hidden'+chg(cb(c.upload))+'></label>':'',c.hasLink?btn('Open live post',c.openLink,'sm ghost'):'',canEdit()&&c.remove?btn('Take off the calendar',()=>{c.remove();close();},'sm ghost'):''].join('');
  return '<div class="modal"'+act(e=>{if(e.target.classList.contains('modal'))close();},false)+'><div class="box"><div class="mh">'+platMark(f.plat)+'<h2>'+esc(c.dateLabel||'Post')+'</h2>'+stp(c.st)+'<span style="flex:1"></span>'+btn('Close',close,'sm ghost')+'</div><div class="mb">'+b+'<div class="under">'+acts+'</div></div></div></div>';
}
/* drag a post to another day: the shared calendar logic does the move */
document.addEventListener('dragstart',e=>{const t=e.target.closest&&e.target.closest('[data-ds]');if(!t)return;const f=calFind(t.dataset.ds);if(!f)return;V.dragging={id:t.dataset.ds,plat:t.dataset.dp};safe(()=>f.c.dragStart(e));t.classList.add('dragging');});
document.addEventListener('dragend',e=>{const t=e.target.closest&&e.target.closest('[data-ds]');const f=V.dragging&&calFind(V.dragging.id);if(f)safe(()=>f.c.dragEnd(e));if(t)t.classList.remove('dragging');V.dragging=null;document.querySelectorAll('.day2.over').forEach(x=>x.classList.remove('over'));setTimeout(render,30);});
document.addEventListener('dragover',e=>{const d=e.target.closest&&e.target.closest('[data-drop]');if(!d||!V.dragging)return;e.preventDefault();document.querySelectorAll('.day2.over').forEach(x=>{if(x!==d)x.classList.remove('over');});d.classList.add('over');});
document.addEventListener('drop',e=>{const d=e.target.closest&&e.target.closest('[data-drop]');if(!d||!V.dragging)return;e.preventDefault();d.classList.remove('over');
  const C=calData(V.dragging.plat);const col=(((C||{}).boards||[])[0]||{cols:[]}).cols[+d.dataset.drop];if(col&&col.drop)safe(()=>col.drop(e));});

/* ---------- Pipelines: compact cards with what matters ---------- */
const scoreC=n=>{n=parseFloat(n);return n>=8?['#047857','#D1FAE5']:n>=5?['#B45309','#FEF3C7']:['#6B7280','#F3F4F6'];};
function pgPipeline(){
  const cur=V.f.pipe||'LinkedIn';const P=L.allPeople();const min=+(V.f.min||0);
  let h=head('Pipelines','Every channel has its own board. Approve right on the cards; click a card for everything about them.',cur==='Table'&&canEdit()?btn('Export CSV',()=>exportCsv(),'sm'):'');
  h+=tabsBar('pipe',[['LinkedIn','LinkedIn'],['X','X'],['Instagram','Instagram'],['Email','Email',(AK.EM.leads||[]).filter(r=>r.stage==='ready').length||null],['Table','Everyone (table)']]);
  const fbar=(note)=>'<div class="bar" style="margin-top:12px"><span class="note">'+esc(note||'')+'</span><span class="sp"></span>'
    +(cur!=='Instagram'?'<div class="chips">'+[[0,'Any fit'],[5,'5+'],[7,'7+'],[8,'8+']].map(([v,l])=>'<button type="button" class="chip'+(min===v?' on':'')+'"'+act(()=>{V.f.min=v;schedule();})+'>'+l+'</button>').join('')+'</div>':'')
    +'<input class="in search" placeholder="Search" value="'+esc(V.q.pipe||'')+'"'+inp(e=>{V.q.pipe=e.target.value;})+chg(()=>schedule())+'></div>';
  const LIM={};['found','req','dm','fu1','fu2','fu3','fu4','fu5','fu6','fu7','talks','booked','won','lost','review'].forEach(k=>LIM[k]=400);
  if(cur==='LinkedIn'){const B=withState({lpExp:'',lpQ:V.q.pipe||'',lpMin:min,lpOut:false,lpLim:LIM},()=>safe(()=>L.liPipeVals(),{cols:[]}));h+=fbar(B.total+' people · '+(B.bot||''))+board(B,'li');}
  else if(cur==='X'){const xb=V.f.xboard||'new';const B=withState({xpExp:'',xpQ:V.q.pipe||'',xpMin:min,xpLim:LIM,xpBoard:xb},()=>safe(()=>L.xPipeVals(P),{cols:[]}));
    /* (19 Nov) two X boards: New (A/B cold DMs to people never DMed) and Old (the X sales sequence, same as LinkedIn) */
    h+='<div class="chips" style="margin-top:12px">'+(B.boards||[]).map(([k,l,n])=>'<button type="button" class="chip'+(xb===k?' on':'')+'"'+act(()=>{V.f.xboard=k;schedule();})+'>'+esc(l)+' <span class="faint">'+n+'</span></button>').join('')+'</div>';
    h+=fbar(xb==='old'?'People already on the X sales sequence: follow-ups on day 3, 5, 8 and 12 go out on their own':'A/B first DMs wait in To approve; one nudge on day 4')+board(B,'x');}
  else if(cur==='Instagram')h+=fbar('Instagram DMs, read every hour')+board(igBoard(),'ig');
  else if(cur==='Email')h+=pgEmail();
  else{const L2=leadsOpen().filter(l=>matchQ('tbl',l.name,l.company,l.source,l.stage));
    h+='<div class="bar" style="margin-top:12px"><span class="note">'+L2.length+' people</span><span class="sp"></span><input class="in search" placeholder="Search" value="'+esc(V.q.tbl||'')+'"'+inp(e=>{V.q.tbl=e.target.value;})+chg(()=>schedule())+'></div>';
    h+=table('tbl',[['Who','minmax(0,2fr)'],['Stage','170px'],['Latest','minmax(0,2fr)'],['Last touch','100px']],
      L2.sort((a,b)=>ms(b.last_touch||b.created_at)-ms(a.last_touch||a.created_at)).map(l=>({open:()=>L.openLead(l.id),cells:[pcell(l.name||'(no name)',[l.role,l.company].filter(Boolean).join(' · '),PLAT[l.source]?l.source:null),sbar(stepOf(l,xOf(l))),latestTxt(l,null),'<span class="meta">'+esc(whenTxt(l.last_touch||l.created_at))+'</span>']})),'Nobody matches.',60);}
  return h;
}

/* ---------- Outbound / Midbound / Inbound: stage bar + latest update on every person ---------- */
const COLS3=[['Who','minmax(0,1.7fr)'],['Found by','minmax(0,1fr)'],['Stage','170px'],['Latest update','minmax(0,2fr)'],['Fit','92px']];
function pgOutbound(){
  const rows=[];const usedX=new Set();
  for(const l of leadsOpen()){const s=srcOf(l);if(!OUT_SRC[s]||l.source!=='LinkedIn')continue;const c=xOf(l);if(c)usedX.add(c._key);rows.push({l,c,src:s});}
  for(const c of (AK.M.contacts||[]))if(!usedX.has(c._key))rows.push({c,src:'x'});
  // (18 Nov, Reyansh) X / LinkedIn switch: filters the numbers, the live activity and the table. A LinkedIn lead we also reached on X shows under both.
  const pf=V.f['plat:out']||'all',allN=rows.length,liN=rows.filter(r=>r.l).length,xN=rows.filter(r=>r.c).length;
  if(pf!=='all'){const keep=rows.filter(r=>pf==='LinkedIn'?!!r.l:!!r.c);rows.length=0;rows.push(...keep);}
  const lab=r=>r.src==='x'?'Found on X':OUT_SRC[r.src];const cnt={};for(const r of rows)cnt[r.src]=(cnt[r.src]||0)+1;
  const opts=[['all','All',rows.length],...Object.keys(OUT_SRC).map(k=>[k,OUT_SRC[k],cnt[k]||0]),['x','Found on X',cnt.x||0]];const cur=V.f.out||'all';
  const reached=rows.filter(r=>(r.l&&liReached(r.l))||xReached(r.c)).length,replied=rows.filter(r=>(r.l&&liReplied(r.l))||xReplied(r.c)).length;
  const calls=rows.filter(r=>(r.l&&isCallSt(r.l.stage))||(r.c&&r.c._status==='Call booked')).length,waitOk=rows.filter(r=>(r.l&&(IX().task.get(r.l.id)||{}).status==='review')||(r.c&&r.c._status==='To send')).length;
  const list=rows.filter(r=>(cur==='all'||r.src===cur)&&matchQ('out',r.l?r.l.name:'',r.l?r.l.company:'',r.c?r.c.Name:'',r.c?r.c.Company:''))
    .map(r=>({...r,fit:r.l?fitN(r.l):r.c._fit,step:stepOf(r.l,r.c),t:r.l?ms(LIo(r.l).last||LIo(r.l).req||r.l.created_at):0})).sort((a,b)=>b.step-a.step||(b.fit||0)-(a.fit||0)||b.t-a.t);
  const right=canEdit()?btn('Find more on X',()=>AK.xRun('x-leads'),'sm')+btn('Check funding news',()=>AK.liFunding(),'sm ghost'):'';
  let h=head('Outbound',INFO.outbound)+'<div style="margin:0 0 14px">'+tabsBar('plat:out',[['all','Both',allN],['LinkedIn','LinkedIn',liN],['X','X',xN]])+'</div>'+strip([['People found',String(rows.length),(cnt.x||0)+' on X · '+(rows.length-(cnt.x||0))+' on LinkedIn','#2563EB'],['Reached',String(reached),pct(reached,rows.length)+' of them','#0EA5E9'],['Replied',String(replied),'Reply rate '+pct(replied,reached),'#8B5CF6'],['Calls booked',String(calls),'from outbound','#10B981'],['Waiting for your OK',String(waitOk),'first touches','#F59E0B']]);
  h+=activityHtml('out',new Set(rows.map(r=>(r.l||leadForContact(r.c)||{}).id).filter(Boolean)),true,pf)+chipsBar('out',opts,right);
  h+=table('out',COLS3,list.map(r=>{const name=r.l?r.l.name:r.c.Name,sub=r.l?[r.l.role,r.l.company].filter(Boolean).join(' · '):[r.c.Role,r.c.Company].filter(Boolean).join(' · ');
    return{open:r.l?()=>L.openLead(r.l.id):()=>L.openC(r.c._key),cells:[pcell(name||'(no name)',sub,r.l?'LinkedIn':'X'),'<span class="meta">'+esc(lab(r))+'</span>',sbar(r.step),latestTxt(r.l||leadForContact(r.c),r.c),fitPill(r.fit)||'<span class="faint">–</span>']};}),'Nobody matches.');
  return h;
}
function pgInbound(){
  const rows=leadsOpen().filter(l=>{const k=srcOf(l);if(MID_SRC[k]||OUT_SRC[k])return false;return k==='inbound'||l.direction==='Inbound'||l.source==='Instagram';});
  const P=l=>l.source==='Instagram'?'Instagram':l.source==='LinkedIn'?'LinkedIn':l.source==='X'?'X':'Other';const cnt={};for(const l of rows)cnt[P(l)]=(cnt[P(l)]||0)+1;const cur=V.f.inb||'all';
  const iNew=rows.filter(l=>ms(l.created_at)>wk()).length,iTalk=rows.filter(l=>/in talks|replied|follow/i.test(l.stage||'')).length,iCalls=rows.filter(l=>isCallSt(l.stage)).length,iWon=rows.filter(l=>/^won$/i.test(l.stage||'')).length;
  const list=rows.filter(l=>(cur==='all'||P(l)===cur)&&matchQ('inb',l.name,l.company,l.instagram,l.source_detail)).sort((a,b)=>ms(b.last_touch||b.created_at)-ms(a.last_touch||a.created_at));
  let h=head('Inbound',INFO.inbound)+strip([['Came to us',String(rows.length),(cnt.Instagram||0)+' on Instagram','#059669'],['New this week',String(iNew),'','#DB2777'],['Talking',String(iTalk),'','#8B5CF6'],['Calls booked',String(iCalls),'','#10B981'],['Clients',String(iWon),'won from inbound','#047857']]);
  h+=activityHtml('inb',new Set(rows.map(l=>l.id)),false)+chipsBar('inb',[['all','All',rows.length],['LinkedIn','LinkedIn',cnt.LinkedIn||0],['Instagram','Instagram',cnt.Instagram||0],['X','X',cnt.X||0],['Other','Other',cnt.Other||0]]);
  h+=table('inb',[['Who','minmax(0,1.7fr)'],['How they came','minmax(0,1.5fr)'],['Stage','170px'],['Latest update','minmax(0,1.8fr)'],['Last touch','100px']],list.map(l=>({open:()=>L.openLead(l.id),
    cells:[pcell(l.name||l.instagram||'(no name)',[l.role,l.company].filter(Boolean).join(' · ')||(l.instagram?'@'+String(l.instagram).replace(/^@/,''):''),P(l)==='Other'?null:P(l)),ell(l.source_detail||l.source||'','meta'),sbar(stepOf(l,null)),latestTxt(l,null),'<span class="meta">'+esc(whenTxt(l.last_touch||l.created_at))+'</span>']})),'Nobody has come to us yet.');
  return h;
}

/* ---------- Reply to their posts: skimmable cards with who they are ---------- */
function pgReplies(){
  const rp=safe(()=>L.repliesVals(),{rows:[]});const li=safe(()=>L.lisVals(),{cards:[]});const cur=V.f.rep||'x';
  let h=head('Reply to their posts','Show up under the posts of the people we sell to. Automatic X replies are off: post them by hand from the Manual tab (same 30-a-day cap and checks).');
  h+=tabsBar('rep',[['x','X replies',rp.openN||0],['man','Manual',(AK.XG.rows||[]).filter(r=>r.source==='manual'&&/^(new|approved|sending|failed)$/.test(r.status)).length],['posted','Posted (live)',(AK.XG.rows||[]).filter(r=>/^(done|posted)$/.test(r.status)&&ms(r.done_at)>Date.now()-D).length],['li','LinkedIn comments',(li.cards||[]).filter(c=>c.isNew).length]]);
  if(cur==='posted')return h+postedHtml();
  if(cur==='man')return h+manualHtml();
  if(cur==='x'){const done=+(rp.doneN||0);
    h+='<div class="rp-top">'+ring(done/30,'#7C3AED',done+'/30')+'<div><b>'+done+' of 30 replies today</b><div class="note">'+esc(rp.botLine||'')+(rp.lastRun?' · '+esc(rp.lastRun):'')+'</div></div><span class="sp"></span>'
      +(rp.hasApproveAll&&canEdit()?btn(rp.approveAllLabel,rp.approveAll,'pri sm'):'')+btn(rp.runLabel||'Check X now',rp.run,'sm ghost')+'</div>';
    const rows=(rp.rows||[]);
    h+='<div class="rgrid">'+(rows.map(r=>{const hd=(String(r.sub).match(/@([A-Za-z0-9_]+)/)||[])[1]||'';const c=hd?IX().byH.get(hd.toLowerCase()):null;const isLead=/Lead/.test((r.kind||{}).label||'');
      const ctx=c?[c.Role,c.Company,c['Funding stage']?String(c['Funding stage']).split(/\s+[·–-]\s+/)[0]:'',xShort(c)!=='–'?'X: '+xShort(c):''].filter(Boolean).join(' · '):'';
      return '<div class="rc"><div class="rc-h">'+avatar(r.who,'X')+'<div class="rc-w"><b class="ell">'+esc(r.who)+'</b><span class="meta ell">'+esc(r.sub)+'</span></div><span class="sp"></span>'
        +tagp(isLead?'In our pipeline':'Creator',isLead?'#2563EB':'#7C3AED')+tagp(r.age&&r.age.label,/Fresh/.test((r.age||{}).label)?'#059669':'#6B7280')+'</div>'
        +(ctx?'<div class="rc-ctx">'+esc(ctx)+'</div>':'')+'<div class="rc-p">'+esc(r.text)+'</div>'
        +'<div class="rc-r"><span class="rc-l">Our reply</span>'+ta(r.draft,null,null,2,chg(e=>r.setDraft(e)))+'</div>'
        +'<div class="rc-a">'+(canEdit()?btn('Approve',r.approve,'pri sm'):'')+btn(r.mineLabel,r.mine,'sm')+(canEdit()?btn('Skip',r.skip,'sm ghost'):'')+'</div></div>';}).join('')||'<div class="tb"><div class="empty">'+esc(rp.noRowsText||'All caught up.')+'</div></div>')+'</div>'
      +(rp.hasMore?'<div style="margin-top:12px">'+btn('Show '+rp.moreN+' more',rp.more,'ghost sm')+'</div>':'');
  }else{
    h+='<div class="rp-top">'+ring((+li.done||0)/Math.max(1,+li.total||0),'#0A66C2',(li.done||0)+'/'+(li.total||0))+'<div><b>LinkedIn founder posts '+esc(li.dayLabel||'')+'</b><div class="note">A genuine comment on each gets them talking to us.</div></div><span class="sp"></span>'+(canEdit()?btn(li.running?'Finding posts…':'Find posts now',li.run,'sm ghost'):'')+'</div>';
    h+='<div class="rgrid">'+((li.cards||[]).map(c=>'<div class="rc" style="opacity:'+c.op+'"><div class="rc-h">'+avatar(c.author,'LinkedIn')+'<div class="rc-w"><b class="ell">'+esc(c.author)+'</b><span class="meta ell">'+esc(c.headline)+'</span></div><span class="sp"></span>'+tagp(c.when,'#6B7280')+'</div>'
      +'<div class="rc-p">'+esc(c.post)+'</div><div class="rc-r"><span class="rc-l">Our comment</span>'+ta(c.comment,c.onComment,c.saveComment,3)+'</div>'
      +'<div class="rc-a">'+(c.isNew?btn('Copy + open post',c.copy,'pri sm')+(canEdit()?btn('Done',c.done,'sm')+btn('Skip',c.skip,'sm ghost'):''):tagp(c.isDone?'Commented':'Skipped',c.isDone?'#059669':'#6B7280')+btn('Undo',c.undo,'sm ghost'))+'</div></div>').join('')||'<div class="tb"><div class="empty">'+esc(li.noneText)+'</div></div>')+'</div>'
      +'<p class="note" style="margin-top:14px">Comments on posts by people already in your pipeline are still in the current CRM. <button type="button" class="btn ghost sm"'+act(()=>openOld('LinkedIn','gtmEngage'))+'>Open ↗</button></p>';
  }
  return h;
}

/* ---------- Post ideas: our draft next to the post it copies ---------- */
function pgIdeas(embedded){
  const gr=safe(()=>L.growthVals(L.allPeople()),{})||{};
  const drafts=(AK.M.ours||[]).filter(p=>p['Our version']&&!/posted/i.test(p.Status||''));const next=safe(()=>AK.copyNext(15),[])||[];const asks=safe(()=>AK.founderAsks(),[])||[];
  const comps=(AK.M.comps||[]);const cur=V.f.ideas||'drafts';
  let h=embedded?'':head('Post ideas','Each draft next to the competitor post it copies, the best posts to copy next, and what to DM when someone comments a word.');
  h+=tabsBar('ideas',[['drafts','Drafts',drafts.length],['next','To copy next',next.length],['comps','Competitors',comps.length],['asks','Questions for the founders',asks.length],['kw','Comment-a-word DMs',(gr.kw||[]).length],['kit','Profile kit',(gr.kit||[]).length]]);
  h+='<div style="margin-top:14px">';
  const nums=t=>[['Views',AK.fmtK(safe(()=>AK.viewsOf(t),0)||0)],['Likes',t.Likes],['Replies',t.Replies]].filter(x=>x[1]&&x[1]!=='0').map(([l,v])=>'<span><b>'+esc(v)+'</b> '+l+'</span>').join('');
  if(cur==='drafts'){const list=V.more.dr?drafts:drafts.slice(0,20);
    h+='<div class="ideas">'+list.map(p=>{const o=safe(()=>AK.originalFor(p),null);const f=FUN[p.Funnel];
      return '<div class="idea"><div class="idea-h">'+platMark(/linkedin/i.test(p.Platform||'')?'LinkedIn':'X')+'<b>'+esc(p.Date||'')+'</b><span class="meta">'+esc(p['Time (IST)']||'')+'</span>'+tagp(p['Daily slot']||p['Post type'],SLOT_C[p['Daily slot']]||'#6B7280')+(f?tagp(f[0]+' · '+f[1],f[2]):'')+stp(/sched/i.test(p.Status||'')?'Scheduled':'Draft')+'<span class="sp"></span>'
        +btn('Copy ours',()=>L.copy(p['Our version'],'d'+p._row,'Draft copied.'),'sm')+(canEdit()&&!/sched/i.test(p.Status||'')?btn('Mark scheduled',()=>AK.saveScheduled(p,true),'sm ghost'):'')+'</div>'
        +'<div class="idea-b">'+(o?'<div class="side theirs"><div class="side-h">Their original · <b>'+esc(o.Competitor||o.Account||'')+'</b><span class="sp"></span>'+(o.Link?'<button type="button" class="lnk"'+act(()=>window.open(o.Link,'_blank','noopener'))+'>Open ↗</button>':'')+'</div><div class="side-n">'+nums(o)+'</div><div class="side-x">'+esc(o['Full text']||'')+'</div>'+(o['Why it worked']?'<div class="why">Why it worked: '+esc(o['Why it worked'])+'</div>':'')+'</div>':'')
        +'<div class="side ours"><div class="side-h">Our version</div><div class="side-x">'+esc(p['Our version'])+'</div>'+(p['What we changed']?'<div class="why">What we changed: '+esc(p['What we changed'])+'</div>':'')+'</div></div>'
        +((p['Media needed']||p['Founder question'])?'<div class="idea-f">'+(p['Media needed']?'<span>📷 '+esc(p['Media needed'])+'</span>':'')+(p['Founder question']?'<span>❓ '+esc(p['Founder question'])+'</span>':'')+'</div>':'')+'</div>';}).join('')+'</div>'+(drafts.length>20&&!V.more.dr?'<div style="margin-top:12px">'+btn('Show '+(drafts.length-20)+' more',()=>{V.more.dr=true;schedule();},'ghost sm')+'</div>':'');}
  if(cur==='next')h+='<div class="rgrid">'+next.map(t=>'<div class="rc"><div class="rc-h"><div class="rc-w"><b>'+esc(t.Competitor||'')+'</b><span class="meta">'+esc(t.Account||'')+(t['Post type']?' · '+esc(t['Post type']):'')+'</span></div><span class="sp"></span>'+tagp(t.Platform,t.Platform==='LinkedIn'?'#0A66C2':'#111')+'</div>'
    +'<div class="side-n" style="margin-top:8px">'+nums(t)+'</div><div class="rc-p">'+esc(t['Full text']||'')+'</div>'+(t['Why it worked']?'<div class="why">Why it worked: '+esc(t['Why it worked'])+'</div>':'')
    +'<div class="rc-a">'+btn('Copy',()=>L.copy(t['Full text'],'n'+t._row,'Post copied.'),'sm')+(t.Link?btn('Open ↗',()=>window.open(t.Link,'_blank','noopener'),'sm ghost'):'')+'</div></div>').join('')+'</div>';
  if(cur==='comps'){const posts=AK.M.theirs||[];const st=c=>{const P=posts.filter(t=>t.Competitor===c.Name);const v=P.map(t=>safe(()=>AK.viewsOf(t),0)||0);return{n:P.length,avg:v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):0};};
    const rows=comps.map(c=>({c,s:st(c)})).sort((a,b)=>b.s.avg-a.s.avg);
    h+='<div class="card sec-b" style="margin:0 0 14px"><h3 style="margin:0 0 10px;font-size:13px">Average views per post</h3>'+hbars(rows.slice(0,12).map(r=>({l:esc(r.c.Name),v:r.s.avg,vl:AK.fmtK(r.s.avg)})),'#7C3AED')+'</div>';
    h+=table('cmp',[['Competitor','minmax(0,1.4fr)'],['What they sell','minmax(0,2fr)'],['X followers','100px'],['LinkedIn','100px'],['Posts','70px'],['Best post type','minmax(0,1fr)']],rows.map(({c,s})=>({open:c.Website?()=>window.open(/^http/.test(c.Website)?c.Website:'https://'+c.Website,'_blank','noopener'):null,
      cells:['<b>'+esc(c.Name)+'</b>',ell(c['What they sell']||'','meta'),'<span class="num">'+esc(c['X followers']||'–')+'</span>','<span class="num">'+esc(c['LinkedIn followers']||'–')+'</span>','<span class="num">'+s.n+'</span>',ell(c['Best post type this month']||'','meta')]})),'No competitors yet.');}
  if(cur==='asks')h+=table('as',[['Question','minmax(0,3fr)'],['For the post','minmax(0,2fr)'],['','auto']],asks.map(a=>({open:null,cells:[ell(a.p['Founder question']),ell(String(a.p['Our version']||'').replace(/\s+/g,' '),'meta'),ACTS(['Copy',()=>L.copy(a.p['Founder question'],'q'+a.p._row,'Question copied.')])]})),'No questions waiting.');
  if(cur==='kw')h+=table('kw',[['When they comment','minmax(0,1.2fr)'],['DM them','minmax(0,3fr)'],['','auto']],(gr.kw||[]).map(k=>({open:null,cells:['<b>'+esc(k.word)+'</b><div class="meta ell">'+esc(k.label)+'</div>',ell(String(k.text).replace(/\s+/g,' '),'meta'),ACTS(['Copy DM',k.copy])]})),'None set.');
  if(cur==='kit')h+=table('kit',[['What','160px'],['Text','minmax(0,3fr)'],['','auto']],(gr.kit||[]).map(k=>({open:null,cells:['<b>'+esc(k.label)+'</b>',ell(k.text,'meta'),ACTS(['Copy',k.copy])]})),'');
  return h+'</div>';
}

/* ---------- Post metrics with charts ---------- */
function pgResults(){
  const xs=safe(()=>AK.trackedPosts(),[])||[],ls=safe(()=>AK.liTracked(),[])||[];const gr=safe(()=>L.growthVals(L.allPeople()),null);
  const all=[...xs.map(t=>({...t,plat:'X'})),...ls.map(t=>({...t,plat:'LinkedIn'}))].sort((a,b)=>(b.first||0)-(a.first||0));
  const week=all.filter(t=>(t.first||0)>=wk());const sum=(a,k)=>a.reduce((s,t)=>s+(+t[k]||0),0);
  const best=week.slice().sort((a,b)=>(b.eng||0)-(a.eng||0))[0];
  let h=head('Post metrics','How our posts do on LinkedIn and X. Click a post to open it.');
  h+=strip([['Posts this week',String(week.length),week.filter(t=>t.plat==='X').length+' on X · '+week.filter(t=>t.plat==='LinkedIn').length+' on LinkedIn','#2563EB'],
    ['X views this week',AK.fmtK(sum(week.filter(t=>t.plat==='X'),'views')),'All time '+AK.fmtK(sum(xs,'views')),'#7C3AED'],['Engagement this week',AK.fmtK(sum(week,'eng')),'Likes, replies, reposts','#DB2777'],
    ['X followers',gr?gr.now+' / '+gr.goal:'–',gr?gr.daysLeft+' days left · line says '+gr.onTrack:'','#059669'],['Best this week',best?AK.fmtK(best.eng||0):'–',best?String(best.text||'').replace(/\s+/g,' ').slice(0,50):'','#F59E0B']]);
  // charts: engagement per day by platform, followers, mix, top posts
  const days=[...Array(14)].map((_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-13+i);return d;});
  const byDay=(plat,k)=>days.map(d=>{const a=d.getTime(),b=a+D;return all.filter(t=>t.plat===plat&&t.first>=a&&t.first<b).reduce((s,t)=>s+(+t[k]||0),0);});
  const labels=days.map(d=>d.getDate()+' '+AK.MON[d.getMonth()]);
  h+='<div class="grid2 sec"><div class="card sec-b"><h3 class="ch">Engagement per day, last 14 days</h3>'+barChart([{n:'X',c:'#7C3AED',data:byDay('X','eng')},{n:'LinkedIn',c:'#0A66C2',data:byDay('LinkedIn','eng')}],labels,130)+'</div>'
    +'<div class="card sec-b"><h3 class="ch">X followers to 10K by 31 Dec</h3>'+(gr?'<div class="fol">'+ring(parseFloat(gr.pct)/100||0,'#059669',gr.pct)+'<div><div class="big">'+esc(gr.now)+' <span class="faint">/ '+esc(gr.goal)+'</span></div><div class="note">'+esc((gr.status||{}).label||'')+' · need '+esc(gr.perDay||gr.need||'')+'</div></div></div>'
      +'<div class="mini">'+(gr.bars||[]).map(b=>'<i style="height:'+esc(b.h)+'" title="'+esc(b.t)+'"></i>').join('')+'</div>':'')+'</div></div>';
  const NM={Reach:['TOFU · Get seen','#059669'],Trust:['MOFU · Build trust','#7C3AED'],Convert:['BOFU · Book calls','#EA580C']};
  h+='<div class="grid2 sec"><div class="card sec-b"><h3 class="ch">This week’s mix</h3>'+hbars(((gr||{}).mix||[]).map(m=>({l:esc((NM[m.k]||[m.k])[0]),v:+m.n,vl:m.n+' / '+m.tgt,c:(NM[m.k]||[0,'#6B7280'])[1]})),'#6B7280')+'</div>'
    +'<div class="card sec-b"><h3 class="ch">Top posts this week</h3>'+hbars(week.slice().sort((a,b)=>(b.eng||0)-(a.eng||0)).slice(0,6).map(t=>({l:platMark(t.plat)+' '+esc(String(t.text||'').replace(/\s+/g,' ').slice(0,46)),v:+t.eng||0,c:t.plat==='X'?'#7C3AED':'#0A66C2',go:t.link?()=>window.open(t.link,'_blank','noopener'):null})),'#7C3AED')+'</div></div>';
  const cur=V.f.res||'all';h+='<div style="margin-top:20px">'+tabsBar('res',[['all','All',all.length],['LinkedIn','LinkedIn',ls.length],['X','X',xs.length]])+'</div>';
  const list=all.filter(t=>cur==='all'||t.plat===cur);
  h+='<div style="margin-top:12px">'+table('res',[['Post','minmax(0,3fr)'],['Posted','110px'],['Views','80px'],['Engagement','100px'],['Per 1K views','100px']],list.map(t=>({open:t.link?()=>window.open(t.link,'_blank','noopener'):null,
    cells:['<div class="pc">'+platMark(t.plat)+ell(String(t.text||'').replace(/\s+/g,' ')||'(post)')+'</div>','<span class="meta">'+esc(t.first?AK.dayWord(new Date(t.first)):'–')+'</span>',
      '<span class="num">'+esc(t.views!=null?AK.fmtK(t.views):'–')+'</span>','<span class="num">'+esc(t.eng!=null?String(t.eng):'–')+'</span>',t.rate!=null?'<span class="num" style="color:'+(t.rate>=20?'#059669':t.rate>=8?'#B45309':'var(--muted)')+';font-weight:600">'+esc(String(Math.round(t.rate*10)/10))+'</span>':'<span class="faint">–</span>']})),'No posts tracked yet.')+'</div>';
  return h;
}


/* ================= round 4 (16 Nov): by hand, the bot flow map, reply answers on X, alerts ================= */

/* take someone over by hand: the bots stop messaging them (LinkedIn: li.stop "by hand"; X: DM result "By hand") */
const isHandLi=l=>LIo(l).stop==='by hand';
const isHandX=c=>!!c&&/^by hand/i.test(c['DM result']||'');
const contactByKey=k=>(AK.M.contacts||[]).find(c=>c._key===k)||null;
/* (16 Nov) Remove = into the Trash: the bots and the CRM never touch that person again (restore from Trash). */
const rmOfLead=l=>l?{lead_id:l.id,name:l.name,link:l.linkedin||'',x:l.x_handle||'',urn:((l.fields||{}).li||{}).urn||''}:null;
const rmOfContact=c=>{if(!c)return null;const ld=leadForContact(c);return {...(ld?rmOfLead(ld):{}),x:String(c['X handle']||(ld&&ld.x_handle)||'').replace(/^@/,''),name:c.Name||(ld&&ld.name)||''};};
const rmFor=id=>{const l=leadById(id);if(l)return rmOfLead(l);const c=contactByKey(id);return c?rmOfContact(c):null;};
const gone=rm=>!!rm&&AK.isRemoved(rm);
const rmBig=rm=>rm&&canEdit()?'<button type="button" class="hand"'+act(()=>{if(confirm('Remove '+(rm.name||'this person')+'? The bots and the CRM won’t touch them again. You can restore them from Trash.'))AK.removePerson(rm).then(ok=>{if(ok){if(L.state.lid)L.closeLead();L.setState({cid:null});schedule();}});})+'>🗑 Remove from CRM</button>':'';
/* ---------- Email pipeline (23 Nov): everyone contacted on LinkedIn/X also gets Emily's 7 emails once you Approve ---------- */
const EM_COLS=[['cand','Contacted · approve to email','#0E7490',r=>r.stage==='candidate'],['find','Finding email','#9A9EA7',r=>/^(new|found)$/.test(r.stage)],['ready','Needs a look','#A86200',r=>r.stage==='ready'],['approved','Approved · queued','#6D28D9',r=>r.stage==='approved'],
  ['seq','In the sequence','#3B6FD8',r=>r.stage==='active'],['done','Finished','#2F8F5B',r=>r.stage==='done'],
  ['replied','Replied · your move','#C2392F',r=>r.stage==='replied'],['stopped','Stopped / no email','#9A9EA7',r=>/^(stopped|skipped|no_email|rejected)$/.test(r.stage)]];
const emDay=x=>x?new Date(x).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}):'';
const emIn=x=>{const d=ms(x)-Date.now();if(!ms(x))return '';if(d<=0)return 'due now';return d<36e5?Math.max(1,Math.round(d/6e4))+'m':d<48*36e5?Math.round(d/36e5)+'h':Math.round(d/864e5)+'d';};
function emNext(r){
  if(r.stage==='candidate')return 'Approve to find their email and start the emails';
  if(r.stage==='new'||r.stage==='found')return r.error?r.error:'Approved: finding and verifying their email, then email 1 is queued';
  if(r.stage==='ready')return r.error?r.error:(r.warnings||[]).length?'Needs an edit before it can be queued':'Needs your OK';
  if(r.stage==='approved')return 'Email 1 goes from '+(r.inbox||'an inbox')+' in the next window';
  if(r.stage==='active')return 'Email '+(r.next_step-1)+' of 7 sent · next: email '+r.next_step+', '+emDay(r.next_due);
  if(r.stage==='done')return 'All seven sent';
  if(r.stage==='replied')return 'They replied: answer them';
  return r.stop_reason||r.error||'';
}
const emHold=r=>{const l=leadById(r.lead_id);return !!l&&isHandLi(l)&&/^(approved|active|new|found|ready)$/.test(r.stage);};
function emCard(r){
  const tone=r.stage==='ready'?['#FFFBEB','#B45309','#FDE68A']:r.stage==='replied'?['#FCE7E4','#C2392F','#F5C2BC']:['#ECFDF5','#047857','#A7F3D0'];
  const timer=/^(approved|active)$/.test(r.stage)&&r.next_due?'<span class="eta" style="background:'+tone[0]+';color:'+tone[1]+';border-color:'+tone[2]+'" title="'+esc(new Date(r.next_due).toLocaleString())+'">⏱ '+esc(emIn(r.next_due))+'</span>':'';
  return '<div class="kc"'+act(()=>{V.emOpen=r.id;V.emE=null;schedule();})+'><div class="kc-t"><b style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.name)+'</b>'+timer+'</div>'
    +'<div class="meta note">'+esc([r.role,r.company].filter(Boolean).join(' · '))+'</div>'
    +(r.email?'<div class="meta note">'+esc(r.email)+(r.verify_result==='ok'?' · <span style="color:#1F8A4C">✓ verified</span>':'')+'</div>':'')
    +'<div class="kc-one">'+esc(emHold(r)?'✋ On hold: you took them over by hand. No email goes out until you resume.':emNext(r))+'</div>'
    +((r.warnings||[]).length&&r.stage==='ready'?'<div class="note" style="color:var(--warn);font-size:11.5px">⚠ '+esc(r.warnings[0])+'</div>':'')
    +'<div class="note" style="font-size:11.5px;margin-top:2px">'+esc(r.via||('via '+(r.channel==='x'?'X':'LinkedIn')))+' · '+esc(emDay(r.first_touch_at))+'</div>'
    +(r.stage==='candidate'&&canEdit()?'<div style="display:flex;gap:6px;align-items:center;margin-top:4px"><label'+act(()=>{})+' style="display:flex;gap:5px;align-items:center;font-size:12px;cursor:pointer"><input type="checkbox" '+((V.emSel||{})[r.id]?'checked ':'')+inp(e=>{V.emSel=V.emSel||{};if(e.target.checked)V.emSel[r.id]=1;else delete V.emSel[r.id];schedule();})+'> Select</label><span style="flex:1"></span>'+btn('Approve',()=>AK.emCall('approve',{id:r.id}).then(x=>{if(x)L.toast('Approved. Finding '+r.name.split(' ')[0]+'’s email now; email 1 is queued once it is verified.');}),'pri sm')+'</div>':'')+'</div>';
}
function pgEmail(){
  const E=AK.EM;if(!E.loaded&&!E.loading)AK.emLoad();else if(E.loaded&&!E.loading&&Date.now()-E.at>60000)AK.emLoad();
  let h='';
  if(E.loaded&&E.missing)return '<div class="card" style="padding:16px;margin-top:12px"><b>The email tables aren’t set up yet.</b><div class="note">Apply supabase/migrations/20261123000001_email_pipeline.sql.</div></div>';
  if(E.err&&E.loaded)return '<div class="card" style="padding:16px;margin-top:12px;color:var(--bad)">Couldn’t load the email pipeline: '+esc(E.err)+'</div>';
  if(!E.loaded)return '<div class="empty" style="padding:60px 0">Loading the email pipeline…</div>';
  const rows=E.leads||[],open=V.emOpen&&rows.find(r=>r.id===V.emOpen),st=E.stats||{},cfg=E.cfg||{},paused=cfg.paused!==false;
  if(open)return emDetail(open);
  const cap=(st.cap||{});
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:12px">'
    +'<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:6px"><b>Email sending</b><div>'+(paused?'<span class="pill" style="background:#FDF1DE;color:#A86200">■ Paused: nothing sends</span>':'<span class="pill" style="background:#E5F5EB;color:#1F8A4C">● Running</span>')+'</div>'
      +'<div class="note">Only people you Approve get emails. '+esc(st.window||'Mon to Fri, 8:00 to 17:00 in their time zone')+', 10 to 20 minutes apart per inbox.</div>'
      +(canEdit()?'<div>'+(paused?btn('Resume sending',()=>{if(confirm('Start sending approved emails from the 4 Emily inboxes?'))AK.emCall('resume',{}).then(r=>{if(r)L.toast('Email sending is on.');});},'pri sm'):btn('Pause sending',()=>AK.emCall('pause',{}).then(r=>{if(r)L.toast('Email sending paused.');}),'sm'))+'</div>':'')+'</div>'
    +'<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:4px;font-size:13px"><b>Daily limit per inbox</b><div style="font-size:22px;font-weight:600">'+esc(cap.cap!=null?cap.cap:(cfg.cap_steps||[5])[0])+' <span class="note" style="font-weight:400">a day each · '+esc(((cap.cap||(cfg.cap_steps||[5])[0])*4))+' in total</span></div>'
      +'<div class="note">Ramp: '+esc((cfg.cap_steps||[5,10,15,20,25]).join(' → '))+', a step every '+esc(cfg.step_days||4)+' days from the first send'+(cap.held?'. <b style="color:var(--warn)">Held a step back: '+esc(cap.why)+'.</b>':'. '+esc(cap.why||''))+'</div>'
      +'<div class="note">Verification credits left: '+esc(st.mv_credits!=null?st.mv_credits:'?')+'</div></div>'
    +'<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:3px;font-size:13px"><b>The rules</b><div class="note">7 plain-text emails (business days 0, 2, 4, 6, 8, 11, 14), same thread, same inbox. A reply on email, LinkedIn or X stops everything. A bounce or a “no” blocks the address for good. US contacts only, one person per company, verified addresses only. New people start their emails at most '+esc(cfg.intake_per_day!=null?cfg.intake_per_day:0)+' a day (follow-ups are on top).</div></div></div>';
  h+='<div class="card sec-b" style="margin-top:12px;padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px"><thead><tr style="text-align:left;color:var(--muted)"><th style="padding:8px 12px">Inbox</th><th style="padding:8px 12px">Today</th><th style="padding:8px 12px">Sent (30d)</th><th style="padding:8px 12px">Replies</th><th style="padding:8px 12px">Bounces</th><th style="padding:8px 12px">Next send</th><th style="padding:8px 12px">Status</th></tr></thead><tbody>'
    +(((st.inboxes&&st.inboxes.length?st.inboxes:(E.inboxes||[]).map(b=>({addr:b.addr,paused:b.paused,paused_reason:b.paused_reason,has_password:true,last_error:b.last_error,next_send_at:b.next_send_at,sent_today:0,sent_30d:0,replies_30d:0,bounces_30d:0,bounce_pct:0})))).map(b=>'<tr style="border-top:1px solid var(--line)"><td style="padding:8px 12px"><b>'+esc(b.addr)+'</b></td><td style="padding:8px 12px">'+b.sent_today+'/'+esc(cap.cap!=null?cap.cap:5)+'</td><td style="padding:8px 12px">'+b.sent_30d+'</td><td style="padding:8px 12px">'+b.replies_30d+'</td><td style="padding:8px 12px">'+b.bounces_30d+(b.sent_30d?' ('+b.bounce_pct+'%)':'')+'</td><td style="padding:8px 12px">'+(b.next_send_at&&ms(b.next_send_at)>Date.now()?'in '+esc(emIn(b.next_send_at)):'—')+'</td><td style="padding:8px 12px">'
      +(b.paused?'<span style="color:var(--bad)">Paused: '+esc(b.paused_reason||'')+'</span> '+(canEdit()?btn('Resume',()=>AK.emCall('resume_inbox',{addr:b.addr}),'sm'):''):!b.has_password?'<span style="color:var(--warn)">App password not set</span>':b.last_error?'<span style="color:var(--warn)" title="'+esc(b.last_error)+'">Check: '+esc(b.last_error.slice(0,40))+'</span>':'<span style="color:#1F8A4C">Ready</span>')+'</td></tr>').join('')||'<tr><td colspan="7" class="note" style="padding:12px">Loading…</td></tr>')+'</tbody></table></div>';
  h+='<div class="bar" style="margin-top:12px"><span class="note">'+rows.length+' people · everyone we send a LinkedIn invite or an X DM to lands in the first column; Approve and the bot finds and verifies their email, then runs the seven emails</span><span class="sp"></span>'+btn('Refresh',()=>AK.emLoad(),'sm ghost')+'</div>';
  const sel=Object.keys(V.emSel||{}).filter(id=>rows.some(r=>r.id===id&&r.stage==='candidate'));
  h+='<div class="board2">'+EM_COLS.map(([id,name,dot,f])=>{const cs=rows.filter(f),shown=id==='cand'?cs.slice(0,80):cs;
    const tools=id==='cand'&&cs.length&&canEdit()?'<div style="display:flex;gap:6px;flex-wrap:wrap;padding:6px 8px 0">'+btn(sel.length?'Clear':'Select all',()=>{V.emSel=sel.length?{}:Object.fromEntries(shown.map(r=>[r.id,1]));schedule();},'sm ghost')+(sel.length?btn('Approve '+sel.length+' selected',()=>{if(confirm('Approve '+sel.length+' people? Their emails are looked up and verified, then email 1 goes out over the next days at the daily start limit.'))AK.emCall('approve_many',{ids:sel}).then(x=>{if(x){V.emSel={};L.toast('Approved '+x.approved+(x.failed&&x.failed.length?' · '+x.failed.length+' could not be approved':'')+'.');}});},'pri sm'):'')+'</div>':'';
    return '<div class="bc"><div class="bc-h" style="border-top-color:'+dot+'"><b>'+esc(name)+'</b><span class="cnt">'+cs.length+'</span></div>'+tools+'<div class="bc-b" style="display:flex;flex-direction:column;gap:8px;padding:8px;overflow-y:auto">'+(cs.length?shown.map(emCard).join('')+(cs.length>shown.length?'<div class="note" style="text-align:center">+ '+(cs.length-shown.length)+' older, approve some to see more</div>':''):'<div class="kc-empty">—</div>')+'</div></div>';}).join('')+'</div>';
  return h;
}
function emDetail(r){
  const E=AK.EM,ed=r.stage==='ready'||r.stage==='approved',editable=ed&&!r.e1_at,X=V.emE&&V.emE.id===r.id?V.emE:null,d=X?X.d:(r.draft||{});
  const evs=(E.events||[]).filter(e=>e.email_lead_id===r.id);
  let h='<div class="bar" style="margin-top:12px">'+btn('← Back to the email board',()=>{V.emOpen=null;V.emE=null;schedule();},'sm')+'<b style="margin-left:8px">'+esc(r.name)+'</b><span class="sp"></span><span class="note">'+esc((EM_COLS.find(c=>c[3](r))||[,'Stopped'])[1])+'</span></div>';
  h+='<div class="card" style="padding:14px 16px;margin-top:8px;display:flex;flex-direction:column;gap:10px">'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:13px">'
    +'<div><span class="note">Person</span><div><b>'+esc(r.name)+'</b> · '+esc([r.role,r.company].filter(Boolean).join(' · '))+'</div>'+(r.linkedin?'<a href="'+esc(r.linkedin)+'" target="_blank" rel="noopener">LinkedIn ↗</a>':'')+'</div>'
    +'<div><span class="note">Email</span><div>'+esc(r.email||'not found yet')+'</div><div class="note">'+(r.verify_result==='ok'?'✓ verified by MillionVerifier':esc(r.verify_result?'Verification: '+r.verify_result:'not verified'))+(r.email_source?' · found via '+esc(r.email_source):'')+'</div></div>'
    +'<div><span class="note">Sending</span><div>'+esc(r.inbox||'inbox chosen at approval')+'</div><div class="note">Time zone '+esc(r.tz||'')+' · country '+esc(r.country||'')+'</div></div></div>'
    +'<div><span class="note">What we already said on '+esc(r.via||(r.channel==='x'?'X':'LinkedIn'))+' ('+esc(emDay(r.first_touch_at))+') — the emails must not repeat it</span><div style="white-space:pre-wrap;background:var(--sunk);border-radius:8px;padding:8px 10px;margin-top:4px">'+esc(r.first_touch_text||'(not recorded)')+'</div></div>';
  if((r.warnings||[]).length&&r.stage==='ready')h+='<div style="color:var(--warn);font-size:13px">'+r.warnings.map(w=>'⚠ '+esc(w)).join('<br>')+'</div>';
  if(r.error&&!/^(stopped|skipped)$/.test(r.stage))h+='<div class="note" style="color:var(--bad)">'+esc(r.error)+'</div>';
  if(r.stage==='replied')h+='<div style="border:1px solid #F5C2BC;border-radius:10px;padding:10px 12px;background:#FFF5F4"><b>They replied '+esc(emDay(r.replied_at))+'</b><div style="white-space:pre-wrap;margin-top:4px">“'+esc(r.reply_text||'')+'”</div><div class="note" style="margin-top:4px">All three channels have stopped. Answer them from '+esc(r.inbox||'the inbox')+'.</div></div>';
  if(r.stop_reason&&/^(stopped|skipped)$/.test(r.stage))h+='<div class="note">Stopped: '+esc(r.stop_reason)+'</div>';
  const N=[1,2,3,4,5,6,7],sd=(E.cfg&&E.cfg.steps_days)||[0,2,4,6,8,11,14],sentAt={1:r.e1_at,2:r.e2_at,3:r.e3_at,4:r.e4_at,5:r.e5_at,6:r.e6_at,7:r.e7_at},when=n=>sd[n-1]===0?'Day 0':'Day '+sd[n-1]+' (business days)';
  const subj=n=>n===1?(X?X.subject:r.subject):'Re: '+(X?X.subject:r.subject);
  if(r.draft&&(r.draft.e1||X)){
    if(editable&&X)h+='<label style="display:flex;flex-direction:column;gap:3px"><span class="note">Subject (emails 2 and 3 are “Re: …” in the same thread)</span><input class="in" value="'+esc(X.subject)+'"'+inp(e=>{X.subject=e.target.value;})+'></label>';
    h+=N.map(n=>'<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px"><div style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline"><b>Email '+n+'</b><span class="note">'+when(n)+' · subject: '+esc(subj(n))+'</span><span style="flex:1"></span>'
      +(sentAt[n]?'<span class="pill" style="background:#E5F5EB;color:#1F8A4C">✓ sent '+esc(new Date(sentAt[n]).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</span>':(r.stage==='active'&&r.next_step===n&&r.next_due?'<span class="pill">⏱ '+esc(emIn(r.next_due))+'</span>':''))+'</div>'
      +(editable&&X?'<textarea class="in" rows="8" style="width:100%;box-sizing:border-box;margin-top:6px;font-family:var(--mono);font-size:12.5px"'+inp(e=>{X.d['e'+n]=e.target.value;})+'>'+esc(d['e'+n]||'')+'</textarea>':'<div style="white-space:pre-wrap;margin-top:6px;background:var(--sunk);border-radius:8px;padding:8px 10px">'+esc(d['e'+n]||'')+'</div>')+'</div>').join('');
  }
  if(canEdit()){
    h+='<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">';
    if(editable&&X)h+=btn('Save changes',()=>AK.emCall('edit',{id:r.id,draft:{subject:X.subject,...X.d}}).then(x=>{if(x){V.emE=null;L.toast(x.voided?'Saved. The approval was cleared: approve again.':'Saved.');}}),'pri sm')+btn('Cancel',()=>{V.emE=null;schedule();},'sm');
    else if(editable)h+=btn('Edit the emails',()=>{V.emE={id:r.id,subject:r.subject,d:Object.fromEntries(N.map(n=>['e'+n,(r.draft||{})['e'+n]]))};schedule();},'sm');
    if(r.stage==='candidate')h+=btn('Approve: find their email and start the emails',()=>AK.emCall('approve',{id:r.id}).then(x=>{if(x){L.toast('Approved. Email 1 is queued once their address is verified.');V.emOpen=null;schedule();}}),'pri sm');
    if(r.stage==='ready'&&!X)h+=btn('Approve all seven emails',()=>AK.emCall('approve',{id:r.id}).then(x=>{if(x){L.toast('Approved. Email 1 goes from '+x.inbox+' in the next sending window.');V.emOpen=null;schedule();}}),'pri sm');
    const ld=leadById(r.lead_id);if(ld&&!/^(replied|stopped|skipped|done|no_email|rejected)$/.test(r.stage))h+=handBtn(isHandLi(ld),()=>{handLi(ld,!isHandLi(ld));setTimeout(schedule,400);});
    if(!/^(replied|stopped|skipped|done|no_email|rejected)$/.test(r.stage))h+=btn(r.e1_at?'Stop the sequence':'Skip this person',()=>{if(confirm(r.e1_at?'Stop the remaining emails to '+r.name+'?':'Skip '+r.name+'? No email will be sent.'))AK.emCall('skip',{id:r.id}).then(x=>{if(x){V.emOpen=null;schedule();}});},'sm ghost');
    h+='</div>';
  }
  h+='<div><b>History</b>'+(evs.length?evs.map(e=>'<div style="display:flex;flex-wrap:wrap;gap:4px 10px;font-size:13px;border-top:1px solid var(--line);padding:5px 0"><span style="font-family:var(--mono);min-width:130px">'+esc(new Date(e.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</span><b style="min-width:90px">'+esc(e.kind)+(e.step?' '+e.step:'')+'</b><span class="note">'+esc(e.inbox||'')+' '+esc(e.detail&&e.detail.result?e.detail.result:e.detail&&e.detail.why?e.detail.why:'')+'</span></div>').join(''):'<div class="note">Nothing yet.</div>')+'</div>';
  return h+'</div>';
}
function pgTrash(){
  const R=(AK.RM.rows||[]);let h=head('Trash','People you removed. The bots and the CRM don’t touch them. Restore puts them back where they were.');
  h+='<div style="margin-top:12px">'+table('trash',[['Who','minmax(0,1.6fr)'],['Removed','minmax(0,1fr)'],['How we knew them','minmax(0,1.6fr)'],['','auto']],
    R.map(r=>({open:r.lead_id?()=>L.openLead(r.lead_id):null,cells:[pcell(r.name||r.x||r.li_pid||'Someone','',r.x&&!r.li_urn&&!r.li_pid?'X':'LinkedIn'),'<div class="meta">'+esc(since(r.removed_at))+(r.removed_by?' · '+esc(String(r.removed_by).split('@')[0]):'')+'</div>',
      '<div class="meta ell">'+esc([r.li_pid?'linkedin.com/in/'+r.li_pid:'',r.x?'@'+r.x:'',r.why].filter(Boolean).join(' · ')||'–')+'</div>',canEdit()?btn('Restore',()=>AK.restorePerson(r.id),'sm'):'']})),'The Trash is empty.')+'</div>';
  return h;}
function trashBtn(rm,fn){if(!canEdit()||(!rm&&!fn))return '';
  return '<button type="button" class="trash" title="'+(fn?'Delete (into the Trash)':'Remove '+esc(rm.name||'them')+': into the Trash, and the bots never touch them again')+'"'+act(()=>{if(fn)return fn();if(confirm('Remove '+(rm.name||'this person')+'? The bots and the CRM won’t touch them again. You can restore them from Trash.'))AK.removePerson(rm);})+'>🗑</button>';}
const leadById=id=>(AK.LD.rows||[]).find(l=>l.id===id)||null;
function leadForContact(c){if(!c)return null;const h=String(c['X handle']||'').replace(/^@/,'').toLowerCase();return (AK.LD.rows||[]).find(l=>!l.archived&&h&&String(l.x_handle||((l.fields||{}).li_icp||{}).x||'').replace(/^@/,'').toLowerCase()===h)||null;}
const LABEL_C={interested:['Interested','#059669'],question:['Asked a question','#2563EB'],not_now:['Not now','#D97706'],not_interested:['Not interested','#DC2626'],other:['Replied','#7C3AED']};

/* new replies pop up (and as desktop notifications when those are on) */
function replyAlerts(){
  const E=(AK.LD.events||[]).filter(e=>e.kind==='message'&&/^Replied on (LinkedIn|X)/.test(e.text||''));
  if(!AK.leadsState().loaded)return;
  if(!V.seenRep){V.seenRep=new Set(E.map(e=>e.id));return;}
  const fresh=E.filter(e=>!V.seenRep.has(e.id)&&!String(e.id).startsWith('tmp'));fresh.forEach(e=>V.seenRep.add(e.id));if(!fresh.length)return;
  const e=fresh[0];const l=leadById(e.lead_id)||{};const msg=(l.name||'Someone')+' '+String(e.text).replace(/:\s*“[\s\S]*$/,'').replace(/^Replied/,'replied');
  setTimeout(()=>L.toast(msg+(fresh.length>1?' (+'+(fresh.length-1)+' more)':'')+'. The answer is ready in Needs you.'),50);
  try{if(AK.NT&&AK.NT.desk&&typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('New reply',{body:msg});}catch(_){}
}

/* ---------- top bar: search and refresh on the right, menu under the brand ---------- */
function tbarHtml(){
  return '<div class="tbar"><span class="sp"></span><button type="button" class="tb-s"'+act(openSearch)+'>⌕ <span>Search people, companies, pages</span><kbd>Ctrl K</kbd></button>'
    +'<button type="button" class="tb-i" title="Refresh: get the latest numbers, replies and leads'+(AK.lastUpdate()?' (updated '+esc(AK.ago(AK.lastUpdate()))+')':'')+'"'+act(()=>{AK.refresh();L.toast('Getting the latest numbers, replies and leads.');})+'>↻</button></div>';
}
function brandMenu(){
  if(!V.bmenu)return '';
  const it=(ic,l,fn)=>'<button type="button"'+act(()=>{V.bmenu=false;fn();schedule();})+'><span>'+ic+'</span>'+esc(l)+'</button>';
  return '<div class="bmenu">'+it('⚒','Settings',()=>nav('settings'))+it('🗑','Trash',()=>nav('trash'))+it('⧉','Open the old CRM',()=>window.open('../old/','_blank','noopener'))+(AK.canEdit()?it('⎋','Sign out',()=>AK.signOut()):'')+'</div>';
}

/* ---------- Bots: the whole flow, step by step, with a pen on every message ---------- */
const X_FU_DEFAULT=["Hey {first}, sharing a short video we made: https://youtu.be/gTgn6jZaj7w\n\nWe got one of the YC companies we work with 100K views on X and 30 enterprise calls booked in a week. If this sounds interesting, would love your thoughts, and to work together.",
  "Curious, if you could fix one thing this quarter, is it getting found, getting replies, or getting calls booked?","Happy to send over 3 quick ideas for {company}'s inbound here in text if a call is too much this week. Want them?",
  "No worries if the timing's off, {first}. Would next week work better for a quick chat? https://cal.com/sove7gn-gtm/30min","Last nudge from me, {first}. If inbound becomes a priority, here's the link: https://cal.com/sove7gn-gtm/30min. Rooting for {company}."];
const CLOSE_DEFAULT="No worries at all {first}, I won't bother you again. In case it's useful later: we built the whole GTM engine for Aktoria (a YC company) and got them 30+ sales calls in 2 weeks, all organic. Feel free to reach out anytime.";
function editOpen(title,hint,val,save,max){V.edit={title,hint,val:String(val||''),save,max};schedule();}
function editHtml(){
  const e=V.edit;if(!e)return '';const close=()=>{V.edit=null;schedule();};
  return '<div class="modal"'+act(ev=>{if(ev.target.classList.contains('modal'))close();},false)+'><div class="box"><div class="mh"><span class="pen on">✎</span><h2>'+esc(e.title)+'</h2><span style="flex:1"></span>'+btn('Close',close,'sm ghost')+'</div><div class="mb">'
    +(e.hint?'<p class="note" style="margin-top:0">'+esc(e.hint)+'</p>':'')+'<textarea class="in" id="edit-ta" rows="9"'+inp(ev=>{V.edit.val=ev.target.value;const c=document.getElementById('edit-n');if(c)c.textContent=ev.target.value.length+(e.max?' / '+e.max:'');})+'>'+esc(e.val)+'</textarea>'
    +'<div class="under"><span class="count" id="edit-n">'+e.val.length+(e.max?' / '+e.max:'')+'</span><span class="sp"></span>'+btn('Cancel',close,'sm ghost')+(canEdit()?btn('Save',()=>{const v=(document.getElementById('edit-ta')||{}).value;if(e.max&&v.length>e.max){L.toast('That’s over '+e.max+' characters.',null,true);return;}e.save(v);V.edit=null;L.toast('Saved. Messages not sent yet use the new text.');schedule();},'pri sm'):'')+'</div></div></div></div>';
}
function flowStep(o){ // {who:'bot'|'you'|'them'|'end', t, d, when, msg, edit, extra}
  const W={bot:['Bot','#4F46E5'],you:['You','#D97706'],them:['They','#7C3AED'],end:['End','#6B7280'],win:['Win','#059669']}[o.who]||['Bot','#4F46E5'];
  return '<div class="fs" style="--fc:'+W[1]+'"><div class="fs-dot">'+esc(o.ic||'•')+'</div><div class="fs-b"><div class="fs-h"><span class="tg" style="color:'+W[1]+';background:'+W[1]+'14;border-color:'+W[1]+'33">'+W[0]+'</span><b>'+esc(o.t)+'</b>'+(o.when?'<span class="faint">'+esc(o.when)+'</span>':'')+'<span class="sp"></span>'
    +(o.edit&&canEdit()?'<button type="button" class="pen" title="Edit"'+act(o.edit)+'>✎</button>':'')+'</div>'+(o.d?'<div class="fs-d">'+esc(o.d)+'</div>':'')
    +(o.msg!=null?'<div class="fs-m"'+(o.edit?act(o.edit):'')+'>'+esc(o.msg||'(empty: click the pen to write it)')+'</div>':'')+(o.extra||'')+'</div></div>';
}
function rulesHtml(){
  const R={...(AK.leadSetting('reply_rules')||{})};const def={interested:'In talks',question:'In talks',not_now:'Cold lead',not_interested:'Lost',other:'In talks'};
  const save=(k,patch)=>{const cur=AK.leadSetting('reply_rules')||{};AK.leadSettingSave('reply_rules',{...cur,[k]:{...(cur[k]||{}),...patch}});};
  const ST=(AK.leadSetting('stages')||[]).map(s=>s.name);
  return '<div class="rules">'+Object.keys(LABEL_C).map(k=>{const r=R[k]||{};const lc=LABEL_C[k];const send=r.send||'review';
    return '<div class="rule" style="--fc:'+lc[1]+'"><div class="rule-h"><b>'+esc(lc[0])+'</b></div>'
      +'<label class="note">Move them to</label><select class="in"'+chg(e=>save(k,{stage:e.target.value}))+(canEdit()?'':' disabled')+'>'+ST.map(n=>'<option'+((r.stage||def[k])===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select>'
      +'<label class="note">The answer</label><select class="in"'+chg(e=>save(k,{send:e.target.value}))+(canEdit()?'':' disabled')+'>'+[['review','Waits for my OK'],['auto','Goes out on its own'],['off','Only a draft on their card']].map(([v,l])=>'<option value="'+v+'"'+(send===v?' selected':'')+'>'+l+'</option>').join('')+'</select>'
      +(k==='not_interested'?'<div class="fs-m" style="margin-top:8px"'+act(()=>editOpen('Closing message (they said no)','Sent when someone says no thanks. {first} and {company} fill in.',R.close_text||CLOSE_DEFAULT,v=>{const cur=AK.leadSetting('reply_rules')||{};AK.leadSettingSave('reply_rules',{...cur,close_text:v});}))+'>'+esc(R.close_text||CLOSE_DEFAULT)+' <span class="pen sm">✎</span></div>'
        :'<div class="note" style="margin-top:8px">'+(k==='interested'?'If they said yes to the 3 ideas, the answer is their 3 ideas. Otherwise a short answer with the booking link.':k==='not_now'?'Thanks them and checks back in a month.':'A short answer written for them.')+'</div>')+'</div>';}).join('')+'</div>';
}
/* (16 Nov) LinkedIn sequence v2: no greetings, one question per message, help before any ask, no booking link until they reply.
   Same defaults as li-bot (V2_DEFAULT); edits save to li_bot.v2. */
const LI_V2_DEFAULT={first:"Here's the first one, the one I'd do this week.\n\n{idea1}\n\nQuick q so the other two actually land: what part of lead gen are you still doing yourself that you wish you weren't?",
  fu:["Curious, if you could fix one thing this quarter, is it getting found, getting replies, or getting calls booked?",
    "Said I'd send the other two, so here they are regardless.\n\n{idea2}\n\n{idea3}\n\nNo ask, just thought they'd be useful for {company}.",
    "Had a founder in almost exactly your spot a few months back, still doing all the lead gen themselves. We put their founder content and warm signal DMs on autopilot: 100K views on X and 30 enterprise calls in a week.\n\nHappy to walk you through exactly how it was set up, whether or not you ever work with us.",
    "Doesn't look like the timing's right, so I'll stop here rather than clog your inbox. If inbound ever becomes the priority, just say the word and I'll pick it back up."]};
function liV2Steps(li,saveLi){
  const v=li.v2||{};const first=v.first||LI_V2_DEFAULT.first;const fu=LI_V2_DEFAULT.fu.map((d,i)=>String((v.fu||[])[i]||d));
  const save=(k,val)=>{const cur=(AK.LD.settings.li_bot||{}).v2||{};saveLi('v2',{...cur,[k]:val});};
  const tip='{idea1}, {idea2}, {idea3} are their 3 ideas (written for each person). {company} is their company, {company_s} is "Acme’s", {is_company} is "is Acme" (or "are you" when we don’t know it). No greetings, one question at most.';
  const DAYS=[['Day 3','The question on its own'],['Day 5','Ideas 2 and 3, nothing asked'],['Day 8','A client story'],['Day 12','The clean close']];
  return flowStep({who:'bot',ic:'✉',t:'Idea 1 + one question',when:'The moment they accept',d:'Sent on its own. No greeting, no link.',msg:first,edit:()=>editOpen('Idea 1 + one question',tip,first,val=>save('first',val))})
    +fu.map((t,i)=>flowStep({who:'bot',ic:String(i+1),t:DAYS[i][1],when:DAYS[i][0]+' after they accept, if no reply',msg:t,edit:()=>editOpen(DAYS[i][1]+' ('+DAYS[i][0]+')',tip,t,val=>{const a=fu.slice();a[i]=val;save('fu',a);})})).join('')
    +flowStep({who:'you',ic:'☏',t:'The call ask, only after they reply',d:'Worth a quick 15 minutes? If it’s not a fit, I’ll tell you straight. Does Tuesday 4pm or Wednesday 11am IST work better? Two real times, never a cold booking link. Written into the answer in Needs you.'});
}
function pgBots(){
  const cur=V.f.bots||'li';
  let h=head('Bots','How the bots work, step by step. Click ✎ on any message to change it; every message not sent yet uses the new text.');
  h+=tabsBar('bots',[['li','LinkedIn flow'],['x','X flow'],['posts','Replies on posts'],['replies','When someone replies'],['health','Status and activity']]);
  h+='<div style="margin-top:16px">';
  const li=AK.LD.settings.li_bot||{};const saveLi=(k,v)=>{const c=AK.LD.settings.li_bot||{};AK.leadSettingSave('li_bot',{...c,[k]:v});};
  const auto=li.mode==='auto';
  if(cur==='li'){
    h+='<div class="flow">'
      +flowStep({who:'bot',ic:'⌕',t:'Find people who fit',d:'Every morning: founders who just raised, launched or are hiring for growth, our own search, founder lists, and everyone who liked or commented on our posts. Each is checked against who we sell to.',when:'7:00 to 9:30 IST',edit:()=>editOpen('Who we sell to','The bots judge everyone against this. Plain words.',(AK.leadSetting('automation')||{}).icp,v=>{const a=AK.leadSetting('automation')||{};AK.leadSettingSave('automation',{...a,icp:v});})})
      +flowStep({who:'you',ic:'✓',t:auto?'First touches go out on their own':'You approve the first touch',d:auto?'The bot sends connection requests without asking. Switch to "Ask me first" any time.':'Requests wait in Needs you and on the LinkedIn pipeline. This is the only step that needs you.',
        extra:canEdit()?'<div class="under">'+btn(auto?'Ask me first instead':'Let it send on its own',()=>saveLi('mode',auto?'review':'auto'),'sm')+'</div>':''})
      +flowStep({who:'bot',ic:'+',t:'Connection request with a note',when:'Up to '+(li.week_cap||150)+' a week, '+(li.notes_month||250)+' notes a month',msg:li.note||'',edit:()=>editOpen('Connection note','Goes with the request. 300 characters max. {first} and {company} fill in.',li.note,v=>saveLi('note',v),300)})
      +flowStep({who:'them',ic:'?',t:'They accept',d:'Not accepted in 3 weeks: the request is withdrawn and they leave the pipeline.'})
      +liV2Steps(li,saveLi)
      +flowStep({who:'them',ic:'↩',t:'They reply',d:'The bot stops at once, sorts the reply and writes the answer. See "When someone replies".',extra:'<div class="under">'+btn('Reply rules',()=>{V.f.bots='replies';schedule();},'sm')+'</div>'})
      +flowStep({who:'win',ic:'☏',t:'Call booked',d:'From cal.com: they move to Call booked and the call prep is written within 15 minutes.'})
      +flowStep({who:'end',ic:'×',t:'No reply by day 12',d:'They move to Cold lead and nothing more is sent.'})+'</div>'
      +'<p class="note" style="margin-top:14px">This is the only LinkedIn sequence now. The old one is stopped: people it reached stay where they are and the bot sends them nothing more.</p>';}
  if(cur==='x'){const T=(AK.M.templates||[]).filter(t=>t.Opener);const xs=(AK.XT.status||{}).x_bot||{};const fu=X_FU_DEFAULT.map((d,i)=>String(((xs.fu||[])[i])||d));
    const saveX=a=>{const c=(AK.XT.status||{}).x_bot||AK.leadSetting('x_bot')||{};AK.leadSettingSave('x_bot',{...c,fu:a});AK.XT.status.x_bot={...c,fu:a};};
    const tplStep=(field,label,when)=>flowStep({who:'bot',ic:'✉',t:label,when,extra:'<div class="tpls">'+T.map(t=>'<div class="tpl"><div class="tpl-h"><b>'+esc(t.Intent||t.ID)+'</b><span class="faint">'+esc((t.Sent||0)+' sent · '+(t['Reply rate']||'–')+' replies')+'</span><span class="sp"></span>'+(canEdit()?'<button type="button" class="pen"'+act(()=>editOpen(label+': '+(t.Intent||t.ID),'Each new person gets the next script in turn. [first name], [company] and [hook] fill in.',t[field],v=>{if(v!==t[field])AK.saveTpl(t,{[field]:v});}))+'>✎</button>':'')+'</div><div class="fs-m">'+esc(t[field]||'')+'</div></div>').join('')+'</div>'});
    h+='<div class="flow">'
      +flowStep({who:'bot',ic:'⌕',t:'Find founders on X',d:'Founders who just raised, launched or are hiring for GTM, YC batches, and followers of our client’s founders. Each is checked against who we sell to.',when:'7:30 and 12:30 IST'})
      +flowStep({who:'you',ic:'✓',t:'You approve the first DM',d:'First DMs wait in Needs you and on the X pipeline (To approve).'})
      +tplStep('Opener','First DM','Up to '+(xs.cap||40)+' a day, '+(xs.gap_min||12)+'+ min apart')
      +tplStep('Follow-up 1 (day 3)','Follow-up 1','A day after, if no reply')+tplStep('Follow-up 2 (day 7)','Follow-up 2','A day after')
      +fu.map((t,i)=>flowStep({who:'bot',ic:String(i+3),t:'Follow-up '+(i+3),when:'A day after the last one',msg:t,edit:()=>editOpen('X follow-up '+(i+3),'{first} and {company} fill in.',t,v=>{const a=fu.slice();a[i]=v;saveX(a);})})).join('')
      +flowStep({who:'them',ic:'↩',t:'They reply',d:'The extension reads your X inbox every 10 minutes. A reply stops the follow-ups, gets sorted and the answer is written. See "When someone replies".',extra:'<div class="under">'+btn('Reply rules',()=>{V.f.bots='replies';schedule();},'sm')+'</div>'})
      +flowStep({who:'end',ic:'×',t:'No reply after follow-up 7',d:'They move to Closed.'})+'</div>';}
  if(cur==='posts'){const xs=(AK.XT.status||{}).x_bot||{};
    h+='<div class="flow">'+flowStep({who:'bot',ic:'⌕',t:'Find fresh posts by the people we sell to',d:'Founders in the pipeline and creators our buyers follow. Every 20 minutes in US daytime.'})
      +flowStep({who:'bot',ic:'✎',t:'Write a short reply for each',d:'Human, on topic, no pitch.'})
      +flowStep({who:'you',ic:'✓',t:'You approve, or reply yourself',d:'On Reply to their posts. Approve all works too.',extra:'<div class="under">'+btn('Open Reply to their posts',()=>nav('replies'),'sm')+'</div>'})
      +flowStep({who:'bot',ic:'♥',t:'The bot likes the post and replies',when:'Up to '+(xs.reply_cap||30)+' a day, 15+ min apart',d:'It replies on the post itself from your X tab, the same clicks you would make.'})
      +flowStep({who:'them',ic:'↩',t:'They reply to our reply',d:'They land in Midbound with a reply and a DM ready.'})+'</div>';}
  if(cur==='replies')h+='<p class="note" style="margin-top:0">When someone writes back on LinkedIn or X, the bot stops messaging them, sorts the reply into one of these, moves them in the pipeline and writes the answer. The answer shows in Needs you.</p>'+rulesHtml();
  if(cur==='health')h+=botsHealth();
  return h+'</div>';
}

/* ---------- Pipelines: wider cards, expand a column, ✋ on every card ---------- */
function board(B,plat){
  const cols=(B.cols||[]);const ex=V.pexp&&V.pexp.plat===plat?cols.find(c=>c.id===V.pexp.id):null;
  if(ex)return '<div class="bar" style="margin-top:12px">'+btn('← Back to the board',()=>{V.pexp=null;schedule();},'sm')+'<b style="margin-left:8px">'+esc(plainWords(ex.name))+'</b><span class="cnt">'+esc(ex.n)+'</span><span class="sp"></span>'+(ex.hasAll&&canEdit()?btn('Approve all',ex.all,'pri sm'):'')+'</div>'
    +'<div class="kgrid">'+(ex.cards||[]).map(k=>kcard(k,plat)).join('')+'</div>';
  return '<div class="board2" data-keep="board:'+plat+'">'+cols.map(c=>'<div class="bc"><div class="bc-h" style="border-top-color:'+esc(c.dot||'var(--faint)')+'"><b>'+esc(plainWords(c.name))+'</b><span class="cnt">'+esc(c.n)+'</span><span class="sp"></span>'
    +(c.hasBulk&&canEdit()?'<button type="button" class="lnk"'+act(cb(c.bulk))+'>'+esc(c.bulkLabel)+'</button>':c.hasAll&&canEdit()?'<button type="button" class="lnk"'+act(cb(c.all))+'>Approve all</button>':'')
    +'<button type="button" class="exp" title="Open the whole column"'+act(()=>{V.pexp={plat,id:c.id};schedule();})+'>⤢</button></div>'
    +(c.hint?'<div class="bc-hint">'+esc(plainWords(c.hint))+'</div>':'')
    +(c.msg?'<details class="bc-msg" onclick="event.stopPropagation()"><summary>The message</summary><div class="msgbox">'+esc(c.msg)+'</div></details>':'')
    +'<div class="bc-b" data-keep="bc:'+plat+':'+esc(c.id)+'">'
    +(c.cards||[]).slice(0,V.more['b:'+plat+c.id]?400:25).map(k=>kcard(k,plat)).join('')
    +((c.cards||[]).length>25&&!V.more['b:'+plat+c.id]?'<button type="button" class="lnk"'+act(()=>{V.more['b:'+plat+c.id]=true;schedule();})+'>Show '+((c.cards||[]).length-25)+' more</button>':'')
    +(!(c.cards||[]).length?'<div class="kc-empty">Nobody here</div>':'')+'</div></div>').join('')+'</div>';
}
// (18 Nov, Reyansh) Every card says where we pulled them from: a client's followers, a competitor's audience, a founder list, a post we commented on
function pulledFrom(l,c){
  if(l){const li=(l.fields&&l.fields.li)||{},sd=String(l.source_detail||'');const src=li.src||'';
    if(src==='comp'||li.comp)return 'Competitor: '+(li.comp?li.comp+' · ':'')+(sd.replace(/\s*\(competitor\)/i,'')||'their audience');
    if(src==='postcomment')return 'A post of theirs we commented on'+(li.post_kind==='raise'?' (their raise)':li.post_kind==='hiring'?' (hiring)':'');
    if(li.warm)return 'Client: follows '+li.warm+' (our client)'+(li.list?' · '+li.list:'');
    if(src==='list')return li.list||sd.split(':')[0]||'A founder list';
    if(src==='niche')return 'Commented on '+(li.post_author||'a founder')+'’s post';
    return sd?sd.replace(/\s+/g,' ').slice(0,90):'';}
  if(c){const sig=String(c['Signal (why now)']||''),seg=String(c['Segment']||'');
    let m=sig.match(/^Follows @(\w+) \(([^,)]+), our client\)/);if(m)return 'Client: follows @'+m[1]+' ('+m[2]+', our client)';
    m=sig.match(/^Follows @(\w+) \(([^,)]+), a competitor\)/);if(m)return 'Competitor: follows @'+m[1]+' ('+m[2]+')';
    m=sig.match(/^Replied to ([^:(]+)\(competitor\)/);if(m)return 'Competitor: replied to '+m[1].trim()+'’s post';
    if(/^(Follows|Engages with) /.test(seg))return seg;
    return seg&&!/^(9|10|8)$/.test(seg)?seg:'';}
  return '';
}
function kcard(k,plat){
  const sc=parseFloat(k.score);const C=scoreC(sc);
  const l=plat==='li'||plat==='ig'?leadById(k.id):null,c=plat==='x'?contactByKey(k.id):null;if(c&&gone(rmOfContact(c)))return '';const hand=l?isHandLi(l):c?isHandX(c):false;
  const chips=[hand?'<span class="tg" style="color:#B45309;background:#FFFBEB;border-color:#FDE68A">✋ You’re handling them</span>':'',k.fund?'<span class="tg" style="color:#1D4ED8;background:#EFF6FF;border-color:#BFDBFE">💰 '+esc(k.fund)+'</span>':'',k.acc?'<span class="tg" style="color:#C2410C;background:#FFF7ED;border-color:#FED7AA">'+esc(k.acc)+'</span>':'',
    k.loc?'<span class="tg">'+esc(k.loc)+'</span>':'',k.src?'<span class="tg" style="color:'+(k.bFg||'#475467')+';background:'+(k.bBg||'#F2F4F7')+'">'+esc(k.src)+'</span>':''].join('');
  return '<div class="k2'+(hand?' hand-on':'')+'"'+act(cb(k.open),false)+'><div class="k2-t"><b class="ell">'+esc(k.name)+'</b>'+(hand?'<span class="eta t-you" title="You’re handling them; the bots won’t message them.">✋ yours</span>':(k.eta||k.eta2)?'<span class="eta t-'+esc(k.eta?(k.etaTone||'go'):(k.etaTone2||'them'))+'" title="'+esc(k.eta?k.etaTitle||'':k.etaTitle2||'')+'">'+esc(k.eta||k.eta2)+'</span>':'<span class="eta t-them">⌛ waiting</span>')+'<span class="k2-r">'+(sc>0?'<span class="sc" style="color:'+C[0]+';background:'+C[1]+'" title="Fit out of 10">'+esc(String(k.score).replace('/10',''))+'</span>':'')
    +((l||c)&&plat!=='ig'?handBtn(hand,()=>l?handLi(l,!hand):handX(c,!hand),true):'')+trashBtn(l?rmOfLead(l):c?rmOfContact(c):null)+'</span></div>'
    +(k.sub?'<div class="ell k2-s">'+esc(k.sub)+'</div>':'')+((pf=>pf?'<div class="ell k2-s" style="color:#6941C6;font-size:12px" title="Where we pulled them from">↳ '+esc(pf)+'</div>':'')(pulledFrom(l,c)))+(k.one?'<div class="k2-o">'+esc(k.one)+'</div>':'')+(chips?'<div class="k2-c">'+chips+'</div>':'')
    +(k.status?'<div class="k2-st">'+esc(plainWords(k.status))+'</div>':'')
    +(k.next?(k.nextMsg?'<details class="k2-next" onclick="event.stopPropagation()"><summary>'+esc(k.next)+'</summary><div class="msgbox">'+esc(k.nextMsg)+'</div></details>':'<div class="k2-next">'+esc(k.next)+'</div>'):'')
    +(k.hasMsg&&canEdit()&&!hand?'<div class="k2-a">'+btn('Approve',k.approve,'pri sm')+btn('Skip',k.skip,'sm ghost')+'</div>':'')
    +(!k.hasMsg&&!k.isFailed&&canEdit()&&!hand&&/^(Writing the request|Looking them up)/.test(k.status||'')?'<div class="k2-a">'+btn('Write it now',()=>{AK.lbtRun();L.toast('Writing the request now. About 30 seconds, then Approve shows here.');},'sm')+'</div>':'')
    +(k.isFailed&&canEdit()?'<div class="k2-a">'+btn('Try again',k.retry,'sm')+'</div>':'')
    +(k.hasDraft?'<div class="k2-a">'+btn('Copy reply',k.copyDraft,'sm')+'</div>':'')+(k.hasTips?'<div class="k2-a">'+btn('Copy 3 ideas',k.copyTips,'sm')+'</div>':'')
    +(k.hasInmail?'<div class="k2-a">'+btn('InMail',k.inmail,'sm ghost')+'</div>':'')+'</div>';
}


/* ================= round 5 (16 Nov): hands off means hands off, live activity, Midbound = engagement only ================= */
const handBtn=(on,fn,small)=>'<button type="button" class="hand'+(on?' on':'')+(small?' sm':'')+'" title="'+(on?'You’re handling them. The bots won’t message them until you press Resume follow-ups.':'Take over by hand: the bots stop messaging them')+'"'+act(fn)+'>'+(small?(on?'▶':'✋'):on?'▶ Resume follow-ups':'✋ Take over by hand')+'</button>';
function handLi(l,on){if(!l||!canEdit())return;const x={...LIo(l)};const extra={};
  if(on){x.prev_stop=x.stop||null;x.stop='by hand';x.hand_at=new Date().toISOString();}
  else{delete x.stop;delete x.prev_stop;delete x.hand_at;if(x.replied){x.prev_replied=x.replied_last||x.replied;delete x.replied;delete x.replied_last;delete x.answered;if(/^in talks$/i.test(l.stage||''))extra.stage='Follow up';}}
  AK.leadSave(l.id,{fields:{...(l.fields||{}),li:x},...extra}).then(ok=>{if(!ok)return;L.toast(on?'You’re handling '+(l.name||'them')+'. The bots won’t message them.':'Follow-ups resumed for '+(l.name||'them')+'. The LinkedIn bot picks up where it left off.');});
  if(on){const ids=(AK.LBT.rows||[]).filter(t=>t.lead_id===l.id&&['review','ready'].includes(t.status)).map(t=>t.id);if(ids.length)AK.lbtSet(ids,{status:'skipped'});}
  AK.leadNote(l.id,'note',on?'Taken over by hand: the bots stopped.':'Follow-ups resumed: handed back to the bots.');}
function handX(c,on){if(!c||!canEdit())return;const cur=String(c['DM result']||'');const next=on?('By hand'+(cur&&!/^by hand/i.test(cur)?' · '+cur:'')):cur.replace(/^By hand( · you messaged them)?( · )?/i,'');
  AK.write(c,{'DM result':next},on?'Handling '+(c.Name||'them')+' by hand':'Follow-ups resumed for '+(c.Name||'them'),{quiet:true}).then(ok=>ok&&L.toast(on?'You’re handling '+(c.Name||'them')+'. The X bot won’t message them.':'Follow-ups resumed for '+(c.Name||'them')+' on X.'));
  if(on){const ids=(AK.XT.rows||[]).filter(t=>t.row===c._row&&['review','ready'].includes(t.status)).map(t=>t.id);if(ids.length)AK.xtSet(ids,{status:'skipped'});}
  const ld=leadForContact(c);if(ld&&isHandLi(ld)!==on)handLi(ld,on);}   /* the email bot reads the CRM lead: one switch stops X, LinkedIn and email */

/* live activity: every message the bots sent and every reply, newest first, for the people on this page */
const ACT_KIND=[['all','Everything'],['reply','They replied'],['answer','We answered'],['fu','Follow-ups'],['first','First messages'],['req','Requests'],['hand','You took over']];
const ACT_C={reply:['They replied','#7C3AED'],answer:['We answered','#059669'],fu:['Follow-up','#D97706'],first:['First message','#2563EB'],req:['Request','#0EA5E9'],hand:['You took over','#B45309'],other:['Sent','#6B7280']};
function activityHtml(key,ids,withBots,plat){
  const out=[];const byId=new Map((AK.LD.rows||[]).map(l=>[l.id,l]));
  for(const e of (AK.LD.events||[])){if(!ids.has(e.lead_id))continue;const t=String(e.text||'');let k=null;
    if(/^Replied on (LinkedIn|X)/.test(t))k='reply';else if(/^(Answered on|Sent the closing)/.test(t))k='answer';else if(/messaged them yourself|Taken over by hand/.test(t))k='hand';
    if(k){const l=byId.get(e.lead_id)||{};out.push({k,at:e.at,who:l.name||'Someone',plat:/on X|X\b/.test(t)?'X':l.source==='Instagram'?'Instagram':'LinkedIn',text:t.replace(/^[^:“]*[:“]\s*/,'').replace(/”$/,''),open:()=>L.openLead(l.id)});}}
  if(withBots)for(const e of (AK.NT.items||[])){if(!e.ok||/^Repl/.test(e.what||''))continue;if(e.lead&&!ids.has(e.lead))continue;const w=String(e.what||'');
    const k=/request/i.test(w)?'req':/follow/i.test(w)?'fu':/answer|closing/i.test(w)?'answer':/first|dm|message|ideas/i.test(w)?'first':'other';
    out.push({k,at:e.at,who:(e.lead&&(byId.get(e.lead)||{}).name)||(e.who!=='Someone'&&e.who)||'Someone',plat:e.chan==='X'?'X':'LinkedIn',text:e.text||e.sub||w,open:e.lead?()=>L.openLead(e.lead):null});}
  out.sort((a,b)=>ms(b.at)-ms(a.at));
  if(plat&&plat!=='all'){const keep=out.filter(x=>x.plat===plat);out.length=0;out.push(...keep);}
  const cur=V.f['act:'+key]||'all';const list=out.filter(x=>cur==='all'||x.k===cur);const n=V.more['act:'+key]?60:8;
  const cnt=k=>out.filter(x=>x.k===k&&ms(x.at)>Date.now()-D).length;
  return '<div class="feed act"><div class="feed-h"><span class="live"></span>Live activity<span class="faint" style="font-weight:400">· last 24 hours: '+cnt('reply')+' replied, '+cnt('answer')+' answered, '+cnt('fu')+' follow-ups, '+cnt('first')+' first messages</span></div>'
    +'<div class="chips" style="padding:2px 8px 6px">'+ACT_KIND.filter(([k])=>k==='all'||out.some(x=>x.k===k)).map(([k,l])=>'<button type="button" class="chip'+(cur===k?' on':'')+'"'+act(()=>{V.f['act:'+key]=k;schedule();})+'>'+esc(l)+'</button>').join('')+'</div>'
    +(list.length?list.slice(0,n).map(x=>{const c=ACT_C[x.k]||ACT_C.other;return '<button type="button" class="fe2"'+(x.open?act(x.open):'')+'><span class="faint fe2-t">'+esc(since(x.at))+'</span>'+platMark(x.plat)+'<b class="ell">'+esc(x.who)+'</b>'+tagp(c[0],c[1])+'<span class="ell meta">'+esc(String(x.text).replace(/\s+/g,' ').slice(0,140))+'</span></button>';}).join('')
      +(list.length>n?'<div style="padding:4px 8px">'+btn('Show more',()=>{V.more['act:'+key]=true;schedule();},'ghost sm')+'</div>':''):'<div class="empty" style="padding:12px">Nothing yet.</div>')+'</div>';
}

/* Midbound: only engagement. Who liked, commented, replied to or quoted our posts, followed, viewed, visited, or DMed us. */

/* ================= round 6 (16 Nov): catch up, Midbound with what they said, Clients, posted replies ================= */
const cleanName=n=>String(n||'').replace(/\s+(Premium|Verified)( Profile)?\b.*$/i,'').replace(/\s*[•·]?\s*(1st|2nd|3rd\+?)\s*$/i,'').trim()||String(n||'');

/* Midbound: one list for LinkedIn and X; each row says what they actually wrote, so you can decide: reply, DM or ignore */
/* (17 Nov) the old comment reader sometimes saved a person's headline as their comment (when LinkedIn repeated the name line) */
const nmKey=s=>String(s||'').replace(/\s+(Premium|Verified)\b.*$/i,'').replace(/\s*[•·]?\s*(1st|2nd|3rd\+?)\s*$/i,'').replace(/\s+/g,' ').trim().toLowerCase();
const fakeComment=(said,p)=>{said=String(said||'').trim();const hk=nmKey(p.headline);return !said||said===String(p.headline||'').trim()||(!!hk&&hk===nmKey(p.name)&&(/\s[|·]\s/.test(said)||/^[^.!?]{0,160}\b(founder|co-founder|ceo|cto|coo|engineer|director|head of|vp|manager|partner|consultant)\b[^.!?]*$/i.test(said)));};
function pgMidbound(){
  const rows=[];const nowT=Date.now();
  for(const x of safe(()=>L.socPeople(),[])||[]){const p=x.p;if(!['hot','warm'].includes(p.fit))continue;const cAny=x.acts.find(z=>z.kind==='commented');const c=x.acts.find(z=>z.kind==='commented'&&!fakeComment(z.said,p));const a=c||cAny||x.acts[0]||{};
    const nm=cleanName(p.name);const hl=p.headline&&cleanName(p.headline)!==nm?p.headline:[p.role,p.company].filter(Boolean).join(' · ');
    rows.push({plat:'LinkedIn',kind:cAny?'comment':'like',name:nm||'Someone',sub:hl,said:c?c.said:'',unread:!!cAny&&!c,idea:c&&c.reply_idea||'',post:(a.post||{}).text||'',postUrl:(a.post||{}).url||'',ideaKey:'li'+String(p.person_key||'').slice(-24),at:x.last,fit:p.fit,lead:p.lead_id,url:p.profile_url||'',person:p,
      extra:[x.liked?x.liked+(x.liked===1?' like':' likes'):'',x.commented?x.commented+(x.commented===1?' comment':' comments'):''].filter(Boolean).join(' · ')});}
  for(const l of leadsOpen()){const s=srcOf(l);if(!['viewed','site','magnet','inbound'].includes(s))continue;
    rows.push({plat:'LinkedIn',kind:s==='inbound'?'dm':s==='viewed'?'view':s==='site'?'site':'magnet',name:cleanName(l.name)||'Someone',sub:[l.role,l.company].filter(Boolean).join(' · '),said:LIo(l).reply_text||(s==='inbound'?l.source_detail||'':''),at:ms(l.created_at),lead:l.id,fitN:fitN(l),url:l.linkedin||''});}
  for(const e of (AK.M.engagers||[])){if((e.Status||'To message')!=='To message')continue;const how=String(e.How||'');
    const k=/quot/i.test(how)?'quote':/follow/i.test(how)?'follow':/tag|mention/i.test(how)?'mention':'comment';
    const at=e['Found on']?(Date.parse(String(e['Found on']).replace(/^(\d{1,2}) (\w{3}) (\d{4})/,'$2 $1 $3'))||0):0;
    rows.push({plat:'X',kind:k,name:e.Name||e.Handle,sub:'@'+String(e.Handle||'').replace(/^@/,'')+(e.Bio?' · '+e.Bio:''),said:e['What they said']||'',idea:k==='comment'||k==='quote'||k==='mention'?e['Our reply']||'':'',ideaKey:'eg'+e._row,post:e['Our post']||'',postUrl:e['Their link']||e['Our post link']||'',at,e,fitX:e.Fit});}
  const K={comment:'Commented or replied',like:'Liked',quote:'Quoted',follow:'Followed',mention:'Tagged or mentioned',dm:'DMed us',view:'Viewed profile',site:'Visited site',magnet:'Lead magnet'};
  const KC={comment:'#7C3AED',like:'#DB2777',quote:'#2563EB',follow:'#059669',mention:'#0EA5E9',dm:'#D97706',view:'#6B7280',site:'#6B7280',magnet:'#EA580C'};
  for(const r of rows)r.rm=r.lead?rmFor(r.lead):r.person?{lead_id:r.person.lead_id||null,name:r.name,link:r.url,urn:/^urn:|^ACo/i.test(String(r.person.person_key||''))?String(r.person.person_key).replace(/^urn:li:fsd_profile:/,''):''}:r.e?{x:String(r.e.Handle||'').replace(/^@/,''),name:r.name}:null;
  for(let i=rows.length-1;i>=0;i--)if(gone(rows[i].rm))rows.splice(i,1);
  const cnt={};for(const r of rows)cnt[r.kind]=(cnt[r.kind]||0)+1;const wkN=k=>rows.filter(r=>(!k||r.kind===k)&&r.at>nowT-7*D).length;
  const cur=V.f.mid||'comment';
  const list=rows.filter(r=>(cur==='all'||r.kind===cur)&&matchQ('mid',r.name,r.sub,r.said)).sort((a,b)=>(!!b.said-!!a.said)||(b.at||0)-(a.at||0));
  let h=head('Midbound','Everyone who engaged with us on LinkedIn and X. Read what they wrote, then reply, DM them or ignore. Good fits only.')
    +strip([['Engaged this week',String(wkN()),rows.length+' in total','#7C3AED'],['Comments and replies',String(cnt.comment||0),wkN('comment')+' this week','#7C3AED'],['Likes',String(cnt.like||0),wkN('like')+' this week','#DB2777'],
      ['Followed or quoted',String((cnt.follow||0)+(cnt.quote||0)),'','#059669'],['DMed us',String(cnt.dm||0),'','#D97706']]);
  h+=chipsBar('mid',[['comment',K.comment,cnt.comment||0],['all','All',rows.length],...Object.keys(K).filter(k=>k!=='comment').map(k=>[k,K[k],cnt[k]||0])]);
  h+='<div class="mrows">'+(list.slice(0,V.more.mid?400:40).map(r=>{const e=r.e;const reply=e&&e['Our reply']||'';
    const open=r.lead?()=>L.openLead(r.lead):null;
    const openC=()=>{const u=AK.safeUrl(r.postUrl);if(u)window.open(u,'_blank','noopener');};
    const acts=e?[btn(reply?'Copy reply & open':'Open their reply',()=>{if(reply)L.copy(reply,'eg'+e._row,'Reply copied. Paste it under their reply.');const u=AK.safeUrl(e['Their link']);if(u)window.open(u,'_blank','noopener');},'pri sm'),canEdit()?btn('DM them',()=>AK.engagerToPipeline(e),'sm'):'',canEdit()?btn('Ignore',()=>AK.saveEngager(e,'Dismissed'),'sm ghost'):'']
      :[r.postUrl?btn(r.idea?'Copy reply & open':r.kind==='comment'?'Open their comment':'Open our post',()=>{if(r.idea)L.copy(r.idea,r.ideaKey,'Reply copied. Paste it under their comment.');openC();},'pri sm'):'',r.url?btn('DM them',()=>window.open(r.url,'_blank','noopener'),'sm'):'',
        r.person&&!r.lead&&canEdit()?btn('Add to pipeline',()=>AK.personToLead(r.person),'sm'):'',r.person&&canEdit()?btn('Ignore',()=>AK.setPersonFit(r.person.platform,r.person.person_key,'not a fit'),'sm ghost'):''];
    const fitH=r.fitN?fitPill(r.fitN):r.fit?tagp(r.fit==='hot'?'Great fit':'Good fit',r.fit==='hot'?'#059669':'#2563EB'):r.fitX?tagp(r.fitX,/core|good/i.test(r.fitX)?'#2563EB':'#6B7280'):'';
    return '<div class="mrow"><div class="mrow-h">'+pcell(r.name,r.sub,r.plat)+'<span class="sp"></span>'+tagp(K[r.kind],KC[r.kind])+fitH+'<span class="faint" style="font-size:12px">'+esc(r.at?AK.ago(r.at):'')+'</span></div>'
      +(r.said?'<div class="mrow-said"><span class="faint" style="font-size:11.5px;font-weight:600;letter-spacing:.02em">'+(r.kind==='comment'?(r.plat==='X'?'THEY REPLIED':'THEY COMMENTED'):r.kind==='quote'?'THEY QUOTED':r.kind==='dm'?'THEY SAID':'THEY WROTE')+'</span><br>“'+esc(r.said)+'”</div>'
        :r.unread?'<div class="meta" style="margin-top:6px">They commented, but the comment text didn’t load. Open their comment to read it.</div>'
        :r.extra?'<div class="meta" style="margin-top:6px">'+esc(r.extra)+'</div>':'')
      +(r.idea?'<div class="mrow-said" style="border-left-color:#059669;background:rgba(5,150,105,.06)"><span style="font-size:11.5px;font-weight:600;letter-spacing:.02em;color:#059669">IDEA REPLY</span><br>'+esc(r.idea)+'</div>':'')
      +(r.post?'<div class="mrow-post">On our post: '+esc(String(r.post).replace(/\s+/g,' ').slice(0,140))+'</div>':'')
      +'<div class="mrow-a">'+acts.join('')+(open?btn('Open',open,'sm ghost'):'')+'<span class="sp"></span>'+trashBtn(r.rm)+'</div></div>';}).join('')||'<div class="tb"><div class="empty">Nobody here yet.</div></div>')+'</div>'
    +(list.length>40&&!V.more.mid?'<div style="margin-top:10px">'+btn('Show '+(list.length-40)+' more',()=>{V.more.mid=true;schedule();},'ghost sm')+'</div>':'');
  return h;
}

/* Needs you > Catch up: people in your last week of chats that the CRM doesn't reflect yet */
const rmOfCatch=it=>({lead_id:it.lead_id||null,name:it.name,urn:it.urn||'',link:it.url||'',x:it.plat==='X'?String(it.handle||'').replace(/^@/,''):''});
function catchupRows(){const cu=(AK.LD.settings||{}).catchup||{};return (cu.items||[]).filter(it=>!(V.cuDone||{})[it.key]&&!gone(rmOfCatch(it)));}
function catchupHtml(){
  const cu=(AK.LD.settings||{}).catchup||{};const items=catchupRows();
  const go=(it,action)=>{V.cuDone={...(V.cuDone||{}),[it.key]:true};schedule();AK.botCall('catchup_apply',{key:it.key,what:action}).then(r=>{if(r&&r.ok)L.toast(action==='add'?(it.name+' is in the pipeline. The bots take over from where the chat is.'):action==='trash'?'Moved to the bin.':'Ignored.');else{V.cuDone[it.key]=false;if(r)L.toast('Couldn’t do that: '+(r.error||'try again'),null,true);schedule();}});};
  const W={'They wrote, no answer yet':'#7C3AED','They wrote, they’re not in the CRM':'#7C3AED','They wrote, the CRM shows no reply':'#7C3AED','Connected, no message yet':'#0EA5E9'};
  let h='<div class="bar" style="margin-top:12px"><span class="note">Your last week of LinkedIn and X chats, checked against the CRM'+(cu.at?' · updated '+esc(since(cu.at)):'')+'. Add to pipeline puts them where the chat really is, so the bots take over from there.</span><span class="sp"></span>'+(canEdit()?btn('Scan my chats again',()=>{AK.botCall('catchup_scan',{}).then(()=>L.toast('Scanning. LinkedIn chats are read by the extension within a few minutes.'));},'sm'):'')+'</div>';
  if(!items.length)return h+'<div class="tb"><div class="empty">Nothing to catch up on'+(cu.li_at?'.':'. The first LinkedIn scan runs a few minutes after the extension starts.')+'</div></div>';
  return h+'<div class="mrows">'+items.map(it=>'<div class="mrow"><div class="mrow-h">'+pcell(cleanName(it.name),[it.role,it.company].filter(Boolean).join(' · ')||it.headline,it.plat)+'<span class="sp"></span>'+tagp(it.why,W[it.why]||'#D97706')
    +(it.stage?tagp('CRM: '+plainWords(it.stage),'#6B7280'):'')+'<span class="faint" style="font-size:12px">'+esc(it.last_at?since(it.last_at):'')+'</span></div>'
    +((it.what||it.funding||it.headline)?'<div class="mrow-bg">'+[it.what?esc(it.what):'',it.funding?'💰 '+esc(it.funding):'',it.headline&&!it.role?esc(it.headline):''].filter(Boolean).join(' · ')+'</div>':'')
    +(it.last_text?'<div class="mrow-said"><b>'+(it.last_from==='me'?'You':'They')+':</b> '+esc(it.last_text)+'</div>':'')
    +((it.n_me||it.n_them)?'<div class="meta" style="margin-top:4px">You sent '+(it.n_me||0)+' · they sent '+(it.n_them||0)+'</div>':'')
    +'<div class="mrow-a">'+(canEdit()?btn('Add to pipeline',()=>go(it,'add'),'pri sm')+btn('Ignore',()=>go(it,'ignore'),'sm ghost'):'')
    +(it.url?btn('Open chat ↗',()=>window.open(it.url,'_blank','noopener'),'sm ghost'):it.href?btn('Open chat ↗',()=>window.open('https://x.com'+it.href,'_blank','noopener'),'sm ghost'):'')+(it.lead_id?btn('Open',()=>L.openLead(it.lead_id),'sm ghost'):'')+'<span class="sp"></span>'+trashBtn(null,()=>{if(!confirm('Remove '+(it.name||'this person')+'? The bots and the CRM won’t touch them again. You can restore them from Trash.'))return;AK.removePerson(rmOfCatch(it)).then(ok=>{if(ok)go(it,'ignore');});})+'</div></div>').join('')+'</div>';
}

/* Clients: wins, losses, MRR, cost and margin, payments (after Drona's Closed and Health pages) */
const money=n=>'$'+Math.round(+n||0).toLocaleString('en-US');
function clientsAll(){return (AK.leadSetting('clients')||[]).slice();}
function saveClients(arr){return AK.leadSettingSave('clients',arr);}
/* (16 Nov) Clients in USD or INR. Each client's amounts are in its own currency; totals show in the one picked at the top. */
const fxRate=()=>+((AK.leadSetting('fx')||{}).usd_inr)||84;
const CUR_SYM={USD:'$',INR:'₹'};
const curOf=c=>c&&c.currency==='INR'?'INR':'USD';
const conv=(v,from,to)=>{v=+v||0;if(from===to)return v;return from==='USD'?v*fxRate():v/fxRate();};
const fmtC=(v,cur)=>(CUR_SYM[cur]||'$')+Math.round(+v||0).toLocaleString(cur==='INR'?'en-IN':'en-US');
const dispCur=()=>V.f.cliCur==='INR'?'INR':'USD';
const inDisp=(v,c)=>conv(v,curOf(c),dispCur());
/* ---------- (18 Nov, Reyansh) Clients v2: retainer history, tax, overhead, a page per client, a change log and KPIs that matter ----------
   Client: {id,name,contact,email,service,source,status,start,end,currency,mrr,cost,setup,terms,notes,payments:[{date,amount,paid,paid_at}],
            rates:[{from:'YYYY-MM',mrr,cost,note}],log:[{at,what}],paused_at,lead_id}
   rates is the retainer over time (month 1 at ₹4L, month 2 at ₹4.5L...). mrr/cost always mirror the rate in force this month.
   Setting "clients_cfg": {tax (% of profit), overhead (fixed monthly cost not tied to a client), overhead_cur, target (MRR goal), target_cur, months (chart range)} */
const ymOf=d=>{d=d instanceof Date?d:new Date(d);return isNaN(d)?'':d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
const thisYm=()=>ymOf(new Date());
const ymAdd=(m,n)=>{const [y,mo]=m.split('-').map(Number);return ymOf(new Date(y,mo-1+n,1));};
const ymLabel=m=>{const [y,mo]=String(m||'').split('-').map(Number);return y?AK.MON[mo-1]+' '+String(y).slice(2):'';};
const cliCfg=()=>({tax:30,overhead:0,overhead_cur:'INR',target:0,target_cur:'USD',months:6,...(AK.leadSetting('clients_cfg')||{})});
const saveCliCfg=p=>AK.leadSettingSave('clients_cfg',{...cliCfg(),...p}).then(()=>schedule());
function ratesOf(c){
  const r=(c.rates||[]).filter(x=>x&&x.from).slice().sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:0);
  const s=ymOf(c.start)||thisYm();
  if(!r.length)return [{from:s,mrr:+c.mrr||0,cost:+c.cost||0,note:'Start'}];
  if(r[0].from>s)r.unshift({from:s,mrr:+r[0].mrr||0,cost:+r[0].cost||0,note:'Start'});
  return r;
}
function rateAt(c,m){   // what they pay us (and cost us) in month m, in their own currency; null when they weren't a client then
  if(!c.start||m<ymOf(c.start))return null;
  const end=c.end?ymOf(c.end):(c.status==='Ended'?ymOf(c.updated_at||new Date()):'');
  if(end&&m>end)return null;
  if(c.status==='Paused'&&m>=(ymOf(c.paused_at)||thisYm()))return null;
  let cur=null;for(const r of ratesOf(c))if(r.from<=m)cur=r;
  return cur?{mrr:+cur.mrr||0,cost:+cur.cost||0}:null;
}
const ovIn=cur=>{const g=cliCfg();return conv(+g.overhead||0,g.overhead_cur==='USD'?'USD':'INR',cur);};
// One month of the whole business in the display currency: revenue, delivery cost, gross, overhead, tax, net
function monthBook(C,m){
  const cur=dispCur();let rev=0,cost=0,n=0;
  for(const c of C){const r=rateAt(c,m);if(!r)continue;rev+=conv(r.mrr,curOf(c),cur);cost+=conv(r.cost,curOf(c),cur);n++;}
  const gross=rev-cost,ov=n?ovIn(cur):0,pre=gross-ov,tax=Math.max(0,pre)*(+cliCfg().tax||0)/100;
  return {m,rev,cost,gross,ov,pre,tax,net:pre-tax,n};
}
const payDue=(c,p)=>{const d=new Date(p.date);d.setDate(d.getDate()+(+c.terms||7));return d;};
const isOverdue=(c,p)=>!p.paid&&p.date&&payDue(c,p)<new Date();
function cliPut(c,what){   // save one client, with a line in its log
  const arr=clientsAll().filter(x=>x.id!==c.id);const r=ratesOf(c);let cu=null;for(const x of r)if(x.from<=thisYm())cu=x;cu=cu||r[0];
  const next={...c,mrr:cu.mrr,cost:cu.cost,updated_at:new Date().toISOString()};
  if(what)next.log=[{at:new Date().toISOString(),what},...(c.log||[])].slice(0,200);
  arr.push(next);return saveClients(arr).then(()=>schedule());
}
function clientForm(c){V.cform={id:'c'+Date.now(),currency:'USD',status:'Active',start:new Date().toISOString().slice(0,10),mrr:'',cost:'',setup:'',terms:7,payments:[],...(c||{})};V.cform._was=c&&c.id?JSON.parse(JSON.stringify(c)):null;schedule();}
function clientFormHtml(){
  const f=V.cform;if(!f)return '';const close=()=>{V.cform=null;schedule();};const isNew=!f._was;
  const inpF=(k,label,type,ph)=>'<label>'+esc(label)+'</label><input class="in" type="'+(type||'text')+'" value="'+esc(f[k]??'')+'" placeholder="'+esc(ph||'')+'"'+inp(e=>{V.cform[k]=e.target.value;})+'>';
  const sel=(k,label,opts)=>'<label>'+esc(label)+'</label><select class="in"'+chg(e=>{V.cform[k]=e.target.value;if(k==='currency')schedule();})+'>'+opts.map(o=>'<option'+(f[k]===o?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
  const mrr=+f.mrr||0,cost=+f.cost||0,cu=curOf(f),tx=+cliCfg().tax||0;
  const save=()=>{const o=f._was,n={...V.cform};delete n._was;const ch=[];
    if(isNew){n.rates=[{from:ymOf(n.start)||thisYm(),mrr:+n.mrr||0,cost:+n.cost||0,note:'Start'}];ch.push('Added as a client at '+fmtC(n.mrr,cu)+' a month');}
    else{
      if(+o.mrr!==+n.mrr||+o.cost!==+n.cost){const rs=ratesOf(o).filter(r=>r.from!==thisYm());rs.push({from:thisYm(),mrr:+n.mrr||0,cost:+n.cost||0,note:'Edited'});n.rates=rs;
        ch.push('Retainer from '+ymLabel(thisYm())+': '+fmtC(o.mrr,cu)+' → '+fmtC(n.mrr,cu)+(+o.cost!==+n.cost?', cost '+fmtC(o.cost,cu)+' → '+fmtC(n.cost,cu):''));}
      if(o.status!==n.status){ch.push('Status '+(o.status||'Active')+' → '+n.status);if(n.status==='Paused')n.paused_at=new Date().toISOString();if(n.status==='Ended'&&!n.end)n.end=new Date().toISOString().slice(0,10);if(n.status==='Active')n.paused_at=null;}
      for(const [k,l] of [['name','Name'],['service','Service'],['contact','Contact'],['start','Start date'],['end','End date'],['terms','Payment terms'],['currency','Currency'],['setup','Setup fee']])if(String(o[k]??'')!==String(n[k]??''))ch.push(l+': '+(o[k]||'–')+' → '+(n[k]||'–'));
      const pp=(o.payments||[]).length,np=(n.payments||[]).length;if(pp!==np)ch.push(np>pp?'Added a payment':'Removed a payment');
      const pdo=(o.payments||[]).filter(p=>p.paid).length,pdn=(n.payments||[]).filter(p=>p.paid).length;if(pp===np&&pdo!==pdn)ch.push(pdn>pdo?'Marked a payment paid':'Marked a payment not paid');
    }
    cliPut(n,ch.join(' · ')).then(()=>L.toast('Saved '+(n.name||'the client')+'.'));V.cform=null;schedule();};
  return '<div class="modal"'+act(e=>{if(e.target.classList.contains('modal'))close();},false)+'><div class="box"><div class="mh"><h2>'+(f.name?esc(f.name):'New client')+'</h2><span style="flex:1"></span>'+btn('Close',close,'sm ghost')+'</div><div class="mb"><div class="kv">'
    +inpF('name','Company','text','Acme')+inpF('contact','Main contact','text','Founder name')+inpF('email','Email','email')+inpF('service','What we do for them','text','Inbound + outbound GTM')
    +sel('source','Came from',['LinkedIn','X','Inbound','Referral','Email','Other'])+sel('status','Status',['Active','Paused','Ended'])
    +inpF('start','Start date','date')+inpF('end','End date (if ended)','date')
    +sel('currency','Currency they pay in',['USD','INR'])
    +inpF('mrr',(isNew?'Monthly retainer':'Monthly retainer from this month')+' ('+cu+')','number',cu==='INR'?'150000':'2000')+inpF('cost','Our monthly cost to deliver ('+cu+')','number',cu==='INR'?'30000':'400')+inpF('setup','One-time setup fee ('+cu+')','number','0')
    +inpF('terms','Payment terms (days to pay an invoice)','number','7')
    +'<label>Notes</label><textarea class="in" rows="3"'+inp(e=>{V.cform.notes=e.target.value;})+'>'+esc(f.notes||'')+'</textarea></div>'
    +(!isNew?'<div class="note" style="margin-top:8px">Changing the retainer here applies from '+ymLabel(thisYm())+'. To set it from another month, use Change retainer on the client’s page.</div>':'')
    +'<div class="note" style="margin-top:10px">Margin: <b>'+(mrr?Math.round((mrr-cost)/mrr*100)+'%':'–')+'</b> · profit '+fmtC(mrr-cost,cu)+' a month · after '+tx+'% tax '+fmtC(Math.max(0,mrr-cost)*(1-tx/100),cu)+'</div>'
    +'<div class="blk" style="margin-top:14px"><h3>Payments<span class="sp"></span>'+btn('+ Payment',()=>{V.cform.payments=[...(V.cform.payments||[]),{date:new Date().toISOString().slice(0,10),amount:V.cform.mrr||'',paid:false}];schedule();},'sm ghost')+'</h3>'
    +(f.payments||[]).map((p,i)=>'<div class="pay"><input class="in" type="date" value="'+esc(p.date)+'"'+inp(e=>{V.cform.payments[i].date=e.target.value;})+'><input class="in" type="number" placeholder="Amount" value="'+esc(p.amount)+'"'+inp(e=>{V.cform.payments[i].amount=e.target.value;})+'>'
      +'<button type="button" class="chip'+(p.paid?' on':'')+'"'+act(()=>{V.cform.payments[i].paid=!p.paid;V.cform.payments[i].paid_at=!p.paid?new Date().toISOString().slice(0,10):null;schedule();})+'>'+(p.paid?'Paid':'Not paid')+'</button><button type="button" class="btn ghost sm"'+act(()=>{V.cform.payments.splice(i,1);schedule();})+'>×</button></div>').join('')+'</div>'
    +'<div class="under">'+(canEdit()?btn('Save client',save,'pri sm')
      +(!isNew?btn('Delete',()=>{if(!confirm('Delete '+(f.name||'this client')+'? Its retainer history, payments and log go too.'))return;saveClients(clientsAll().filter(x=>x.id!==f.id));V.cform=null;V.f.cliOpen=null;schedule();},'sm ghost'):''):'')+'</div></div></div></div>';
}
// Settings for the page: tax, fixed overhead, MRR target, chart range
function cliSettingsHtml(){
  const g=cliCfg();if(!V.f.cliSet)return '';
  const num=(k,label,w,suffix)=>'<label class="note" style="display:flex;align-items:center;gap:6px">'+esc(label)+'<input class="in" type="number" style="width:'+(w||90)+'px" value="'+esc(g[k]??'')+'"'+chg(e=>{if(canEdit())saveCliCfg({[k]:+e.target.value||0});})+'>'+(suffix||'')+'</label>';
  const curSel=k=>'<select class="in" style="width:72px"'+chg(e=>{if(canEdit())saveCliCfg({[k]:e.target.value});})+'>'+['INR','USD'].map(o=>'<option'+(g[k]===o?' selected':'')+'>'+o+'</option>').join('')+'</select>';
  return '<div class="card sec-b" style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center">'
    +num('tax','Tax on profit',70,'%')+'<span style="display:flex;gap:6px;align-items:center">'+num('overhead','Fixed monthly overhead (tools, salaries)',110)+curSel('overhead_cur')+'</span>'
    +'<span style="display:flex;gap:6px;align-items:center">'+num('target','MRR target',110)+curSel('target_cur')+'</span>'
    +'<label class="note" style="display:flex;align-items:center;gap:6px">Chart<select class="in" style="width:110px"'+chg(e=>{if(canEdit())saveCliCfg({months:+e.target.value});})+'>'+[6,12,24].map(n=>'<option value="'+n+'"'+(+g.months===n?' selected':'')+'>'+n+' months</option>').join('')+'</select></label>'
    +'<span class="note">Overhead counts once a month while at least one client pays. Tax comes off profit after overhead, never off a loss.</span></div>';
}
function pgClients(){
  if(V.f.cliOpen){const c=clientsAll().find(x=>x.id===V.f.cliOpen);if(c)return pgClient(c);V.f.cliOpen=null;}
  const C=clientsAll(),g=cliCfg(),money=v=>fmtC(v,dispCur()),M=thisYm();
  const now=monthBook(C,M),prev=monthBook(C,ymAdd(M,-1));
  // MRR movement this month vs last: new clients, expansion (retainer up), contraction, churn
  let mNew=0,mExp=0,mCon=0,mChurn=0;for(const c of C){const a=rateAt(c,ymAdd(M,-1)),b=rateAt(c,M),v=r=>r?conv(r.mrr,curOf(c),dispCur()):0;
    if(!a&&b)mNew+=v(b);else if(a&&!b)mChurn+=v(a);else if(a&&b){if(v(b)>v(a))mExp+=v(b)-v(a);else mCon+=v(a)-v(b);}}
  // NRR: what clients active 3 months ago pay now ÷ what they paid then
  const M3=ymAdd(M,-3),was=C.filter(c=>rateAt(c,M3));const nrrA=was.reduce((s,c)=>s+conv(rateAt(c,M3).mrr,curOf(c),dispCur()),0),nrrB=was.reduce((s,c)=>{const r=rateAt(c,M);return s+(r?conv(r.mrr,curOf(c),dispCur()):0);},0);
  const live=C.filter(c=>rateAt(c,M)).map(c=>({c,v:conv(rateAt(c,M).mrr,curOf(c),dispCur())})).sort((a,b)=>b.v-a.v);
  const top=live[0];const topShare=top&&now.rev?Math.round(top.v/now.rev*100):0;
  const pays=C.flatMap(c=>(c.payments||[]).map(p=>({c,p,v:conv(+p.amount||0,curOf(c),dispCur())})));
  const paid=pays.filter(x=>x.p.paid).reduce((s,x)=>s+x.v,0),due=pays.filter(x=>!x.p.paid).reduce((s,x)=>s+x.v,0),over=pays.filter(x=>isOverdue(x.c,x.p));
  const overV=over.reduce((s,x)=>s+x.v,0),billed=paid+due;
  const tenure=C.filter(c=>c.start).map(c=>{const e=c.end?new Date(c.end):new Date();return Math.max(0,(e-new Date(c.start))/(30.44*864e5));});
  const tgt=+g.target?conv(+g.target,g.target_cur==='INR'?'INR':'USD',dispCur()):0;
  const won=leadsOpen().filter(l=>/^won$/i.test(l.stage||'')),lost=(AK.LD.rows||[]).filter(l=>/^(lost|cold lead)$/i.test(l.stage||'')&&!l.archived);
  const cur=V.f.cli||'clients';
  let h=head('Clients','Every client: what they pay each month, what they cost us, profit after overhead and '+g.tax+'% tax, and payments. Click a client for its own page.',canEdit()?btn('+ Add a client',()=>clientForm(),'pri sm'):'');
  h+='<div class="bar" style="margin:-4px 0 12px">'+['USD','INR'].map(k=>'<button type="button" class="chip'+(dispCur()===k?' on':'')+'"'+act(()=>{V.f.cliCur=k;schedule();})+'>Show in '+k+'</button>').join('')
    +'<span class="note" style="margin-left:10px">1 USD = ₹</span><input class="in" type="number" style="width:80px" value="'+esc(fxRate())+'"'+chg(e=>{const v=+e.target.value;if(v>0&&canEdit())AK.leadSettingSave('fx',{...(AK.leadSetting('fx')||{}),usd_inr:v}).then(()=>schedule());})+'>'
    +'<span class="sp"></span>'+btn(V.f.cliSet?'Hide settings':'Settings · tax '+g.tax+'%'+(+g.overhead?' · overhead':'')+(+g.target?' · target':''),()=>{V.f.cliSet=!V.f.cliSet;schedule();},'sm ghost')+'</div>';
  h+=cliSettingsHtml();
  const mv=now.rev-prev.rev,sg=v=>(v>=0?'+':'−')+money(Math.abs(v));
  h+=strip([['MRR',money(now.rev),sg(mv)+' vs last month · '+now.n+' paying','#059669'],
    ['Gross profit',money(now.gross),(now.rev?Math.round(now.gross/now.rev*100):0)+'% after delivery cost','#2563EB'],
    ['Net profit after tax',money(now.net),(now.ov?money(now.ov)+' overhead · ':'')+money(now.tax)+' tax ('+g.tax+'%)','#7C3AED'],
    ['Net margin',now.rev?Math.round(now.net/now.rev*100)+'%':'–','what we keep of every '+CUR_SYM[dispCur()]+'1 billed','#0D9488'],
    ['Outstanding',money(due),over.length?over.length+' overdue · '+money(overV):'nothing overdue',over.length?'#DC2626':'#D97706']]);
  h+='<div style="height:10px"></div>'+strip([['MRR movement',sg(mv),'new '+money(mNew)+' · up '+money(mExp)+' · down '+money(mCon)+' · lost '+money(mChurn),'#059669'],
    ['Net revenue retention',nrrA?Math.round(nrrB/nrrA*100)+'%':'–',nrrA?'clients from '+ymLabel(M3)+': paying now vs then':'needs 3 months of history','#2563EB'],
    ['Biggest client share',top?topShare+'%':'–',top?(top.c.name||'')+(topShare>=50?' · too much riding on one client':''):'',topShare>=50?'#DC2626':'#D97706'],
    ['Collection rate',billed?Math.round(paid/billed*100)+'%':'–',money(paid)+' collected of '+money(billed)+' invoiced','#0D9488'],
    tgt?['To MRR target',Math.min(100,Math.round(now.rev/tgt*100))+'%',money(Math.max(0,tgt-now.rev))+' to go to '+money(tgt),'#7C3AED']
      :['Avg per client',now.n?money(now.rev/now.n):'–',tenure.length?(tenure.reduce((s,v)=>s+v,0)/tenure.length).toFixed(1)+' months average time with us':'','#7C3AED']]);
  const N=+g.months||6,months=[...Array(N)].map((_,i)=>ymAdd(M,i-N+1)),B=months.map(m=>monthBook(C,m));
  if(C.length)h+='<div class="card sec-b" style="margin:16px 0"><h3 class="ch">Revenue, profit and what we keep after tax · last '+N+' months</h3>'
    +barChart([{n:'Revenue',c:'#059669',data:B.map(b=>Math.round(b.rev))},{n:'Gross profit',c:'#2563EB',data:B.map(b=>Math.max(0,Math.round(b.gross)))},{n:'Net after tax',c:'#7C3AED',data:B.map(b=>Math.max(0,Math.round(b.net)))}],months.map(ymLabel),130)+'</div>';
  h+=tabsBar('cli',[['clients','Clients',C.length],['won','Won',won.length],['lost','Lost',lost.length]])+'<div style="margin-top:12px">';
  if(cur==='clients')h+=table('cli',[['Client','minmax(0,1.6fr)'],['Status','90px'],['MRR','120px'],['Change','90px'],['Cost','100px'],['Margin','70px'],['After tax','110px'],['Since','100px'],['Paid / due','minmax(0,1fr)']],
    C.sort((a,b)=>(b.status==='Active')-(a.status==='Active')||inDisp(b.mrr,b)-inDisp(a.mrr,a)).map(c=>{const r=rateAt(c,M)||{mrr:+c.mrr||0,cost:+c.cost||0},m=r.mrr,k=r.cost,cu=curOf(c),own=v=>fmtC(v,cu);
      const rs=ratesOf(c),first=+rs[0].mrr||0,grow=first&&m!==first?Math.round((m-first)/first*100):0;
      const pd=(c.payments||[]).filter(p=>p.paid).reduce((s,p)=>s+(+p.amount||0),0),du=(c.payments||[]).filter(p=>!p.paid).reduce((s,p)=>s+(+p.amount||0),0),od=(c.payments||[]).some(p=>isOverdue(c,p));
      const alt=cu!==dispCur()?'<div class="meta" style="font-size:11px">'+fmtC(conv(m,cu,dispCur()),dispCur())+'</div>':'';
      return{open:()=>{V.f.cliOpen=c.id;schedule();},cells:[pcell(c.name||'(no name)',[c.contact,c.service,cu].filter(Boolean).join(' · '),null),tagp(c.status||'Active',c.status==='Active'?'#059669':c.status==='Paused'?'#D97706':'#6B7280'),'<b class="num">'+own(m)+'</b>'+alt,
        grow?'<span class="num" style="color:'+(grow>0?'#059669':'#DC2626')+';font-weight:600">'+(grow>0?'+':'')+grow+'%</span><div class="meta" style="font-size:11px">since start</div>':'<span class="faint">–</span>',
        '<span class="num meta">'+own(k)+'</span>','<span class="num" style="color:'+(m&&(m-k)/m>=0.5?'#059669':'#B45309')+';font-weight:600">'+(m?Math.round((m-k)/m*100)+'%':'–')+'</span>',
        '<span class="num">'+own(Math.max(0,m-k)*(1-g.tax/100))+'</span>','<span class="meta">'+esc(c.start||'')+'</span>',
        '<span class="meta">'+own(pd)+(du?' · <span style="color:'+(od?'#DC2626':'#B45309')+'">'+own(du)+(od?' overdue':' due')+'</span>':'')+'</span>']};}),'No clients yet. Add the first one with + Add a client.');
  if(cur==='won')h+=table('won',[['Who','minmax(0,2fr)'],['From','100px'],['Won','110px'],['Value','100px'],['','auto']],won.map(l=>({open:()=>L.openLead(l.id),cells:[pcell(cleanName(l.name),[l.role,l.company].filter(Boolean).join(' · '),PLAT[l.source]?l.source:null),'<span class="meta">'+esc(l.source||'')+'</span>','<span class="meta">'+esc(since(l.stage_at))+'</span>','<span class="num">'+(l.price?money(l.price):'–')+'</span>',
    ACTS(canEdit()&&!clientsAll().some(c=>c.lead_id===l.id)?['Add as client',()=>clientForm({name:l.company||l.name,contact:l.name,email:l.email||'',source:l.source,lead_id:l.id,mrr:l.price||''})]:null)]})),'No wins yet. People you move to Won show here.');
  if(cur==='lost')h+=table('lost',[['Who','minmax(0,2fr)'],['Stage','110px'],['Why','minmax(0,2fr)'],['When','110px']],lost.sort((a,b)=>ms(b.stage_at)-ms(a.stage_at)).map(l=>({open:()=>L.openLead(l.id),cells:[pcell(cleanName(l.name),[l.role,l.company].filter(Boolean).join(' · '),PLAT[l.source]?l.source:null),tagp(l.stage,'#6B7280'),ell(LIo(l).reply_label==='not_interested'?'Said no: '+(LIo(l).reply_text||''):LIo(l).stop==='no reply'?'No reply after all follow-ups':l.closed_for||l.next_step||'','meta'),'<span class="meta">'+esc(since(l.stage_at))+'</span>']})),'Nothing lost.');
  return h+'</div>';
}
// One client's own page: their numbers, retainer over time, payments and everything that changed
function pgClient(c){
  const cu=curOf(c),own=v=>fmtC(v,cu),g=cliCfg(),M=thisYm(),rs=ratesOf(c);
  const r=rateAt(c,M)||{mrr:+c.mrr||0,cost:+c.cost||0},first=+rs[0].mrr||0;
  const start=ymOf(c.start)||M,end=c.end?ymOf(c.end):M,last=end<M?end:M;
  const allM=[];for(let m=start;m<=last&&allM.length<120;m=ymAdd(m,1))allM.push(m);
  const book=allM.map(m=>{const x=rateAt(c,m)||{mrr:0,cost:0};const gp=x.mrr-x.cost;return {m,rev:x.mrr,cost:x.cost,gross:gp,net:gp-Math.max(0,gp)*g.tax/100};});
  const life=book.reduce((s,b)=>s+b.rev,0)+(+c.setup||0),lifeNet=book.reduce((s,b)=>s+b.net,0);
  const P=(c.payments||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const paid=P.filter(p=>p.paid).reduce((s,p)=>s+(+p.amount||0),0),due=P.filter(p=>!p.paid).reduce((s,p)=>s+(+p.amount||0),0),od=P.filter(p=>isOverdue(c,p));
  const paidLate=P.filter(p=>p.paid&&p.paid_at&&new Date(p.paid_at)>payDue(c,p)).length,paidAll=P.filter(p=>p.paid&&p.paid_at).length;
  const months=allM.length,grow=first?Math.round((r.mrr-first)/first*100):0;
  const setPay=(i,patch)=>{const ps=(c.payments||[]).slice();const j=ps.indexOf(P[i]);ps[j]={...ps[j],...patch};cliPut({...c,payments:ps},(patch.paid?'Marked paid: ':'Marked not paid: ')+own(ps[j].amount)+' ('+ps[j].date+')');};
  const invoiced=P.some(p=>ymOf(p.date)===M);
  let h='<div class="bar" style="margin-bottom:10px">'+btn('← All clients',()=>{V.f.cliOpen=null;V.rateF=null;schedule();},'sm ghost')+'</div>';
  h+=head(c.name||'Client',[c.contact,c.service,c.source?'came from '+c.source:'',cu].filter(Boolean).join(' · '),canEdit()?btn('Change retainer',()=>{V.rateF={from:ymAdd(M,1),mrr:r.mrr,cost:r.cost,note:''};schedule();},'pri sm')+btn('Edit',()=>clientForm(c),'sm ghost'):'');
  h+='<div class="bar" style="margin:-4px 0 12px">'+tagp(c.status||'Active',c.status==='Active'?'#059669':c.status==='Paused'?'#D97706':'#6B7280')+'<span class="note" style="margin-left:8px">Since '+esc(c.start||'?')+(c.end?' · ended '+esc(c.end):'')+' · pays within '+(+c.terms||7)+' days</span></div>';
  if(V.rateF){const F=V.rateF;const fld=(k,l,t)=>'<label class="note" style="display:flex;flex-direction:column;gap:4px">'+esc(l)+'<input class="in" type="'+t+'" value="'+esc(F[k]??'')+'"'+inp(e=>{V.rateF[k]=e.target.value;})+'></label>';
    h+='<div class="card sec-b" style="margin-bottom:16px"><h3 class="ch">Change the retainer</h3><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">'
      +fld('from','From month','month')+fld('mrr','New monthly retainer ('+cu+')','number')+fld('cost','Our cost to deliver ('+cu+')','number')+fld('note','Why (optional)','text')
      +btn('Save',()=>{const F2=V.rateF;if(!/^\d{4}-\d{2}$/.test(F2.from||''))return L.toast('Pick the month it starts.');const old=rateAt(c,F2.from)||r;
        const nr=rs.filter(x=>x.from!==F2.from).concat([{from:F2.from,mrr:+F2.mrr||0,cost:+F2.cost||0,note:F2.note||''}]);
        cliPut({...c,rates:nr},'Retainer from '+ymLabel(F2.from)+': '+own(old.mrr)+' → '+own(+F2.mrr||0)+(+old.cost!==+F2.cost?', cost '+own(old.cost)+' → '+own(+F2.cost||0):'')+(F2.note?' ('+F2.note+')':'')).then(()=>L.toast('Retainer updated.'));V.rateF=null;schedule();},'pri sm')
      +btn('Cancel',()=>{V.rateF=null;schedule();},'sm ghost')+'</div></div>';}
  h+=strip([['Retainer now',own(r.mrr),grow?(grow>0?'+':'')+grow+'% since month 1 ('+own(first)+')':'same as month 1','#059669'],
    ['Margin',r.mrr?Math.round((r.mrr-r.cost)/r.mrr*100)+'%':'–',own(r.mrr-r.cost)+' gross a month','#2563EB'],
    ['After '+g.tax+'% tax',own(Math.max(0,r.mrr-r.cost)*(1-g.tax/100)),'what this client leaves us a month','#7C3AED'],
    ['Lifetime value',own(life),months+' month'+(months===1?'':'s')+' · '+own(lifeNet)+' kept after tax','#0D9488'],
    ['Payments',own(paid)+' paid',od.length?od.length+' overdue · '+own(od.reduce((s,p)=>s+(+p.amount||0),0)):due?own(due)+' due':paidAll?(paidAll-paidLate)+' of '+paidAll+' paid on time':'no invoices yet',od.length?'#DC2626':'#D97706']]);
  const show=book.slice(-Math.max(6,+g.months||6));while(show.length<6){const m=ymAdd(show.length?show[0].m:M,-1);show.unshift({m,rev:0,cost:0,gross:0,net:0});}
  h+='<div class="card sec-b" style="margin:16px 0"><h3 class="ch">Their retainer, our cost and what we keep · by month</h3>'
    +barChart([{n:'Retainer',c:'#059669',data:show.map(b=>b.rev)},{n:'Cost',c:'#94A3B8',data:show.map(b=>b.cost)},{n:'Kept after tax',c:'#7C3AED',data:show.map(b=>Math.max(0,Math.round(b.net)))}],show.map(b=>ymLabel(b.m)),130)+'</div>';
  h+='<h3 class="ch" style="margin:4px 0 8px">Retainer over time</h3>'+table('cli-r',[['From','100px'],['Retainer','130px'],['Change','90px'],['Cost','110px'],['Margin','80px'],['Why','minmax(0,2fr)'],['','60px']],
    rs.map((x,i)=>{const p=i?+rs[i-1].mrr||0:0,ch=p?Math.round(((+x.mrr||0)-p)/p*100):0;return {cells:['<b>'+esc(ymLabel(x.from))+'</b>','<b class="num">'+own(x.mrr)+'</b>',i&&ch?'<span class="num" style="color:'+(ch>0?'#059669':'#DC2626')+';font-weight:600">'+(ch>0?'+':'')+ch+'%</span>':'<span class="faint">–</span>',
      '<span class="num meta">'+own(x.cost)+'</span>','<span class="num">'+(+x.mrr?Math.round(((+x.mrr)-(+x.cost||0))/(+x.mrr)*100)+'%':'–')+'</span>',ell(x.note||(i?'':'Start'),'meta'),
      i&&canEdit()?btn('×',()=>{if(!confirm('Remove the change from '+ymLabel(x.from)+'?'))return;cliPut({...c,rates:rs.filter(y=>y!==x)},'Removed the retainer change from '+ymLabel(x.from)+' ('+own(x.mrr)+')');},'sm ghost'):'']};}),'');
  h+='<div class="bar" style="margin:18px 0 8px"><h3 class="ch" style="margin:0">Invoices and payments</h3><span class="sp"></span>'+(canEdit()&&!invoiced&&rateAt(c,M)?btn('+ Invoice for '+ymLabel(M)+' ('+own(r.mrr)+')',()=>cliPut({...c,payments:[...(c.payments||[]),{date:new Date().toISOString().slice(0,10),amount:r.mrr,paid:false}]},'Invoiced '+own(r.mrr)+' for '+ymLabel(M)),'sm'):'')+'</div>';
  h+=table('cli-p',[['Date','110px'],['Amount','130px'],['Due by','110px'],['Status','minmax(0,1fr)'],['','140px']],P.map((p,i)=>{const o=isOverdue(c,p),late=p.paid&&p.paid_at&&new Date(p.paid_at)>payDue(c,p);
    return {cells:['<span class="meta">'+esc(p.date||'')+'</span>','<b class="num">'+own(p.amount)+'</b>','<span class="meta">'+esc(p.date?payDue(c,p).toISOString().slice(0,10):'')+'</span>',
      p.paid?tagp(late?'Paid late':'Paid','#059669')+(p.paid_at?' <span class="meta">'+esc(p.paid_at)+'</span>':''):tagp(o?'Overdue '+Math.floor((Date.now()-payDue(c,p))/864e5)+'d':'Not paid yet',o?'#DC2626':'#D97706'),
      canEdit()?btn(p.paid?'Mark not paid':'Mark paid',()=>setPay(i,p.paid?{paid:false,paid_at:null}:{paid:true,paid_at:new Date().toISOString().slice(0,10)}),'sm ghost'):'']};}),'No invoices yet. Add one with + Invoice, or in Edit.');
  const lg=(c.log||[]);
  h+='<h3 class="ch" style="margin:18px 0 8px">What changed</h3><div class="card sec-b">'+(lg.length?lg.slice(0,60).map(x=>'<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)"><span class="meta" style="min-width:130px">'+esc(String(x.at).slice(0,16).replace('T',' '))+'</span><span>'+esc(x.what)+'</span></div>').join(''):'<div class="empty">Changes you make from now on show here: retainer, status, payments.</div>')+'</div>';
  if(c.notes)h+='<h3 class="ch" style="margin:18px 0 8px">Notes</h3><div class="card sec-b" style="white-space:pre-wrap">'+esc(c.notes)+'</div>';
  return h;
}


/* ================= Competitors (16 Nov): who sells what we sell, what they post, and who engages with them ================= */
// Setting "competitors": [{id,name,website,type,country,what,how,x,linkedin,founders:[{name,role,x,linkedin}],followers,notes,archived}].
// x-grow reads their posts (comp_posts), the replies under their busiest posts and their followers (direct ones only) through the
// extension; everyone judged lands in comp_audience, and fits go to X > Pipeline > To approve with our own value-first opener.
const compsAll=()=>(AK.leadSetting('competitors')||[]).slice();
const compPosts=()=>(AK.leadSetting('comp_posts')||[]);
const compAud=()=>(AK.leadSetting('comp_audience')||[]);
// (16 Nov) li-bot comp_daily: comp_ads (Google Ads Transparency), comp_intel (ICP, offer, price, CTA, named clients), li_comp_posts
// (lead-gen agencies' LinkedIn posts, read by the extension) and li_comp_people (their commenters, background-checked).
const compAds=()=>(AK.leadSetting('comp_ads')||{});
const compIntel=()=>(AK.leadSetting('comp_intel')||{});
const liCompPosts=()=>(AK.leadSetting('li_comp_posts')||[]);
const liCompPeople=()=>(AK.leadSetting('li_comp_people')||[]);
const dom=u=>String(u||'').trim().replace(/^https?:\/\//i,'').replace(/^www\./i,'').split(/[/?#]/)[0];
const xh=h=>String(h||'').replace(/^@/,'').replace(/^https?:\/\/(x|twitter)\.com\//,'').replace(/[/?].*$/,'').trim();
function compForm(c){V.compF={id:'c'+Date.now(),type:'Agency',followers:true,founders:[],...(c||{})};V.compF.fText=(V.compF.founders||[]).map(f=>[f.name,f.role,f.x?'@'+xh(f.x):'',f.linkedin].join(' | ')).join('\n');schedule();}
function compFormHtml(){
  const f=V.compF;if(!f)return '';const close=()=>{V.compF=null;schedule();};
  const F=(k,label,ph)=>'<label>'+esc(label)+'</label><input class="in" value="'+esc(f[k]??'')+'" placeholder="'+esc(ph||'')+'"'+inp(e=>{V.compF[k]=e.target.value;})+'>';
  const save=()=>{const fo=String(f.fText||'').split('\n').map(l=>l.split('|').map(x=>x.trim())).filter(a=>a[0]).map(([name,role,x,linkedin])=>({name,role:role||'',x:xh(x),linkedin:linkedin||''}));
    const c={...f,x:xh(f.x),founders:fo,updated_at:new Date().toISOString()};delete c.fText;const arr=compsAll().filter(x=>x.id!==f.id);arr.push(c);
    AK.leadSettingSave('competitors',arr).then(()=>L.toast('Saved '+(c.name||'the competitor')+'. Their X posts and audience are read within the hour.'));V.compF=null;schedule();};
  return '<div class="modal"'+act(e=>{if(e.target.classList.contains('modal'))close();},false)+'><div class="box"><div class="mh"><h2>'+(f.name?esc(f.name):'New competitor')+'</h2><span style="flex:1"></span>'+btn('Close',close,'sm ghost')+'</div><div class="mb"><div class="kv">'
    +F('name','Name','Roger')+F('website','Website','https://…')+F('type','Type','Agency / AI tool / Ghostwriting agency')+F('country','Country','USA, UK, India…')
    +F('what','What they sell','One line')+F('how','How close to us','Same thing as us / Overlaps on…')+F('x','Company X account','@handle')+F('linkedin','Company LinkedIn page','https://linkedin.com/company/…')
    +'<label>Founders</label><textarea class="in" rows="4" placeholder="Name | Role | @x | LinkedIn URL (one per line)"'+inp(e=>{V.compF.fText=e.target.value;})+'>'+esc(f.fText||'')+'</textarea>'
    +'<label>Read their audience</label><button type="button" class="chip'+(f.followers!==false?' on':'')+'"'+act(()=>{V.compF.followers=f.followers===false;schedule();})+'>'+(f.followers!==false?'Followers + replies':'Replies only')+'</button>'
    +'<label>Notes</label><textarea class="in" rows="2"'+inp(e=>{V.compF.notes=e.target.value;})+'>'+esc(f.notes||'')+'</textarea></div>'
    +'<div class="note" style="margin-top:8px">The bot reads every X account here (company and founders) through your X tab: their posts, the people replying to them, and (direct competitors) their followers. People who fit our ICP go to X › Pipeline › To approve, with our own opener. The competitor is never mentioned.</div>'
    +'<div class="under">'+(canEdit()?btn('Save',save,'pri sm')+(compsAll().some(x=>x.id===f.id)?btn(f.archived?'Restore':'Stop tracking',()=>{const arr=compsAll().map(x=>x.id===f.id?{...x,archived:!f.archived}:x);AK.leadSettingSave('competitors',arr);V.compF=null;schedule();},'sm ghost'):''):'')+'</div></div></div></div>';
}
// (17 Nov) Three simple pages: the agencies we compete with (and Roger), the people we found through them, and their Google ads.
const isRival=c=>!c.archived&&((/agency/i.test(String(c.type||''))&&c.followers!==false)||/^roger$/i.test(c.name));
const shortPrice=t=>{t=String(t||'');const m=t.match(/[$£€₹]\s?[\d,.]+\s?[kK]?(\s?(?:-|–|to)\s?[$£€₹]?\s?[\d,.]+\s?[kK]?)?(\s?(?:\/|per|a)\s?(?:mo(?:nth)?|month|yr|year|meeting|lead|seat|email|e-mail))?/);
  return m?m[0].replace(/\s?per\s?/,'/').replace(/\/?month\b/,'/mo').replace(/\s+/g,' ').trim():'';};
const tagc=(t,c)=>t?'<span class="tg" style="color:'+c+';background:'+c+'14;border-color:'+c+'33">'+esc(t)+'</span>':'';
function pgCompetitors(){
  const cur=['list','leads','ads','ideas'].includes(V.f.comp)?V.f.comp:'list';V.f.comp=cur;
  const R=compsAll().filter(isRival);const P=compLeads();const todo=P.filter(p=>p.st==='fit').length;
  const AD=compAds();const adsN=R.reduce((s2,c)=>s2+((AD[c.name]||{}).ads||[]).length,0);
  let h=head('Competitors','Agencies selling what we sell. We find the people around them who fit our ICP, and you choose who goes into our pipeline.',canEdit()&&cur==='list'?btn('+ Add a competitor',()=>compForm(),'pri sm'):'');
  h+=tabsBar('comp',[['list','1. Competitors',R.length],['leads','2. Leads',todo],['ads','3. Google ads',adsN],['ideas','Post ideas',null]])+'<div style="margin-top:14px">';
  if(cur==='list')h+=compListHtml(R);
  if(cur==='leads')h+=compLeadsHtml(P);
  if(cur==='ads')h+=compAdsHtml(R);
  if(cur==='ideas')h+=pgIdeas(true);
  return h+'</div>';
}

/* (17 Nov) Competitor breakdown, opened by clicking a competitor: service, how it works, core USP, offer, who buys, proof, each channel
   (website, LinkedIn, X, other), what they do differently, where we're stronger, and how to copy what works into our system. */
function compDetailHtml(){
  const name=V.compD;if(!name)return '';const c=compsAll().find(x=>x.name===name)||{name};const it=compIntel()[name]||{};const a=it.analysis;const busy=!!(AK.CA&&AK.CA.busy[name]);
  const close=()=>{V.compD=null;schedule();};const L1=x=>esc(String(x||'').trim()||'Not public');
  const sec=(t,body)=>body?'<div class="blk" style="margin-top:14px"><h3>'+esc(t)+'</h3>'+body+'</div>':'';
  const ul=arr=>(arr||[]).length?'<ul style="margin:6px 0 0 18px;line-height:1.55">'+arr.map(x=>'<li>'+esc(typeof x==='string'?x:JSON.stringify(x))+'</li>').join('')+'</ul>':'';
  const p=t=>t?'<p style="margin:6px 0 0;line-height:1.55">'+esc(t)+'</p>':'';
  const lvl=v=>'<span class="tg" style="color:'+(v==='high'?'#059669':v==='medium'?'#D97706':'#6B7280')+'">'+esc(v||'–')+'</span>';
  let b='';
  if(!a)b='<div class="empty" style="padding:24px">'+(busy?'Researching their website, LinkedIn and X posts… about a minute.':'No breakdown yet. Press <b>Write the breakdown</b>: it reads their website, LinkedIn and X posts, and compares them with us.')+'</div>';
  else{
    b+=p(a.summary)+'<div class="note" style="margin-top:4px">Written '+esc(since(a.at))+(a.sources&&a.sources.length?' from '+a.sources.length+' sources':'')+'</div>';
    b+=sec('Core USP','<p style="margin:6px 0 0;font-weight:600;line-height:1.5">'+L1(a.core_usp)+'</p>');
    b+=sec('What they sell',ul(a.service))+sec('How it works',p(a.how_it_works))+sec('Offer and price',p(a.offer_pricing))+sec('Who buys',p(a.who_buys))+sec('Proof they show',ul(a.proof));
    const ch=a.channels||{};b+=sec('Their channels','<div class="kv" style="grid-template-columns:110px 1fr;row-gap:8px;margin-top:6px">'+[['Website',ch.website],['LinkedIn',ch.linkedin],['X',ch.x],['Other',ch.other]].map(([k,v])=>'<b>'+k+'</b><span style="line-height:1.5">'+L1(v)+'</span>').join('')+'</div>');
    b+=sec('What they do differently from us',ul(a.different_from_us))+sec('Where we’re stronger',ul(a.we_do_better));
    b+=sec('How we copy what works',(a.replicate||[]).length?'<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">'+a.replicate.map(r=>'<div class="card" style="padding:10px 12px"><div class="bar"><b>'+esc(r.what||'')+'</b><span class="sp"></span><span class="meta">effort</span>'+lvl(r.effort)+'<span class="meta">impact</span>'+lvl(r.impact)+'</div><div style="margin-top:4px;line-height:1.5">'+esc(r.how||'')+'</div></div>').join('')+'</div>':'');
    b+=sec('Quick wins this week',ul(a.quick_wins));
    if(a.sources&&a.sources.length)b+='<details style="margin-top:14px"><summary class="meta" style="cursor:pointer">Sources</summary>'+a.sources.map(u=>'<div><a class="meta" href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(u)+'</a></div>').join('')+'</details>';
  }
  const links=[c.website?'<a href="'+esc(c.website)+'" target="_blank" rel="noopener">Website ↗</a>':'',c.linkedin?'<a href="'+esc(c.linkedin)+'" target="_blank" rel="noopener">LinkedIn ↗</a>':'',c.x?'<a href="https://x.com/'+esc(xh(c.x))+'" target="_blank" rel="noopener">X ↗</a>':''].filter(Boolean).join(' · ');
  return '<div class="modal"'+act(e=>{if(e.target.classList.contains('modal'))close();},false)+'><div class="box" style="max-width:860px"><div class="mh"><h2>'+esc(name)+'</h2><span class="meta" style="margin-left:10px">'+links+'</span><span style="flex:1"></span>'
    +(canEdit()?btn(busy?'Researching…':a?'Refresh':'Write the breakdown',()=>{if(!busy)AK.compAnalyze(name);},'sm'+(a?' ghost':' pri'))+btn('Edit',()=>{V.compD=null;compForm(c);},'sm ghost'):'')+btn('Close',close,'sm ghost')+'</div><div class="mb">'+b+'</div></div></div>';
}
/* 1. Competitors: price, website, who they sell to, their current clients */
const wrap3=t=>'<div class="meta" title="'+esc(t)+'" style="white-space:normal;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4">'+esc(t)+'</div>';
function compListHtml(R){
  const IN=compIntel();
  const sameIcp=it=>{const t=String((it&&it.icp)||'');if(!t)return '';const b2b=/b2b|saas|startup|founder/i.test(t),fund=/funded|seed|series|vc|venture|yc|y combinator/i.test(t);return b2b&&fund?'Yes':b2b?'Partly':'No';};
  return table('rivals',[['Competitor','minmax(0,1.2fr)'],['Price','120px'],['Who they sell to','minmax(0,2fr)'],['Current clients','minmax(0,1.6fr)'],['Same ICP as us?','120px']],
    R.map(c=>{const it=IN[c.name]||{};const cl=(it.clients||[]).map(x=>x.company).filter(Boolean);const s2=sameIcp(it);
      return{open:()=>{V.compD=c.name;schedule();},cells:[
        '<div class="pc-t"><div class="ell nm"><b>'+esc(c.name)+'</b>'+(c.needs_info?' <span class="meta">(add details)</span>':'')+'</div>'+(c.website?'<a class="meta" href="'+esc(c.website)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">'+esc(dom(c.website))+' ↗</a>':'<span class="meta">no website yet</span>')+'</div>',
        '<b>'+esc(shortPrice(it.pricing)||(it.at?'Not public':'…'))+'</b>',
        wrap3(it.icp||(it.at?'Not found':'Researching…')),
        wrap3(cl.length?cl.join(', '):(it.at?'None named publicly':'Researching…')),
        s2?tagc(s2,s2==='Yes'?'#059669':s2==='Partly'?'#D97706':'#6B7280'):'<span class="meta">…</span>']};}),'No competitors yet. Add one with + Add a competitor.')
    +'<p class="note" style="margin-top:10px">Prices, buyers and clients come from their websites and case studies, refreshed weekly. Click a competitor for the full breakdown: their service, core USP, channels, what they do differently and how we copy it.</p>';
}
/* 2. Leads: everyone we found through competitors who fits our ICP */
function compLeads(){
  const ov=V.cmpSt||{};const out=[];
  for(const q of liCompPeople()){if(!q||!q.name)continue;const st=(ov['li:'+q.key]||{}).status||q.status;
    out.push({id:'li:'+q.key,who:'li',key:q.key,st,name:q.name,role:q.role||q.headline||'',company:q.company||'',one:q.company_what||'',yc:q.yc||'',funding:q.funding||(q.funded==='raised'?'Raised':''),country:q.country||'',
      how:q.how==='client'?'Client of '+q.agency:'Commented on '+(q.agency||'an agency')+'’s LinkedIn post',said:q.said||'',plat:'LinkedIn',url:q.pid?'https://www.linkedin.com/in/'+q.pid:q.key,
      sentLi:!!(q.sent_li||q.lead_id||(ov['li:'+q.key]||{}).li),sentX:!!(q.sent_x||(ov['li:'+q.key]||{}).x),at:q.judged_at||q.at,err:q.err||''});}
  for(const a of compAud()){if(!a||!a.handle)continue;const st=(ov['x:'+a.handle]||{}).status||a.status||(a.fit==='Core buyer'?(a.added?'sent':'fit'):'not');
    out.push({id:'x:'+a.handle,who:'x',key:a.handle,st,name:a.name||'@'+a.handle,role:a.role||'',company:a.company||'',one:a.what||a.bio||'',yc:a.yc||'',funding:a.funding||(a.stage&&!/unknown/i.test(a.stage)?a.stage:''),country:a.country||'',
      how:(a.how==='replied'?'Replied to '+a.comp+' on X':'Follows '+a.comp+' on X'),said:a.how==='replied'?a.text||'':'',plat:'X',url:'https://x.com/'+a.handle,
      sentLi:!!(a.sent_li||(ov['x:'+a.handle]||{}).li),sentX:!!(a.sent_x||a.added||(ov['x:'+a.handle]||{}).x),at:a.at,err:a.err||''});}
  return out.sort((a,b)=>ms(b.at)-ms(a.at));
}
function compSend(p,to){
  const ov=V.cmpSt=V.cmpSt||{};ov[p.id]={...(ov[p.id]||{}),busy:to};schedule();
  AK.botCall('comp_send',{who:p.who,key:p.key,to}).then(r=>{const o=ov[p.id]||{};delete o.busy;
    if(r&&r.ok){if(to==='trash')o.status='trash';else{o.status='sent';o[to]=true;}L.toast(p.name+': '+r.msg);}
    else L.toast(p.name+': '+((r&&r.msg)||'didn’t work, try again'),null,true);ov[p.id]=o;schedule();});
}
function compLeadsHtml(P){
  const fl=['fit','sent','trash'].includes(V.f.compL2)?V.f.compL2:'fit';const n=k=>P.filter(p=>p.st===k).length;
  let h='<div class="bar" style="margin-bottom:12px">'+[['fit','To review'],['sent','Sent to pipeline'],['trash','Trashed']].map(([k,l])=>'<button type="button" class="chip'+(fl===k?' on':'')+'"'+act(()=>{V.f.compL2=k;schedule();})+'>'+esc(l)+' '+n(k)+'</button>').join('')
    +'<span class="sp"></span><span class="meta">Only people who fit our ICP show here: founders and C-suite at funded B2B startups outside India.</span></div>';
  const L0=P.filter(p=>p.st===fl);
  if(!L0.length)return h+'<div class="empty">'+(fl==='fit'?'Nobody to review right now. New people come in every day from competitors’ LinkedIn comments, their X audience and their clients.':'Nobody here yet.')+'</div>';
  const busy=p=>((V.cmpSt||{})[p.id]||{}).busy;
  h+=L0.slice(0,V.more.compL2?500:60).map(p=>{const a=avc(p.name);const b=busy(p);
    const tags=[p.yc?tagc('YC '+p.yc,'#EA580C'):'',p.funding&&!/none|not found|unknown/i.test(p.funding)?tagc(p.funding,'#059669'):'',p.country&&!/unknown/i.test(p.country)?tagc(p.country,'#6B7280'):'',tagc(p.plat,p.plat==='X'?'#111827':'#0A66C2')].join(' ');
    const btns=canEdit()&&fl!=='trash'?(b?'<span class="meta">Working…</span>':
      (p.sentLi?'<span class="meta">✓ LinkedIn</span>':btn('Send to LinkedIn',()=>compSend(p,'li'),'sm pri'))+' '+(p.sentX?'<span class="meta">✓ X</span>':btn('Send to X',()=>compSend(p,'x'),'sm'))+(fl==='fit'?' '+btn('Trash',()=>compSend(p,'trash'),'sm ghost'):'')):'';
    return '<div class="card" style="margin-bottom:10px;padding:14px 16px;display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:start">'
      +'<div class="av" style="width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:600;background:'+a.bg+';color:'+a.fg+'">'+esc(a.ini)+'</div>'
      +'<div style="min-width:0"><div><a href="'+esc(p.url)+'" target="_blank" rel="noopener" style="font-weight:600;color:inherit">'+esc(p.name)+'</a> <span class="meta">'+esc([p.role,p.company].filter(Boolean).join(' at '))+'</span></div>'
      +(p.one?'<div style="font-size:13px;margin-top:3px">'+esc(clipS(p.one,160))+'</div>':'')
      +'<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'+tags+'</div>'
      +'<div class="meta" style="margin-top:6px;font-size:12px">'+esc(p.how)+(p.said?': “'+esc(clipS(p.said,140))+'”':'')+(p.err?' · '+esc(p.err):'')+'</div></div>'
      +'<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">'+btns+'</div></div>';}).join('')
    +(L0.length>60&&!V.more.compL2?btn('Show all '+L0.length,()=>{V.more.compL2=true;schedule();},'sm ghost'):'');
  return h;
}
const clipS=(t,n)=>{t=String(t||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1)+'…':t;};
/* 3. Google ads: what each competitor is running */
function compAdsHtml(R){
  const AD=compAds();
  const libs=c=>{const n=encodeURIComponent(c.name.replace(/\s*\(.*\)$/,''));const d=dom(c.website);
    return '<a href="https://adstransparency.google.com/?region=anywhere'+(d?'&domain='+encodeURIComponent(d):'')+'" target="_blank" rel="noopener">Google</a> · <a href="https://www.linkedin.com/ad-library/search?accountOwner='+n+'" target="_blank" rel="noopener">LinkedIn</a> · <a href="https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q='+n+'" target="_blank" rel="noopener">Meta</a>';};
  const on=R.filter(c=>((AD[c.name]||{}).ads||[]).length),off=R.filter(c=>!((AD[c.name]||{}).ads||[]).length);
  let h='<p class="note" style="margin:0 0 12px">Checked every day in Google’s ad library. Google never shows who clicked an ad, so nobody can be found from ads; the people around competitors are on the Leads page.</p>';
  for(const c of on){const a=AD[c.name];
    h+='<div class="card" style="margin-bottom:12px;padding:14px 16px"><div class="bar"><b>'+esc(c.name)+'</b><span class="meta">'+esc(a.total)+' ads running or recent</span><span class="sp"></span><span class="meta">'+libs(c)+'</span></div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px">'
      +a.ads.map(x=>'<a href="'+esc(x.url)+'" target="_blank" rel="noopener" style="display:block;border:1px solid var(--line,#e5e7eb);border-radius:8px;padding:8px;text-decoration:none;color:inherit">'
        +(x.img?'<img src="'+esc(x.img)+'" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:auto;max-height:180px;object-fit:contain;background:#fff;border-radius:4px">':'<div class="meta" style="height:80px;display:grid;place-items:center">'+esc(x.fmt)+' ad, open to see it</div>')
        +'<div class="meta" style="margin-top:6px;font-size:11px">'+esc(x.fmt)+' · ran '+esc(x.first)+' to '+esc(x.last)+'</div></a>').join('')+'</div></div>';}
  h+=table('noads',[['Competitor','minmax(0,1fr)'],['Google ads','160px'],['Check other ad libraries','minmax(0,1fr)']],
    off.map(c=>({cells:['<b>'+esc(c.name)+'</b>','<span class="meta">'+(c.website?'None running':'No website to check')+'</span>','<span class="meta">'+libs(c)+'</span>']})),'');
  return h;
}

/* Reply to their posts > Posted: every reply that went live, by day */
/* ---------- Manual X replies (22 Nov): add the post + draft, claim, post it on X, save the published reply's link ----------
   Automatic replies stay off. Claim runs the bot's checks (shared cap, gap, hours, cooldown, 20-hour freshness, one per person a day).
   Nothing here posts or likes on X. */
function manualHtml(){
  const rows=(AK.XG.rows||[]).filter(r=>r.source==='manual').sort((a,b)=>ms(b.created_at)-ms(a.created_at));
  const F=V.xm||(V.xm={url:'',draft:'',links:{}});
  const call=(action,body,ok)=>AK.botCall(action,body).then(r=>{if(!r)return null;if(r.error){L.toast(r.error,null,true);return null;}if(ok)L.toast(ok);AK.xgLoad();return r;});
  const doneToday=(AK.XG.rows||[]).filter(r=>r.status==='done'&&/^(x bot|manual)$/.test(r.done_by||'')&&ms(r.done_at)>Date.now()-D).length;
  let h='<div class="card" style="padding:14px 16px;margin-top:12px;display:flex;flex-direction:column;gap:10px">'
    +'<div><b>Add a reply</b><div class="note">Automatic replies are off. Paste the post you’re replying to and your reply. Claim it right before you post, then save the link of the reply you published. Nothing is posted or liked for you.</div></div>'
    +'<label style="display:flex;flex-direction:column;gap:3px"><span class="note">Target post link</span><input class="in" placeholder="https://x.com/handle/status/…" value="'+esc(F.url)+'"'+inp(e=>{F.url=e.target.value;})+'></label>'
    +'<label style="display:flex;flex-direction:column;gap:3px"><span class="note">Your reply (max 280)</span><textarea class="in" rows="3"'+inp(e=>{F.draft=e.target.value;})+'>'+esc(F.draft)+'</textarea></label>'
    +'<div>'+(canEdit()?btn('Add',()=>call('xr_manual_add',{url:F.url,draft:F.draft},'Added. Claim it right before you post.').then(r=>{if(r){V.xm={url:'',draft:'',links:F.links};schedule();}}),'pri sm'):'<span class="note">Sign in to add replies.</span>')+'</div></div>';
  const sec=(title,list,fn)=>'<div style="margin-top:14px"><b>'+esc(title)+'</b> <span class="cnt">'+list.length+'</span>'+(list.length?'<div class="rgrid" style="margin-top:8px">'+list.map(fn).join('')+'</div>':'<div class="note" style="margin-top:4px">None.</div>')+'</div>';
  const head2=r=>'<div class="rc-h"><div class="rc-w"><b class="ell">@'+esc(r.author)+'</b><span class="meta ell">'+esc(r.url)+'</span></div><span class="sp"></span>'+btn('Open post ↗',()=>window.open(r.url,'_blank','noopener'),'sm ghost')+'</div>'
    +'<div class="rc-r"><span class="rc-l">Our reply</span><div style="white-space:pre-wrap">'+esc(r.draft||'')+'</div></div>';
  const waiting=rows.filter(r=>/^(new|approved|failed|skipped)$/.test(r.status)),claimed=rows.filter(r=>r.status==='sending'),done=rows.filter(r=>/^(done|posted)$/.test(r.status));
  h+='<p class="note" style="margin-top:12px">Today: '+doneToday+' replies posted (bot + manual share one cap). Claiming checks the cap, the gap since the last reply, sending hours (US Pacific), X’s cooldown, that the post is under 20 hours old, and one reply per person a day.</p>';
  h+=sec('Ready to claim',waiting,r=>'<div class="rc">'+head2(r)+(r.status==='failed'&&r.error?'<div class="note" style="color:var(--bad)">'+esc(r.error)+'</div>':'')
    +'<div class="rc-a">'+(canEdit()&&r.status!=='failed'?btn('Claim',()=>call('xr_manual_claim',{url:r.url},'Claimed. Post it on X now, then paste your reply’s link here.'),'pri sm'):'')+'</div></div>');
  h+=sec('Claimed: post it, then save the link',claimed,r=>'<div class="rc" style="border-color:#BFDBFE">'+head2(r)+'<div class="note">Claimed '+esc(new Date(r.claimed_at||Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))+'</div>'
    +'<label style="display:flex;flex-direction:column;gap:3px"><span class="note">Link of the reply you published</span><input class="in" placeholder="https://x.com/you/status/…" value="'+esc(F.links[r.url]||'')+'"'+inp(e=>{F.links[r.url]=e.target.value;})+'></label>'
    +'<div class="rc-a">'+(canEdit()?btn('Save link + mark done',()=>call('xr_manual_done',{url:r.url,reply_url:F.links[r.url]||''},'Saved. It shows in Posted (live).').then(x=>{if(x){delete F.links[r.url];}}),'pri sm')+btn('Release',()=>call('xr_manual_release',{url:r.url},'Released.'),'sm ghost'):'')+'</div></div>');
  h+=sec('Done',done.slice(0,30),r=>'<div class="rc">'+head2(r)+'<div class="note">Posted '+esc(new Date(r.done_at||Date.now()).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</div>'
    +(r.reply_url?'<div class="rc-a">'+btn('Open our reply ↗',()=>window.open(r.reply_url,'_blank','noopener'),'sm')+'</div>':'')+'</div>');
  return h;}
function postedHtml(){
  const R=(AK.XG.rows||[]).filter(r=>/^(done|posted)$/.test(r.status)&&r.done_at).sort((a,b)=>ms(b.done_at)-ms(a.done_at));
  const days=[...Array(7)].map((_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-6+i);return d;});
  const per=days.map(d=>R.filter(r=>{const t=ms(r.done_at);return t>=d.getTime()&&t<d.getTime()+D;}).length);
  let h='<div class="card sec-b" style="margin:12px 0"><h3 class="ch">Replies live on X, last 7 days</h3>'+barChart([{n:'Replies posted',c:'#7C3AED',data:per}],days.map(d=>d.getDate()+' '+AK.MON[d.getMonth()]),90)+'</div>';
  let last='';
  h+='<div class="tb">'+(R.length?R.slice(0,V.more.posted?300:60).map(r=>{const d=new Date(r.done_at);const day=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});const head2=day!==last?'<div class="tb-day">'+esc(day)+' · '+R.filter(x=>new Date(x.done_at).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})===day).length+' replies</div>':'';last=day;
    const bot=r.done_by==='x bot'||r.status==='posted',man=r.done_by==='manual';
    return head2+'<div class="tb-r" style="grid-template-columns:70px minmax(0,1.2fr) minmax(0,2fr) auto"'+act(()=>window.open(r.url,'_blank','noopener'),false)+'><span class="meta">'+esc(d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))+'</span>'+pcell(r.name||r.author,'@'+r.author,'X')
      +'<div class="tc"><div class="ell"><b>Our reply:</b> '+esc(r.draft||'')+'</div><div class="ell meta">On: '+esc(String(r.post_text||r.url||'').replace(/\s+/g,' '))+'</div>'+(r.reply_url?'<div class="ell meta">Reply link: <button type="button" class="lnk"'+act(()=>window.open(r.reply_url,'_blank','noopener'))+'>'+esc(r.reply_url)+'</button></div>':'')+'</div>'+tagp(bot?'Posted by the bot':man?'Posted manually':'Posted by you',bot?'#7C3AED':man?'#2563EB':'#059669')+'</div>';}).join(''):'<div class="empty">No replies posted yet.</div>')+'</div>'
    +(R.length>60&&!V.more.posted?'<div style="margin-top:10px">'+btn('Show more',()=>{V.more.posted=true;schedule();},'ghost sm')+'</div>':'');
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
  const hl=isHandLi(l)||isHandX(c);const hd='<div class="p-top"><div class="av" style="background:'+a.bg+';color:'+a.fg+'">'+esc(a.ini)+'</div><div style="min-width:0"><h2>'+esc(lp.name)+'</h2><div class="p-sub">'+esc(lp.sub)+'</div><div class="p-pills">'+pills+'</div></div>{{X}}</div>'+chHtml+'<div class="under">'+handBtn(hl,()=>{handLi(l,!hl);if(c)handX(c,!hl);})+rmBig(l?rmOfLead(l):rmOfContact(c))+'</div>'+track;
  let b='';const tab=V.ptab;
  if(tab==='next'){
    const nx=(lp.deal||[]).filter(r=>/^Next step/.test(r.label));
    b+='<div class="blk"><h3>Next step</h3><div class="kv">'+nx.map(r=>'<label>'+esc(r.label)+'</label>'+field(r)).join('')+'</div></div>';
    // LinkedIn message waiting for an OK, straight from the LinkedIn board
    const card=memo('lpc:'+l.id,()=>{const B=withState({lpExp:'all',lpQ:'',lpMin:0,lpOut:true},()=>L.liPipeVals());for(const col of B.cols)for(const k of col.cards)if(k.id===l.id)return k;return null;});
    if(card&&(card.hasMsg||card.isFailed))b+='<div class="blk"><h3>'+platMark('LinkedIn')+esc(plainWords(card.msgKind||'LinkedIn'))+'<span class="sp"></span>'+(card.chars?'<span class="count">'+esc(card.chars)+'</span>':'')+'</h3>'
      +(card.isFailed?'<div class="errline">'+esc(card.status)+'</div>':'')+(card.hasMsg?ta(card.msg,card.onMsg,card.saveMsg,5):'')
      +'<div class="under">'+(card.hasMsg&&canEdit()?btn('Approve',card.approve,'pri sm')+btn('Skip',card.skip,'sm ghost'):'')+(card.isFailed&&canEdit()?btn('Try again',card.retry,'sm'):'')+'</div></div>';
    const xr=((l.fields||{}).x)||{};if(xr.reply_text&&!(xr.answered&&ms(xr.answered)>=ms(xr.replied_last))){const lab=LABEL_C[xr.reply_label]||LABEL_C.other;
      b+='<div class="blk"><h3>'+platMark('X')+'They replied on X '+tagp(lab[0],lab[1])+'</h3><div class="quote">'+esc(xr.reply_text)+'</div>'+(xr.draft?'<div class="pmsg" style="margin-top:8px"><div class="mh">Answer, ready to send</div><div class="mt">'+esc(xr.draft)+'</div></div>'+btn('Copy answer',()=>L.copy(xr.draft,'xd'+l.id,'Answer copied.'),'pri sm')+' ':'')+(canEdit()?btn('Answered',()=>AK.leadSave(l.id,{fields:{...(l.fields||{}),x:{...xr,answered:new Date().toISOString()}}}),'sm ghost'):'')+'</div>';}
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
  const hx=isHandX(c);const hd='<div class="p-top"><div class="av" style="background:'+a.bg+';color:'+a.fg+'">'+esc(a.ini)+'</div><div style="min-width:0"><h2>'+esc(cp.name)+'</h2><div class="p-sub">'+esc([cp.role,cp.company].filter(x=>x&&x!=='–').join(' · '))+'</div><div class="p-pills">'+pill(cp.stageP.label,'line')+(c&&c._fit?fitPill(c._fit):'')+'</div></div>{{X}}</div>'+ch+'<div class="under">'+handBtn(hx,()=>handX(c,!hx))+rmBig(rmOfContact(c))+'</div>'+track;
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
