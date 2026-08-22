import { createHash } from 'node:crypto';
import { readJson, storageReady } from './_report-store.js';

const ENV=String(process.env.VERCEL_ENV||'local').toLowerCase().replace(/[^a-z0-9_-]/g,'_');
const PATHS={
  watchtower:'argus/watchtower/latest.json',
  dataIntegrity:'argus/integrity/data-integrity.json',
  temporalIntegrity:'argus/integrity/temporal-integrity.json',
  deployment:`argus/health/deployment-verification-${ENV}.json`,
  deploymentLegacy:'argus/health/deployment-verification.json',
  autopilot:'argus/health/autopilot.json',
  ledgerCron:'argus/health/prediction-ledger-cron.json',
  resource:'argus/autopilot/resource-policy.json',
  calibration:'argus/learning/calibration-watchdog.json',
  drift:'argus/learning/drift-engine.json',
  ledger:'argus/learning/ledger-diagnostics.json',
  selfImprovement:'argus/self-improvement/latest.json',
  governance:'argus/governance/latest.json',
  decisionPlan:'argus/autopilot/decision-plan.json',
  marketTruth:'argus/learning/market-truth.json'
};

const now=()=>new Date().toISOString();
const ageMinutes=ts=>{const t=new Date(ts||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.round((Date.now()-t)/60000)):null};
const compactError=e=>{if(e==null)return null;if(typeof e==='string')return e.slice(0,240);try{return JSON.stringify(e).slice(0,240)}catch(_){return String(e).slice(0,240)}};
const safeArray=(v,n=8)=>Array.isArray(v)?v.slice(0,n):[];
function addIssue(list,severity,code,evidence=null){list.push({severity,code,evidence})}
function rankSeverity(v){return v==='CRITICAL'?4:v==='HIGH'?3:v==='MEDIUM'?2:1}
function normalizeFingerprint(issues){const base=issues.map(x=>`${x.severity}:${x.code}`).sort().join('|')||'NO_ACTIVE_ISSUE';return createHash('sha256').update(base).digest('hex').slice(0,16)}
async function readDeployment(){const scoped=await readJson(PATHS.deployment,null).catch(()=>null);if(scoped)return scoped;if(ENV==='production')return readJson(PATHS.deploymentLegacy,null).catch(()=>null);return null}
function stale(ts,limit){const a=ageMinutes(ts);return a==null||a>limit}
function mentorQuestion(issues){const first=issues[0];if(!first)return'No active blocker is proven. What is the highest-value low-risk validation or simplification step now?';return`Given ${first.code} (${first.severity}) and the attached evidence, identify the most likely root causes, falsify alternatives, and recommend exactly one smallest reversible test or engineering action. Do not weaken governance or increase trust.`}
function briefText(b){const top=b.unresolvedFailures.slice(0,6).map(x=>`${x.severity}:${x.code}`).join(', ')||'NONE';return [
  'ARGUS MENTOR BRIEF',
  `cycle=${b.cycleId}`,
  `environment=${b.runtime.environment||'unknown'} branch=${b.runtime.gitBranch||'unknown'} commit=${b.runtime.gitCommitSha||'unknown'}`,
  `severity=${b.severity} fingerprint=${b.incidentFingerprint}`,
  `failures=${top}`,
  `watchtower=${b.observed.health?.status||'UNKNOWN'} score=${b.observed.health?.score??'NA'}`,
  `dataIntegrity=${b.observed.integrity?.dataStatus||'UNKNOWN'} temporalIntegrity=${b.observed.integrity?.temporalStatus||'UNKNOWN'}`,
  `deployment=${b.observed.deploymentParity?.status||'UNKNOWN'} autopilot=${b.observed.automation?.autopilotStatus||'UNKNOWN'} ledger=${b.observed.automation?.ledgerOk==null?'UNKNOWN':b.observed.automation.ledgerOk?'OK':'FAIL'}`,
  `quotaMode=${b.observed.resources?.quotaMode||'UNKNOWN'} calibration=${b.observed.science?.calibrationStatus||'UNKNOWN'} drift=${b.observed.science?.driftStatus||'UNKNOWN'}`,
  `question=${b.highestValueQuestion}`,
  'constraints=NO_SECRETS, NO_MAIN_MERGE, NO_PRODUCTION_PROMOTION, NO_FROZEN_REWRITE, NO_PRIME_CREATION, NO_STAKING_CHANGE, NO_REAL_MONEY_WAGERING'
].join('\n')}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Mentor brief storage unavailable'});

  const [watchtower,dataIntegrity,temporalIntegrity,deployment,autopilot,ledgerCron,resource,calibration,drift,ledger,selfImprovement,governance,decisionPlan,marketTruth]=await Promise.all([
    readJson(PATHS.watchtower,null).catch(()=>null),
    readJson(PATHS.dataIntegrity,null).catch(()=>null),
    readJson(PATHS.temporalIntegrity,null).catch(()=>null),
    readDeployment(),
    readJson(PATHS.autopilot,null).catch(()=>null),
    readJson(PATHS.ledgerCron,null).catch(()=>null),
    readJson(PATHS.resource,null).catch(()=>null),
    readJson(PATHS.calibration,null).catch(()=>null),
    readJson(PATHS.drift,null).catch(()=>null),
    readJson(PATHS.ledger,null).catch(()=>null),
    readJson(PATHS.selfImprovement,null).catch(()=>null),
    readJson(PATHS.governance,null).catch(()=>null),
    readJson(PATHS.decisionPlan,null).catch(()=>null),
    readJson(PATHS.marketTruth,null).catch(()=>null)
  ]);

  const issues=[];
  const dataStatus=String(dataIntegrity?.status||'UNKNOWN').toUpperCase(), temporalStatus=String(temporalIntegrity?.status||'UNKNOWN').toUpperCase();
  if(dataStatus==='FAIL')addIssue(issues,'CRITICAL','DATA_INTEGRITY_FAIL',{errors:dataIntegrity?.counts?.errors??null});
  if(temporalStatus==='FAIL')addIssue(issues,'CRITICAL','TEMPORAL_INTEGRITY_FAIL',{errors:temporalIntegrity?.counts?.errors??null});
  const depStatus=String(deployment?.status||'UNKNOWN').toUpperCase();
  if(['BLOCKED','ACTION_REQUIRED'].includes(depStatus))addIssue(issues,'CRITICAL','DEPLOYMENT_BLOCKED',{status:depStatus,failed:deployment?.critical?.failed??null});
  else if(['DEGRADED'].includes(depStatus))addIssue(issues,'HIGH','DEPLOYMENT_DEGRADED',{status:depStatus});
  if(stale(deployment?.generatedAt,45))addIssue(issues,'MEDIUM','DEPLOYMENT_SNAPSHOT_STALE',{ageMinutes:ageMinutes(deployment?.generatedAt)});
  if(autopilot?.ok===false)addIssue(issues,'HIGH','AUTOPILOT_LAST_CYCLE_FAILED',{error:compactError(autopilot?.error)});
  if(stale(autopilot?.completedAt||autopilot?.generatedAt,45)&&String(watchtower?.recommendedMode||'').toUpperCase()!=='NORMAL')addIssue(issues,'HIGH','AUTOPILOT_HEALTH_STALE',{ageMinutes:ageMinutes(autopilot?.completedAt||autopilot?.generatedAt)});
  if(ledgerCron&&ledgerCron.ok===false)addIssue(issues,'HIGH','LEDGER_CRON_FAILED',{captureStatus:ledgerCron?.capture?.status??null});
  if(dataStatus==='WATCH')addIssue(issues,'MEDIUM','DATA_INTEGRITY_WATCH',{warnings:dataIntegrity?.counts?.warnings??null});
  if(temporalStatus==='WATCH')addIssue(issues,'HIGH','TEMPORAL_INTEGRITY_WATCH',{warnings:temporalIntegrity?.counts?.warnings??null});
  const calStatus=String(calibration?.status||'UNKNOWN').toUpperCase();
  if(calStatus==='DEGRADED')addIssue(issues,'HIGH','CALIBRATION_DEGRADED',{sample:calibration?.global?.sample??null,brier:calibration?.global?.brier??null});
  else if(calStatus==='CAUTION')addIssue(issues,'MEDIUM','CALIBRATION_CAUTION',{sample:calibration?.global?.sample??null});
  const driftStatus=String(drift?.status||'UNKNOWN').toUpperCase();
  if(driftStatus==='DRIFT')addIssue(issues,'HIGH','STRUCTURAL_DRIFT_SIGNAL',{signals:safeArray(drift?.signals,6)});
  else if(driftStatus==='WATCH')addIssue(issues,'MEDIUM','DRIFT_WATCH',{signals:safeArray(drift?.signals,6)});
  const selfErrors=Array.isArray(selfImprovement?.errors)?selfImprovement.errors.length:0;
  if(selfImprovement?.ok===false||selfErrors)addIssue(issues,'MEDIUM','SELF_IMPROVEMENT_ERRORS',{count:selfErrors,samples:safeArray(selfImprovement?.errors,4).map(compactError)});
  if(governance?.summary?.rollbackRequired)addIssue(issues,'HIGH','GOVERNANCE_ROLLBACK_REQUIRED',null);
  if(String(resource?.quotaMode||resource?.mode||'').toUpperCase()==='EMERGENCY')addIssue(issues,'HIGH','RESOURCE_QUOTA_EMERGENCY',{quotaMode:resource?.quotaMode||resource?.mode});
  if(String(watchtower?.status||'').toUpperCase()==='CRITICAL')addIssue(issues,'CRITICAL','WATCHTOWER_CRITICAL',{score:watchtower?.healthScore??null,silentFailures:safeArray(watchtower?.silentFailures,8)});
  for(const code of safeArray(watchtower?.silentFailures,8))addIssue(issues,'MEDIUM',`SILENT_${String(code).replace(/[^A-Z0-9_]/gi,'_').toUpperCase()}`,null);
  if(Number(ledger?.totalSettled||ledger?.global?.sample||0)<20)addIssue(issues,'LOW','EVIDENCE_SAMPLE_LT_20',{settled:Number(ledger?.totalSettled||ledger?.global?.sample||0)});

  issues.sort((a,b)=>rankSeverity(b.severity)-rankSeverity(a.severity)||a.code.localeCompare(b.code));
  const severity=issues.length?issues[0].severity:'LOW';
  const generatedAt=now(),cycleId=`mentor-${generatedAt.replace(/[-:.TZ]/g,'').slice(0,14)}`;
  const runtime={environment:process.env.VERCEL_ENV||null,gitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,gitBranch:process.env.VERCEL_GIT_COMMIT_REF||null,deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null,region:process.env.VERCEL_REGION||null};
  const snapshotCommit=deployment?.vercel?.gitCommitSha||null;
  const brief={
    version:'ARGUS-MENTOR-BRIEF-1',mode:'DORMANT_ZERO_COST_READ_ONLY',generatedAt,cycleId,severity,
    incidentFingerprint:normalizeFingerprint(issues),runtime,
    observed:{
      health:{status:watchtower?.status||'UNKNOWN',score:watchtower?.healthScore??null,recommendedMode:watchtower?.recommendedMode||null,silentFailures:safeArray(watchtower?.silentFailures,8),ageMinutes:ageMinutes(watchtower?.generatedAt)},
      deploymentParity:{status:depStatus,snapshotCommit,runtimeCommit:runtime.gitCommitSha,matches:runtime.gitCommitSha&&snapshotCommit?runtime.gitCommitSha===snapshotCommit:null,ageMinutes:ageMinutes(deployment?.generatedAt)},
      integrity:{dataStatus,dataErrors:dataIntegrity?.counts?.errors??null,dataWarnings:dataIntegrity?.counts?.warnings??null,provenance:dataIntegrity?.provenance?{sourceCoveragePct:dataIntegrity.provenance.sourceCoveragePct,sourceTimestampCoveragePct:dataIntegrity.provenance.sourceTimestampCoveragePct,averageSourceAgeSeconds:dataIntegrity.provenance.averageSourceAgeSeconds,maxSourceAgeSeconds:dataIntegrity.provenance.maxSourceAgeSeconds}:null,temporalStatus,temporalErrors:temporalIntegrity?.counts?.errors??null,temporalWarnings:temporalIntegrity?.counts?.warnings??null},
      automation:{autopilotStatus:autopilot?.ok===false?'DEGRADED':autopilot?'HEALTHY':'UNKNOWN',autopilotAgeMinutes:ageMinutes(autopilot?.completedAt||autopilot?.generatedAt),ledgerOk:ledgerCron?.ok??null,ledgerAgeMinutes:ageMinutes(ledgerCron?.completedAt||ledgerCron?.generatedAt),decisionPlanAgeMinutes:ageMinutes(decisionPlan?.generatedAt),planRows:Array.isArray(decisionPlan?.plan)?decisionPlan.plan.length:null},
      resources:{mode:resource?.mode||null,quotaMode:resource?.quotaMode||null,urgent:resource?.urgent??null,allocation:resource?.allocation||null,ageMinutes:ageMinutes(resource?.generatedAt)},
      science:{calibrationStatus:calStatus,calibrationGlobal:calibration?.global?{sample:calibration.global.sample??null,brier:calibration.global.brier??null,logLoss:calibration.global.logLoss??null,calibrationError:calibration.global.calibrationError??null,confidenceGap:calibration.global.confidenceGap??null}:null,driftStatus,driftSignals:safeArray(drift?.signals,6),settled:Number(ledger?.totalSettled||ledger?.global?.sample||0),marketTruthCLV:marketTruth?.global?.avgCLV??null},
      governance:{selfImprovementOk:selfImprovement?.ok??null,selfImprovementErrors:selfErrors,promotionFreeze:Boolean(selfImprovement?.promotionFreeze),governanceOk:governance?.ok??null,rollbackRequired:Boolean(governance?.summary?.rollbackRequired)}
    },
    unresolvedFailures:issues.slice(0,12),
    highestValueQuestion:mentorQuestion(issues),
    externalObservabilityNeeded:['VERCEL_RECENT_4XX_5XX_COUNTS','VERCEL_RUNTIME_ERROR_CLUSTERS','PREVIEW_BUILD_STATUS','BRANCH_DIFF_IF_ACTIVE_INCIDENT'],
    requestedResponse:['OBSERVED','HYPOTHESES','RED_TEAM','RECOMMENDED_ACTION','WHY_NOW','SMALLEST_VALID_TEST','METRIC_TO_WATCH','FAILURE_CONDITION','ROLLBACK','KEEP_WATCH_REJECT','NEXT_BEST_ACTION'],
    constraints:['NO_SECRETS','NO_MAIN_MERGE','NO_PRODUCTION_PROMOTION','NO_FROZEN_PREDICTION_REWRITE','NO_PRIME_CREATION','NO_STAKING_CHANGE','NO_REAL_MONEY_WAGERING'],
    policy:{readOnly:true,writes:false,providerCalls:false,externalAiCalls:false,zeroCostOpenAI:true,snapshotsOnly:true,mentorIsHypothesisSourceNotAuthority:true,fastLaneForEngineeringIncidentsOnly:true,scientificTrustLaneRemainsSlow:true}
  };
  brief.copyForMentor=briefText(brief);
  return res.status(200).json(brief);
}
