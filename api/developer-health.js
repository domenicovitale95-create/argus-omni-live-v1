import { readJson, storageReady } from './_report-store.js';

const ENV=String(process.env.VERCEL_ENV||'local').toLowerCase().replace(/[^a-z0-9_-]/g,'_');
const PATHS={
  deployment:`argus/health/deployment-verification-${ENV}.json`,
  deploymentLegacy:'argus/health/deployment-verification.json',
  selfImprovement:'argus/self-improvement/latest.json',
  governance:'argus/governance/latest.json',
  scheduler:'argus/autopilot/decision-plan.json',
  autopilot:'argus/health/autopilot.json',
  ledgerCron:'argus/health/prediction-ledger-cron.json'
};

function ageMinutes(ts){const t=new Date(ts||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.round((Date.now()-t)/60000)):null}
function freshness(age,limit){if(age==null)return'UNKNOWN';return age<=limit?'FRESH':age<=limit*2?'AGING':'STALE'}
function errorDiagnostics(errors){
  const rows=Array.isArray(errors)?errors.map(x=>String(x||'').trim()).filter(Boolean):[];
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

  const [deployment,selfImprovement,governance,scheduler,autopilot,ledgerCron]=await Promise.all([
    readDeployment(),
    readJson(PATHS.selfImprovement,null).catch(()=>null),
    readJson(PATHS.governance,null).catch(()=>null),
    readJson(PATHS.scheduler,null).catch(()=>null),
    readJson(PATHS.autopilot,null).catch(()=>null),
    readJson(PATHS.ledgerCron,null).catch(()=>null)
  ]);
  const depAge=ageMinutes(deployment?.generatedAt),siAge=ageMinutes(selfImprovement?.generatedAt),govAge=ageMinutes(governance?.generatedAt),schedAge=ageMinutes(scheduler?.generatedAt),autoAge=ageMinutes(autopilot?.completedAt||autopilot?.generatedAt),ledgerAge=ageMinutes(ledgerCron?.completedAt||ledgerCron?.generatedAt);
  const runtime={environment:process.env.VERCEL_ENV||null,gitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,gitBranch:process.env.VERCEL_GIT_COMMIT_REF||null,deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null};
  const snapshotCommit=deployment?.vercel?.gitCommitSha||null;
  const snapshotEnvironment=deployment?.vercel?.environment||deployment?.snapshotScope||null;
  const deploymentMismatch=Boolean(deployment&&((runtime.gitCommitSha&&snapshotCommit&&runtime.gitCommitSha!==snapshotCommit)||(runtime.environment&&snapshotEnvironment&&runtime.environment!==snapshotEnvironment)));
  const autopilotSnapshot=autopilot?{status:autopilot?.ok===false?'DEGRADED':'HEALTHY',ageMinutes:autoAge,freshness:freshness(autoAge,15),source:'AUTOPILOT_SNAPSHOT'}:scheduler?.generatedAt?{status:'AVAILABLE',ageMinutes:schedAge,freshness:freshness(schedAge,35),source:'DECISION_PLAN_FALLBACK'}:{status:'UNKNOWN',ageMinutes:null,freshness:'UNKNOWN',source:'NONE'};
  const selfImprovementDiagnostics=errorDiagnostics(selfImprovement?.errors),governanceDiagnostics=errorDiagnostics(governance?.errors);
  const selfImprovementStatus=selfImprovementDiagnostics.protectedPreviewNoise?'OBSERVABILITY_NOISE':selfImprovement?.ok===false||selfImprovementDiagnostics.count>0?'DEGRADED':selfImprovement?'HEALTHY':'UNKNOWN';
  const components={
    deployment:{status:deploymentMismatch?'DEGRADED':deployment?.status||'UNKNOWN',ageMinutes:depAge,freshness:freshness(depAge,20),commit:snapshotCommit,runtimeCommit:runtime.gitCommitSha,snapshotEnvironment,runtimeEnvironment:runtime.environment,snapshotMatchesRuntime:deployment? !deploymentMismatch:null,failures:deployment?.critical?.failed??null},
    autopilot:autopilotSnapshot,
    scheduler:{status:scheduler?.generatedAt?'AVAILABLE':'UNKNOWN',ageMinutes:schedAge,freshness:freshness(schedAge,30),prime:scheduler?.summary?.prime??null,value:scheduler?.summary?.value??null,eligible:scheduler?.summary?.eligible??null},
    ledger:{status:ledgerCron?.ok===false?'DEGRADED':ledgerCron?'HEALTHY':'UNKNOWN',ageMinutes:ledgerAge,freshness:freshness(ledgerAge,15),capture:ledgerCron?.capture?.status??null},
    selfImprovement:{status:selfImprovementStatus,ageMinutes:siAge,freshness:freshness(siAge,390),promotionFreeze:Boolean(selfImprovement?.promotionFreeze),errors:selfImprovementDiagnostics.count,protectedPreviewNoise:selfImprovementDiagnostics.protectedPreviewNoise},
    governance:{status:governance?.ok===false?'DEGRADED':governance?'HEALTHY':'UNKNOWN',ageMinutes:govAge,freshness:freshness(govAge,390),promotionCandidates:governance?.summary?.promotionCandidates??null,rollbackRequired:Boolean(governance?.summary?.rollbackRequired),errors:governanceDiagnostics.count}
  };
  const vals=Object.values(components);
  const criticalBad=[components.deployment,components.autopilot,components.scheduler,components.ledger].some(x=>['DEGRADED','BLOCKED'].includes(x.status)||x.freshness==='STALE');
  const supportingBad=[components.selfImprovement,components.governance].some(x=>x.status==='DEGRADED'||x.freshness==='STALE'||Boolean(x.rollbackRequired));
  const unknown=vals.filter(x=>x.status==='UNKNOWN').length,stale=vals.filter(x=>x.freshness==='STALE').length;
  const status=criticalBad?'ACTION_REQUIRED':unknown>=3?'INCOMPLETE':supportingBad?'DEGRADED':stale?'ATTENTION':'HEALTHY';
  const priorities=[];
  if(components.deployment.status!=='READY')priorities.push(deploymentMismatch?'DEPLOYMENT_SNAPSHOT_MISMATCH':'VERIFY_DEPLOYMENT');
  if(components.autopilot.freshness==='STALE')priorities.push('AUTOPILOT_STALE');
  if(components.ledger.freshness==='STALE')priorities.push('LEDGER_CRON_STALE');
  if(components.selfImprovement.status==='DEGRADED')priorities.push('SELF_IMPROVEMENT_ERRORS');
  if(components.selfImprovement.status==='OBSERVABILITY_NOISE')priorities.push('SELF_IMPROVEMENT_PREVIEW_PROTECTION');
  if(components.governance.rollbackRequired)priorities.push('POLICY_ROLLBACK_REVIEW');
  if(!priorities.length)priorities.push('NO_BLOCKER_DETECTED');

  return res.status(200).json({
    ok:status==='HEALTHY',
    version:'DEVELOPER-HEALTH-5',
    generatedAt:new Date().toISOString(),
    status,
    summary:{unknown,stale,priority:priorities[0]},
    priorities,
    runtime,
    components,
    diagnostics:{selfImprovement:selfImprovementDiagnostics,governance:governanceDiagnostics},
    policy:{readOnly:true,noProviderQuotaSpend:true,snapshotsOnly:true,strictGreen:true,environmentScopedDeploymentSnapshot:true,previewCannotMasqueradeAsProduction:true,designedForFastDeveloperTriage:true,errorSamplesAreStoredSnapshotData:true,protectedPreview401sDoNotImplyModelDegradation:true}
  });
}
