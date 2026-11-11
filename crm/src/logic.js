/* The CRM page logic: the Claude Design component (design/CRM.dc.html), with its sample data replaced by
   the sheet data from data.js (window.AK) and its actions wired to the real saves. Returns the Component class. */
window.AK_LOGIC=function(DCLogic,React){
const AK=window.AK;
const STAGES=['To send','Contacted','Follow-up 1 sent','Follow-up 2 sent','Replied','Call booked','Customer','Closed'];
const SHORT={'To send':'To send','Contacted':'Contacted','Follow-up 1 sent':'Follow-up 1','Follow-up 2 sent':'Follow-up 2','Replied':'Replied','Call booked':'Call','Customer':'Customer','Closed':'Closed'};
const TONE={neutral:['var(--n-soft)','var(--ink-2)','var(--hairline)'],out:['var(--out-soft)','var(--out-ink)','var(--out-line)'],mid:['var(--mid-soft)','var(--mid-ink)','var(--mid-line)'],in:['var(--in-soft)','var(--in-ink)','var(--in-line)'],ok:['var(--ok-soft)','var(--ok-ink)','var(--ok-line)'],warn:['var(--warn-soft)','var(--warn-ink)','var(--warn-line)'],bad:['var(--bad-soft)','var(--bad-ink)','var(--bad-line)'],solid:['var(--ink)','#fff','var(--ink)'],ghost:['transparent','var(--ink-3)','var(--hairline-strong)']};
const pill=(label,t)=>{const x=TONE[t]||TONE.neutral;return{label,bg:x[0],fg:x[1],bd:'inset 0 0 0 1px '+x[2]};};
const STAGE_T={'To send':'neutral','Contacted':'out','Follow-up 1 sent':'out','Follow-up 2 sent':'out','Replied':'mid','Call booked':'mid','Customer':'ok','Closed':'ghost'};
const STAGE_DOT={'To send':'var(--ink-4)','Contacted':'var(--out)','Follow-up 1 sent':'var(--out)','Follow-up 2 sent':'var(--out)','Replied':'var(--mid)','Call booked':'var(--mid)','Customer':'var(--ok)','Closed':'var(--ink-4)'};
const NEXT_T={'Find their handle':'warn','Find their full name':'warn','Needs research':'warn','Skip for now':'ghost','Send first message':'out','Send follow-up 1':'out','Send follow-up 2':'out','Wait for reply':'ghost','Reply now':'mid','Prep the call':'mid','Check in monthly':'ok','Nothing to do':'ghost','Mark as no reply':'warn','Queued for later':'ghost','Updating…':'ghost'};
const AVP=[['oklch(0.93 0.04 258)','oklch(0.42 0.12 258)'],['oklch(0.93 0.045 158)','oklch(0.4 0.1 158)'],['oklch(0.93 0.04 300)','oklch(0.42 0.13 300)'],['oklch(0.94 0.05 75)','oklch(0.45 0.1 60)'],['oklch(0.93 0.03 210)','oklch(0.42 0.08 210)'],['oklch(0.93 0.035 25)','oklch(0.46 0.12 25)']];
const avatar=s=>{s=String(s||'?').replace(/^@/,'');let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;const p=AVP[h%AVP.length];return{avBg:p[0],avFg:p[1],ini:s.split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()};};
const BTN={primary:{bg:'var(--ink)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.25), inset 0 1px 0 rgba(255,255,255,.14)'},secondary:{bg:'var(--glass-strong)',fg:'var(--ink)',sh:'var(--shadow-sm), var(--hi)'},ghost:{bg:'transparent',fg:'var(--ink-2)',sh:'inset 0 0 0 1px var(--hairline-strong)'},copied:{bg:'var(--ok-soft)',fg:'var(--ok-ink)',sh:'inset 0 0 0 1px var(--ok-line)'},out:{bg:'var(--out)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.2), inset 0 1px 0 rgba(255,255,255,.22)'},mid:{bg:'var(--mid)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.2), inset 0 1px 0 rgba(255,255,255,.22)'},in:{bg:'var(--in)',fg:'#fff',sh:'0 1px 2px rgba(19,20,24,.2), inset 0 1px 0 rgba(255,255,255,.22)'}};
const act=(label,kind,fn)=>({label,...(BTN[kind]||BTN.secondary),fn});
const stop=fn=>e=>{if(e&&e.stopPropagation)e.stopPropagation();fn(e);};
const mkChart=(data,W,H,pad=12)=>{const max=Math.max(1,...data)*1.1;const st=data.length>1?W/(data.length-1):0;const pts=data.map((v,i)=>[+(i*st).toFixed(1),+(H-(v/max)*(H-pad)).toFixed(1)]);return{line:pts.map(p=>p.join(',')).join(' '),area:'M0,'+H+' L'+pts.map(p=>p.join(',')).join(' L')+' L'+W+','+H+' Z',dots:pts.map((p,i)=>({cx:String(p[0]),cy:String(p[1]),v:data[i]})),max};};
const open=url=>{const u=AK.safeUrl(url);if(u)window.open(u,'_blank','noopener');};
// X DMs (9 Nov): straight into the chat with the message typed in (X needs the account's number for that); the profile otherwise.
const xDm=(id,handle,text)=>{id=String(id||'').trim();const h=String(handle||'').replace(/^@/,'').trim();
  const u=/^\d+$/.test(id)?'https://x.com/messages/compose?recipient_id='+id+(text?'&text='+encodeURIComponent(text):''):h?'https://x.com/'+h:'';if(u)window.open(u,'_blank','noopener');};

const PAGES={home:{sec:'home',label:'Home'},send:{sec:'out',label:'Send today'},pipeline:{sec:'out',label:'Pipeline'},scripts:{sec:'out',label:'DM scripts'},inbox:{sec:'mid',label:'Replies and calls'},calendar:{sec:'in',label:'Calendar'},posts:{sec:'in',label:'Inspiration'},engaged:{sec:'mid',label:'Engaged'},tracker:{sec:'in',label:'Post tracker'},pdm:{sec:'mid',label:'Who engaged'},comps:{sec:'in',label:'Competitors'},
  leads:{sec:'leads',label:'Overview'},leadBoard:{sec:'leads',label:'Pipeline'},leadList:{sec:'leads',label:'All leads'},leadAdd:{sec:'leads',label:'Add people'},leadSetup:{sec:'leads',label:'Setup'},gtmNow:{sec:'leads',label:'Right now'},gtmViews:{sec:'leads',label:'Lead lists'},liPipe:{sec:'out',label:'Pipeline'},leadDossier:{sec:'leads',label:'Call dossiers'},leadBrief:{sec:'leads',label:'Daily brief'},xShared:{sec:'out',label:'From LinkedIn'},liOut:{sec:'out',label:'Bot and outreach'},liInbox:{sec:'in',label:'Messages to us'},liMid:{sec:'mid',label:'Replied to us'},gtmEngage:{sec:'mid',label:'Engagement'},gtmDash:{sec:'leads',label:'Dashboard'},liPeople:{sec:'mid',label:'Liked our posts'}};
const SECS=[{id:'home',label:'Home',pages:['home']},{id:'out',label:'Outbound',hint:'30 DMs a day',pages:['send','pipeline','xShared']},{id:'in',label:'Inbound',hint:'3 posts a day',pages:['calendar','posts','tracker']},{id:'mid',label:'Midbound',hint:'People who engage with us',pages:['engaged']}];
// 9 Nov: these pages now live inside others (scripts in Pipeline, competitors in Inspiration, replies and who engaged in Engaged).
const MOVED={scripts:['pipeline',{pipeTab:'Scripts'}],comps:['posts',{inspTab:'comp'}],inbox:['engaged',{}],pdm:['engaged',{}]};
const SECLBL={home:'Home',out:'Outbound',in:'Inbound',mid:'Midbound',leads:'Leads'};
const LEAD_SEC={id:'leads',label:'Leads',hint:'Everyone we’re talking to',pages:['leads','leadBrief','gtmNow','leadBoard','leadDossier','leadList','leadAdd','leadSetup']};
// A call booked for the GTM service (a LinkedIn or X lead, not clipping): these get a call dossier.
const isGtmCall=l=>!!l&&/^(call booked|proposal sent)$/i.test(l.stage||'')&&/^(linkedin|x)$/i.test(l.source||'')&&!/clip|ugc|reel/i.test(String(l.pitch||'')+' '+String(l.closed_for||''))&&(((l.fields||{}).call||{}).kind!=='clipping');
// The call on a lead (11 Nov, from Gmail and cal.com): when, the Meet link, GTM or clipping, booked / declined / cancelled.
const KIND_C={gtm:['GTM call','#e8f1fb','#0a66c2'],clipping:['Clipping call','#fdeef6','#b4237a']};
const callKind=(c,src)=>KIND_C[(c&&c.kind)||(src==='Instagram'?'clipping':src==='LinkedIn'||src==='X'?'gtm':'')]||['Call','var(--n-soft-2)','var(--ink-2)'];
const callWhen=t=>t?new Date(t).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+' IST':'Time not known yet';
// X / LinkedIn (3 Nov): the switch at the top swaps the whole CRM. LinkedIn shows only Calendar and Post tracker for now,
// read from the LinkedIn queue sheet (which posts on its own); every other page is X only.
// Leads (6 Nov): a third option, everyone we're talking to from any channel, with its own pages.
const PLATS=['X','LinkedIn','Leads'];const LI_PAGES=['calendar','tracker','liInbox','liPeople','gtmEngage','liMid','liPipe','liOut'];const LI_ONLY=['liPeople','liInbox','liMid','liPipe','liOut','gtmEngage'];
const LI_SRC={liked:['Liked our post','Midbound'],commented:['Commented on our post','Midbound'],viewed:['Viewed our profile','Midbound'],inbound:['Sent us a request','Inbound'],tagged:['We tagged them','Outbound'],niche:['Commented on a founder post','Outbound'],outbound:['We reached out first','Outbound']};
const liSrcOf=l=>{const li=(l.fields||{}).li||{};if(li.src)return li.src;const o=String(l.origin_key||'');if(o.startsWith('li-src:'))return o.split(':')[1]||'outbound';if(o.startsWith('li-person:'))return /comment/i.test(l.source_detail||'')?'commented':'liked';return 'outbound';};
const LI_ANGLE={advice:'A · Ask for advice',pitch:'B · Direct pitch',freebie:'C · Free ideas'};
const LI_SECS=[{id:'in',label:'Inbound',hint:'Our posts, and people who come to us',pages:['calendar','tracker','liInbox']},{id:'mid',label:'Midbound',hint:'People who engage with us',pages:['liPeople','gtmEngage','liMid']},{id:'out',label:'Outbound',hint:'Requests and messages we send',pages:['liPipe','liOut']}];
// What each page shows, on the (i) next to it in the sidebar (9 Nov). Calendar and Post tracker differ per platform.
const PAGE_INFO={leadBrief:'Every morning at 8:00 IST: what happened yesterday on LinkedIn, X and Instagram, who to follow up with today (and on which channel, WhatsApp included), and the calls coming up with their Google Meet links.',leadDossier:'Every call booked for the GTM service (LinkedIn and X leads): research on them and their company, their likely GTM bottlenecks, a call script and the pitch. Written on its own within 15 minutes of a booking.',xShared:'LinkedIn leads who score 6 or more out of 10. Reach them on X too, so they see you in both places. Mark each one when you message them on X.',home:'Today at a glance: who to answer first, DMs to send, posts planned, and today\u2019s goals.',
  send:'The people to DM on X today, best fit first, with the message already written. Copy it, send it on X, press Mark sent.',
  pipeline:'Everyone we\u2019ve DMed on X and where they are. Board and People show the stages; Scripts is where you edit the 3 DM versions and see which gets replies.',
  calendar:'Your X posts for each day: write them, move them, add an image, mark them scheduled or posted.',
  posts:'Our drafts next to the competitor post each one copies, and the competitors\u2019 best posts to copy next.',
  tracker:'How our X posts are doing: views, likes and replies over time. Checked every 6 hours.',
  engaged:'Everyone who replied to your DMs or engaged with your X posts, with the reply and DM ready to copy. Done moves them to the Pipeline.',
  'LinkedIn|calendar':'Your LinkedIn posts by day, from the LinkedIn queue sheet that posts on its own.',
  'LinkedIn|tracker':'How our LinkedIn posts are doing: reactions, comments and reposts per post, checked twice a day, and the leads they brought in.',
  liInbox:'People who came to us first: they messaged us, asked about our service, or replied to our content.',
  liPeople:'Everyone who liked or commented on our LinkedIn posts, and whether they fit who we sell to. Good fits are added to Leads on their own.',
  gtmEngage:'Founders\u2019 LinkedIn posts worth commenting on today, with a genuine comment ready to copy. A good comment gets them talking to us.',
  liMid:'People we reached out to (a message or a comment) who then engaged back: replied, asked a question, or booked a call.',
  liPipe:'Everyone who liked or commented on our posts and fits who we sell to, from found to won. Each card says what they build, their latest funding and a score out of 10. Approve the bot\u2019s messages right on the cards.',
  liOut:'The LinkedIn bot: is it running, Review or Auto, every message waiting for approval, what went out, the messages it uses, and LinkedIn\u2019s limits. Plus people to reach: new connections we haven\u2019t messaged yet, and outreach in progress, with LinkedIn\u2019s daily limits.',
  leads:'Every channel in one view: open leads, who needs you today, where leads come from, and how outreach turns into calls.',
  gtmNow:'Leads with a buying window open right now (just raised, hiring for growth, or active lately), best first.',
  leadBoard:'Every lead by stage. Drag a card to move it. The channel buttons at the top show one channel at a time.',
  leadList:'Every lead in one table you can sort, filter and export.',
  leadAdd:'People we could reach out to but haven\u2019t added yet. Add to Pipeline puts them in New, ready for outreach.',
  leadSetup:'Stages, groups, who we sell to, and how leads are found automatically.'};
const infoFor=(id,plat)=>PAGE_INFO[plat+'|'+id]||PAGE_INFO[id]||'';
// Leads channel switch (9 Nov): every Leads page shows one channel or all of them.
const CHANNELS=['Instagram','X','LinkedIn','Email'];
const pagesFor=plat=>plat==='LinkedIn'?LI_PAGES:plat==='Leads'?LEAD_SEC.pages:Object.keys(PAGES).filter(k=>PAGES[k].sec!=='leads'&&!LI_ONLY.includes(k)&&!MOVED[k]);
const secsFor=plat=>plat==='LinkedIn'?LI_SECS:plat==='Leads'?[LEAD_SEC]:SECS;
const ACC={leads:{c:'var(--out)',ink:'var(--out-ink)',soft:'var(--out-soft)',btn:'out'},home:{c:'var(--ink)',ink:'var(--ink-2)',soft:'var(--n-soft)',btn:'primary'},out:{c:'var(--out)',ink:'var(--out-ink)',soft:'var(--out-soft)',btn:'out'},mid:{c:'var(--mid)',ink:'var(--mid-ink)',soft:'var(--mid-soft)',btn:'mid'},in:{c:'var(--in)',ink:'var(--in-ink)',soft:'var(--in-soft)',btn:'in'}};
const CFG=window.CRM_CONFIG||{};const BRAND=CFG.brand||'CRM';
const OWNERS=['Everyone',...Object.keys(AK.HANDLES)];
const TIPS=['fq','pilot','cant','fund','fit','likely','verdict','target','eng1k','week','dms','rank','groups','skip'];
const CST={Posted:{dot:'var(--ok)',bg:'var(--ok-soft)',fg:'var(--ok-ink)'},Scheduled:{dot:'var(--ink-3)',bg:'var(--n-soft)',fg:'var(--ink-2)'},'To post':{dot:'var(--warn)',bg:'var(--warn-soft)',fg:'var(--warn-ink)'}};
// Founder call, 29 Oct 2026: DMs wait until the accounts have presence and the Forbes piece is out.
// Daily slots (team ask, 2 Nov): every X account posts 3 a day, one per slot. Our Posts AB "Daily slot" says which;
// rows from before then fall back to their post type. The calendar, the Drafts picker and Our posts filter on these.
const SLOTS3=['Account tag','Founder','Data & product'];
const SLOT_HINT={'Account tag':'Tag 4 to 6 founders who just raised or are hiring for GTM, with a true line on each','Founder':'A lesson or take in Reyansh’s voice, shaped like a viral GTM post','Data & product':'Our own numbers, how the system works, or a free list or script to offer'};
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
const TRK_X={chart:'Total views over time',noChart:'The chart fills in after the tracker’s second check. It runs every 3 hours.',noTop:'Shows up once a post has 30 or more views.',
  noPat:'Patterns show up once a few more posts have 30 or more views.',c1:'Views',c2:'Engagement',c3:'Per 1K views',
  weekTip:'Green: 3 posts and engagement went up. Yellow: fewer posts, or engagement stayed flat. Red: nothing posted, or engagement fell by more than half.'};
const TRK_LI={chart:'Reactions on each LinkedIn post (one dot per post, oldest on the left; hover a dot to see the post)',noChart:'The chart fills in once two posts have reactions.',noTop:'Shows up once a post has reactions.',
  noPat:'Patterns show up once a few more posts have reactions.',c1:'Reactions',c2:'Post type',c3:'Checked',
  weekTip:'Green: a LinkedIn post went out that day (by the sheet’s date). Yellow: still queued, or today with nothing yet. Red: no post that day. Underneath: that day’s reactions.'};
const HEAT_C={Hot:'oklch(0.66 0.17 40)',Warm:'var(--warn)',Cold:'oklch(0.62 0.11 245)'};
const HEAT_L={Hot:'Hot lead',Warm:'Warm lead',Cold:'Cold lead'};
const FIT={hot:{label:'Hot lead',c:'oklch(0.66 0.17 40)'},warm:{label:'Warm',c:'var(--warn)'},'not a fit':{label:'Not a fit',c:'var(--ink-4)'},'':{label:'Checking…',c:'var(--ink-4)'}};
// GTM intelligence (8 Nov): views, their columns, tag colours. Rules in window.GTM (crm/src/gtm.js).
const GTM=window.GTM;
const TAG_C={YC:'oklch(0.68 0.16 45)',AI:'var(--in)','Deep Tech':'var(--mid)','Recently Funded':'var(--ok)','Founder-led GTM':'var(--out)','Hiring Growth':'oklch(0.62 0.11 245)','High Intent':'var(--bad)','Weak Organic Presence':'var(--warn)'};
const GF0={q:'',band:'',min:'',stage:'',status:'',rec:'',emp:'',ind:'',des:'',acq:'',rel:'',last:'',next:'',owner:'',tag:'',sort:''};
// LinkedIn pages built on these lists (9 Nov).
const LI_LISTS={liOut:['linew','licontacted','lifollow'],liInbox:['inbound'],liMid:['midbound','meetings']};
const GV=[
  {id:'linew',label:'Not messaged yet',hint:'In New: connected with us or engaged with our posts, and we haven’t messaged them. Message them, then move them to Contacted.',empty:'Everyone in New has been messaged.',f:x=>/^new$/i.test(x.l.stage)},
  {id:'licontacted',label:'Messaged, waiting',hint:'We messaged them on LinkedIn and they haven’t answered yet.',empty:'Nobody is waiting on a reply.',f:x=>/^contacted$/i.test(x.l.stage)},
  {id:'lifollow',label:'Follow up',hint:'Messaged a while ago with no answer: time for a short follow-up.',empty:'No follow-ups due.',f:x=>/^follow/i.test(x.l.stage)},
  {id:'newconn',label:'New connections',icp:true,hint:'Connected on LinkedIn, not contacted yet. ICP only unless you show the rest.',empty:'Nobody is connected-but-not-contacted right now. When someone accepts an invite and hasn’t had a message yet, they show here (mark them “Connected” on the Outreach tab, or the outreach job logs it).',f:x=>x.c.rel==='new'&&!x.c.closed},
  {id:'icp',label:'ICP qualified',icp:true,hint:'Every open lead scoring 50+ on evidence, best first.',empty:'No lead scores 50+ yet. Scores only count what’s known: fill the Intel tab (funding, team, GTM) for the leads under Needs research.',f:x=>!x.c.closed},
  {id:'outbound',label:'Outbound',icp:true,hint:'Cold ICP prospects we’re reaching out to: when, how, follow-ups and whether they answered.',empty:'No outbound prospects.',f:x=>x.c.rel==='outbound'&&!x.c.closed&&x.c.status!=='Nurture'},
  {id:'midbound',label:'Midbound',hint:'We reached out first, then they engaged: a reply, a question, interest or a meeting. Accepting an invite alone doesn’t count.',empty:'Nobody has engaged after our outreach yet. Log a reply on a lead’s Outreach tab and it moves here.',f:x=>x.c.rel==='midbound'&&!x.c.closed},
  {id:'inbound',label:'Inbound',hint:'They came to us: a DM, an enquiry, a reply to our content, the website or a referral.',empty:'No inbound leads.',f:x=>x.c.rel==='inbound'&&!x.c.closed},
  {id:'meetings',label:'Meetings booked',hint:'A call is booked.',empty:'No meetings booked.',f:x=>x.c.status==='Meeting booked'},
  {id:'qualified',label:'Qualified opportunities',hint:'Qualified after the call.',empty:'No qualified opportunities. Add a Qualified stage on Setup → ICP if it’s missing.',f:x=>x.c.status==='Qualified'},
  {id:'proposal',label:'Proposal sent',hint:'Waiting on a decision.',empty:'No proposals out.',f:x=>x.c.status==='Proposal'},
  {id:'won',label:'Won',hint:'Customers.',empty:'Nothing won yet.',f:x=>x.c.status==='Won'},
  {id:'lost',label:'Lost',hint:'Said no, or went away.',empty:'Nothing lost.',f:x=>x.c.status==='Lost'},
  {id:'nurture',label:'Nurture',hint:'Not now: keep warm until a new buying signal.',empty:'Nobody in Nurture.',f:x=>x.c.status==='Nurture'},
  {id:'dq',label:'Disqualified',hint:'Disqualified by hand, or can’t reach 50 even if every unknown turned out positive.',empty:'Nobody is disqualified.',f:x=>['excluded','disqualified'].includes(x.c.score.band)},
];
const GCOLS={newconn:[['size','Size'],['fund','Last funding'],['icp','Fit score'],['why','Why they qualify'],['angle','Recommended angle']],
  icp:[['size','Size'],['fund','Last funding'],['icp','Fit score'],['window','Buying window'],['why','Why they qualify'],['rel','Relationship']],
  outbound:[['sent','Contacted'],['msg','Message'],['fu','Next follow-up'],['resp','Response'],['icp','Fit score']],
  midbound:[['orig','Original outreach'],['lastint','Last interaction'],['response','Their response'],['etype','Engagement'],['next','Next action'],['meet','Meeting']],
  inbound:[['src','Source'],['ctx','Context'],['lastint','Last interaction'],['next','Next action'],['icp','Fit score']],
  status:[['rel','Relationship'],['src','Source'],['icp','Fit score'],['value','Value'],['next','Next step'],['touch','Last touch']],
  dq:[['icp','Fit score'],['dq','Why excluded'],['rel','Relationship'],['src','Source']]};
const liMarkKey=t=>String(t||'').replace(/\s+/g,' ').trim().slice(0,80).toLowerCase();
const DM_HOLD={on:'DMs are paused, so nothing shows as ready to send or follow-up due. Replies still show.',off:'Copy the message, send it on X, then press Mark sent. Can’t DM = their DMs are closed or need a passcode.'};

/* sheet <-> design */
const SHEET2STAGE={'To send':'To send','Sent':'Contacted','FU1 sent':'Follow-up 1 sent','FU2 sent':'Follow-up 2 sent','Replied':'Replied','Call booked':'Call booked','Customer':'Customer','Not now':'Closed','No reply':'Closed','Do not contact':'Closed'};
const STAGE2SHEET={'To send':'To send','Contacted':'Sent','Follow-up 1 sent':'FU1 sent','Follow-up 2 sent':'FU2 sent','Replied':'Replied','Call booked':'Call booked','Customer':'Customer'};
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
    xid:c['X user ID']||'',why:AK.plain(c['Signal (why now)']||''),whyTime:c['Signal time']||'',handle:c['X handle']||'',linkedin:c.LinkedIn||'',email:c.Email||'',
    ch:/^x/i.test(ch)?'X':ch||'–',tpl:c.Template||'',opener:m.opener,f1:m.fu1,f2:m.fu2,result:c['DM result']||'',
    said:'',saidWhen:'',call:callD?(AK.dayWord(callD)+(callD.getHours()||callD.getMinutes()?', '+hhmm(callD):'')):'',callIso:isoLocal(callD),
    d,fu1Due:c['FU1 due']||'',fu2Due:c['FU2 due']||'',notes:c.Notes||''};
}

class Component extends DCLogic {
  state=(()=>{let page='home';try{page=localStorage.getItem('ak-crm-page')||'home';}catch(e){} if(MOVED[page])page=MOVED[page][0];if(!PAGES[page])page='home';
    const plat=PLATS.includes(store.get('plat','X'))?store.get('plat','X'):'X';if(!pagesFor(plat).includes(page))page=pagesFor(plat)[0];
    const dow=(new Date().getDay()+6)%7;
    return {page,plat,lid:null,led:{},lnew:null,ltab:'intel',lnewForce:false,geTab:'new',geQ:'',geDraft:{},geAdd:{lead:'',url:'',at:'',text:'',draft:''},geMore:false,gv:'newconn',gf:{...GF0},gx:!!store.get('gtm-excl',false),gfMore:false,gmore:false,icpEd:null,lf:{q:'',source:'',group:'',cat:'',dir:'',heat:'',acct:'',rel:''},calDragging:null,calOver:null,lpf:{fit:'hot',kind:'',post:''},lsort:'touch',ldir:1,lmore:false,lcand:'X',lnote:'',lkind:'note',lsetNew:{},ldOver:null,ldMore:{},ldTip:null,owner:'Everyone',cid:null,lastCid:null,toastMsg:'',toastUndo:null,toastErr:false,toastOn:false,narrow:false,done:{},more:{},leaving:{},copied:null,tip:null,loading:true,entered:false,pal:false,palQ:'',notes:{},callAt:{},
    pend:{},anyway:store.get('anyway',{}),v:0,
    pipeTab:'Board',tplEd:{},tplNew:null,lch:store.get('lch',''),navTip:null,likersTxt:'',lisEd:{},lbtEd:{},lbtTpl:{},lbtN:20,inspTab:'drafts',engTab:'todo',sortKey:'pri',sortDir:1,fFund:'All',fStage:'Any stage',fCh:'Any channel',allCols:false,dragId:null,dragOver:null,
    week:0,calDay:dow,postsTab:'To post',postType:'All',addOpen:false,addF:null,calPick:null,calPickKind:'All',calZone:store.get('calZone','ist')==='pst'?'pst':'ist',postPlat:'All',calOpen:{},calKind:'All',calEd:{},calLink:null,calLinkVal:'',linkFor:null,linkVal:'',cmpId:null,cmpOn:false,pdmTab:'To message',compTab:'Competitors',compId:null,compFilter:'All',trkMore:false};})();
  rootRef=React.createRef(); mainRef=React.createRef(); palRef=React.createRef();
  componentDidMount(){
    const el=this.rootRef.current;
    if(el&&window.ResizeObserver){this.ro=new ResizeObserver(es=>{const n=es[0].contentRect.width<860;if(n!==this.state.narrow)this.setState({narrow:n});});this.ro.observe(el);}
    this.onKey=e=>{if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();this.openPal();} if(e.key==='Escape'){if(this.state.lid)this.closeLead();this.setState({cid:null,cmpOn:false,pal:false});}};
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
  go(page,extra){if(MOVED[page]&&this.state.plat==='X'){extra={...MOVED[page][1],...(extra||{})};page=MOVED[page][0];}if(!pagesFor(this.state.plat).includes(page))page=pagesFor(this.state.plat)[0];try{localStorage.setItem('ak-crm-page',page);}catch(e){} this.setState({page,cid:null,pal:false,cmpOn:false,...(extra||{})}); if(this.mainRef.current)this.mainRef.current.scrollTop=0; if(this.ready)this.load(380);}
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
    const inEng=new Set(this.engagers().filter(e=>(e.Status||'To message')==='To message'&&verdictOf(e)!=='Skip').map(e=>String(e.Handle||'').replace(/^@/,'').toLowerCase()));
    const waitsInEng=p=>!!p.handle&&inEng.has(String(p.handle).replace(/^@/,'').toLowerCase());
    return {fu:P.filter(p=>p.due),ts:P.filter(p=>B('send').test(p.act)&&this.canSend(p)&&!waitsInEng(p)).sort(byPri),skip:P.filter(p=>B('send').test(p.act)&&!this.canSend(p)).sort(byPri),
      find:P.filter(p=>B('research').test(p.act)).sort(byPri),noreply:P.filter(p=>B('noreply').test(p.act)).sort(byPri),
      rep:P.filter(p=>p.stage==='Replied'||p.act==='Reply now').sort(byPri),calls:P.filter(p=>p.stage==='Call booked').sort(byPri)};}
  fundPill(p){if(p.fund==='early')return pill(p.funding,'neutral');if(p.fund==='unknown')return pill('Funding unknown','ghost');if(p.fund==='none')return pill('Funding not checked','ghost');return pill(p.funding,'neutral');}
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
    if(/^(Contacted|Follow-up)/.test(p.stage))return 'Wait for reply';
    return a||'Nothing to do';}
  nextMsg(p){if(p.due)return p.fuN===2?{title:'Follow-up 2',text:p.f2}:{title:'Follow-up 1',text:p.f1};
    if(p.stage==='Contacted')return{title:'Follow-up 1',text:p.f1};if(p.stage==='Follow-up 1 sent')return{title:'Follow-up 2',text:p.f2};return{title:'First message',text:p.opener};}

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
    const nx=p.due?(p.fuN===2?'Follow-up 2 sent':'Follow-up 1 sent'):({'To send':'Contacted','Contacted':'Follow-up 1 sent','Follow-up 1 sent':'Follow-up 2 sent'}[p.stage]||p.stage);
    this.setState(s=>({leaving:{...s.leaving,[id]:true}}));
    // Stays hidden while it saves; only comes back if the save fails.
    setTimeout(async()=>{await this.setStage(id,nx,'Marked as sent to '+p.first);this.setState(s=>{const l={...s.leaving};delete l[id];return{leaving:l};});},300);}
  // Their DMs are closed or need a passcode: off today's list (Status "Not now"), and the next person moves up.
  async cantDM(p){const c=AK.M.contacts.find(x=>x._key===p.id)||p.c;const d=new Date();
    const cells=Object.assign({},AK.statusCells(c,'Not now'),{'DM result':'Not sent on X ('+d.getDate()+' '+AK.MON[d.getMonth()]+'): DMs closed or need a passcode'});
    this.setState(s=>({leaving:{...s.leaving,[p.id]:true}}));
    setTimeout(async()=>{await this.saveCells(p,cells,p.first+'’s DMs are closed. Next person moved up.');this.setState(s=>{const l={...s.leaving};delete l[p.id];return{leaving:l};});},300);}
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
    return secsFor(s.plat).map(sec=>({label:sec.label,hint:sec.hint||'',hasHead:sec.id!=='home',accent:ACC[sec.id].c,pages:sec.pages.map(id=>{const on=s.page===id;const b=badges[id]||0;const info=infoFor(id,s.plat);return{label:PAGES[id].label,info,hasInfo:!!info,tipOn:s.navTip===id,tipShow:stop(e=>{const r=e&&e.currentTarget&&e.currentTarget.getBoundingClientRect?e.currentTarget.getBoundingClientRect():null;this.setState({navTip:id,navTipUp:!!r&&r.top>window.innerHeight*0.55});}),tipTop:s.navTipUp?'auto':'22px',tipBottom:s.navTipUp?'22px':'auto',tipHide:()=>{if(this.state.navTip===id)this.setState({navTip:null});},go:()=>this.go(id),bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-2)',fw:on?'600':'450',sh:on?'var(--shadow-sm), var(--hi)':'none',dot:on?ACC[sec.id].c:'transparent',dotS:on?'scale(1)':'scale(.4)',hasBadge:b>0,badge:String(b),badgeBg:on?ACC[sec.id].c:ACC[sec.id].soft,badgeFg:on?'#fff':ACC[sec.id].ink};})}));}
  ownerVals(){return OWNERS.map(o=>{const on=this.state.owner===o;const a=o==='Everyone'?{avBg:'var(--n-soft-2)',avFg:'var(--ink-2)',ini:'∗'}:avatar(avName(o));return{label:o,...a,pick:()=>this.setOwner(o),bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-3)',sh:on?'var(--shadow-sm), var(--hi)':'none'};});}
  setOwner(o){if(o===this.state.owner)return;this.setState({owner:o});if(this.ready)this.load(320);}
  platVals(){return PLATS.map(x=>{const on=this.state.plat===x;return{label:x,ini:x==='X'?'𝕏':x==='LinkedIn'?'in':'◎',avBg:x==='X'?'var(--ink)':x==='LinkedIn'?'#0a66c2':'var(--out)',avFg:'#fff',pick:()=>this.setPlat(x),
    bg:on?'#fff':'transparent',fg:on?'var(--ink)':'var(--ink-3)',sh:on?'var(--shadow-sm), var(--hi)':'none'};});}
  setPlat(x){if(x===this.state.plat||!PLATS.includes(x))return;store.set('plat',x);const ok=pagesFor(x).includes(this.state.page);
    this.flushLead();this.setState({plat:x,cid:null,lid:null,led:{},lnew:null,pal:false,calPick:null,calLink:null,linkFor:null,...(ok?{}:{page:pagesFor(x)[0]})});if(this.mainRef.current)this.mainRef.current.scrollTop=0;if(this.ready)this.load(320);}

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
  postList(){const k=AK.version()+'|'+this.state.plat;if(this._opv!==k){this._opv=k;const li=this.state.plat==='LinkedIn';
    this._posts=(li?this.liRows():AK.M.ours).map(o=>this.postObj(o));}return this._posts;}
  liRows(){const marks=AK.leadSetting('li_marks')||{};const live=new Map(AK.SOC.posts.filter(p=>p.platform==='linkedin').map(p=>[liMarkKey(p.text),p.url]));
    return AK.M.li.map(o=>{const k=liMarkKey(o['Our version']);const url=!o['Posted link']&&live.get(k);
      if(url)return{...o,Status:'Posted','Posted link':url,_autoPosted:true};if(marks[k]==='Posted'&&o.Status!=='Posted')return{...o,Status:'Posted',_marked:true};return o;});}
  ownPosts(){const ORD={'To post':0,'Scheduled':1,'Posted':2,'Later':3};
    const pl=this.state.postPlat;
    return this.postList().filter(p=>this.own(p.account)&&(pl==='All'||platOf(p.o)===pl)).sort((a,b)=>(ORD[a.status]-ORD[b.status])||(a.status==='Posted'?b.when-a.when:a.when-b.when));}
  openPost(id){const p=this.postList().find(x=>x.id===id);if(!p)return;this.go('posts',{postsTab:p.status,cmpId:id,cmpOn:true});}

  /* ---------- header ---------- */
  hdrVals(P){const s=this.state;const page=s.page;const sec=PAGES[page].sec;const A=ACC[sec];const B=BTN[A.btn];
    const L=this.lists(P);const rep=L.rep,calls=L.calls,fu=L.fu,ts=L.ts;
    let h={eyebrow:(s.plat==='LinkedIn'?'LinkedIn':SECLBL[sec])+' · '+PAGES[page].label,title:PAGES[page].label,next:'',cta:'',go:null};
    const g=AK.gate();
    if(page==='home'){h.eyebrow='Home · today';h.title=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
      if(rep[0])h={...h,next:'Reply to '+rep[0].name+' at '+rep[0].company+' first.'+(rep.length>1?' '+(rep.length-1)+' other '+(rep.length-1===1?'reply is':'replies are')+' waiting.':''),cta:'Open reply',go:()=>this.openC(rep[0].id)};
      else if(fu[0])h={...h,next:'No replies waiting. '+fu.length+' follow-up'+(fu.length===1?' is':'s are')+' due, starting with '+fu[0].name+'.',cta:'Go to Send today',go:()=>this.go('send')};
      else{const today=this.ownPosts().filter(p=>p.status!=='Later'&&p.o._date&&AK.sameDay(p.o._date,new Date()));
        h=ts.length&&!AK.dmsPaused()?{...h,next:'No replies waiting. '+ts.length+' DMs are ready to send, and '+today.length+(today.length===1?' post is':' posts are')+' planned for today (goal: 3).',cta:'Go to Send today',go:()=>this.go('send')}
          :{...h,next:'No replies waiting. '+(AK.dmsPaused()?'DMs are paused for now, so today':'Today')+' is about posts: '+today.length+' of 3 planned for today.',cta:'Open Calendar',go:()=>this.go('calendar')};}}
    if(page==='send'&&AK.dmsPaused()){h.title='Send today';h.next='DMs are paused. Press Resume DMs when you want to start again.';}
    else if(page==='send'){h.title='Send today';h.next=fu.length?fu.length+' follow-ups are due. Send those first, then '+ts.length+' first messages.':ts.length+' first messages are ready, best fit first.';h.cta=fu.length?'Start with '+fu[0].first:'';h.go=fu[0]?()=>this.openC(fu[0].id):null;}
    if(page==='pipeline'&&s.pipeTab==='Scripts'){h.next='Each new lead gets the next script in turn. Edit one here and every unsent message uses the new text.';}
    if(page==='engaged'){const E=this.engagers().filter(e=>(e.Status||'To message')==='To message'&&verdictOf(e)!=='Skip');const lr=(AK.XJ.runs.x||[])[0];const failed=lr&&lr.ok===false&&lr.error;
      h.next=rep.length?rep.length+(rep.length===1?' person replied':' people replied')+' to your DMs. Answer them first.':E.length?E.length+(E.length===1?' person':' people')+' engaged with your posts. Copy the reply or DM, send it, then press Done.':failed?'Last check of X failed ('+this.since(lr.started_at)+'): '+lr.error:'Nothing waiting. New replies, quotes and mentions show up here every 6 hours.';
      if(AK.XJ.running['x-engage'])h.next='Checking X for new replies, quotes and mentions\u2026 about a minute.';}
    if(page==='pipeline'&&s.pipeTab!=='Scripts'){const sent=P.filter(p=>['Contacted','Follow-up 1 sent','Follow-up 2 sent'].includes(p.stage)).length;
      h.next=rep.length?rep.length+' people replied and are waiting on us. Calls come next: '+calls.length+' booked.':P.length+' people in the pipeline. '+sent+' have a message out and nobody is waiting on a reply from us.';h.cta=rep.length?'Open replies':'';h.go=rep.length?()=>this.go('inbox'):null;}
    if(page==='inbox'){h.title='Replies and calls';h.next=rep[0]?'Reply to '+rep[0].first+' at '+rep[0].company+'. Then prep for '+(calls[0]?calls[0].first+'’s call'+(calls[0].call?' on '+calls[0].call:''):'your next call')+'.':calls[0]?'Nobody is waiting on a reply. Prep for '+calls[0].first+'’s call'+(calls[0].call?' on '+calls[0].call:'')+'.':(()=>{const R=this.postReplies();const b=R.filter(e=>verdictOf(e)==='DM + reply');return R.length?R.length+(R.length===1?' reply is':' replies are')+' worth answering'+(b.length?', '+b.length+' from people who fit our ICP. Start with '+String(b[0].Name||b[0].Handle).split(' ')[0]+'.':'. Reply under their comments.'):'Nobody is waiting on a reply.';})();h.cta=rep[0]?'Reply to '+rep[0].first:calls[0]?'Prep the call':'';h.go=rep[0]?()=>this.openC(rep[0].id):calls[0]?()=>this.openC(calls[0].id):null;}
    if(page==='calendar'){const today=new Date();const n=this.postList().filter(p=>onCal(p)&&p.o._date&&AK.sameDay(p.o._date,today)).length;
      h.next=n?n+' post'+(n===1?' is':'s are')+' on the calendar for today.':'Nothing is on the calendar for today yet.';h.cta='';h.go=null;}
    if(page==='posts'){const tp=this.ownPosts().filter(p=>p.status==='To post');const n=tp[0];
      h.next=n?tp.length+' post'+(tp.length===1?' is':'s are')+' ready to go out. '+n.acc+'’s '+n.comp+' copy ('+n.time.replace(/^[A-Z][a-z]/,x=>x.toLowerCase())+') is next'+(n.q?', and it has a question for the founders.':'.'):'Nothing is waiting to go out. Pick one of the best posts below to copy next.';
      h.cta=n?'Copy our version':'';h.go=n?()=>this.copy(n.text,'hdr','Our version copied'):null;}
    if(page==='tracker'&&s.plat==='LinkedIn'){const st=AK.liState();const C=this.liWeek().flatMap(r=>r.cells).filter(c=>c.k!=='future');
      const miss=C.filter(c=>c.k==='red').map(c=>AK.DOW[c.day.getDay()]),done=C.filter(c=>c.n>0).length,wait=C.filter(c=>!c.n&&c.queued).length;
      const and=a=>a.length>1?a.slice(0,-1).join(', ')+' and '+a[a.length-1]:a[0];
      h.next=!st.loaded?(st.err||'Loading the LinkedIn sheet…'):miss.length?'No LinkedIn post on '+and(miss)+' this week. One a day is the plan.':
        done?done+(done===1?' day has':' days have')+' had a LinkedIn post this week'+(wait?', and '+wait+' more '+(wait===1?'is':'are')+' queued.':'.'):wait?((()=>{const ids=this.accs().map(a=>a.acc);const wk=AK.weekStart(0).getTime();const out=AK.liTracked().filter(t=>ids.includes(t.account)&&t.first&&t.first>=wk).length;return out?out+(out===1?' post has':' posts have')+' gone out on LinkedIn this week. The LinkedIn sheet still marks '+wait+' as queued.':'Nothing has gone out on LinkedIn this week yet. '+wait+(wait===1?' post is':' posts are')+' queued.';})()):'Nothing is planned on LinkedIn this week yet.';
      h.cta='Open Calendar';h.go=()=>this.go('calendar');}
    else if(page==='tracker'){const W=AK.weekGrid(this.accs().map(a=>a.acc));const miss=[];
      const and=a=>a.length>1?a.slice(0,-1).join(', ')+' and '+a[a.length-1]:a[0];
      for(const r of W){const d=r.cells.filter(c=>c.k!=='future'&&!c.today&&c.n===0).map(c=>AK.DOW[c.day.getDay()]);if(d.length)miss.push(ownerName(r.account)+' posted nothing on '+and(d));}
      h.next=miss.length?miss.join('. ')+'. Each account posts 3 a day.':'Every account has posted every day this week so far.';h.cta='Open Calendar';h.go=()=>this.go('calendar');}
    if(page==='pdm'){const L2=this.pdmCards().filter(p=>p.status==='To message');
      h.next=L2.length?(L2.length===1?'1 person who fits our ICP is':L2.length+' people who fit our ICP are')+' waiting for a DM. Start with '+L2[0].name+': '+String(L2[0].bio).replace(/\.$/,'')+'.':'Nobody who fits is waiting for a DM. Replies, quotes and mentions on our X posts are checked every 6 hours.';h.cta=L2.length?'Show who to message':'';h.go=L2.length?()=>this.setState({pdmTab:'To message'}):null;}
    if(page==='comps'){const top=this.compList().filter(c=>c.freshUncopied>0).sort((a,b)=>b.freshUncopied-a.freshUncopied)[0];
      h.next=top?top.name+' posted '+top.freshUncopied+' post'+(top.freshUncopied===1?'':'s')+' in the last 7 days that we haven’t copied yet.':'No competitor has posted anything new and uncopied in the last 7 days.';h.cta=top?'Open '+top.name:'';h.go=top?()=>this.openComp(top.id):null;}
    if(sec==='leads'||LI_LISTS[page]||page==='gtmEngage'||page==='liPipe'){h=this.leadHdr(page,h);if(s.plat==='LinkedIn')h={...h,eyebrow:'LinkedIn · '+PAGES[page].label,title:PAGES[page].label,cta:'',go:null};}
    if(page==='liPeople')h=this.liPeopleHdr(h);
    if(g&&!g.wait){h.next='Nothing to show until the data loads.';h.cta='';h.go=null;}
    if(this.founder&&page!=='home'){h.cta=h.go?h.cta.replace('Copy our version','See posts'):'';}
    return{...h,hasCta:!!(h.cta&&h.go),dot:A.c,ink:A.ink,soft:A.soft,bg:B.bg,fg:B.fg,sh:B.sh};}
  ownPostsFor(acc){return this.postList().filter(p=>p.account===acc);}

  /* ---------- home ---------- */
  homeVals(P){const s=this.state;const E=s.entered;const L=this.lists(P);
    const today=new Date();const planned=this.postList().filter(p=>onCal(p)&&p.o._date&&AK.sameDay(p.o._date,today)).length;
    const fresh=AK.newPosts();const toDM=this.engagers().filter(e=>e.Status!=='Messaged').length;
    const cards=[{label:'Outbound',hint:'DMs on X',dot:'var(--out)',a:String(L.ts.length),aL:'to send today',b:String(L.fu.length),bL:'follow-ups due',go:()=>this.go('send')},{label:'Inbound',hint:'Our posts',dot:'var(--in)',a:String(planned),aL:'posts planned today',b:String(fresh.length),bL:'new competitor posts',go:()=>this.go('calendar')},{label:'Midbound',hint:'People who engaged',dot:'var(--mid)',a:String(L.rep.length),aL:'DM replies waiting',b:String(toDM),bL:'people who engaged',go:()=>this.go('engaged')}];
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
    return{cards,todo,allDone:raw.length===0,emptyTitle:L.ts.length&&!AK.dmsPaused()?'No replies to answer':'All done for now',emptySub:L.ts.length&&!AK.dmsPaused()?'Next up: '+L.ts.length+(L.ts.length===1?' DM is':' DMs are')+' ready on Send today.':'New replies show up here as soon as they come in.',doneLabel:raw.length?nd+' of '+raw.length+' done':'',donePct:raw.length?Math.round(nd/raw.length*100)+'%':'100%',hasMoreTodo:raw.length>10&&!s.more.todo,moreTodo:()=>this.setState(st=>({more:{...st.more,todo:true}})),moreTodoN:String(raw.length-10),
      alerts:fresh.slice(0,4).map(t=>{const who=t._comp?t._comp.Name:t.Competitor;const v=num(t.Views);return{who,comp:AK.norm(who),...avatar(who),what:'posted “'+clip(firstLine(t.Hook||t['Full text']),90)+'”',stat:v?fmtK(v)+' views':fmtK(t._eng)+' engagement',when:AK.dayWord(t._date),go:()=>this.openComp(AK.norm(who))};}),hasAlerts:fresh.length>0,
      fq,hasFq:false,
      goals:this.todayGoals(P).map(g=>({name:g.name,v:String(g.v),tgt:String(g.tgt),w:E&&g.tgt?Math.min(100,g.v/g.tgt*100)+'%':'0%'})),
      ...this.weekReplies(E)};}
  // The three daily goals (9 Nov): 3 posts, 30 DMs, everyone who engaged answered.
  todayGoals(P){const today=new Date();const sameDay=d=>d&&AK.sameDay(d,today);
    const posted=this.postList().filter(p=>platOf(p.o)==='X'&&p.status==='Posted'&&sameDay(p.o._date)).length;
    const sent=P.filter(p=>[p.d[0],p.d[1],p.d[2]].some(x=>sameDay(AK.cellDate(x)))).length;
    const eng=this.engagers().filter(e=>sameDay(AK.parseDate(e['Found on']))&&verdictOf(e)!=='Skip');const done=eng.filter(e=>/Messaged|Replied|Dismissed/.test(e.Status||'')).length;
    return[{name:'Posts on X today',v:posted,tgt:3},{name:'DMs sent today (first messages and follow-ups)',v:sent,tgt:30},{name:'People who engaged, answered',v:done,tgt:eng.length}];}
  // Replies to our DMs plus people who engaged with our posts, per week, for the last 6 weeks.
  weekReplies(E){const now=AK.weekStart(0).getTime();const wk=d=>now-Math.ceil((now-d.getTime())/(7*864e5))*7*864e5;const by={};
    for(const c of AK.M.contacts){const d=AK.cellDate(c['Replied on']);if(d)by[wk(d)]=(by[wk(d)]||0)+1;}
    for(const e of this.engagers()){const d=AK.parseDate(e['Found on']);if(d&&verdictOf(e)!=='Skip')by[wk(d)]=(by[wk(d)]||0)+1;}
    const weeks=[5,4,3,2,1,0].map(i=>now-i*7*864e5);const v=weeks.map(w=>by[w]||0);
    return{inqText:v[5]+' this week (DM replies plus people worth answering on our posts).',hasInq:true,
      inq:v.map((n,i)=>({h:E?Math.max(4,Math.min(40,n*3))+'px':'4px',bg:i===5?'var(--mid)':'var(--n-soft-2)',dl:(i*60)+'ms',t:n+' that week'}))};}
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
    const A={'To send':[cpy,act('Mark first message sent','primary',()=>this.setStage(p.id,'Contacted','Marked as contacted'))],
      'Contacted':[cpy,act('Mark follow-up 1 sent','primary',()=>this.setStage(p.id,'Follow-up 1 sent')),act('They replied','mid',()=>this.setStage(p.id,'Replied'))],
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
    const liM=s.plat!=='X';
    const ppl=(liM?[]:this.allPeople()).filter(p=>!q||(p.name+' '+p.company+' '+p.role).toLowerCase().includes(q)).slice(0,q?6:4).map(p=>({...avatar(p.name),title:p.name,sub:(p.role?p.role+' · ':'')+p.company,tag:pill(p.stage,STAGE_T[p.stage]),go:()=>{this.setState({pal:false});this.openC(p.id);}}));
    const comps=(liM?[]:this.compList()).filter(c=>!q||(c.name+' '+c.handle).toLowerCase().includes(q)).slice(0,q?5:3).map(c=>({...avatar(c.name),title:c.name,sub:c.handle||c.groupLabel,go:()=>this.openComp(c.id)}));
    const pages=pagesFor(s.plat).filter(k=>!q||PAGES[k].label.toLowerCase().includes(q)).slice(0,q?5:4).map(k=>({title:PAGES[k].label,sub:SECLBL[PAGES[k].sec],dot:ACC[PAGES[k].sec].c,go:()=>this.go(k)}));
    if(s.plat==='Leads')ppl.push(...this.leadsAll().filter(l=>!q||[l.name,l.company,l.email,l.x_handle,l.group_name].join(' ').toLowerCase().includes(q)).slice(0,q?6:4)
      .map(l=>({...avatar(l.name||l.company),title:l.name||'(no name)',sub:[l.company,l.stage].filter(Boolean).join(' · '),tag:pill(l.stage,'neutral'),go:()=>{this.setState({pal:false});this.openLead(l.id);}})));
    return{q:s.palQ,onQ:e=>this.setState({palQ:e.target.value}),onKey:e=>{if(e.key==='Enter'){const f=ppl[0]||comps[0]||pages[0];f&&f.go();}},ppl,comps,pages,hasPpl:ppl.length>0,hasComps:comps.length>0,hasPages:pages.length>0,none:!ppl.length&&!comps.length&&!pages.length,close:()=>this.setState({pal:false}),stop:e=>e.stopPropagation()};}

  /* ---------- outbound ---------- */
  row(p,i,kind){const s=this.state;const a=avatar(p.name);const lv=!!s.leaving[p.id];const f=this.founder;const nm=this.nextMsg(p);const key=p.id+'row';const cb=this.copyBtn(key,kind==='fu'?'Copy '+nm.title.toLowerCase():'Copy message');
    let actions=[];
    if(!f){if(kind==='send'||kind==='fu')actions=[act(p.xid?'Open DM':'Open X','ghost',stop(()=>xDm(p.xid,p.handle,nm.text))),act(cb.label,s.copied===key?'copied':'secondary',stop(()=>this.copy(nm.text,key,nm.title+' for '+p.first+' copied'))),act('Mark sent','primary',stop(()=>this.markSent(p.id)))];
      if(kind==='send')actions.splice(1,0,act('Can’t DM','ghost',stop(()=>this.cantDM(p))));
      if(kind==='find')actions=[act('Search on X','secondary',stop(()=>{window.open('https://x.com/search?q='+encodeURIComponent(p.name+' '+p.company)+'&f=user','_blank','noopener');this.toast('Searching X for '+p.name+'. Add the handle in the sheet.');}))];
      if(kind==='skip')actions=[act('Send anyway','ghost',stop(()=>{const any={...this.state.anyway,[p.id]:true};store.set('anyway',any);this.setState({anyway:any});this.toast(p.first+' moved to Send today (on this browser)',()=>{const x={...this.state.anyway};delete x[p.id];store.set('anyway',x);this.setState({anyway:x});this.toast('Undone');});}))];
      if(kind==='noreply')actions=[act('Mark as no reply','secondary',stop(()=>this.setStage(p.id,'Closed','Closed '+p.first+': no reply')))];
      if(kind==='reply')actions=[act('Reply now','mid',stop(()=>this.openC(p.id)))];
      if(kind==='call')actions=[act('Prep the call','mid',stop(()=>this.openC(p.id)))];
      if(kind!=='call')actions.push(act('×','ghost',stop(()=>this.dismissPerson(p))));}
    const nx=this.nextOf(p);const msgRow=(kind==='send'||kind==='fu')&&!!nm.text;
    return{...a,id:p.id,name:p.name,role:(p.role||'–')+(p.handle?' · @'+String(p.handle).replace(/^@/,''):''),company:p.company,fund:msgRow&&p.tpl?pill(({A:'Pitch',B:'Asks advice',C:'Gives value'}[String(p.tpl).charAt(0).toUpperCase()]||'Script')+' · '+p.tpl,'neutral'):this.fundPill(p),next:pill(nx,NEXT_T[nx]),actions,open:()=>this.openC(p.id),bt:i===0?'none':'1px solid var(--hairline)',op:lv?'0':'1',tf:lv?'translateX(24px)':'none',mh:lv?'0px':(msgRow?'420px':'240px'),py:lv?'0px':'var(--row-py)',said:msgRow?nm.text:p.said,hasSaid:msgRow||(kind==='reply'&&!!p.said),saidWhen:msgRow?(p.why?clip(p.why,120):''):p.saidWhen,hasCall:kind==='call'&&!!p.call,call:p.call,ownerIni:p.owner[0],owner:p.owner};}
  group(id,title,help,list,kind,lim=5){const n=this.state.more[id]||lim;const shown=list.slice(0,n);return{id,title,help,count:String(list.length),rows:shown.map((p,i)=>this.row(p,i,kind)),hasMore:list.length>n,moreN:String(Math.min(20,list.length-n)),more:()=>this.setState(s=>({more:{...s.more,[id]:n+20}})),show:list.length>0};}
  sendVals(P){const s=this.state;const E=s.entered;const L=this.lists(P);
    const groups=[this.group('fu','Follow-ups due','They saw the first message and haven’t replied.',L.fu,'fu'),this.group('ts','Send today','First messages, best fit first.',L.ts,'send'),this.group('nr','Mark as no reply','Two follow-ups and a week of silence.',L.noreply,'noreply'),this.group('find','Find their handle first','We know who they are, not their X account or full name.',L.find,'find')].filter(g=>g.show);
    const R=AK.dmResults(P.map(p=>p.c));let res=null,acc=[];
    if(R){const dw=AK.dayWord(R.date);const tag=AK.DOW[R.date.getDay()]+' '+R.tag;
      res={day:(dw===tag.split(' ')[0]||/^\d/.test(dw)?'':dw+' · ')+tag,dayLow:/^\d/.test(dw)?'on '+R.tag:dw.toLowerCase()==='today'?'today':dw.toLowerCase()==='yesterday'?'yesterday':'on '+tag,sent:String(R.sent.length),hasAcc:R.sent.length>0&&Object.keys(AK.HANDLES).length>1,cant:String(R.notSent.length),hasCant:R.notSent.length>0,why:R.why.map(w=>({n:String(w.n),label:w.label}))};
      const tgt=a=>num((AK.M.stats.find(x=>x.Account===a)||{})['Daily target'])||30;
      acc=Object.keys(AK.HANDLES).map(a=>({a,n:R.sent.filter(c=>c.Owner===a).length})).filter(x=>x.n>0).map(x=>{const of=tgt(x.a);const name=ownerName(x.a);return{name,...avatar(avName(name)),done:x.n,of,label:x.n+' of '+of,w:E?Math.min(100,x.n/of*100)+'%':'0%',bar:x.n>=of?'var(--ok)':'var(--out)'};});}
    const so=!!s.more.skip;const early=L.skip.filter(p=>p.fund==='early').length;
    const lr=(AK.XJ.runs['x-leads']||[]).find(r=>r.ok);const run=!!AK.XJ.running['x-leads'];const sm=lr&&lr.summary||{};
    const finder={text:run?'Looking for founders on X who just raised or are hiring for GTM… about a minute.':lr?'Lead finder: '+(sm.added_today!=null&&AK.sameDay(new Date(lr.started_at),new Date())?sm.added_today+' new people today (goal '+(sm.target||40)+'). ':'')+'Last ran '+this.since(lr.finished_at||lr.started_at)+'. Runs on its own at 7:30 and 12:30 IST.':'Lead finder: finds 30 to 40 funded founders to DM every morning at 7:30 IST.',
      idle:!run,run:()=>{if(AK.canEdit())AK.xRun('x-leads');}};
    return{finder,groups,noDM:false,hasGroups:groups.length>0,allClear:groups.length===0,acc,hasRes:!!res&&(res.sent!=='0'||res.hasCant),res:res||{},hold:AK.dmsPaused()?DM_HOLD.on:DM_HOLD.off,clearTitle:AK.dmsPaused()?'DMs are paused':'Everything for today is sent',clearText:AK.dmsPaused()?'Nothing to send while DMs are paused. Press Resume DMs above to bring the list back.':'The lead finder adds new people every morning. Press Find more now to look straight away.',pauseLabel:AK.S.busy.has('pause')?'Saving…':AK.dmsPaused()?'Resume DMs':'Pause DMs',togglePause:()=>{if(AK.canEdit())AK.savePaused(!AK.dmsPaused());},holdDot:AK.dmsPaused()?'var(--warn, #b7791f)':'var(--ok)',skipOpen:so,skipN:String(L.skip.length),skipLabel:'Skipped for now: '+L.skip.length+(early===L.skip.length?' seed-stage people':' seed-stage or unclear-funding people'),hasSkip:L.skip.length>0,skipRot:so?'rotate(90deg)':'none',skipCta:so?'Hide':'Show',toggleSkip:()=>this.setState(st=>({more:{...st.more,skip:!st.more.skip}})),skipRows:L.skip.slice(0,s.more.skipAll?999:20).map((p,i)=>this.row(p,i,'skip')),showEveryone:()=>this.setOwner('Everyone')};}
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
    const nS=AK.M.templates.filter(t=>/^[A-Z]\d+[A-Z]?$/.test(t.ID)).length;
    const tabs=this.tabs([['Board',''],['People',String(P.length)],['Scripts',String(nS)]],s.pipeTab,t=>this.setState({pipeTab:t}));
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
        cards:c.list.slice(0,lim).map(p=>{const nx=this.nextOf(p);return{...avatar(p.name),name:p.name,company:p.company,fund:this.fundPill(p),next:pill(nx,NEXT_T[nx]),ownerIni:p.owner[0],owner:p.owner,manyOwners:Object.keys(AK.HANDLES).length>1,when:(()=>{const w=(p.d.filter(Boolean).slice(-1)[0]||'').split(',')[0];const t=w?new Date(w):null;return t&&!isNaN(t)?(p.stage==='To send'?'':'Last message ')+this.since(t.toISOString()):w;})(),op:s.dragId===p.id?'.35':'1',tf:s.dragId===p.id?'rotate(-1.5deg) scale(.98)':'none',open:()=>this.openC(p.id),
          start:e=>{try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',p.id);}catch(_){} setTimeout(()=>this.setState({dragId:p.id}),0);},end:()=>this.setState({dragId:null,dragOver:null})};})};})};}
  tblVals(P){const s=this.state;
    let L=P.filter(p=>{if(s.fFund==='Series A or later'&&p.fund!=='late')return false;if(s.fFund==='Seed or pre-seed'&&p.fund!=='early')return false;if(s.fFund==='Unknown'&&p.fund!=='unknown'&&p.fund!=='none')return false;if(s.fStage!=='Any stage'&&p.stage!==s.fStage)return false;if(s.fCh!=='Any channel'&&p.ch!==s.fCh)return false;return true;});
    const k=s.sortKey;const val=p=>k==='stage'?STAGES.indexOf(p.stage):k==='fit'?-(p.fitN||0):k==='pri'?-(p.priN==null?-99:p.priN):k==='next'?this.nextOf(p):k==='funding'?p.funding.toLowerCase():String(p[k]||'').toLowerCase();
    L=[...L].sort((a,b)=>{const x=val(a),y=val(b);return(x>y?1:x<y?-1:0)*s.sortDir||byPri(a,b);});
    const lim=s.more.tbl||10;const total=L.length;
    const TT={fund:'Their latest round, as the lead finder found it.',fit:'How closely they match who we sell to, from the 1–10 fit score: Strong is 9 or 10, Good is 7 or 8.',likely:'What they would most likely buy from us, worked out from their company and role.'};
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
  /* Engaged (9 Nov): DM replies, calls, and everyone who replied to, quoted or mentioned our posts, with the reply and the
     DM ready to copy. Done puts an engager in the Pipeline as Contacted. */
  engagedVals(P){const s=this.state;const L=this.lists(P);const E=this.engagers();const n=s.more.eng||20;
    const VO={'DM + reply':0,'Reply only':1};
    const todo=E.filter(e=>(e.Status||'To message')==='To message'&&verdictOf(e)!=='Skip').sort((a,b)=>((VO[verdictOf(a)]??2)-(VO[verdictOf(b)]??2))||((num(b.Followers)||0)-(num(a.Followers)||0)));
    const done=E.filter(e=>/^(Messaged|Replied)$/.test(e.Status||'')).reverse();
    const isTodo=s.engTab!=='done';const list=isTodo?todo:done;
    const card=e=>{const name=e.Name||e.Handle;const h=String(e.Handle||'').replace(/^@/,'');const said=String(e['What they said']||'').replace(/^(@\w+\s*)+/,'');
      const reply=e['Our reply']||'',dm=e['DM ready']||'';const v=verdictOf(e);const kr=e._key+'r',kd=e._key+'d';const busy=AK.S.busy.has(e._key);
      const cr=this.copyBtn(kr,'Copy reply'),cd=this.copyBtn(kd,'Copy DM');
      return{...avatar(name),name,sub:'@'+h+(num(e.Followers)!=null?' · '+fmtK(num(e.Followers))+' followers':''),why:e.Why||'',fit:pill(v==='DM + reply'?'Good fit':v==='Reply only'?'Worth a reply':v,v==='DM + reply'?'solid':'mid'),
        how:(()=>{const d=(AK.dayWord(AK.parseDate(e['Found on']))||e['Found on']||'').toLowerCase();const H=e.How||'Replied';
          return H==='Tagged'?'We tagged them in this post '+d:H==='Liked'?'They liked your post '+d:'They '+H.toLowerCase()+' '+d;})(),said:clip(said||(/^(Tagged|Liked)$/.test(e.How||'')?String(e['Our post']||''):''),280),hasSaid:!!(said||/^(Tagged|Liked)$/.test(e.How||'')&&e['Our post']),
        reply,hasReply:!!reply,dm,hasDm:!!dm&&v==='DM + reply',todo:isTodo,view:!isTodo,doneNote:'In the Pipeline'+(e['Messaged on']?' since '+e['Messaged on']:''),
        copyReply:()=>this.copy(reply,kr,'Reply for '+name.split(' ')[0]+' copied'),rLabel:cr.label,rbg:cr.bg,rfg:cr.fg,rsh:cr.sh,
        copyDm:()=>this.copy(dm,kd,'DM for '+name.split(' ')[0]+' copied'),dLabel:cd.label,dbg:cd.bg,dfg:cd.fg,dsh:cd.sh,
        openPost:()=>open(e['Their link']),openProfile:()=>window.open('https://x.com/'+h,'_blank','noopener'),openDm:()=>xDm(e['X user ID'],h,dm),dmBtn:e['X user ID']?'Open DM ↗':'Open their X ↗',
        doneLabel:busy?'Saving…':'Done, add to Pipeline',done:()=>{if(AK.canEdit()&&!busy)AK.engagerToPipeline(e);},skip:()=>this.dismissEngager(e,name)};};
    const pRow=(p,kind)=>({...avatar(p.name),name:p.name,sub:(p.role?p.role+' · ':'')+p.company,note:kind==='call'?(p.call?'Call '+p.call:'Call booked'):(p.result?clip(p.result,140):'Replied to your DM'),
      open:()=>this.openC(p.id),openX:()=>xDm(p.xid,p.handle,''),xLabel:p.xid?'Open DM':'Open X',cta:kind==='call'?'Prep the call':'Open and reply'});
    const tab=(id,label,c)=>{const on=(id==='done')!==isTodo;return{label,count:String(c),go:()=>this.setState({engTab:id}),bg:on?'var(--ink)':'rgba(255,255,255,.7)',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};};
    const lk={text:s.likersTxt||'',onText:e=>this.setState({likersTxt:e.target.value}),busy:AK.XJ.running['x-engage'],
      label:AK.XJ.running['x-engage']?'Reading them\u2026 about a minute':'Add and write replies and DMs',
      add:async()=>{const t=this.state.likersTxt||'';if(!t.trim()||AK.XJ.running['x-engage']||!AK.canEdit())return;const ok=await AK.addLikers(t);if(ok)this.setState({likersTxt:''});}};
    return{lk,isTodo,tabs:[tab('todo','To do',todo.length),tab('done','Done',done.length)],replies:L.rep.map(p=>pRow(p,'reply')),hasReplies:L.rep.length>0&&isTodo,calls:L.calls.map(p=>pRow(p,'call')),hasCalls:L.calls.length>0&&isTodo,
      cards:list.slice(0,n).map(card),hasCards:list.length>0,none:!list.length&&!(isTodo&&(L.rep.length||L.calls.length)),
      noneText:isTodo?'Nobody to answer right now. Replies, quotes and mentions on your X posts are checked every 6 hours.':'Nobody marked done yet.',
      hasMore:list.length>n,more:()=>this.setState(st=>({more:{...st.more,eng:n+20}})),moreN:String(Math.min(20,list.length-n))};}
  /* DM scripts (9 Nov): the A/B/C versions, edited here. Each new lead gets the next version in turn (x-leads), and the
     numbers come from DM Pipeline: sent = Sent on filled in, replies = Replied on filled in (drag them to Replied). */
  scriptsVals(P){const s=this.state;const T=AK.M.templates.filter(t=>/^[A-Z]\d+[A-Z]?$/.test(t.ID));
    const fu=(t,n)=>{const h=Object.keys(t).find(k=>k.indexOf('Follow-up '+n)===0);return h?t[h]||'':'';};
    const live=T.filter(t=>!/^off/i.test(t.Verdict||''));const tot=T.reduce((a,t)=>a+(num(t.Sent)||0),0),totR=T.reduce((a,t)=>a+(num(t.Replies)||0),0);
    const rated=live.filter(t=>(num(t.Sent)||0)>=10);const best=rated.length?rated.reduce((a,b)=>(num(b.Replies)||0)/(num(b.Sent)||1)>(num(a.Replies)||0)/(num(a.Sent)||1)?b:a).ID:'';
    const cards=T.map(t=>{const ed=s.tplEd[t.ID];const off=/^off/i.test(t.Verdict||'');const sent=num(t.Sent)||0,rep=num(t.Replies)||0,calls=num(t.Calls)||0;const r=sent?rep/sent:0;
      const vt=off?'Off':sent<10?'Needs 10+ sends to judge':r>=0.1?'Working':r<0.04?'Rewrite it':'Keep testing';const tone=off?'ghost':/working/i.test(vt)?'ok':/rewrite/i.test(vt)?'bad':/keep/i.test(vt)?'warn':'neutral';
      const ex=P.find(p=>p.tpl===t.ID&&p.stage==='To send');const busy=AK.S.busy.has('tpl:'+t.ID);
      const f=ed||{};const set=k=>e=>{const v=e.target.value;this.setState(st=>({tplEd:{...st.tplEd,[t.ID]:{...st.tplEd[t.ID],[k]:v}}}));};
      return{id:t.ID,intent:t.Intent||'',use:t['Use it for']||'',opener:t.Opener||'',fu1:fu(t,1)||'–',fu2:fu(t,2)||'–',sent:String(sent),rep:String(rep),calls:String(calls),rate:sent?Math.round(r*100)+'%':'–',
        verdict:pill(vt,tone),isBest:t.ID===best&&r>0,op:off?'.55':'1',words:String((t.Opener||'').split(/\s+/).filter(Boolean).length)+' words',
        hasEx:!!ex&&!ed,ex:ex?'For '+ex.first+' at '+ex.company+': '+ex.opener:'',
        editing:!!ed,view:!ed,busy,saveLabel:busy?'Saving…':'Save',
        f:{intent:f.intent??'',use:f.use??'',opener:f.opener??'',fu1:f.fu1??'',fu2:f.fu2??''},on:{intent:set('intent'),use:set('use'),opener:set('opener'),fu1:set('fu1'),fu2:set('fu2')},
        edit:()=>this.setState(st=>({tplEd:{...st.tplEd,[t.ID]:{intent:t.Intent||'',use:t['Use it for']||'',opener:t.Opener||'',fu1:fu(t,1),fu2:fu(t,2)}}})),
        cancel:()=>this.setState(st=>{const x={...st.tplEd};delete x[t.ID];return{tplEd:x};}),
        save:async()=>{if(!AK.canEdit()||busy)return;const ok=await AK.saveTpl(t,{intent:f.intent,use:f.use,opener:f.opener,fu1:f.fu1,fu2:f.fu2});if(ok)this.setState(st=>{const x={...st.tplEd};delete x[t.ID];return{tplEd:x};});},
        toggleLabel:off?'Turn on':'Turn off',toggle:()=>{if(AK.canEdit()&&!busy)AK.saveTpl(t,{verdict:off?'':'Off'});},
        copy:()=>this.copy(t.Opener||'','tplc'+t.ID,t.ID+' copied')};});
    const nf=s.tplNew;const letters=new Set(T.map(t=>t.ID[0]));const nextId=(()=>{for(const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){if(!letters.has(c))return c+'1';}return 'Z9';})();
    const setN=k=>e=>{const v=e.target.value;this.setState(st=>({tplNew:{...st.tplNew,[k]:v}}));};
    return{cards,none:!cards.length,summary:live.length+' versions in use. Every new lead gets the next one in turn, so each gets a fair share. '+(tot?tot+' sent so far, '+totR+' replies ('+Math.round(totR/tot*100)+'%).':'Nothing sent yet.'),
      help:'Write [first name], [company] and [hook] anywhere in a message. [hook] is a one-line opener the lead finder writes about that person\u2019s post. When someone answers, drag them to Replied in the Pipeline, and the reply rate here updates.',
      adding:!!nf,notAdding:!nf,startAdd:()=>this.setState({tplNew:{id:nextId,intent:'',use:'',opener:'Hey [first name], [hook] ',fu1:'',fu2:''}}),cancelAdd:()=>this.setState({tplNew:null}),
      n:nf||{},onN:{id:setN('id'),intent:setN('intent'),use:setN('use'),opener:setN('opener'),fu1:setN('fu1'),fu2:setN('fu2')},addLabel:AK.S.busy.has('tpl:new')?'Adding…':'Add this version',
      add:async()=>{if(!AK.canEdit()||!nf)return;if(!String(nf.opener||'').trim()){this.toast('Write the first message first.',null,true);return;}const ok=await AK.addTpl({...nf,account:Object.keys(AK.HANDLES)[0]||''});if(ok)this.setState({tplNew:null});}};}
  moreVals(P){const pg=this.state.page;const o={};if(pg==='pipeline'&&this.state.pipeTab==='Scripts')o.scr=this.scriptsVals(P);if(pg==='engaged')o.eng=this.engagedVals(P);if(PAGES[pg].sec==='leads'||pg==='gtmEngage'||pg==='liPipe'||LI_LISTS[pg])o.ld=this.leadVals(pg);o.lch=this.chanVals();if(pg==='xShared')o.xs=this.xSharedVals();if(pg==='liPeople')o.lip=this.liPeopleVals();
    if(pg==='send')o.send=this.sendVals(P);if(pg==='inbox')o.inbox=this.inboxVals(P);if(pg==='pipeline')o.pipe=this.pipeVals(P);
    Object.assign(o,this.midVals(pg));
    return o;}

  /* ---------- calendar ---------- */
  calVals(){const s=this.state;const off=s.week;const zone=s.calZone;const f=this.founder;const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],MON=AK.MON;
    const start=AK.weekStart(off);const t0=new Date();t0.setHours(0,0,0,0);
    const days=DOW.map((dw,i)=>{const dt=new Date(start.getTime()+i*AK.DAY);const today=AK.sameDay(dt,new Date());
      return{dow:dw,date:dt,key:dkey(dt.getFullYear(),dt.getMonth(),dt.getDate()),num:String(dt.getDate()),mon:MON[dt.getMonth()],rel:Math.round((dt-t0)/AK.DAY),today};});
    const keys=new Set(days.map(d=>d.key));const accs=this.accs();
    const plat=s.plat;const isLi=plat==='LinkedIn';
    const placed=this.postList().filter(p=>onCal(p)&&platOf(p.o)===plat).map(p=>({p,w:calWhere(p.o,zone)})).filter(x=>x.w&&keys.has(x.w.key)&&accs.some(a=>a.acc===x.p.account));
    const kind=isLi?'All':s.calKind;const shown=kind==='All'?placed:placed.filter(x=>x.p.kind===kind);
    const kinds=(isLi?[]:['All',...POST_KINDS]).map(k=>{const on=kind===k;const n=k==='All'?placed.length:placed.filter(x=>x.p.kind===k).length;
      return{label:k,count:String(n)+(!isLi&&SLOTS3.includes(k)?'/'+(accs.length*7):''),go:()=>this.setState({calKind:k}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink)',bd:on?'var(--ink)':'var(--hairline-strong)',dot:KIND_DOT[k]||'transparent',hasDot:k!=='All'};});
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
          canAdd:!f&&!isLi,add:()=>{const r=toIst(d.key,'',zone);AK.calNew(a.acc,r.date,'',plat);},pick:()=>this.setState({calPick:{acc:a.acc,key:d.key},calPickKind:'All'}),
          over:e=>{e.preventDefault();const k=a.acc+'|'+d.key;if(this.dragId&&this.state.calOver!==k)this.setState({calOver:k});},leave:e=>{if(e.currentTarget.contains(e.relatedTarget))return;if(this.state.calOver===a.acc+'|'+d.key)this.setState({calOver:null});},
          dropSh:s.calOver===a.acc+'|'+d.key?'inset 0 0 0 2px var(--in)':'none',drop:e=>{e.preventDefault();this.setState({calOver:null,calDragging:null});this.calDrop(a,d);}};});
      const ti=days.findIndex(d=>d.today);
      return{...a,...avatar(avName(a.name)),icon:isLi?'in':'𝕏',iconBg:isLi?'#0a66c2':'var(--ink)',chip:isLi?LI_NAME[a.acc]||a.name:a.handle,strip:days.map((d,i)=>({l:d.dow[0],full:d.dow+' '+d.num+' '+d.mon,go:()=>this.calScroll(a.acc,i),bg:has(a.acc,d.key)?'var(--ink)':'var(--n-soft-2)',fw:d.today?'700':'500',fg:d.today?'var(--ink)':'var(--ink-3)'})),line,hasLine:!!line,cols,
        sid:'cal-'+a.acc,pan:e=>this.calPan(e),left:()=>this.calScroll(a.acc,'l'),right:()=>this.calScroll(a.acc,'r'),today:()=>{if(ti<0)this.setState({week:0});this.calScroll(a.acc,Math.max(0,ti<0?(new Date().getDay()+6)%7:ti));}};});
    // Open each board on today's column (once per week shown); the page may still be drawing, so try for a moment.
    const sk=off+'|'+accs.map(a=>a.acc).join();if(this._calSk!==sk){this._calSk=sk;const ti=days.findIndex(d=>d.today);let n=0;
      const go=()=>{if(accs.every(a=>document.getElementById('cal-'+a.acc))){accs.forEach(a=>this.calScroll(a.acc,ti<0?0:ti,true));}else if(n++<40)setTimeout(go,100);};setTimeout(go,50);}
    return{label:days[0].num+' '+days[0].mon+' – '+days[6].num+' '+days[6].mon,weekName:off===0?'This week':off===-1?'Last week':off===1?'Next week':off<0?Math.abs(off)+' weeks ago':'In '+off+' weeks',
      prev:()=>this.setState({week:off-1}),next:()=>this.setState({week:off+1}),now:()=>this.setState({week:0}),nowBg:off===0?'#fff':'transparent',nowSh:off===0?'var(--shadow-sm), var(--hi)':'none',
      kinds,hasKinds:kinds.length>0,zones,boards,summary:placed.length+(placed.length===1?' post':' posts')+' this week'+(isLi?(AK.liState().err?' · '+AK.liState().err:AK.liState().loaded?' · from the LinkedIn sheet':' · loading the LinkedIn sheet…'):''),hasEmpty:empty>0&&!(isLi&&!AK.liState().loaded),empty:empty+(empty===1?' empty day':' empty days')+' left',pick:this.calPickVals()};}
  // Hold and drag the board's empty space to move left and right (cards, fields and buttons keep working as usual).
  calPan(e){if(e.button!==0||e.target.closest('input,textarea,select,button,label,a,img,[draggable="true"]'))return;
    const el=e.currentTarget,x0=e.clientX,l0=el.scrollLeft;el.style.cursor='grabbing';e.preventDefault();
    const move=ev=>{el.scrollLeft=l0-(ev.clientX-x0);};const up=()=>{el.style.cursor='grab';window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);}
  // Scroll a board: 'l' / 'r' by two days, or to day i (0 = Monday).
  calScroll(acc,where,instant){const el=document.getElementById('cal-'+acc);if(!el||!el.children.length)return;const w=el.children[0].getBoundingClientRect().width+12;const behavior='auto';
    if(where==='l'||where==='r')el.scrollBy({left:(where==='l'?-2:2)*w,behavior});else el.scrollTo({left:Math.max(0,where-1)*w,behavior});}
  calCard(p,w,a){const s=this.state;const f=this.founder||!!p.o._li;const o=p.o;const id=p.id;const ed=s.calEd[id]||{};
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
    return{id,st,pbg:pc[0],pfg:pc[1],ro:f,notLi:!o._li,canEdit:!f,txtRo:f||!!p.link,rows:p.link?'4':'7',notLive:!p.link,canUp:!f&&!p.link,
      time:ed.time!=null?ed.time:w.hm,zone:ZONES[s.calZone].label,setTime:e=>setEd('time',e.target.value),
      saveTime:()=>{const v=takeEd('time');if(v!=null&&v!==w.hm){const r=toIst(w.key,v,s.calZone);AK.calSave(o,{date:r.date,time:r.time});}},
      type:CAL_TYPES.includes(p.ptype)?p.ptype:'',setType:e=>AK.calSave(o,{type:e.target.value}),slot:p.slot,setSlot:e=>AK.calSave(o,{slot:e.target.value}),
      aimed:CAL_AIMED.includes(o['Aimed at'])?o['Aimed at']:'',setAimed:e=>AK.calSave(o,{aimed:e.target.value}),
      name:li?LI_NAME[a.acc]||a.name:a.name,handle:li?'LinkedIn':a.handle,...avatar(avName(a.name)),
      collapsed:!open,expanded:open,short:clip(txt.replace(/\s+/g,' '),100),more:()=>setOpen(true),canLess:long&&open,less:()=>setOpen(false),
      text:txt,setText:e=>setEd('text',e.target.value),saveText:()=>{const v=takeEd('text');if(v!=null&&v!==p.text)AK.calSave(o,{text:v});},
      media,hasMedia:media.length>0,
      status:st,stOpts:[...new Set([st,...CAL_ST])].map(v=>({v})),setStatus:e=>{const v=e.target.value;if(v==='Posted'&&!p.link){this.setState({calLink:id,calLinkVal:''});return;}AK.calSave(o,{status:v});},
      canSched:!li&&st!=='Posted',isSched:st==='Scheduled',schedBg:st==='Scheduled'?'var(--in-soft)':'#fff',schedFg:st==='Scheduled'?'var(--in-ink)':'var(--ink-2)',schedSh:st==='Scheduled'?'inset 0 0 0 1px var(--in-line)':'inset 0 0 0 1px var(--hairline-strong)',
      schedLabel:st==='Scheduled'?'Scheduled ✓':'Scheduled',toggleSched:()=>{if(!f)AK.calSave(o,{status:st==='Scheduled'?'Draft':'Scheduled'});},
      copy:()=>this.copy(txt,'cal'+id,'Post copied'),copyLabel:cb.label,
      upload:e=>{const fl=e.target.files&&e.target.files[0];e.target.value='';if(fl)AK.calUpload(o,fl);},upLabel:up?'Uploading…':'Add image',
      remove:()=>this.calRemove(p),
      dragStart:e=>{const t=e.target&&e.target.closest&&e.target.closest('input,textarea,select,button');if(t){e.preventDefault();return;}this.dragId=id;try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);}catch(_){}this.setState({calDragging:id});},
      dragEnd:()=>{this.dragId=null;if(this.state.calDragging||this.state.calOver)this.setState({calDragging:null,calOver:null});},drag:f?'false':'true',cur:f?'default':'grab',op:s.calDragging===id?'.45':'1',
      dragTip:f?'':'Drag the card to another day',
      ...this.tickVals(p,st),
      hasLink:!!p.link,linkLabel:li?'Live on LinkedIn'+(num(o.Likes)?' · '+fmtK(num(o.Likes))+' reactions':'')+(num(o.Replies)?' · '+fmtK(num(o.Replies))+' comments':''):'Live on X'+(p.ourViews?' · '+p.ourViews+' views':''),openLink:()=>window.open(p.link,'_blank','noopener'),
      canLink:!p.link&&!f,toggleLink:()=>this.setState({calLink:linkOpen?null:id,calLinkVal:''}),linkOpen,linkVal:s.calLinkVal,
      setLinkVal:e=>this.setState({calLinkVal:e.target.value}),saveLink:()=>this.calLinkPaste(p,s.calLinkVal),
      linkPh:'Paste the post link (x.com/'+(AK.HANDLES[p.account]||'…')+'/status/…)',live,hasLive:live.length>0,
      hasSug:!!p.sug&&!p.link&&!media.length,sugThumb:p.sug?p.sug.thumb:'',sugVideo:!!(p.sug&&p.sug.video),
      useSug:()=>{const cur=String(o['Media file']||'').trim();if(p.sug)AK.calSave(o,{media:(cur?cur+'\n':'')+p.sug.url});},sugName:p.sug?clip(p.sug.name,34):'',sugWhy:p.sug?p.sug.why:'',openSug:()=>p.sug&&window.open(p.sug.url,'_blank','noopener')};}
  // The ✓ on a calendar card (7 Nov). X: Posted at once, no link needed (paste it later, or the tracker finds it); tap again to undo.
  // LinkedIn posts come from the queue sheet, which the CRM only reads: the mark is kept in Supabase (li_marks, by the post's text).
  tickVals(p,st){const o=p.o;const on=st==='Posted';const li=!!o._li;
    if(this.founder||(!li&&p.link))return{canTick:!this.founder&&on,tick:()=>{},tickTitle:'Posted',tickBg:'var(--ok)',tickFg:'#fff',tickSh:'none'};
    const tick=()=>{if(li){const k=liMarkKey(o['Our version']);const m={...(AK.leadSetting('li_marks')||{})};if(on&&o._autoPosted){this.toast('This one is live on LinkedIn, so it stays Posted.',null,true);return;}
        if(on)delete m[k];else m[k]='Posted';AK.leadSettingSave('li_marks',m);this.toast(on?'Marked not posted.':'Marked posted.');return;}
      const prev=o.Status&&o.Status!=='Posted'?o.Status:'Ready to post';
      if(on){AK.calSave(o,{status:prev==='Posted'?'Ready to post':prev});this.toast('Marked not posted.');return;}
      AK.calSave(o,{status:'Posted'});this.toast('Marked posted. Paste the link any time to track its numbers.',()=>AK.calSave(o,{status:prev}));};
    return{canTick:true,tick,tickTitle:on?'Posted (tap to undo)':'Mark as posted',tickBg:on?'var(--ok)':'#fff',tickFg:on?'#fff':'var(--ink-4)',tickSh:on?'none':'inset 0 0 0 1.5px var(--hairline-strong)'};}
  // A card made on the calendar that is still empty is removed for good; any other post just leaves the calendar.
  calRemove(p){const blank=p.o['What we changed']==='Added in the calendar'&&!p.text.trim()&&!p.link;const was=p.o.Status||'Draft';const wasCal=p.o.Calendar||'';
    AK.calSave(p.o,blank?{cal:'',status:'Deleted'}:{cal:'No'}).then(ok=>{if(ok)this.toast(blank?'Removed':'Taken off the calendar. It’s still in Our posts.',()=>AK.calSave(p.o,blank?{cal:'Yes',status:was}:{cal:wasCal}));});}
  calDrop(a,d){if(this.founder||this.state.plat==='LinkedIn')return;const id=this.dragId;this.dragId=null;const p=id&&this.postList().find(x=>x.id===id);if(!p)return;
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
    let C=this.postList().filter(p=>p.account===acc&&!p.link&&!onCal(p)&&platOf(p.o)===s.plat);
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
    // The X / LinkedIn switch at the top replaced this page's platform filter (3 Nov).
    const plats=[];const P=s.postType==='All'?all:all.filter(p=>p.kind===s.postType);
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
  trkVals(){if(this.state.plat==='LinkedIn')return this.liTrkVals();const s=this.state;const E=s.entered;const accs=this.accs();const ids=accs.map(a=>a.acc);
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
    const top=live.filter(t=>t.rate!=null&&(t.views||0)>=30).sort((a,b)=>b.rate-a.rate).slice(0,3).map((t,i)=>{const acc=ownerName(t.account);return{n:String(i+1).padStart(2,'0'),text:clip(firstLine(t.text)||'Post on X',140),acc,...avatar(avName(acc)),views:fmtK(t.views)+' views',eng:String(t.eng),why:AK.whyFor(t,all).slice(0,4)};});
    const pat=AK.patterns(live).map(p=>({label:p.label,v:p.label==='Best account'?ownerName(p.k):p.k,sub:p.sub}));
    const sorted=live.slice().sort((a,b)=>(b.first||0)-(a.first||0));const lim=s.trkMore?sorted.length:8;
    const sp=h=>{const v=h.map(r=>num(r.Views)||0);if(v.length<2)return '0,22 80,22';const mx=Math.max(1,...v);return v.map((y,k)=>(k*80/(v.length-1)).toFixed(1)+','+(22-y/mx*20).toFixed(1)).join(' ');};
    const rows=sorted.slice(0,lim).map((t,i)=>({text:clip(firstLine(t.text)||'Post on X',110),acc:ownerName(t.account),when:t.first?AK.dayWord(new Date(t.first))+' '+hhmm(t.first):'–',views:fmtK(t.views),eng:String(t.eng==null?'–':t.eng),rate:t.rate!=null?String(r1(t.rate)):'–',spark:sp(t.hist),deltaLabel:t.grew!=null?(t.grew>=0?'+':'')+fmtK(t.grew)+' since last check':t.pending?'Waiting for the first check':'First check',bt:i===0?'none':'1px solid var(--hairline)'}));
    return{L:TRK_X,hasFol:true,kpis:kpis.map(k=>({...k,hasTip:!!k.tipKey,tip:k.tipKey?this.tipFor(k.tipKey):{}})),week,days:['Mon','Tue','Wed','Thu','Fri'],
      hasChart,noChart:!hasChart,total:fmtK(last),totalD,
      chart:{line:ch.line,area:ch.area,dash:E?'0':'1400',dots:hasChart?ch.dots.map((d,i)=>({...d,label:lab(times[i])+': '+fmtK(series[i])+' views in total',r:i===series.length-1?'5':'3.5'})):[],l0:hasChart?lab(times[0]):'',l1:hasChart&&times.length>2?lab(times[Math.floor((times.length-1)/2)]):'',l2:hasChart?lab(times[times.length-1]):''},
      fol,top,hasTop:top.length>0,noTop:!top.length,pat,hasPat:pat.length>0,noPat:!pat.length,rows,hasRows:rows.length>0,hasMore:!s.trkMore&&sorted.length>8,more:()=>this.setState({trkMore:true}),count:'Showing '+rows.length+' of '+sorted.length};}

  /* ---------- Leads (6 Nov) ----------
     Everyone we're talking to, from any channel: AK.LD (Supabase tables crm_leads, crm_lead_events, crm_lead_settings).
     Stages, sources, groups, categories and custom fields all come from the Setup page. */
  leadsAll(){const s=this.state;const o=s.owner;const ch=s.plat==='LinkedIn'?'LinkedIn':s.plat==='Leads'?s.lch:'';
    return AK.LD.rows.filter(l=>!l.archived&&(o==='Everyone'||!l.owner||l.owner===o)&&(!ch||l.source===ch));}
  chanVals(){const s=this.state;const all=AK.LD.rows.filter(l=>!l.archived);
    const b=(id,label,n)=>{const on=(s.lch||'')===id;return{label,count:String(n),go:()=>{store.set('lch',id);this.setState({lch:id,lf:{...this.state.lf,source:'',acct:''},ldMore:{},lmore:false});},bg:on?'var(--ink)':'rgba(255,255,255,.85)',fg:on?'#fff':'var(--ink)',bd:on?'var(--ink)':'var(--hairline-strong)'};};
    const on=s.plat==='Leads'&&!['leadAdd','leadSetup'].includes(s.page);const cur=s.lch||'';
    return{on,items:[b('','All channels',all.length),...CHANNELS.map(c=>b(c,this.srcIcon(c)+' '+c,all.filter(l=>l.source===c).length))],
      note:cur==='Email'&&!all.some(l=>l.source==='Email')?'No email leads yet. When the cold email outreach runs, people who reply land here.':cur==='X'&&!all.some(l=>l.source==='X')?'X people land here once they reply to a DM (marked Replied in the X Pipeline). The DMs themselves live under X.':'',
      get hasNote(){return !!this.note;}};}
  leadSet(k){return AK.leadSetting(k)||[];}
  stageOf(name){return this.leadSet('stages').find(x=>x.name===name)||{name,color:'var(--ink-4)',kind:'open'};}
  tagOf(kind,name){const t=this.leadSet(kind).find(x=>(x.name||x)===name);return t&&t.color?t.color:'var(--ink-3)';}
  leadFiltered(){const f=this.state.lf;const q=f.q.trim().toLowerCase();
    return this.leadsAll().filter(l=>(!q||[l.name,l.company,l.role,l.email,l.x_handle,l.linkedin,l.instagram,l.pitch,l.notes,l.group_name,(l.categories||[]).join(' ')].join(' ').toLowerCase().includes(q))
      &&(!f.source||l.source===f.source)&&(!f.acct||l.source==='Instagram'&&this.igAcct(l).toLowerCase()===f.acct)&&(!f.heat||this.heatOf(l)===f.heat)&&(!f.group||l.group_name===f.group)&&(!f.cat||(l.categories||[]).includes(f.cat))&&(!f.dir||l.direction===f.dir)&&(!f.rel||(this.gtmOne(l.id)||{c:{}}).c.rel===f.rel));}
  // Saves edits still in the panel's buffer (closing it skips the inputs' blur), then clears the buffer.
  flushLead(){const s=this.state;const id=s.lid;if(!id||id==='new')return;const l=AK.LD.rows.find(r=>r.id===id);if(!l)return;
    const patch={};let fields=null;
    for(const [k,v] of Object.entries(s.led)){if(k.startsWith('__'))continue;
      if(k.startsWith('f:')){const fk=k.slice(2);if(String(v)!==String((l.fields||{})[fk]??'')){fields=fields||{...(l.fields||{})};fields[fk]=v;}}
      else if(String(v)!==String(l[k]??''))patch[k]=v;}
    if(fields)patch.fields=fields;if(Object.keys(patch).length)AK.leadSave(id,patch);
    // Intel edits still in the buffer (closing the panel skips their blur): save each one that changed.
    const ik=[...new Set(Object.keys(s.led).filter(k=>k.startsWith('__gi:')).map(k=>k.split(':')[1]))];for(const k of ik)this.gtmSaveIntel(l,k);}
  closeLead(extra){this.flushLead();this.setState({lid:null,led:{},lnew:null,...(extra||{})});}
  openLead(id,tab){this.flushLead();const l=AK.LD.rows.find(r=>r.id===id);const t=tab||(l&&(l.source==='Instagram'||String(l.origin_key||'').startsWith('ig:'))?'details':'intel');
    this.setState({lid:id,led:{},lnew:null,lnote:'',lkind:'note',ltab:t});}
  newLead(seed){this.flushLead();this.setState({lid:'new',led:{},ltab:'details',lnewForce:false,lnew:{name:'',company:'',direction:'Inbound',source:'',stage:(this.leadSet('stages')[0]||{}).name||'New',currency:AK.leadSetting('currency')||'USD',owner:this.state.owner!=='Everyone'?this.state.owner:(Object.keys(AK.HANDLES)[0]||''),...(seed||{})}});}
  async createLead(){const d=this.state.lnew;if(!d||this._creating)return;if(!String(d.name||d.company||'').trim()){this.toast('Give the lead a name or a company first.',null,true);return;}
    if(d.linkedin&&!GTM.normLi(d.linkedin)&&/linkedin/i.test(d.linkedin)){this.toast('That LinkedIn link doesn’t look like a profile (linkedin.com/in/…).',null,true);return;}
    if(d.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email).trim())){this.toast('That email doesn’t look right.',null,true);return;}
    const dup=AK.gtm.find(d);if(dup&&!this._force){this.toast('Already in Leads: '+(dup.name||dup.company)+'. Open it from the note at the top, or press Save anyway.',null,true);return;}
    this._creating=true;try{const row=await AK.leadCreate(d);if(row&&this.state.lid==='new')this.setState({lid:row.id,lnew:null,led:{}});}finally{this._creating=false;}}
  // Pretty money: "$4,000"; falls back to "4000 XYZ" for a currency code Intl doesn't know.
  money(v,cur){if(v==null||v==='')return '';const n=Number(v);if(!isFinite(n))return '';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:cur||'USD',maximumFractionDigits:0}).format(n);}catch(e){return n.toLocaleString()+' '+(cur||'');}}
  since(t){if(!t)return '';const d=new Date(t);const days=Math.floor((new Date().setHours(0,0,0,0)-new Date(d).setHours(0,0,0,0))/AK.DAY);
    return days<=0?'today '+hhmm(d):days===1?'yesterday':days<7?days+' days ago':dLabel(d);}
  leadNext(l){if(!l.next_date&&!l.next_step)return null;const t0=new Date();t0.setHours(0,0,0,0);const d=l.next_date?new Date(l.next_date+'T00:00:00'):null;
    const late=d&&d<t0,today=d&&AK.sameDay(d,t0);const when=d?(today?'today':late?'overdue, '+dLabel(d):dLabel(d)):'';
    return{label:(l.next_step||'Next step')+(when?' · '+when:''),when:when||'no date',tone:late?'bad':today?'warn':'neutral',late,today};}
  // Instagram leads (7 Nov): hot up to 3 days after the last message, warm up to 7, cold after that. Others keep what was set.
  heatOf(l){const t=l.fields&&l.fields.ig_last_at;if(!t||l.origin_key&&!String(l.origin_key).startsWith('ig:')&&l.source!=='Instagram')return l.heat||'';
    const d=(Date.now()-Number(t))/AK.DAY;return d<=3?'Hot':d<=7?'Warm':'Cold';}
  // The next step in a word or two, for cards: "Reply", "Follow up", "Waiting for reply"…
  nextShort(l){const s=String(l.next_step||'').trim();return /^reply/i.test(s)?'Reply':/^follow/i.test(s)?'Follow up':/^waiting/i.test(s)?'Waiting for reply':s?clip(s,26):'Next step';}
  igAcct(l){const m=String(l.source_detail||'').match(/@([\w.]+)/);return m?'@'+m[1]:'';}
  // What the ✦ on a card shows: the AI read of the chat when there is one, else what we can piece together from the history.
  leadTip(l){const f=l.fields||{};const ev=AK.LD.events.filter(e=>e.lead_id===l.id&&e.kind==='message').sort((a,b)=>new Date(a.at)-new Date(b.at));
    const them=ev.filter(e=>String(e.by_email||'').endsWith('@ig-contact'));const asked=them.map(e=>String(e.text).replace(/^@[\w.]+:\s*/,'')).find(t=>t.length>12);
    const last=ev[ev.length-1];const lastWho=last?(String(last.by_email||'').endsWith('@ig-contact')?'They':'You'):'';
    const summary=f.ig_summary||(asked?'They said: “'+clip(asked,160)+'”':clip(String(l.notes||'').replace(/\s+/g,' '),220));
    const nx=this.leadNext(l);const lines=[];
    if(nx)lines.push(['Next',this.nextShort(l)+' · '+nx.when]);
    if(f.ig_ai_next)lines.push(['AI suggests',f.ig_ai_next]);
    if(last)lines.push(['Last message',lastWho+', '+this.since(last.at)+': “'+clip(String(last.text).replace(/^@[\w.]+:\s*/,''),70)+'”']);
    if(f.ig_followers!=null)lines.push(['Followers',Number(f.ig_followers).toLocaleString('en-US')]);
    // GTM intelligence (8 Nov): the bubble is a compact intelligence card. Unknown where nothing is known; sources are on the Intel tab.
    const x=this.gtmOne(l.id);const isIg=l.source==='Instagram'||String(l.origin_key||'').startsWith('ig:');let chips=[],intel=[],sum2='';
    if(x){const {c}=x;const E=x.ev;const U='–';const v=k=>E[k]?(k==='amount'||k==='total'?GTM.fmtMoney(GTM.parseMoney(E[k].v)):String(E[k].v))+(E[k].kind==='inference'?' (inferred)':''):'';
      chips=[this.gtmScoreP(c.score),this.gtmLevelP(c.radar),this.gtmRelP(c)];
      const row=(k2,val)=>({k:k2,v:val||U,fg:val?'var(--ink-2)':'var(--ink-4)'});
      intel=[row('Funding',[v('round'),v('amount'),E.date?'('+String(E.date.v).slice(0,7)+')':''].filter(Boolean).join(' ')),row('Company',[x.emp!=null?x.emp+' people':'',v('industry'),v('hq'),v('accelerator')].filter(Boolean).join(' · ')),
        row('Person',[v('title'),E.founder&&E.founder.v==='Yes'?'founder':''].filter(Boolean).join(', ')),row('GTM',[E.hom?'Head of Marketing: '+E.hom.v:'',E.sdr?'SDRs: '+E.sdr.v:'',E.hiring?'hiring: '+clip(E.hiring.v,30):'',E.li_freq?E.li_freq.v+' posts/mo':''].filter(Boolean).join(' · ')),
        row('Status',c.status+' · '+c.acq),row('Why now',c.radar.why.slice(0,2).map(w=>w.text+(w.kind==='fact'?'':' (inference)')).join('; ')),row('Angle',c.radar.angle.label)];
      if(!isIg)sum2=E.description?String(E.description.v)+(E.description.kind==='inference'?' (inferred)':''):'';}
    const all=isIg?[...lines.map(([k,v])=>({k,v,fg:'var(--ink-2)'})),...intel.slice(4,5)]:[...intel,...lines.filter(z=>z[0]==='Next').map(([k,v])=>({k,v,fg:'var(--ink-2)'}))];
    const sm=isIg?summary:(sum2||clip(String(l.notes||'').replace(/\s+/g,' '),200));
    return{summary:sm,ai:!!f.ig_summary,label:isIg?(f.ig_summary?'✦ AI summary':'From the chat'):'✦ Intelligence',chips,lines:all,has:true};}
  srcIcon(src){return {X:'𝕏',LinkedIn:'in',Instagram:'◎',Email:'✉',Referral:'↪',Website:'⌂'}[src]||'•';}
  tagPill(label,color){return{label,dot:color,bg:'color-mix(in oklch, '+color+' 12%, white)',fg:'color-mix(in oklch, '+color+' 70%, black)'};}
  leadCard(l){const st=this.stageOf(l.stage);const nx=this.leadNext(l);const a=avatar(l.name||l.company||'?');
    return{...a,id:l.id,name:l.name||'(no name)',company:[l.role,l.company].filter(Boolean).join(' · ')||l.email||l.x_handle||'',src:(l.source?this.srcIcon(l.source)+' '+l.source:'No source')+' · '+(l.direction||''),
      value:this.money(l.price,l.currency),hasValue:l.price!=null&&l.price!=='',next:nx?pill(this.nextShort(l)+(nx.when!=='no date'?' · '+nx.when:''),nx.tone):null,hasNext:!!nx,
      isIg:l.source==='Instagram',notIg:l.source!=='Instagram',igLine:this.igAcct(l)?'via '+this.igAcct(l):'Instagram',stage:this.tagPill(l.stage,st.color),
      group:l.group_name?this.tagPill(l.group_name,this.tagOf('groups',l.group_name)):null,hasGroup:!!l.group_name,
      heat:this.heatOf(l)?this.tagPill(HEAT_L[this.heatOf(l)],HEAT_C[this.heatOf(l)]):null,hasHeat:!!this.heatOf(l),
      ...(()=>{const x=this.gtmOne(l.id);return x?{icpP:this.gtmScoreP(x.c.score),hasIcp:true,relP:this.gtmRelP(x.c),hasRel:x.c.rel==='midbound'}:{hasIcp:false,hasRel:false};})(),
      cats:(l.categories||[]).slice(0,3).map(c=>this.tagPill(c,this.tagOf('categories',c))),when:l.last_touch?'Touched '+this.since(l.last_touch):'Added '+this.since(l.created_at),
      open:()=>this.openLead(l.id),...this.leadCardActs(l)};}
  // The bin moves a lead to Lost (in Lost, it archives it), with undo; the ✦ shows what's going on with them.
  leadCardActs(l){const ST=this.leadSet('stages');const lostSt=ST.find(x=>x.kind==='lost');const inLost=this.stageOf(l.stage).kind==='lost';const who=l.name||l.company||'the lead';
    const tip=this.leadTip(l);
    const place=(e)=>{const r=e.currentTarget.getBoundingClientRect();const w=340;const below=r.bottom+330<window.innerHeight;
      this.setState({ldTip:{id:l.id,x:Math.max(8,Math.min(r.right-w,window.innerWidth-w-8)),y:below?r.bottom+6:r.top-6,up:!below}});};
    // Instagram: straight to the DM thread (ig.me opens it in whichever account you're signed in to in that browser).
    const igH=String(l.instagram||'').trim().replace(/^@/,'').replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[/?#].*$/,'');
    const liUrl=String(l.linkedin||'').trim();const liId=(liUrl.match(/\/in\/(ACoA[\w-]+)/i)||[])[1];
    const liChat=liId?'https://www.linkedin.com/messaging/compose/?recipient='+liId:liUrl;
    const LI=(l.fields||{}).li||{};const dd=x=>x?this.since(x):'';const conn=!!LI.acc||/linkedin connection/i.test(l.source_detail||'');
    const liStatus=LI.dm?'DMed '+dd(LI.dm):LI.inmail?'InMail sent '+dd(LI.inmail):conn?'Connected'+(LI.acc?' '+dd(LI.acc):''):LI.req?'Request sent'+(LI.note?' with a note ':' ')+dd(LI.req):'Not contacted on LinkedIn yet';
    const step=(k,label)=>({label,go:stop(()=>{this.setState({ldTip:null});AK.liStep(l.id,k).then(ok=>ok&&this.toast(label+': saved for '+(l.name||'them')+'.'));})});
    const liBtns=LI.dm||LI.inmail?[]:conn?[step('dm','DMed')]:LI.req?[step('acc','Accepted'),step('inmail','InMail')]:[step('req','Request sent'),step('reqNote','Request + note'),step('inmail','InMail')];
    return{hasDossier:isGtmCall(l),openDossier:stop(()=>{this.setState({ldTip:null});this.openDossier(l.id);}),liStatus,liBtns,hasLiBtns:l.source==='LinkedIn'&&liBtns.length>0,isLi:l.source==='LinkedIn',hasLiChat:!!liChat&&l.source==='LinkedIn',liChatTitle:liId?'Open your LinkedIn chat with '+(l.name||'them'):'Open their LinkedIn profile, then press Message',
      liChat:stop(()=>{this.setState({ldTip:null});window.open(liChat,'_blank','noopener');}),hasDm:!!igH,dmTitle:'Open your DMs with @'+igH+(this.igAcct(l)?' (signed in as '+this.igAcct(l)+')':''),
      dm:stop(()=>{this.setState({ldTip:null});window.open('https://ig.me/m/'+encodeURIComponent(igH),'_blank','noopener');}),
      hasTip:tip.has,tipShow:e=>place(e),tipHide:()=>{if(this.state.ldTip&&this.state.ldTip.id===l.id)this.setState({ldTip:null});},
      tipClick:stop(e=>{if(this.state.ldTip&&this.state.ldTip.id===l.id)this.setState({ldTip:null});else place(e);}),
      binTitle:inLost?'Archive (take off the board)':'Move to '+(lostSt?lostSt.name:'Lost'),
      bin:stop(()=>{this.setState({ldTip:null});if(inLost||!lostSt){AK.leadArchive(l.id,true);this.toast('Archived '+who+'.',()=>AK.leadArchive(l.id,false));return;}
        const prev=l.stage;AK.leadSave(l.id,{stage:lostSt.name});this.toast('Moved '+who+' to '+lostSt.name+'.',()=>AK.leadSave(l.id,{stage:prev}));}),
      // The ↻ pushes a lead into "Follow up" (any stage named like that), with undo. Hidden once they're there, or closed.
      ...(()=>{const fu=ST.find(x=>/^follow/i.test(x.name));const can=!!fu&&l.stage!==fu.name&&this.stageOf(l.stage).kind==='open';
        return{canFu:can,fuTitle:fu?'Move to '+fu.name:'',fu:stop(()=>{if(!can)return;this.setState({ldTip:null});const prev=l.stage;AK.leadSave(l.id,{stage:fu.name});
          this.toast('Moved '+who+' to '+fu.name+'.',()=>AK.leadSave(l.id,{stage:prev}));})};})()};}
  // The board fills the page from its filter row down: opening Pipeline scrolls the title away (scroll up to see it), the board
  // reaches 16px above the bottom with its scrollbar, and the page's own bottom padding is cancelled so nothing hangs below it.
  measureBoard(){const b=document.getElementById('lead-board');if(!b)return;let m=b.parentElement;
    while(m&&m!==document.body){const o=getComputedStyle(m).overflowY;if(o==='auto'||o==='scroll')break;m=m.parentElement;}
    if(!m||m===document.body)m=document.scrollingElement||document.documentElement;
    const root=m===document.scrollingElement||m===document.documentElement,vis=root?window.innerHeight:m.clientHeight;
    const off=el=>{let y=0;for(let e=el;e;e=e.offsetParent)y+=e.offsetTop;return y;};   // layout position: ignores scrolling and the entrance animation
    const at=el=>off(el)-(root?0:off(m)+m.clientTop);   // where an element sits in the scrolled page
    const later=()=>{clearTimeout(this._ldLate);this._ldLate=setTimeout(()=>this.measureBoard(),900);};   // once more after the page has settled
    const bar=b.previousElementSibling;const S=Math.max(0,Math.round((bar?at(bar):at(b))-8));
    const h=Math.max(280,Math.round(vis-(at(b)-S)-16));
    const extra=Math.round(m.scrollHeight-(S+vis));const mb=Math.min(0,(this.state.ldMb||0)-extra);
    const ch={};if(Math.abs((this.state.ldH||0)-h)>2)ch.ldH=h;if(Math.abs((this.state.ldMb||0)-mb)>2&&Math.abs((this.state.ldH||0)-h)<=2)ch.ldMb=mb;
    if(Object.keys(ch).length){this.setState(ch);later();}
    // On opening Pipeline, bring the filter row to the top; keep at it while the page settles (1.6 s), then leave scrolling to you.
    if(!this._ldAuto)this._ldAuto=Date.now()+1600;
    if(Date.now()<this._ldAuto&&Math.abs(m.scrollTop-S)>4){m.scrollTo({top:S});later();}}
  // The hover card for the ✦, drawn once over the whole board.
  leadTipBox(){const t=this.state.ldTip;const l=t&&AK.LD.rows.find(r=>r.id===t.id);if(!l)return{on:false};const tip=this.leadTip(l);
    return{on:true,left:t.x+'px',top:t.y+'px',tf:t.up?'translateY(-100%)':'none',name:l.name||l.instagram||'(no name)',acct:this.igAcct(l),hasAcct:!!this.igAcct(l),
      summary:tip.summary,hasSummary:!!tip.summary,label:tip.label,chips:tip.chips,hasChips:tip.chips.length>0,lines:tip.lines,more:'Open the lead for sources and the full card'};}
  leadHdr(page,h){const L=this.leadsAll();const open=L.filter(l=>this.stageOf(l.stage).kind==='open');const due=open.filter(l=>{const n=this.leadNext(l);return n&&(n.late||n.today);});
    h={...h,eyebrow:'Leads · '+PAGES[page].label,title:PAGES[page].label==='Overview'?'Leads':PAGES[page].label,cta:'New lead',go:()=>this.newLead()};
    const st=AK.leadsState();
    if(!st.loaded)h.next=st.err?'Couldn’t load leads: '+st.err:'Loading leads…';
    else if(page==='leads'&&open.some(l=>this.heatOf(l)==='Hot'&&!l.last_touch)){const f=open.filter(l=>this.heatOf(l)==='Hot'&&!l.last_touch).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      h.next=f.length+(f.length===1?' new hot lead':' new hot leads')+' from your posts, not contacted yet. Newest: '+(f[0].name||f[0].company)+(f[0].role||f[0].company?' ('+[f[0].role,f[0].company].filter(Boolean).join(', ')+')':'')+'.';}
    else if(page==='leads')h.next=due.length?due.length+(due.length===1?' lead needs':' leads need')+' you today, starting with '+(due[0].name||due[0].company)+': '+(due[0].next_step||'next step')+'.':L.length?open.length+' open '+(open.length===1?'lead':'leads')+', nothing due today.':'No leads yet. Add one, or bring people in from X and LinkedIn.';
    else if(page==='leadBoard')h.next='Drag a card to another stage, drag the background to scroll. Hover ✦ for a quick read. '+open.length+' open, worth '+this.moneySum(open)+'.';
    else if(page==='leadList')h.next=L.length+(L.length===1?' lead':' leads')+'. Click a column to sort, and a row to open it.';
    else if(page==='leadAdd'){const n=this.candidates().filter(c=>!c.added).length;h.next=n?n+' people from X and LinkedIn you haven’t added yet.':'Everyone from X and LinkedIn is already in.';}
    else if(page==='leadSetup')h.next='Your ICP, stages, sources, groups, categories and extra fields. Changes apply to every lead.';
    else if(page==='gtmNow'){const A=this.gtmAll().filter(x=>!x.c.closed);const hi=A.filter(x=>x.c.radar.level==='HIGH');h.next=hi.length?hi.length+(hi.length===1?' lead has':' leads have')+' a fresh reason to reach out this week. Start with '+(hi.sort((a,b)=>b.c.radar.score-a.c.radar.score)[0].l.name||'the top one')+'.':'Ranked by the Buying Window Radar: recent raise, GTM hiring, launches, founder posts and team gaps. Verified facts are kept apart from inferences.';}
    else if(page==='gtmViews'){const A=this.gtmAll();const n=A.filter(x=>x.c.score.icp&&!x.c.closed).length;const u=A.filter(x=>x.c.score.band==='unverified'&&!x.c.closed).length;h.next=n+' open '+(n===1?'lead fits':'leads fit')+' the ICP on evidence'+(u?'; '+u+' more need research to be scored':'')+'. Nothing here sends messages: copy, send yourself, then log it.';}
    else if(page==='leadBrief'){const b=(AK.BR.rows||[])[0];h.next=!AK.BR.loaded?'Loading the brief…':!b?'No brief yet. It writes itself at 8:00 IST, or press Write it now.':'Today: '+((b.data.overall||[])[4]?b.data.overall[4].v:0)+' people to follow up with. Written '+this.since(b.made_at)+'.';}
    else if(page==='leadDossier'){const D=this.leadsAll().filter(isGtmCall);const w=D.filter(l=>!((l.fields||{}).brief||{}).at).length;h.next=D.length?D.length+(D.length===1?' GTM call':' GTM calls')+' booked'+(w?', '+w+' dossier'+(w===1?'':'s')+' being written.':'. Every dossier is ready.'):'No GTM calls booked yet.';}
    else if(page==='liPipe'){const w=AK.LBT.rows.filter(t=>t.status==='review').length;h.next=w?w+(w===1?' message is':' messages are')+' waiting for your OK. Approve them on the cards below.':'Nothing waiting for your OK. New people who engage with our posts show up in Leads found.';}
    else if(LI_LISTS[page]){const n=this.gtmAll().filter(x=>LI_LISTS[page].some(id=>GV.find(v=>v.id===id).f(x))).length;h.next=page==='liOut'?n+' LinkedIn people to reach out to or follow up with. Stay inside LinkedIn’s daily limits below.':page==='liInbox'?(n?n+(n===1?' person':' people')+' came to us first. Answer them today.':'Nobody has messaged us first yet. When someone does, add them here as Inbound.'):(n?n+(n===1?' person':' people')+' engaged back after we reached out.':'Nobody has replied to our outreach yet.');}
    else if(page==='gtmDash')h.next='Outreach, replies and conversion, by source, ICP band, template, angle and stage.';
    else if(page==='gtmEngage'){const cfg=AK.gtm.engageCfg();const n=AK.gtm.commentsToday();const rv=this.gtmAll().reduce((a,x)=>a+GTM.contentOf(x.l).filter(c=>c.status==='new').length,0);h.next=n+' of '+cfg.cap+' comments posted today. '+(rv?rv+(rv===1?' draft waits':' drafts wait')+' for your review: edit, then Approve. ':'')+(cfg.auto?'Approved comments are posted by the 30-minute LinkedIn check.':'Auto-posting is off: post approved comments yourself, then Mark posted.');}
    return h;}
  moneySum(list){const cur=AK.leadSetting('currency')||'USD';const same=list.filter(l=>l.price!=null&&l.price!==''&&(l.currency||cur)===cur);const other=list.filter(l=>l.price!=null&&l.price!==''&&(l.currency||cur)!==cur).length;
    return this.money(same.reduce((a,l)=>a+Number(l.price||0),0),cur)+(other?' + '+other+' in other currencies':'');}
  leadFilterVals(){const s=this.state;const f=s.lf;const set=(k,v)=>this.setState(x=>({lf:{...x.lf,[k]:v},ldMore:{},lmore:false}));
    const opts=(all,list)=>[{v:'',l:all},...list.map(x=>({v:x.name||x,l:x.name||x}))];
    // Instagram quick filter (7 Nov): one tap for Instagram leads, then which of our accounts they came in on.
    const igOn=f.source==='Instagram'||this.state.lch==='Instagram';const IA=((AK.leadSetting('instagram')||{}).accounts||[]).map(a=>'@'+String(a).toLowerCase().replace(/^@/,''));
    const accts=[...new Set([...IA,...this.leadsAll().filter(l=>l.source==='Instagram').map(l=>this.igAcct(l).toLowerCase()).filter(Boolean)])];
    return{q:f.q,onQ:e=>set('q',e.target.value),source:f.source,onSource:e=>{const v=e.target.value;this.setState(x=>({lf:{...x.lf,source:v,acct:v==='Instagram'?x.lf.acct:''},ldMore:{},lmore:false}));},
      isIg:igOn,igBg:igOn?'#fde8f1':'rgba(255,255,255,.85)',igFg:igOn?'#c13584':'var(--ink)',igSh:igOn?'inset 0 0 0 1.5px #e1306c':'inset 0 0 0 1px var(--hairline-strong)',
      igToggle:()=>this.setState(x=>({lch:(store.set('lch',x.lch==='Instagram'?'':'Instagram'),x.lch==='Instagram'?'':'Instagram'),lf:{...x.lf,source:'',acct:''},ldMore:{},lmore:false})),
      ...(()=>{const liOn=this.state.lch==='LinkedIn';return{liBg:liOn?'#e8f1fb':'rgba(255,255,255,.85)',liFg:liOn?'#0a66c2':'var(--ink)',liSh:liOn?'inset 0 0 0 1.5px #0a66c2':'inset 0 0 0 1px var(--hairline-strong)',
        liToggle:()=>this.setState(x=>({lch:(store.set('lch',x.lch==='LinkedIn'?'':'LinkedIn'),x.lch==='LinkedIn'?'':'LinkedIn'),lf:{...x.lf,source:'',acct:''},ldMore:{},lmore:false}))};})(),
      acct:f.acct,onAcct:e=>set('acct',e.target.value),accts:[{v:'',l:'Both accounts'},...accts.map(a=>({v:a,l:a}))],group:f.group,onGroup:e=>set('group',e.target.value),cat:f.cat,onCat:e=>set('cat',e.target.value),dir:f.dir,onDir:e=>set('dir',e.target.value),
      sources:opts('All sources',this.leadSet('sources')),groups:opts('All groups',this.leadSet('groups')),cats:opts('All categories',this.leadSet('categories')),dirs:opts('Inbound and outbound',['Inbound','Outbound']),rel:f.rel||'',onRel:e=>set('rel',e.target.value),rels:[{v:'',l:'Any relationship'},{v:'midbound',l:'Midbound'},{v:'outbound',l:'Outbound'},{v:'new',l:'New connection'},{v:'inbound',l:'Inbound'}],
      hasGroups:this.leadSet('groups').length>0,hasCats:this.leadSet('categories').length>0,
      heat:f.heat,onHeat:e=>set('heat',e.target.value),heats:[{v:'',l:'All leads'},{v:'Hot',l:'Hot leads'},{v:'Warm',l:'Warm leads'},{v:'Cold',l:'Cold leads'}],
      active:!!(f.q||f.source||f.group||f.cat||f.dir||f.heat||f.acct||f.rel),clear:()=>this.setState({lf:{q:'',source:'',group:'',cat:'',dir:'',heat:'',acct:'',rel:''}}),
      exportCsv:()=>this.exportLeads()};}
  exportLeads(){const L=this.leadFiltered();if(!L.length){this.toast('No leads to export.',null,true);return;}
    const F=this.leadSet('fields');const cols=['name','company','role','email','phone','x_handle','linkedin','instagram','website','direction','source','source_detail','stage','group_name','categories','pitch','price','currency','pricing_note','closed_for','next_step','next_date','owner','last_touch','created_at','notes'];
    const esc=v=>{v=Array.isArray(v)?v.join('; '):v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
    const lines=[[...cols,...F.map(x=>x.label)].join(','),...L.map(l=>[...cols.map(c=>esc(l[c])),...F.map(x=>esc((l.fields||{})[x.key]))].join(','))];
    const url=URL.createObjectURL(new Blob(['﻿'+lines.join('\n')],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='leads-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    this.toast('Exported '+L.length+(L.length===1?' lead':' leads')+'.');}
  leadVals(page){const s=this.state;const st=AK.leadsState();const E=s.entered;const base={loading:!st.loaded,err:st.err,hasErr:!!st.err,f:this.leadFilterVals(),newLead:()=>this.newLead()};
    if(page!=='leadBoard')this._ldAuto=false;   // next visit to Pipeline scrolls the board into view again
    if(page==='leads')return{...base,...this.leadOverview(),dash:this.gtmDashVals()};
    if(page==='leadBoard')return{...base,...this.leadBoard()};
    if(page==='leadList')return{...base,...this.leadList()};
    if(page==='leadAdd')return{...base,...this.leadAddVals()};
    if(page==='leadSetup')return{...base,...this.leadSetupVals(),icp:this.gtmSetupVals()};
    if(page==='gtmViews')return{...base,gv:this.gtmViewsVals()};
    if(page==='liPipe')return{...base,lp:this.liPipeVals()};
    if(page==='leadDossier')return{...base,dos:this.dossierVals()};
    if(page==='leadBrief')return{...base,db:this.dailyVals()};
    if(LI_LISTS[page])return{...base,gv:this.gtmViewsVals(LI_LISTS[page]),liOut:page==='liOut'?this.liOutVals():null,bot:page==='liOut'?this.liBotVals():null};
    if(page==='gtmNow')return{...base,now:this.gtmNowVals()};
    if(page==='gtmDash')return{...base,dash:this.gtmDashVals()};
    if(page==='gtmEngage')return{...base,ge:this.gtmEngageVals(),lis:this.lisVals()};
    return base;}
  leadOverview(){const s=this.state;const E=s.entered;const L=this.leadsAll();const ST=this.leadSet('stages');const kindOf=l=>this.stageOf(l.stage).kind;
    const open=L.filter(l=>kindOf(l)==='open'),won=L.filter(l=>kindOf(l)==='won'),lost=L.filter(l=>kindOf(l)==='lost');
    const m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0);const wonM=won.filter(l=>new Date(l.stage_at||l.updated_at)>=m0);
    const due=open.filter(l=>{const n=this.leadNext(l);return n&&(n.late||n.today);});const cold=open.filter(l=>!this.leadNext(l)&&Date.now()-new Date(l.last_touch||l.created_at).getTime()>7*AK.DAY);
    const fresh=open.filter(l=>this.heatOf(l)==='Hot'&&!l.last_touch&&!due.includes(l));const coldOnly=cold.filter(l=>!fresh.includes(l));
    const kpis=[{label:'Open leads',v:String(open.length),d:L.length+' in total',tone:'var(--ink-3)'},{label:'Open pipeline',v:this.moneySum(open),d:'Value of every open lead',tone:'var(--ink-3)'},
      {label:'Won this month',v:String(wonM.length),d:wonM.length?this.moneySum(wonM):'Nothing closed yet this month',tone:'var(--ok-ink)'},
      {label:'Win rate',v:won.length+lost.length?Math.round(won.length/(won.length+lost.length)*100)+'%':'–',d:won.length+' won, '+lost.length+' lost',tone:'var(--ink-3)'},
      {label:'Hot leads',v:String(open.filter(l=>this.heatOf(l)==='Hot').length),d:fresh.length?fresh.length+' new, not contacted yet':'Found automatically from your posts',tone:fresh.length?'var(--warn-ink)':'var(--ink-3)'},
      {label:'Need you',v:String(due.length+coldOnly.length+fresh.length),d:(fresh.length?fresh.length+' new hot, ':'')+due.length+' due or overdue, '+coldOnly.length+' quiet for a week',tone:due.length?'var(--bad-ink)':'var(--ink-3)'}];
    const att=[...fresh.map(l=>({l,why:'New hot lead · '+(l.source_detail||'found automatically'),tone:'warn'})),...due.map(l=>({l,why:this.leadNext(l).label,tone:this.leadNext(l).late?'bad':'warn'})),...coldOnly.map(l=>({l,why:'No touch since '+this.since(l.last_touch||l.created_at)+' and no next step',tone:'neutral'}))].slice(0,8)
      .map(x=>({...this.leadCard(x.l),why:pill(x.why,x.tone)}));
    const mx=Math.max(1,...ST.map(x=>L.filter(l=>l.stage===x.name).length));
    const byStage=ST.map(x=>{const a=L.filter(l=>l.stage===x.name);return{name:x.name,dot:x.color,n:String(a.length),val:a.some(l=>l.price!=null&&l.price!=='')?this.moneySum(a):'',w:E?(a.length/mx*100)+'%':'0%',go:()=>{this.go('leadBoard');}};});
    const SRC=[...new Set([...this.leadSet('sources'),...L.map(l=>l.source).filter(Boolean)])];const mxs=Math.max(1,...SRC.map(x=>L.filter(l=>l.source===x).length));
    const bySource=SRC.map(x=>{const a=L.filter(l=>l.source===x);const i=a.filter(l=>l.direction==='Inbound').length;return{name:this.srcIcon(x)+'  '+x,n:String(a.length),sub:i+' inbound, '+(a.length-i)+' outbound',w:E?(a.length/mxs*100)+'%':'0%',wIn:a.length?(i/a.length*100)+'%':'0%',go:()=>{this.setState(z=>({lf:{...z.lf,source:x}}));this.go('leadList');}};}).filter(x=>x.n!=='0');
    const byId=new Map(AK.LD.rows.map(l=>[l.id,l]));const KIND={note:'Note',call:'Call',message:'Message',email:'Email',meeting:'Meeting',stage:'Stage',created:'Added',engaged:'Engaged'};
    const recent=AK.LD.events.filter(e=>byId.has(e.lead_id)&&!byId.get(e.lead_id).archived).slice(0,10).map(e=>{const l=byId.get(e.lead_id);return{...avatar(l.name||l.company),who:l.name||l.company||'(no name)',what:KIND[e.kind]+': '+clip(e.text,90),when:this.since(e.at),open:()=>this.openLead(l.id)};});
    const groups=this.leadSet('groups').map(g=>({...this.tagPill(g.name,g.color),n:String(L.filter(l=>l.group_name===g.name).length),go:()=>{this.setState(z=>({lf:{...z.lf,group:g.name}}));this.go('leadBoard');}}));
    return{kpis,att,hasAtt:att.length>0,noAtt:!att.length,byStage,bySource,hasSource:bySource.length>0,noSource:!bySource.length,recent,hasRecent:recent.length>0,noRecent:!recent.length,groups,hasGroups:groups.length>0,empty:!L.length};}
  leadBoard(){const s=this.state;const L=this.leadFiltered();const ST=this.leadSet('stages');const known=new Set(ST.map(x=>x.name));
    const cols=[...ST,...[...new Set(L.map(l=>l.stage).filter(x=>!known.has(x)))].map(n=>({name:n,color:'var(--ink-4)',kind:'open'}))].map(x=>{
      const list=L.filter(l=>l.stage===x.name).sort((a,b)=>new Date(b.last_touch||b.updated_at)-new Date(a.last_touch||a.updated_at));const lim=s.ldMore[x.name]?list.length:12;const over=s.ldOver===x.name;
      return{name:x.name,dot:x.color,n:String(list.length),val:list.some(l=>l.price!=null&&l.price!=='')?this.moneySum(list):'',hasVal:list.some(l=>l.price!=null&&l.price!==''),
        bg:over?'var(--out-soft)':'var(--n-soft)',sh:over?'inset 0 0 0 1.5px var(--out-line)':'inset 0 0 0 1px var(--hairline)',
        cards:list.slice(0,lim).map(l=>({...this.leadCard(l),start:e=>{this.ldDrag=l.id;try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',l.id);}catch(_){}},end:()=>{this.ldDrag=null;if(this.state.ldOver)this.setState({ldOver:null});}})),
        hasMore:list.length>lim,moreN:String(list.length-lim),more:()=>this.setState(z=>({ldMore:{...z.ldMore,[x.name]:true}})),empty:!list.length,
        add:()=>this.newLead({stage:x.name}),
        over:e=>{e.preventDefault();if(this.state.ldOver!==x.name)this.setState({ldOver:x.name});},
        drop:e=>{e.preventDefault();const id=this.ldDrag;this.ldDrag=null;this.setState({ldOver:null});const l=id&&AK.LD.rows.find(r=>r.id===id);if(l&&l.stage!==x.name)AK.leadSave(id,{stage:x.name});}};});
    const el=()=>document.getElementById('lead-board');const step=d=>{const b=el();if(b)b.scrollBy({left:d*284*2,behavior:'smooth'});};
    if(!this._ldRs){this._ldRs=true;window.addEventListener('resize',()=>this.measureBoard());}requestAnimationFrame(()=>this.measureBoard());
    return{cols,h:s.ldH?s.ldH+'px':'max(420px, calc(100vh - 350px))',mb:(s.ldMb||0)+'px',tip:this.leadTipBox(),pan:e=>{this.setState({ldTip:null});this.calPan(e);},left:()=>step(-1),right:()=>step(1),
      edge:e=>{const b=e.currentTarget;const r=b.getBoundingClientRect();const x=e.clientX;if(x<r.left+90)b.scrollLeft-=Math.ceil((r.left+90-x)/5);else if(x>r.right-90)b.scrollLeft+=Math.ceil((x-r.right+90)/5);},
      count:L.length+(L.length===1?' lead':' leads')+(s.lf.q||s.lf.source||s.lf.group||s.lf.cat||s.lf.dir?' match the filters':''),none:!this.leadsAll().length};}
  leadList(){const s=this.state;const L=this.leadFiltered();const key=s.lsort,dir=s.ldir;
    const SORT={icp:l=>{const x=this.gtmOne(l.id);return x?-x.c.score.score:0;},name:l=>(l.name||l.company||'').toLowerCase(),stage:l=>this.leadSet('stages').findIndex(x=>x.name===l.stage),source:l=>l.source||'',group:l=>l.group_name||'',value:l=>Number(l.price||0),next:l=>l.next_date||'9999',touch:l=>-new Date(l.last_touch||l.created_at).getTime()};
    const by=SORT[key]||SORT.touch;const sorted=L.slice().sort((a,b)=>{const x=by(a),y=by(b);return(x<y?-1:x>y?1:0)*dir;});const lim=s.lmore?sorted.length:50;
    const heads=[['name','Lead'],['stage','Stage'],['icp','ICP'],['source','Source'],['group','Group'],['value','Value'],['next','Next step'],['touch','Last touch']].map(([k,label])=>({label,arrow:key===k?(dir>0?'↑':'↓'):'',fg:key===k?'var(--ink)':'var(--ink-3)',
      sort:()=>this.setState(z=>({lsort:k,ldir:z.lsort===k?-z.ldir:1})),right:k==='value'}));
    const rows=sorted.slice(0,lim).map((l,i)=>{const c=this.leadCard(l);return{...c,stageP:c.stage,source:l.source?this.srcIcon(l.source)+' '+l.source:'–',dir:l.direction||'',groupP:c.group,hasGroup:c.hasGroup,
      value:c.value||'–',nextL:c.next?c.next.label:'–',nextFg:c.next?c.next.fg:'var(--ink-4)',touch:l.last_touch?this.since(l.last_touch):'–',bt:i===0?'none':'1px solid var(--hairline)'};});
    return{heads,rows,hasRows:rows.length>0,noRows:!rows.length,none:!this.leadsAll().length,hasMore:sorted.length>lim,more:()=>this.setState({lmore:true}),count:'Showing '+rows.length+' of '+sorted.length};}
  // People from X and LinkedIn who could become leads. origin_key stops the same person being added twice.
  candidates(){const keys=new Map(AK.LD.rows.filter(l=>l.origin_key).map(l=>[l.origin_key,l]));const out=[];const norm=x=>String(x||'').trim().toLowerCase();
    for(const e of AK.M.engagers){const h=norm(e.Handle).replace(/^@/,'');if(!h)continue;out.push({tab:'X',group:'Replied to our posts on X',key:'x-eng:'+h,name:e.Name||e.Handle,sub:[e.Handle,e.Bio].filter(Boolean).join(' · '),why:verdictOf(e)+(e['What they said']?': “'+clip(e['What they said'],80)+'”':''),
      seed:{name:e.Name||e.Handle,x_handle:e.Handle,direction:'Inbound',source:'X',source_detail:'Replied to '+(e['Our post link']||'our post'),notes:e['What they said']||'',role:clip(e.Bio||'',80)}});}
    // 9 Nov: people we're DMing on X stay in the X Pipeline; they join Leads by themselves once they reply.
    for(const c of AK.M.contacts.filter(()=>false)){out.push({tab:'X',group:'People we’re DMing on X',key:'x-dm:'+norm(c.Name)+'|'+norm(c.Company),name:c.Name,sub:[c.Role,c.Company].filter(Boolean).join(' · '),why:(c.Status||'To send')+(c['Signal (why now)']?': '+clip(c['Signal (why now)'],80):''),
      seed:{name:c.Name,company:c.Company||'',role:c.Role||'',x_handle:c['X handle']||'',linkedin:c.LinkedIn||'',email:c.Email||'',direction:'Outbound',source:/linkedin/i.test(c.Channel||'')?'LinkedIn':/mail/i.test(c.Channel||'')?'Email':'X',source_detail:'DM Pipeline',stage:/sent|fu/i.test(c.Status||'')?'Contacted':/replied|call/i.test(c.Status||'')?'In talks':undefined,notes:c.Notes||''}});}
    for(const p of AK.liPeople()){const eng=p.kind==='engaged';out.push({tab:'LinkedIn',group:eng?'Commented on or DMed about a lead magnet':'Featured in our lead magnet posts',key:'li-'+p.kind+':'+norm(p.name)+'|'+norm(p.company||p.title),name:p.name,sub:[p.company,p.title].filter(Boolean).join(' · '),why:eng?p.raw:'Featured'+(p.raw?' ('+p.raw+')':'')+(p.date?' · '+p.date:''),
      seed:{name:p.name,company:p.company||'',direction:eng?'Inbound':'Outbound',source:'LinkedIn',source_detail:(eng?'Engaged with “':'Featured in “')+p.title+'”'}});}
    return out.map(c=>{const l=keys.get(c.key);return{...c,added:!!l,lead:l||null};});}
  leadAddVals(){const s=this.state;const C=this.candidates();const tab=s.lcand;const shown=C.filter(c=>c.tab===tab);
    const tabs=['X','LinkedIn'].map(t=>{const on=t===tab;const n=C.filter(c=>c.tab===t&&!c.added).length;return{label:t==='X'?'𝕏 X':'in LinkedIn',count:String(n),go:()=>this.setState({lcand:t}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};});
    const groups=[...new Set(shown.map(c=>c.group))].map(g=>{const items=shown.filter(c=>c.group===g).sort((a,b)=>a.added-b.added);return{title:g,n:String(items.filter(c=>!c.added).length),
      items:items.slice(0,60).map(c=>({...avatar(c.name),name:c.name||'(no name)',sub:c.sub,why:c.why,added:c.added,notAdded:!c.added,
        addLabel:c.added?(c.lead.archived?'Restore':'Open'):'Add to Pipeline',
        add:async()=>{if(c.added){if(c.lead.archived)await AK.leadArchive(c.lead.id,false);this.openLead(c.lead.id);return;}const seed={...c.seed,origin_key:c.key};Object.keys(seed).forEach(k=>seed[k]===undefined&&delete seed[k]);const row=await AK.leadCreate(seed);if(row)this.toast((row.name||'They')+' are in the Pipeline, in '+(row.stage||'New')+'.');}}))};});
    const li=AK.liState();
    const busy=AK.S.busy.has('liImport');
    const imp={on:tab==='LinkedIn',label:busy?'Adding…':'Upload Connections.csv',onFile:e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f||busy||!AK.canEdit())return;
      const r=new FileReader();r.onload=()=>AK.importLiConnections(String(r.result||''));r.readAsText(f);}};
    return{imp,tabs,groups,hasGroups:groups.length>0,noGroups:!groups.length,emptyText:tab==='X'?'Nobody from X yet. People who reply to your posts and people in the DM Pipeline show up here.':(!li.on||li.err?(li.err||'The LinkedIn sheet isn’t set up.'):'Nobody from LinkedIn yet. People in the Lead Magnets tab (“Leads who commented or DMed”) and Lead Magnet People show up here.')};}
  leadSetupVals(){const s=this.state;const PAL=['var(--out)','var(--mid)','var(--in)','var(--warn)','var(--bad)','var(--ok)','oklch(0.68 0.16 45)','var(--ink-3)'];
    const nx=c=>PAL[(PAL.indexOf(c)+1)%PAL.length];const L=AK.LD.rows;
    const listOf=(key,title,help,named,count)=>{const items=this.leadSet(key);const nv=s.lsetNew[key]||'';
      const save=v=>AK.leadSettingSave(key,v);
      return{key,title,help,newVal:nv,setNew:e=>{const v=e.target.value;this.setState(z=>({lsetNew:{...z.lsetNew,[key]:v}}));},
        add:()=>{const v=String(this.state.lsetNew[key]||'').trim();if(!v)return;if(items.some(x=>(x.name||x)===v)){this.toast('“'+v+'” is already there.',null,true);return;}
          save([...items,named?(key==='stages'?{name:v,color:PAL[items.length%PAL.length],kind:'open'}:{name:v,color:PAL[items.length%PAL.length]}):v]);this.setState(z=>({lsetNew:{...z.lsetNew,[key]:''}}));},
        addKey:e=>{if(e.key==='Enter'){e.preventDefault();const v=String(e.target.value||'').trim();if(!v)return;if(items.some(x=>(x.name||x)===v))return;
          save([...items,named?(key==='stages'?{name:v,color:PAL[items.length%PAL.length],kind:'open'}:{name:v,color:PAL[items.length%PAL.length]}):v]);this.setState(z=>({lsetNew:{...z.lsetNew,[key]:''}}));}},
        items:items.map((x,i)=>{const name=x.name||x;const ek=key+':'+i;const ed=(s.led.__set||{})[ek];const n=count(name);
          return{name,val:ed!=null?ed:name,dot:x.color||'var(--ink-3)',hasDot:named,count:n?n+(n===1?' lead':' leads'):'',isStage:key==='stages',kind:x.kind||'open',
            setVal:e=>{const v=e.target.value;this.setState(z=>({led:{...z.led,__set:{...(z.led.__set||{}),[ek]:v}}}));},
            saveVal:async()=>{const v=String(((this.state.led.__set||{})[ek])??name).trim();this.setState(z=>{const m={...(z.led.__set||{})};delete m[ek];return{led:{...z.led,__set:m}};});
              if(!v||v===name)return;if(items.some(y=>(y.name||y)===v)){this.toast('“'+v+'” is already there.',null,true);return;}
              await save(items.map((y,j)=>j===i?(named?{...y,name:v}:v):y));await AK.leadRename(key,name,v);},
            color:()=>save(items.map((y,j)=>j===i?{...y,color:nx(y.color)}:y)),
            setKind:e=>save(items.map((y,j)=>j===i?{...y,kind:e.target.value}:y)),
            up:()=>{if(i===0)return;const a=items.slice();[a[i-1],a[i]]=[a[i],a[i-1]];save(a);},canUp:i>0,
            del:()=>{if(n&&key==='stages'){this.toast('Move the '+n+(n===1?' lead':' leads')+' out of “'+name+'” first.',null,true);return;}save(items.filter((y,j)=>j!==i));}};})};};
    const lists=[listOf('stages','Stages','The columns of your pipeline, left to right. Won and Lost count towards the win rate.',true,n=>L.filter(l=>l.stage===n).length),
      listOf('sources','Sources','Where leads come from.',false,n=>L.filter(l=>l.source===n).length),
      listOf('groups','Groups','Each lead can sit in one group, e.g. “YC founders” or “Agencies”.',true,n=>L.filter(l=>l.group_name===n).length),
      listOf('categories','Categories','Tags; a lead can have any number, e.g. “Clipping”, “GTM”, “Hot”.',true,n=>L.filter(l=>(l.categories||[]).includes(n)).length)];
    const F=this.leadSet('fields');const fv=s.lsetNew.__field||{label:'',type:'text',options:''};
    const fields={items:F.map((x,i)=>({label:x.label,type:x.type,opts:(x.options||[]).join(', '),hasOpts:x.type==='select',del:()=>AK.leadSettingSave('fields',F.filter((y,j)=>j!==i)),
        up:()=>{if(i===0)return;const a=F.slice();[a[i-1],a[i]]=[a[i],a[i-1]];AK.leadSettingSave('fields',a);},canUp:i>0})),
      label:fv.label,type:fv.type,options:fv.options,isSelect:fv.type==='select',
      setLabel:e=>{const v=e.target.value;this.setState(z=>({lsetNew:{...z.lsetNew,__field:{...(z.lsetNew.__field||fv),label:v}}}));},
      setType:e=>{const v=e.target.value;this.setState(z=>({lsetNew:{...z.lsetNew,__field:{...(z.lsetNew.__field||fv),type:v}}}));},
      setOptions:e=>{const v=e.target.value;this.setState(z=>({lsetNew:{...z.lsetNew,__field:{...(z.lsetNew.__field||fv),options:v}}}));},
      add:()=>{const label=String(fv.label||'').trim();if(!label)return;const key=label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'field';
        if(F.some(x=>x.key===key)){this.toast('There’s already a field called “'+label+'”.',null,true);return;}
        AK.leadSettingSave('fields',[...F,{key,label,type:fv.type,options:fv.type==='select'?String(fv.options||'').split(',').map(x=>x.trim()).filter(Boolean):[]}]);this.setState(z=>({lsetNew:{...z.lsetNew,__field:{label:'',type:'text',options:''}}}));},
      types:[{v:'text',l:'Text'},{v:'number',l:'Number'},{v:'date',l:'Date'},{v:'select',l:'Pick from a list'},{v:'textarea',l:'Long text'}],has:F.length>0};
    const cur=AK.leadSetting('currency')||'USD';
    const A=AK.leadSetting('automation')||{};const aset=(k,v)=>{if(!AK.leadsState().loaded||!AK.LD.settings.automation){this.toast('Still loading your settings. Try again in a moment.',null,true);return;}AK.leadSettingSave('automation',{...AK.LD.settings.automation,[k]:v});};
    const abuf=k=>s.led['__a_'+k]!=null?s.led['__a_'+k]:(A[k]||'');
    const asave=k=>()=>{const v=this.state.led['__a_'+k];if(v==null)return;this.setState(z=>{const m={...z.led};delete m['__a_'+k];return{led:m};});if(String(v).trim()!==String(A[k]||''))aset(k,String(v).trim());};
    const tog=(k,label,help)=>{const on=A[k]!==false&&(k!=='add_warm'||!!A[k]);return{label,help,on,txt:on?'On':'Off',bg:on?'var(--ok-soft)':'var(--n-soft)',fg:on?'var(--ok-ink)':'var(--ink-3)',bd:on?'inset 0 0 0 1px var(--ok-line)':'inset 0 0 0 1px var(--hairline-strong)',flip:()=>aset(k,!on)};};
    const rs=this.runState();const runs=AK.SOC.runs.slice(0,5).map(r=>({when:this.since(r.started_at),ok:r.ok!==false,txt:r.ok===false?'Didn’t finish: '+(/platform-feature-disabled|monthly usage|usage included/i.test(r.error||'')?'Apify’s free monthly credit is used up, so it can’t read LinkedIn until the credit resets (or the plan is raised).':clip(String(r.error||''),160)):!r.finished_at?(r===rs.top&&rs.running?'Running…':'Didn’t finish'):r.summary&&r.summary.skipped?r.summary.skipped:
      (r.summary.posts||0)+' posts, '+(r.summary.people||0)+' people, '+(r.summary.leads_added||0)+' new leads',fg:r.ok===false?'var(--bad-ink)':'var(--ink-2)'}));
    const auto={profile:abuf('linkedin_profile'),setProfile:e=>{const v=e.target.value;this.setState(z=>({led:{...z.led,__a_linkedin_profile:v}}));},saveProfile:asave('linkedin_profile'),
      icp:abuf('icp'),setIcp:e=>{const v=e.target.value;this.setState(z=>({led:{...z.led,__a_icp:v}}));},saveIcp:asave('icp'),
      toggles:[tog('enabled','Check my posts automatically','Twice a day, at 9:00 and 21:00 IST.'),tog('add_hot','Add hot leads to Leads','Founders and decision makers who could buy.'),tog('add_warm','Add warm leads too','People who could buy or refer later.')],
      runs,hasRuns:runs.length>0,running:rs.running,notRunning:!rs.running,run:()=>AK.socialRun(),ready:AK.leadsState().loaded};
    // Instagram DMs (7 Nov): what the hourly ig-sync job keeps and filters out; anyone filtered can be added by hand.
    const IS=AK.leadSetting('instagram')||{};const IT=AK.SOC.ig||[];const ir=AK.SOC.igRuns[0];
    const igLive=AK.SOC.igRunning||(!!ir&&!ir.finished_at&&Date.now()-new Date(ir.started_at).getTime()<3*60e3);
    const kept=IT.filter(t=>t.status==='kept'),filt=IT.filter(t=>t.status==='filtered').sort((a,b)=>new Date(b.qualified_at||b.first_seen)-new Date(a.qualified_at||a.first_seen));
    const lastOk=AK.SOC.igRuns.find(r=>r.ok&&r.finished_at&&!(r.summary&&r.summary.skipped));const behind=lastOk&&lastOk.summary&&Object.values(lastOk.summary.accounts||{}).some(a=>!a.caught_up);
    const ig={running:igLive,notRunning:!igLive,run:()=>AK.igRun(),
      status:igLive?'Reading your DMs now…':!ir?'Not running yet. Once the Instagram job is switched on, it reads your DMs every hour.':ir.ok===false?'The last check didn’t finish ('+this.since(ir.started_at)+'): '+ir.error:
        ir.summary&&ir.summary.skipped?ir.summary.skipped:'Last checked '+this.since(ir.finished_at||ir.started_at)+'. Checks every hour.'+(behind?' Still going back through the last '+(IS.backfill_days||30)+' days.':''),
      statusFg:ir&&(ir.ok===false||(ir.summary&&ir.summary.skipped))?'var(--bad-ink)':'var(--ink-3)',
      counts:kept.length+(kept.length===1?' person':' people')+' added to Leads from Instagram, '+filt.length+' filtered out.',
      rules:'A DM counts once you’ve sent them '+[(IS.our_links||[]).join(', '),(IS.our_phones||[]).join(' or ')].filter(Boolean).join(', or your number ')+'. Filtered out: under '+Number(IS.min_followers||1000).toLocaleString('en-US')+' followers, people looking for clipping work, and '+(IS.ignore||[]).map(h=>'@'+h).join(', ')+'.',
      accounts:(IS.accounts||[]).map(h=>'@'+h).join(' and ')||'your Instagram accounts',
      filtered:filt.slice(0,60).map(t=>({handle:'@'+t.handle,acct:'to @'+t.account,why:t.why||'Filtered out',when:this.since(t.qualified_at||t.first_seen),
        open:()=>open('https://instagram.com/'+t.handle),add:async()=>{const l=await AK.igToLead(t);if(l)this.toast('Added @'+t.handle+' to Leads.');}})),
      hasFiltered:filt.length>0};
    return{auto,ig,lists,fields,currency:(s.led.__cur!=null?s.led.__cur:cur),setCurrency:e=>{const v=e.target.value.toUpperCase();this.setState(z=>({led:{...z.led,__cur:v}}));},
      saveCurrency:()=>{const v=String(this.state.led.__cur||'').trim().toUpperCase();this.setState(z=>{const m={...z.led};delete m.__cur;return{led:m};});if(/^[A-Z]{3}$/.test(v)&&v!==cur)AK.leadSettingSave('currency',v);}};}
  // The side panel for one lead (or a new one): every field edits in place and saves when you leave it.
  leadPanel(){const s=this.state;const id=s.lid;if(!id)return{open:false};const isNew=id==='new';const l=isNew?s.lnew:AK.LD.rows.find(r=>r.id===id);
    if(!l)return{open:false};
    const val=k=>{if(isNew)return l[k]??'';const e=s.led[k];return e!=null?e:(l[k]??'');};
    const setV=k=>e=>{const v=e&&e.target?e.target.value:e;if(isNew)this.setState(z=>({lnew:{...z.lnew,[k]:v}}));else this.setState(z=>({led:{...z.led,[k]:v}}));};
    const saveV=k=>()=>{if(isNew)return;const e=this.state.led[k];if(e==null)return;this.setState(z=>{const m={...z.led};delete m[k];return{led:m};});const cur=l[k]??'';if(String(e)===String(cur))return;AK.leadSave(l.id,{[k]:e});};
    const pick=k=>e=>{const v=e.target.value;if(isNew){this.setState(z=>({lnew:{...z.lnew,[k]:v}}));return;}AK.leadSave(l.id,{[k]:v});};
    const ST=this.leadSet('stages');const opt=(list,blank)=>[...(blank?[{v:'',l:blank}]:[]),...list.map(x=>({v:x.name||x,l:x.name||x}))];
    const withCur=(list,cur)=>cur&&!list.some(x=>(x.name||x)===cur)?[...list,cur]:list;
    const row=(label,k,type,extra)=>({label,type,isText:type==='text',isNum:type==='number',isDate:type==='date',isSel:type==='select',isArea:type==='textarea',val:val(k),set:setV(k),save:saveV(k),pick:pick(k),ph:'',opts:[],...(extra||{})});
    const contact=[row('Name','name','text',{ph:'Full name'}),row('Company','company','text'),row('Role','role','text'),row('Email','email','text'),row('Phone','phone','text'),
      row('X','x_handle','text',{ph:'@handle'}),row('LinkedIn','linkedin','text',{ph:'Profile link'}),row('Instagram','instagram','text',{ph:'@handle'}),row('Website','website','text')];
    const deal=[row('Direction','direction','select',{opts:opt(['Inbound','Outbound'])}),row('Source','source','select',{opts:opt(withCur(this.leadSet('sources'),l.source),'Pick a source')}),row('Came from','source_detail','text',{ph:'Which post, campaign or person'}),
      row('Group','group_name','select',{opts:opt(withCur(this.leadSet('groups'),l.group_name),'No group')}),row('Owner','owner','select',{opts:opt(withCur(Object.keys(AK.HANDLES),l.owner),'Nobody')}),
      row('Lead heat','heat','select',{opts:[{v:'',l:'–'},{v:'Hot',l:'Hot lead'},{v:'Warm',l:'Warm lead'},{v:'Cold',l:'Cold lead'}]}),row('Pitching','pitch','textarea',{ph:'What we’re pitching them'}),row('Value','price','number',{ph:'Deal value'}),row('Currency','currency','text',{ph:'USD'}),row('Pricing','pricing_note','text',{ph:'e.g. $4,000 a month, 3 months'}),
      row('Closed for','closed_for','text',{ph:'What they bought, once won'}),row('Next step','next_step','text',{ph:'e.g. Send the proposal'}),row('Next step date','next_date','date')];
    const F=this.leadSet('fields');const fv=k=>{if(isNew)return(l.fields||{})[k]??'';const e=s.led['f:'+k];return e!=null?e:((l.fields||{})[k]??'');};
    const custom=F.map(x=>({label:x.label,type:x.type,isText:x.type==='text',isNum:x.type==='number',isDate:x.type==='date',isSel:x.type==='select',isArea:x.type==='textarea',val:fv(x.key),ph:'',opts:[{v:'',l:'–'},...(x.options||[]).map(o=>({v:o,l:o}))],
      set:e=>{const v=e.target.value;if(isNew)this.setState(z=>({lnew:{...z.lnew,fields:{...(z.lnew.fields||{}),[x.key]:v}}}));else this.setState(z=>({led:{...z.led,['f:'+x.key]:v}}));},
      save:()=>{if(isNew)return;const e=this.state.led['f:'+x.key];if(e==null)return;this.setState(z=>{const m={...z.led};delete m['f:'+x.key];return{led:m};});if(String(e)===String((l.fields||{})[x.key]??''))return;AK.leadSave(l.id,{fields:{...(l.fields||{}),[x.key]:e}});},
      pick:e=>{const v=e.target.value;if(isNew){this.setState(z=>({lnew:{...z.lnew,fields:{...(z.lnew.fields||{}),[x.key]:v}}}));return;}AK.leadSave(l.id,{fields:{...(l.fields||{}),[x.key]:v}});}}));
    const cats=this.leadSet('categories').map(c=>{const on=(l.categories||[]).includes(c.name);const t=this.tagPill(c.name,c.color);
      return{...t,bg:on?t.bg:'transparent',fg:on?t.fg:'var(--ink-3)',bd:on?'inset 0 0 0 1px '+c.color:'inset 0 0 0 1px var(--hairline-strong)',
        toggle:()=>{const next=on?(l.categories||[]).filter(x=>x!==c.name):[...(l.categories||[]),c.name];if(isNew)this.setState(z=>({lnew:{...z.lnew,categories:next}}));else AK.leadSave(l.id,{categories:next});}};});
    const si=ST.findIndex(x=>x.name===l.stage);
    const track=ST.map((x,i)=>{const on=i===si,past=si>=0&&i<si;return{label:x.name,full:'Move to '+x.name,hasLine:i<ST.length-1,lineBg:past?x.color:'var(--hairline-strong)',dotBg:on||past?x.color:'#fff',
      sh:on?'0 0 0 4px color-mix(in oklch, '+x.color+' 22%, transparent)':'inset 0 0 0 1.5px var(--hairline-strong)',sc:on?'scale(1.15)':'scale(1)',fg:on?'var(--ink)':'var(--ink-3)',fw:on?'600':'500',
      set:()=>{if(isNew)this.setState(z=>({lnew:{...z.lnew,stage:x.name}}));else if(l.stage!==x.name)AK.leadSave(l.id,{stage:x.name});}};});
    const KIND={note:'Note',call:'Call',message:'Message',email:'Email',meeting:'Meeting',stage:'Stage',created:'Added',engaged:'Engaged'};const ICON={note:'✎',call:'☏',message:'✉',email:'@',meeting:'◷',stage:'→',created:'+',engaged:'♥'};
    const events=isNew?[]:AK.LD.events.filter(e=>e.lead_id===l.id).sort((a,b)=>new Date(b.at)-new Date(a.at)).map(e=>({icon:ICON[e.kind]||'•',kind:KIND[e.kind]||e.kind,text:e.text,when:this.since(e.at),by:String(e.by_email||'').split('@')[0],
      canDel:!['stage','created'].includes(e.kind)&&!String(e.id).startsWith('tmp'),del:()=>AK.leadNoteDelete(e.id)}));
    const kinds=['note','call','message','email','meeting'].map(k=>{const on=s.lkind===k;return{label:KIND[k],go:()=>this.setState({lkind:k}),bg:on?'var(--ink)':'transparent',fg:on?'#fff':'var(--ink-2)'};});
    const addNote=async()=>{const t=this.state.lnote.trim();if(!t)return;this.setState({lnote:''});await AK.leadNote(l.id,this.state.lkind,t);};
    const links=[l.email&&{label:'Email',go:()=>{window.location.href='mailto:'+String(l.email).trim();}},l.x_handle&&{label:'X',go:()=>open(AK.xUrl?AK.xUrl(l.x_handle):'https://x.com/'+String(l.x_handle).replace(/^@/,''))},
      l.linkedin&&{label:'LinkedIn',go:()=>open(/^https?:/.test(l.linkedin)?l.linkedin:'https://'+String(l.linkedin).replace(/^\/+/,''))},
      l.instagram&&{label:'Instagram',go:()=>open('https://instagram.com/'+String(l.instagram).replace(/^@/,''))},l.website&&{label:'Website',go:()=>open(/^https?:/.test(l.website)?l.website:'https://'+l.website)}].filter(Boolean);
    const st=this.stageOf(l.stage);const a=avatar(l.name||l.company||'?');
    const archive=()=>{this.closeLead();AK.leadArchive(l.id,true);this.toast('Archived '+(l.name||'the lead')+'.',()=>AK.leadArchive(l.id,false));};
    const tab=isNew?'details':s.ltab;const g=isNew?{ok:false}:this.gtmPanel(l);const dup=isNew?AK.gtm.find(l):null;
    const tabs=isNew?[]:[['intel','Intel'],['out','Outreach'],['details','Details']].map(([k,label])=>{const on=tab===k;return{label,go:()=>this.setState({ltab:k}),bg:on?'var(--ink)':'transparent',fg:on?'#fff':'var(--ink-2)'};});
    return{open:true,isNew,notNew:!isNew,tabs,hasTabs:!isNew,tabIntel:tab==='intel'&&g.ok,tabOut:tab==='out'&&g.ok,tabDetails:tab==='details'||!g.ok,g,
      hasDup:!!dup,dupTxt:dup?'Looks like '+(dup.name||dup.company)+(dup.company&&dup.name?' ('+dup.company+')':'')+' is already in Leads ('+dup.stage+').':'',openDup:()=>dup&&this.openLead(dup.id),
      saveAnyway:()=>{this._force=true;Promise.resolve(this.createLead()).finally(()=>{this._force=false;});},
      ...a,name:val('name')||(isNew?'New lead':'(no name)'),sub:[val('role'),val('company')].filter(Boolean).join(' · ')||(isNew?'Fill in what you know; you can add the rest later.':''),
      stageP:this.tagPill(l.stage||'',st.color),heatP:this.heatOf(l)?this.tagPill(HEAT_L[this.heatOf(l)],HEAT_C[this.heatOf(l)]):null,hasHeat:!!this.heatOf(l),srcLabel:l.source?this.srcIcon(l.source)+' '+l.source+' · '+(l.direction||''):(l.direction||''),
      track,contact,deal,custom,hasCustom:custom.length>0,cats,hasCats:cats.length>0,noCats:!cats.length,events,hasEvents:events.length>0,kinds,note:s.lnote,setNote:e=>this.setState({lnote:e.target.value}),
      noteKey:e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();addNote();}},addNote,links,hasLinks:links.length>0,...this.briefVals(l,isNew),call:(()=>{const c=(!isNew&&l&&l.fields&&l.fields.call)||null;if(!c)return{has:false};const k=callKind(c,l.source);const past=c.at&&c.at<Date.now()-36e5;return{has:true,kind:k[0],kBg:k[1],kFg:k[2],when:callWhen(c.at)+(past?' (past)':''),state:c.status==='declined'?'Declined':c.status==='cancelled'?'Cancelled':'',hasState:c.status==='declined'||c.status==='cancelled',src:'From '+(c.src||'Gmail')+(c.how?', matched by '+c.how:''),hasMeet:!!c.meet,meet:c.meet||'',openMeet:()=>window.open(c.meet,'_blank','noopener'),copyMeet:()=>this.copy(c.meet,'lm'+l.id,'Meet link copied.'),noMeet:!c.meet};})(),
      notes:val('notes'),setNotes:setV('notes'),saveNotes:saveV('notes'),create:()=>this.createLead(),archive,setupCats:()=>{this.closeLead();this.go('leadSetup');},
      added:isNew?'':'Added '+this.since(l.created_at)+(l.created_by?' by '+String(l.created_by).split('@')[0]:'')};}

  /* ---------- GTM intelligence (8 Nov) ----------
     LinkedIn views (New connections, ICP qualified, Outbound, Midbound, Inbound and the status views), Right now (the Buying
     Window Radar), the GTM dashboard, the ICP on Setup, and the lead panel's Intel and Outreach tabs. The rules are in
     window.GTM (crm/src/gtm.js); every lead is classified once per data change. Nothing here sends a message. */
  gtmAll(){const v=AK.version()+'|'+this.state.owner+'|'+this.state.plat+'|'+this.state.lch+'|'+JSON.stringify(AK.leadSetting('icp')||{});if(this._gC&&this._gV===v)return this._gC;
    const cfg=AK.gtm.cfg();const ST=this.leadSet('stages');const ev=new Map();for(const e of AK.LD.events)(ev.get(e.lead_id)||ev.set(e.lead_id,[]).get(e.lead_id)).push(e);
    const now=new Date();const list=this.leadsAll().map(l=>{const E=GTM.evidence(l);const c=GTM.classify(l,ev.get(l.id)||[],ST,cfg,now);const fd=E.date&&GTM.parseDay(E.date.v);
      const lastOut=[...c.touches].reverse().find(t=>t.dir==='out');const lc=lastOut?lastOut.at:c.contacted&&c.contacted.at||'';
      return{l,c,ev:E,persona:GTM.personaOf(l),industry:E.industry?String(E.industry.v):'',emp:E.employees?Number(E.employees.v):null,fmo:fd?(now-fd)/(30.44*AK.DAY):null,lastContact:lc};});
    this._gV=v;this._gC=list;this._gM=new Map(list.map(x=>[x.l.id,x]));return list;}
  gtmOne(id){this.gtmAll();return this._gM.get(id)||null;}
  gtmBandP(sc){return pill(sc.label,GTM.BAND[sc.band].tone);}
  gtmScoreP(sc){return pill(sc.band==='unverified'||sc.band==='excluded'||sc.band==='disqualified'?sc.label+(sc.score?' · '+sc.score:''):'Fit '+sc.score+' · '+sc.label,GTM.BAND[sc.band].tone);}
  gtmLevelP(rd){return pill(({HIGH:'Reach out now',MEDIUM:'Worth a touch',LOW:'No fresh news'}[rd.level]||'Timing')+(rd.score?' · '+rd.score:''),{HIGH:'out',MEDIUM:'warn',LOW:'ghost'}[rd.level]);}
  gtmRelP(c){return pill(c.relLabel,{new:'warn',outbound:'out',midbound:'mid',inbound:'in'}[c.rel]);}
  gtmKindP(k){return{fact:pill('Source','ok'),manual:pill('No source','warn'),derived:pill('From CRM','neutral'),inference:pill('Best guess','warn'),override:pill('Override','mid')}[k]||pill('Not known','ghost');}
  gtmId(x){const l=x.l;const a=avatar(l.name||l.company||'?');const li=GTM.normLi(l.linkedin)?(/^https?:/.test(l.linkedin)?l.linkedin:'https://'+String(l.linkedin).replace(/^\/+/,'')):'';
    const tg=[...x.c.tags,...(l.categories||[])].filter((v,i,A)=>A.indexOf(v)===i);
    return{...a,id:l.id,name:l.name||'(no name)',role:l.role||(x.ev.title?String(x.ev.title.v):'')||'',company:l.company||'',sub:[l.role||(x.ev.title?String(x.ev.title.v):''),l.company].filter(Boolean).join(' · ')||'–',hasLi:!!li,openLi:stop(()=>open(li)),liLabel:li?li.replace(/^https?:\/\/(www\.)?/,'').slice(0,40):'',
      tags:tg.slice(0,4).map(t=>this.tagPill(t,TAG_C[t]||this.tagOf('categories',t))),open:()=>this.openLead(l.id,'intel')};}
  // One-click "move into outreach": the next step becomes sending the opener today, and the panel opens on Outreach.
  async gtmStart(l){const first=GTM.firstName(l.name);const patch={next_step:'Send the opener to '+first,next_date:new Date().toISOString().slice(0,10)};if(l.direction!=='Outbound'&&l.direction!=='Inbound')patch.direction='Outbound';
    const ok=await AK.leadSave(l.id,patch);if(ok){this.toast('Queued '+(l.name||'them')+' for outreach. Copy the opener and send it yourself.');this.openLead(l.id,'out');}}
  gtmAction(view,x){const l=x.l;
    if(view==='newconn'||(view==='icp'&&!x.c.contacted)||(view==='outbound'&&!x.c.contacted))return{label:'Start outreach',go:stop(()=>this.gtmStart(l)),primary:true};
    if(view==='outbound')return{label:x.c.fuN>=2?'Log reply':'Follow up',go:stop(()=>this.openLead(l.id,'out')),primary:false};
    if(view==='midbound'||view==='inbound')return{label:'Log / reply',go:stop(()=>this.openLead(l.id,'out')),primary:false};
    return{label:'Open',go:stop(()=>this.openLead(l.id,'intel')),primary:false};}
  gtmFilterVals(){const s=this.state;const f=s.gf;const A=this.gtmAll();const set=(k,v)=>this.setState(z=>({gf:{...z.gf,[k]:v},gmore:false}));const o=(all,list)=>[{v:'',l:all},...list.map(x=>Array.isArray(x)?{v:x[0],l:x[1]}:{v:x,l:x})];
    const inds=[...new Set(A.map(x=>x.industry).filter(Boolean))].sort();const owners=[...new Set(A.map(x=>x.l.owner).filter(Boolean))].sort();
    const sel=(k,label,opts)=>({k,label,val:f[k]||'',on:e=>set(k,e.target.value),opts,act:!!f[k]});
    const sels=[sel('band','ICP band',o('Any fit',Object.keys(GTM.BAND).map(b=>[b,GTM.BAND[b].label]))),sel('min','Fit score',o('Any score',[['85','85+'],['70','70+'],['50','50+']])),
      sel('stage','Stage',o('Any stage',this.leadSet('stages').map(x=>x.name))),sel('status','Status',o('Any status',GTM.STATUSES)),
      sel('rec','Funding recency',o('Any funding date',[['3','Last 3 months'],['6','Last 6 months'],['12','Last 12 months'],['old','Over a year'],['u','Unknown']])),
      sel('emp','Employees',o('Any size',[['s','1–4'],['icp','5–50'],['m','51–200'],['l','200+'],['u','Unknown']])),sel('ind','Industry',o('Any industry',[...inds,['u','Unknown']])),
      sel('des','Designation',o('Any designation',['Founder / CEO','Other C-suite','Other role','Unknown'])),sel('acq','Source',o('Any source',GTM.ACQ)),
      sel('rel','Relationship',o('Any relationship',Object.keys(GTM.REL).map(k=>[k,GTM.REL[k]]))),
      sel('last','Last contacted',o('Last contacted: any',[['7','Last 7 days'],['30','Last 30 days'],['old','Over 30 days'],['never','Never']])),
      sel('next','Next follow-up',o('Next follow-up: any',[['late','Overdue'],['today','Today'],['week','This week'],['none','None set']])),
      sel('owner','Assignee',o('Any assignee',owners)),sel('tag','Tag',o('Any tag',[...GTM.TAGS,...this.leadSet('categories').map(c=>c.name||c)].filter((v,i,a)=>a.indexOf(v)===i))),
      sel('sort','Sort',[{v:'',l:'Sort: fit score'},{v:'radar',l:'Sort: buying window'},{v:'recent',l:'Sort: last touch'},{v:'name',l:'Sort: name'}])];
    const active=Object.keys(f).some(k=>k!=='sort'&&f[k]);
    return{q:f.q,onQ:e=>set('q',e.target.value),sels,active,clear:()=>this.setState({gf:{...GF0},gmore:false}),moreOn:!!s.gfMore,moreLabel:s.gfMore?'Fewer filters':'More filters',toggleMore:()=>this.setState(z=>({gfMore:!z.gfMore})),
      main:sels.filter(x=>['band','status','acq','sort'].includes(x.k)),rest:sels.filter(x=>!['band','status','acq','sort'].includes(x.k))};}
  gtmFiltered(list){const f=this.state.gf;const q=String(f.q||'').trim().toLowerCase();const now=Date.now();const t0=new Date();t0.setHours(0,0,0,0);
    return list.filter(x=>{const {l,c}=x;
      if(q&&![l.name,l.company,l.role,l.linkedin,l.notes,l.source_detail,x.industry].join(' ').toLowerCase().includes(q))return false;
      if(f.band&&c.score.band!==f.band)return false;if(f.min&&c.score.score<Number(f.min))return false;if(f.stage&&l.stage!==f.stage)return false;if(f.status&&c.status!==f.status)return false;
      if(f.rec){const m=x.fmo;if(f.rec==='u'?m!=null:m==null||!(f.rec==='old'?m>12:m<=Number(f.rec)))return false;}
      if(f.emp){const n=x.emp;if(f.emp==='u'?n!=null:n==null||!(f.emp==='s'?n<5:f.emp==='icp'?n>=5&&n<=50:f.emp==='m'?n>50&&n<=200:n>200))return false;}
      if(f.ind&&(f.ind==='u'?!!x.industry:x.industry!==f.ind))return false;if(f.des&&x.persona!==f.des)return false;if(f.acq&&c.acq!==f.acq)return false;if(f.rel&&c.rel!==f.rel)return false;
      if(f.last){const d=x.lastContact?(now-new Date(x.lastContact))/AK.DAY:null;if(f.last==='never'?d!=null:d==null||!(f.last==='old'?d>30:d<=Number(f.last)))return false;}
      if(f.next){const n=this.leadNext(l);const d=l.next_date?new Date(l.next_date+'T00:00:00'):null;if(f.next==='none'?!!n:!n||!(f.next==='late'?n.late:f.next==='today'?n.today:d&&d>=t0&&d-t0<=7*AK.DAY))return false;}
      if(f.owner&&l.owner!==f.owner)return false;if(f.tag&&!c.tags.includes(f.tag)&&!(l.categories||[]).includes(f.tag))return false;
      return true;});}
  gtmSorted(list){const k=this.state.gf.sort;const by=k==='radar'?(x=>-(x.c.radar.score*1000+x.c.score.score)):k==='recent'?(x=>-new Date(x.l.last_touch||x.l.created_at).getTime()):k==='name'?(x=>(x.l.name||'').toLowerCase()):(x=>-(x.c.score.score*1000+x.c.score.max));
    return list.slice().sort((a,b)=>{const x=by(a),y=by(b);return x<y?-1:x>y?1:0;});}
  gtmViewsVals(only){const s=this.state;const A=this.gtmAll();const GVx=only?GV.filter(v=>only.includes(v.id)):GV;const vid=GVx.some(v=>v.id===s.gv)?s.gv:GVx[0].id;const V=GVx.find(v=>v.id===vid);const excl=!!s.gx;
    const inView=v=>A.filter(x=>v.f(x));const icpOnly=v=>v.icp&&!(excl&&v.id!=='icp');
    const dup=AK.gtm.dupes();
    const tabs=[...GVx.map(v=>{const all=inView(v);const n=icpOnly(v)?all.filter(x=>x.c.score.icp).length:all.length;const on=v.id===vid&&s.gv!=='dupes';
      return{label:v.label,count:String(n),go:()=>this.setState({gv:v.id,gmore:false}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};}),
      ...(dup.length&&!only?[{label:'Possible duplicates',count:String(dup.length),go:()=>this.setState({gv:'dupes'}),bg:s.gv==='dupes'?'var(--bad)':'var(--bad-soft)',fg:s.gv==='dupes'?'#fff':'var(--bad-ink)',bd:'var(--bad-line)'}]:[])];
    const base={tabs,wrap:s.narrow?'nowrap':'wrap',f:this.gtmFilterVals(),isDupes:s.gv==='dupes',notDupes:s.gv!=='dupes',hint:V.hint,title:V.label,
      exclOn:excl,exclLabel:excl?'Showing excluded and unresearched':'ICP only',exclTitle:'Leads under 50, or not researched enough to score, are hidden from the ICP views. Show them too.',
      canExcl:!!V.icp&&V.id!=='icp',toggleExcl:()=>{const v=!this.state.gx;store.set('gtm-excl',v);this.setState({gx:v});},
      exclBg:excl?'var(--warn-soft)':'rgba(255,255,255,.85)',exclFg:excl?'var(--warn-ink)':'var(--ink)',exclSh:excl?'inset 0 0 0 1.5px var(--warn-line)':'inset 0 0 0 1px var(--hairline-strong)'};
    if(s.gv==='dupes'&&dup.length)return{...base,...this.gtmDupesVals(dup)};
    if(s.gv==='dupes')return{...base,isDupes:true,notDupes:false,groups:[],hasGroups:false,noGroups:true};
    const all=inView(V);const pool=icpOnly(V)?all.filter(x=>x.c.score.icp):all;const hidden=all.length-pool.length;const unv=all.filter(x=>x.c.score.band==='unverified').length;
    const list=this.gtmSorted(this.gtmFiltered(pool));const lim=s.gmore?list.length:60;
    const heads=(GCOLS[vid]||GCOLS.status).map(c=>({label:c[1]}));
    const rows=list.slice(0,lim).map((x,i)=>{const act=this.gtmAction(vid,x);return{...this.gtmId(x),cells:(GCOLS[vid]||GCOLS.status).map(c=>this.gtmCell(c[0],x)),
      act:act.label,go:act.go,aBg:act.primary?'var(--out)':'var(--glass-strong)',aFg:act.primary?'#fff':'var(--ink)',aSh:act.primary?'none':'var(--shadow-sm), var(--hi)',bt:i===0?'none':'1px solid var(--hairline)'};});
    const ld=AK.leadsState();
    return{...base,heads,rows,hasRows:rows.length>0,noRows:!rows.length&&ld.loaded,loading:!ld.loaded,
      empty:all.length?'No leads match these filters.':V.empty,hasHidden:hidden>0&&!excl&&!!V.icp&&vid!=='icp',
      hiddenTxt:hidden+(hidden===1?' lead is':' leads are')+' hidden: '+(unv?unv+' need research before they can be scored'+(hidden>unv?', ':''):'')+(hidden>unv?(hidden-unv)+' score under 50 or are disqualified':'')+'.',
      count:'Showing '+rows.length+' of '+list.length+(pool.length!==list.length?' (filtered from '+pool.length+')':''),hasMore:list.length>lim,more:()=>this.setState({gmore:true})};}
  gtmCell(k,x){const {l,c}=x;const E=x.ev;const U='–';const T=(txt,sub,fg)=>({txt:txt==null||txt===''?U:String(txt),sub:sub||'',fg:fg||(txt==null||txt===''?'var(--ink-4)':'var(--ink-2)'),isPill:false,notPill:true});
    const P=(p,sub)=>({isPill:true,notPill:false,p,sub:sub||'',txt:'',fg:''});const d=v=>v?String(v).slice(0,10):'';const ex=k2=>E[k2]?String(k2==='amount'||k2==='total'?GTM.fmtMoney(GTM.parseMoney(E[k2].v)):E[k2].v):'';
    const lastOut=[...c.touches].reverse().find(t=>t.dir==='out');const n=this.leadNext(l);
    switch(k){
      case 'size':return T(x.emp!=null?x.emp+' people':'',ex('industry'));
      case 'fund':return T([ex('round'),ex('amount')].filter(Boolean).join(' · '),E.date?(E.date.kind==='inference'?'≈ ':'')+d(E.date.v)+(E.date.kind==='inference'?' (inferred)':''):'Date Unknown');
      case 'icp':return P(this.gtmScoreP(c.score),'Confidence '+c.score.conf+'%');
      case 'why':return T(c.score.reasons.slice(0,2).join('; '),c.score.gaps.length?'Not known yet: '+c.score.gaps.slice(0,3).join(', '):'');
      case 'angle':return T(c.radar.angle.label,c.radar.why[0]?c.radar.why[0].text:'No signals yet');
      case 'window':return P(this.gtmLevelP(c.radar),c.radar.why[0]?c.radar.why[0].label:'');
      case 'sent':return T(c.contacted?d(c.contacted.at):'',lastOut?lastOut.ch:c.contacted?'LinkedIn':'');
      case 'msg':return T(lastOut?clip(lastOut.text||GTM.TOUCH_TYPES[lastOut.type],60):c.contacted?GTM.templateOf(l,c):'',lastOut&&lastOut.tpl?lastOut.tpl:'');
      case 'fu':return T(n?n.when:'',c.fuN+(c.fuN===1?' follow-up sent':' follow-ups sent'));
      case 'resp':return T(c.engaged?(c.lastIn?GTM.TOUCH_TYPES[c.lastIn.type]:'Replied'):c.contacted?'No reply yet':'Not contacted',c.lastIn?d(c.lastIn.at):'',c.engaged?'var(--mid-ink)':'var(--ink-3)');
      case 'orig':return T(c.contacted?d(c.contacted.at):'',c.contacted?GTM.templateOf(l,c):'');
      case 'lastint':return T(c.lastAny?d(c.lastAny.at):d(l.last_touch),c.lastAny?(c.lastAny.dir==='in'?'From them':'From us'):'');
      case 'response':return T(c.lastIn?clip(c.lastIn.text,70):c.engaged?'See history ('+String(c.engaged.src||'').slice(0,40)+')':'',c.lastIn?GTM.TOUCH_TYPES[c.lastIn.type]:'');
      case 'etype':return T(c.engaged?(c.lastIn?GTM.TOUCH_TYPES[c.lastIn.type]:c.engaged.how==='stage'?'Reached '+l.stage:c.engaged.how):'');
      case 'next':return T(n?n.label:'',n&&n.late?'Overdue':'',n&&n.late?'var(--bad-ink)':undefined);
      case 'meet':return T(['Meeting booked','Qualified','Proposal','Won'].includes(c.status)?c.status:'No meeting yet','',['Meeting booked','Qualified','Proposal','Won'].includes(c.status)?'var(--ok-ink)':'var(--ink-3)');
      case 'src':return T(c.acq,[l.source,l.direction].filter(Boolean).join(' · '));
      case 'ctx':return T(clip(l.source_detail||firstLine(l.notes),70),clip(firstLine(l.notes),60));
      case 'rel':return P(this.gtmRelP(c),c.status);
      case 'value':return T(this.money(l.price,l.currency)||'–','','var(--ink-2)');
      case 'touch':return T(l.last_touch?this.since(l.last_touch):'Never','','var(--ink-3)');
      case 'dq':return T(c.score.dq||(c.score.band==='excluded'?'Max '+c.score.max+' of 100 even if every unknown were positive':''),c.score.dims.filter(z=>z.state==='no').map(z=>z.label).slice(0,3).join(', '));
      default:return T('');}}
  gtmDupesVals(dup){const rows=AK.LD.rows;const by=id=>rows.find(r=>r.id===id);
    const groups=dup.map(g=>{const L=g.ids.map(by).filter(Boolean);const keep=L.find(l=>String(l.origin_key||'').startsWith('li-outreach:'))||L.slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))[0];
      return{why:g.why,items:L.map(l=>({...avatar(l.name||l.company),name:l.name||'(no name)',sub:[l.role,l.company,l.stage,l.origin_key?String(l.origin_key).split(':')[0]:''].filter(Boolean).join(' · '),isKeep:l.id===keep.id,notKeep:l.id!==keep.id,
        open:()=>this.openLead(l.id,'details'),merge:async()=>{if(await AK.gtm.merge(keep.id,l.id))this.toast('Merged '+(l.name||'the duplicate')+' into '+(keep.name||'the lead')+'.',()=>AK.leadArchive(l.id,false));}}))};});
    return{groups,hasGroups:groups.length>0,noGroups:!groups.length};}
  // LinkedIn Outreach: today's numbers against LinkedIn's limits (approximate; LinkedIn changes them without notice).
  /* LinkedIn pipeline (11 Nov): ICP people who engaged with our posts (plus anyone we already reached on LinkedIn), from found
     to won. Non-fits are filtered out first (liNotFit, same rule as the li-bot function). Approve / Skip / a move button
     moves the card at once; the bot does the sending in the background. Columns come from the lead's stage, fields.li
     (written by the bot) and approved messages waiting to send. */
  liPipeScore(l){const v=AK.version();if(this._lpV!==v){this._lpV=v;this._lpS=new Map();}
    if(!this._lpS.has(l.id)){const sc=GTM.score(l,AK.gtm.cfg());const li=(l.fields||{}).li||{},src=liSrcOf(l);const bonus=[];
      if(src==='commented')bonus.push(['+1 commented on our post',1]);if(src==='inbound'||li.inbound_at)bonus.push(['+2 sent us a request',2]);if(src==='viewed'||li.viewed)bonus.push(['+1 viewed our profile',1]);
      const b=bonus.reduce((a,x)=>a+x[1],0);this._lpS.set(l.id,{n:Math.max(1,Math.min(10,Math.round(sc.score/10)+b)),sc,bonus:bonus.map(x=>x[0])});}
    return this._lpS.get(l.id);}
  liNotFit(l){const role=String(l.role||'').trim();const I=((l.fields||{}).gtm||{}).intel||{};const v=k=>I[k]&&I[k].v;
    if(role&&!/^unknown$/i.test(role)&&!/founder|\bceo\b|chief|\bcto\b|\bcoo\b|\bcmo\b|\bcpo\b|\bcfo\b|\bcro\b|president|owner|managing director|head of (growth|marketing|sales|gtm|revenue|business)|\bvp\b|vice president/i.test(role))return 'Not a decision maker ('+clip(role,40)+')';
    if(v('model')==='B2C')return 'Sells to consumers (B2C)';if(v('model')==='Services / agency')return 'Agency or services business';
    if(+v('employees')>100)return 'Too big ('+v('employees')+' people)';if(v('round')==='Series D+')return 'Later than Series C';
    // Founders in the US, Canada, the UK or another tier-1 country, at tech companies (same rule as the li-bot function).
    const ic=(l.fields||{}).li_icp||{},hq=String(v('hq')||ic.hq_country||'').trim(),lives=String(ic.founder_country||'').trim(),known=x=>x&&!/^(unknown|n\/a|none|remote)$/i.test(x);
    const T1=/\b(united states|usa|u\.s\.|america|canada|united kingdom|uk|england|scotland|wales|britain|ireland|australia|new zealand|germany|france|netherlands|belgium|luxembourg|switzerland|austria|sweden|norway|denmark|finland|iceland|spain|portugal|italy|singapore|israel|japan|south korea|korea)\b/i;
    if(known(lives)&&!T1.test(lives))return 'Founder based in '+lives;if(!known(lives)&&known(hq)&&!T1.test(hq))return 'Company based in '+hq;
    if(ic.is_tech===false)return 'Not a tech company'+(ic.kind?' ('+ic.kind+')':'');return '';}
  liMove(l,stage){if(!AK.canEdit())return;const f=l.fields||{},li={...(f.li||{})};li.stop=stage==='In talks'?'in talks':String(stage).toLowerCase();if(stage==='In talks'&&!li.replied)li.talks=new Date().toISOString();
    const ids=AK.LBT.rows.filter(t=>t.lead_id===l.id&&['review','ready','sending','failed'].includes(t.status)).map(t=>t.id);
    AK.leadSave(l.id,{stage,fields:{...f,li}}).then(ok=>{if(!ok)return;if(ids.length)AK.lbtSet(ids,{status:'skipped'});this.toast((l.name||'They')+' moved to '+stage+'. The bot won’t message them any more.');});}
  /* X tab, Shared leads (11 Nov): LinkedIn leads scoring 6+ who fit, to reach on X as well. */
  openDossier(id){const go=()=>this.go('leadDossier',{dosId:id,lid:null});if(this.state.plat!=='Leads'){store.set('plat','Leads');this.setState({plat:'Leads'},go);}else go();}
  /* Daily brief (11 Nov): the 8:00 IST snapshot from the daily-brief job, in Reyansh's format. A person drops off the lists once
     someone logs a touch on them after the brief was written ("Spoke to them" logs one). */
  dailyVals(){const s=this.state;const R=AK.BR.rows||[];const pick=R.find(x=>x.day===s.briefDay)||R[0];const b=pick?pick.data:null;
    const fmtD=d=>{const t=new Date(d+'T00:00:00');return isNaN(t)?d:t.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});};
    const byId=new Map((AK.LD.rows||[]).map(l=>[l.id,l]));const made=pick?Date.parse(pick.made_at):0;const done=s.briefDone||{};
    const CH={LinkedIn:['#e8f1fb','#0a66c2'],X:['#eef0f3','#111'],WhatsApp:['#e3f6ea','#16723b'],Instagram:['#fdeef6','#b4237a']};
    const item=(it,k)=>{const l=it.id?byId.get(it.id):null;const touched=l&&Date.parse(l.last_touch||'')>made+6e4;const key=k+':'+(it.id||it.name);
      return{...avatar(it.name),name:it.name,sub:it.sub||'',why:it.why,chan:it.channel,chanBg:(CH[it.channel]||CH.X)[0],chanFg:(CH[it.channel]||CH.X)[1],
        hasLink:!!it.link,open:()=>window.open(it.link,'_blank','noopener'),openLabel:it.channel==='WhatsApp'?'WhatsApp ↗':'Open '+it.channel+' ↗',
        hasLead:!!l,openLead:()=>l&&this.openLead(l.id),hasPhone:!!it.phone,phone:it.phone||'',
        canSpoke:!!l&&AK.canEdit(),spoke:()=>{if(!l)return;this.setState(x=>({briefDone:{...(x.briefDone||{}),[key]:true}}));AK.leadNote(l.id,'message','Followed up'+(it.channel==='WhatsApp'?' on WhatsApp':' on '+it.channel)+' (from the Daily brief)');},
        hide:!!(touched||done[key])};};
    const list=(arr,k,lim)=>{const all=(arr||[]).map(x=>item(x,k)).filter(x=>!x.hide);const open=!!(s.more&&s.more['brief:'+k]);const shown=open?all:all.slice(0,lim);
      return{items:shown,n:String(all.length),empty:!all.length,hasMore:all.length>shown.length,moreN:String(all.length-shown.length),more:()=>this.setState(x=>({more:{...x.more,['brief:'+k]:true}}))};};
    if(!b)return{none:true,has:false,running:AK.BR.running,run:()=>AK.briefRun(),runLabel:AK.BR.running?'Writing…':'Write it now',canRun:AK.canEdit(),days:[]};
    const st=a=>(a||[]).map(x=>({label:x.label,v:fmtK(+x.v||0),zero:!+x.v}));
    const C=b.calls||{};const gm=C.gmail||'not connected';
    const callAt=t=>t?new Date(t).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+' IST':'Time not known yet';
    const upAll=(C.upcoming||[]).map(c=>{const l=byId.get(c.id)||{};const call=(l.fields||{}).call||{};const meet=call.meet||c.meet||'';const at=call.at||c.at||null;
      const k=callKind(call.kind?call:c,c.source);return{...avatar(c.name),name:c.name,kind:k[0],kBg:k[1],kFg:k[2],sub:[call.status==='declined'?'Declined':call.status==='cancelled'?'Cancelled':'',c.sub,c.source].filter(Boolean).join(' · '),when:callAt(at),hasMeet:!!meet,openMeet:()=>window.open(meet,'_blank','noopener'),copyMeet:()=>this.copy(meet,'meet'+c.id,'Meet link copied.'),openLead:()=>this.openLead(c.id),known:!!(at||meet),soon:at&&at-Date.now()<864e5&&at>Date.now()};})
      .sort((a,b2)=>(b2.soon?1:0)-(a.soon?1:0));
    const up=upAll.filter(c=>c.known),noTime=upAll.length-up.length;
    const known=new Set((AK.LD.rows||[]).flatMap(l=>[String(l.email||'').toLowerCase(),String(l.phone||'').replace(/\D/g,'').slice(-10)]).filter(x=>x&&x.length>4));
    const strays=(C.found||[]).filter(c=>!c.lead_id&&!known.has(String(c.email||'').toLowerCase())&&!known.has(String(c.phone||'').replace(/\D/g,'').slice(-10))).sort((a,b2)=>(b2.at||0)-(a.at||0)).map(c=>{const k=callKind(c,'');return{...avatar(c.name),name:c.name,kind:k[0],kBg:k[1],kFg:k[2],sub:[c.status==='declined'?'Declined':c.status==='cancelled'?'Cancelled':'',c.email,c.phone,c.from].filter(Boolean).join(' · '),canAdd:AK.canEdit()&&c.status==='booked',add:()=>this.briefAddCall(c),when:callAt(c.at),hasMeet:!!c.meet,openMeet:()=>window.open(c.meet,'_blank','noopener')};});
    const noCall=(AK.LD.rows||[]).filter(l=>!l.archived&&l.stage==='Call booked'&&!((l.fields||{}).call||{}).meet).map(l=>({name:l.name,src:l.source,open:()=>this.openLead(l.id)}));
    const LI=list((b.linkedin||{}).follow,'li',8),X=list((b.x||{}).follow,'x',8),IG=list((b.instagram||{}).stale,'ig',8);
    const txtL=(t,arr)=>arr.length?'\n'+t+'\n'+arr.map(x=>'- '+x.name+(x.sub?' ('+x.sub+')':'')+': '+x.why+(x.chan==='WhatsApp'&&x.phone?' [WhatsApp '+x.phone+']':' ['+x.chan+']')).join('\n'):'';
    const statsT=a=>(a||[]).map(x=>x.label+' '+x.v).join(' · ');
    const allOf=(arr,k)=>(arr||[]).map(x=>item(x,k)).filter(x=>!x.hide);
    const text='Daily brief · '+fmtD(b.day)+' (covers '+fmtD(b.yday)+')\n\nOVERALL\n'+(b.overall||[]).map(o=>'- '+o.label+': '+o.v+' ('+o.d+')').join('\n')+
      '\n\nLINKEDIN\n'+statsT((b.linkedin||{}).stats)+txtL('Follow up today:',allOf((b.linkedin||{}).follow,'li'))+
      '\n\nX\n'+statsT((b.x||{}).stats)+txtL('Follow up today:',allOf((b.x||{}).follow,'x'))+
      '\n\nINSTAGRAM (moved to WhatsApp)\n'+statsT((b.instagram||{}).stats)+txtL('No update in 2+ days:',allOf((b.instagram||{}).stale,'ig'))+
      (up.length?'\n\nCALLS BOOKED\n'+up.map(c=>'- '+c.name+': '+c.when).join('\n'):'');
    return{none:false,has:true,title:fmtD(b.day),covers:'Covers '+fmtD(b.yday)+' · written '+this.since(pick.made_at),
      days:R.slice(0,7).map(x=>({label:fmtD(x.day),on:x===pick,bg:x===pick?'var(--ink)':'rgba(255,255,255,.7)',fg:x===pick?'#fff':'var(--ink-2)',pick:()=>this.setState({briefDay:x.day})})),
      run:()=>AK.briefRun(),runLabel:AK.BR.running?'Writing…':'Write it now',canRun:AK.canEdit(),copy:()=>this.copy(text,'brief','Brief copied. Paste it anywhere.'),copyLabel:this.copyBtn('brief','Copy as text').label,
      overall:(b.overall||[]).map(o=>({label:o.label,v:fmtK(+o.v||0),d:o.d})),
      li:{stats:st((b.linkedin||{}).stats),...LI},x:{stats:st((b.x||{}).stats),...X},ig:{stats:st((b.instagram||{}).stats),...IG},
      calls:{noCall,hasNoCall:noCall.length>0,noCallN:String(noCall.length),items:up,has:up.length>0,n:String(upAll.length),hasNoTime:noTime>0,noTimeText:noTime+(up.length?(noTime===1?' more is':' more are'):(noTime===1?' is':' are'))+' in Call booked with no time or Meet link yet'+(gm==='connected'?'.':' (Gmail fills these in once it’s connected).'),strays,hasStrays:strays.length>0,gmailOff:gm!=='connected',gmailC:gm==='connected'?'var(--ink-3)':'var(--warn-ink)',
        gmailText:gm==='connected'?'Gmail is connected: booking emails from cal.com and Calendly add the Meet link to the lead.':gm==='error'?'Couldn’t read Gmail this morning. It tries again tomorrow at 8:00, or press Write it now.':'Gmail isn’t connected yet. Once it is, booking emails (cal.com, Calendly, Google Calendar invites) put the call time and Google Meet link on the lead.'}};}
  briefAddCall(c){const ig=String(c.ig||'').replace(/^@/,'');const clipping=c.kind==='clipping';
    AK.leadCreate({name:c.name||c.email,email:c.email||'',phone:c.phone||'',instagram:ig?'@'+ig:'',source:clipping||ig?'Instagram':'Other',direction:'Inbound',stage:'Call booked',
      source_detail:'Booked a call ('+(c.from||'Gmail')+')',fields:{call:{at:c.at||null,meet:c.meet||'',kind:c.kind||'',status:c.status||'booked',src:c.from||'Gmail',how:'added from the Daily brief'}}});}
  dossierVals(){const s=this.state;const L=this.leadsAll().filter(isGtmCall).sort((a,b)=>new Date(b.stage_at||0)-new Date(a.stage_at||0));
    const sel=L.find(l=>l.id===s.dosId)||L[0];
    const items=L.map(l=>{const b=(l.fields||{}).brief||{};const on=sel&&l.id===sel.id;return{...avatar(l.name||'?'),name:l.name||'(no name)',sub:[l.role,l.company].filter(Boolean).join(' \u00b7 '),src:l.source,when:'Booked '+this.since(l.stage_at),
      status:b.at?(b.mode==='pitch'?'Pitch call':'Advice call: pitch a pilot'):'Writing\u2026',stC:b.at?'var(--ok-ink)':'var(--ink-4)',bg:on?'#fff':'transparent',sh:on?'var(--shadow-sm), inset 0 0 0 1px var(--hairline-strong)':'none',pick:()=>this.setState({dosId:l.id})};});
    const b=sel?((sel.fields||{}).brief||{}):{};
    return{items,has:L.length>0,none:!L.length,n:String(L.length),sel:!!sel,name:sel?sel.name:'',sub:sel?[sel.role,sel.company,sel.source].filter(Boolean).join(' \u00b7 '):'',
      hasText:!!b.text,text:b.text||'',meta:b.at?(b.mode==='pitch'?'Pitch call':'Advice call: pitch a pilot')+' \u00b7 written '+this.since(b.at):'',waiting:!!sel&&!b.text,
      copy:()=>this.copy(b.text||'','dos'+(sel&&sel.id),'Dossier copied.'),rewrite:()=>{if(sel&&AK.canEdit())AK.liBrief(sel.id);},open:()=>{if(sel)this.openLead(sel.id);}};}
  briefVals(l,isNew){const b=(!isNew&&l&&l.fields&&l.fields.brief)||null;const booked=!isNew&&isGtmCall(l);
    return{hasBrief:!!(b&&b.text)&&booked,brief:b?b.text:'',openDos:()=>{if(l)this.openDossier(l.id);},briefMeta:b?(b.mode==='pitch'?'Pitch call':'Advice call: pitch a pilot')+' \u00b7 written '+this.since(b.at):'',
      noBrief:booked&&!(b&&b.text),copyBrief:()=>this.copy(b?b.text:'','brief'+(l&&l.id),'Call brief copied.'),rebrief:()=>{if(l&&AK.canEdit())AK.liBrief(l.id);}};}
  xSharedVals(){const s=this.state;const LI=l=>(l.fields||{}).li||{};const ICP=l=>(l.fields||{}).li_icp||{};
    const list=this.leadsAll().filter(l=>l.source==='LinkedIn'&&/^li-(person|src):/.test(String(l.origin_key||''))&&!/^(won|lost|cold lead)$/i.test(l.stage)&&!this.liNotFit(l)&&LI(l).stop!=='skipped')
      .map(l=>({l,S:this.liPipeScore(l)})).filter(x=>x.S.n>=6).sort((a,b)=>b.S.n-a.S.n);
    const cards=list.map(({l,S})=>{const ic=ICP(l),x=LI(l);const xh=String(ic.x||l.x_handle||'').replace(/^@/,'');const first=String(l.name||'').split(/\s+/)[0]||'there';
      const msg='Hey '+first+', we\u2019re connected on LinkedIn too. Really like what you\u2019re building at '+(l.company||'your company')+'. Would love to swap notes on GTM sometime, open to a quick chat?';
      const li=x.replied?'Replied on LinkedIn':x.dm?'First message sent on LinkedIn':x.acc?'Connected on LinkedIn':x.req?'LinkedIn request sent':'Not contacted on LinkedIn yet';
      const xdm=(l.fields||{}).x_dm;
      return{...avatar(l.name||'?'),name:l.name||'(no name)',sub:[l.role,l.company].filter(Boolean).join(' \u00b7 '),score:String(S.n),one:ic.one_liner||'',loc:[ic.hq_city,ic.hq_country].filter(Boolean).join(', '),li,
        hasX:!!xh,handle:'@'+xh,openX:()=>window.open(xh?'https://x.com/'+xh:'https://x.com/search?q='+encodeURIComponent((l.name||'')+' '+(l.company||''))+'&f=user','_blank','noopener'),xLabel:xh?'Open @'+xh+' on X':'Find them on X',
        copy:()=>this.copy(msg,'xs'+l.id,'Message copied. Paste it in their X DMs.'),msg,done:!!xdm,notDone:!xdm,doneText:xdm?'Messaged on X '+this.since(xdm):'',
        mark:()=>{if(!AK.canEdit())return;AK.leadSave(l.id,{fields:{...(l.fields||{}),x_dm:new Date().toISOString()},last_touch:new Date().toISOString()}).then(ok=>{if(ok){AK.leadNote(l.id,'message','Sent an X DM (shared lead from LinkedIn)');this.toast('Saved: messaged '+(l.name||'them')+' on X.');}});},
        open:()=>this.openLead(l.id)};});
    return{cards,has:cards.length>0,none:!cards.length,n:String(cards.length),todo:String(cards.filter(c=>!c.done).length)};}
  liPipeVals(){const s=this.state;const set=AK.LD.settings.li_bot||{};const st=AK.LD.settings.li_bot_status||{};const T=AK.LBT.rows;
    const LI=l=>(l.fields||{}).li||{};const ICP=l=>(l.fields||{}).li_icp||{};const I=l=>((l.fields||{}).gtm||{}).intel||{};
    const open=new Map(),skipped=new Set();for(const t of T){if(['review','ready','sending','failed'].includes(t.status))open.set(t.lead_id,t);else if(t.status==='skipped'&&(t.kind==='invite'||t.kind==='dm')&&!/already done by hand|they replied|stopped before|not a fit|same person|booked|moved to/i.test(t.error||''))skipped.add(t.lead_id);}
    const COLS=[['found','Leads found','People who engaged with our posts and fit our ICP. Approve to send the connection request.','var(--ink-4)'],
      ['req','Request sent','Waiting for them to accept.','var(--out)'],
      ['dm','First message sent','They accepted and got our first message.','oklch(0.6 0.13 250)'],
      ...[1,2,3,4,5,6,7].map(n=>['fu'+n,'Follow-up '+n,'No reply yet.','oklch(0.72 0.15 65)']),
      ['talks','In talks','Talking on LinkedIn, no call yet. The bot has stopped.','var(--mid)'],
      ['booked','Call booked','A call is on the calendar.','var(--in)'],
      ['won','Won','They became a client.','var(--ok)'],
      ['lost','Lost','Not interested, or no reply after follow-up 7.','var(--bad)']];
    const NAME=Object.fromEntries(COLS.map(c=>[c[0],c[1]]));
    const colOf=l=>{const g=String(l.stage||'').toLowerCase(),x=LI(l),t=open.get(l.id),go=t&&(t.status==='ready'||t.status==='sending');
      if(g==='won')return 'won';if(g==='lost'||g==='cold lead'||x.stop==='no reply'||x.stop==='withdrawn')return 'lost';if(g==='call booked'||g==='proposal sent')return 'booked';
      if(x.replied||g==='in talks')return 'talks';
      if(go&&t.kind==='followup')return 'fu'+Math.min(7,t.step);if(go&&(t.kind==='dm'||t.kind==='accept'))return 'dm';
      if(x.dm){const f=+x.fu||0;return f>0?'fu'+Math.min(7,f):'dm';}
      if(x.req||x.acc||(go&&t.kind==='invite'))return 'req';return 'found';};
    const q=String(s.lpQ||'').trim().toLowerCase(),min=+s.lpMin||0,showOut=!!s.lpOut;
    const pool=this.leadsAll().filter(l=>{if(l.source!=='LinkedIn')return false;const x=LI(l);
      if(x.stop==='skipped'||(skipped.has(l.id)&&!x.req&&!x.dm&&!x.stop))return false;
      const eng=/^li-(person|src):/.test(String(l.origin_key||''))&&(l.heat==='Hot'||(set.include_warm&&l.heat==='Warm'));
      return eng||!!(x.req||x.dm||x.acc||x.replied)||/^(won|call booked|proposal sent|in talks)$/i.test(l.stage)&&eng;});
    // The same person can be in Leads twice (once from our posts, once from outreach done by hand): show the one furthest along.
    {const rank=l=>{const x=LI(l);return(/^(won|call booked|proposal sent|in talks)$/i.test(l.stage)?16:0)+(x.replied?8:0)+(x.dm?4:0)+(x.acc?2:0)+(x.req?1:0);};
      const best=new Map();for(const l of pool){const k=GTM.normName(l.name)||l.id;const b=best.get(k);if(!b||rank(l)>rank(b))best.set(k,l);}
      const keep=new Set([...best.values()].map(l=>l.id));for(let i=pool.length-1;i>=0;i--)if(!keep.has(pool[i].id))pool.splice(i,1);}
    const kindLabel=t=>t.kind==='invite'?(t.text?'Connection request + note':'Connection request (no note left this month)'):t.kind==='accept'?'Accept their request + first message':t.kind==='dm'?'First message':t.kind==='followup'?'Follow-up '+t.step:'InMail';
    const tone=n=>n>=8?{bg:'#e3f6ea',fg:'#16723b'}:n>=5?{bg:'#fff1dc',fg:'#9a5b00'}:{bg:'var(--n-soft-2)',fg:'var(--ink-3)'};
    const btn=(label,fn)=>({label,go:e=>{e&&e.stopPropagation&&e.stopPropagation();fn();}});
    const card=(l,col,out)=>{const x=LI(l),ic=ICP(l),iv=I(l),S=this.liPipeScore(l),tn=tone(S.n),t=open.get(l.id);const ed=(s.lbtEd||{})[t?t.id:''];
      const one=ic.one_liner||(iv.description&&iv.description.v)||'';
      const fund=ic.funding||[iv.round&&iv.round.v,iv.amount&&iv.amount.v?GTM.fmtMoney(iv.amount.v):'',iv.date&&iv.date.v?String(iv.date.v).slice(0,7):''].filter(Boolean).join(' · ');
      const waiting=t&&t.status==='review',going=t&&(t.status==='ready'||t.status==='sending');
      const status=out?'Filtered out: '+out:t&&t.status==='failed'?'Didn’t go through: '+(t.error||'unknown problem'):waiting?kindLabel(t)+' waiting for your OK':going?kindLabel(t)+' approved, sending soon':
        col==='found'?(ic.at?'Writing the request…':'Looking them up…'):col==='req'?(x.acc?'Accepted '+this.since(x.acc):'Request sent '+this.since(x.req)):
        col==='dm'||col.startsWith('fu')?'Last message '+this.since(x.last||x.dm):col==='talks'?'In talks since '+this.since(x.replied||x.talks||l.stage_at):
        col==='lost'?(x.stop==='no reply'?'No reply after follow-up 7':x.stop==='withdrawn'?'Request withdrawn (not accepted in 3 weeks)':'Lost '+this.since(l.stage_at)):
        col==='booked'?(!isGtmCall(l)?'Call booked '+this.since(l.stage_at):((l.fields||{}).brief||{}).at?'Call dossier ready':'Writing the call dossier\u2026'):l.stage+' '+this.since(l.stage_at);
      const SHORT={'united states':'USA','united states of america':'USA','usa':'USA','united kingdom':'UK','united arab emirates':'UAE'};const cty=c=>SHORT[String(c||'').toLowerCase()]||c||'';
      const hqC=(iv.hq&&iv.hq.v)||ic.hq_country||'';const loc=[ic.hq_city,cty(hqC)].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', ');
      const accRaw=iv.accelerator&&iv.accelerator.v;const acc=accRaw&&!/^(none|no|n\/a|unknown|empty.*|-)$/i.test(String(accRaw).trim())?String(accRaw):'';
      const where=[ic.founder_country?'Lives in '+ic.founder_country:'',(iv.hq&&iv.hq.v)||ic.hq_country?'Company in '+((iv.hq&&iv.hq.v)||ic.hq_country):''].filter(Boolean).join(' · ');
      const details=[l.name+(l.role?' — '+l.role:''),l.company&&!/^unknown$/i.test(l.company)?'Company: '+l.company+(ic.kind?' ('+ic.kind+')':''):'',where,one?'Builds: '+one:'',fund?'Funding: '+fund:'Funding: not found',
        'How we met: '+(LI_SRC[liSrcOf(l)]||LI_SRC.outbound)[0]+' ('+(LI_SRC[liSrcOf(l)]||LI_SRC.outbound)[1]+')'+(x.angle?' \u00b7 first message: '+LI_ANGLE[x.angle]:''),
        'Score '+S.n+'/10 ('+S.sc.score+' of 100'+(S.bonus.length?', '+S.bonus.join(', '):'')+'). Why: '+(S.sc.reasons.slice(0,4).join('; ')||'not enough known yet'),S.sc.gaps.length?'Not known yet: '+S.sc.gaps.slice(0,4).join(', '):'',
        l.source_detail?'How we met: '+l.source_detail:'',out?'Filtered out: '+out:''].filter(Boolean).join('\n');
      const moves=col==='talks'?[['Call booked','Call booked'],['Lost','Lost']]:col==='booked'?[['Won','Won'],['Lost','Lost']]:col==='won'||col==='lost'?[]:[['In talks','In talks'],['Lost','Lost']];
      const tx=t?(ed!=null?ed:t.text):'';const editing=!!(s.lpEdit||{})[l.id]||!!s.lpExp;
      return{id:l.id,...avatar(l.name||'?'),name:l.name||'(no name)',sub:[l.role,l.company&&!/^unknown$/i.test(l.company)?l.company:''].filter(Boolean).join(' · '),
        score:String(S.n),sBg:tn.bg,sFg:tn.fg,one:one||'',hasOne:!!one,oneC:one?'var(--ink-2)':'var(--ink-4)',fund:fund||'',hasFund:!!fund,fundC:fund?'#0a66c2':'var(--ink-4)',fundBg:fund?'#e8f1fb':'var(--n-soft-2)',
        loc:loc?'\ud83d\udccd '+loc:'',hasLoc:!!loc,locC:loc?'var(--ink-2)':'var(--ink-4)',acc,hasAcc:!!acc,
        src:(LI_SRC[liSrcOf(l)]||LI_SRC.outbound)[0],bound:(LI_SRC[liSrcOf(l)]||LI_SRC.outbound)[1],bBg:{Midbound:'#f1ecfb',Inbound:'#e6f6ee',Outbound:'#eef2f7'}[(LI_SRC[liSrcOf(l)]||LI_SRC.outbound)[1]],bFg:{Midbound:'#6941c6',Inbound:'#16723b',Outbound:'#475467'}[(LI_SRC[liSrcOf(l)]||LI_SRC.outbound)[1]],
        hasDraft:col==='talks'&&!!x.draft,draft:x.draft||'',replyLabel:{interested:'Interested',question:'Asked a question',not_now:'Not now',not_interested:'Not interested',other:'Replied'}[x.reply_label]||'Replied',
        copyDraft:e=>{e&&e.stopPropagation&&e.stopPropagation();this.copy(x.draft||'','dr'+l.id,'Reply copied. Paste it in their LinkedIn chat.');if(l.linkedin)window.open(l.linkedin,'_blank','noopener');},
        hasInmail:col==='req'&&!x.acc&&!x.inmail&&S.n>=8&&!this.liNotFit(l)&&x.req&&Date.now()-Date.parse(x.req)>7*864e5,
        inmail:e=>{e&&e.stopPropagation&&e.stopPropagation();const set2=AK.LD.settings.li_bot||{};const t0=set2.inmail||'Hey {first}, sent you a connection request a little while back and wanted to reach out properly.\n\nI\u2019m Reyansh, building SOVE7GN, a growth studio for funded B2B founders. Would love 15 minutes to hear how you\u2019re thinking about GTM at {company}. Open to a quick call?';
          const first=String(l.name||'').split(/\s+/)[0]||'there';this.copy(t0.replace(/\{first\}/g,first).replace(/\{company\}/g,l.company||'your company'),'im'+l.id,'InMail copied. On their profile press Message, paste it, send, then press "InMail sent".');if(l.linkedin)window.open(l.linkedin,'_blank','noopener');},
        inmailSent:e=>{e&&e.stopPropagation&&e.stopPropagation();AK.liStep(l.id,'inmail').then(ok=>ok&&this.toast('InMail saved for '+(l.name||'them')+'.'));},
        hasBrief:col==='booked'&&!!((l.fields||{}).brief||{}).at,hasDossier:isGtmCall(l),openDossier:e=>{e&&e.stopPropagation&&e.stopPropagation();this.openDossier(l.id);},
        details,status,stC:out||(t&&t.status==='failed')?'var(--bad)':waiting?'#0a66c2':'var(--ink-3)',
        hasMsg:!!waiting,msg:tx,msgKind:t?kindLabel(t):'',chars:t&&t.kind==='invite'?tx.length+'/300':'',editing,preview:!editing,
        edit:e=>{e&&e.stopPropagation&&e.stopPropagation();this.setState(z=>({lpEdit:{...(z.lpEdit||{}),[l.id]:true}}));},
        onMsg:e=>{const v=e.target.value;this.setState(z=>({lbtEd:{...(z.lbtEd||{}),[t.id]:v}}));},
        saveMsg:()=>{const v=(this.state.lbtEd||{})[t&&t.id];if(!t||v==null||v===t.text)return;if(t.kind==='invite'&&v.length>300){this.toast('A connection note can be 300 characters at most.',true);return;}AK.lbtSet(t.id,{text:v});},
        approve:e=>{e&&e.stopPropagation&&e.stopPropagation();if(!t||!AK.canEdit())return;const v=(this.state.lbtEd||{})[t.id];const p={status:'ready'};if(v!=null&&v!==t.text&&!(t.kind==='invite'&&v.length>300))p.text=v;
          AK.lbtSet(t.id,p).then(ok=>ok&&this.toast((l.name||'They')+' moved to '+NAME[t.kind==='invite'?'req':t.kind==='dm'||t.kind==='accept'?'dm':'fu'+t.step]+'. The bot sends it in the next few minutes.'));},
        skip:e=>{e&&e.stopPropagation&&e.stopPropagation();if(t&&AK.canEdit())AK.lbtSet(t.id,{status:'skipped'}).then(ok=>ok&&this.toast('Skipped '+(l.name||'them')+'. The bot won’t message them.'));},
        isFailed:!!t&&t.status==='failed',retry:e=>{e&&e.stopPropagation&&e.stopPropagation();if(t)AK.lbtSet(t.id,{status:'ready'});},
        moves:moves.map(([label,stage])=>btn(label,()=>this.liMove(l,stage))),hasMoves:moves.length>0&&!out,stop:e=>{e&&e.stopPropagation&&e.stopPropagation();},
        open:()=>this.openLead(l.id),profile:e=>{e&&e.stopPropagation&&e.stopPropagation();if(l.linkedin)window.open(l.linkedin,'_blank','noopener');},hasProfile:!!l.linkedin,
        op:out?'.6':'1',_n:S.n,_t:Date.parse(x.last||x.req||l.created_at||0)||0,_w:!!waiting};};
    const by=new Map(COLS.map(c=>[c[0],[]]));let outN=0;
    for(const l of pool){const c=colOf(l);const out=c==='found'?this.liNotFit(l):'';if(out){outN++;if(!showOut)continue;}
      const k=card(l,c,out);if(min&&k._n<min&&['found','req','dm'].includes(c))continue;
      if(q&&![l.name,l.company,l.role,k.one,k.fund].join(' ').toLowerCase().includes(q))continue;by.get(c).push(k);}
    const exp=s.lpExp||'';
    const cols=COLS.map(([id,name,hint,dot])=>{const list=by.get(id).sort((a,b)=>(b._w-a._w)||b._n-a._n||b._t-a._t);const n=(s.lpLim||{})[id]||(exp?400:25);
      const good=list.filter(k=>k._w&&k._n>=7),allW=list.filter(k=>k._w);
      const bulkGo=L=>()=>{if(!AK.canEdit())return;const ids=L.map(k=>open.get(k.id).id);AK.lbtSet(ids,{status:'ready'}).then(ok=>ok&&this.toast('Approved '+ids.length+'. They move on now; the bot sends them a few at a time.'));};
      return{id,name,hint,dot,n:String(list.length),cards:list.slice(0,n),more:list.length>n,moreN:String(list.length-n),showMore:()=>this.setState(z=>({lpLim:{...(z.lpLim||{}),[id]:n+50}})),
        hasBulk:good.length>0,bulkLabel:'Approve all 7+ ('+good.length+')',bulk:bulkGo(good),hasAll:allW.length>0,allLabel:'Approve all '+allW.length,all:bulkGo(allW),
        expand:()=>this.setState({lpExp:id}),empty:!list.length};});
    const waiting=T.filter(t=>t.status==='review').length;const seenMin=st.seen?(Date.now()-Date.parse(st.seen))/6e4:null;
    const bot=!st.seen?'Bot not connected yet':st.signed_in===false?'Bot waiting: Chrome is signed out of LinkedIn':seenMin>45?'Bot last checked '+this.since(st.seen)+' (runs while Chrome is open)':'Bot checked '+this.since(st.seen)+(set.paused?' · paused':'');
    const el=()=>document.getElementById('li-board');const step=d=>{const b=el();if(b)b.scrollBy({left:d*300*2,behavior:'smooth'});};
    const ex=cols.find(c=>c.id===exp);
    return{cols,board:!ex,expanded:!!ex,ex:ex||{cards:[]},back:()=>this.setState({lpExp:''}),bot,waiting:String(waiting),hasWaiting:waiting>0,q:s.lpQ||'',onQ:e=>this.setState({lpQ:e.target.value}),
      min:String(s.lpMin||0),onMin:e=>this.setState({lpMin:+e.target.value}),mins:[{v:'0',l:'Any score'},{v:'5',l:'Score 5+'},{v:'7',l:'Score 7+'},{v:'8',l:'Score 8+'}],
      outLabel:showOut?'Hide filtered out ('+outN+')':'Show filtered out ('+outN+')',toggleOut:()=>this.setState({lpOut:!showOut}),hasOut:outN>0,
      total:String(pool.length-(showOut?0:outN)),left:()=>step(-1),right:()=>step(1),pan:e=>this.calPan(e),goSettings:()=>this.go('liOut'),
      scoreHelp:'Score out of 10, from what we know: founder or C-suite, B2B software, 5 to 50 people, funding stage and how recent, founder still selling, no marketing or SDR team, hiring for growth, how much they post, and enough money raised. Unknown things count as zero. Filtered out = not a decision maker, founder or company outside the US, Canada, UK or another tier-1 country, not a tech company, sells to consumers, an agency, over 100 people, or later than Series C.'};}
  /* LinkedIn bot (11 Nov): the Chrome extension's status, the approval queue, the funnel and the messages it sends. */
  liBotVals(){const s=this.state;const set={...(AK.LD.settings.li_bot||{})};const st=AK.LD.settings.li_bot_status||{};const T=AK.LBT.rows;
    const all=this.leadsAll();const byId=new Map(all.map(l=>[l.id,l]));const LI=l=>(l.fields||{}).li||{};
    const L=all.filter(l=>l.source==='LinkedIn'&&String(l.origin_key||'').startsWith('li-person:')&&(l.heat==='Hot'||(set.include_warm&&l.heat==='Warm')));
    const seenMin=st.seen?(Date.now()-Date.parse(st.seen))/6e4:null;
    const health=!AK.LBT.loaded?{t:'Loading the bot’s status…',c:'var(--ink-3)'}:!st.seen?{t:'The Chrome extension hasn’t connected yet. Install it (steps at the bottom), then press Run now in it.',c:'var(--warn)'}:
      st.signed_in===false?{t:'Chrome is signed out of LinkedIn, so the bot is waiting. Sign in to LinkedIn in Chrome.',c:'var(--bad)'}:
      seenMin>45?{t:'The extension last checked in '+this.since(st.seen)+'. It only runs while Chrome is open.',c:'var(--warn)'}:
      {t:'The extension is running. Last check '+this.since(st.seen)+'.',c:'var(--ok)'};
    const save=patch=>{if(!AK.canEdit())return;AK.leadSettingSave('li_bot',{...(AK.LD.settings.li_bot||{}),...patch});};
    const kindLabel=t=>t.kind==='invite'?(t.text?'Request + note':'Request, no note'):t.kind==='dm'?'DM 1':t.kind==='followup'?'Follow-up '+t.step:'InMail';
    const card=t=>{const l=byId.get(t.lead_id)||{};const ed=(s.lbtEd||{})[t.id];const tx=ed!=null?ed:t.text;
      return{...avatar(l.name||'?'),id:t.id,name:l.name||'Someone',sub:[l.role,l.company].filter(Boolean).join(' · '),kind:kindLabel(t),text:tx,
        chars:t.kind==='invite'?tx.length+' / 300':tx.length+' characters',
        onText:e=>{const v=e.target.value;this.setState(x=>({lbtEd:{...(x.lbtEd||{}),[t.id]:v}}));},
        saveText:()=>{const v=(this.state.lbtEd||{})[t.id];if(v==null||v===t.text)return;if(t.kind==='invite'&&v.length>300){this.toast('A connection note can be 300 characters at most.',true);return;}AK.lbtSet(t.id,{text:v});},
        approve:()=>AK.lbtSet(t.id,{status:'ready'}),skip:()=>AK.lbtSet(t.id,{status:'skipped'}),retry:()=>AK.lbtSet(t.id,{status:'ready'}),
        err:t.error||'',when:this.since(t.sent_at||t.created_at),open:()=>{if(l.linkedin)window.open(l.linkedin,'_blank','noopener');}};};
    const review=T.filter(t=>t.status==='review'),failed=T.filter(t=>t.status==='failed'),waiting=T.filter(t=>t.status==='ready'||t.status==='sending');
    const sent=T.filter(t=>t.status==='sent').sort((a,b)=>Date.parse(b.sent_at)-Date.parse(a.sent_at));
    const showN=s.lbtN||20;const m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0);const w0=Date.now()-7*864e5;
    const notesM=sent.filter(t=>t.kind==='invite'&&t.text&&Date.parse(t.sent_at)>=m0.getTime()).length,reqW=sent.filter(t=>t.kind==='invite'&&Date.parse(t.sent_at)>=w0).length;
    const cnt=f=>String(L.filter(f).length);const reqN=L.filter(l=>LI(l).req).length,accN=L.filter(l=>LI(l).req&&LI(l).acc).length;
    const funnel=[{label:'Good fits who engaged',v:String(L.length),d:'Hot leads from likes and comments'},
      {label:'Request sent',v:String(reqN),d:notesM+' / '+(set.notes_month||250)+' notes this month · '+reqW+' this week'},
      {label:'Accepted',v:String(accN),d:reqN?Math.round(accN/reqN*100)+'% of requests':'–'},
      {label:'In follow-ups',v:cnt(l=>LI(l).dm&&!LI(l).stop&&!LI(l).replied),d:'DM 1 sent, no reply yet'},
      {label:'Replied',v:cnt(l=>LI(l).replied),d:'Follow-ups stop on any reply'},
      {label:'Call booked',v:cnt(l=>/^call booked$/i.test(l.stage)),d:'From the cal.com link'},
      {label:'No reply after all follow-ups',v:cnt(l=>LI(l).stop==='no reply'),d:'Moved to Cold lead'}];
    const tpl=s.lbtTpl||{};const tv=k=>tpl[k]!=null?tpl[k]:/^fu\d$/.test(k)?((set.fu||[])[+k.slice(2)-1]||''):(set[k]||'');
    const tplRow=(k,label,hint)=>({k,label,hint,v:tv(k),on:e=>{const v=e.target.value;this.setState(x=>({lbtTpl:{...(x.lbtTpl||{}),[k]:v}}));},
      save:()=>{const v=(this.state.lbtTpl||{})[k];if(v==null)return;if(/^fu\d$/.test(k)){const fu=[...(set.fu||[])];fu[+k.slice(2)-1]=v;save({fu});}else save({[k]:v});}});
    const tpls=[tplRow('note','Connection note','Up to 300 characters. {first} = first name, {hook} = one line the bot writes about them, {where} = LinkedIn (or X and LinkedIn).'),
      tplRow('dm1','DM 1, after they accept','Goes out only if they haven’t replied to the note. You can use {first} and {company}.'),
      ...[1,2,3,4,5,6,7].map(n=>tplRow('fu'+n,'Follow-up '+n,n===1?'One a day after DM 1, until they reply.':''))];
    const mode=set.mode==='auto'?'auto':'review';const H=set.hours||{};
    const errOn=!!(st.last_error&&st.last_error_at&&Date.now()-Date.parse(st.last_error_at)<864e5);
    // Message scripts (11 Nov): the first line depends on how we met; the rest is angle A, B or C, rotated so each gets an even test.
    const OPN={liked:"saw you engage with my recent post & thought I'd reach out.",commented:'thanks for the comment on my recent post, really liked your take.',viewed:"noticed you checked out my profile, so thought I'd say hi.",inbound:'thanks for the connection request!',tagged:'hope you liked the post I tagged you in.',niche:"saw your comment on {post_author}'s post and liked your take.",outbound:"thanks for connecting!"};
    const ANG={advice:set.dm1?String(set.dm1).replace(/^Hey \{first\},[^\n]*\n\n/,''):"I'm Reyansh. Been building startups for the past couple of years and was also featured on Shark Tank.\n\nCurrently building something of my own in GTM space and would love to hear your thoughts and get some advice. Open to a 15-minute call sometime this week?",
      pitch:"I'm Reyansh, I run SOVE7GN. We're a growth studio for funded B2B founders: we run your founder content on LinkedIn and X plus warm outreach, and turn it into booked sales calls.\n\nWould a quick 15-minute call this week make sense to see if it's a fit for {company}?",
      freebie:"I'm Reyansh. I had a look at {company} and put together 3 small ideas that could bring in more inbound (content angles and who to reach).\n\nWant me to send them over? Happy to walk you through them on a quick call too."};
    const so=s.lbtScr||{};const opens={...OPN,...(set.openers||{})},angs={...ANG,...(set.angles||{})},on=Array.isArray(set.angles_on)?set.angles_on:['advice','pitch','freebie'];
    const scrRow=(grp,k,label,hint)=>{const cur=grp==='o'?opens[k]:angs[k];const ed=so[grp+k];return{label,hint,v:ed!=null?ed:cur,on:e=>{const v=e.target.value;this.setState(z=>({lbtScr:{...(z.lbtScr||{}),[grp+k]:v}}));},
      save:()=>{const v=(this.state.lbtScr||{})[grp+k];if(v==null||v===cur)return;save(grp==='o'?{openers:{...(set.openers||{}),[k]:v}}:{angles:{...(set.angles||{}),[k]:v}});}};};
    const openRows=Object.keys(OPN).map(k=>scrRow('o',k,(LI_SRC[k]||[k])[0]+' ('+(LI_SRC[k]||['',''])[1]+')',''));
    const angRows=Object.keys(ANG).map(k=>({...scrRow('a',k,LI_ANGLE[k],k==='advice'?'Your original message. Works best so far.':''),isOn:on.includes(k),toggle:()=>{const n=on.includes(k)?on.filter(x=>x!==k):[...on,k];if(!n.length){this.toast('Keep at least one angle on.',true);return;}save({angles_on:n});},onLabel:on.includes(k)?'In the test':'Paused'}));
    const LL=this.leadsAll().filter(l=>l.source==='LinkedIn');const LIx=l=>(l.fields||{}).li||{};const booked=l=>/^(call booked|proposal sent|won)$/i.test(l.stage);const pct=(a,b)=>b?Math.round(a/b*100)+'%':'\u2013';
    const statRow=(label,L)=>{const sent=L.filter(l=>LIx(l).dm).length,rep=L.filter(l=>LIx(l).dm&&LIx(l).replied).length,bk=L.filter(l=>LIx(l).dm&&booked(l)).length;return{label,sent:String(sent),rep:String(rep),repP:pct(rep,sent),bk:String(bk),bkP:pct(bk,sent)};};
    const byAngle=Object.keys(ANG).map(k=>statRow(LI_ANGLE[k],LL.filter(l=>LIx(l).angle===k)));byAngle.push(statRow('Before the test (sent by hand)',LL.filter(l=>LIx(l).dm&&!LIx(l).angle)));
    const byBound=['Midbound','Inbound','Outbound'].map(b=>{const L=LL.filter(l=>(LI_SRC[liSrcOf(l)]||LI_SRC.outbound)[1]===b);const req=L.filter(l=>LIx(l).req).length,acc=L.filter(l=>LIx(l).req&&LIx(l).acc).length;return{...statRow(b,L),req:String(req),accP:pct(acc,req)};});
    const bySrc=Object.keys(LI_SRC).map(k=>statRow(LI_SRC[k][0],LL.filter(l=>liSrcOf(l)===k))).filter(r=>r.sent!=='0');
    return{scrOpen:openRows,scrAng:angRows,byAngle,byBound,bySrc,hasBySrc:bySrc.length>0,
      health:health.t,healthC:health.c,hasErr:errOn,lastErr:errOn?'Last problem ('+this.since(st.last_error_at)+'): '+(/frame with id|error page|ERR_/i.test(st.last_error||'')?'the LinkedIn tab showed an error page, so the bot reloaded it.':/not signed in|login|authwall/i.test(st.last_error||'')?'LinkedIn looked signed out in Chrome. Sign in again.':clip(String(st.last_error||''),140)):'',
      paused:!!set.paused,running:!set.paused,modeReview:()=>save({mode:'review'}),modeAuto:()=>save({mode:'auto'}),pause:()=>save({paused:true}),resume:()=>save({paused:false}),
      revBg:mode==='review'?'var(--ink)':'transparent',revFg:mode==='review'?'#fff':'var(--ink-2)',autoBg:mode==='auto'?'var(--ink)':'transparent',autoFg:mode==='auto'?'#fff':'var(--ink-2)',
      modeText:(set.paused?'Paused: nothing is sent. ':'')+(mode==='review'?'Review mode: nothing goes out until you press Approve.':'Auto mode: new messages are approved on their own and sent while Chrome is open.'),
      hoursText:(set.rush_until&&Date.parse(set.rush_until)>Date.now()?'Fast mode until '+new Date(set.rush_until).toLocaleString('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit'})+': approved items go out as soon as possible, not at their local morning. ':'')+((H.from!=null?H.from:10)===0&&(H.to!=null?H.to:24)===24?'Sends any time of day':'Sends between '+(H.from!=null?H.from:10)+':00 and '+(H.to!=null?H.to:24)+':00 IST')+', a few at a time with random gaps. '+waiting.length+' approved and waiting to send.',
      funnel,review:review.slice(0,showN).map(card),reviewN:String(review.length),hasReview:review.length>0,noReview:!review.length,
      moreReview:review.length>showN,showMore:()=>this.setState({lbtN:showN+40}),
      approveAll:()=>{if(!AK.canEdit())return;const n=review.length;AK.lbtSet(review.map(t=>t.id),{status:'ready'}).then(ok=>ok&&this.toast('Approved '+n+'. The extension sends them a few at a time.'));},
      failed:failed.map(card),hasFailed:failed.length>0,failedN:String(failed.length),sent:sent.slice(0,8).map(card),hasSent:sent.length>0,
      tpls,warmLabel:set.include_warm?'Warm leads too: on':'Warm leads too: off',toggleWarm:()=>save({include_warm:!set.include_warm}),
      writing:AK.LBT.running,idle:!AK.LBT.running,write:()=>{if(AK.canEdit())AK.lbtRun();},
      noReviewText:AK.LBT.loaded?'Nothing waiting for your approval.':'Loading…'};}
  liOutVals(){const L=this.leadsAll();const t0=new Date();t0.setHours(0,0,0,0);const today=l=>new Date(l.stage_at||0)>=t0;
    const contacted=L.filter(l=>/^contacted$/i.test(l.stage)&&today(l)).length;const fresh=L.filter(l=>/^new$/i.test(l.stage)).length;
    const m0=new Date();m0.setDate(1);m0.setHours(0,0,0,0);const w0=AK.weekStart(0);const at=(x,f)=>x&&new Date(x)>=f;
    const LIs=L.map(l=>(l.fields||{}).li||{});const cnt=(k,f)=>LIs.filter(x=>at(x[k],f)).length;
    const reqM=cnt('req',m0),noteM=LIs.filter(x=>x.note&&at(x.req,m0)).length,accM=cnt('acc',m0),dmM=cnt('dm',m0),imM=cnt('inmail',m0),reqW=cnt('req',w0);
    const reqAll=LIs.filter(x=>x.req).length,accAll=LIs.filter(x=>x.req&&x.acc).length;
    const track=[{label:'Requests sent this month',v:String(reqM),d:reqW+' this week (LinkedIn caps about 100 to 200 a week)'},
      {label:'With a note',v:noteM+' / 250',d:'Premium: 250 personalised requests a month'},
      {label:'Accepted this month',v:String(accM),d:'Acceptance rate (all time): '+(reqAll?Math.round(accAll/reqAll*100)+'%':'\u2013')+' of '+reqAll+' requests'},
      {label:'DMed this month',v:String(dmM),d:'Connections we messaged'},
      {label:'InMails this month',v:imM+' / 30',d:'Premium: 30 InMail credits a month'}];
    return{track,rows:[{label:'Messages to people you\u2019re connected with',v:contacted+' today',lim:'Keep it under 50 a day'},
      {label:'Connection requests',v:reqW+' this week',lim:'About 20 a day, 100 to 200 a week'},
      {label:'Requests with a note',v:noteM+' this month',lim:'250 a month on your Premium plan'}],
      summary:fresh+' people in New: connected or engaged, not messaged yet. Message them, then move them to Contacted.'};}
  gtmNowVals(){const s=this.state;const A=this.gtmAll().filter(x=>!x.c.closed&&(s.gx||!['excluded','disqualified'].includes(x.c.score.band)));
    const ranked=A.filter(x=>x.c.radar.score>0).sort((a,b)=>b.c.radar.score-a.c.radar.score||b.c.score.score-a.c.score.score);const lim=s.gmore?ranked.length:24;
    const me=((CFG.accounts||[])[0]||{}).name||'';
    const items=ranked.slice(0,lim).map(x=>{const {l,c}=x;const m=GTM.messages(l,c,me);const k='gnow'+l.id;const cb=this.copyBtn(k,'Copy opener');
      return{...this.gtmId(x),level:this.gtmLevelP(c.radar),icp:this.gtmScoreP(c.score),rel:this.gtmRelP(c),action:this.gtmRec(x),angle:c.radar.angle.label,
        why:c.radar.why.map(w=>({label:w.label,text:w.text,when:w.when?(w.derived?'detected ':String(w.when)>new Date().toISOString().slice(0,10)?'expected ':'happened ')+w.when:'date not known',seen:w.seen?'detected '+w.seen:'',kindP:w.kind==='fact'?pill('Verified','ok'):pill('Best guess','warn'),hasSrc:!!w.src,openSrc:()=>open(w.src),pts:'+'+w.pts})),
        copyLabel:cb.label,cbg:cb.bg,cfg:cb.fg,csh:cb.sh,copy:stop(()=>this.copy(m.list[1].text,k,'Opener copied. Send it yourself on LinkedIn.')),start:stop(()=>this.openLead(l.id,'out'))};});
    const lvl=L=>A.filter(x=>x.c.radar.level===L).length;
    return{items,hasItems:items.length>0,noItems:!items.length,loading:!AK.leadsState().loaded,kpis:[{label:'Reach out now',v:String(lvl('HIGH')),d:'Fresh news this week'},{label:'Worth a touch',v:String(lvl('MEDIUM')),d:'Some news lately'},{label:'No fresh news',v:String(lvl('LOW')),d:'Nothing new lately'}],
      hasMore:ranked.length>lim,more:()=>this.setState({gmore:true}),count:'Showing '+items.length+' of '+ranked.length+' with a buying signal'};}
  /* ICP posts (9 Nov): their LinkedIn posts we comment on to start a conversation and get a connection. The daily LinkedIn
     job finds posts by ICP leads and drafts a comment; you edit and approve; the 30-minute job posts approved ones (10 a day). */
  // Today's 10 founder posts to comment on (li-engage job), newest day first; done and skipped ones drop to the bottom.
  lisVals(){const s=this.state;const R=AK.LIS.rows;const day=R.length?R[0].day:'';const today=R.filter(r=>r.day===day);
    const ord={new:0,done:1,skipped:2};const list=today.slice().sort((a,b)=>ord[a.status]-ord[b.status]);const done=today.filter(r=>r.status==='done').length;
    const cards=list.map(r=>{const k='lis'+r.url;const cb=this.copyBtn(k,'Copy comment');const ed=s.lisEd[r.url];
      return{...avatar(r.author||'?'),author:r.author||'Founder',headline:r.headline||r.company||'',when:r.posted_at?this.since(r.posted_at):'',post:clip(String(r.post_text||'').replace(/\s+/g,' '),320),
        comment:ed!=null?ed:r.comment,onComment:e=>{const v=e.target.value;this.setState(st=>({lisEd:{...st.lisEd,[r.url]:v}}));},
        saveComment:()=>{const v=this.state.lisEd[r.url];if(v!=null&&v!==r.comment)AK.lisSet(r.url,{comment:v});},
        isNew:r.status==='new',isDone:r.status==='done',isSkipped:r.status==='skipped',op:r.status==='new'?'1':'.55',
        copy:()=>{const t=this.state.lisEd[r.url]!=null?this.state.lisEd[r.url]:r.comment;this.copy(t,k,'Comment copied. Paste it under their post.');window.open(r.url,'_blank','noopener');},
        cLabel:cb.label==='Copy comment'?'Copy comment and open post':cb.label,cbg:cb.bg,cfg:cb.fg,csh:cb.sh,
        done:()=>AK.lisSet(r.url,{status:'done'}),skip:()=>AK.lisSet(r.url,{status:'skipped'}),undo:()=>AK.lisSet(r.url,{status:'new'}),
        openAuthor:()=>{if(r.author_url)window.open(r.author_url,'_blank','noopener');},hasAuthor:!!r.author_url};});
    return{cards,has:cards.length>0,none:!cards.length,done:String(done),total:String(today.length),dayLabel:day?(day===new Date(Date.now()+330*6e4).toISOString().slice(0,10)?'today':'from '+day):'',
      running:AK.LIS.running,idle:!AK.LIS.running,run:()=>{if(AK.canEdit())AK.lisRun();},
      noneText:AK.LIS.loaded?'No posts yet. They arrive every morning at 7:45 IST, or press Find posts now.':'Loading…'};}
  gtmEngageVals(){const s=this.state;const A=this.gtmAll();const cfg=AK.gtm.engageCfg();const today=AK.gtm.commentsToday();
    const all=[];for(const x of A)for(const c of GTM.contentOf(x.l))all.push({x,c});
    const n=st=>all.filter(i=>i.c.status===st).length;const tab=['new','approved','posted','skipped'].includes(s.geTab)?s.geTab:'new';
    const tabs=[['new','To review'],['approved','Approved'],['posted','Posted'],['skipped','Skipped']].map(([k,label])=>{const on=k===tab;
      return{label,count:String(n(k)),go:()=>this.setState({geTab:k,geMore:false}),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};});
    const q=String(s.geQ||'').trim().toLowerCase();
    const list=all.filter(i=>i.c.status===tab&&(!q||[i.x.l.name,i.x.l.company,i.c.text,i.c.draft].join(' ').toLowerCase().includes(q)))
      .sort((a,b)=>tab==='posted'?new Date(b.c.postedAt||0)-new Date(a.c.postedAt||0):(b.x.c.score.score-a.x.c.score.score)||String(b.c.at||b.c.found).localeCompare(String(a.c.at||a.c.found)));
    const lim=s.geMore?list.length:40;const full=today>=cfg.cap;
    const draftOf=i=>s.geDraft[i.c.id]!=null?s.geDraft[i.c.id]:(i.c.draft||'');
    const setDraft=i=>e=>{const v=e.target.value;this.setState(z=>({geDraft:{...z.geDraft,[i.c.id]:v}}));};
    const dropDraft=pid=>this.setState(z=>{const m={...z.geDraft};delete m[pid];return{geDraft:m};});
    const items=list.slice(0,lim).map(i=>{const {x,c}=i;const d=draftOf(i);const k='ge'+c.id;const cb=this.copyBtn(k,'Copy & open post');
      return{...this.gtmId(x),icp:this.gtmScoreP(x.c.score),rel:this.gtmRelP(x.c),conn:x.c.conn==='connected'?'Connected':x.c.conn==='pending'?'Invite pending':'Not connected yet',
        when:c.at?'Posted '+c.at:'Found '+(c.found||''),text:c.text||'(no excerpt saved)',hasUrl:!!c.url,openPost:()=>open(c.url),
        draft:d,setDraft:setDraft(i),n:d.length+' chars',
        saveDraft:async()=>{if(s.geDraft[c.id]==null)return;if(String(this.state.geDraft[c.id])===String(c.draft||'')){dropDraft(c.id);return;}if(await AK.gtm.postSet(x.l.id,c.id,{draft:this.state.geDraft[c.id]}))dropDraft(c.id);},
        isNew:c.status==='new',isApproved:c.status==='approved',isPosted:c.status==='posted',isSkipped:c.status==='skipped',canPost:c.status!=='posted'&&c.status!=='skipped',
        postedTxt:c.postedAt?'Commented '+this.since(c.postedAt)+(c.postedBy?' by '+String(c.postedBy).split('@')[0]:''):'',
        approve:async()=>{const dd=this.state.geDraft[c.id];if(await AK.gtm.postSet(x.l.id,c.id,{status:'approved',...(dd!=null?{draft:dd}:{})})){dropDraft(c.id);this.toast(cfg.auto?'Approved. The 30-minute LinkedIn check will post it'+(full?' tomorrow (today is full)':'')+'.':'Approved. Post it yourself, then Mark posted.');}},
        unapprove:()=>AK.gtm.postSet(x.l.id,c.id,{status:'new'}),skip:()=>AK.gtm.postSet(x.l.id,c.id,{status:'skipped'}),restore:()=>AK.gtm.postSet(x.l.id,c.id,{status:'new'}),
        copy:()=>{this.copy(d,k,'Comment copied. Opening the post: paste it there, then Mark posted.');if(c.url)open(c.url);},copyLabel:cb.label,cbg:cb.bg,cfg:cb.fg,csh:cb.sh,
        posted:async()=>{if(await AK.gtm.postPosted(x.l.id,c.id,d)){dropDraft(c.id);this.toast('Logged. If they reply to your comment, log it on the lead and they move to Midbound.');}},
        open:()=>this.openLead(x.l.id,'out')};});
    // Add a post by hand: any lead, ICP fits first.
    const fa=s.geAdd;const setA=k=>e=>{const v=e.target.value;this.setState(z=>({geAdd:{...z.geAdd,[k]:v}}));};
    const leadOpts=[{v:'',l:'Pick the lead who posted'},...A.filter(x=>x.l.source!=='Instagram').slice().sort((a,b)=>b.c.score.score-a.c.score.score||String(a.l.name).localeCompare(String(b.l.name)))
      .map(x=>({v:x.l.id,l:(x.l.name||'(no name)')+(x.l.company?' · '+x.l.company:'')+' · '+(x.c.score.icp?'ICP '+x.c.score.score:x.c.score.label)}))];
    const add=async()=>{const f=this.state.geAdd;if(!f.lead){this.toast('Pick the lead who wrote the post.',null,true);return;}
      if(await AK.gtm.postAdd(f.lead,{url:f.url,at:f.at,text:f.text,draft:f.draft})){this.setState({geAdd:{lead:'',url:'',at:'',text:'',draft:''},geTab:'new'});this.toast('Added to To review.');}};
    const toggleAuto=()=>AK.leadSettingSave('li_engage',{...cfg,auto:!cfg.auto});
    const setCap=e=>{const v=Math.round(Number(e.target.value));if(!(v>=0&&v<=25)){this.toast('The daily limit must be between 0 and 25.',null,true);return;}AK.leadSettingSave('li_engage',{...cfg,cap:v});};
    return{tabs,items,hasItems:items.length>0,noItems:!items.length,loading:!AK.leadsState().loaded,
      empty:tab==='new'?'Nothing to review. The daily 9 am LinkedIn run finds recent posts by your ICP leads and drafts a comment for each; you can also add one below.':tab==='approved'?'No approved comments waiting to go out.':tab==='posted'?'No comments posted yet.':'Nothing skipped.',
      today:String(today),cap:String(cfg.cap),capW:Math.min(100,cfg.cap?today/cfg.cap*100:100)+'%',capBg:full?'var(--bad)':'var(--out)',full,
      budget:full?'Daily limit reached. Approved comments wait until tomorrow.':(cfg.cap-today)+' left today',
      auto:cfg.auto,autoLabel:cfg.auto?'Auto-post approved: On':'Auto-post approved: Off',autoBg:cfg.auto?'var(--ok-soft)':'var(--n-soft)',autoFg:cfg.auto?'var(--ok-ink)':'var(--ink-3)',toggleAuto,setCap,
      q:s.geQ,onQ:e=>this.setState({geQ:e.target.value}),hasMore:list.length>lim,more:()=>this.setState({geMore:true}),count:'Showing '+items.length+' of '+list.length,
      fa,leadOpts,setLead:setA('lead'),setUrl:setA('url'),setAt:setA('at'),setText:setA('text'),setDraftNew:setA('draft'),add};}
  // What to do next with someone, from where the relationship stands.
  gtmRec(x){const {l,c}=x;const a=c.radar.angle.label;
    if(c.status==='Meeting booked')return 'Prep the call around “'+a+'”.';
    if(c.rel==='midbound'||c.rel==='inbound'){if(c.lastAny&&c.lastAny.dir==='in')return 'Reply today, then propose a 15-minute call.';return c.engaged?'Book the call: suggest two times.':'Qualify them: ask what they’re working on.';}
    if(!c.contacted)return c.conn==='connected'?'Send the opener today.':c.conn==='pending'?'Invite pending: send the opener once they accept.':'Send a connection request (no note), then the opener.';
    return c.fuN>=2?'Two follow-ups sent: park in Nurture until a new signal.':'Send follow-up '+(c.fuN+1)+', tied to: '+(c.radar.why[0]?c.radar.why[0].text:a)+'.';}
  gtmDashVals(){const A=this.gtmAll();const E=this.state.entered;const pct=(a,b)=>b?Math.round(a/b*100)+'%':'–';
    const ob=A.filter(x=>x.c.rel==='outbound'||x.c.rel==='midbound'||x.c.rel==='new');const sent=ob.filter(x=>x.c.contacted);const resp=sent.filter(x=>x.c.engaged);const pos=sent.filter(x=>x.c.positive);
    const meet=A.filter(x=>['Meeting booked','Qualified','Proposal','Won'].includes(x.c.status)),qual=A.filter(x=>['Qualified','Proposal','Won'].includes(x.c.status)),open=A.filter(x=>!x.c.closed);
    const kpis=[{label:'New ICP connections',v:String(A.filter(x=>x.c.rel==='new'&&x.c.score.icp).length),d:A.filter(x=>x.c.rel==='new').length+' new connections in all'},
      {label:'Outbound sent',v:String(sent.length),d:ob.length+' outbound prospects'},{label:'Midbound',v:String(A.filter(x=>x.c.rel==='midbound'&&!x.c.closed).length),d:'Replied after we reached out'},
      {label:'Inbound',v:String(A.filter(x=>x.c.rel==='inbound'&&!x.c.closed).length),d:'Came to us'},{label:'Response rate',v:pct(resp.length,sent.length),d:resp.length+' of '+sent.length+' contacted replied'},
      {label:'Positive rate',v:pct(pos.length,sent.length),d:pos.length+' interested or booked'},{label:'Meetings',v:String(meet.length),d:'Booked or further'},
      {label:'Qualified opportunities',v:String(qual.length),d:'Qualified, proposal or won'},{label:'Pipeline value',v:this.moneySum(open.map(x=>x.l)),d:open.length+' open leads'}].map(k=>({...k,tone:'var(--ink-3)'}));
    const inS=(L,st)=>L.filter(x=>st.includes(x.c.status)).length;// outbound only, so each step is a subset of the one before
    const steps=[['Prospects',ob.length],['Contacted',sent.length],['Responded',resp.length],['Meetings',inS(resp,['Meeting booked','Qualified','Proposal','Won'])],['Qualified',inS(resp,['Qualified','Proposal','Won'])],['Won',inS(resp,['Won'])]];const mx=Math.max(1,...steps.map(z=>z[1]));
    const funnel=steps.map(([name,n],i)=>({name,n:String(n),w:E?Math.max(n?2:0,n/mx*100)+'%':'0%',conv:i?pct(n,steps[i-1][1])+' of previous':''}));
    const tbl=(title,help,rows,first)=>({title,help,first,rows:rows.map(r=>({name:r.name,cells:[r.n,r.sent,r.respRate,r.posRate,r.meet,r.won].map(v=>({v:String(v)}))})),has:rows.length>0,none:!rows.length});
    const bl=x=>GTM.BAND[x.c.score.band].label;
    const conv=[tbl('By source','Acquisition source, separate from status.',GTM.groupBy(A,x=>x.c.acq,GTM.ACQ),'Source'),
      tbl('By ICP band','Does a higher ICP score convert better?',GTM.groupBy(A,bl,Object.values(GTM.BAND).map(b=>b.label)),'ICP band'),
      tbl('By status','Where leads sit now.',GTM.groupBy(A,x=>x.c.status,GTM.STATUSES),'Status')];
    const C=sent;
    const perf=[tbl('By template','Drafts copied and marked sent here are logged by template. Earlier outreach is grouped by what was sent.',GTM.groupBy(C,x=>GTM.templateOf(x.l,x.c)),'Template'),
      tbl('By angle','The angle logged with each message.',GTM.groupBy(C,x=>GTM.angleOf(x.c)),'Angle'),tbl('By industry','From the intelligence card.',GTM.groupBy(C,x=>x.industry||'Unknown'),'Industry'),
      tbl('Founder vs C-suite','From their title.',GTM.groupBy(C,x=>x.persona),'Who'),tbl('By funding stage','Latest round on the card (or read off the CRM notes).',GTM.groupBy(C,x=>x.ev.round?String(x.ev.round.v):'Unknown',['Pre-seed','Seed','Series A','Series B','Series C','Series D+']),'Stage')];
    const unv=A.filter(x=>x.c.score.band==='unverified').length;const dup=AK.gtm.dupes().length;
    const notes=[unv?unv+' leads need research before they can be scored (open one and fill its Intel tab).':'',dup?dup+' possible duplicates: see LinkedIn views → Possible duplicates.':'',
      'Response and positive rates count outbound leads we contacted. A reply counts when it’s logged on the lead, or when the outreach job moved them to In talks or later.'].filter(Boolean).map(t=>({t}));
    return{kpis,funnel,conv,perf,heads:['Leads','Contacted','Response','Positive','Meetings','Won'].map(label=>({label})),notes,loading:!AK.leadsState().loaded};}
  // The ICP, edited on Setup. One definition: scoring, views and drafts all read it.
  gtmSetupVals(){const s=this.state;const cfg=AK.gtm.cfg();const ed=s.icpEd||null;const v=ed||cfg;const set=(k,val)=>this.setState(z=>({icpEd:{...(z.icpEd||JSON.parse(JSON.stringify(cfg))),[k]:val}}));
    const list=x=>Array.isArray(x)?x.join(', '):String(x||'');
    const txt=[['summary','Who we sell to, in one paragraph',true],['models','Business models that fit (comma separated)'],['industries','Industry keywords that fit'],['stages','Funding stages that fit'],['accelerators','Accelerators that are a strong plus'],
      ['titles','Decision-maker titles'],['references','Reference profiles (lookalikes)']].map(([k,label,area])=>({k,label,isArea:!!area,notArea:!area,val:list(v[k]),set:e=>set(k,e.target.value)}));
    const nums=[['empMin','Min employees'],['empMax','Max employees'],['recencyMonths','Raised within (months)'],['budgetMonth','Budget they must afford ($ / month)'],['minRaise','Raised at least ($) to afford it']].map(([k,label])=>({k,label,val:String(v[k]??''),set:e=>set(k,e.target.value)}));
    const W=v.weights||{};const wsum=GTM.DIMS.reduce((a,[k])=>a+(Number(W[k])||0),0);
    const weights=GTM.DIMS.map(([k,label])=>({k,label,val:String(W[k]??''),set:e=>{const val=e.target.value;this.setState(z=>{const b=z.icpEd||JSON.parse(JSON.stringify(cfg));return{icpEd:{...b,weights:{...b.weights,[k]:val}}};});}}));
    const B=v.bands||{};const bands=[['high','High priority from'],['strong','Strong fit from'],['research','Research from']].map(([k,label])=>({k,label,val:String(B[k]??''),set:e=>{const val=e.target.value;this.setState(z=>{const b=z.icpEd||JSON.parse(JSON.stringify(cfg));return{icpEd:{...b,bands:{...b.bands,[k]:val}}};});}}));
    const save=async()=>{const e=this.state.icpEd;if(!e)return;const arr=x=>Array.isArray(x)?x:String(x||'').split(/[,\n]/).map(y=>y.trim()).filter(Boolean);const n=x=>Number(x);
      const out={summary:String(e.summary||'').trim(),models:arr(e.models),industries:arr(e.industries).map(x=>x.toLowerCase()),stages:arr(e.stages),accelerators:arr(e.accelerators),titles:arr(e.titles).map(x=>x.toLowerCase()),references:arr(e.references),
        empMin:n(e.empMin),empMax:n(e.empMax),recencyMonths:n(e.recencyMonths),budgetMonth:n(e.budgetMonth),minRaise:n(e.minRaise),
        weights:Object.fromEntries(GTM.DIMS.map(([k])=>[k,n((e.weights||{})[k])])),bands:{high:n((e.bands||{}).high),strong:n((e.bands||{}).strong),research:n((e.bands||{}).research)}};
      const bad=[];['empMin','empMax','recencyMonths','budgetMonth','minRaise'].forEach(k=>{if(!(isFinite(out[k])&&out[k]>=0))bad.push(k);});
      if(out.empMin>out.empMax)bad.push('min employees above max');const ws=Object.values(out.weights).reduce((a,b)=>a+b,0);
      if(Object.values(out.weights).some(w=>!(isFinite(w)&&w>=0)))bad.push('weights must be numbers');else if(ws!==100)bad.push('weights add up to '+ws+', not 100');
      if(!(out.bands.high>out.bands.strong&&out.bands.strong>out.bands.research&&out.bands.research>0&&out.bands.high<=100))bad.push('bands must go high > strong > research > 0');
      if(!out.models.length||!out.stages.length)bad.push('list at least one business model and one funding stage');
      if(bad.length){this.toast('Not saved: '+bad.join('; ')+'.',null,true);return;}
      if(await AK.leadSettingSave('icp',out)){this.setState({icpEd:null});this.toast('ICP saved. Every score is updated.');}};
    const missing=['Qualified','Nurture'].filter(st=>!AK.gtm.stageFor(st));
    const addStages=async()=>{const ST=this.leadSet('stages').slice();for(const m of missing){const after=m==='Qualified'?ST.findIndex(x=>GTM.statusOf(x.name,x.kind)==='Meeting booked'):ST.findIndex(x=>x.kind==='lost')-1;
      ST.splice(after>=0?after+1:ST.length,0,{name:m,color:m==='Qualified'?'var(--ok)':'oklch(0.62 0.11 245)',kind:'open'});}
      if(await AK.leadSettingSave('stages',ST))this.toast('Added '+missing.join(' and ')+' to your stages.');};
    return{txt,nums,weights,bands,wsum:String(wsum),wOk:wsum===100,wBad:wsum!==100,dirty:!!ed,clean:!ed,save,cancel:()=>this.setState({icpEd:null}),
      reset:async()=>{if(await AK.leadSettingSave('icp',{}))this.setState({icpEd:null});this.toast('ICP back to the default from the spec.');},
      dims:GTM.DIMS.map(([k,label])=>({label,w:String(cfg.weights[k])})),hasMissing:missing.length>0,missing:missing.join(' and '),addStages,
      status:'Stages map to statuses: '+this.leadSet('stages').map(x=>x.name+' → '+GTM.statusOf(x.name,x.kind)).join(', ')+'.'};}
  // The panel's Intel and Outreach tabs for one lead.
  setLed(k,v){this.setState(z=>({led:{...z.led,[k]:v}}));}
  dropLed(keys){this.setState(z=>{const m={...z.led};keys.forEach(k=>delete m[k]);return{led:m};});}
  async gtmSaveIntel(l,k,force){const s=this.state.led;const cur=(GTM.gtmOf(l).intel||{})[k]||{};const vK='__gi:'+k+':v',sK='__gi:'+k+':s';
    const v=force&&'v' in force?force.v:(s[vK]!=null?s[vK]:(cur.v??''));const src=s[sK]!=null?s[sK]:(cur.src||'');
    if(String(v)===String(cur.v??'')&&String(src)===String(cur.src||''))return this.dropLed([vK,sK]);
    const err=GTM.validateIntel(k,v,src);if(err){this.toast(err,null,true);return;}
    if(await AK.gtm.intel(l.id,k,{v,src}))this.dropLed([vK,sK]);}
  gtmPanel(l){const x=this.gtmOne(l.id);if(!x)return{ok:false};const s=this.state;const {c}=x;const G=GTM.gtmOf(l);const I=G.intel||{};const E=x.ev;const B=k=>s.led[k];
    const groups=GTM.INTEL.map(g=>({label:g.label,rows:g.fields.map(([k,label,type,opts])=>{const cur=I[k]||{};const ev=E[k];const vK='__gi:'+k+':v',sK='__gi:'+k+':s';
      const v=B(vK)!=null?B(vK):(cur.v??'');const src=B(sK)!=null?B(sK):(cur.src||'');const der=!String(cur.v??'').trim()&&ev?(ev.why||'CRM')+': '+(k==='amount'||k==='total'?GTM.fmtMoney(GTM.parseMoney(ev.v)):ev.v):'';
      const kind=String(cur.v??'').trim()?(GTM.isUrl(cur.src)?'fact':'manual'):ev?ev.kind:'';
      return{label,isSel:type==='select',isArea:type==='area',isText:type!=='select'&&type!=='area',opts:[{v:'',l:'Unknown'},...(opts||[]).map(o=>({v:o,l:o}))],val:String(v),
        ph:type==='money'?'Unknown (e.g. $4M)':type==='date'?'Unknown (e.g. 2026-09)':'Unknown',src,kindP:this.gtmKindP(kind),hasDer:!!der,der,at:cur.at?'checked '+cur.at:'',hasSrcLink:GTM.isUrl(cur.src),openSrc:()=>open(cur.src),
        set:e=>this.setLed(vK,e.target.value),setSrc:e=>this.setLed(sK,e.target.value),save:()=>this.gtmSaveIntel(l,k),
        pick:e=>{const val=e.target.value;this.setLed(vK,val);this.gtmSaveIntel(l,k,{v:val});}};})}));
    const ov=(G.icp&&G.icp.ov)||{};
    const dims=c.score.dims.map(d=>{const oK='__go:'+d.key;const cur=ov[d.key]&&ov[d.key].pts!=null?String(ov[d.key].pts):'';
      return{label:d.label,w:String(d.w),pts:d.pts==null?'Unknown':d.pts+' / '+d.w,ptsFg:d.pts==null?'var(--ink-4)':d.pts>=d.w*.5?'var(--ok-ink)':d.pts>0?'var(--warn-ink)':'var(--bad-ink)',why:d.why,kindP:this.gtmKindP(d.state==='unknown'?'':d.kind),
        ov:B(oK)!=null?B(oK):cur,setOv:e=>this.setLed(oK,e.target.value),
        saveOv:async()=>{const val=this.state.led[oK];if(val==null)return;if(String(val)===cur){this.dropLed([oK]);return;}
          if(await AK.gtm.set(l.id,'icp.ov.'+d.key,String(val).trim()===''?null:{pts:Number(val),why:'on '+new Date().toISOString().slice(0,10)}))this.dropLed([oK]);}};});
    const dq=c.score.dq;const dqK='__gdq';
    const sg=B('__gs')||{type:'raise',text:'',at:'',src:''};const setSg=k=>e=>{const v=e.target.value;this.setState(z=>({led:{...z.led,__gs:{...(z.led.__gs||sg),[k]:v}}}));};
    const sigs=(G.signals||[]).slice().sort((a,b)=>String(b.at||b.seen).localeCompare(String(a.at||a.seen))).map(z=>({label:GTM.SIGNALS[z.type]||z.type,text:z.text,when:z.at?(String(z.at)>new Date().toISOString().slice(0,10)?'expected ':'happened ')+z.at:'date not known',seen:'detected '+(z.seen||''),
      kindP:z.src&&z.kind!=='inference'?pill('Verified','ok'):pill('Best guess','warn'),hasSrc:!!z.src,openSrc:()=>open(z.src),del:()=>AK.gtm.signalDel(l.id,z.id)}));
    const opp=G.opp||{};const me=((CFG.accounts||[])[0]||{}).name||'';const M=GTM.messages(l,c,me);
    const oppRows=[['why','Why they need us',M.why],['angle','Angle / question to ask',c.radar.angle.q],['hook','Hook (first line)',M.hook],['msg','First message (overrides the drafted opener)','']].map(([k,label,ph])=>{const K='__gp:'+k;
      return{label,val:B(K)!=null?B(K):(opp[k]||''),ph:ph?'Suggested: '+ph:'Leave empty to use the drafted opener',set:e=>this.setLed(K,e.target.value),
        save:async()=>{const v=this.state.led[K];if(v==null)return;if(String(v)===String(opp[k]||'')){this.dropLed([K]);return;}if(await AK.gtm.set(l.id,'opp.'+k,String(v).trim()))this.dropLed([K]);}};});
    const q=encodeURIComponent((l.company||l.name||'').replace(/\s*\(.*?\)\s*/g,' ').trim());
    const research=q?[['Funding news','https://www.google.com/search?q='+q+'+raises+OR+funding+OR+seed+OR+series'],['Crunchbase','https://www.crunchbase.com/textsearch?q='+q],['Jobs / hiring','https://www.google.com/search?q='+q+'+careers+OR+jobs+growth+OR+marketing+OR+sales'],
      ['Company site','https://www.google.com/search?q='+q+'+official+site'],['YC directory','https://www.ycombinator.com/companies?query='+q]].map(([label,u])=>({label,go:()=>open(u)})):[];
    // Outreach tab
    const T=c.touches.slice().reverse().map(t=>({arrow:t.dir==='out'?'→':'←',who:t.dir==='out'?'We sent':'They',type:GTM.TOUCH_TYPES[t.type]||t.type,ch:t.ch||'',when:this.since(t.at),date:String(t.at).slice(0,10),text:t.text||'',hasText:!!t.text,
      tpl:t.tpl?'Template '+t.tpl+(t.angle?' · '+((GTM.ANGLES[t.angle]||{}).label||t.angle):''):'',hasTpl:!!t.tpl,bg:t.dir==='out'?'var(--out-soft)':'var(--mid-soft)',fg:t.dir==='out'?'var(--out-ink)':'var(--mid-ink)'}));
    const drafts=M.list.map(m=>{const k='gm'+l.id+m.id;const cb=this.copyBtn(k,'Copy');const type=m.id==='rf-connect-v1'?'connection':m.id==='rf-open-v1'?'dm':'followup';
      return{label:m.label,hint:m.hint,text:m.text,n:m.text.length+' chars',copyLabel:cb.label,cbg:cb.bg,cfg:cb.fg,csh:cb.sh,copy:()=>this.copy(m.text,k,m.label+' copied. Send it yourself on LinkedIn.'),
        sent:async()=>{if(await AK.gtm.touch(l.id,{dir:'out',type,ch:'LinkedIn',text:m.text,tpl:m.id,angle:M.angle.id},{followUpDays:type==='connection'||m.id==='rf-fu2-v1'?0:4}))this.toast('Logged: '+m.label+' sent'+(type!=='connection'&&m.id!=='rf-fu2-v1'?'. Follow-up set for 4 days from now.':'.'));}};});
    const tf=B('__gt')||{dir:'in',type:'reply',ch:'LinkedIn',text:'',at:new Date().toISOString().slice(0,10),fu:''};const setT=k=>e=>{const v=e.target.value;this.setState(z=>{const cur={...(z.led.__gt||tf),[k]:v};
      if(k==='dir')cur.type=v==='in'?'reply':'dm';return{led:{...z.led,__gt:cur}};});};
    const types=(tf.dir==='in'?['reply','question','interest','meeting','accepted','not_interested','other']:['dm','followup','connection','email','other']).map(t=>({v:t,l:GTM.TOUCH_TYPES[t]}));
    const logT=async()=>{const t=this.state.led.__gt||tf;const ok=await AK.gtm.touch(l.id,{dir:t.dir,type:t.type,ch:t.ch,text:t.text,at:t.at},{followUpDays:Number(t.fu)||0});
      if(ok){const mid=t.dir==='in'&&GTM.QUALIFYING.includes(t.type)&&l.direction!=='Inbound';this.dropLed(['__gt']);this.toast(mid?'Logged. They engaged after our outreach, so they’re now in Midbound.':'Logged.');}};
    const fuAt=days=>async()=>{const d=new Date();d.setDate(d.getDate()+days);const iso=d.toISOString().slice(0,10);const first=GTM.firstName(l.name);
      if(await AK.leadSave(l.id,{next_step:'Follow up with '+first+(c.fuN?' (follow-up '+(c.fuN+1)+')':''),next_date:iso}))this.toast('Follow-up set for '+iso+'.');};
    const pickFu=async e=>{const iso=e.target.value;if(!iso)return;if(await AK.leadSave(l.id,{next_step:'Follow up with '+GTM.firstName(l.name),next_date:iso}))this.toast('Follow-up set for '+iso+'.');};
    const nx=this.leadNext(l);
    return{ok:true,relP:this.gtmRelP(c),statusP:pill(c.status,'neutral'),scoreP:this.gtmScoreP(c.score),levelP:this.gtmLevelP(c.radar),score:String(c.score.score),conf:c.score.confLabel+' confidence ('+c.score.conf+'%)',explain:c.score.explain,
      tags:c.tags.map(t=>this.tagPill(t,TAG_C[t]||'var(--ink-3)')),hasTags:c.tags.length>0,
      acq:c.acq,acqOpts:GTM.ACQ.map(a=>({v:a,l:a})),pickAcq:e=>AK.gtm.set(l.id,'rel.acq',e.target.value),acqAuto:!(G.rel&&G.rel.acq),
      conn:c.conn||'',connOpts:[{v:'',l:'Unknown'},{v:'connected',l:'Connected'},{v:'pending',l:'Invite pending'},{v:'none',l:'Not connected'}],pickConn:e=>AK.gtm.set(l.id,'rel.conn',e.target.value),
      dims,isDq:!!dq,notDq:!dq,dq,dqVal:B(dqK)||'',setDq:e=>this.setLed(dqK,e.target.value),
      doDq:async()=>{const r=String(this.state.led[dqK]||'').trim();if(!r){this.toast('Say why they’re disqualified, e.g. “B2C”, “Competitor”, “Budget under $5k”.',null,true);return;}if(await AK.gtm.set(l.id,'icp.dq',r))this.dropLed([dqK]);},
      undoDq:()=>AK.gtm.set(l.id,'icp.dq',''),groups,research,hasResearch:research.length>0,
      sigs,hasSigs:sigs.length>0,noSigs:!sigs.length,sg,sgTypes:Object.keys(GTM.SIGNALS).map(k=>({v:k,l:GTM.SIGNALS[k]})),setSgType:setSg('type'),setSgText:setSg('text'),setSgAt:setSg('at'),setSgSrc:setSg('src'),
      addSig:async()=>{const z=this.state.led.__gs||sg;if(await AK.gtm.signal(l.id,z))this.dropLed(['__gs']);},
      radar:{level:c.radar.level,score:String(c.radar.score),why:c.radar.why.map(w=>({label:w.label,text:w.text,when:w.when?(w.derived?'detected ':String(w.when)>new Date().toISOString().slice(0,10)?'expected ':'happened ')+w.when:'date not known',kindP:w.kind==='fact'?pill('Verified','ok'):pill('Best guess','warn'),pts:'+'+w.pts,hasSrc:!!w.src,openSrc:()=>open(w.src)})),
        hasWhy:c.radar.why.length>0,noWhy:!c.radar.why.length,action:this.gtmRec(x),angle:c.radar.angle.label},oppRows,
      drafts,touches:T,hasTouches:T.length>0,noTouches:!T.length,histSum:[c.contacted?'First outreach '+String(c.contacted.at).slice(0,10):'Not contacted yet',c.fuN?c.fuN+(c.fuN===1?' follow-up':' follow-ups'):'',c.lastIn?'last reply '+String(c.lastIn.at).slice(0,10):''].filter(Boolean).join(' · '),
      tf,setTDir:setT('dir'),setTType:setT('type'),setTCh:setT('ch'),setTText:setT('text'),setTAt:setT('at'),setTFu:setT('fu'),types,logT,isOut:tf.dir==='out',
      chOpts:['LinkedIn','Email','X','Call','In person','Other'].map(v=>({v,l:v})),fuOpts:[{v:'',l:'No follow-up'},{v:'3',l:'Follow up in 3 days'},{v:'4',l:'Follow up in 4 days'},{v:'7',l:'Follow up in a week'}],
      fu3:fuAt(3),fu7:fuAt(7),pickFu,nextTxt:nx?nx.label:'No follow-up scheduled',nextFg:nx&&nx.late?'var(--bad-ink)':'var(--ink-2)',
      midNote:l.direction==='Inbound'?'They came to us (Inbound).':c.rel==='midbound'?'Midbound: they engaged after our outreach'+(c.engaged&&c.engaged.src!=='touch'?' ('+c.engaged.src+')':'')+'.':'Logging a reply, question, interest or meeting from them moves this lead to Midbound. An accepted connection alone doesn’t.'};}

  /* ---------- Who engaged (7 Nov) ----------
     Everyone who liked or commented on our LinkedIn posts (AK.SOC, filled twice a day by the social-sync job), with what we
     make of each person. Hot leads go to Leads on their own; anyone else can be added with one click. */
  // The newest run that read posts, and whether one is going right now (here or started by the schedule or a teammate).
  runState(){const R=AK.SOC.runs;const real=R.find(r=>r.ok&&r.finished_at&&!(r.summary&&r.summary.skipped));const top=R[0];
    const live=!!top&&!top.finished_at&&Date.now()-new Date(top.started_at).getTime()<3*60e3;const stuck=!!top&&!top.finished_at&&!live;
    return{last:real||null,running:AK.SOC.running||live,stuck,top:top||null};}
  socPeople(){const posts=new Map(AK.SOC.posts.map(p=>[p.platform+'|'+p.post_id,p]));const by=new Map();
    for(const e of AK.SOC.eng){const k=e.platform+'|'+e.person_key;if(!by.has(k))by.set(k,[]);by.get(k).push({...e,post:posts.get(e.platform+'|'+e.post_id)});}
    return AK.SOC.people.filter(p=>!p.is_self).map(p=>{const acts=(by.get(p.platform+'|'+p.person_key)||[]).sort((a,b)=>new Date(b.at||b.first_seen)-new Date(a.at||a.first_seen));
      return{p,acts,liked:acts.filter(a=>a.kind==='liked').length,commented:acts.filter(a=>a.kind==='commented').length,last:acts.length?new Date(acts[0].first_seen).getTime():new Date(p.last_seen).getTime()};});}
  liPeopleHdr(h){const P=this.socPeople();const hot=P.filter(x=>x.p.fit==='hot');const inLeads=hot.filter(x=>x.p.lead_id).length;const r=AK.SOC.runs[0];const rs=this.runState();
    return{...h,next:!AK.SOC.loaded?'Loading…':!P.length?'Nobody yet. Everyone who likes or comments on your posts shows up here after the next check.':
      hot.length+(hot.length===1?' hot lead':' hot leads')+' among '+P.length+' people who engaged, '+inLeads+' already in Leads.'+(r&&r.ok===false?' The last check didn’t finish.':''),
      cta:rs.running?'Checking…':'Check now',go:rs.running?null:()=>AK.socialRun()};}
  liPeopleVals(){const s=this.state;const f=s.lpf;const all=this.socPeople();const set=(k,v)=>this.setState(z=>({lpf:{...z.lpf,[k]:v}}));
    const posts=AK.SOC.posts.slice().sort((a,b)=>new Date(b.posted_at)-new Date(a.posted_at));
    const inPost=x=>!f.post||x.acts.some(a=>a.post_id===f.post),inKind=x=>!f.kind||(f.kind==='commented'?x.commented>0:x.liked>0);
    const base=all.filter(x=>inPost(x)&&inKind(x));
    const tabs=[['hot','Hot leads'],['warm','Warm'],['not a fit','Not a fit'],['','Everyone']].map(([k,label])=>{const on=f.fit===k;const n=k?base.filter(x=>x.p.fit===k).length:base.length;
      return{label,count:String(n),go:()=>set('fit',k),bg:on?'var(--ink)':'#fff',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};});
    const list=base.filter(x=>!f.fit||x.p.fit===f.fit).sort((a,b)=>(b.p.fit==='hot')-(a.p.fit==='hot')||b.last-a.last);
    const leadById=new Map(AK.LD.rows.map(l=>[l.id,l]));
    const cards=list.slice(0,120).map(x=>{const p=x.p;const F=FIT[p.fit]||FIT[''];const said=x.acts.find(a=>a.said);const lead=p.lead_id?leadById.get(p.lead_id):null;
      const did=[x.liked?'Liked '+(x.liked===1?'1 post':x.liked+' posts'):'',x.commented?'commented '+(x.commented===1?'once':x.commented+' times'):''].filter(Boolean).join(', ');
      const firstPost=x.acts[0]&&x.acts[0].post;
      return{...avatar(p.name),name:p.name||'(no name)',headline:p.headline,fit:this.tagPill(F.label,F.c),why:p.why||(p.fit?'':'Being checked against who you sell to.'),hasWhy:!!(p.why||!p.fit),
        company:[p.company,p.company_stage&&p.company_stage!=='unknown'?p.company_stage:'',p.company_what].filter(Boolean).join(' · '),hasCompany:!!(p.company||p.company_what),
        did:(did?did.charAt(0).toUpperCase()+did.slice(1):'Engaged')+(firstPost?' · latest: “'+clip(firstLine(firstPost.text),60)+'”':''),when:this.since(x.last),
        said:said?clip(said.said,220):'',hasSaid:!!said,
        fitVal:p.fit,fitOpts:[{v:'hot',l:'Hot lead'},{v:'warm',l:'Warm'},{v:'not a fit',l:'Not a fit'},...(p.fit?[]:[{v:'',l:'Not checked yet'}])],setFit:e=>AK.setPersonFit(p.platform,p.person_key,e.target.value),
        byHand:p.fit_by&&p.fit_by!=='auto',profile:()=>open(p.profile_url),inLeads:!!lead,notInLeads:!lead,
        leadLabel:lead?'In Leads · '+(lead.archived?'archived':lead.stage):'',openLead:()=>lead&&this.openLead(lead.id),
        add:async()=>{const seed={name:p.name,role:p.role||clip(p.headline,120),company:p.company||'',linkedin:p.profile_url,direction:'Inbound',source:'LinkedIn',
            source_detail:(x.commented?'Commented on your post':'Liked your post')+(firstPost?': “'+clip(firstLine(firstPost.text),70)+'”':''),heat:p.fit==='hot'?'Hot':p.fit==='warm'?'Warm':'',
            notes:[p.why,p.company_what?(p.company||'Their company')+': '+p.company_what:'',said?'They said: “'+clip(said.said,400)+'”':''].filter(Boolean).join('\n'),
            owner:(AK.leadSetting('automation')||{}).owner||''};
          const l=await AK.personToLead(p,seed);if(l)this.toast('Added '+(l.name||'them')+' to Leads.');}};});
    const rs=this.runState();const r=rs.top;
    return{tabs,cards,hasCards:cards.length>0,noCards:!cards.length,count:list.length>120?'Showing 120 of '+list.length:list.length+(list.length===1?' person':' people'),
      kind:f.kind,onKind:e=>set('kind',e.target.value),kinds:[{v:'',l:'Liked or commented'},{v:'liked',l:'Liked'},{v:'commented',l:'Commented'}],
      post:f.post,onPost:e=>set('post',e.target.value),posts:[{v:'',l:'All posts'},...posts.map(p=>({v:p.post_id,l:dLabel(new Date(p.posted_at))+' · '+clip(firstLine(p.text),48)}))],
      status:rs.running?'Checking your posts now…':r&&r.ok===false?'The last check didn’t finish ('+this.since(r.started_at)+'): '+r.error:rs.stuck?'The last check didn’t finish ('+this.since(r.started_at)+').':
        r&&r.summary&&r.summary.skipped?r.summary.skipped:rs.last?'Last checked '+this.since(rs.last.finished_at)+'. Checks run on their own at 9:00 and 21:00 IST.':'Checks run on their own at 9:00 and 21:00 IST.',
      statusFg:(r&&r.ok===false)||rs.stuck||(r&&r.summary&&r.summary.skipped)?'var(--bad-ink)':'var(--ink-3)',running:rs.running,notRunning:!rs.running,run:()=>AK.socialRun(),
      emptyText:f.fit==='hot'?'No hot leads among these people yet.':'Nobody here yet.'};}

  /* ---------- LinkedIn post tracker (3 Nov) ----------
     The LinkedIn sheet keeps one number per post, its reactions (Performance tab, checked daily), so this page works
     from those: no views, no per-check history, no follower counts. One LinkedIn post a day is the plan. */
  liWeek(){const ids=this.accs().map(a=>a.acc);const start=AK.weekStart(0);const now=new Date();
    const posts=AK.M.li.filter(p=>p._date&&(p.Status==='Posted'||p.Status==='Scheduled')).map(p=>({account:p.Account,day:p._date,posted:p.Status==='Posted',reactions:p._reactions}));
    return ids.map(acc=>({account:acc,cells:[0,1,2,3,4].map(i=>{const day=new Date(start.getTime()+i*AK.DAY);const today=AK.sameDay(day,now);
      if(day>now&&!today)return{k:'future',day,today,tomorrow:AK.sameDay(day,new Date(now.getTime()+AK.DAY))};
      const all=posts.filter(t=>t.account===acc&&AK.sameDay(t.day,day)),mine=all.filter(t=>t.posted);const r=mine.reduce((a,t)=>a+(t.reactions||0),0);
      return{k:mine.length?'green':today||all.length?'yellow':'red',n:mine.length,queued:all.length-mine.length,r,day,today};})}));}
  liTrkVals(){const s=this.state;const E=s.entered;const ids=this.accs().map(a=>a.acc);const st=AK.liState();
    const live=AK.liTracked().filter(t=>ids.includes(t.account));const R=live.filter(t=>t.reactions!=null);
    const wk=AK.weekStart(0).getTime();const tot=R.reduce((a,t)=>a+t.reactions,0);const avg=R.length?tot/R.length:null;
    const byR=R.slice().sort((a,b)=>b.reactions-a.reactions);const t0=new Date();t0.setHours(0,0,0,0);
    const queued=AK.M.li.filter(p=>p.Status==='Scheduled'&&ids.includes(p.Account)&&p._date&&p._date.getTime()>=t0.getTime()).length;
    const posted=AK.M.li.filter(p=>p.Status==='Posted'&&ids.includes(p.Account));const noLink=posted.filter(p=>!p['Posted link']);
    const auto=live.some(t=>t.auto);const hot=AK.SOC.people.filter(p=>!p.is_self&&p.fit==='hot').length;const lastRun=this.runState().last;
    // 9 Nov: what matters on LinkedIn: posting steadily, reactions and comments per post (and whether they're rising), and
    // the leads the posts bring in. Recent = the last 10 posts with numbers, compared with the 10 before them.
    const byT=R.slice().sort((a,b)=>(b.first||0)-(a.first||0));const rec=byT.slice(0,10),prev=byT.slice(10,20);
    const avgOf=(L,k)=>L.length?L.reduce((a,t)=>a+(t[k]||0),0)/L.length:null;
    const trend=(k)=>{const a=avgOf(rec,k),b=avgOf(prev,k);if(a==null)return'No numbers yet';if(b==null||!b)return'Over your last '+rec.length+' posts';const d=Math.round((a-b)/b*100);return(d>=0?'Up '+d+'%':'Down '+(-d)+'%')+' on the 10 posts before';};
    const tone=(k)=>{const a=avgOf(rec,k),b=avgOf(prev,k);return a!=null&&b?(a>=b?'var(--ok-ink)':'var(--bad-ink)'):'var(--ink-3)';};
    const thisWk=live.filter(t=>t.first&&t.first>=wk).length,lastWk=live.filter(t=>t.first&&t.first>=wk-7*AK.DAY&&t.first<wk).length;
    const kpis=[{label:'Posted this week',v:String(thisWk),d:'Last week: '+lastWk+(auto&&lastRun?' · checked '+this.since(lastRun.finished_at||lastRun.started_at):''),tone:thisWk>=lastWk?'var(--ok-ink)':'var(--warn-ink)'},
      {label:'Reactions per post',v:avgOf(rec,'reactions')!=null?String(r1(avgOf(rec,'reactions'))):'–',d:trend('reactions'),tone:tone('reactions')},
      ...(auto?[{label:'Comments per post',v:avgOf(rec,'comments')!=null?String(r1(avgOf(rec,'comments'))):'–',d:'Comments start conversations. '+trend('comments'),tone:tone('comments')}]:[]),
      {label:'Best post',v:byR[0]?fmtK(byR[0].reactions)+' reactions':'–',d:byR[0]?clip(firstLine(byR[0].text),44):'No reactions yet',tone:'var(--ink-3)'},
      {label:'Queued',v:String(queued),d:'Waiting in the LinkedIn sheet',tone:'var(--in-ink)'}];
    if(auto)kpis.push({label:'Leads from posts',v:String(hot),d:'Good fits who liked or commented, added to Leads',tone:hot?'oklch(0.5 0.15 40)':'var(--ink-3)',go:()=>this.go('liPeople')});
    // Rows the sheet marks POSTED without a live link can't be tracked; say so rather than count them as nothing.
    if(noLink.length&&!auto)kpis.push({label:'Posted, no link',v:String(noLink.length),d:'Marked POSTED in the sheet but no Live URL, so no reactions',tone:'var(--warn-ink)'});
    const WK={good:{bg:'var(--ok-soft)',fg:'var(--ok-ink)',bd:'inset 0 0 0 1px var(--ok-line)'},meh:{bg:'var(--warn-soft)',fg:'var(--warn-ink)',bd:'inset 0 0 0 1px var(--warn-line)'},bad:{bg:'var(--bad-soft)',fg:'var(--bad-ink)',bd:'inset 0 0 0 1px var(--bad-line)'},future:{bg:'transparent',fg:'var(--ink-4)',bd:'inset 0 0 0 1px var(--hairline-strong)'}};
    const week=this.liWeek().map(r=>{const name=ownerName(r.account);return{id:name,name,...avatar(avName(name)),cells:r.cells.map((c,i)=>{const sk=c.k==='green'?'good':c.k==='yellow'?'meh':c.k==='red'?'bad':'future';
      const b=c.k==='future'?(c.tomorrow?'Tomorrow':'Coming up'):c.n?fmtK(c.r)+' reactions':c.queued?'Queued':c.today?'Not yet':'Nothing';
      return{s:sk,a:c.k==='future'?'–':String(c.n),b,...WK[sk],dl:(i*60)+'ms',op:E?'1':'0',sc:E?'scale(1)':'scale(.92)'};})};});
    // Chart: each post's reactions, oldest to newest.
    const seq=R.slice().sort((a,b)=>a.first-b.first);const series=seq.map(t=>t.reactions);const hasChart=series.length>=2;const ch=mkChart(hasChart?series:[0,0],600,170);
    const lab=t=>dLabel(t);
    const hourOf=t=>{if(!t.plan&&t.first){const H=new Date(t.first).getHours();return((H%12)||12)+' '+(H<12?'AM':'PM')+' IST';}const m=String(t.plan&&t.plan['Time (IST)']||'').match(/^(\d{1,2}):\d{2}\s*([AP]M)/i);return m?m[1]+' '+m[2].toUpperCase()+' IST':null;};
    const med=AK.median(R.map(t=>t.reactions));
    const why=t=>{const o=[];if(med>=5&&R.length>=3){const x=t.reactions/med;o.push(x>=1.2?(Math.round(x*10)/10)+'× your usual post ('+t.reactions+' vs '+r1(med)+' reactions).':x<=.8?'Below your usual: '+t.reactions+' reactions vs '+r1(med)+'.':'About your usual ('+r1(med)+' reactions).');}
      const ty=t.plan&&t.plan['Post type'];if(ty)o.push('Post type: '+ty+'.');
      if(t.auto&&(t.comments||0)>0)o.push(t.comments+(t.comments===1?' comment.':' comments.'));
      if(t.plan)o.push(t.plan['Media file']?'Posted with an image.':'Text only.');
      const len=String(t.text||'').length;if(len)o.push(len<700?'Short: '+len+' characters.':'Long: '+len+' characters.');
      const h=hourOf(t);if(h)o.push('Went out around '+h+'.');return o.slice(0,4);};
    const top=byR.filter(t=>t.reactions>0).slice(0,3).map((t,i)=>{const acc=ownerName(t.account);return{n:String(i+1).padStart(2,'0'),text:clip(firstLine(t.text)||'Post on LinkedIn',140),acc,...avatar(avName(acc)),views:fmtK(t.reactions)+' reactions',eng:String(t.reactions),why:why(t)};});
    // Patterns: median reactions by post type, hour and weekday (each needs 2+ groups with 2+ posts).
    const best=(label,keyOf)=>{const by=new Map();for(const t of R){const k=keyOf(t);if(!k)continue;if(!by.has(k))by.set(k,[]);by.get(k).push(t.reactions);}
      const rows=Array.from(by,([k,v])=>({k,n:v.length,m:AK.median(v)})).filter(x=>x.n>=2).sort((a,b)=>b.m-a.m);
      return rows.length>=2?{label,v:rows[0].k,sub:r1(rows[0].m)+' reactions a post over '+rows[0].n+' posts (lowest: '+rows[rows.length-1].k+', '+r1(rows[rows.length-1].m)+')'}:null;};
    const pat=[best('Best post type',t=>t.plan&&t.plan['Post type']),best('Best hour',hourOf),best('Best day',t=>t.plan&&t.plan._date?AK.DOW[t.plan._date.getDay()]:t.first?AK.DOW[new Date(t.first).getDay()]:null)].filter(Boolean);
    const sorted=live.slice().sort((a,b)=>(b.first||0)-(a.first||0));const lim=s.trkMore?sorted.length:8;
    const rows=sorted.slice(0,lim).map((t,i)=>({text:clip(firstLine(t.text)||'Post on LinkedIn',110),acc:ownerName(t.account),when:t.first?AK.dayWord(new Date(t.first))+' '+hhmm(t.first):'–',
      views:t.reactions!=null?fmtK(t.reactions):'–',eng:t.auto?String(t.comments||0):(t.plan&&t.plan['Post type'])||'–',rate:t.auto?String(t.reposts||0):t.checked?String(t.checked).replace(/^\d{4}-(\d{2})-(\d{2})\s*/,(x,m,d)=>+d+' '+AK.MON[+m-1]+' '):'–',
      spark:(()=>{const v=(t.hist||[]).map(h=>num(h.likes)||0);if(v.length<2)return '0,22 80,22';const mx=Math.max(1,...v);return v.map((y,k)=>(k*80/(v.length-1)).toFixed(1)+','+(22-y/mx*20).toFixed(1)).join(' ');})(),deltaLabel:t.pending?'Not checked yet':'',bt:i===0?'none':'1px solid var(--hairline)'}));
    return{L:auto?{...TRK_LI,c2:'Comments',c3:'Reposts',weekTip:TRK_LI.weekTip}:TRK_LI,hasFol:false,kpis:kpis.map(k=>({...k,hasTip:false,tip:{}})),week,days:['Mon','Tue','Wed','Thu','Fri'],
      hasChart,noChart:!hasChart,total:fmtK(tot),totalD:avg!=null?r1(avg)+' a post on average':'',
      chart:{line:ch.line,area:ch.area,dash:E?'0':'1400',dots:hasChart?ch.dots.map((d,i)=>({...d,label:lab(seq[i].first)+': '+series[i]+' reactions · '+clip(firstLine(seq[i].text),60),r:i===series.length-1?'5':'3.5'})):[],
        l0:hasChart?lab(seq[0].first):'',l1:hasChart&&seq.length>2?lab(seq[Math.floor((seq.length-1)/2)].first):'',l2:hasChart?lab(seq[seq.length-1].first):''},
      fol:[],top,hasTop:top.length>0,noTop:!top.length,pat,hasPat:pat.length>0,noPat:!pat.length,rows,hasRows:rows.length>0,hasMore:!s.trkMore&&sorted.length>8,more:()=>this.setState({trkMore:true}),count:'Showing '+rows.length+' of '+sorted.length};}

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
    const GL={same:'GTM agencies (same as us)',data:'GTM engineers',soft:'GTM software founders',big:'Big account',other:'Other'};
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
  allPostsVals(){const s=this.state;const F=['All','GTM agencies','GTM engineers','GTM software founders','Big accounts'];const G={'GTM agencies':'same','GTM engineers':'data','GTM software founders':'soft','Big accounts':'big'};
    const gOf=new Map(this.compList().map(c=>[c.c,c]));
    const L=AK.M.theirs.filter(t=>{const c=gOf.get(t._comp);return s.compFilter==='All'||(c&&c.group===G[s.compFilter]);}).slice().sort(AK.bigFirst);
    const lim=s.more.allp||10;const shown=L.slice(0,lim);
    return{filters:F.map(f=>{const on=s.compFilter===f;return{label:f,go:()=>this.setState({compFilter:f}),bg:on?'var(--ink)':'rgba(255,255,255,.75)',fg:on?'#fff':'var(--ink-2)',sh:on?'0 6px 16px -6px rgba(19,20,24,.45)':'var(--shadow-xs), inset 0 0 0 1px var(--hairline)'};}),
      rows:shown.map((t,i)=>{const who=t._comp?t._comp.Name:t.Competitor;const v=num(t.Views);const r=AK.rate(t._eng,v);return{who,...avatar(who),text:firstLine(t.Hook||t['Full text']),views:v?fmtK(v)+' views':(t.Platform||'')+' · no views',likes:t._li?fmtK(num(t.Reactions))+' reactions':fmtK(num(t.Likes))+' likes',rate:r!=null?r+' per 1K':'',when:t._date?AK.dayWord(t._date):(t.Date||''),rankP:pill('#'+t._vrank+' of '+t._vrankN,t._vrank<=3?'in':'neutral'),bt:i===0?'none':'1px solid var(--hairline)',open:()=>this.openComp(AK.norm(who))};}),
      count:'Showing '+shown.length+' of '+L.length,hasMore:L.length>lim,more:()=>this.setState(st=>({more:{...st.more,allp:lim+20}}))};}
  compVals(){const s=this.state;const C=this.compList();const tabs=this.tabs([['Competitors',String(C.length)],['All their posts',String(AK.M.theirs.length)]],s.compTab,t=>this.setState({compTab:t,compId:null}));
    const isList=s.compTab==='Competitors'&&!s.compId,isDetail=s.compTab==='Competitors'&&!!s.compId&&C.some(c=>c.id===s.compId),isAll=s.compTab==='All their posts';
    const o={tabs,isList:isList||(s.compTab==='Competitors'&&!isDetail),isDetail,isAll,back:()=>this.setState({compId:null}),shownNote:C.length+' accounts, from the Competitors tab of the sheet. Followers and posting rates refresh every other day.'};
    const CG=[{id:'same',title:'GTM agencies',help:'Done-for-you GTM, outbound and founder content: they sell what we sell'},{id:'data',title:'GTM engineers',help:'They post GTM playbooks our buyers read'},{id:'soft',title:'GTM software founders',help:'They sell GTM tools to the same founders'},{id:'big',title:'Big accounts',help:'Huge audiences in our space'},{id:'other',title:'Other accounts',help:'Not grouped in the sheet'}];
    if(o.isList)o.groups=CG.map(g=>({...g,list:C.filter(c=>c.group===g.id)})).filter(g=>g.list.length).map(g=>({...g,n:String(g.list.length),rows:g.list.map((c,i)=>({...c,...avatar(c.name),handle:c.handle||'No company X account',copiedLabel:c.copied+' of '+c.top.length+' copied',dots:c.top.map((t,k)=>({bg:k<c.copied?'var(--in)':'var(--n-soft-2)'})),open:()=>this.openComp(c.id),bt:i===0?'none':'1px solid var(--hairline)'}))}));
    if(isDetail)o.d=this.compDetail(s.compId);if(isAll)o.all=this.allPostsVals();return o;}
  midVals(pg){const s=this.state;const o={};const n=s.narrow;
    o.L={cmpCols:n?'minmax(0,1fr)':'minmax(0,1fr) 44px minmax(0,1fr)',arrow:n?'↓':'→',aH:n?'0px':'auto'};
    if(pg==='calendar')o.cal=this.calVals();
    const comp=pg==='comps'||(pg==='posts'&&s.inspTab==='comp');
    o.insp={on:pg==='posts',tabs:[['drafts','Our drafts',this.ownPosts().filter(p=>p.status==='To post').length],['comp','Competitors\u2019 best posts',AK.M.theirs.length]].map(([id,label,n])=>{const on=s.inspTab===id||(id==='drafts'&&s.inspTab!=='comp');return{label,count:String(n),go:()=>this.setState({inspTab:id,compId:null,cmpOn:false}),bg:on?'var(--ink)':'rgba(255,255,255,.7)',fg:on?'#fff':'var(--ink-2)',bd:on?'var(--ink)':'var(--hairline-strong)'};})};
    if(pg==='posts'&&!comp){o.posts=this.postsVals();o.hasCmp=true;o.cmp=this.cmpVals();}
    if(pg==='tracker')o.trk=this.trkVals();
    if(pg==='pdm')o.pdm=this.pdmVals();
    if(comp){o.comp=this.compVals();if(o.comp.isDetail){const c=o.comp.d;const h=this.hdrVals(this.ppl());const nx=c.top.findIndex(t=>t.noCopy);const left=c.top.filter(t=>t.noCopy).length;const done=c.top.length-left;
      o.hdr={...h,eyebrow:'Inbound · Competitors',title:c.name,next:!c.top.length?'No posts saved for '+c.name+' yet. They arrive with the next refresh.':left>0?'We’ve copied '+done+' of their '+c.top.length+' biggest posts. Copy #'+(nx+1)+' next.':'All '+c.top.length+' of their biggest posts are copied. Check their latest posts.',cta:'All competitors',go:()=>this.setState({compId:null}),hasCta:true};}}
    const on=s.cmpOn&&pg==='posts'&&!comp;o.cmpUi={op:on?'1':'0',pe:on?'auto':'none',t:on?'none':'scale(.98) translateY(12px)'};
    return o;}
  gateVals(){const g=AK.gate();if(!g||g.wait)return{on:false};
    const fn=g.action==='allow'?()=>AK.allow():g.action==='retry'?()=>AK.refresh():()=>open(AK.SHEET_URL);
    return{on:true,title:g.title,body:g.body,cta:g.action==='allow'?'Allow and load':g.action==='retry'?'Try again':'Open the database',go:fn,sheet:()=>open(AK.SHEET_URL),hasSheet:g.action!=='sheet'};}
  renderVals(){
    const s=this.state;this.viewOnlyRole=(this.props.role??'Agency team')==='Founder (view only)';this.founder=this.viewOnlyRole||!AK.canEdit();
    const narrow=s.narrow;const page=s.page;const sec=PAGES[page].sec;const E=s.entered;const F=this.frame();
    const gate=this.gateVals();const L=(s.loading||!this.ready)&&!gate.on;
    const P=this.ppl();const c=this.counts(P);
    this.lastBy=this.lastBy||{};this.lastBy[s.plat+'|'+sec]=page;
    const ambient=this.props.ambient??true;
    const amb=!ambient?{out:'0',mid:'0',in:'0'}:sec==='leads'?{out:'.9',mid:'.3',in:'.14'}:sec==='home'?{out:'.85',mid:'.75',in:'.75'}:{out:sec==='out'?'1':'.14',mid:sec==='mid'?'1':'.14',in:sec==='in'?'1':'.14'};
    const secObj=secsFor(s.plat).find(x=>x.id===sec)||SECS.find(x=>x.id===sec);
    const tips={};TIPS.forEach(k=>tips[k]=this.tipFor(k));
    const at=AK.lastUpdate();const tm=at?hhmm(at):'…';const src='Live';
    const ready=this.ready&&!s.loading;
    const out={
      rootRef:this.rootRef,mainRef:this.mainRef,palRef:this.palRef,F,density:narrow?'touch':'comfy',glassMode:{'Frosted':'frosted','Clear':'clear','Solid white':'solid'}[this.props.glass??'Frosted']||'frosted',
      wide:!narrow,narrow,isPhone:!!F.phone,phoneTime:hhmm(Date.now()),amb,nav:this.navVals(c),owners:this.ownerVals(),owner:s.owner,onOwnerSel:e=>this.setOwner(e.target.value),
      openPal:()=>this.openPal(),status:!at?(AK.gate()&&!AK.gate().wait?'Not connected':'Connecting…'):this.founder?'View only · updated '+tm:src+' · '+tm,statusShort:this.founder?'View only · '+tm:'Updated '+tm,
      refresh:()=>{if(!AK.XJ.running['x-engage'])AK.refresh();},refreshLabel:AK.XJ.running['x-engage']?'Checking X\u2026':'Refresh now',openSheet:e=>{e.preventDefault();open(AK.SHEET_URL);},pageLabel:PAGES[page].label,
      plats:this.platVals(),plat:s.plat,isLiMode:s.plat==='LinkedIn',onPlatSel:e=>this.setPlat(e.target.value),
      subnav:secObj.pages.map(id=>{const on=id===page;return{label:PAGES[id].label,go:()=>this.go(id),bg:on?'var(--ink)':'rgba(255,255,255,.7)',fg:on?'#fff':'var(--ink-2)',sh:on?'0 4px 12px -4px rgba(19,20,24,.4)':'var(--shadow-xs), inset 0 0 0 1px var(--hairline)'};}),hasSub:secObj.pages.length>1,
      tabbar:secsFor(s.plat).map(x=>{const on=x.id===sec;const b=s.plat!=='X'?0:x.id==='out'?c.send:x.id==='mid'?c.inbox+c.pdm:0;const lb=this.lastBy&&this.lastBy[s.plat+'|'+x.id];return{label:x.label,go:()=>this.go(lb&&x.pages.includes(lb)?lb:x.pages[0]),fg:on?'var(--ink)':'var(--ink-3)',fw:on?'600':'500',dot:on?ACC[x.id].c:'var(--hairline-strong)',w:on?'22px':'6px',hasBadge:b>0,badge:String(b),badgeBg:ACC[x.id].c};}),
      hdr:this.hdrVals(P),loading:L,notLoading:!L,E:{op:E?'1':'0',t:E?'none':'translateY(10px)'},gate,stale:AK.staleNote(),hasStale:!!AK.staleNote()&&ready,
      is:(()=>{const on=ready&&!gate.on;const o=Object.fromEntries(Object.keys(PAGES).map(k=>[k,page===k&&on]));o.scripts=page==='pipeline'&&s.pipeTab==='Scripts'&&on;o.gtmViews=(page==='gtmViews'||!!LI_LISTS[page])&&on;o.gtmDash=(page==='gtmDash'||page==='leads')&&on;o.comps=page==='posts'&&s.inspTab==='comp'&&on;o.posts=page==='posts'&&s.inspTab!=='comp'&&on;return o;})(),skel3:[1,2,3],skel6:[1,2,3,4,5,6],
      tips,hideTip:()=>this.state.tip&&this.setState({tip:null}),
      cp:this.panelVals(),closePanel:()=>{if(this.state.lid)this.closeLead();this.setState({cid:null});},lp:this.leadPanel(),pal:this.palVals(),
      toast:{msg:s.toastMsg,hasUndo:!!s.toastUndo,noUndo:!s.toastUndo,ic:s.toastErr?'!':'✓',icBg:s.toastErr?'var(--bad)':'var(--ok)',ws:s.toastErr?'normal':'nowrap',undo:()=>{const u=this.state.toastUndo;this.setState({toastUndo:null,toastOn:false});u&&u();}},
      ui:{scrimOp:s.cid||s.lid?'1':'0',scrimPe:s.cid||s.lid?'auto':'none',lX:s.lid?'none':(narrow?'translateY(104%)':'translateX(calc(100% + 40px))'),lVis:s.lid?'visible':'hidden',lVisDelay:s.lid?'0s':'420ms',pT:narrow?'56px':'12px',pR:narrow?'0px':'12px',pB:narrow?'0px':'12px',pW:narrow?'100%':'var(--panel-w)',pRad:narrow?'var(--r-xl) var(--r-xl) 0 0':'var(--r-xl)',pX:s.cid?'none':(narrow?'translateY(104%)':'translateX(calc(100% + 40px))'),pVis:s.cid?'visible':'hidden',pVisDelay:s.cid?'0s':'420ms',
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
