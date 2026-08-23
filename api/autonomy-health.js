import { readJson, storageReady } from './_report-store.js';

const STATE_PATH='argus/health/autonomous-supervisor.json';
const EXPECTED_MINUTES=10;
const LATE_AFTER_MINUTES=25;
const STALE_AFTER_MINUTES=45;
function ageMinutes(value){const t=value?new Date(value).getTime():0;return t&&Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'AUTONOMY-HEALTH-3',status:'CRITICAL',error:'Storage unavailable'});
  const state=await readJson(STATE_PATH,null);
  if(!state)return res.status(200).json({version:'AUTONOMY-HEALTH-3',status:'WAITING',heartbeatAgeMinutes:null,reason:'SUPERVISOR_HAS_NOT_RUN_YET',policy:{readOnly:true,providerCalls:false,persistentWrites:false,primaryScheduler:'VERCEL_CRON',backupScheduler:'GITHUB_WATCHDOG',automaticWagering:false}});
  const heartbeatAgeMinutes=ageMinutes(state.completedAt||state.startedAt);
  const heartbeatStale=heartbeatAgeMinutes==null||heartbeatAgeMinutes>STALE_AFTER_MINUTES;
  const heartbeatLate=!heartbeatStale&&heartbeatAgeMinutes!=null&&heartbeatAgeMinutes>LATE_AFTER_MINUTES;
  const status=heartbeatStale?'STALE':heartbeatLate?'LATE':state.status||'UNKNOWN';
  return res.status(200).json({
    version:'AUTONOMY-HEALTH-3',
    generatedAt:new Date().toISOString(),
    status,
    supervisorStatus:state.status||null,
    heartbeatAgeMinutes,
    heartbeatLate,
    heartbeatStale,
    consecutiveUnhealthyRuns:Number(state.consecutiveUnhealthyRuns||0),
    issues:Array.isArray(state.issues)?state.issues:[],
    lastActions:Array.isArray(state.actions)?state.actions:[],
    components:state.components||{},
    policy:{readOnly:true,providerCalls:false,persistentWrites:false,primaryScheduler:'VERCEL_CRON',backupScheduler:'GITHUB_WATCHDOG',cronExpectedEveryMinutes:EXPECTED_MINUTES,githubWatchdogEveryMinutes:30,githubRecoveryAfterMinutes:18,lateAfterMinutes:LATE_AFTER_MINUTES,staleAfterMinutes:STALE_AFTER_MINUTES,schedulerJitterTolerated:true,automaticWagering:false,runsWithoutChat:true}
  });
}
