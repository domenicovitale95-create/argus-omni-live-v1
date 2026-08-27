import { readJsonFresh, storageReady } from './_report-store.js';

const STATE='argus/health/fast-cycle.json';
const PRIMARY_CADENCE_MINUTES=15;
const LATE_AFTER_MINUTES=22;
const STALE_AFTER_MINUTES=35;

function ageMinutes(value){const t=new Date(value||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.floor((Date.now()-t)/60000)):null}
function failedJobs(results){
  if(!Array.isArray(results))return[];
  return results.filter(x=>x?.ok===false).map(x=>({
    path:x?.path||null,
    httpStatus:x?.httpStatus??null,
    executionMode:x?.executionMode||null,
    ms:x?.ms??null,
    reason:x?.body?.reason||x?.body?.cycle?.reason||x?.body?.capture?.reason||null,
    status:x?.body?.status||null,
    error:x?.body?.error||x?.body?.cycle?.autopilot?.error||x?.error||x?.localError||null,
    cycle:x?.body?.cycle?{
      reason:x.body.cycle.reason||null,
      ok:x.body.cycle.ok??null,
      captureRequired:x.body.cycle.captureRequired??null,
      before:x.body.cycle.before||null,
      after:x.body.cycle.after||null,
      autopilot:x.body.cycle.autopilot?{
        httpStatus:x.body.cycle.autopilot.httpStatus??null,
        ok:x.body.cycle.autopilot.ok??null,
        skipped:x.body.cycle.autopilot.skipped??null,
        reason:x.body.cycle.autopilot.reason||null,
        error:x.body.cycle.autopilot.error||null,
        centralBrain:x.body.cycle.autopilot.centralBrain||null
      }:null
    }:null,
    capture:x?.body?.capture?{ok:x.body.capture.ok??null,blocked:x.body.capture.blocked??null,skipped:x.body.capture.skipped??null,reason:x.body.capture.reason||null,status:x.body.capture.status??null}:null,
    ok:x?.body?.ok??false
  }));
}

function policy(){return{
  scope:'FAST_CYCLE',
  primaryScheduler:'VERCEL_CRON',
  primaryCadenceMinutes:PRIMARY_CADENCE_MINUTES,
  backupScheduler:'GITHUB_CONDITIONAL',
  backupHealthCheckMinutes:30,
  lateAfterMinutes:LATE_AFTER_MINUTES,
  staleAfterMinutes:STALE_AFTER_MINUTES,
  schedulerJitterTolerated:true,
  lateTriggersBackup:true,
  readOnly:true,
  providerCalls:false,
  persistentWrites:false,
  placesRealWagers:false,
  wageringCapabilityOwnedByThisEndpoint:false,
  globalWageringStatus:'UNVERIFIED',
  globalWageringStatusReason:'FAST_CYCLE_DOES_NOT_OWN_OR_OBSERVE_A_REAL_WAGER_EXECUTOR',
  networkFallbacksObserved:true
}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'FAST-CYCLE-HEALTH-6',status:'CRITICAL',backupRequired:true,error:'Storage unavailable'});
  const state=await readJsonFresh(STATE,null);
  if(!state)return res.status(200).json({version:'FAST-CYCLE-HEALTH-6',generatedAt:new Date().toISOString(),status:'WAITING',backupRequired:true,ageMinutes:null,lastCycle:null,failedJobs:[],policy:policy()});
  const running=state.status==='RUNNING',age=ageMinutes(running?state.startedAt:state.completedAt),runTooLong=running&&age!=null&&age>=STALE_AFTER_MINUTES;
  let status='HEALTHY';
  if(runTooLong)status='STALE';
  else if(running)status='RUNNING';
  else if(state.status==='DEGRADED'||state.status==='CRITICAL')status='DEGRADED';
  else if(age==null||age>=STALE_AFTER_MINUTES)status='STALE';
  else if(age>=LATE_AFTER_MINUTES)status='LATE';
  const backupRequired=['WAITING','LATE','STALE','DEGRADED','CRITICAL'].includes(status);
  return res.status(200).json({
    version:'FAST-CYCLE-HEALTH-6',generatedAt:new Date().toISOString(),status,backupRequired,ageMinutes:age,
    lastCycle:{runId:state.runId||null,source:state.source||null,status:state.status||null,startedAt:state.startedAt||null,completedAt:state.completedAt||null,durationMs:state.durationMs??null,jobs:state.jobs??null,failures:state.failures??null,networkFallbacks:state.networkFallbacks??null,pushSkipped:state.pushSkipped??null},
    failedJobs:failedJobs(state.results),
    policy:policy()
  });
}
