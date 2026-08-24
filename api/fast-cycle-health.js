import { readJsonFresh, storageReady } from './_report-store.js';

const STATE='argus/health/fast-cycle.json';
const LATE_AFTER_MINUTES=8;
const STALE_AFTER_MINUTES=12;

function ageMinutes(value){const t=new Date(value||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.floor((Date.now()-t)/60000)):null}
function failedJobs(results){
  if(!Array.isArray(results))return[];
  return results.filter(x=>x?.ok===false).map(x=>({
    path:x?.path||null,
    httpStatus:x?.httpStatus??null,
    executionMode:x?.executionMode||null,
    ms:x?.ms??null,
    reason:x?.body?.reason||null,
    status:x?.body?.status||null,
    error:x?.body?.error||x?.error||x?.localError||null,
    ok:x?.body?.ok??false
  }));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'FAST-CYCLE-HEALTH-3',status:'CRITICAL',backupRequired:true,error:'Storage unavailable'});
  const state=await readJsonFresh(STATE,null);
  if(!state)return res.status(200).json({version:'FAST-CYCLE-HEALTH-3',generatedAt:new Date().toISOString(),status:'WAITING',backupRequired:true,ageMinutes:null,lastCycle:null,failedJobs:[],policy:{lateAfterMinutes:LATE_AFTER_MINUTES,staleAfterMinutes:STALE_AFTER_MINUTES,readOnly:true,providerCalls:false,persistentWrites:false}});
  const running=state.status==='RUNNING',age=ageMinutes(running?state.startedAt:state.completedAt),runTooLong=running&&age!=null&&age>=STALE_AFTER_MINUTES;
  let status='HEALTHY';
  if(runTooLong)status='STALE';
  else if(running)status='RUNNING';
  else if(state.status==='DEGRADED'||state.status==='CRITICAL')status='DEGRADED';
  else if(age==null||age>=STALE_AFTER_MINUTES)status='STALE';
  else if(age>=LATE_AFTER_MINUTES)status='LATE';
  const backupRequired=['WAITING','LATE','STALE','DEGRADED','CRITICAL'].includes(status);
  return res.status(200).json({
    version:'FAST-CYCLE-HEALTH-3',generatedAt:new Date().toISOString(),status,backupRequired,ageMinutes:age,
    lastCycle:{runId:state.runId||null,source:state.source||null,status:state.status||null,startedAt:state.startedAt||null,completedAt:state.completedAt||null,durationMs:state.durationMs??null,jobs:state.jobs??null,failures:state.failures??null,networkFallbacks:state.networkFallbacks??null,pushSkipped:state.pushSkipped??null},
    failedJobs:failedJobs(state.results),
    policy:{primaryScheduler:'VERCEL_CRON',primaryCadenceMinutes:5,backupScheduler:'GITHUB_CONDITIONAL',backupHealthCheckMinutes:10,lateAfterMinutes:LATE_AFTER_MINUTES,staleAfterMinutes:STALE_AFTER_MINUTES,lateTriggersBackup:true,readOnly:true,providerCalls:false,persistentWrites:false,networkFallbacksObserved:true,automaticRealWagering:false}
  });
}
