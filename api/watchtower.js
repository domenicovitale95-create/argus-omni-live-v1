import { readJson, writeJson, storageReady } from './_report-store.js';

const OUT='argus/watchtower/latest.json';
const ageMin=v=>{const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?Math.round((Date.now()-t)/60000):null};
const fresh=(v,max)=>{const a=ageMin(v);return a!=null&&a>=0&&a<=max};
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
function grade(score){if(score>=90)return'HEALTHY';if(score>=75)return'WATCH';if(score>=55)return'DEGRADED';return'CRITICAL'}
function domain(name,score,status,details={}){return{name,score:clamp(Math.round(score)),status,details}}
function integrityScore(doc){const s=String(doc?.status||'UNKNOWN').toUpperCase();if(s==='PASS')return100;if(s==='WATCH')return75;if(s==='FAIL')return30;return60}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Watchtower storage unavailable'});

  const [plan,resource,self,skill,truth,specialists,ledger,dataIntegrity,temporalIntegrity,calibration,drift,noBet]=await Promise.all([
    readJson('argus/autopilot/decision-plan.json',{}),readJson('argus/autopilot/resource-policy.json',{}),readJson('argus/self-improvement/latest.json',{}),readJson('argus/learning/skill-map.json',{}),readJson('argus/learning/market-truth.json',{}),readJson('argus/learning/market-specialists.json',{}),readJson('argus/learning/ledger-diagnostics.json',{}),readJson('argus/integrity/data-integrity.json',{}),readJson('argus/integrity/temporal-integrity.json',{}),readJson('argus/learning/calibration-watchdog.json',{}),readJson('argus/learning/drift-engine.json',{}),readJson('argus/learning/no-bet-optimizer.json',{})
  ]);

  const ages={plan:ageMin(plan.generatedAt),resource:ageMin(resource.generatedAt),self:ageMin(self.generatedAt),skill:ageMin(skill.generatedAt),truth:ageMin(truth.generatedAt),specialists:ageMin(specialists.generatedAt),ledger:ageMin(ledger.generatedAt),dataIntegrity:ageMin(dataIntegrity.generatedAt),temporalIntegrity:ageMin(temporalIntegrity.generatedAt),calibration:ageMin(calibration.generatedAt),drift:ageMin(drift.generatedAt),noBet:ageMin(noBet.generatedAt)};
  const quotaMode=resource.quotaMode||resource.mode||'UNKNOWN';
  const dataScore=(fresh(plan.generatedAt,20)?30:8)+(fresh(skill.generatedAt,420)?20:8)+(fresh(truth.generatedAt,420)?15:6)+(fresh(specialists.generatedAt,420)?15:6)+Math.round(integrityScore(dataIntegrity)*.20);
  const automationScore=(fresh(plan.generatedAt,20)?30:8)+(fresh(resource.generatedAt,45)?20:8)+(fresh(self.generatedAt,420)?20:8)+(fresh(ledger.generatedAt,420)?10:4)+(fresh(calibration.generatedAt,420)?7:2)+(fresh(drift.generatedAt,420)?7:2)+(fresh(noBet.generatedAt,420)?6:2);
  const quotaScore=quotaMode==='EMERGENCY'?35:quotaMode==='SAFE'?60:quotaMode==='CONSERVE'?80:quotaMode==='NORMAL'||quotaMode==='EXPAND'?100:75;
  const calStatus=String(calibration.status||ledger.global?.status||'LEARNING').toUpperCase();
  const calibrationScore=calStatus==='DEGRADED'?40:calStatus==='CAUTION'?65:calStatus==='STABLE'||calStatus==='VALIDATING_POSITIVE'?95:80;
  const driftStatus=String(drift.status||'LEARNING').toUpperCase();
  const driftScore=driftStatus==='DRIFT'?40:driftStatus==='WATCH'?70:driftStatus==='STABLE'?95:80;
  const noBetStatus=String(noBet.status||'LEARNING').toUpperCase();
  const abstentionScore=noBetStatus==='ACTIVE_RESTRICTIONS_SUGGESTED'?75:noBetStatus==='CAUTION'?85:90;
  const learningScore=(fresh(self.generatedAt,420)?30:10)+(fresh(skill.generatedAt,420)?20:8)+(fresh(truth.generatedAt,420)?20:8)+(fresh(specialists.generatedAt,420)?15:6)+(fresh(noBet.generatedAt,420)?15:6);
  const temporalScore=integrityScore(temporalIntegrity);

  const domains={
    DATA:domain('DATA',dataScore,grade(dataScore),{decisionPlanAgeMinutes:ages.plan,skillMapAgeMinutes:ages.skill,marketTruthAgeMinutes:ages.truth,dataIntegrityStatus:dataIntegrity.status||'UNKNOWN',dataIntegrityAgeMinutes:ages.dataIntegrity,errors:Number(dataIntegrity?.counts?.errors||0),warnings:Number(dataIntegrity?.counts?.warnings||0)}),
    TEMPORAL_INTEGRITY:domain('TEMPORAL_INTEGRITY',temporalScore,grade(temporalScore),{status:temporalIntegrity.status||'UNKNOWN',ageMinutes:ages.temporalIntegrity,errors:Number(temporalIntegrity?.counts?.errors||0),warnings:Number(temporalIntegrity?.counts?.warnings||0)}),
    AUTOMATION:domain('AUTOMATION',automationScore,grade(automationScore),{resourceAgeMinutes:ages.resource,selfImprovementAgeMinutes:ages.self,ledgerLearningAgeMinutes:ages.ledger}),
    API_QUOTA:domain('API_QUOTA',quotaScore,grade(quotaScore),{quotaMode}),
    CALIBRATION:domain('CALIBRATION',calibrationScore,grade(calibrationScore),{status:calStatus,ageMinutes:ages.calibration,sample:Number(calibration?.global?.sample||ledger?.global?.sample||0),brier:calibration?.global?.brier??ledger?.global?.brier??null,logLoss:calibration?.global?.logLoss??ledger?.global?.logLoss??null,calibrationError:calibration?.global?.calibrationError??ledger?.global?.calibrationError??null}),
    DRIFT:domain('DRIFT',driftScore,grade(driftScore),{status:driftStatus,ageMinutes:ages.drift,action:drift.action||null}),
    ABSTENTION:domain('ABSTENTION',abstentionScore,grade(abstentionScore),{status:noBetStatus,ageMinutes:ages.noBet,abstainSegments:Number(noBet?.abstain?.length||0),watchSegments:Number(noBet?.watch?.length||0)}),
    LEARNING:domain('LEARNING',learningScore,grade(learningScore),{selfImprovementAgeMinutes:ages.self,skillMapAgeMinutes:ages.skill,marketTruthAgeMinutes:ages.truth,specialistsAgeMinutes:ages.specialists})
  };

  const vals=Object.values(domains),healthScore=Math.round(vals.reduce((s,d)=>s+d.score,0)/vals.length),status=grade(healthScore),critical=vals.filter(d=>d.status==='CRITICAL'),degraded=vals.filter(d=>d.status==='DEGRADED');
  const silentFailures=[];
  if(ages.plan==null||ages.plan>20)silentFailures.push('DECISION_PLAN_STALE');if(ages.resource==null||ages.resource>45)silentFailures.push('RESOURCE_POLICY_STALE');if(ages.self==null||ages.self>420)silentFailures.push('SELF_IMPROVEMENT_STALE');if(ages.ledger==null||ages.ledger>420)silentFailures.push('LEDGER_LEARNING_STALE');if(ages.dataIntegrity==null||ages.dataIntegrity>90)silentFailures.push('DATA_INTEGRITY_STALE');if(ages.temporalIntegrity==null||ages.temporalIntegrity>90)silentFailures.push('TEMPORAL_INTEGRITY_STALE');if(ages.calibration==null||ages.calibration>420)silentFailures.push('CALIBRATION_WATCHDOG_STALE');if(ages.drift==null||ages.drift>420)silentFailures.push('DRIFT_ENGINE_STALE');if(ages.noBet==null||ages.noBet>420)silentFailures.push('NO_BET_OPTIMIZER_STALE');

  const integrityFailure=String(dataIntegrity.status||'').toUpperCase()==='FAIL'||String(temporalIntegrity.status||'').toUpperCase()==='FAIL';
  const evidenceFreeze=calStatus==='DEGRADED'||driftStatus==='DRIFT';
  const humanActionRequired=critical.length>0||quotaMode==='EMERGENCY'||integrityFailure;
  const recommendedMode=integrityFailure?'SAFE_OBSERVE_ONLY':critical.length?'SAFE_OBSERVE_ONLY':evidenceFreeze?'DEGRADED_MONITORING':degraded.length||silentFailures.length?'DEGRADED_MONITORING':'NORMAL';
  const state={version:'ARGUS-WATCHTOWER-3',generatedAt:new Date().toISOString(),healthScore,status,domains,silentFailures,humanActionRequired,recommendedMode,trustGate:{strongOutputsAllowed:!integrityFailure&&critical.length===0&&!evidenceFreeze,positivePromotionAllowed:!integrityFailure&&!evidenceFreeze,reason:integrityFailure?'Integrity violation detected':calStatus==='DEGRADED'?'Calibration degraded':driftStatus==='DRIFT'?'Model/market drift detected':critical.length?'Critical subsystem health detected':'No integrity or evidence-level veto detected'},message:humanActionRequired?'Human review recommended before trusting strong outputs.':silentFailures.length?'ARGUS is running but one or more freshness checks require attention.':'No human action required.',safeguards:{readOnlySupervisor:true,neverCreatesPrime:true,neverRaisesConfidence:true,automaticRealMoneyBetting:false,productionMutation:false,integrityFailureBlocksTrust:true,calibrationOrDriftCanFreezePositivePromotion:true,noBetOnlyReducesActionability:true},sources:{decisionPlan:plan.generatedAt||null,resourcePolicy:resource.generatedAt||null,selfImprovement:self.generatedAt||null,skillMap:skill.generatedAt||null,marketTruth:truth.generatedAt||null,marketSpecialists:specialists.generatedAt||null,ledgerLearning:ledger.generatedAt||null,dataIntegrity:dataIntegrity.generatedAt||null,temporalIntegrity:temporalIntegrity.generatedAt||null,calibrationWatchdog:calibration.generatedAt||null,driftEngine:drift.generatedAt||null,noBetOptimizer:noBet.generatedAt||null}};
  await writeJson(OUT,state);return res.status(200).json(state);
}
