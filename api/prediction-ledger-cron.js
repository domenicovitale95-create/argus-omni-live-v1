import { readJsonFresh, writeJson, storageReady } from './_report-store.js';

const PLAN_PATH='argus/autopilot/decision-plan.json';
function secret(){return String(process.env.CRON_SECRET||'').trim()}
function authorized(req){const s=secret();return !s||req.headers.authorization===`Bearer ${s}`}
function brussels(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return{date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute)}}
function scheduledActive(c){return c.hour>=6||(c.hour===0&&c.minute<=30)}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
function baseUrl(req){const production=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');if(production)return`https://${production}`;const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host;return host?`${proto}://${host}`:null}
function authHeaders(extra={}){const s=secret();return{Accept:'application/json',...(s?{Authorization:`Bearer ${s}`}:{ }),...extra}}
async function call(base,mode,date,cycleAfter){const q=new URLSearchParams({mode});if(date)q.set('date',date);if(cycleAfter)q.set('cycleAfter',cycleAfter);const r=await fetch(`${base}/api/prediction-ledger?${q.toString()}`,{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:'{}',cache:'no-store'});const j=await r.json().catch(()=>({}));return{ok:r.ok&&j?.ok!==false,status:r.status,data:j}}
async function callAutopilot(base){const r=await fetch(`${base}/api/autopilot`,{method:'GET',headers:authHeaders(),cache:'no-store'});const j=await r.json().catch(()=>({}));return{ok:r.ok&&j?.ok!==false,status:r.status,data:j}}
async function planState(){if(!storageReady())return{generatedAt:null,centralBrainAppliedAt:null,finalAuthority:false,rows:0};const plan=await readJsonFresh(PLAN_PATH,{generatedAt:null,plan:[]});return{generatedAt:plan?.generatedAt||null,centralBrainAppliedAt:plan?.centralBrain?.appliedAt||null,finalAuthority:plan?.centralBrain?.finalAuthority===true,systemMode:plan?.centralBrain?.systemMode||null,rows:Array.isArray(plan?.plan)?plan.plan.length:0}}
function currentCycleOk(state,startedAt){const g=new Date(state?.generatedAt||0).getTime(),a=new Date(state?.centralBrainAppliedAt||0).getTime(),s=new Date(startedAt||0).getTime();return Boolean(state?.finalAuthority&&Number.isFinite(g)&&g>0&&Number.isFinite(a)&&a>0&&Number.isFinite(s)&&s>0&&g>=s&&a>=s&&a>=g)}
function benignSkipReason(reason){return['NOT_DUE','NO_FIXTURES'].includes(String(reason||'').toUpperCase())}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!storageReady())return res.status(503).json({version:'PREDICTION-LEDGER-CRON-7',ok:false,error:'Storage unavailable'});
 const base=baseUrl(req);if(!base)return res.status(500).json({error:'Host unavailable'});
 const clock=brussels(),startedAt=new Date().toISOString(),before=await planState(),active=scheduledActive(clock);
 let cycle={required:active,attempted:false,ok:true,captureRequired:false,reason:active?'CURRENT_CYCLE_REQUIRED':'OUTSIDE_AUTOPILOT_WINDOW',before,after:before,autopilot:null};
 if(active){
   const run=await callAutopilot(base),after=await planState(),skipReason=run.data?.reason||null,benignSkip=Boolean(run.ok&&run.data?.skipped&&benignSkipReason(skipReason)),attested=!run.data?.skipped&&currentCycleOk(after,startedAt);
   cycle={required:true,attempted:true,ok:Boolean(benignSkip||(run.ok&&attested)),captureRequired:Boolean(run.ok&&!run.data?.skipped&&attested),reason:benignSkip?'NO_NEW_DECISION_CYCLE':run.ok?(attested?'CURRENT_CYCLE_ATTESTED':run.data?.skipped?`AUTOPILOT_SKIPPED_${String(skipReason||'UNKNOWN').toUpperCase()}`:'CURRENT_CYCLE_ATTESTATION_FAILED'):'AUTOPILOT_FAILED',before,after,autopilot:{httpStatus:run.status,ok:run.ok,skipped:Boolean(run.data?.skipped),reason:skipReason,error:run.data?.error||null,elapsedMs:run.data?.elapsedMs??null,centralBrain:run.data?.centralBrain||null}};
 }
 let capture={status:200,ok:true,blocked:false,skipped:true,reason:active?cycle.reason:'OUTSIDE_AUTOPILOT_WINDOW'},settlements=[];
 if(cycle.ok&&cycle.captureRequired){
   const c=await call(base,'capture',null,startedAt);capture={status:c.status,ok:c.ok,blocked:false,skipped:false,...c.data};
 }else if(!cycle.ok){
   capture={status:null,ok:false,blocked:true,skipped:true,reason:cycle.reason};
 }
 if(clock.hour===23&&clock.minute>=55)settlements.push({reason:'END_OF_DAY',date:clock.date,...await call(base,'settle',clock.date,null)});
 if([0,2].includes(clock.hour)&&clock.minute>=55){const previous=addDays(clock.date,-1);settlements.push({reason:clock.hour===0?'LATE_MATCH_RETRY_1':'LATE_MATCH_RETRY_2',date:previous,...await call(base,'settle',previous,null)})}
 const ok=cycle.ok&&capture.ok&&settlements.every(x=>x.ok);
 const state={version:'PREDICTION-LEDGER-CRON-7',startedAt,completedAt:new Date().toISOString(),baseHost:new URL(base).host,ok,cycle,capture,settlements:settlements.map(x=>({reason:x.reason,date:x.date,status:x.status,result:x.data})),policy:{captureRequiresCurrentCentralBrainCycle:true,currentCycleMustBeGeneratedThisCron:true,centralBrainFinalAuthorityRequired:true,benignNoCycleSkip:true,captureOnlyOnNewDecisionCycle:true,failClosedOnAutopilotFailure:true,failClosedOnCycleMismatch:true,freshPlanReadsRequired:true,endOfDaySettlement:true,lateMatchRetriesBrusselsHours:[0,2],productionDomainPreferred:true,automaticWagering:false}};
 try{await writeJson('argus/health/prediction-ledger-cron.json',state)}catch(error){return res.status(503).json({...state,ok:false,healthPersisted:false,error:`HEALTH_PERSIST_FAILED: ${error?.message||'unknown'}`})}
 return res.status(ok?200:207).json({...state,healthPersisted:true,clock});
}
