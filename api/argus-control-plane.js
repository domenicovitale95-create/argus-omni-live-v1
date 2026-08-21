import { readJson, storageReady } from './_report-store.js';
import { SHARD_INDEX, SHARD_VERSION } from './_historical-shards.js';

const TIMEOUT_MS=8000;
function baseUrl(req){
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app';
  return `${proto}://${host}`;
}
async function endpoint(base,path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(`${base}${path}`,{headers:{Accept:'application/json'},signal:controller.signal});
    const body=await r.json().catch(()=>null);
    return {reachable:true,httpStatus:r.status,ok:r.ok,body};
  }catch(error){
    return {reachable:false,httpStatus:null,ok:false,error:error?.name==='AbortError'?'TIMEOUT':String(error?.message||error),body:null};
  }finally{clearTimeout(timer)}
}
function level(status){
  const s=String(status||'UNKNOWN').toUpperCase();
  if(['ACTION_REQUIRED','BLOCKED','FAIL','ERROR','CRITICAL'].includes(s))return 3;
  if(['DEGRADED','ATTENTION','PARTIAL','CAUTION','STALE','INCOMPLETE'].includes(s))return 2;
  if(['UNKNOWN','UNAVAILABLE'].includes(s))return 1;
  return 0;
}
function deriveNextAction({developer,readiness,tracking,shards,telemetry}){
  const devPriority=developer?.body?.priorities?.[0];
  if(devPriority&&devPriority!=='NO_BLOCKER_DETECTED')return {priority:'P0',action:devPriority,source:'developer-health'};
  if(!tracking?.reachable||tracking?.httpStatus>=500)return {priority:'P0',action:'RESTORE_TRACKING_HEALTH',source:'tracking-health'};
  if(telemetry?.reachable&&telemetry?.body?.status==='ERROR')return {priority:'P1',action:'RESTORE_ANALYSIS_TELEMETRY',source:'analysis-telemetry'};
  if(shards?.status==='NOT_STARTED')return {priority:'P1',action:'START_SHARDED_HISTORICAL_REBUILD',source:'historical-shards'};
  if(shards?.status==='BUILDING')return {priority:'P1',action:'CONTINUE_SHARDED_HISTORICAL_REBUILD',source:'historical-shards'};
  const blockers=readiness?.body?.blockers||[];
  if(blockers.length)return {priority:'P1',action:'ACCUMULATE_VALIDATED_EVIDENCE',detail:blockers[0],source:'autopilot-readiness'};
  return {priority:'P2',action:'NO_CRITICAL_BLOCKER__RUN_NEXT_SAFE_IMPROVEMENT',source:'control-plane'};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const base=baseUrl(req);
  const [site,developer,readiness,tracking,telemetry,index]=await Promise.all([
    endpoint(base,'/api/site-health'),
    endpoint(base,'/api/developer-health'),
    endpoint(base,'/api/autopilot-readiness'),
    endpoint(base,'/api/tracking-health'),
    endpoint(base,'/api/analysis-telemetry'),
    storageReady()?readJson(SHARD_INDEX,null).catch(()=>null):Promise.resolve(null)
  ]);
  const shardCompleted=Number(index?.completedDates)||0;
  const shardFixtures=Number(index?.fixtureCount)||0;
  const shardCount=Object.keys(index?.shards||{}).length;
  const shards={
    version:index?.version||SHARD_VERSION,
    status:!index?'NOT_STARTED':shardCompleted>0?'BUILDING':'INITIALIZED',
    completedDates:shardCompleted,
    fixtures:shardFixtures,
    shards:shardCount,
    updatedAt:index?.updatedAt||null,
    legacyArchivePreserved:true
  };
  const systems={
    production:{status:site?.body?.status||(!site.reachable?'UNAVAILABLE':'UNKNOWN'),httpStatus:site.httpStatus,securityStatus:site?.body?.securityStatus||null},
    engineering:{status:developer?.body?.status||(!developer.reachable?'UNAVAILABLE':'UNKNOWN'),httpStatus:developer.httpStatus,priority:developer?.body?.summary?.priority||null},
    learning:{status:readiness?.body?.status||(!readiness.reachable?'UNAVAILABLE':'UNKNOWN'),score:readiness?.body?.score??null,blockers:(readiness?.body?.blockers||[]).slice(0,5)},
    tracking:{status:tracking?.body?.status||(!tracking.reachable?'UNAVAILABLE':'UNKNOWN'),httpStatus:tracking.httpStatus,settled:tracking?.body?.ledger?.settled??tracking?.body?.settled??null,pending:tracking?.body?.ledger?.pending??tracking?.body?.pending??null},
    telemetry:{status:telemetry?.body?.status||(!telemetry.reachable?'UNAVAILABLE':'UNKNOWN'),httpStatus:telemetry.httpStatus,day:telemetry?.body?.day||null,cycles:telemetry?.body?.totals?.cycles??null,fullRuns:telemetry?.body?.totals?.fullRuns??null,matchesAnalyzed:telemetry?.body?.totals?.matchesAnalyzed??null,decisionRowsEvaluated:telemetry?.body?.totals?.decisionRowsEvaluated??null,marketSnapshotsCaptured:telemetry?.body?.totals?.marketSnapshotsCaptured??null,coveragePct:telemetry?.body?.coverage?.recordedSlotPct??null},
    historical:shards
  };
  const severity=Math.max(...Object.values(systems).map(x=>level(x.status)));
  const status=severity>=3?'ACTION_REQUIRED':severity===2?'DEGRADED':severity===1?'INCOMPLETE':'HEALTHY';
  const nextAction=deriveNextAction({developer,readiness,tracking,shards,telemetry});
  return res.status(200).json({
    ok:status==='HEALTHY',
    version:'ARGUS-CONTROL-PLANE-2',
    generatedAt:new Date().toISOString(),
    status,
    principle:'ONE ARGUS / ONE PRODUCTION TRUTH / ONE EVIDENCE BASE / ONE LEARNING LOOP',
    runtime:{environment:process.env.VERCEL_ENV||null,gitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,gitBranch:process.env.VERCEL_GIT_COMMIT_REF||null,deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null},
    systems,
    nextAction,
    evidence:{siteHealth:site.body,developerHealth:developer.body,autopilotReadiness:readiness.body,trackingHealth:tracking.body,analysisTelemetry:telemetry.body},
    policy:{readOnly:true,noProviderQuotaSpend:true,failClosed:true,legacyProgressPreserved:true,productionAndMaturitySeparated:true,internalHealthyLabelsRequireCrossChecks:true,designedForAutonomousTriage:true,analysisTelemetryAppendOnly:true,noSyntheticDataPointEstimates:true}
  });
}
