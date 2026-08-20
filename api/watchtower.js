import { readJson, writeJson, storageReady } from './_report-store.js';

const OUT='argus/watchtower/latest.json';
const ageMin=v=>{const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?Math.round((Date.now()-t)/60000):null};
const fresh=(v,max)=>{const a=ageMin(v);return a!=null&&a>=0&&a<=max};
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
function grade(score){if(score>=90)return'HEALTHY';if(score>=75)return'WATCH';if(score>=55)return'DEGRADED';return'CRITICAL'}
function domain(name,score,status,details={}){return{name,score:clamp(Math.round(score)),status,details}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Watchtower storage unavailable'});

  const [plan,resource,self,skill,truth,specialists,ledger]=await Promise.all([
    readJson('argus/autopilot/decision-plan.json',{}),
    readJson('argus/autopilot/resource-policy.json',{}),
    readJson('argus/self-improvement/latest.json',{}),
    readJson('argus/learning/skill-map.json',{}),
    readJson('argus/learning/market-truth.json',{}),
    readJson('argus/learning/market-specialists.json',{}),
    readJson('argus/learning/ledger-diagnostics.json',{})
  ]);

  const planAge=ageMin(plan.generatedAt),resourceAge=ageMin(resource.generatedAt),selfAge=ageMin(self.generatedAt),skillAge=ageMin(skill.generatedAt),truthAge=ageMin(truth.generatedAt),specialistAge=ageMin(specialists.generatedAt),ledgerAge=ageMin(ledger.generatedAt);
  const quotaMode=resource.quotaMode||resource.mode||'UNKNOWN';
  const dataScore=(fresh(plan.generatedAt,20)?35:10)+(fresh(skill.generatedAt,420)?25:10)+(fresh(truth.generatedAt,420)?20:8)+(fresh(specialists.generatedAt,420)?20:8);
  const automationScore=(fresh(plan.generatedAt,20)?35:10)+(fresh(resource.generatedAt,45)?25:10)+(fresh(self.generatedAt,420)?25:10)+(fresh(ledger.generatedAt,420)?15:6);
  const quotaScore=quotaMode==='EMERGENCY'?35:quotaMode==='SAFE'?60:quotaMode==='CONSERVE'?80:quotaMode==='NORMAL'||quotaMode==='EXPAND'?100:75;
  const ledgerStatus=String(ledger.status||ledger.globalStatus||'UNKNOWN').toUpperCase();
  const calibrationScore=ledgerStatus==='DEGRADED'?45:ledgerStatus==='CAUTION'?70:ledgerStatus==='VALIDATING_POSITIVE'?95:ledgerStatus==='LEARNING'?80:85;
  const learningScore=(fresh(self.generatedAt,420)?35:12)+(fresh(skill.generatedAt,420)?25:10)+(fresh(truth.generatedAt,420)?20:8)+(fresh(specialists.generatedAt,420)?20:8);

  const domains={
    DATA:domain('DATA',dataScore,grade(dataScore),{decisionPlanAgeMinutes:planAge,skillMapAgeMinutes:skillAge,marketTruthAgeMinutes:truthAge,specialistsAgeMinutes:specialistAge}),
    AUTOMATION:domain('AUTOMATION',automationScore,grade(automationScore),{resourceAgeMinutes:resourceAge,selfImprovementAgeMinutes:selfAge,ledgerLearningAgeMinutes:ledgerAge}),
    API_QUOTA:domain('API_QUOTA',quotaScore,grade(quotaScore),{quotaMode}),
    CALIBRATION:domain('CALIBRATION',calibrationScore,grade(calibrationScore),{ledgerStatus,sample:Number(ledger.sample||0),brier:ledger.brier??null,logLoss:ledger.logLoss??null,calibrationError:ledger.calibrationError??null}),
    LEARNING:domain('LEARNING',learningScore,grade(learningScore),{selfImprovementAgeMinutes:selfAge,skillMapAgeMinutes:skillAge,marketTruthAgeMinutes:truthAge,specialistsAgeMinutes:specialistAge})
  };

  const vals=Object.values(domains),healthScore=Math.round(vals.reduce((s,d)=>s+d.score,0)/vals.length),status=grade(healthScore);
  const critical=vals.filter(d=>d.status==='CRITICAL'),degraded=vals.filter(d=>d.status==='DEGRADED');
  const silentFailures=[];
  if(planAge==null||planAge>20)silentFailures.push('DECISION_PLAN_STALE');
  if(resourceAge==null||resourceAge>45)silentFailures.push('RESOURCE_POLICY_STALE');
  if(selfAge==null||selfAge>420)silentFailures.push('SELF_IMPROVEMENT_STALE');
  if(ledgerAge==null||ledgerAge>420)silentFailures.push('LEDGER_LEARNING_STALE');

  const humanActionRequired=critical.length>0||quotaMode==='EMERGENCY';
  const recommendedMode=critical.length?'SAFE_OBSERVE_ONLY':degraded.length||silentFailures.length?'DEGRADED_MONITORING':'NORMAL';
  const state={
    version:'ARGUS-WATCHTOWER-1',generatedAt:new Date().toISOString(),healthScore,status,domains,
    silentFailures,
    humanActionRequired,
    recommendedMode,
    message:humanActionRequired?'Human review recommended before trusting strong outputs.':silentFailures.length?'ARGUS is running but one or more freshness checks require attention.':'No human action required.',
    safeguards:{readOnlySupervisor:true,neverCreatesPrime:true,neverRaisesConfidence:true,automaticRealMoneyBetting:false,productionMutation:false},
    sources:{decisionPlan:plan.generatedAt||null,resourcePolicy:resource.generatedAt||null,selfImprovement:self.generatedAt||null,skillMap:skill.generatedAt||null,marketTruth:truth.generatedAt||null,marketSpecialists:specialists.generatedAt||null,ledgerLearning:ledger.generatedAt||null}
  };
  await writeJson(OUT,state);
  return res.status(200).json(state);
}
