/* The CRM page logic: the Claude Design component (design/CRM.dc.html), with its sample data replaced by
   the sheet data from data.js (window.AK) and its actions wired to the real saves. Returns the Component class. */
window.AK_LOGIC=function(DCLogic,React){
const AK=window.AK;
const STAGES=['To send','Sent','Follow-up 1 sent','Follow-up 2 sent','Replied','Call booked','Customer','Closed'];
const SHORT={'To send':'To send','Sent':'Sent','Follow-up 1 sent':'Follow-up 1','Follow-up 2 sent':'Follow-up 2','Replied':'Replied','Call booked':'Call','Customer':'Customer','Closed':'Closed'};
const TONE={neutral:['var(--n-soft)','var(--ink-2)','var(--hairline)'],out:['var(--out-soft)','var(--out-ink)','var(--out-line)'],mid:['var(--mid-soft)','var(--mid-ink)','var(--mid-line)'],in:['var(--in-soft)','var(--in-ink)','var(--in-line)'],ok:['var(--ok-soft)','var(--ok-ink)','var(--ok-line)'],warn:['var(--warn-soft)','var(--warn-ink)','var(--warn-line)'],bad:['var(--bad-soft)','var(--bad-ink)','var(--bad-line)'],solid:['var(--ink)','#fff','var(--ink)'],ghost:['transparent','var(--ink-3)','var(--hairline-strong)']};
const pill=(label,t)=>{const x=TONE[t]||TONE.neutral;return{label,bg:x[0],fg:x[1],bd:'inset 0 0 0 1px '+x[2]};};
const STAGE_T={'To send':'neutral','Sent':'out','Follow-up 1 sent':'out','Follow-up 2 sent':'out','Replied':'mid','Call booked':'mid','Customer':'ok','Closed':'ghost'};
const STAGE_DOT={'To send':'var(--ink-4)','Sent':'var(--out)','Follow-up 1 sent':'var(--out)','Follow-up 2 sent':'var(--out)','Replied':'var(--mid)','Call booked':'var(--mid)','Customer':'var(--ok)','Closed':'var(--ink-4)'};
const NEXT_T={'Find their handle':'warn','Find their full name':'warn','Needs research':'warn','Skip for now':'ghost','Send first message':'out','Send follow-up 1':'out','Send follow-up 2':'out','Wait for reply':'ghost','Reply now':'mid','Prep the call':'mid','Check in monthly':'ok','Nothing to do':'ghost','Mark as no reply':'warn','Queued for later':'ghost','Updating…':'ghost'};
const AVP=[['oklch(0.93 0.04 258)','oklch(0.42 0.12 258)'],['oklch(0.93 0.045 158)','oklch(0.4 0.1 158)'],['oklch(0.93 0.04 300)','oklch(0.42 0.13 300)'],['oklch(0.94 0.05 75)','oklch(0.45 0.1 60)'],['oklch(0.93 0.03 210)','oklch(0.42 0.08 210)'],['oklch(0.93 0.035 25)','oklch(0.46 0.12 25)']];
const avatar=s=>{s=String(s||'?').replace(/^@/,'');let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;const p=AVP[h%AVP.length];return{avBg:p[0],avFg:p[1],ini:s.split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()};};
const BTN={primary:{bg:'var(--ink)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.25), inset 0 1px 0 rgba(255,255,255,.14)'},secondary:{bg:'var(--glass-strong)',fg:'var(--ink)',sh:'var(--shadow-sm), var(--hi)'},ghost:{bg:'transparent',fg:'var(--ink-2)',sh:'inset 0 0 0 1px var(--hairline-strong)'},copied:{bg:'var(--ok-soft)',fg:'var(--ok-ink)',sh:'inset 0 0 0 1px var(--ok-line)'},out:{bg:'var(--out)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.2), inset 0 1px 0 rgba(255,255,255,.22)'},mid:{bg:'var(--mid)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.2), inset 0 1px 0 rgba(255,255,255,.22)'},in:{bg:'var(--in)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.2), inset 0 1px 0 rgba(255,255,255,.22)'}};
const act=(label,kind,fn)=>({label,...(BTN[kind]||BTN.secondary),fn});
const stop=fn=>e=>{if(e&&e.stopPropagation)e.stopPropagation();fn(e);};
const mkChart=(data,W,H,pad=12)=>{const max=Math.max(1,...data)*1.1;const st=data.length>1?W/(data.length-1):0;const pts=data.map((v,i)=>[+(i*st).toFixed(1),+(H-(v/max)*(H-pad)).toFixed(1)]);return{line:pts.map(p=>p.join(',')).join(' '),area:'M0,'+H+' L'+pts.map(p=>p.join(',')).join(' L')+' L'+W+','+H+' Z',dots:pts.map((p,i)=>({cx:String(p[0]),cy:String(p[1]),v:data[i]})),max};};
const open=url=>{const u=AK.safeUrl(url);if(u)window.open(u,'_blank','noopener');};

const PAGES={home:{sec:'home',label:'Home'},send:{sec:'out',label:'Send today'},pipeline:{sec:'out',label:'Pipeline'},inbox:{sec:'mid',label:'Replies and calls'},calendar:{sec:'in',label:'Calendar'},posts:{sec:'in',label:'Our posts'},tracker:{sec:'in',label:'Post tracker'},pdm:{sec:'mid',label:'People to DM'},comps:{sec:'in',label:'Competitors'}};
const SECS=[{id:'home',label:'Home',pages:['home']},{id:'out',label:'Outbound',hint:'DMs we send',pages:['send','pipeline']},{id:'in',label:'Inbound',hint:'Posts that bring buyers to us',pages:['calendar','posts','tracker','comps']},{id:'mid',label:'Midbound',hint:'People who replied or reacted',pages:['inbox','pdm']}];
const SECLBL={home:'Home',out:'Outbound',in:'Inbound',mid:'Midbound'};
const ACC={home:{c:'var(--ink)',ink:'var(--ink-2)',soft:'var(--n-soft)',btn:'primary'},out:{c:'var(--out)',ink:'var(--out-ink)',soft:'var(--out-soft)',btn:'out'},mid:{c:'var(--mid)',ink:'var(--mid-ink)',soft:'var(--mid-soft)',btn:'mid'},in:{c:'var(--in)',ink:'var(--in-ink)',soft:'var(--in-soft)',btn:'in'}};
const CFG=window.CRM_CONFIG||{};const BRAND=CFG.brand||'CRM';
const OWNERS=['Everyone',...Object.keys(AK.HANDLES)];
const TIPS=['fq','pilot','cant','fund','fit','likely','verdict','target','eng1k','week','dms','rank','groups','skip'];
const CST={Posted:{dot:'var(--ok)',bg:'var(--ok-soft)',fg:'var(--ok-ink)'},Scheduled:{dot:'var(--ink-3)',bg:'var(--n-soft)',fg:'var(--ink-2)'},'To post':{dot:'var(--warn)',bg:'var(--warn-soft)',fg:'var(--warn-ink)'}};
// Founder call, 29 Oct 2026: DMs wait until the accounts have presence and the Forbes piece is out.
// Daily slots (team ask, 2 Nov): every X account posts 3 a day, one per slot. Our Posts AB "Daily slot" says which;
// rows from before then fall back to their post type. The calendar, the Drafts picker and Our posts filter on these.
const SLOTS3=['Account tag','Founder','Data & product'];
const SLOT_HINT={'Account tag':'Tag ICP people or companies: a map, shoutout or insight','Founder':'The founders\u2019 life, a story or milestone, with their photo','Data & product':'Data, tech or startup post with a real clip or image of the product'};
const slotOf=o=>{const v=String(o['Daily slot']||'').trim();if(SLOTS3.includes(v))return v;const t=String(o['Post type']||'');
  return /tag/i.test(t)?'Account tag':/founder|behind the scenes/i.test(t)?'Founder':/data|lead magnet|how it works|operator floor|company news/i.test(t)?'Data & product':'';};
const POST_KINDS=[...SLOTS3,'Other'];
const kindOf=t=>/lead magnet/i.test(t)?'Lead magnet':/founder story/i.test(t)?'Founder story':/data/i.test(t)?'Data post':/tag/i.test(t)?'Tagging post':'Other';
// Calendar (31 Oct): one board per account, a column per day. Posts the team puts there (Our Posts column Z "Calendar" =
// Yes) plus everything posted or scheduled; drafts never land there on their own. The sheet keeps times in IST; the board shows them in IST or Pacific time.
// Posted and scheduled posts show on their own (31 Oct ask); Calendar "No" = someone took it off with the bin.
// LinkedIn (2 Nov): the same boards for each account's LinkedIn, from Our Posts rows whose Platform is "LinkedIn".
const platOf=o=>/linkedin/i.test(String(o.Platform||''))?'LinkedIn':'X';
const LI_NAME=Object.fromEntries((CFG.accounts||[]).map(a=>[a.name,a.liName||a.name]));
const onCal=p=>{const c=String(p.o.Calendar||'').trim().toLowerCase();return c==='yes'||(c!=='no'&&(!!p.link||p.status==='Scheduled'));};
const CAL_TYPES=['Lead magnet','Founder story','Data post','Tagging post','How it works','Contrarian take','Company news','Behind the scenes','Operator floor data'];
const CAL_AIMED=CFG.aimed||['Everyone'];
const CAL_ST=['Draft','Ready to post','Scheduled','Posted'];
const CAL_PILL={Draft:['var(--n-soft)','var(--ink-2)'],Scheduled:['var(--in-soft)','var(--in-ink)'],Posted:['var(--ok-soft)','var(--ok-ink)']};
const KIND_DOT={'Account tag':'var(--mid)','Founder':'oklch(0.68 0.16 45)','Data & product':'var(--out)',Other:'var(--ink-4)'};
const ZONES={ist:{tz:'Asia/Kolkata',label:'IST'},pst:{tz:'America/Los_Angeles',label:'PST'}};
const zparts=(ms,tz)=>{const o={};new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(ms)).forEach(x=>{o[x.type]=+x.value||0;});return{y:o.year,m:o.month-1,d:o.day,H:o.hour%24,M:o.minute};};
const wallToMs=(y,m,d,H,M,tz)=>{let g=Date.UTC(y,m,d,H,M);for(let i=0;i<2;i++){const p=zparts(g,tz);g+=Date.UTC(y,m,d,H,M)-Date.UTC(p.y,p.m,p.d,p.H,p.M);}return g;};
const hasTime=t=>/\d{1,2}:\d{2}/.test(String(t||''));
const t12=(H,M)=>((H%12)||12)+':'+String(M).padStart(2,'0')+' '+(H<12?'AM':'PM');
const dkey=(y,m,d)=>y+'-'+m+'-'+d;
// Where a post sits in a zone: its day there and its "HH:MM" (blank when the post has no time yet).
const calWhere=(o,zone)=>{const d=o._date;if(!d)return null;const t=o['Time (IST)'];
  if(!hasTime(t))return{key:dkey(d.getFullYear(),d.getMonth(),d.getDate()),hm:'',sort:-1};
  const mi=AK.minutesOf(t);const p=zparts(wallToMs(d.getFullYear(),d.getMonth(),d.getDate(),Math.floor(mi/60),mi%60,'Asia/Kolkata'),ZONES[zone].tz);
  return{key:dkey(p.y,p.m,p.d),hm:String(p.H).padStart(2,'0')+':'+String(p.M).padStart(2,'0'),sort:p.H*60+p.M};};
// Back to the sheet: a day in the zone ("y-m-d") and "HH:MM" or '' -> IST date "D Mon YYYY" and time "7:30 PM" or ''.
const toIst=(key,hm,zone)=>{const [y,m,d]=key.split('-').map(Number);if(!hm)return{date:d+' '+AK.MON[m]+' '+y,time:''};
  const [H,M]=hm.split(':').map(Number);const p=zparts(wallToMs(y,m,d,H,M,ZONES[zone].tz),'Asia/Kolkata');return{date:p.d+' '+AK.MON[p.m]+' '+p.y,time:t12(p.H,p.M)};};
const dfmt=d=>d.getDate()+' '+AK.MON[d.getMonth()]+' '+d.getFullYear();
// Midbound (2 Nov): every replier gets a verdict from the engager-replies task (Post Engagers S, why in T).
// "DM + reply" = fits our ICP and can buy or refer; "Reply only" = relevant people worth a public answer;
// "Skip" = everyone else. Rows from before verdicts existed fall back to the old Fit column.
const verdictOf=e=>{const v=String(e.Verdict||'').trim();if(v)return v;return /Core buyer|Good fit/.test(e.Fit||'')?'DM + reply':/Related/.test(e.Fit||'')?'Reply only':'Skip';};
const VERD_T={'DM + reply':'solid','Reply only':'mid',Skip:'ghost'};
const openStatus=e=>!/^(Messaged|Dismissed|Do not contact)$/.test(e.Status||'');
const DM_HOLD={on:'DMs are paused, so nothing shows as ready to send or follow-up due. Replies still show in Inbox.',off:'DMs are on. Press Pause DMs to hide everything unsent until you start again.'};

/* sheet <-> design */
const SHEET2STAGE={'To send':'To send','Sent':'Sent','FU1 sent':'Follow-up 1 sent','FU2 sent':'Follow-up 2 sent','Replied':'Replied','Call booked':'Call booked','Customer':'Customer','Not now':'Closed','No reply':'Closed','Do not contact':'Closed'};
const STAGE2SHEET={'To send':'To send','Sent':'Sent','Follow-up 1 sent':'FU1 sent','Follow-up 2 sent':'FU2 sent','Replied':'Replied','Call booked':'Call booked','Customer':'Customer'};
const accOf=o=>o;          // design owner -> sheet Account/Owner
const ownerName=a=>a||'–'; // sheet -> design
const avName=n=>n;
const fmtK=AK.fmtK,num=AK.num;
const r1=x=>Math.round(x*10)/10;
const firstLine=s=>String(s||'').split('\n').map(x=>x.trim()).filter(Boolean)[0]||'';
const clip=(s,n)=>{s=String(s||'');return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;};
const hhmm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
const dLabel=t=>{const d=new Date(t);return d.getDate()+' '+AK.MON[d.getMonth()];};
const isoLocal=d=>d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'):'';
const store={get(k,d){try{const v=localStorage.getItem('ak-crm-'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem('ak-crm-'+k,JSON.stringify(v));}catch(e){}}};
const byPri=(a,b)=>((b.priN==null?-99:b.priN)-(a.priN==null?-99:a.priN))||((b.fitN||0)-(a.fitN||0))||a.name.localeCompare(b.name);

function person(c){
  const stage=SHEET2STAGE[c._status]||'To send';
  const act=c['Next action']||'';
  const fk=AK.fundKind(c);const fRaw=String(c['Funding stage']||'');const fShort=fRaw.split(/\s+[·–-]\s+/)[0].trim();
  const m=AK.messages(c);
  const pn=c._pri;const fitN=c._fit;
  const lk=String(c['Likely to buy']||'');const li=lk.indexOf(':');
  const ch=String(c.Channel||'');
  const d=['Sent on','FU1 sent','FU2 sent','Replied on','Call on'].map(k=>c[k]||'');
  const callD=c['Call on']?AK.cellDate(c['Call on']):null;
  return {id:c._key,c,row:c._row,name:c.Name,first:AK.firstName(c.Name),role:c.Role||'',company:c.Company||'',owner:ownerName(c.Owner),ownerRaw:c.Owner||'',
    stage,status:c._status,act,due:AK.bucket('fu').test(act),fuN:/FU2/.test(act)?2:1,
    fund:fk==='ok'?'late':fk==='early'?'early':fk==='unknown'?'unknown':'none',funding:fShort||'Not checked yet',fundingFull:fRaw,src:c['Funding source']||'',sendable:AK.sendable(c),
    priN:pn,pri:pn==null?3:pn>=10?1:pn>=7?2:3,fitN,fit:fitN==null?'–':fitN>=9?'Strong':fitN>=7?'Good':'Weak',
    likely:lk?(li>0?lk.slice(0,li).trim():lk):'',likelyWhy:li>0?lk.slice(li+1).trim():'',
    why:AK.plain(c['Signal (why now)']||''),whyTime:c['Signal time']||'',handle:c['X handle']||'',linkedin:c.LinkedIn||'',email:c.Email||'',
    ch:/^x/i.test(ch)?'X':ch||'–',tpl:c.Template||'',opener:m.opener,f1:m.fu1,f2:m.fu2,result:c['DM result']||'',
    said:'',saidWhen:'',call:callD?(AK.dayWord(callD)+(callD.getHours()||callD.getMinutes()?', '+hhmm(callD):'')):'',callIso:isoLocal(callD),
    d,fu1Due:c['FU1 due']||'',fu2Due:c['FU2 due']||'',notes:c.Notes||''};
}

class Component extends DCLogic {
  state=(()=>{let page='home';try{page=localStorage.getItem('ak-crm-page')||'home';}catch(e){} if(!PAGES[page])page='home';
    const dow=(new Date().getDay()+6)%7;
    return {page,owner:'Everyone',cid:null,lastCid:null,toastMsg:'',toastUndo:null,toastErr:false,toastOn:false,narrow:false,done:{},more:{},leaving:{},copied:null,tip:null,loading:true,entered:false,pal:false,palQ:'',notes:{},callAt:{},
    pend:{},anyway:store.get('anyway',{}),v:0,
    pipeTab:'Board',sortKey:'pri',sortDir:1,fFund:'All',fStage:'Any stage',fCh:'Any channel',allCols:false,dragId:null,dragOver:null,
    week:0,calDay:dow,postsTab:'To post',postType:'All',addOpen:false,addF:null,calPick:null,calPickKind:'All',calZone:store.get('calZone','ist')==='pst'?'pst':'ist',calPlat:store.get('calPlat','X')==='LinkedIn'?'LinkedIn':'X',postPlat:'All',calOpen:{},calKind:'All',calEd:{},calLink:null,calLinkVal:'',linkFor:null,linkVal:'',cmpId:null,cmpOn:false,pdmTab:'To message',compTab:'Competitors',compId:null,compFilter:'All',trkMore:false};})();
  rootRef=React.createRef(); mainRef=React.createRef(); palRef=React.createRef();
  componentDidMount(){
    const el=this.rootRef.current;
    if(el&&window.ResizeObserver){this.ro=new ResizeObserver(es=>{const n=es[0].contentRect.width<860;if(n!==this.state.narrow)this.setState({narrow:n});});this.ro.observe(el);}
    this.onKey=e=>{if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();this.openPal();} if(e.key==='Escape')this.setState({cid:null,cmpOn:false,pal:false});};
    window.addEventListener('keydown',this.onKey);
    AK.hooks.toast=(m,err)=>this.toast(m,null,err);
    this.unsub=AK.subscribe(()=>this.onData());
    this.onData();
  }
  componentWillUnmount(){this.ro&&this.ro.disconnect();window.removeEventListener('keydown',this.onKey);this.unsub&&this.unsub();clearTimeout(this.tt);clearTimeout(this.lt);clearTimeout(this.ct);}
  onData(){
    const ready=!!AK.S.raw.pipeline;
    if(ready&&!this.ready){this.ready=true;this.load(300);}
    else this.setState({v:AK.version()});
  }
  load(ms){clearTimeout(this.lt);this.setState({loading:true,entered:false});this.lt=setTimeout(()=>{this.setState({loading:false});requestAnimationFrame(()=>requestAnimationFrame(()=>this.setState({entered:true})));},ms);}
  go(page,extra){try{localStorage.setItem('ak-crm-page',page);}catch(e){} this.setState({page,cid:null,pal:false,cmpOn:false,...(extra||{})}); if(this.mainRef.current)this.mainRef.current.scrollTop=0; if(this.ready)this.load(380);}
  toast(msg,undo,err){clearTimeout(this.tt);this.setState({toastMsg:msg,toastUndo:undo||null,toastErr:!!err,toastOn:true});this.tt=setTimeout(()=>this.setState({toastOn:false}),err?7000:undo?5000:3400);}
  copy(text,key,msg){
    if(!text){this.toast('There’s nothing to copy here yet.',null,true);return;}
    const done=()=>{clearTimeout(this.ct);this.setState({copied:key});this.ct=setTimeout(()=>this.setState({copied:null}),1600);this.toast(msg||'Copied');};
    const fallback=()=>{try{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();if(ok){done();return;}}catch(e){} this.toast('Copying is blocked in this view. Select the text and copy it yourself.',null,true);};
    try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,fallback);else fallback();}catch(e){fallback();}
  }
  copyBtn(key,label){const on=this.state.copied===key;return{label:on?'Copied ✓':label,...(on?BTN.copied:BTN.secondary)};}
  openC(id){this.setState({cid:id,lastCid:id});}
  openPal(){this.setState({pal:true,palQ:''});setTimeout(()=>this.palRef.current&&this.palRef.current.focus(),60);}

  /* ---------- data, mapped to the design's shapes ---------- */
  allPeople(){const v=AK.version();if(this._pv!==v){this._pv=v;this._people=AK.M.contacts.map(person);}
    const pend=this.state.pend;if(!Object.keys(pend).length)return this._people;
    return this._people.map(p=>pend[p.id]?{...p,stage:pend[p.id],act:'Updating…',due:false}:p);}
  findP(id){return this.allPeople().find(p=>p.id===id);}
  ppl(){const o=this.state.owner;const all=this.allPeople();if(o==='Everyone')return all;const a=accOf(o);return all.filter(p=>p.ownerRaw===a);}
  accs(){const o=this.state.owner;const A=Object.keys(AK.HANDLES).map(a=>({id:ownerName(a),name:ownerName(a),acc:a,handle:'@'+AK.HANDLES[a]}));return o==='Everyone'?A:A.filter(a=>a.id===o);}
  own(account){const o=this.state.owner;return o==='Everyone'||accOf(o)===account;}
  canSend(p){return p.sendable||!!this.state.anyway[p.id];}
  lists(P){const B=id=>AK.bucket(id);
    if(AK.dmsPaused())P=P.filter(p=>p.stage==='Replied'||p.stage==='Call booked'||p.act==='Reply now');
    return {fu:P.filter(p=>p.due),ts:P.filter(p=>B('send').test(p.act)&&this.canSend(p)).sort(byPri),skip:P.filter(p=>B('send').test(p.act)&&!this.canSend(p)).sort(byPri),
      find:P.filter(p=>B('research').test(p.act)).sort(byPri),noreply:P.filter(p=>B('noreply').test(p.act)).sort(byPri),
      rep:P.filter(p=>p.stage==='Replied'||p.act==='Reply now').sort(byPri),calls:P.filter(p=>p.stage==='Call booked').sort(byPri)};}
  fundPill(p){if(p.fund==='early')return pill(p.funding+': skip','warn');if(p.fund==='unknown')return pill('Funding unknown','ghost');if(p.fund==='none')return pill('Funding not checked','ghost');return pill(p.funding,'neutral');}
  nextOf(p){const a=p.act,B=id=>AK.bucket(id);
    if(a==='Updating…')return 'Updating…';
    if(B('reply').test(a)||p.stage==='Replied')return 'Reply now';
    if(B('fu').test(a))return /FU2/.test(a)?'Send follow-up 2':'Send follow-up 1';
    if(B('call').test(a)||p.stage==='Call booked')return 'Prep the call';
    if(B('send').test(a))return this.canSend(p)?'Send first message':'Skip for now';
    if(a==='Find X handle first')return 'Find their handle';
    if(a==='Enrich name first')return 'Find their full name';
    if(B('noreply').test(a))return 'Mark as no reply';
    if(p.stage==='Customer')return 'Check in monthly';
    if(p.stage==='Closed'||a==='Closed')return 'Nothing to do';
    if(a==='Queued')return 'Queued for later';
    if(p.status==='Needs research')return 'Needs research';
    if(/^(Sent|Follow-up)/.test(p.stage))return 'Wait for reply';
    return a||'Nothing to do';}
  nextMsg(p){if(p.due)return p.fuN===2?{title:'Follow-up 2',text:p.f2}:{title:'Follow-up 1',text:p.f1};
    if(p.stage==='Sent')return{title:'Follow-up 1',text:p.f1};if(p.stage==='Follow-up 1 sent')return{title:'Follow-up 2',text:p.f2};return{title:'First message',text:p.opener};}

  /* ---------- saves ---------- */
  sheetStatus(p,stage){if(stage==='Closed')return ['Sent','FU1 sent','FU2 sent'].includes(p.status)?'No reply':'Not now';return STAGE2SHEET[stage]||'To send';}
  async saveCells(p,cells,msg){
    if(this.founder)return false;
    const c=AK.M.contacts.find(x=>x._key===p.id)||p.c;
    const undo=AK.undoCells(c,cells);
    const ok=await AK.write(c,cells,msg,{quiet:true});
    if(ok)this.toast(msg,()=>this.undoCells(p.id,undo,p.first));
    return ok;
  }
  async undoCells(id,cells,first){
    const c=AK.M.contacts.find(x=>x._key===id);if(!c){this.toast('That row is gone from the sheet, so nothing was undone.',null,true);return;}
    const ok=await AK.write(c,cells,'undo',{quiet:true});if(ok)this.toast('Undone. '+first+' is back as before.');
  }
  async setStage(id,stage,msg){
    const p=this.findP(id);if(!p||this.founder||p.stage===stage)return;
    const c=AK.M.contacts.find(x=>x._key===id)||p.c;
    const cells=AK.statusCells(c,this.sheetStatus(p,stage));
    this.setState(s=>({pend:{...s.pend,[id]:stage}}));
    await this.saveCells(p,cells,msg||(p.first+' moved to '+stage));
    this.setState(s=>{const x={...s.pend};delete x[id];return{pend:x};});
  }
  markSent(id){const p=this.findP(id);if(!p)return;
    const nx=p.due?(p.fuN===2?'Follow-up 2 sent':'Follow-up 1 sent'):({'To send':'Sent','Sent':'Follow-up 1 sent','Follow-up 1 sent':'Follow-up 2 sent'}[p.stage]||p.stage);
    this.setState(s=>({leaving:{...s.leaving,[id]:true}}));
    setTimeout(()=>{this.setState(s=>{const l={...s.leaving};delete l[id];return{leaving:l};});this.setStage(id,nx,'Marked as sent to '+p.first);},300);}
  saveCall(p){const v=this.state.callAt[p.id];if(v==null||v===p.callIso||!v)return;
    const d=new Date(v);if(isNaN(d)){this.toast('Pick a full date and time first.',null,true);return;}
    const cells={'Call on':AK.sheetSerial(d,true)};if(p.stage!=='Call booked'&&p.stage!=='Customer')cells.Status='Call booked';
    this.saveCells(p,cells,'Call with '+p.first+' set for '+AK.dayWord(d)+', '+hhmm(d)).then(ok=>{if(ok)this.setState(s=>{const x={...s.callAt};delete x[p.id];return{callAt:x};});});}
  saveNote(p){const v=this.state.notes[p.id];if(v==null||v===p.notes)return;
    this.saveCells(p,{Notes:v},'Notes saved for '+p.first).then(ok=>{if(ok)this.setState(s=>{const x={...s.notes};delete x[p.id];return{notes:x};});});}

  tipFor(k){const on=this.state.tip===k;return{show:stop(()=>{if(this.state.tip!==k)this.setState({tip:k});}),op:on?'1':'0',tf:on?'translateY(0)':'translateY(-4px)'};}
  tabs(items,cur,set){return items.map(([label,count])=>{const on=label===cur;return{label,count:count||'',hasCount:!!count,go:()=>set(label),bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-3)',sh:on?'var(--shadow-sm), var(--hi)':'none',cbg:on?'var(--n-soft-2)':'var(--n-soft)'};});}
  frame(){const f=this.props.frame??'Fluid';
    if(f==='Phone 375')return{w:'375px',h:'812px',r:'46px',s:'0 0 0 9px #141519, 0 0 0 10px #3a3b41, 0 50px 100px -30px rgba(0,0,0,.45)',m:'40px 24px',phone:true,tabPad:'22px'};
    if(f==='Desktop 1280')return{w:'1280px',h:'820px',r:'16px',s:'0 0 0 1px rgba(19,20,24,.08), 0 40px 100px -40px rgba(0,0,0,.35)',m:'32px',phone:false,tabPad:'8px'};
    return{w:'100%',h:'100vh',r:'0px',s:'none',m:'0px',phone:false,tabPad:'8px'};}
  engagers(){return AK.M.engagers.filter(e=>this.own(e.Account));}
  counts(P){const L=this.lists(P);return{send:L.ts.length+L.fu.length,inbox:L.rep.length+L.calls.length+this.postReplies().length,pdm:this.pdmCards().filter(p=>p.status==='To message').length};}
  navVals(c){const s=this.state;const badges={send:c.send,inbox:c.inbox,pdm:c.pdm};
    return SECS.map(sec=>({label:sec.label,hint:sec.hint||'',hasHead:sec.id!=='home',accent:ACC[sec.id].c,pages:sec.pages.map(id=>{const on=s.page===id;const b=badges[id]||0;return{label:PAGES[id].label,go:()=>this.go(id),bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-2)',fw:on?'600':'450',sh:on?'var(--shadow-sm), var(--hi)':'none',dot:on?ACC[sec.id].c:'transparent',dotS:on?'scale(1)':'scale(.4)',hasBadge:b>0,badge:String(b),badgeBg:on?ACC[sec.id].c:ACC[sec.id].soft,badgeFg:on?'#fff':ACC[sec.id].ink};})}));}
  ownerVals(){return OWNERS.map(o=>{const on=this.state.owner===o;const a=o==='Everyone'?{avBg:'var(--n-soft-2)',avFg:'var(--ink-2)',ini:'∗'}:avatar(avName(o));return{label:o,...a,pick:()=>this.setOwner(o),bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-3)',sh:on?'var(--shadow-sm), var(--hi)':'none'};});}
  setOwner(o){if(o===this.state.owner)return;this.setState({owner:o});if(this.ready)this.load(320);}

  /* ---------- posts ---------- */
  trackedBy(){const v=AK.version();if(this._tv!==v){this._tv=v;this._tracked=AK.trackedPosts();this._tmap=new Map(this._tracked.map(t=>[t.key,t]));}return this._tmap;}
  postObj(o){
    const st=AK.postStage(o);const status={posted:'Posted',scheduled:'Scheduled',later:'Later',topost:'To post'}[st];
    const t=AK.originalFor(o);const comp=(t&&t._comp?t._comp.Name:null)||(t&&t.Competitor)||o.Competitor||'A competitor';
    const tr=this.trackedBy().get(AK.linkKey(o['Posted link']));
    const ov=tr&&tr.views!=null?tr.views:num(o.Views),ol=tr?tr.likes:num(o.Likes);
    const media=String(o['Media needed']||'');const needsMedia=!!media&&!/^(none|text only|no media)/i.test(media);
    const folder=AK.FOLDERS.find(f=>o['Drive folder']&&(o['Drive folder'].indexOf(f.id)>=0||AK.norm(o['Drive folder']).indexOf(AK.norm(f.name))>=0));
    const time=st==='later'?'Later':o._date?AK.dayWord(o._date)+(o['Time (IST)']?', '+o['Time (IST)']+' IST':''):'Not set';
    const cNums=!t?'Its numbers aren’t saved in Their posts':t._li?fmtK(num(t.Reactions))+' reactions · '+fmtK(num(t.Comments))+' comments':(num(t.Views)?fmtK(num(t.Views))+' views · ':'')+fmtK(num(t.Likes))+' likes';
    const ptype=String(o['Post type']||'').trim();
    // Suggested media (Our Posts AA, filled by the media-picks task): "File name | Drive link | why it fits".
    const sg=String(o['Suggested media']||'').split('|').map(x=>x.trim());const sugUrl=AK.safeUrl(sg[1]||'');
    return {id:o._key,o,status,ptype,kind:slotOf(o)||'Other',slot:slotOf(o),comp,compH:t?(t.Account||'')+(t.Platform?' · '+t.Platform:''):(o.Platform||'X'),
      rankLabel:(ptype?ptype+' · ':'')+(t&&t._vrank?'#'+t._vrank+' of '+t._vrankN+' for '+comp:'Original not saved yet'),rankOf:comp,
      cText:(t&&t['Full text'])||o['Their post']||'',cNums,acc:ownerName(o.Account),account:o.Account,time,
      text:o['Our version']||'',changed:String(o['What we changed']||'').split('\n').map(x=>x.trim()).filter(Boolean).join('; ')||'Nothing noted.',
      tipText:'Where this post ranks among the '+comp+' posts we saved, by views. #1 is their biggest one.'+(o['What we changed']&&o.Competitor!=='Our own'?' What we changed: '+String(o['What we changed']).split('\n').map(x=>x.trim()).filter(Boolean).join('; '):''),
      media:media||'No media needed',needsMedia,folder,sug:sugUrl?{name:sg[0]||'Open file',url:sugUrl,why:sg[2]||'',video:/\.(mp4|mov|webm|m4v)$/i.test(sg[0]||''),
        thumb:'https://drive.google.com/thumbnail?id='+((sugUrl.match(/\/d\/([\w-]{20,})/)||[])[1]||'')+'&sz=w600'}:null,q:o['Founder question']||'',link:o['Posted link']||'',
      ourViews:ov!=null?fmtK(ov):'',ourLikes:ol!=null?fmtK(ol):'0',when:(o._date?o._date.getTime():9e15)+AK.minutesOf(o['Time (IST)'])*6e4};
  }
  postList(){const v=AK.version();if(this._opv!==v){this._opv=v;this._posts=AK.M.ours.map(o=>this.postObj(o));}return this._posts;}
  ownPosts(){const ORD={'To post':0,'Scheduled':1,'Posted':2,'Later':3};
    const pl=this.state.postPlat;
    return this.postList().filter(p=>this.own(p.account)&&(pl==='All'||platOf(p.o)===pl)).sort((a,b)=>(ORD[a.status]-ORD[b.status])||(a.status==='Posted'?b.when-a.when:a.when-b.when));}
  openPost(id){const p=this.postList().find(x=>x.id===id);if(!p)return;this.go('posts',{postsTab:p.status,cmpId:id,cmpOn:true});}

  /* ---------- header ---------- */
  hdrVals(P){const s=this.state;const page=s.page;const sec=PAGES[page].sec;const A=ACC[sec];const B=BTN[A.btn];
    const L=this.lists(P);const rep=L.rep,calls=L.calls,fu=L.fu,ts=L.ts;
    let h={eyebrow:SECLBL[sec]+' · '+PAGES[page].label,title:PAGES[page].label,next:'',cta:'',go:null};
    const g=AK.gate();
    if(page==='home'){h.eyebrow='Home · today';h.title=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
      if(rep[0])h={...h,next:'Reply to '+rep[0].name+' at '+rep[0].company+' first.'+(rep.length>1?' '+(rep.length-1)+' other '+(rep.length-1===1?'reply is':'replies are')+' waiting.':''),cta:'Open reply',go:()=>this.openC(rep[0].id)};
      else if(fu[0])h={...h,next:'No replies waiting. '+fu.length+' follow-up'+(fu.length===1?' is':'s are')+' due, starting with '+fu[0].name+'.',cta:'Go to Send today',go:()=>this.go('send')};
      else{const today=this.ownPosts().filter(p=>p.status!=='Later'&&p.o._date&&AK.sameDay(p.o._date,new Date()));
        h={...h,next:'No replies waiting. '+(AK.dmsPaused()?'DMs are paused for now, so today':'Today')+' is about posts: '+today.length+' planned for today.',cta:'Open Calendar',go:()=>this.go('calendar')};}}
    if(page==='send'&&AK.dmsPaused()){h.title='Send today';h.next='DMs are paused. Press Resume DMs when you want to start again.';}
    else if(page==='send'){h.title='Send today';h.next=fu.length?fu.length+' follow-ups are due. Send those first, then '+ts.length+' first messages.':ts.length+' first messages are ready, best fit first.';h.cta=fu.length?'Start with '+fu[0].first:'';h.go=fu[0]?()=>this.openC(fu[0].id):null;}
    if(page==='pipeline'){const sent=P.filter(p=>['Sent','Follow-up 1 sent','Follow-up 2 sent'].includes(p.stage)).length;
      h.next=rep.length?rep.length+' people replied and are waiting on us. Calls come next: '+calls.length+' booked.':P.length+' people in the pipeline. '+sent+' have a message out and nobody is waiting on a reply from us.';h.cta=rep.length?'Open replies':'';h.go=rep.length?()=>this.go('inbox'):null;}
    if(page==='inbox'){h.title='Replies and calls';h.next=rep[0]?'Reply to '+rep[0].first+' at '+rep[0].company+'. Then prep for '+(calls[0]?calls[0].first+'’s call'+(calls[0].call?' on '+calls[0].call:''):'your next call')+'.':calls[0]?'Nobody is waiting on a reply. Prep for '+calls[0].first+'’s call'+(calls[0].call?' on '+calls[0].call:'')+'.':(()=>{const R=this.postReplies();const b=R.filter(e=>verdictOf(e)==='DM + reply');return R.length?R.length+(R.length===1?' reply is':' replies are')+' worth answering'+(b.length?', '+b.length+' from people who fit our ICP. Start with '+String(b[0].Name||b[0].Handle).split(' ')[0]+'.':'. Reply under their comments.'):'Nobody is waiting on a reply.';})();h.cta=rep[0]?'Reply to '+rep[0].first:calls[0]?'Prep the call':'';h.go=rep[0]?()=>this.openC(rep[0].id):calls[0]?()=>this.openC(calls[0].id):null;}
    if(page==='calendar'){const today=new Date();const n=this.postList().filter(p=>onCal(p)&&p.o._date&&AK.sameDay(p.o._date,today)).length;
      h.next=n?n+' post'+(n===1?' is':'s are')+' on the calendar for today.':'Nothing is on the calendar for today yet.';h.cta='';h.go=null;}
    if(page==='posts'){const tp=this.ownPosts().filter(p=>p.status==='To post');const n=tp[0];
      h.next=n?tp.length+' post'+(tp.length===1?' is':'s are')+' ready to go out. '+n.acc+'’s '+n.comp+' copy ('+n.time.replace(/^[A-Z][a-z]/,x=>x.toLowerCase())+') is next'+(n.q?', and it has a question for the founders.':'.'):'Nothing is waiting to go out. Pick one of the best posts below to copy next.';
      h.cta=n?'Copy our version':'';h.go=n?()=>this.copy(n.text,'hdr','Our version copied'):null;}
    if(page==='tracker'){const W=AK.weekGrid(this.accs().map(a=>a.acc));const miss=[];
      const and=a=>a.length>1?a.slice(0,-1).join(', ')+' and '+a[a.length-1]:a[0];
      for(const r of W){const d=r.cells.filter(c=>c.k!=='future'&&!c.today&&c.n===0).map(c=>AK.DOW[c.day.getDay()]);if(d.length)miss.push(ownerName(r.account)+' posted nothing on '+and(d));}
      h.next=miss.length?miss.join('. ')+'. Each account posts 3 a day.':'Every account has posted every day this week so far.';h.cta='Open Calendar';h.go=()=>this.go('calendar');}
    if(page==='pdm'){const L2=this.pdmCards().filter(p=>p.status==='To message');
      h.next=L2.length?(L2.length===1?'1 person who fits our ICP is':L2.length+' people who fit our ICP are')+' waiting for a DM. Start with '+L2[0].name+': '+String(L2[0].bio).replace(/\.$/,'')+'.':'No ICP repliers waiting for a DM. Everyone else gets a public reply or nothing.';h.cta=L2.length?'Show who to message':'';h.go=L2.length?()=>this.setState({pdmTab:'To message'}):null;}
    if(page==='comps'){const top=this.compList().filter(c=>c.freshUncopied>0).sort((a,b)=>b.freshUncopied-a.freshUncopied)[0];
      h.next=top?top.name+' posted '+top.freshUncopied+' post'+(top.freshUncopied===1?'':'s')+' in the last 7 days that we haven’t copied yet.':'No competitor has posted anything new and uncopied in the last 7 days.';h.cta=top?'Open '+top.name:'';h.go=top?()=>this.openComp(top.id):null;}
    if(g&&!g.wait){h.next='Nothing to show until the data loads.';h.cta='';h.go=null;}
    if(this.founder&&page!=='home'){h.cta=h.go?h.cta.replace('Copy our version','See posts'):'';}
    return{...h,hasCta:!!(h.cta&&h.go),dot:A.c,ink:A.ink,soft:A.soft,bg:B.bg,fg:B.fg,sh:B.sh};}
  ownPostsFor(acc){return this.postList().filter(p=>p.account===acc);}

  /* ---------- home ---------- */
  homeVals(P){const s=this.state;const E=s.entered;const L=this.lists(P);
    const today=new Date();const planned=this.postList().filter(p=>onCal(p)&&p.o._date&&AK.sameDay(p.o._date,today)).length;
    const fresh=AK.newPosts();const toDM=this.engagers().filter(e=>e.Status!=='Messaged').length;
    const cards=[{label:'Outbound',hint:'DMs we send',dot:'var(--out)',a:String(L.ts.length),aL:'to send today',b:String(L.fu.length),bL:'follow-ups due',go:()=>this.go('send')},{label:'Inbound',hint:'Our posts',dot:'var(--in)',a:String(planned),aL:'posts planned today',b:String(fresh.length),bL:'new competitor posts',go:()=>this.go('calendar')},{label:'Midbound',hint:'People who replied',dot:'var(--mid)',a:String(L.rep.length),aL:'replies waiting',b:String(toDM),bL:'people to DM',go:()=>this.go('inbox')}];
    const raw=[...L.rep.map(p=>({p,k:'r',kind:pill('Reply','mid'),title:'Reply to '+p.name,meta:p.company+(p.result?' · '+clip(p.result,80):''),cta:'Reply'})),...L.fu.map(p=>({p,k:'f',kind:pill('Follow-up','out'),title:this.nextOf(p)+' to '+p.name,meta:(p.role?p.role+' · ':'')+p.company,cta:'Open'})),...L.calls.map(p=>({p,k:'c',kind:pill('Call','mid'),title:'Prep the call with '+p.name,meta:(p.call?p.call+' · ':'')+p.company,cta:'Prep'}))];
    const shown=s.more.todo?raw:raw.slice(0,10);
    const todo=shown.map((t,i)=>{const key=t.p.id+t.k;const d=!!s.done[key];return{kind:t.kind,title:t.title,meta:t.meta,cta:t.cta,open:()=>this.openC(t.p.id),toggle:stop(()=>{this.setState(st=>({done:{...st.done,[key]:!d}}));if(!d)this.toast('Nice. '+(raw.length-raw.filter(x=>({...s.done,[key]:true})[x.p.id+x.k]).length)+' left');}),fill:d?'var(--ink)':'transparent',ring:d?'inset 0 0 0 1.5px var(--ink)':'inset 0 0 0 1.5px var(--hairline-strong)',sc:d?'scale(1.08)':'scale(1)',dash:d?'0':'22',op:d?'.45':'1',strike:d?'line-through':'none',bt:i===0?'none':'1px solid var(--hairline)'};});
    const nd=raw.filter(t=>s.done[t.p.id+t.k]).length;
    const fq=AK.founderAsks().filter(a=>!a.later&&this.own(a.p.Account)).slice(0,4).map(a=>{const p=a.p;const k='fq'+p._key;const b=this.copyBtn(k,'Copy question');
      const ctx='For '+ownerName(p.Account)+'’s post'+(p._date?' '+AK.dayWord(p._date).toLowerCase().replace(/^(\d)/,'on $1'):'')+(p['Time (IST)']?', '+p['Time (IST)']+' IST':'');
      return{id:p._key,q:p['Founder question'],ctx,...b,copy:()=>this.copy('Question for the founders: '+p['Founder question']+' ('+ctx+')',k,'Question copied.')};});
    const accs=this.accs();const fol=this.followers();
    const weeks=AK.M.weekly.filter(w=>!/baseline/i.test(w.Week)&&num(w['Qualified inbound inquiries'])!=null).slice(-6);
    const lastW=weeks[weeks.length-1];const tgtW=(AK.M.weekly.map(w=>w['Inquiry target per week']).filter(Boolean)[0])||'5 to 10';
    return{cards,todo,allDone:raw.length===0,doneLabel:nd+' of '+raw.length+' done',donePct:raw.length?Math.round(nd/raw.length*100)+'%':'100%',hasMoreTodo:raw.length>10&&!s.more.todo,moreTodo:()=>this.setState(st=>({more:{...st.more,todo:true}})),moreTodoN:String(raw.length-10),
      alerts:fresh.slice(0,4).map(t=>{const who=t._comp?t._comp.Name:t.Competitor;const v=num(t.Views);return{who,comp:AK.norm(who),...avatar(who),what:'posted “'+clip(firstLine(t.Hook||t['Full text']),90)+'”',stat:v?fmtK(v)+' views':fmtK(t._eng)+' engagement',when:AK.dayWord(t._date),go:()=>this.openComp(AK.norm(who))};}),hasAlerts:fresh.length>0,
      fq,hasFq:fq.length>0,
      goals:fol.filter(f=>accs.some(a=>a.acc===f.acc)).map(f=>({name:f.name,v:f.v==null?'–':f.v.toLocaleString(),tgt:f.tgt.toLocaleString(),w:E&&f.v?Math.min(100,f.v/f.tgt*100)+'%':'0%'})),
      inqText:lastW?lastW['Qualified inbound inquiries']+' in '+lastW.Week+'. Goal is '+tgtW+' a week.':'No weekly counts typed in yet. Goal is '+tgtW+' a week (Our Accounts tab).',hasInq:weeks.length>0,
      inq:weeks.map((w,i)=>{const v=num(w['Qualified inbound inquiries'])||0;return{h:E?Math.max(4,Math.min(40,v*4))+'px':'4px',bg:i===weeks.length-1?'var(--mid)':'var(--n-soft-2)',dl:(i*60)+'ms',t:w.Week+': '+v+' inquiries'};})};}
  followers(){const out=[];
    for(const a of Object.keys(AK.HANDLES)){const row=AK.M.accounts.find(r=>r.Account===a)||{};
      const tr=AK.M.tracking.filter(r=>r.Account===a&&num(r.Followers)!=null).sort((x,y)=>x._t-y._t);
      const v=tr.length?num(tr[tr.length-1].Followers):num(row['Followers now']);const start=num(row['Followers at start']);
      out.push({acc:a,id:ownerName(a),name:ownerName(a),v,start,first:tr.length?num(tr[0].Followers):null,tgt:num(row['Follower target'])||AK.PILOT.followerTarget});}
    return out;}

  /* ---------- contact panel ---------- */
  panelVals(){const s=this.state;const id=s.cid||s.lastCid;const p=(id&&this.findP(id))||this.allPeople()[0];const f=this.founder;
    if(!p)return{name:'',role:'',company:'',owner:'',ini:'',avBg:'',avFg:'',stageP:pill('',''),stageDot:'',track:[],actions:[],hasActions:false,reach:[],hasReach:false,facts:[],msgs:[],dates:[],callAt:'',note:'',setCall:()=>{},setNote:()=>{},saveCall:()=>{},saveNote:()=>{},ro:true,saveNote2:''};
    const a=avatar(p.name);const i=STAGES.indexOf(p.stage);
    const track=STAGES.slice(0,7).map((st,k)=>{const reached=i<7&&k<=i;const cur=k===i;return{label:SHORT[st],full:st,set:()=>{if(!f&&st!==p.stage)this.setStage(p.id,st);},dotBg:reached?STAGE_DOT[p.stage]:'#fff',sh:cur?'0 0 0 4px '+(TONE[STAGE_T[p.stage]]||TONE.neutral)[0]+', 0 0 0 5px '+(TONE[STAGE_T[p.stage]]||TONE.neutral)[2]:reached?'none':'inset 0 0 0 1.5px var(--hairline-strong)',sc:cur?'scale(1.15)':'scale(1)',fg:cur?'var(--ink)':reached?'var(--ink-2)':'var(--ink-4)',fw:cur?'600':'400',hasLine:k<6,lineBg:i<7&&k<i?STAGE_DOT[p.stage]:'var(--hairline-strong)'};});
    const nm=this.nextMsg(p);const ck=p.id+'pn';const cb=this.copyBtn(ck,'Copy '+nm.title.toLowerCase());
    const cpy=act(cb.label,this.state.copied===ck?'copied':'secondary',()=>this.copy(nm.text,ck,nm.title+' copied'));
    const A={'To send':[cpy,act('Mark first message sent','primary',()=>this.setStage(p.id,'Sent','Marked as sent'))],
      'Sent':[cpy,act('Mark follow-up 1 sent','primary',()=>this.setStage(p.id,'Follow-up 1 sent')),act('They replied','mid',()=>this.setStage(p.id,'Replied'))],
      'Follow-up 1 sent':[cpy,act('Mark follow-up 2 sent','primary',()=>this.setStage(p.id,'Follow-up 2 sent')),act('They replied','mid',()=>this.setStage(p.id,'Replied'))],
      'Follow-up 2 sent':[act('They replied','mid',()=>this.setStage(p.id,'Replied')),act('Close: no reply','ghost',()=>this.setStage(p.id,'Closed'))],
      'Replied':[act('Book a call','mid',()=>this.setStage(p.id,'Call booked','Call booked with '+p.first)),act('Close','ghost',()=>this.setStage(p.id,'Closed'))],
      'Call booked':[act('Mark as customer','primary',()=>this.setStage(p.id,'Customer',p.company+' is a customer')),act('Close','ghost',()=>this.setStage(p.id,'Closed'))],
      'Customer':[],'Closed':[act('Reopen','secondary',()=>this.setStage(p.id,'To send'))]}[p.stage]||[];
    const replied=i>=4&&i<=6;
    const st=n=>{if(n===0)return p.d[0]?['Sent '+p.d[0],'ok']:i>=1&&i<7?['Sent','ok']:['Not sent yet','neutral'];
      if(p.d[n])return['Sent '+p.d[n],'ok'];
      if(replied)return['Not needed: they replied','ghost'];
      if(p.stage==='Closed')return['Not needed','ghost'];
      if(i>n&&i<7)return['Sent','ok'];
      if(i===n)return p.due?['Due today','out']:['Not yet, send on '+((n===1?p.fu1Due:p.fu2Due)||(n===1?'day 3':'day 7')),'neutral'];
      return['Not yet','ghost'];};
    const msgs=[['First message',p.opener],['Follow-up 1',p.f1],['Follow-up 2',p.f2]].map(([t,x],n)=>{const r=st(n);const text=x||'No message written for this yet.';const k=p.id+'m'+n;const b=this.copyBtn(k,'Copy');return{title:t,text,status:pill(r[0],r[1]),copyLabel:b.label,bg:b.bg,fg:b.fg,sh:b.sh,copy:()=>this.copy(x,k,t+' copied'),op:r[1]==='ghost'?'.6':'1'};});
    const DL=['First message','Follow-up 1','Follow-up 2','Replied','Call'];
    const dates=DL.map((l,k)=>{const d=p.d[k];return{label:l,date:d||'Not yet',dot:d?'var(--ink)':'#fff',ring:d?'none':'inset 0 0 0 1.5px var(--hairline-strong)',fg:d?'var(--ink)':'var(--ink-4)',line:k<4?(p.d[k+1]?'var(--ink)':'var(--hairline-strong)'):'transparent'};});
    const xu=AK.xUrl(p.handle),lu=AK.safeUrl(p.linkedin);
    const reach=[...(lu?[{ic:'in',label:'LinkedIn',sub:lu.replace(/^https?:\/\/(www\.)?/,''),go:e=>{e.preventDefault();open(lu);}}]:[]),...(xu?[{ic:'X',label:'X',sub:p.handle,go:e=>{e.preventDefault();open(xu);}}]:[]),...(p.email?[{ic:'@',label:'Email · copy',sub:p.email,go:e=>{e.preventDefault();this.copy(p.email,p.id+'em','Email copied');}}]:[])];
    const res=p.result;const resV=/^not sent/i.test(res)?'Not sent on X':/^sent/i.test(res)?'Sent on X':/^queued/i.test(res)?'Queued on LinkedIn':/^backup/i.test(res)?'Backup contact':res?clip(res,40):(i===0?'Not messaged yet':i<4&&i>0?'No reply yet':i>=4&&i<7?'Replied':'Closed: '+p.status);
    const srcHost=AK.safeUrl(p.src)?AK.host(AK.safeUrl(p.src)):'';
    const fundSub=p.fund==='early'?'Seed or pre-seed: we don’t send first messages to these.'+(srcHost?' Source: '+srcHost:''):p.fund==='late'?'Series A or later, so OK to message.'+(srcHost?' Source: '+srcHost:''):p.fund==='unknown'?'Not clear yet, so held back from first messages. Check before sending.':'Not looked up yet.';
    const LKC=/not a buyer/i.test(p.likely)?'var(--bad-ink)':'var(--ink)';const whyV=p.why?clip(p.why.split(/[.,:]/)[0],48):'No signal yet';
    const ro=f;
    return{...a,id:p.id,name:p.name,role:p.role||'–',company:p.company,owner:p.owner,ownerLabel:'Owner: '+p.owner,stageP:pill(p.stage==='Closed'&&p.status!=='Closed'?'Closed: '+p.status:p.stage,STAGE_T[p.stage]),stageDot:STAGE_DOT[p.stage],track,actions:f?[]:A,hasActions:!f&&A.length>0,
      saveHint:AK.S.pub&&!this.viewOnlyRole?'Changes save as you go.':!AK.canEdit()?'Sign in to change the stage.':'',
      reach,hasReach:reach.length>0,
      facts:[{label:'Most likely to buy from us',v:p.likely||'Not worked out yet',fg:LKC,sub:p.likelyWhy||(p.likely?'':'From their company and role, once the sheet fills it in.')},{label:'Why now',v:whyV,fg:'var(--ink)',sub:(p.why!==whyV?p.why:'')+(p.whyTime?(p.why!==whyV?' · ':'')+p.whyTime:'')},{label:'Funding stage',v:p.funding,fg:p.fund==='early'?'var(--warn-ink)':'var(--ink)',sub:fundSub},{label:'DM result',v:resV,fg:/^not sent/i.test(res)?'var(--bad-ink)':'var(--ink)',sub:res||(p.tpl?'Template '+p.tpl:'')}],
      msgs,dates,callAt:s.callAt[p.id]??p.callIso,setCall:e=>{const v=e.target.value;this.setState(st=>({callAt:{...st.callAt,[p.id]:v}}));},saveCall:()=>this.saveCall(p),
      note:s.notes[p.id]??p.notes,setNote:e=>{const v=e.target.value;this.setState(st=>({notes:{...st.notes,[p.id]:v}}));},saveNote:()=>this.saveNote(p),ro};}
  palVals(){const s=this.state;const q=s.palQ.trim().toLowerCase();
    const ppl=this.allPeople().filter(p=>!q||(p.name+' '+p.company+' '+p.role).toLowerCase().includes(q)).slice(0,q?6:4).map(p=>({...avatar(p.name),title:p.name,sub:(p.role?p.role+' · ':'')+p.company,tag:pill(p.stage,STAGE_T[p.stage]),go:()=>{this.setState({pal:false});this.openC(p.id);}}));
    const comps=this.compList().filter(c=>!q||(c.name+' '+c.handle).toLowerCase().includes(q)).slice(0,q?5:3).map(c=>({...avatar(c.name),title:c.name,sub:c.handle||c.groupLabel,go:()=>this.openComp(c.id)}));
    const pages=Object.keys(PAGES).filter(k=>!q||PAGES[k].label.toLowerCase().includes(q)).slice(0,q?5:4).map(k=>({title:PAGES[k].label,sub:SECLBL[PAGES[k].sec],dot:ACC[PAGES[k].sec].c,go:()=>this.go(k)}));
    return{q:s.palQ,onQ:e=>this.setState({palQ:e.target.value}),onKey:e=>{if(e.key==='Enter'){const f=ppl[0]||comps[0]||pages[0];f&&f.go();}},ppl,comps,pages,hasPpl:ppl.length>0,hasComps:comps.length>0,hasPages:pages.length>0,none:!ppl.length&&!comps.length&&!pages.length,close:()=>this.setState({pal:false}),stop:e=>e.stopPropagation()};}

  /* ---------- outbound ---------- */
  row(p,i,kind){const s=this.state;const a=avatar(p.name);const lv=!!s.leaving[p.id];const f=this.founder;const nm=this.nextMsg(p);const key=p.id+'row';const cb=this.copyBtn(key,kind==='fu'?'Copy '+nm.title.toLowerCase():'Copy message');
    let actions=[];
    if(!f){if(kind==='send'||kind==='fu')actions=[act(cb.label,s.copied===key?'copied':'secondary',stop(()=>this.copy(nm.text,key,nm.title+' for '+p.first+' copied'))),act('Mark sent','primary',stop(()=>this.markSent(p.id)))];
      if(kind==='find')actions=[act('Search on X','secondary',stop(()=>{window.open('https://x.com/search?q='+encodeURIComponent(p.name+' '+p.company)+'&f=user','_blank','noopener');this.toast('Searching X for '+p.name+'. Add the handle in the sheet.');}))];
      if(kind==='skip')actions=[act('Send anyway','ghost',stop(()=>{const any={...this.state.anyway,[p.id]:true};store.set('anyway',any);this.setState({anyway:any});this.toast(p.first+' moved to Send today (on this browser)',()=>{const x={...this.state.anyway};delete x[p.id];store.set('anyway',x);this.setState({anyway:x});this.toast('Undone');});}))];
      if(kind==='noreply')actions=[act('Mark as no reply','secondary',stop(()=>this.setStage(p.id,'Closed','Closed '+p.first+': no reply')))];
      if(kind==='reply')actions=[act('Reply now','mid',stop(()=>this.openC(p.id)))];
      if(kind==='call')actions=[act('Prep the call','mid',stop(()=>this.openC(p.id)))];
      if(kind!=='call')actions.push(act('×','ghost',stop(()=>this.dismissPerson(p))));}
    const nx=this.nextOf(p);
    return{...a,id:p.id,name:p.name,role:p.role||'–',company:p.company,fund:this.fundPill(p),next:pill(nx,NEXT_T[nx]),actions,open:()=>this.openC(p.id),bt:i===0?'none':'1px solid var(--hairline)',op:lv?'0':'1',tf:lv?'translateX(24px)':'none',mh:lv?'0px':'240px',py:lv?'0px':'var(--row-py)',said:p.said,hasSaid:kind==='reply'&&!!p.said,saidWhen:p.saidWhen,hasCall:kind==='call'&&!!p.call,call:p.call,ownerIni:p.owner[0],owner:p.owner};}
  group(id,title,help,list,kind,lim=5){const n=this.state.more[id]||lim;const shown=list.slice(0,n);return{id,title,help,count:String(list.length),rows:shown.map((p,i)=>this.row(p,i,kind)),hasMore:list.length>n,moreN:String(Math.min(20,list.length-n)),more:()=>this.setState(s=>({more:{...s.more,[id]:n+20}})),show:list.length>0};}
  sendVals(P){const s=this.state;const E=s.entered;const L=this.lists(P);
    const groups=[this.group('fu','Follow-ups due','They saw the first message and haven’t replied.',L.fu,'fu'),this.group('ts','Send today','First messages, best fit first.',L.ts,'send'),this.group('nr','Mark as no reply','Two follow-ups and a week of silence.',L.noreply,'noreply'),this.group('find','Find their handle first','We know who they are, not their X account or full name.',L.find,'find')].filter(g=>g.show);
    const R=AK.dmResults(P.map(p=>p.c));let res=null,acc=[];
    if(R){const dw=AK.dayWord(R.date);const tag=AK.DOW[R.date.getDay()]+' '+R.tag;
      res={day:(dw===tag.split(' ')[0]||/^\d/.test(dw)?'':dw+' · ')+tag,dayLow:/^\d/.test(dw)?'on '+R.tag:dw.toLowerCase()==='today'?'today':dw.toLowerCase()==='yesterday'?'yesterday':'on '+tag,sent:String(R.sent.length),cant:String(R.notSent.length),hasCant:R.notSent.length>0,why:R.why.map(w=>({n:String(w.n),label:w.label}))};
      const tgt=a=>num((AK.M.stats.find(x=>x.Account===a)||{})['Daily target'])||30;
      acc=Object.keys(AK.HANDLES).map(a=>({a,n:R.sent.filter(c=>c.Owner===a).length})).filter(x=>x.n>0).map(x=>{const of=tgt(x.a);const name=ownerName(x.a);return{name,...avatar(avName(name)),done:x.n,of,label:x.n+' of '+of,w:E?Math.min(100,x.n/of*100)+'%':'0%',bar:x.n>=of?'var(--ok)':'var(--out)'};});}
    const so=!!s.more.skip;const early=L.skip.filter(p=>p.fund==='early').length;
    return{groups,noDM:false,hasGroups:groups.length>0,allClear:groups.length===0,acc,hasRes:!!res&&(res.sent!=='0'||res.hasCant),res:res||{},hold:AK.dmsPaused()?DM_HOLD.on:DM_HOLD.off,clearTitle:AK.dmsPaused()?'DMs are paused':'Everything for today is sent',clearText:AK.dmsPaused()?'Nothing to send while DMs are paused. Press Resume DMs above to bring the list back.':'New people show up here as soon as the sheet marks them ready to send.',pauseLabel:AK.S.busy.has('pause')?'Saving…':AK.dmsPaused()?'Resume DMs':'Pause DMs',togglePause:()=>{if(AK.canEdit())AK.savePaused(!AK.dmsPaused());},holdDot:AK.dmsPaused()?'var(--warn, #b7791f)':'var(--ok)',skipOpen:so,skipN:String(L.skip.length),skipLabel:'Skipped for now: '+L.skip.length+(early===L.skip.length?' seed-stage people':' seed-stage or unclear-funding people'),hasSkip:L.skip.length>0,skipRot:so?'rotate(90deg)':'none',skipCta:so?'Hide':'Show',toggleSkip:()=>this.setState(st=>({more:{...st.more,skip:!st.more.skip}})),skipRows:L.skip.slice(0,s.more.skipAll?999:20).map((p,i)=>this.row(p,i,'skip')),showEveryone:()=>this.setOwner('Everyone')};}
  /* People who replied to or quoted our posts in the last 14 days and haven't been answered: buyers first. */
  postReplies(){const wk=Date.now()-14*864e5;const ORD={'Core buyer':0,'Good fit':1,'Related':2,'Investor':3,'Other':4};
    const VO={'DM + reply':0,'Reply only':1};
    return this.engagers().filter(e=>(e.Status||'To message')==='To message'&&verdictOf(e)!=='Skip'&&(verdictOf(e)==='DM + reply'||(()=>{const d=AK.parseDate(e['Found on']);return !d||d.getTime()>=wk;})()))
      .sort((a,b)=>((VO[verdictOf(a)]??2)-(VO[verdictOf(b)]??2))||((ORD[a.Fit]??4)-(ORD[b.Fit]??4))||((num(b.Followers)||0)-(num(a.Followers)||0)));}
  engagerRow(e,i){const s=this.state;const name=e.Name||e.Handle;const a=avatar(name);const key=e._key+'rp';const cb=this.copyBtn(key,'Copy our reply');
    const said=String(e['What they said']||'').replace(/^(@\w+\s*)+/,'');const reply=e['Our reply']||'';const owner=ownerName(e.Account);
    const FT={'Core buyer':'solid','Good fit':'solid','Related':'mid'};
    const actions=this.founder?[]:[...(reply?[act(cb.label,s.copied===key?'copied':'secondary',stop(()=>this.copy(reply,key,'Reply for '+name.split(' ')[0]+' copied')))]:[]),
      act('Open their reply','primary',stop(()=>{const u=AK.safeUrl(e['Their link']);if(u)window.open(u,'_blank','noopener');})),
      act('Replied ✓','secondary',stop(()=>this.markReplied(e,name))),act('×','ghost',stop(()=>this.dismissEngager(e,name)))];
    const v=verdictOf(e);
    return{...a,id:e._key,name,role:e.Handle+' · '+(num(e.Followers)!=null?fmtK(num(e.Followers))+' followers':''),company:e.Why||((e.How==='Quoted'?'Quoted ':'Replied to ')+owner+'’s post'),
      fund:pill(v,VERD_T[v]||'neutral'),next:pill(reply?'Reply ready':'Reply being written','mid'),actions,open:()=>{const u=AK.safeUrl(e['Their link']);if(u)window.open(u,'_blank','noopener');},
      bt:i===0?'none':'1px solid var(--hairline)',op:'1',tf:'none',mh:'240px',py:'var(--row-py)',said:clip(said,160)+(reply?'  →  Our reply: '+reply:''),hasSaid:true,saidWhen:AK.dayWord(AK.parseDate(e['Found on']))||e['Found on']||'',
      hasCall:false,call:'',ownerIni:owner[0],owner};}
  inboxVals(P){const L=this.lists(P);const R=this.postReplies();const n=this.state.more.posts||5;
    const posts={id:'posts',title:'Reply to these',help:'Only people worth answering. "DM + reply" fit our ICP: reply, then DM them from People to DM.',count:String(R.length),rows:R.slice(0,n).map((e,i)=>this.engagerRow(e,i)),
      hasMore:R.length>n,moreN:String(Math.min(20,R.length-n)),more:()=>this.setState(s=>({more:{...s.more,posts:n+20}})),show:R.length>0};
    const groups=[this.group('rep','Reply now','They wrote back. Answer within a day.',L.rep,'reply'),posts,this.group('calls','Calls coming up','Open their card to prep: what they said, why now, and your notes.',L.calls,'call')].filter(g=>g.show);
    return{groups,noDM:false,hasGroups:groups.length>0,allClear:groups.length===0,showEveryone:()=>this.setOwner('Everyone')};}
  tplFamilies(){const T=AK.M.templates.filter(t=>/^[A-Z]\d+[A-Z]?$/.test(t.ID)&&t.Opener);const used=new Set();const out=[];
    const own=a=>this.own(a);
    for(const acc of Object.keys(AK.HANDLES)){const v=T.filter(t=>!used.has(t.ID)&&t.Account===acc);if(v.length&&own(acc))out.push({fam:ownerName(acc)+'’s messages',about:'Warm intros, call asks and replies to people who engaged.',v});}
    return out;}
  pipeVals(P){const s=this.state;
    const nT=this.tplFamilies().reduce((n,f)=>n+f.v.length,0);
    const tabs=this.tabs([['Board',''],['People',String(P.length)],['Companies',String(new Set(P.map(p=>p.company)).size)],['DM templates',String(nT)]],s.pipeTab,t=>this.setState({pipeTab:t}));
    const o={tabs,isBoard:s.pipeTab==='Board',isPeople:s.pipeTab==='People',isCompanies:s.pipeTab==='Companies',isTpl:s.pipeTab==='DM templates',noDM:false,hasDM:true,showEveryone:()=>this.setOwner('Everyone')};
    if(o.isBoard)o.board=this.boardVals(P);if(o.isPeople)o.tbl=this.tblVals(P);if(o.isCompanies){const c=this.coVals(P);o.cos=c.rows;o.cosHasMore=c.hasMore;o.cosMore=c.more;o.cosMoreN=c.moreN;}if(o.isTpl)o.tpl=this.tplVals();
    return o;}
  boardVals(P){const s=this.state;const drag=!!s.dragId;
    const cols=STAGES.map(st=>({st,list:P.filter(p=>p.stage===st).sort(byPri)}));
    const hidden=cols.filter(c=>!c.list.length&&(c.st==='Follow-up 1 sent'||c.st==='Follow-up 2 sent')).map(c=>c.st);
    return{drag:!this.founder,hasHidden:hidden.length>0&&!drag,hiddenNote:hidden.join(' and ')+(hidden.length>1?' are':' is')+' empty, so '+(hidden.length>1?'they’re':'it’s')+' hidden. '+(hidden.length>1?'They come':'It comes')+' back while you drag a card.',
      cols:cols.filter(c=>drag||!hidden.includes(c.st)).map(c=>{const over=s.dragOver===c.st;const lim=s.more['col:'+c.st]||20;return{name:c.st,n:String(c.list.length),dot:STAGE_DOT[c.st],bg:over?'var(--out-soft)':'rgba(255,255,255,.34)',sh:over?'inset 0 0 0 1.5px var(--out)':'inset 0 0 0 1px var(--hairline)',tf:over?'translateY(-2px)':'none',empty:!c.list.length,emptyLabel:drag?'Drop here':'Nobody here yet',
        hasMore:c.list.length>lim,moreN:String(Math.min(40,c.list.length-lim)),more:()=>this.setState(st=>({more:{...st.more,['col:'+c.st]:lim+40}})),
        over:e=>{e.preventDefault();if(this.state.dragOver!==c.st)this.setState({dragOver:c.st});},
        drop:e=>{e.preventDefault();const id=this.state.dragId;this.setState({dragId:null,dragOver:null});if(id){const p=this.findP(id);if(p&&p.stage!==c.st)this.setStage(id,c.st,p.first+' moved to '+c.st);}},
        cards:c.list.slice(0,lim).map(p=>{const nx=this.nextOf(p);return{...avatar(p.name),name:p.name,company:p.company,fund:this.fundPill(p),next:pill(nx,NEXT_T[nx]),ownerIni:p.owner[0],owner:p.owner,when:(p.d.filter(Boolean).slice(-1)[0]||'').split(',')[0],op:s.dragId===p.id?'.35':'1',tf:s.dragId===p.id?'rotate(-1.5deg) scale(.98)':'none',open:()=>this.openC(p.id),
          start:e=>{try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',p.id);}catch(_){} setTimeout(()=>this.setState({dragId:p.id}),0);},end:()=>this.setState({dragId:null,dragOver:null})};})};})};}
  tblVals(P){const s=this.state;
    let L=P.filter(p=>{if(s.fFund==='Series A or later'&&p.fund!=='late')return false;if(s.fFund==='Seed or pre-seed'&&p.fund!=='early')return false;if(s.fFund==='Unknown'&&p.fund!=='unknown'&&p.fund!=='none')return false;if(s.fStage!=='Any stage'&&p.stage!==s.fStage)return false;if(s.fCh!=='Any channel'&&p.ch!==s.fCh)return false;return true;});
    const k=s.sortKey;const val=p=>k==='stage'?STAGES.indexOf(p.stage):k==='fit'?-(p.fitN||0):k==='pri'?-(p.priN==null?-99:p.priN):k==='next'?this.nextOf(p):k==='funding'?p.funding.toLowerCase():String(p[k]||'').toLowerCase();
    L=[...L].sort((a,b)=>{const x=val(a),y=val(b);return(x>y?1:x<y?-1:0)*s.sortDir||byPri(a,b);});
    const lim=s.more.tbl||10;const total=L.length;
    const TT={fund:'We only send first messages to companies that raised Series A or later. Seed and pre-seed are skipped unless someone chooses Send anyway.',fit:'How closely they match who we sell to, from the 1–10 fit score: Strong is 9 or 10, Good is 7 or 8.',likely:'What they would most likely buy from us, worked out from their company and role.'};
    const C=[['pri','Priority'],['name','Name'],['company','Company'],['funding','Funding stage','fund'],['owner','Owner'],['ch','Channel'],['stage','Stage'],['next','Next step']].concat(s.allCols?[['fit','Fit','fit'],['likely','Likely to buy','likely']]:[]);
    const cols=C.map(([key,label,tip])=>{const on=k===key;return{label,arrow:on?(s.sortDir>0?'↑':'↓'):'↕',arrOp:on?'1':'.25',fg:on?'var(--ink)':'var(--ink-3)',sort:()=>this.setState(st=>({sortKey:key,sortDir:st.sortKey===key?-st.sortDir:1})),hasTip:!!tip,tip:tip?this.tipFor('h'+tip):{},tipText:TT[tip]||'',tl:tip==='fund'?'-8px':'auto',tr:tip==='fund'?'auto':'-8px'};});
    const FB={Strong:3,Good:2,Weak:1};
    const rows=L.slice(0,lim).map(p=>{const nx=this.nextOf(p);return{...avatar(p.name),name:p.name,role:p.role||'–',company:p.company,fund:this.fundPill(p),owner:p.owner,oAv:avatar(avName(p.owner)),ch:p.ch,stage:pill(p.stage,STAGE_T[p.stage]),stageDot:STAGE_DOT[p.stage],next:pill(nx,NEXT_T[nx]),fit:p.fitN==null?'–':p.fit+' ('+p.fitN+')',fitBars:[1,2,3].map(n=>({bg:n<=(FB[p.fit]||0)?'var(--ink-2)':'var(--n-soft-2)'})),likely:p.likely?clip(p.likely,44):(/^not sent/i.test(p.result)?'Not sent: DMs need a passcode':'–'),pri:'P'+p.pri,priBg:p.pri===1?'var(--ink)':p.pri===2?'var(--ink-3)':'var(--ink-4)',open:()=>this.openC(p.id)};});
    const fund=['All','Series A or later','Seed or pre-seed','Unknown'].map(v=>{const on=s.fFund===v;return{label:v,go:()=>this.setState({fFund:v}),bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-3)',sh:on?'var(--shadow-sm), var(--hi)':'none'};});
    return{cols,rows,allCols:s.allCols,colsLabel:s.allCols?'Hide Fit and Likely to buy':'Show Fit and Likely to buy',toggleCols:()=>this.setState(st=>({allCols:!st.allCols})),minW:s.allCols?'1180px':'980px',fund,fStage:s.fStage,fCh:s.fCh,setStage:e=>this.setState({fStage:e.target.value}),setCh:e=>this.setState({fCh:e.target.value}),count:'Showing '+rows.length+' of '+total,hasMore:total>lim,more:()=>this.setState(st=>({more:{...st.more,tbl:lim+25}})),empty:total===0,hasRows:total>0,clear:()=>this.setState({fFund:'All',fStage:'Any stage',fCh:'Any channel'}),filtered:s.fFund!=='All'||s.fStage!=='Any stage'||s.fCh!=='Any channel'};}
  coVals(P){const by={};P.forEach(p=>{(by[p.company]=by[p.company]||[]).push(p);});
    const all=Object.entries(by).map(([c,l])=>{const fi=l.reduce((m,p)=>{const i=STAGES.indexOf(p.stage);return p.stage!=='Closed'&&i>m?i:m;},-1);const st=fi<0?'Closed':STAGES[fi];const top=Math.max(...l.map(p=>p.priN==null?-99:p.priN));return{company:c,...avatar(c),fund:this.fundPill(l[0]),n:l.length===1?'1 person':l.length+' people',people:l.sort(byPri).map(p=>({...avatar(p.name),name:p.name,st:SHORT[p.stage],dot:STAGE_DOT[p.stage],open:()=>this.openC(p.id)})),stage:pill(st,STAGE_T[st]),stageDot:STAGE_DOT[st],k:fi,top};}).sort((a,b)=>(b.k-a.k)||(b.top-a.top)||a.company.localeCompare(b.company));
    const lim=this.state.more.cos||10;
    return{rows:all.slice(0,lim).map((r,i)=>({...r,bt:i===0?'none':'1px solid var(--hairline)'})),hasMore:all.length>lim,moreN:String(Math.min(25,all.length-lim)),more:()=>this.setState(st=>({more:{...st.more,cos:lim+25}}))};}
  tplVals(){
    return this.tplFamilies().map(t=>{const vs=t.v.map(x=>({code:x.ID,sent:num(x.Sent)||0,rep:num(x.Replies)||0,x}));const rated=vs.filter(v=>v.sent>=10);const best=rated.length?rated.reduce((a,b)=>b.rep/b.sent>a.rep/a.sent?b:a).code:'';
      return{fam:t.fam,about:t.about,n:t.v.length+' versions',v:vs.map(({code,sent,rep,x})=>{const r=sent?rep/sent:0;const vt=x.Verdict||(sent<10?'Need 10+ sends':r>=0.1?'Double down':r<0.04?'Rewrite':'Keep testing');
        const tone=/double/i.test(vt)?'ok':/rewrite|kill|drop/i.test(vt)?'bad':/keep/i.test(vt)?'warn':'neutral';const k='tpl'+code;const cb=this.copyBtn(k,'Copy opener');
        const f1=Object.keys(x).find(h=>h.indexOf('Follow-up 1')===0),f2=Object.keys(x).find(h=>h.indexOf('Follow-up 2')===0);
        return{code,isBest:code===best&&r>=0.04,sent:String(sent),rep:String(rep),rate:sent?Math.round(r*100)+'%':'–',rateW:this.state.entered?Math.min(100,r*500)+'%':'0%',rateBg:tone==='ok'?'var(--ok)':tone==='bad'?'var(--bad)':tone==='warn'?'var(--warn)':'var(--ink-4)',verdict:pill(vt,tone),open:x.Opener,f1:(f1&&x[f1])||'–',f2:(f2&&x[f2])||'–',copyLabel:cb.label,cbg:cb.bg,cfg:cb.fg,csh:cb.sh,copy:()=>this.copy(x.Opener,k,code+' opener copied')};})};});}
  moreVals(P){const pg=this.state.page;const o={};
    if(pg==='send')o.send=this.sendVals(P);if(pg==='inbox')o.inbox=this.inboxVals(P);if(pg==='pipeline')o.pipe=this.pipeVals(P);
    Object.assign(o,this.midVals(pg));
    return o;}

  /* ---------- calendar ---------- */
  calVals(){const s=this.state;const off=s.week;const zone=s.calZone;const f=this.founder;const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],MON=AK.MON;
    const start=AK.weekStart(off);const t0=new Date();t0.setHours(0,0,0,0);
    const days=DOW.map((dw,i)=>{const dt=new Date(start.getTime()+i*AK.DAY);const today=AK.sameDay(dt,new Date());
      return{dow:dw,date:dt,key:dkey(dt.getFullYear(),dt.getMonth(),dt.getDate()),num:String(dt.getDate()),mon:MON[dt.getMonth()],rel:Math.round((dt-t0)/AK.DAY),today};});
    const keys=new Set(days.map(d=>d.key));const accs=this.accs();
    const plat=s.calPlat;const isLi=plat==='LinkedIn';
    const placed=this.postList().filter(p=>onCal(p)&&platOf(p.o)===plat).map(p=>({p,w:calWhere(p.o,zone)})).filter(x=>x.w&&keys.has(x.w.key)&&accs.some(a=>a.acc===x.p.account));
    const kind=s.calKind;const shown=kind==='All'?placed:placed.filter(x=>x.p.kind===kind);
    const kinds=['All',...POST_KINDS].map(k=>{const on=kind===k;const n=k==='All'?placed.length:placed.filter(x=>x.p.kind===k).length;
      return{label:k,count:String(n)+(!isLi&&SLOTS3.includes(k)?'/'+(accs.length*7):''),go:()=>this.setState({calKind:k}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink)',bd:on?'var(--ink)':'var(--hairline-strong)',dot:KIND_DOT[k]||'transparent',hasDot:k!=='All'};});
    const plats=['X','LinkedIn'].map(x=>{const on=plat===x;return{label:x==='X'?'𝕏  X':'in  LinkedIn',go:()=>{store.set('calPlat',x);this.setState({calPlat:x,calPick:null});},bg:on?'var(--ink)':'transparent',fg:on?'#fff':'var(--ink-2)',sh:on?'var(--shadow-sm)':'none'};});
    const zones=['ist','pst'].map(z=>{const on=zone===z;return{label:ZONES[z].label,go:()=>{store.set('calZone',z);this.setState({calZone:z});},bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-3)',sh:on?'var(--shadow-sm)':'none'};});
    const has=(acc,key)=>placed.some(x=>x.p.account===acc&&x.w.key===key);
    const empty=accs.reduce((n,a)=>n+days.filter(d=>d.rel>=0&&!has(a.acc,d.key)).length,0);
    const boards=accs.map(a=>{
      const gaps=days.filter(d=>d.rel>=0&&!has(a.acc,d.key)).map(d=>d.dow);
      const last=this.postList().filter(p=>p.account===a.acc&&p.link&&platOf(p.o)===plat&&p.when<=Date.now()).sort((x,y)=>y.when-x.when)[0];
      const line=[gaps.length===7?'Nothing planned this week':gaps.length?'Nothing planned '+gaps.join(', '):'',last?'last post '+dLabel(last.when)+(last.ourViews?': '+last.ourViews+' views':''):''].filter(Boolean).join(' · ');
      const cols=days.map(d=>{const list=shown.filter(x=>x.p.account===a.acc&&x.w.key===d.key).sort((x,y)=>x.w.sort-y.w.sort);
        const card=x=>({isCard:true,isSlot:false,...this.calCard(x.p,x.w,a)});let items;
        if(isLi)items=list.map(card);
        else{items=[];for(const sl of SLOTS3){if(kind!=='All'&&kind!==sl)continue;const mine=list.filter(x=>x.p.slot===sl);
            if(mine.length)items.push(...mine.map(card));
            else if(d.rel>=0&&!f)items.push({isCard:false,isSlot:true,slotLabel:sl,slotHint:SLOT_HINT[sl],slotDot:KIND_DOT[sl],
              slotNew:()=>{const r=toIst(d.key,'',zone);AK.calNew(a.acc,r.date,'',plat,sl);},slotPick:()=>this.setState({calPick:{acc:a.acc,key:d.key},calPickKind:sl})});}
          items.push(...list.filter(x=>!SLOTS3.includes(x.p.slot)).map(card));}
        return{dow:d.dow,date:d.num+' '+d.mon,today:d.today,hfg:d.today?'var(--in-ink)':'var(--ink)',bg:d.today?'var(--in-soft)':'var(--n-soft)',cards:items,
          canAdd:!f,add:()=>{const r=toIst(d.key,'',zone);AK.calNew(a.acc,r.date,'',plat);},pick:()=>this.setState({calPick:{acc:a.acc,key:d.key},calPickKind:'All'}),
          over:e=>{e.preventDefault();},drop:e=>{e.preventDefault();this.calDrop(a,d);}};});
      const ti=days.findIndex(d=>d.today);
      return{...a,...avatar(avName(a.name)),icon:isLi?'in':'𝕏',iconBg:isLi?'#0a66c2':'var(--ink)',chip:isLi?LI_NAME[a.acc]||a.name:a.handle,strip:days.map((d,i)=>({l:d.dow[0],full:d.dow+' '+d.num+' '+d.mon,go:()=>this.calScroll(a.acc,i),bg:has(a.acc,d.key)?'var(--ink)':'var(--n-soft-2)',fw:d.today?'700':'500',fg:d.today?'var(--ink)':'var(--ink-3)'})),line,hasLine:!!line,cols,
        sid:'cal-'+a.acc,pan:e=>this.calPan(e),left:()=>this.calScroll(a.acc,'l'),right:()=>this.calScroll(a.acc,'r'),today:()=>{if(ti<0)this.setState({week:0});this.calScroll(a.acc,Math.max(0,ti<0?(new Date().getDay()+6)%7:ti));}};});
    // Open each board on today's column (once per week shown); the page may still be drawing, so try for a moment.
    const sk=off+'|'+accs.map(a=>a.acc).join();if(this._calSk!==sk){this._calSk=sk;const ti=days.findIndex(d=>d.today);let n=0;
      const go=()=>{if(accs.every(a=>document.getElementById('cal-'+a.acc))){accs.forEach(a=>this.calScroll(a.acc,ti<0?0:ti,true));}else if(n++<40)setTimeout(go,100);};setTimeout(go,50);}
    return{label:days[0].num+' '+days[0].mon+' – '+days[6].num+' '+days[6].mon,weekName:off===0?'This week':off===-1?'Last week':off===1?'Next week':off<0?Math.abs(off)+' weeks ago':'In '+off+' weeks',
      prev:()=>this.setState({week:off-1}),next:()=>this.setState({week:off+1}),now:()=>this.setState({week:0}),nowBg:off===0?'#fff':'transparent',nowSh:off===0?'var(--shadow-sm), var(--hi)':'none',
      kinds,zones,plats,boards,summary:placed.length+(placed.length===1?' post':' posts')+' this week',hasEmpty:empty>0,empty:empty+(empty===1?' empty day':' empty days')+' left',pick:this.calPickVals()};}
  // Hold and drag the board's empty space to move left and right (cards, fields and buttons keep working as usual).
  calPan(e){if(e.button!==0||e.target.closest('input,textarea,select,button,label,a,img,[draggable="true"]'))return;
    const el=e.currentTarget,x0=e.clientX,l0=el.scrollLeft;el.style.cursor='grabbing';e.preventDefault();
    const move=ev=>{el.scrollLeft=l0-(ev.clientX-x0);};const up=()=>{el.style.cursor='grab';window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);}
  // Scroll a board: 'l' / 'r' by two days, or to day i (0 = Monday).
  calScroll(acc,where,instant){const el=document.getElementById('cal-'+acc);if(!el||!el.children.length)return;const w=el.children[0].getBoundingClientRect().width+12;const behavior='auto';
    if(where==='l'||where==='r')el.scrollBy({left:(where==='l'?-2:2)*w,behavior});else el.scrollTo({left:Math.max(0,where-1)*w,behavior});}
  calCard(p,w,a){const s=this.state;const f=this.founder;const o=p.o;const id=p.id;const ed=s.calEd[id]||{};
    const st=p.link?'Posted':String(o.Status||'Draft');const pc=CAL_PILL[st]||['var(--warn-soft)','var(--warn-ink)'];
    const setEd=(k,v)=>this.setState(x=>({calEd:{...x.calEd,[id]:{...(x.calEd[id]||{}),[k]:v}}}));
    const takeEd=k=>{const v=(this.state.calEd[id]||{})[k];if(v==null)return null;this.setState(x=>{const e={...(x.calEd[id]||{})};delete e[k];return{calEd:{...x.calEd,[id]:e}};});return v;};
    const txt=ed.text!=null?ed.text:p.text;const linkOpen=s.calLink===id;
    const li=platOf(o)==='LinkedIn';const long=li&&txt.length>100;const open=!long||!!s.calOpen[id];
    const setOpen=v=>this.setState(x=>({calOpen:{...x.calOpen,[id]:v}}));
    const live=linkOpen?this.postList().filter(x=>x.account===p.account&&x.link&&x.id!==id).sort((x,y)=>y.when-x.when).slice(0,5)
      .map(x=>({line:clip(firstLine(x.text)||x.link,80),when:x.o._date?AK.dayWord(x.o._date):'',pick:()=>this.calLinkTo(p,x)})):[];
    const media=AK.mediaIds(o['Media file']).map(m=>({video:!!(p.sug&&p.sug.video&&p.sug.url.indexOf(m)>=0),src:AK.mediaThumb(m),open:()=>window.open(AK.mediaOpen(m),'_blank','noopener'),
      rm:stop(()=>{const keep=String(o['Media file']||'').split(/\s+/).filter(u=>u&&u.indexOf(m)<0).join('\n');AK.calSave(o,{media:keep});}),canRm:!f}));
    const cb=this.copyBtn('cal'+id,'Copy');const up=AK.S.busy.has('up'+o._key);
    return{id,st,pbg:pc[0],pfg:pc[1],ro:f,canEdit:!f,txtRo:f||!!p.link,rows:p.link?'4':'7',notLive:!p.link,canUp:!f&&!p.link,
      time:ed.time!=null?ed.time:w.hm,zone:ZONES[s.calZone].label,setTime:e=>setEd('time',e.target.value),
      saveTime:()=>{const v=takeEd('time');if(v!=null&&v!==w.hm){const r=toIst(w.key,v,s.calZone);AK.calSave(o,{date:r.date,time:r.time});}},
      type:CAL_TYPES.includes(p.ptype)?p.ptype:'',setType:e=>AK.calSave(o,{type:e.target.value}),slot:p.slot,setSlot:e=>AK.calSave(o,{slot:e.target.value}),
      aimed:CAL_AIMED.includes(o['Aimed at'])?o['Aimed at']:'',setAimed:e=>AK.calSave(o,{aimed:e.target.value}),
      name:li?LI_NAME[a.acc]||a.name:a.name,handle:li?'LinkedIn':a.handle,...avatar(avName(a.name)),
      collapsed:!open,expanded:open,short:clip(txt.replace(/\s+/g,' '),100),more:()=>setOpen(true),canLess:long&&open,less:()=>setOpen(false),
      text:txt,setText:e=>setEd('text',e.target.value),saveText:()=>{const v=takeEd('text');if(v!=null&&v!==p.text)AK.calSave(o,{text:v});},
      media,hasMedia:media.length>0,
      status:st,stOpts:[...new Set([st,...CAL_ST])].map(v=>({v})),setStatus:e=>{const v=e.target.value;if(v==='Posted'&&!p.link){this.setState({calLink:id,calLinkVal:''});return;}AK.calSave(o,{status:v});},
      copy:()=>this.copy(txt,'cal'+id,'Post copied'),copyLabel:cb.label,
      upload:e=>{const fl=e.target.files&&e.target.files[0];e.target.value='';if(fl)AK.calUpload(o,fl);},upLabel:up?'Uploading…':'Add image',
      remove:()=>this.calRemove(p),
      dragStart:e=>{this.dragId=id;try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);}catch(_){}},drag:f?'false':'true',
      hasLink:!!p.link,linkLabel:li?'Live on LinkedIn'+(num(o.Likes)?' · '+fmtK(num(o.Likes))+' reactions':'')+(num(o.Replies)?' · '+fmtK(num(o.Replies))+' comments':''):'Live on X'+(p.ourViews?' · '+p.ourViews+' views':''),openLink:()=>window.open(p.link,'_blank','noopener'),
      canLink:!p.link&&!f,toggleLink:()=>this.setState({calLink:linkOpen?null:id,calLinkVal:''}),linkOpen,linkVal:s.calLinkVal,
      setLinkVal:e=>this.setState({calLinkVal:e.target.value}),saveLink:()=>this.calLinkPaste(p,s.calLinkVal),
      linkPh:'Paste the post link (x.com/'+(AK.HANDLES[p.account]||'…')+'/status/…)',live,hasLive:live.length>0,
      hasSug:!!p.sug&&!p.link&&!media.length,sugThumb:p.sug?p.sug.thumb:'',sugVideo:!!(p.sug&&p.sug.video),
      useSug:()=>{const cur=String(o['Media file']||'').trim();if(p.sug)AK.calSave(o,{media:(cur?cur+'\n':'')+p.sug.url});},sugName:p.sug?clip(p.sug.name,34):'',sugWhy:p.sug?p.sug.why:'',openSug:()=>p.sug&&window.open(p.sug.url,'_blank','noopener')};}
  // A card made on the calendar that is still empty is removed for good; any other post just leaves the calendar.
  calRemove(p){const blank=p.o['What we changed']==='Added in the calendar'&&!p.text.trim()&&!p.link;const was=p.o.Status||'Draft';const wasCal=p.o.Calendar||'';
    AK.calSave(p.o,blank?{cal:'',status:'Deleted'}:{cal:'No'}).then(ok=>{if(ok)this.toast(blank?'Removed':'Taken off the calendar. It’s still in Our posts.',()=>AK.calSave(p.o,blank?{cal:'Yes',status:was}:{cal:wasCal}));});}
  calDrop(a,d){if(this.founder)return;const id=this.dragId;this.dragId=null;const p=id&&this.postList().find(x=>x.id===id);if(!p)return;
    if(p.account!==a.acc){this.toast('Drag a post within its own account.',null,true);return;}
    const w=calWhere(p.o,this.state.calZone);if(!w||w.key===d.key)return;const r=toIst(d.key,w.hm,this.state.calZone);AK.calSave(p.o,{date:r.date,time:r.time});}
  // Link a card to a post that's live on X: paste its link, or pick a live post the tracker already found (that row joins the
  // calendar with the card's format, audience and media, and the card itself leaves so the post isn't counted twice).
  calLinkPaste(p,v){v=String(v||'').trim();if(!v)return;const l=AK.ourPostLink(v,p.account);
    const dup=l&&this.postList().find(x=>x.id!==p.id&&x.link&&AK.linkKey(x.link)===AK.linkKey(l));
    if(dup)return this.calLinkTo(p,dup);
    AK.calSave(p.o,{link:v}).then(ok=>{if(ok){this.setState({calLink:null,calLinkVal:''});this.toast('Linked. The tracker follows its views and replies.');}});}
  async calLinkTo(p,x){const f={cal:'Yes'};if(CAL_TYPES.includes(p.ptype)&&!CAL_TYPES.includes(x.ptype))f.type=p.ptype;
    if(p.o['Aimed at']&&!x.o['Aimed at'])f.aimed=p.o['Aimed at'];if(p.o['Media file']&&!x.o['Media file'])f.media=p.o['Media file'];
    if(!await AK.calSave(x.o,f))return;
    const blank=p.o['What we changed']==='Added in the calendar'&&!p.link;
    await AK.calSave(p.o,blank?{cal:'',status:'Deleted'}:{cal:''});this.setState({calLink:null,calLinkVal:''});this.toast('Linked to the live post');}
  calPickVals(){const s=this.state;const pk=s.calPick;if(!pk)return{open:false};const acc=pk.acc;const kind=s.calPickKind||'All';
    let C=this.postList().filter(p=>p.account===acc&&!p.link&&!onCal(p)&&platOf(p.o)===s.calPlat);
    const kinds=['All',...POST_KINDS].map(k=>{const on=kind===k;return{label:k==='All'?'All types':k,count:String(k==='All'?C.length:C.filter(p=>p.kind===k).length),go:()=>this.setState({calPickKind:k}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};});
    if(kind!=='All')C=C.filter(p=>p.kind===kind);
    C.sort((x,y)=>(y.o._date?y.o._date.getTime():0)-(x.o._date?x.o._date.getTime():0));
    const r=toIst(pk.key,'',s.calZone);const [y,m,d]=pk.key.split('-').map(Number);const dt=new Date(y,m,d);
    const items=C.slice(0,30).map(p=>({id:p.id,type:p.ptype||'Post',line:clip(firstLine(p.text)||p.text,150),when:p.o._date?'Drafted '+AK.dayWord(p.o._date).replace(/^(Today|Yesterday|Tomorrow)/,w=>w.toLowerCase()):'Parked for later',needs:p.q?'Needs a founder answer':'',hasNeeds:!!p.q,
      add:()=>AK.calSave(p.o,{cal:'Yes',date:r.date,time:''}).then(ok=>{if(ok){this.setState({calPick:null});this.toast('Added to the calendar');}})}));
    return{open:true,title:(kind!=='All'?kind+' draft for ':'Add a draft to ')+ownerName(acc)+' · '+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]+' '+d+' '+AK.MON[m],kinds,items,empty:items.length===0,close:()=>this.setState({calPick:null})};}

  /* ---------- our posts ---------- */
  postCard(p){const s=this.state;const ST={'To post':'warn','Scheduled':'neutral','Posted':'ok','Later':'ghost'};const k=p.id+'c';const cb=this.copyBtn(k,'Copy our version');let actions=[];
    if(!this.founder){actions.push(act(cb.label,s.copied===k?'copied':'secondary',()=>this.copy(p.text,k,'Our version copied')));
      if(p.status==='To post'){actions.push(act('Mark as scheduled','secondary',()=>this.markScheduled(p)));actions.push(act('Mark as posted','in',()=>this.setState({linkFor:p.id,linkVal:''})));}
      if(p.status==='Scheduled')actions.push(act('It’s live: add the link','in',()=>this.setState({linkFor:p.id,linkVal:''})));
      if(p.status==='Posted'&&p.link)actions.push(act('Open on X ↗','ghost',()=>open(p.link)));
      actions.push(act('Delete','ghost',()=>this.deletePost(p)));}
    const qk=p.id+'q';const qb=this.copyBtn(qk,'Copy question');
    return{...p,...avatar(p.comp),accAv:avatar(avName(p.acc)),accName:p.acc,st:pill(p.status,ST[p.status]),hasQ:!!p.q,hasNums:!!p.ourViews,noNums:!p.ourViews,actions,hasActions:actions.length>0,needsMedia:p.needsMedia,
      linkOpen:s.linkFor===p.id,linkVal:s.linkVal,linkPh:'Paste the link of '+p.acc+'’s post on X (x.com/'+(AK.HANDLES[p.account]||'…')+'/status/…)',onLink:e=>this.setState({linkVal:e.target.value}),saveLink:()=>this.markPosted(p),cancelLink:()=>this.setState({linkFor:null}),
      compare:()=>this.setState({cmpId:p.id,cmpOn:true}),copyQ:()=>this.copy('Question for the founders: '+p.q,qk,'Question copied.'),qLabel:qb.label,qbg:qb.bg,qfg:qb.fg,qsh:qb.sh,openDrive:e=>{e.preventDefault();if(p.folder)open(AK.folderUrl(p.folder.id));else this.toast('No media folder is set for this post.',null,true);},
      hasSug:!!p.sug&&p.status!=='Posted',sugThumb:p.sug?p.sug.thumb.replace('sz=w600','sz=w120'):'',sugName:p.sug?clip(p.sug.name,40):'',sugWhy:p.sug?p.sug.why:'',openSug:e=>{e.preventDefault();if(p.sug)open(p.sug.url);},tip:this.tipFor('rank'+p.id)};}
  async markScheduled(p){if(this.founder)return;const prev=p.o.Status||'';
    const ok=await AK.saveScheduled(p.o,true,{quiet:true});
    if(ok)this.toast('Marked as scheduled',AK.canRestore()?()=>this.restorePost(p,prev):null);}
  async markPosted(p){if(this.founder)return;const prev=p.o.Status||'';
    const ok=await AK.savePosted(p.o,this.state.linkVal,{quiet:true});
    if(ok){this.setState({linkFor:null,linkVal:''});this.toast('Marked as posted. Its numbers show up in the Post tracker within 3 hours.',AK.canRestore()?()=>this.restorePost(p,prev):null);}}
  async deletePost(p){if(this.founder)return;
    const ask=p.status==='Posted'?'Remove this post from the CRM and stop tracking it? It stays live on X; delete it there yourself if you want it gone.':'Delete this post from the CRM?';
    if(!window.confirm(ask))return;
    const prev=await AK.deletePost(p.o);if(prev===false)return;const row=p.o._row;
    this.toast('Deleted',async()=>{if(await AK.undeletePost(row,prev))this.toast('Undone');});}
  addVals(){const s=this.state;const today=new Date();const iso=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    const acc=accOf(s.owner);const f=s.addF||{account:acc&&acc!=='Everyone'?acc:(Object.keys(AK.HANDLES)[0]||''),type:'Own post',status:'To post',date:iso,time:'',link:'',text:''};
    const on={};['account','type','status','date','time','link','text'].forEach(k=>on[k]=e=>{const v=e.target.value;this.setState(st=>({addF:{...(st.addF||f),[k]:v}}));});
    const busy=AK.S.busy.has('add');
    return{canAdd:!this.founder,addOpen:!!s.addOpen,addLabel:s.addOpen?'Close':'+ Add a post',toggleAdd:()=>this.setState(st=>({addOpen:!st.addOpen,addF:st.addOpen?null:f})),f,on,
      saveLabel:busy?'Saving…':'Save post',saveAdd:async()=>{if(busy)return;const v=s.addF||f;
        const ok=await AK.addPost({...v,status:v.link?'Posted':v.status});
        if(ok)this.setState({addOpen:false,addF:null,postsTab:v.link||v.status==='Posted'?'Posted':v.status==='Scheduled'?'Scheduled':'To post'});}};}
  async restorePost(p,prev){const o=AK.M.ours.find(x=>x._key===p.id)||p.o;if(await AK.restorePost(o,prev,''))this.toast('Undone');}
  postsVals(){const s=this.state;const all=this.ownPosts();
    const plats=['All','X','LinkedIn'].map(x=>{const on=s.postPlat===x;return{label:x==='All'?'X + LinkedIn':x==='X'?'𝕏 X':'in LinkedIn',go:()=>this.setState({postPlat:x,linkFor:null}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};});const P=s.postType==='All'?all:all.filter(p=>p.kind===s.postType);
    const inTab=all.filter(p=>p.status===s.postsTab);
    const types=['All',...POST_KINDS].map(k=>{const n=k==='All'?inTab.length:inTab.filter(p=>p.kind===k).length;const on=s.postType===k;
      return{label:k==='All'?'All types':k,count:String(n),go:()=>this.setState({postType:k,linkFor:null}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)',cbg:on?'rgba(255,255,255,.18)':'var(--n-soft)'};});
    const tabs=this.tabs(['To post','Scheduled','Posted','Later'].map(t=>[t,String(P.filter(p=>p.status===t).length)]),s.postsTab,t=>this.setState({postsTab:t,linkFor:null}));
    const list=P.filter(p=>p.status===s.postsTab).map(p=>this.postCard(p));
    const best=AK.copyNext(10).map((t,i)=>{const who=t._comp?t._comp.Name:t.Competitor;const v=num(t.Views);const k='bc'+t._key;const cb=this.copyBtn(k,'Copy original');
      return{who,...avatar(who),text:firstLine(t.Hook||t['Full text']),views:v?fmtK(v)+' views':fmtK(t._eng)+' eng.',age:(t.Platform||'X')+' · '+(t._date?AK.dayWord(t._date):t.Date||''),n:String(i+1).padStart(2,'0'),bt:i===0?'none':'1px solid var(--hairline)',canPlan:true,planLabel:cb.label,plan:()=>this.copy(t['Full text'],k,'Original copied: '+who)};});
    const ET={'To post':'Every drafted post is scheduled or posted. New drafts arrive every night: 12 options per account, post the best 3.','Scheduled':'Nothing is scheduled. Mark a post as scheduled once it’s set up in X.','Posted':'Nothing posted yet. Press Mark as posted with the link once a post is live.','Later':'Nothing parked for later.'};
    const emptyText=s.postType!=='All'?'No '+s.postType.toLowerCase()+' posts here. Pick All types to see the rest.':ET[s.postsTab]||'';
    return{...this.addVals(),tabs,types,plats,list,empty:list.length===0,emptyTab:s.postsTab,emptyText,best,hasBest:best.length>0};}
  cmpVals(){const s=this.state;const list=this.ownPosts().length?this.ownPosts():this.postList();if(!list.length)return{...this.blankCmp()};let i=list.findIndex(p=>p.id===s.cmpId);if(i<0)i=0;const c=this.postCard(list[i]);
    return{...c,pos:(i+1)+' of '+list.length,prev:()=>this.setState({cmpId:list[(i-1+list.length)%list.length].id}),next:()=>this.setState({cmpId:list[(i+1)%list.length].id}),close:()=>this.setState({cmpOn:false})};}
  blankCmp(){return{rankLabel:'',st:pill('',''),pos:'',prev:()=>{},next:()=>{},close:()=>this.setState({cmpOn:false}),comp:'',compH:'',cText:'',cNums:'',accAv:{},accName:'',time:'',text:'',hasNums:false,noNums:true,ourViews:'',ourLikes:'',changed:'',media:'',ini:'',avBg:'',avFg:''};}

  /* ---------- post tracker ---------- */
  trkVals(){const s=this.state;const E=s.entered;const accs=this.accs();const ids=accs.map(a=>a.acc);
    const all=AK.trackedPosts();const live=all.filter(t=>ids.includes(t.account));
    const views=live.reduce((a,t)=>a+(t.views||0),0),eng=live.reduce((a,t)=>a+(t.eng||0),0),grew=live.reduce((a,t)=>a+(t.grew>0?t.grew:0),0);
    const wk=AK.weekStart(0).getTime();const rt=AK.rate(eng,views);
    const toDM=this.engagers().filter(e=>e.Status!=='Messaged');const newDM=toDM.filter(e=>{const d=AK.parseDate(e['Found on']);return d&&d.getTime()>=wk;}).length;
    const kpis=[{label:'Posts tracked',v:String(live.length),d:live.filter(t=>t.first>=wk).length+' posted this week',tone:'var(--ok-ink)'},{label:'Views',v:fmtK(views),d:grew?'+'+fmtK(grew)+' since the last check':'Checked every 3 hours',tone:grew?'var(--ok-ink)':'var(--ink-3)'},{label:'Engagement',v:fmtK(eng),d:'Likes, replies, reposts, saves',tone:'var(--ink-3)'},{label:'Engagement per 1K views',v:rt!=null?String(r1(rt)):'–',d:'Across all tracked posts',tone:'var(--ink-3)',tipKey:'eng1k'},{label:'People to DM',v:String(toDM.length),d:newDM+' new since Monday',tone:'var(--in-ink)'}];
    const WK={good:{bg:'var(--ok-soft)',fg:'var(--ok-ink)',bd:'inset 0 0 0 1px var(--ok-line)'},meh:{bg:'var(--warn-soft)',fg:'var(--warn-ink)',bd:'inset 0 0 0 1px var(--warn-line)'},bad:{bg:'var(--bad-soft)',fg:'var(--bad-ink)',bd:'inset 0 0 0 1px var(--bad-line)'},future:{bg:'transparent',fg:'var(--ink-4)',bd:'inset 0 0 0 1px var(--hairline-strong)'}};
    const week=AK.weekGrid(ids).map(r=>{const name=ownerName(r.account);return{id:name,name,...avatar(avName(name)),cells:r.cells.map((c,i)=>{const sk=c.k==='green'?'good':c.k==='yellow'?'meh':c.k==='red'?'bad':'future';
      const b=c.k==='future'?(c.tomorrow?'Tomorrow':'Coming up'):c.today?'So far':c.n===0?'Nothing':c.pct==null?(c.g>0?'+'+fmtK(c.g)+' eng.':'Flat'):c.pct>0?'↑ '+c.pct+'%':c.pct<0?'↓ '+(-c.pct)+'%':'Flat';
      return{s:sk,a:c.k==='future'?'–':String(c.n),b,...WK[sk],dl:(i*60)+'ms',op:E?'1':'0',sc:E?'scale(1)':'scale(.92)'};})};});
    const times=Array.from(new Set(AK.M.tracking.filter(r=>ids.includes(r.Account)).map(r=>r._t))).sort((a,b)=>a-b);
    const hist=live.filter(t=>t.hist.length);
    const totalAt=tt=>hist.reduce((s2,t)=>{let v=0;for(const r of t.hist){if(r._t<=tt)v=num(r.Views)||0;else break;}return s2+v;},0);
    const series=times.map(totalAt);const hasChart=series.length>=2;const ch=mkChart(hasChart?series:[0,0],600,170);
    const lab=t=>dLabel(t)+' '+hhmm(t);const last=series[series.length-1]||0;
    const weekAgo=times.filter(t=>t<=Date.now()-7*AK.DAY).slice(-1)[0];const base=weekAgo!=null?totalAt(weekAgo):null;
    const totalD=!hasChart?'':base?((last>=base?'+':'')+Math.round((last-base)/base*100)+'% on last week'):'+'+fmtK(last-series[0])+' since '+dLabel(times[0]);
    const fol=this.followers().filter(f=>ids.includes(f.acc)).map(f=>{const base2=f.start!=null?f.start:f.first;const dd=f.v!=null&&base2!=null?f.v-base2:null;return{...f,...avatar(avName(f.name)),val:f.v==null?'–':f.v.toLocaleString(),w:E&&f.v?Math.min(100,f.v/f.tgt*100)+'%':'0%',d:dd==null?'No count yet':(dd>=0?'+':'')+dd+' since '+(f.start!=null?'the start':'the first check'),left:f.v==null?'Goal '+f.tgt.toLocaleString():Math.max(0,f.tgt-f.v).toLocaleString()+' to go'};});
    const top=live.filter(t=>t.rate!=null&&(t.views||0)>=30).sort((a,b)=>b.rate-a.rate).slice(0,3).map((t,i)=>{const acc=ownerName(t.account);return{n:String(i+1).padStart(2,'0'),text:clip(firstLine(t.text)||'Post on X',140),acc,...avatar(avName(acc)),views:fmtK(t.views),eng:String(t.eng),why:AK.whyFor(t,all).slice(0,4)};});
    const pat=AK.patterns(live).map(p=>({label:p.label,v:p.label==='Best account'?ownerName(p.k):p.k,sub:p.sub}));
    const sorted=live.slice().sort((a,b)=>(b.first||0)-(a.first||0));const lim=s.trkMore?sorted.length:8;
    const sp=h=>{const v=h.map(r=>num(r.Views)||0);if(v.length<2)return '0,22 80,22';const mx=Math.max(1,...v);return v.map((y,k)=>(k*80/(v.length-1)).toFixed(1)+','+(22-y/mx*20).toFixed(1)).join(' ');};
    const rows=sorted.slice(0,lim).map((t,i)=>({text:clip(firstLine(t.text)||'Post on X',110),acc:ownerName(t.account),when:t.first?AK.dayWord(new Date(t.first))+' '+hhmm(t.first):'–',views:fmtK(t.views),eng:String(t.eng==null?'–':t.eng),rate:t.rate!=null?String(r1(t.rate)):'–',spark:sp(t.hist),deltaLabel:t.grew!=null?(t.grew>=0?'+':'')+fmtK(t.grew)+' since last check':t.pending?'Waiting for the first check':'First check',bt:i===0?'none':'1px solid var(--hairline)'}));
    return{kpis:kpis.map(k=>({...k,hasTip:!!k.tipKey,tip:k.tipKey?this.tipFor(k.tipKey):{}})),week,days:['Mon','Tue','Wed','Thu','Fri'],
      hasChart,noChart:!hasChart,total:fmtK(last),totalD,
      chart:{line:ch.line,area:ch.area,dash:E?'0':'1400',dots:hasChart?ch.dots.map((d,i)=>({...d,label:lab(times[i])+': '+fmtK(series[i])+' views in total',r:i===series.length-1?'5':'3.5'})):[],l0:hasChart?lab(times[0]):'',l1:hasChart&&times.length>2?lab(times[Math.floor((times.length-1)/2)]):'',l2:hasChart?lab(times[times.length-1]):''},
      fol,top,hasTop:top.length>0,noTop:!top.length,pat,hasPat:pat.length>0,noPat:!pat.length,rows,hasRows:rows.length>0,hasMore:!s.trkMore&&sorted.length>8,more:()=>this.setState({trkMore:true}),count:'Showing '+rows.length+' of '+sorted.length};}

  /* ---------- people to DM ---------- */
  pdmCards(){return this.engagers().filter(e=>verdictOf(e)==='DM + reply'&&!/^(Dismissed|Do not contact)$/.test(e.Status||'')).map(e=>({id:e._key,e,name:e.Name||e.Handle,handle:e.Handle,followers:fmtK(num(e.Followers)),fit:'DM + reply',dms:e['DMs open']==='Yes',bio:e.Why||e.Bio||'No bio.',said:String(e['What they said']||'').replace(/^(@\w+\s*)+/,'')||'(no text)',kind:e.How==='Quoted'?'Quoted':'Replied to',on:clip(e['Our post'],90),when:AK.dayWord(AK.parseDate(e['Found on']))||e['Found on']||'',msg:e['DM ready']||'',status:e.Status==='Messaged'?'Messaged':'To message',from:e['Send from']||e.Account}));}
  pdmVals(){const s=this.state;const ORDER={'Core buyer':0,'Good fit':1,'Related':2,'Investor':3,'Other':4,'Not a buyer':5};const FT={'Core buyer':'solid','Good fit':'solid','Related':'mid','Investor':'neutral','Other':'neutral','Not a buyer':'ghost'};
    const all=this.pdmCards().sort((a,b)=>((ORDER[a.fit]??3)-(ORDER[b.fit]??3))||((b.dms?1:0)-(a.dms?1:0))||((num(b.e.Followers)||0)-(num(a.e.Followers)||0)));const by=t=>t==='All'?all:all.filter(p=>p.status===t);
    const tabs=this.tabs([['To message',String(by('To message').length)],['Messaged',String(by('Messaged').length)]],s.pdmTab==='All'?'To message':s.pdmTab,t=>this.setState({pdmTab:t}));
    const cards=by(s.pdmTab).slice(0,s.more.pdm||12).map((p,i)=>{const k=p.id+'d';const cb=this.copyBtn(k,'Copy');const lv=!!s.leaving[p.id];
      return{...p,...avatar(p.name),fitP:pill(p.fit,FT[p.fit]||'neutral'),dmsLabel:p.dms?'DMs open':'DMs closed',dmsDot:p.dms?'var(--ok)':'var(--ink-4)',dmsFg:p.dms?'var(--ok-ink)':'var(--ink-3)',copyLabel:cb.label,cbg:cb.bg,cfg:cb.fg,csh:cb.sh,copy:()=>this.copy(p.msg,k,'Message for '+p.name.split(' ')[0]+' copied'),canMark:p.status==='To message'&&!this.founder,isDone:p.status==='Messaged',
        mark:()=>this.markMessaged(p),canX:!this.founder,x:()=>this.dismissEngager(p.e,p.name),
        profile:e=>{e.preventDefault();open(AK.xUrl(p.handle));},op:lv?'0':(s.entered?'1':'0'),tf:lv?'scale(.96) translateY(8px)':(s.entered?'none':'translateY(10px)'),dl:lv?'0ms':(i*50)+'ms'};});
    const n=by(s.pdmTab).length;const lim=s.more.pdm||12;
    return{tabs,cards,empty:cards.length===0,hasCards:cards.length>0,emptyTitle:s.pdmTab==='Messaged'?'Nobody messaged yet':'Everyone here has a message',hasMore:n>lim,moreN:String(Math.min(12,n-lim)),more:()=>this.setState(st=>({more:{...st.more,pdm:lim+12}}))};}
  // x on a reply or a person to DM: off every list (Status "Dismissed" in Post Engagers), with Undo.
  async dismissEngager(e,name){if(this.founder)return;const prev=await AK.saveEngager(e,'Dismissed');
    if(prev)this.toast('Cleared '+String(name||e.Handle).split(' ')[0],async()=>{if(await AK.saveEngager(e,prev))this.toast('Undone');});}
  // x on a DM row: the person moves to Closed in the pipeline (sheet Status "Not now"), with Undo.
  async dismissPerson(p){if(this.founder)return;const was=p.stage;await this.setStage(p.id,'Closed','Cleared '+p.first+'. They’re under Closed in Pipeline.');
    const q=this.findP(p.id);if(q&&q.stage==='Closed')this.toast('Cleared '+p.first+'. They’re under Closed in Pipeline.',()=>this.setStage(p.id,was,'Undone'));}
  // Replied ✓: the public reply is posted. "DM + reply" people stay in People to DM until they're messaged.
  async markReplied(e,name){if(this.founder)return;const prev=await AK.saveEngager(e,'Replied');
    if(prev)this.toast('Replied to '+String(name||e.Handle).split(' ')[0]+(verdictOf(e)==='DM + reply'?'. Now DM them from People to DM.':''),async()=>{if(await AK.saveEngager(e,prev))this.toast('Undone');});}
  markMessaged(p){if(this.founder)return;const prevS=p.e.Status||'',prevW=p.e['Messaged on']||'';
    this.setState(st=>({leaving:{...st.leaving,[p.id]:true}}));
    setTimeout(async()=>{const ok=await AK.saveMessaged(p.e,{quiet:true});
      this.setState(st=>{const l={...st.leaving};delete l[p.id];return{leaving:l};});
      if(ok)this.toast('Marked '+p.name.split(' ')[0]+' as messaged',AK.canRestore()?async()=>{const e=AK.M.engagers.find(x=>x._key===p.id)||p.e;if(await AK.restoreMessaged(e,prevS,prevW))this.toast('Undone');}:null);},320);}

  /* ---------- competitors ---------- */
  compList(){const v=AK.version();if(this._cv===v)return this._comps;this._cv=v;
    const GL={same:'Same thing as us',data:'Overlaps on data',soft:'Overlaps on software',big:'Big account',other:'Other'};
    const wk=Date.now()-7*AK.DAY;
    this._comps=AK.M.comps.map(c=>{const id=AK.norm(c.Name);const posts=AK.M.theirs.filter(t=>t._comp===c);const hc=String(c['How close']||'');
      const group=/same/i.test(hc)?'same':/data/i.test(hc)?'data':/software/i.test(hc)?'soft':/big/i.test(hc)?'big':'other';
      const top=posts.slice().sort(AK.bigFirst).slice(0,6);const copied=top.filter(t=>AK.copiesOf(t).length).length;
      const med=AK.median(posts.map(p=>p._eng));const ppl=AK.M.people.filter(p=>AK.compFor(p.Competitor)===c);
      const xf=num(c['X followers']),lf=num(c['LinkedIn followers']);
      return{id,c,name:c.Name,handle:c['X account']||'',group,groupLabel:GL[group],posts,top,copied,
        followers:xf!=null?fmtK(xf):lf!=null?fmtK(lf):'–',folSub:xf!=null?'On X'+(c['Checked on']?', checked '+c['Checked on']:''):lf!=null?'On LinkedIn':'Not counted yet',
        rate:c['Posts per month']?c['Posts per month']+' a month':'–',eng:med!=null?fmtK(med):'–',best:c['Best post type this month']||((AK.typeStats(posts)[0]||{}).type)||'–',
        runs:ppl.length?ppl.map(p=>p.Name+(p.Role?' ('+p.Role+')':'')).join(', ')+'.':(c.Notes||c['What they sell']||'Not filled in yet.'),
        freshUncopied:posts.filter(t=>t._date&&t._date.getTime()>=wk&&!AK.copiesOf(t).length).length};});
    return this._comps;}
  openComp(id){this.go('comps',{compTab:'Competitors',compId:id});const c=this.compList().find(x=>x.id===id);if(c)setTimeout(()=>AK.markSeen(c.name),1500);}
  compDetail(id){const c=this.compList().find(x=>x.id===id)||this.compList()[0];const E=this.state.entered;
    const vl=t=>{const v=num(t.Views);return v?fmtK(v)+' views':fmtK(t._eng)+(t._li?' engagement':' eng.');};
    const ll=t=>t._li?fmtK(num(t.Reactions))+' reactions':fmtK(num(t.Likes))+' likes';
    const last30=c.posts.filter(t=>t._date&&Date.now()-t._date.getTime()<30*AK.DAY).sort((a,b)=>a._date-b._date);
    const useViews=last30.some(t=>num(t.Views));const series=last30.map(t=>useViews?(num(t.Views)||0):(t._eng||0));const hasChart=series.length>=2;
    const ch=mkChart(hasChart?series:[0,0],600,160);const pk=hasChart?series.indexOf(Math.max(...series)):0;
    const ST={'To post':'warn','Scheduled':'neutral','Posted':'ok','Later':'ghost'};
    const top=c.top.map((t,i)=>{const o=AK.copiesOf(t)[0];const po=o?this.postList().find(x=>x.id===o._key):null;const k='cp'+t._key;const cb=this.copyBtn(k,'Copy original');
      return{text:firstLine(t.Hook||t['Full text']),viewsL:vl(t),likesL:ll(t),rank:'#'+(i+1),hasCopy:!!po,noCopy:!po,cAcc:po?po.acc:'',cAv:po?avatar(avName(po.acc)):{},cSt:po?pill(po.status,ST[po.status]):pill('',''),cViews:po&&po.ourViews?po.ourViews+' views':'No numbers yet',plan:()=>this.copy(t['Full text'],k,'Original copied'),planLabel:cb.label,openCopy:()=>po&&this.openPost(po.id),lineBg:po?'var(--in)':'var(--hairline-strong)',canPlan:true,dl:(i*70)+'ms',op:E?'1':'0',ty:E?'none':'translateY(10px)'};});
    const latest=c.posts.filter(t=>t._date).sort((a,b)=>b._date-a._date).slice(0,5).map((t,k)=>({text:firstLine(t.Hook||t['Full text']),when:AK.dayWord(t._date),views:vl(t),bt:k===0?'none':'1px solid var(--hairline)'}));
    return{...c,...avatar(c.name),handle:c.handle||'No company X account',stats:[{label:'Followers',v:c.followers,sub:c.folSub},{label:'Posting rate',v:c.rate,sub:'From the sheet'},{label:'Typical engagement',v:c.eng,sub:'Per saved post (median)'},{label:'Best post type',v:c.best,sub:'By engagement'}],
      hasChart,noChart:!hasChart,chart:{line:ch.line,area:ch.area,dash:E?'0':'1600',peakX:hasChart?ch.dots[pk].cx:'0',peakY:hasChart?ch.dots[pk].cy:'0',peakL:hasChart?fmtK(series[pk])+(useViews?' views':' engagement'):'',max:fmtK(ch.max),mid:fmtK(ch.max/2),label:useViews?'Views per post, last 30 days':'Engagement per post, last 30 days'},
      top,hasTop:top.length>0,noTop:!top.length,copied:c.copied+' of '+top.length+' copied',best:c.top.slice(0,5).map((t,i)=>({n:'#'+(i+1),text:firstLine(t.Hook||t['Full text']),views:vl(t),bt:i===0?'none':'1px solid var(--hairline)'})),hasBest:c.top.length>0,latest,hasLatest:latest.length>0};}
  allPostsVals(){const s=this.state;const F=['All','Same thing as us','Overlaps on data','Overlaps on software','Big accounts'];const G={'Same thing as us':'same','Overlaps on data':'data','Overlaps on software':'soft','Big accounts':'big'};
    const gOf=new Map(this.compList().map(c=>[c.c,c]));
    const L=AK.M.theirs.filter(t=>{const c=gOf.get(t._comp);return s.compFilter==='All'||(c&&c.group===G[s.compFilter]);}).slice().sort(AK.bigFirst);
    const lim=s.more.allp||10;const shown=L.slice(0,lim);
    return{filters:F.map(f=>{const on=s.compFilter===f;return{label:f,go:()=>this.setState({compFilter:f}),bg:on?'var(--ink)':'rgba(255,255,255,.75)',fg:on?'#fff':'var(--ink-2)',sh:on?'0 6px 16px -6px rgba(19,20,24,.45)':'var(--shadow-xs), inset 0 0 0 1px var(--hairline)'};}),
      rows:shown.map((t,i)=>{const who=t._comp?t._comp.Name:t.Competitor;const v=num(t.Views);const r=AK.rate(t._eng,v);return{who,...avatar(who),text:firstLine(t.Hook||t['Full text']),views:v?fmtK(v)+' views':(t.Platform||'')+' · no views',likes:t._li?fmtK(num(t.Reactions))+' reactions':fmtK(num(t.Likes))+' likes',rate:r!=null?r+' per 1K':'',when:t._date?AK.dayWord(t._date):(t.Date||''),rankP:pill('#'+t._vrank+' of '+t._vrankN,t._vrank<=3?'in':'neutral'),bt:i===0?'none':'1px solid var(--hairline)',open:()=>this.openComp(AK.norm(who))};}),
      count:'Showing '+shown.length+' of '+L.length,hasMore:L.length>lim,more:()=>this.setState(st=>({more:{...st.more,allp:lim+20}}))};}
  compVals(){const s=this.state;const C=this.compList();const tabs=this.tabs([['Competitors',String(C.length)],['All their posts',String(AK.M.theirs.length)]],s.compTab,t=>this.setState({compTab:t,compId:null}));
    const isList=s.compTab==='Competitors'&&!s.compId,isDetail=s.compTab==='Competitors'&&!!s.compId&&C.some(c=>c.id===s.compId),isAll=s.compTab==='All their posts';
    const o={tabs,isList:isList||(s.compTab==='Competitors'&&!isDetail),isDetail,isAll,back:()=>this.setState({compId:null}),shownNote:C.length+' accounts, from the Competitors tab of the sheet. Followers and posting rates refresh every other day.'};
    const CG=[{id:'same',title:'Same thing as us',help:'They sell what we sell'},{id:'data',title:'Overlaps on data',help:'They sell data or research to our buyers'},{id:'soft',title:'Overlaps on software',help:'Software our buyers also use'},{id:'big',title:'Big accounts',help:'Huge audiences in our space'},{id:'other',title:'Other accounts',help:'Not grouped in the sheet'}];
    if(o.isList)o.groups=CG.map(g=>({...g,list:C.filter(c=>c.group===g.id)})).filter(g=>g.list.length).map(g=>({...g,n:String(g.list.length),rows:g.list.map((c,i)=>({...c,...avatar(c.name),handle:c.handle||'No company X account',copiedLabel:c.copied+' of '+c.top.length+' copied',dots:c.top.map((t,k)=>({bg:k<c.copied?'var(--in)':'var(--n-soft-2)'})),open:()=>this.openComp(c.id),bt:i===0?'none':'1px solid var(--hairline)'}))}));
    if(isDetail)o.d=this.compDetail(s.compId);if(isAll)o.all=this.allPostsVals();return o;}
  midVals(pg){const s=this.state;const o={};const n=s.narrow;
    o.L={cmpCols:n?'minmax(0,1fr)':'minmax(0,1fr) 44px minmax(0,1fr)',arrow:n?'↓':'→',aH:n?'0px':'auto'};
    if(pg==='calendar')o.cal=this.calVals();
    if(pg==='posts'){o.posts=this.postsVals();o.hasCmp=true;o.cmp=this.cmpVals();}
    if(pg==='tracker')o.trk=this.trkVals();
    if(pg==='pdm')o.pdm=this.pdmVals();
    if(pg==='comps'){o.comp=this.compVals();if(o.comp.isDetail){const c=o.comp.d;const h=this.hdrVals(this.ppl());const nx=c.top.findIndex(t=>t.noCopy);const left=c.top.filter(t=>t.noCopy).length;const done=c.top.length-left;
      o.hdr={...h,eyebrow:'Inbound · Competitors',title:c.name,next:!c.top.length?'No posts saved for '+c.name+' yet. They arrive with the next refresh.':left>0?'We’ve copied '+done+' of their '+c.top.length+' biggest posts. Copy #'+(nx+1)+' next.':'All '+c.top.length+' of their biggest posts are copied. Check their latest posts.',cta:'All competitors',go:()=>this.setState({compId:null}),hasCta:true};}}
    const on=s.cmpOn&&pg==='posts';o.cmpUi={op:on?'1':'0',pe:on?'auto':'none',t:on?'none':'scale(.98) translateY(12px)'};
    return o;}
  gateVals(){const g=AK.gate();if(!g||g.wait)return{on:false};
    const fn=g.action==='allow'?()=>AK.allow():g.action==='retry'?()=>AK.refresh():()=>open(AK.SHEET_URL);
    return{on:true,title:g.title,body:g.body,cta:g.action==='allow'?'Allow and load':g.action==='retry'?'Try again':'Open the database',go:fn,sheet:()=>open(AK.SHEET_URL),hasSheet:g.action!=='sheet'};}
  renderVals(){
    const s=this.state;this.viewOnlyRole=(this.props.role??'Agency team')==='Founder (view only)';this.founder=this.viewOnlyRole||!AK.canEdit();
    const narrow=s.narrow;const page=s.page;const sec=PAGES[page].sec;const E=s.entered;const F=this.frame();
    const gate=this.gateVals();const L=(s.loading||!this.ready)&&!gate.on;
    const P=this.ppl();const c=this.counts(P);
    this.lastBy=this.lastBy||{};this.lastBy[sec]=page;
    const ambient=this.props.ambient??true;
    const amb=!ambient?{out:'0',mid:'0',in:'0'}:sec==='home'?{out:'.85',mid:'.75',in:'.75'}:{out:sec==='out'?'1':'.14',mid:sec==='mid'?'1':'.14',in:sec==='in'?'1':'.14'};
    const secObj=SECS.find(x=>x.id===sec);
    const tips={};TIPS.forEach(k=>tips[k]=this.tipFor(k));
    const at=AK.lastUpdate();const tm=at?hhmm(at):'…';const src='Live';
    const ready=this.ready&&!s.loading;
    const out={
      rootRef:this.rootRef,mainRef:this.mainRef,palRef:this.palRef,F,density:narrow?'touch':'comfy',glassMode:{'Frosted':'frosted','Clear':'clear','Solid white':'solid'}[this.props.glass??'Frosted']||'frosted',
      wide:!narrow,narrow,isPhone:!!F.phone,phoneTime:hhmm(Date.now()),amb,nav:this.navVals(c),owners:this.ownerVals(),owner:s.owner,onOwnerSel:e=>this.setOwner(e.target.value),
      openPal:()=>this.openPal(),status:!at?(AK.gate()&&!AK.gate().wait?'Not connected':'Connecting…'):this.founder?'View only · updated '+tm:src+' · '+tm,statusShort:this.founder?'View only · '+tm:'Updated '+tm,
      refresh:()=>{AK.refresh();},openSheet:e=>{e.preventDefault();open(AK.SHEET_URL);},pageLabel:PAGES[page].label,
      subnav:secObj.pages.map(id=>{const on=id===page;return{label:PAGES[id].label,go:()=>this.go(id),bg:on?'var(--ink)':'rgba(255,255,255,.7)',fg:on?'#fff':'var(--ink-2)',sh:on?'0 4px 12px -4px rgba(19,20,24,.4)':'var(--shadow-xs), inset 0 0 0 1px var(--hairline)'};}),hasSub:secObj.pages.length>1,
      tabbar:SECS.map(x=>{const on=x.id===sec;const b=x.id==='out'?c.send:x.id==='mid'?c.inbox+c.pdm:0;return{label:x.label,go:()=>this.go((this.lastBy&&this.lastBy[x.id])||x.pages[0]),fg:on?'var(--ink)':'var(--ink-3)',fw:on?'600':'500',dot:on?ACC[x.id].c:'var(--hairline-strong)',w:on?'22px':'6px',hasBadge:b>0,badge:String(b),badgeBg:ACC[x.id].c};}),
      hdr:this.hdrVals(P),loading:L,notLoading:!L,E:{op:E?'1':'0',t:E?'none':'translateY(10px)'},gate,stale:AK.staleNote(),hasStale:!!AK.staleNote()&&ready,
      is:Object.fromEntries(Object.keys(PAGES).map(k=>[k,page===k&&ready&&!gate.on])),skel3:[1,2,3],skel6:[1,2,3,4,5,6],
      tips,hideTip:()=>this.state.tip&&this.setState({tip:null}),
      cp:this.panelVals(),closePanel:()=>this.setState({cid:null}),pal:this.palVals(),
      toast:{msg:s.toastMsg,hasUndo:!!s.toastUndo,noUndo:!s.toastUndo,ic:s.toastErr?'!':'✓',icBg:s.toastErr?'var(--bad)':'var(--ok)',ws:s.toastErr?'normal':'nowrap',undo:()=>{const u=this.state.toastUndo;this.setState({toastUndo:null,toastOn:false});u&&u();}},
      ui:{scrimOp:s.cid?'1':'0',scrimPe:s.cid?'auto':'none',pT:narrow?'56px':'12px',pR:narrow?'0px':'12px',pB:narrow?'0px':'12px',pW:narrow?'100%':'var(--panel-w)',pRad:narrow?'var(--r-xl) var(--r-xl) 0 0':'var(--r-xl)',pX:s.cid?'none':(narrow?'translateY(104%)':'translateX(calc(100% + 40px))'),pVis:s.cid?'visible':'hidden',pVisDelay:s.cid?'0s':'420ms',
        toastB:narrow?(F.phone?'104px':'84px'):'24px',toastOp:s.toastOn?'1':'0',toastT:s.toastOn?'translate(-50%, 0)':'translate(-50%, 18px)',toastPe:s.toastOn?'auto':'none',
        palPad:narrow?'64px 12px':'12vh 24px',palOp:s.pal?'1':'0',palPe:s.pal?'auto':'none',palT:s.pal?'none':'translateY(-8px) scale(.98)'},
      home:page==='home'&&ready?this.homeVals(P):{}
    };
    if(this.ready)Object.assign(out,this.moreVals(P));
    if(!out.cmp){out.hasCmp=false;out.cmpUi={op:'0',pe:'none',t:'none'};out.L=out.L||{cmpCols:'1fr',arrow:'→',aH:'auto'};}
    return out;
  }
}
return Component;
};
