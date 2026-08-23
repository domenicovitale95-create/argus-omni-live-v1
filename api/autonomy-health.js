import { readJson, storageReady } from './_report-store.js';

const STATE_PATH='argus/health/autonomous-supervisor.json';
function ageMinutes(value){const t=value?new Date(value).getTime():0;return t&&Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'AUTONOMY-HEALTH-1',status:'CRITICAL',error:'Storage unavailable'});
  const state=await readJson(STATE_PATH,null);
  if(!state)return res.status(200).json({version:'AUTONOMY-HEALTH-1',status:'WAITING',heartbeatAgeMinutes:null,reason:'SUPERVISOR_HAS_NOT_RUN_YET',policy:{readOnly:true,providerCalls:false,persistentWrites:false,automaticWagering:false}});
  const heartbeatAgeMinutes=ageMinutes(state.completedAt||state.startedAt);
  const heartbeatStale=heartbeatAgeMinutes==null||heartbeatAgeMinutes>25;
  const status=heartbeatStale?'STALE':state.status||'UNKNOWN';
  return res.status(200).json({
    version:'AUTONOMY-HEALTH-1',
    generatedAt:new Date().toISOString(),
    status,
    supervisorStatus:state.status||null,
    heartbeatAgeMinutes,
    heartbeatStale,
    consecutiveUnhealthyRuns:Number(state.consecutiveUnhealthyRuns||0),
    issues:Array.isArray(state.issues)?state.issues:[],
    lastActions:Array.isArray(state.actions)?state.actions:[],
    components:state.components||{},
    policy:{readOnly:true,providerCalls:false,persistentWrites:false,cronExpectedEveryMinutes:10,automaticWagering:false,runsWithoutChat:true}
  });
}
