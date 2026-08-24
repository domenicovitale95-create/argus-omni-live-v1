import { readJsonFresh, writeJson, storageReady } from './_report-store.js';

const STATE='argus/health/fast-cycle.json';
const ACTIVE_LOCK_MS=4*60*1000;
const CALL_TIMEOUT_MS=55000;

function secret(){return String(process.env.CRON_SECRET||'').trim()}
function authorized(req){const s=secret();return !s||req.headers.authorization===`Bearer ${s}`}
function ageMs(value){const t=new Date(value||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Date.now()-t):Infinity}
function baseUrl(req){
  const production=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(production)return`https://${production}`;
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host;
  return host?`${proto}://${host}`:null;
}
function sourceOf(req){
  if(req.headers['x-vercel-cron-schedule'])return'VERCEL_CRON';
  const q=String(req.query?.source||'').trim().toLowerCase();
  if(q==='github-backup')return'GITHUB_BACKUP';
  if(q==='github-manual')return'GITHUB_MANUAL';
  return'MANUAL_OR_INTERNAL';
}
function summarize(body={}){
  return{
    version:body?.version||null,
    ok:body?.ok??null,
    status:body?.status||null,
    reason:body?.reason||null,
    error:body?.error||null,
    completedAt:body?.completedAt||null,
    healthPersisted:body?.healthPersisted??null,
    capturedOfficial:body?.capturedOfficial??null,
    capturedLearning:body?.capturedLearning??null,
    settled:body?.settled??null,
    updated:body?.updated??null,
    newAlertCount:body?.newAlertCount??body?.newAlerts??null,
    sent:body?.sent??null,
    configured:body?.configured??null
  };
}
async function call(base,path,auth){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),CALL_TIMEOUT_MS);
  const started=Date.now();
  try{
    const r=await fetch(`${base}${path}`,{method:'GET',headers:{Accept:'application/json',...(auth?{Authorization:auth}:{})},cache:'no-store',signal:controller.signal});
    const body=await r.json().catch(()=>({}));
    const semantic=String(body?.status||'').toUpperCase();
    const ok=r.ok&&body?.ok!==false&&!['DEGRADED','CRITICAL','FAIL','BLOCKED'].includes(semantic);
    return{path,ok,httpStatus:r.status,ms:Date.now()-started,body:summarize(body)};
  }catch(error){
    return{path,ok:false,httpStatus:0,ms:Date.now()-started,error:error?.name==='AbortError'?'TIMEOUT':String(error?.message||error)};
  }finally{clearTimeout(timer)}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({version:'FAST-CYCLE-1',status:'CRITICAL',error:'Storage unavailable'});
  const base=baseUrl(req);if(!base)return res.status(500).json({error:'Host unavailable'});
  const previous=await readJsonFresh(STATE,null);
  if(previous?.status==='RUNNING'&&ageMs(previous.startedAt)<ACTIVE_LOCK_MS){
    return res.status(200).json({version:'FAST-CYCLE-1',status:'SKIPPED_IN_PROGRESS',startedAt:previous.startedAt,runId:previous.runId||null,source:sourceOf(req),policy:{duplicateExecutionSuppressed:true}});
  }
  const startedAt=new Date().toISOString(),runId=`FAST-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,source=sourceOf(req),auth=secret()?`Bearer ${secret()}`:'';
  const running={version:'FAST-CYCLE-1',runId,source,status:'RUNNING',startedAt,completedAt:null,results:[],policy:{primaryScheduler:'VERCEL_CRON',backupScheduler:'GITHUB_CONDITIONAL',automaticRealWagering:false}};
  await writeJson(STATE,running);

  const jobs=[
    '/api/prediction-ledger-cron',
    '/api/virtual-bankroll?mode=run',
    '/api/closing-odds-snapshot',
    '/api/operational-alert-bridge',
    '/api/alert-engine?compact=1'
  ];
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)jobs.push('/api/push-dispatch');
  const results=[];
  for(const path of jobs)results.push(await call(base,path,auth));
  const failures=results.filter(x=>!x.ok),completedAt=new Date().toISOString();
  const state={
    version:'FAST-CYCLE-1',runId,source,startedAt,completedAt,
    durationMs:Math.max(0,new Date(completedAt).getTime()-new Date(startedAt).getTime()),
    status:failures.length?'DEGRADED':'HEALTHY',
    jobs:results.length,failures:failures.length,results,
    pushSkipped:!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),
    policy:{primaryScheduler:'VERCEL_CRON',primaryCadenceMinutes:5,backupScheduler:'GITHUB_CONDITIONAL',backupHealthCheckMinutes:10,providerCallsAddedByOrchestrator:0,subjobsPreserveOwnProviderPolicies:true,automaticRealWagering:false}
  };
  try{await writeJson(STATE,state)}catch(error){return res.status(503).json({...state,status:'CRITICAL',error:`FAST_CYCLE_HEALTH_PERSIST_FAILED: ${error?.message||'unknown'}`})}
  return res.status(failures.length?207:200).json(state);
}
