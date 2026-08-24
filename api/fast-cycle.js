import { readJsonFresh, writeJson, storageReady } from './_report-store.js';
import predictionLedgerCron from './prediction-ledger-cron.js';
import virtualBankroll from './virtual-bankroll-v3.js';
import livePaperBankroll from './live-paper-bankroll.js';
import closingOddsSnapshot from './closing-odds-snapshot.js';
import operationalAlertBridge from './operational-alert-bridge.js';
import alertEngine from './alert-engine.js';

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
function livePaperDue(source,now=new Date()){
  if(source!=='VERCEL_CRON')return true;
  const minute=now.getUTCMinutes(),offset=((minute-2)%15+15)%15;
  return offset<=2;
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
    captured:body?.captured??body?.run?.captured??null,
    settled:body?.settled??body?.run?.settled??null,
    providerCalls:body?.providerCalls??body?.run?.providerCalls??null,
    providerChecked:body?.providerChecked??body?.run?.providerChecked??null,
    providerSkipped:body?.providerSkipped??body?.run?.providerSkipped??null,
    updated:body?.updated??null,
    newAlertCount:body?.newAlertCount??body?.newAlerts??null,
    sent:body?.sent??null,
    configured:body?.configured??null
  };
}
function semanticOk(httpStatus,body={}){
  const semantic=String(body?.status||'').toUpperCase();
  return httpStatus>=200&&httpStatus<300&&body?.ok!==false&&!['DEGRADED','CRITICAL','FAIL','BLOCKED'].includes(semantic);
}
function localReq(base,query={}){
  const u=new URL(base),s=secret();
  return{method:'GET',query,body:{},headers:{host:u.host,'x-forwarded-host':u.host,'x-forwarded-proto':u.protocol.replace(':',''),...(s?{authorization:`Bearer ${s}`}:{})}};
}
function localRes(){
  let statusCode=200,body=null;
  const headers={};
  const res={
    setHeader(name,value){headers[String(name).toLowerCase()]=value;return res},
    status(code){statusCode=Number(code)||200;return res},
    json(value){body=value;return value},
    send(value){body=value;return value},
    end(value){if(value!==undefined)body=value;return value}
  };
  return{res,snapshot:()=>({statusCode,body,headers})};
}
async function callNetwork(base,path,auth){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),CALL_TIMEOUT_MS),started=Date.now();
  try{
    const r=await fetch(`${base}${path}`,{method:'GET',headers:{Accept:'application/json',...(auth?{Authorization:auth}:{})},cache:'no-store',signal:controller.signal});
    const body=await r.json().catch(()=>({}));
    return{path,ok:semanticOk(r.status,body),httpStatus:r.status,ms:Date.now()-started,executionMode:'NETWORK_FALLBACK',body:summarize(body)};
  }catch(error){
    return{path,ok:false,httpStatus:0,ms:Date.now()-started,executionMode:'NETWORK_FALLBACK',error:error?.name==='AbortError'?'TIMEOUT':String(error?.message||error)};
  }finally{clearTimeout(timer)}
}
async function callLocal(base,job,auth){
  const started=Date.now(),capture=localRes();
  try{
    await job.handler(localReq(base,job.query||{}),capture.res);
    const out=capture.snapshot(),body=out.body&&typeof out.body==='object'?out.body:{};
    return{path:job.path,ok:semanticOk(out.statusCode,body),httpStatus:out.statusCode,ms:Date.now()-started,executionMode:'IN_PROCESS',body:summarize(body)};
  }catch(error){
    const fallback=await callNetwork(base,job.path,auth);
    return{...fallback,localError:String(error?.message||error)};
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({version:'FAST-CYCLE-3',status:'CRITICAL',error:'Storage unavailable'});
  const base=baseUrl(req);if(!base)return res.status(500).json({error:'Host unavailable'});
  const previous=await readJsonFresh(STATE,null);
  if(previous?.status==='RUNNING'&&ageMs(previous.startedAt)<ACTIVE_LOCK_MS){
    return res.status(200).json({version:'FAST-CYCLE-3',status:'SKIPPED_IN_PROGRESS',startedAt:previous.startedAt,runId:previous.runId||null,source:sourceOf(req),policy:{duplicateExecutionSuppressed:true}});
  }
  const startedAt=new Date().toISOString(),runId=`FAST-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,source=sourceOf(req),auth=secret()?`Bearer ${secret()}`:'',dueLivePaperSettlement=livePaperDue(source,new Date(startedAt));
  await writeJson(STATE,{version:'FAST-CYCLE-3',runId,source,status:'RUNNING',startedAt,completedAt:null,results:[],policy:{primaryScheduler:'VERCEL_CRON',backupScheduler:'GITHUB_CONDITIONAL',livePaperSettlementDue:dueLivePaperSettlement,automaticRealWagering:false}});

  const jobs=[
    {path:'/api/prediction-ledger-cron',handler:predictionLedgerCron},
    {path:'/api/virtual-bankroll?mode=run',handler:virtualBankroll,query:{mode:'run'}}
  ];
  if(dueLivePaperSettlement)jobs.push({path:'/api/live-paper-bankroll',handler:livePaperBankroll});
  jobs.push(
    {path:'/api/closing-odds-snapshot',handler:closingOddsSnapshot},
    {path:'/api/operational-alert-bridge',handler:operationalAlertBridge},
    {path:'/api/alert-engine?compact=1',handler:alertEngine,query:{compact:'1'}}
  );
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY){
    const mod=await import('./push-dispatch.js');jobs.push({path:'/api/push-dispatch',handler:mod.default});
  }
  const results=[];
  for(const job of jobs)results.push(await callLocal(base,job,auth));
  const failures=results.filter(x=>!x.ok),fallbacks=results.filter(x=>x.executionMode==='NETWORK_FALLBACK'),completedAt=new Date().toISOString();
  const state={
    version:'FAST-CYCLE-3',runId,source,startedAt,completedAt,
    durationMs:Math.max(0,new Date(completedAt).getTime()-new Date(startedAt).getTime()),
    status:failures.length?'DEGRADED':'HEALTHY',jobs:results.length,failures:failures.length,networkFallbacks:fallbacks.length,results,
    pushSkipped:!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),
    livePaperSettlementDue:dueLivePaperSettlement,
    policy:{primaryScheduler:'VERCEL_CRON',primaryCadenceMinutes:5,backupScheduler:'GITHUB_CONDITIONAL',backupHealthCheckMinutes:10,inProcessSubjobs:true,networkFallbackOnLocalException:true,livePaperSettlementInProcess:true,livePaperSettlementCadenceMinutes:15,livePaperProviderPolicy:'ZERO_WHEN_IDLE; DUE_OPEN_FIXTURES_ONLY; MAX_2_PER_RUN; 30_MIN_RECHECK',providerCallsAddedByOrchestrator:0,subjobsPreserveOwnProviderPolicies:true,automaticRealWagering:false}
  };
  try{await writeJson(STATE,state)}catch(error){return res.status(503).json({...state,status:'CRITICAL',error:`FAST_CYCLE_HEALTH_PERSIST_FAILED: ${error?.message||'unknown'}`})}
  return res.status(failures.length?207:200).json(state);
}
