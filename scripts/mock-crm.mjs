// Local test harness (8 Nov): builds crm/_mock.html, the real page wired to an in-memory stand-in for Supabase with made-up
// leads shaped like the live ones (outreach invites, DMs, group chats, post likers, Instagram DMs, a duplicate pair).
// Nothing touches the live project. Run `pnpm build`, then `node scripts/mock-crm.mjs`, then `pnpm serve` and open
// http://localhost:8787/_mock.html. Both generated files are git-ignored.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../crm/", import.meta.url);
let html = readFileSync(new URL("index.html", root), "utf8");
const cdn = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"><\/script>/;
if (!cdn.test(html)) throw new Error("Supabase script tag not found in index.html");
html = html.replace(cdn, '<script src="./_mock-supabase.js"></script>');
html = html.replace('<script src="./data.js', '<script>window.CRM_CONFIG.supabaseUrl="https://mock.local";window.CRM_CONFIG.supabaseAnonKey="mock";</script>\n<script src="./data.js');
html = html.replace("<title>", "<title>[MOCK] ");
writeFileSync(new URL("_mock.html", root), html);

const mock = String.raw`/* In-memory Supabase stand-in for crm/_mock.html. Same calls data.js makes; fake data only. */
(function(){
const now=Date.now(),D=864e5,iso=t=>new Date(t).toISOString(),day=t=>iso(t).slice(0,10);
let seq=1;const uid=()=>'00000000-0000-4000-8000-'+String(seq++).padStart(12,'0');
const ME='tester@example.com';
const stages=[{name:"New",color:"var(--ink-4)",kind:"open"},{name:"Contacted",color:"var(--out)",kind:"open"},{name:"In talks",color:"var(--mid)",kind:"open"},
  {name:"Follow up",color:"oklch(0.72 0.15 65)",kind:"open"},{name:"Call booked",color:"var(--in)",kind:"open"},{name:"Proposal sent",color:"var(--warn)",kind:"open"},
  {name:"Won",color:"var(--ok)",kind:"won"},{name:"Cold lead",color:"oklch(0.62 0.11 245)",kind:"open"},{name:"Lost",color:"var(--bad)",kind:"lost"}];
const T={crm_team:[{email:ME}],crm_sheet:[],crm_lead_settings:[
  {key:"stages",value:stages},{key:"sources",value:["X","LinkedIn","Instagram","Email","Referral","Website","Other"]},{key:"groups",value:[]},{key:"categories",value:[]},
  {key:"fields",value:[]},{key:"currency",value:"USD"},{key:"automation",value:{linkedin_profile:"",icp:"",add_hot:true,add_warm:false,enabled:true}},
  {key:"instagram",value:{enabled:true,accounts:["mockacct"],min_followers:1000,our_links:[],our_phones:[],ignore:[]}},{key:"li_marks",value:{"some post":"Posted"}}],
  crm_leads:[],crm_lead_events:[],crm_social_posts:[],crm_social_checks:[],crm_social_people:[],crm_social_engagements:[],crm_sync_runs:[],crm_ig_threads:[]};
const src="https://example.com/press";
const L=(o,ago)=>{const id=uid();const t=iso(now-(ago||3)*D);const row={id,name:"",company:"",role:"",email:"",phone:"",x_handle:"",linkedin:"",instagram:"",website:"",direction:"Outbound",source:"LinkedIn",source_detail:"",
  stage:"New",group_name:"",categories:[],pitch:"",closed_for:"",price:null,currency:"USD",pricing_note:"",next_step:"",next_date:null,owner:"Reyansh",notes:"",fields:{},origin_key:null,last_touch:null,
  stage_at:t,archived:false,created_by:"automation",created_at:t,updated_at:t,heat:"",...o};T.crm_leads.push(row);
  T.crm_lead_events.push({id:seq++,lead_id:id,at:t,kind:"created",text:"Added from "+row.source+" as "+row.stage,by_email:"automation"});return row;};
const ev=(l,kind,text,ago,by)=>T.crm_lead_events.push({id:seq++,lead_id:l.id,at:iso(now-ago*D),kind,text,by_email:by||"automation"});
L({name:"Priya Raman",company:"Ledgerline",linkedin:"https://www.linkedin.com/in/priya-raman-test/",source_detail:"LinkedIn invite sent "+day(now-2*D)+" (no note)",next_step:"When they accept: send Reyansh's 1:1 DM",notes:"YC S26",group_name:"YC founders",origin_key:"li-outreach:linkedin.com/in/priya-raman-test"},2);
const a=L({name:"Tomas Berg",company:"Fjord Labs",role:"Co-Founder & CEO",linkedin:"https://www.linkedin.com/in/tomas-berg-test/",stage:"Contacted",source_detail:"LinkedIn DM from Reyansh sent "+day(now-1*D),next_step:"Wait for reply to Reyansh's LinkedIn DM",notes:"YC P26. Tagged in Reyansh's YC founders post and reacted.",group_name:"Post engagers",origin_key:"li-outreach:linkedin.com/in/tomas-berg-test"},4);
ev(a,"stage","New → Contacted",1);
L({name:"Mei Chen",company:"Arcwise",linkedin:"https://www.linkedin.com/in/mei-chen-test",stage:"Contacted",source_detail:"LinkedIn group chat with Naman sent "+day(now-3*D),next_step:"Wait for reply in the LinkedIn group chat (Reyansh + Naman)",notes:"Series A $17.0M",group_name:"Series A/B founders",origin_key:"li-outreach:linkedin.com/in/mei-chen-test"},6);
const full=L({name:"Ada Okafor",company:"Signalform AI",role:"Founder & CEO",linkedin:"https://www.linkedin.com/in/ada-okafor-test/",source_detail:"Accepted our invite "+day(now-1*D),notes:"Connected, not messaged yet.",
  fields:{gtm:{v:1,rel:{conn:"connected"},intel:{website:{v:"https://signalform.example",src:"https://signalform.example",at:day(now)},model:{v:"B2B",src,at:day(now)},industry:{v:"AI SaaS for revenue teams",src,at:day(now)},
    employees:{v:14,src,at:day(now)},round:{v:"Seed",src,at:day(now)},amount:{v:"$4.5M",src,at:day(now)},date:{v:day(now-40*D),src,at:day(now)},investors:{v:"Example Ventures",src,at:day(now)},
    founder_led:{v:"Yes",src,at:day(now)},hom:{v:"No",src,at:day(now)},sdr:{v:"None",src,at:day(now)},hiring:{v:"Founding GTM lead",src:"https://signalform.example/jobs",at:day(now)},li_freq:{v:2,src,at:day(now)}},
    signals:[{id:"s1",type:"founder_post",text:"Posted that outbound stopped working for them",at:day(now-5*D),seen:day(now),src:"https://example.com/post",kind:"fact"}]}}},5);
const mid=L({name:"Jonas Weber",company:"Brightpath",role:"CEO",linkedin:"https://www.linkedin.com/in/jonas-weber-test/",stage:"In talks",heat:"Hot",source_detail:"LinkedIn DM from Reyansh sent "+day(now-6*D),next_step:"Reply to Jonas on LinkedIn",next_date:day(now),notes:"YC W26",group_name:"YC founders",origin_key:"li-outreach:linkedin.com/in/jonas-weber-test"},9);
ev(mid,"stage","Contacted → In talks",2);ev(mid,"note",day(now-2*D)+": replied: \"Happy to chat, what are you building?\"",2);
L({name:"Rahul Mehta",company:"Quillstack",role:"Co-Founder and CTO",linkedin:"https://www.linkedin.com/in/ACoAATESTURN1",direction:"Inbound",source_detail:"Liked your post: “YC founders under 20”",heat:"Hot",
  notes:"He is a co-founder of an early-stage AI startup.\nQuillstack: AI copilot that drafts legal contracts for small businesses.\nStage: seed",origin_key:"li-person:https://www.linkedin.com/in/acoaatesturn1"},3);
L({name:"Sam Ortiz",company:"",instagram:"@samortiz.test",direction:"Inbound",source:"Instagram",source_detail:"DM to @mockacct",stage:"In talks",heat:"Hot",origin_key:"ig:samortiz.test",fields:{ig_followers:5400,ig_last_at:now-1*D,ig_summary:"Creator asking about clipping prices."}},2);
const cb=L({name:"Lena Fischer",company:"Northbeam Robotics",role:"Co-founder",linkedin:"https://www.linkedin.com/in/lena-fischer-test/",stage:"Call booked",source_detail:"LinkedIn DM from Reyansh sent "+day(now-10*D),notes:"Series A $9.2M",group_name:"Series A/B founders",origin_key:"li-outreach:linkedin.com/in/lena-fischer-test",price:20000},12);
ev(cb,"stage","Contacted → In talks",6);ev(cb,"stage","In talks → Call booked",3);
L({name:"Omar Haddad",company:"Tessellate",role:"CEO",stage:"Proposal sent",direction:"Inbound",source:"Referral",source_detail:"Intro by a portfolio founder",price:60000},20);
L({name:"Grace Liu",company:"Paperplane",role:"Founder",stage:"Won",direction:"Inbound",source:"Website",price:20000,closed_for:"3-month GTM sprint"},30);
L({name:"Ivan Petrov",company:"Driftwood",linkedin:"https://www.linkedin.com/in/ivan-petrov-test/",stage:"Lost",source_detail:"LinkedIn group chat with Naman sent "+day(now-8*D)+"; they left the group",next_step:"Do not contact",closed_for:"Left the group chat",origin_key:"li-outreach:linkedin.com/in/ivan-petrov-test"},10);
L({name:"Nora Quinn",company:"Bluefin",role:"Founder",stage:"Cold lead",direction:"Inbound",source:"Instagram",instagram:"@nora.test",origin_key:"ig:nora.test"},25);
L({name:"Kiran Rao",company:"Clean (tryclean.test)",role:"Founder",linkedin:"https://www.linkedin.com/in/kiran-rao-test/",source_detail:"LinkedIn invite sent "+day(now-1*D)+" (no note), post engager",notes:"YC F26",group_name:"Post engagers",origin_key:"li-outreach:linkedin.com/in/kiran-rao-test"},1);
L({name:"Kiran Rao",company:"Clean",role:"Founder",linkedin:"https://www.linkedin.com/in/ACoAATESTURN2",direction:"Inbound",source_detail:"Liked your post: “YC founders under 20”",heat:"Hot",notes:"Founder of an early-stage startup.\nStage: pre-seed",origin_key:"li-person:https://www.linkedin.com/in/acoaatesturn2"},1);
L({name:"Big Retail Co",company:"MegaMart",role:"Software engineer",linkedin:"https://www.linkedin.com/in/megamart-test/",
  fields:{gtm:{intel:{model:{v:"B2C",src},employees:{v:5000,src},round:{v:"Series D+",src},date:{v:"2021-03",src},total:{v:"$900M",src},hom:{v:"Yes",src},sdr:{v:"3+",src},li_freq:{v:30,src},founder_led:{v:"No",src}}}}},15);
T.crm_lead_events.sort((x,y)=>new Date(y.at)-new Date(x.at));

const clone=x=>JSON.parse(JSON.stringify(x));
class Q{constructor(t){this.t=t;this.f=[];this.op="select";this.one=false;this.maybe=false;this.lim=null;this.rng=null;this.ord=[];}
  select(){if(this.op==="insert"||this.op==="update")this.ret=true;else this.op="select";return this}
  eq(c,v){this.f.push(r=>r[c]===v);return this} order(c,o){this.ord.push([c,o&&o.ascending===false]);return this} range(a,b){this.rng=[a,b];return this} limit(n){this.lim=n;return this}
  single(){this.one=true;return this} maybeSingle(){this.one=true;this.maybe=true;return this}
  insert(row){this.op="insert";this.row=row;return this} update(p){this.op="update";this.patch=p;return this} delete(){this.op="delete";return this} upsert(o){this.op="upsert";this.row=o;return this}
  then(res,rej){return Promise.resolve().then(()=>this.run()).then(res,rej)}
  run(){const tab=T[this.t];if(!tab)return{data:null,error:{message:"relation "+this.t+" does not exist"}};
    if(window.__mockFail&&this.op!=="select")return{data:null,error:{message:"mock: write refused"}};
    if(this.op==="select"){let r=tab.filter(x=>this.f.every(f=>f(x)));for(const [c,desc] of this.ord.slice(0,1))r=r.slice().sort((a,b)=>(a[c]>b[c]?1:a[c]<b[c]?-1:0)*(desc?-1:1));
      if(this.rng)r=r.slice(this.rng[0],this.rng[1]+1);if(this.lim!=null)r=r.slice(0,this.lim);return this.out(clone(r));}
    if(this.op==="insert"){const rows=(Array.isArray(this.row)?this.row:[this.row]).map(x=>{const t=new Date().toISOString();
      if(this.t==="crm_leads"){const o={id:uid(),name:"",company:"",role:"",email:"",phone:"",x_handle:"",linkedin:"",instagram:"",website:"",direction:"Inbound",source:"",source_detail:"",stage:"New",group_name:"",categories:[],pitch:"",closed_for:"",price:null,currency:"USD",pricing_note:"",next_step:"",next_date:null,owner:"",notes:"",fields:{},origin_key:null,last_touch:null,stage_at:t,archived:false,created_by:ME,created_at:t,updated_at:t,heat:"",...x};
        if(o.origin_key&&tab.some(r=>r.origin_key===o.origin_key))return{err:"duplicate key value violates unique constraint crm_leads_origin_key_key"};
        T.crm_lead_events.unshift({id:seq++,lead_id:o.id,at:t,kind:"created",text:"Added"+(o.source?" from "+o.source:"")+" as "+o.stage,by_email:ME});return o;}
      if(this.t==="crm_lead_events"){const o={id:seq++,at:t,by_email:ME,...x};const l=T.crm_leads.find(r=>r.id===o.lead_id);if(l&&["note","call","message","email","meeting"].includes(o.kind))l.last_touch=o.at;return o;}
      return{...x};});
      const bad=rows.find(r=>r.err);if(bad)return{data:null,error:{message:bad.err}};
      if(this.t==="crm_lead_events")tab.unshift(...rows);else tab.push(...rows);return this.out(clone(rows));}
    if(this.op==="update"){const hit=tab.filter(x=>this.f.every(f=>f(x)));for(const r of hit){const old=r.stage;Object.assign(r,clone(this.patch));
      if(this.t==="crm_leads"){r.updated_at=new Date().toISOString();if(this.patch.stage!=null&&this.patch.stage!==old){r.stage_at=r.updated_at;r.last_touch=r.updated_at;T.crm_lead_events.unshift({id:seq++,lead_id:r.id,at:r.updated_at,kind:"stage",text:old+" → "+r.stage,by_email:ME});}}}
      return this.out(clone(hit));}
    if(this.op==="delete"){for(let i=tab.length-1;i>=0;i--)if(this.f.every(f=>f(tab[i])))tab.splice(i,1);return{data:null,error:null};}
    if(this.op==="upsert"){const i=tab.findIndex(x=>x.key===this.row.key);if(i>=0)tab[i]={...tab[i],...clone(this.row)};else tab.push(clone(this.row));return{data:null,error:null};}}
  out(r){if(this.one){if(!r.length)return this.maybe?{data:null,error:null}:{data:null,error:{message:"no rows"}};return{data:r[0],error:null};}return{data:r,error:null};}}
const session={access_token:"mock",user:{id:"11111111-1111-4111-8111-111111111111",email:ME}};
window.__mockT=T;
window.supabase={createClient(){return{from:t=>new Q(t),rpc:async(n,a)=>n==="crm_lead_rename"?{data:0,error:null}:{data:{ok:true},error:null},
  functions:{invoke:async()=>({data:{skipped:"Mock: the sync jobs don't run here."},error:null})},
  auth:{onAuthStateChange(cb){setTimeout(()=>cb("SIGNED_IN",session),10);return{data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session},error:null}),signOut:async()=>({error:null}),signInWithOtp:async()=>({error:null})}}}};
})();`;
writeFileSync(new URL("_mock-supabase.js", root), mock);
console.log("wrote crm/_mock.html and crm/_mock-supabase.js");
