import { readJson, storageReady } from './_report-store.js';

const ENV=String(process.env.VERCEL_ENV||'local').toLowerCase().replace(/[^a-z0-9_-]/g,'_');
const PATHS={
  deployment:`argus/health/deployment-verification-${ENV}.json`,
  deploymentLegacy:'argus/health/deployment-verification.json',
  selfImprovement:'argus/self-improvement/latest.json',
  governance:'argus/governance/latest.json',
  scheduler:'argus/autopilot/decision-plan.json',
  autopilot:'argus/health/autopilot.json',
  ledgerCron:'argus/health/prediction-ledger-cron.json',
  virtualBankroll:'argus/paper/virtual-bankroll.json'
};

function ageMinutes(ts){const t=new Date(ts||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.round((Date.now()-t)/60000)):null}
function freshness(age,limit){if(age==null)return'UNKNOWN';return age<=limit?'FRESH':age<=limit*2?'AGING':'STALE'}
function decisionPlanCadenceMinutes(scheduler){const rows=Array.isArray(scheduler?.plan)?scheduler.plan:[],cadences=rows.map(x=>Number(x?.cadenceMinutes)).filter(x=>Number.isFinite(x)&&x>0);return cadences.length?Math.max(5,Math.min(...cadences)):30}
function decisionPlanFreshnessLimit(scheduler){return Math.max(35,decisionPlanCadenceMinutes(scheduler)+15)}
function brusselsClock(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return{hour:Number(p.hour),minute:Number(p.minute)}}
function scheduledActive(c){return c.hour>=6||(c.hour===0&&c.minute<=30)}
function errorText(value){
  if(value==null)return'';
  if(typeof value==='string')return value.trim();
  if(value instanceof Error)return(value.stack||value.message||value.name||'Error').trim();
  if(typeof value==='object'){
    try{return JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v)}
    catch{return Object.prototype.toString.call(value)}
  }
  return String(value).trim();
}
function errorDiagnostics(errors){
  const rows=Array.isArray(errors)?errors.map(errorText).filter(Boolean):[];
  const groups={};
  for(const row of rows){const key=(row.split(':')[0]||'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_')||'UNKNOWN';groups[key]=(groups[key]||0)+1}
  const protectedPreviewNoise=rows.length>0&&rows.every(row=>/Protected deployment/i.test(row)&&/(?:code[^0-9]*401|\b401\b)/i.test(row));
  return{count:rows.length,groups:Object.fromEntries(Object.entries(groups).sort((a,b)=>b[1]-a[1])),samples:rows.slice(0,8),protectedPreviewNoise};
}
async function readDeployment(){const scoped=await readJson(PATHS.deployment,null).catch(()=>null);if(scoped)return scoped;if(ENV==='production')return readJson(PATHS.deploymentLegacy,null).catch(()=>null);return null}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Developer health storage unavailable'});

  const [deployment,selfImprovement,governance,scheduler,autopilot,ledgerCron,virtualBankroll]=await Promise.all([
    readDeployment(),
    readJson(PATHS.selfImprovement,null).catch(()=>null),
    readJson(PATHS.governance,null).catch(()=>null),
    readJson(PATHS.scheduler,null).catch(()=>null),
    readJson(PATHS.autopilot,null).catch(()=>null),
    readJson(PATHS.ledgerCron,null).catch(()=>null),
    readJson(PATHS.virtualBankroll,null).catch(()=>null)
  ]);
  const depAge=ageMinutes(deployment?.generatedAt),siAge=ageMinutes(selfImprovement?.generatedAt),govAge=ageMinutes(governance?.generatedAt),schedAge=ageMinutes(scheduler?.generatedAt),autoAge=ageMinutes(autopilot?.completedAt||autopilot?.generatedAt),ledgerAge=ageMinutes(ledgerCron?.completedAt||ledgerCron?.generatedAt),virtualBankrollAge=ageMinutes(virtualBankroll?.lastRunAt||virtualBankroll?.updatedAt);
  const schedulerCadenceMinutes=decisionPlanCadenceMinutes(scheduler),schedulerFreshnessLimit=decisionPlanFreshnessLimit(scheduler);
  const runtime={environment:process.env.VERCEL_ENV||null,gitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,gitBranch:process.env.VERCEL_GIT_COMMIT_REF||null,deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null};
  const clock=brusselsClock(),autopilotScheduledActive=scheduledActive(clock);
  const snapshotCommit=deployment?.vercel?.gitCommitSha||null;
  const snapshotEnvironment=deployment?.vercel?.environment||deployment?.snapshotScope||null;
  const deploymentMismatch=Boolean(deployment&&((runtime.gitCommitSha&&snapshotCommit&&runtime.gitCommitSha!==snapshotCommit)||(runtime.environment&&snapshotEnvironment&&runtime.environment!==snapshotEnvironment)));
  const autopilotSnapshot=!autopilotScheduledActive
    ?{status:'SCHEDULED_IDLE',ageMinutes:autoAge??schedAge,freshness:'FRESH',source:autopilot?'AUTOPILOT_SNAPSHOT':'DECISION_PLAN_FALLBACK'}
    :autopilot?{status:autopilot?.ok===false?'DEGRADED':'HEALTHY',ageMinutes:autoAge,freshness:freshness(autoAge,15),source:'AUTOPILOT_SNAPSHOT'}
    :scheduler?.generatedAt?{status:'AVAILABLE',ageMinutes:schedAge,freshness:freshness(schedAge,schedulerFreshnessLimit),source:'DECISION_PLAN_FALLBACK',cadenceMinutes:schedulerCadenceMinutes,freshnessLimitMinutes:schedulerFreshnessLimit}
    :{status:'UNKNOWN',ageMinutes:null,freshness:'UNKNOWN',source:'NONE'};
  const selfImprovementDiagnostics=errorDiagnostics(selfImprovement?.errors),governanceDiagnostics=errorDiagnostics(governance?.errors);
  const selfImprovementStatus=selfImprovementDiagnostics.protectedPreviewNoise?'OBSERVABILITY_NOISE':selfImprovement?.ok===false||selfImprovementDiagnostics.count>0?'DEGRADED':selfImprovement?'HEALTHY':'UNKNOWN';
  const virtualBets=Object.values(virtualBankroll?.bets||{}),virtualOpen=virtualBets.filter(x=>x?.status==='OPEN').length,virtualSettled=virtualBets.filter(x=>['WIN','LOSS','VOID'].includes(String(x?.status||'').toUpperCase())).length;
  const components={
    deployment:{status:deploymentMismatch?'DEGRADED':deployment?.status||'UNKNOWN',ageMinutes:depAge,freshness:freshness(depAge,390),commit:snapshotCommit,runtimeCommit:runtime.gitCommitSha,snapshotEnvironment,runtimeEnvironment:runtime.environment,snapshotMatchesRuntime:deployment?!deploymentMismatch:null,failures:deployment?.critical?.failed??null},
    autopilot:autopilotSnapshot,
    scheduler:{status:!autopilotScheduledActive?'SCHEDULED_IDLE':scheduler?.generatedAt?'AVAILABLE':'UNKNOWN',ageMinutes:schedAge,freshness:!autopilotScheduledActive?'FRESH':freshness(schedAge,schedulerFreshnessLimit),cadenceMinutes:schedulerCadenceMinutes,freshnessLimitMinutes:schedulerFreshnessLimit,prime:scheduler?.summary?.prime??null,value:scheduler?.summary?.value??null,eligible:scheduler?.summary?.eligible??null},
    ledger:{status:ledgerCron?.ok===false?'DEGRADED':ledgerCron?'HEALTHY':'UNKNOWN',ageMinutes:ledgerAge,freshness:freshness(ledgerAge,15),capture:ledgerCron?.capture?.status??null},
    virtualBankroll:{status:virtualBankroll?.lastRunAt?'HEALTHY':virtualBankroll?'PENDING_FIRST_RUN':'UNKNOWN',ageMinutes:virtualBankrollAge,freshness:virtualBankroll?.lastRunAt?freshness(virtualBankrollAge,15):'UNKNOWN',trackedBets:virtualBets.length,openBets:virtualOpen,settledBets:virtualSettled,providerCalls:virtualBankroll?.integrity?.lastRunProviderCalls??virtualBankroll?.integrity?.providerCalls??null,shadowOnly:Boolean(virtualBankroll?.integrity?.paperOnly)},
    selfImprovement:{status:selfImprovementStatus,ageMinutes:siAge,freshness:freshness(siAge,390),promotionFreeze:Boolean(selfImprovement?.promotionFreeze),errors:selfImprovementDiagnostics.count,protectedPreviewNoise:selfImprovementDiagnostics.protectedPreviewNoise},
    governance:{status:governance?.ok===false?'DEGRADED':governance?'HEALTHY':'UNKNOWN',ageMinutes:govAge,freshness:freshness(govAge,390),promotionCandidates:governance?.summary?.promotionCandidates??null,rollbackRequired:Boolean(governance?.summary?.rollbackRequired),errors:governanceDiagnostics.count}
  };
  const vals=Object.values(components);
  const criticalBad=[components.deployment,components.autopilot,components.scheduler,components.ledger].some(x=>['DEGRADED','BLOCKED'].includes(x.status)||x.freshness==='STALE');
  const supportingBad=[components.virtualBankroll,components.selfImprovement,components.governance].some(x=>x.status==='DEGRADED'||x.freshness==='STALE'||Boolean(x.rollbackRequired));
  const unknown=vals.filter(x=>x.status==='UNKNOWN').length,stale=vals.filter(x=>x.freshness==='STALE').length;
  const status=criticalBad?'ACTION_REQUIRED':unknown>=3?'INCOMPLETE':supportingBad?'DEGRADED':stale?'ATTENTION':'HEALTHY';
  const priorities=[];
  if(components.deployment.status!=='READY')priorities.push(deploymentMismatch?'DEPLOYMENT_SNAPSHOT_MISMATCH':'VERIFY_DEPLOYMENT');
  if(autopilotScheduledActive&&components.autopilot.freshness==='STALE')priorities.push('AUTOPILOT_STALE');
  if(components.ledger.freshness==='STALE')priorities.push('LEDGER_CRON_STALE');
  if(components.virtualBankroll.freshness==='STALE')priorities.push('VIRTUAL_BANKROLL_STALE');
  if(components.virtualBankroll.status==='PENDING_FIRST_RUN')priorities.push('VIRTUAL_BANKROLL_AWAIT_FIRST_CRON');
  if(components.selfImprovement.status==='DEGRADED')priorities.push('SELF_IMPROVEMENT_ERRORS');
  if(components.selfImprovement.status==='OBSERVABILITY_NOISE')priorities.push('SELF_IMPROVEMENT_PREVIEW_PROTECTION');
  if(components.governance.rollbackRequired)priorities.push('POLICY_ROLLBACK_REVIEW');
  if(!priorities.length)priorities.push('NO_BLOCKER_DETECTED');

  return res.status(200).json({
    ok:status==='HEALTHY',
    version:'DEVELOPER-HEALTH-8',
    generatedAt:new Date().toISOString(),
    status,
    summary:{unknown,stale,priority:priorities[0]},
    priorities,
    runtime,
    components,
    diagnostics:{selfImprovement:selfImprovementDiagnostics,governance:governanceDiagnostics},
    policy:{readOnly:true,noProviderQuotaSpend:true,snapshotsOnly:true,strictGreen:true,environmentScopedDeploymentSnapshot:true,previewCannotMasqueradeAsProduction:true,designedForFastDeveloperTriage:true,errorSamplesAreStoredSnapshotData:true,protectedPreview401sDoNotImplyModelDegradation:true,virtualBankrollIsNonCriticalShadowObservability:true,scheduledIdleIsNotFailure:true,dynamicSchedulerFreshness:true}
  });
}
