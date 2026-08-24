import { readJson, writeJson, storageReady } from './_report-store.js';

const STATE_PATH='argus/cognitive/central-brain/latest.json';
const DECISION_PLAN_PATH='argus/autopilot/decision-plan.json';
const COGNITIVE_PATH='argus/cognitive/latest.json';
const GPT_PATH='argus/cognitive/gpt/latest.json';
const SELF_IMPROVEMENT_PATH='argus/self-improvement/latest.json';

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function upper(v){return String(v||'').trim().toUpperCase()}
function ageHours(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,(Date.now()-t)/36e5):Infinity}
function uniq(xs){return [...new Set((xs||[]).filter(Boolean))]}
function clamp(v,lo=0,hi=100){return Math.max(lo,Math.min(hi,n(v,0)))}
function priorityWeight(v){return{CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1}[upper(v)]||0}

function cognitivePosture(cognitive,selfImprovement){
  const active=Array.isArray(cognitive?.memory?.active)?cognitive.memory.active:[];
  const critical=active.filter(x=>upper(x.priority)==='CRITICAL');
  const high=active.filter(x=>upper(x.priority)==='HIGH');
  const confirmedUnresolved=active.filter(x=>upper(x.condition)==='CONFIRMED'&&upper(x.rootCause)==='UNRESOLVED');
  const criticalConfirmed=confirmedUnresolved.filter(x=>upper(x.priority)==='CRITICAL');
  const highConfirmed=confirmedUnresolved.filter(x=>upper(x.priority)==='HIGH');
  const recurringSevere=active.filter(x=>priorityWeight(x.priority)>=3&&n(x.occurrences,0)>=3);
  const memoryAgeHours=ageHours(cognitive?.generatedAt);
  const memoryMissing=!cognitive?.generatedAt;
  const memoryStale=memoryAgeHours>8;
  const promotionFreeze=Boolean(selfImprovement?.promotionFreeze);
  const integrityStatus=upper(selfImprovement?.results?.integrity?.status);
  const driftSeverity=upper(selfImprovement?.results?.drift?.severity);
  const hardGlobalBlock=criticalConfirmed.some(x=>n(x.occurrences,0)>=2)||(promotionFreeze&&['CRITICAL','FAIL','FAILED'].includes(integrityStatus));
  const caution=hardGlobalBlock||critical.length>0||highConfirmed.length>0||recurringSevere.length>0||memoryMissing||memoryStale||promotionFreeze||['HIGH','CRITICAL','SEVERE'].includes(driftSeverity);
  const mode=hardGlobalBlock?'BLOCK':caution?'CAUTION':'NORMAL';
  const reasons=[];
  if(criticalConfirmed.length)reasons.push(`CRITICAL_CONFIRMED_UNRESOLVED:${criticalConfirmed.length}`);
  if(highConfirmed.length)reasons.push(`HIGH_CONFIRMED_UNRESOLVED:${highConfirmed.length}`);
  if(recurringSevere.length)reasons.push(`RECURRING_SEVERE:${recurringSevere.length}`);
  if(memoryMissing)reasons.push('COGNITIVE_MEMORY_MISSING');
  else if(memoryStale)reasons.push(`COGNITIVE_MEMORY_STALE:${memoryAgeHours.toFixed(1)}H`);
  if(promotionFreeze)reasons.push('SELF_IMPROVEMENT_PROMOTION_FREEZE');
  if(['HIGH','CRITICAL','SEVERE'].includes(driftSeverity))reasons.push(`STRUCTURAL_DRIFT:${driftSeverity}`);
  if(!reasons.length)reasons.push('NO_SYSTEMIC_COGNITIVE_RISK');
  return{mode,reasons,memoryAgeHours:Number.isFinite(memoryAgeHours)?Number(memoryAgeHours.toFixed(2)):null,active:active.length,critical:critical.length,high:high.length,confirmedUnresolved:confirmedUnresolved.length,criticalConfirmed:criticalConfirmed.length,highConfirmed:highConfirmed.length,recurringSevere:recurringSevere.length,promotionFreeze,integrityStatus:integrityStatus||null,driftSeverity:driftSeverity||null};
}

function localRisk(d={}){
  const hard=[],soft=[];
  const robustness=upper(d.robustnessStatus||d.robustnessTest?.status);
  const stability=upper(d.decisionStabilityStatus||d.decisionStability?.status);
  const uncertainty=upper(d.uncertaintyBudget?.status||d.uncertaintyBudget?.level);
  const agreement=upper(d.crossSourceAgreement?.status||d.crossSourceAgreement?.agreement);
  const freshness=upper(d.evidenceFreshness?.status||d.evidenceFreshness);
  const decay=upper(d.signalDecay?.status||d.signalDecayStatus);
  const timing=upper(d.timingAction);
  if(['BLOCKED','FAIL','FAILED','CRITICAL'].includes(robustness))hard.push(`ROBUSTNESS_${robustness}`);
  else if(['FRAGILE','WEAK','CAUTION'].includes(robustness))soft.push(`ROBUSTNESS_${robustness}`);
  if(['BLOCKED','FAIL','FAILED','UNSTABLE','CRITICAL'].includes(stability))hard.push(`STABILITY_${stability}`);
  else if(['FRAGILE','CAUTION','VOLATILE'].includes(stability))soft.push(`STABILITY_${stability}`);
  if(['BLOCKED','EXHAUSTED','CRITICAL','FAIL','FAILED'].includes(uncertainty))hard.push(`UNCERTAINTY_${uncertainty}`);
  else if(['HIGH','CAUTION','TIGHT'].includes(uncertainty))soft.push(`UNCERTAINTY_${uncertainty}`);
  if(['CONFLICT','CONFLICTING','FAIL','FAILED','CRITICAL'].includes(agreement))hard.push(`SOURCE_AGREEMENT_${agreement}`);
  else if(['WEAK','LOW','CAUTION'].includes(agreement))soft.push(`SOURCE_AGREEMENT_${agreement}`);
  if(['STALE','EXPIRED','FAIL','FAILED'].includes(freshness))soft.push(`EVIDENCE_${freshness}`);
  if(decay==='EXPIRED')hard.push('SIGNAL_EXPIRED');
  else if(['DECAYING','AGING'].includes(decay))soft.push(`SIGNAL_${decay}`);
  if(timing==='WAIT')soft.push('TIMING_WAIT');
  return{hard:uniq(hard),soft:uniq(soft)};
}

function downgradeVerdict(verdict,steps=1){
  const v=upper(verdict),order=['PRIME','VALUE','WATCH','NO BET'],i=order.indexOf(v);
  if(i<0)return v||'NO BET';
  return order[Math.min(order.length-1,i+Math.max(0,steps))];
}

function brainAction(source,posture){
  const risk=localRisk(source),before=upper(source?.verdict??source?.finalVerdict)||'NO BET';
  const beforeEligible=Boolean(source?.eligible??source?.betEligible);
  let verdict=before,eligible=beforeEligible,penalty=0,action='KEEP';
  const reasons=[];
  if(posture.mode==='BLOCK'&&eligible){verdict='NO BET';eligible=false;action='BLOCK';penalty=100;reasons.push(...posture.reasons)}
  else if(risk.hard.length&&eligible){verdict='NO BET';eligible=false;action='BLOCK';penalty=100;reasons.push(...risk.hard)}
  else{
    if(posture.mode==='CAUTION'&&verdict==='PRIME'){verdict='VALUE';action='PENALIZE';penalty=Math.max(penalty,6);reasons.push('SYSTEMIC_COGNITIVE_CAUTION')}
    if(risk.soft.length>=2&&['PRIME','VALUE'].includes(verdict)){verdict=downgradeVerdict(verdict,1);action='PENALIZE';penalty=Math.max(penalty,6+Math.min(6,risk.soft.length*2));reasons.push(...risk.soft);if(verdict==='WATCH')eligible=false}
    else if(risk.soft.length===1&&verdict==='PRIME'){verdict='VALUE';action='PENALIZE';penalty=Math.max(penalty,4);reasons.push(...risk.soft)}
  }
  return{risk,before,beforeEligible,verdict,eligible,penalty,action,reasons:uniq(reasons),changed:verdict!==before||eligible!==beforeEligible};
}

function decisionWithBrain(id,d,posture){
  const a=brainAction(d,posture),confidence=d?.confidence&&typeof d.confidence==='object'?{...d.confidence}:null;
  if(confidence&&a.penalty>0&&a.penalty<100){const old=n(confidence.net,0);confidence.preCentralBrainNet=old;confidence.centralBrainPenalty=a.penalty;confidence.net=Number(clamp(old-a.penalty).toFixed(2));confidence.penalty=n(confidence.penalty,0)+a.penalty}
  const issues=uniq([...(Array.isArray(d?.issues)?d.issues:[]),...(a.changed?[`CENTRAL_BRAIN_${a.action}`]:[]),...a.reasons]);
  return{...d,verdict:a.verdict,eligible:a.eligible,issues,confidence,centralBrain:{version:'CENTRAL-BRAIN-1',fixtureId:id,action:a.action,beforeVerdict:a.before,afterVerdict:a.verdict,changed:a.changed,penalty:a.penalty<100?a.penalty:null,systemMode:posture.mode,systemReasons:posture.reasons,localHardRisk:a.risk.hard,localSoftRisk:a.risk.soft,authority:'DOWNGRADE_OR_BLOCK_ONLY'}};
}

function planRowWithBrain(row,posture){
  const a=brainAction(row,posture),oldConfidence=n(row?.netConfidence,0),nextConfidence=a.penalty>0&&a.penalty<100?Number(clamp(oldConfidence-a.penalty).toFixed(2)):oldConfidence;
  let tier=row?.tier||a.verdict,score=n(row?.score,0),stake=n(row?.recommendedStakePct,0);
  if(a.verdict==='VALUE'){tier='VALUE';score=Math.min(score,77)}
  else if(a.verdict==='WATCH'){tier='WATCH';score=Math.min(score,59)}
  else if(a.verdict==='NO BET'){tier=row?.tier==='ARCHIVE'?'ARCHIVE':'BASE';score=Math.min(score,39)}
  if(!a.eligible||a.action==='BLOCK')stake=0;
  const issues=uniq([...(Array.isArray(row?.eligibilityIssues)?row.eligibilityIssues:[]),...(a.changed?[`CENTRAL_BRAIN_${a.action}`]:[]),...a.reasons]);
  return{...row,preCentralBrainVerdict:a.before,finalVerdict:a.verdict,betEligible:a.eligible,tier,score,netConfidence:nextConfidence,eligibilityIssues:issues,recommendedStakePct:stake,recommendedUnits:stake,centralBrain:{version:'CENTRAL-BRAIN-1',action:a.action,beforeVerdict:a.before,afterVerdict:a.verdict,changed:a.changed,penalty:a.penalty<100?a.penalty:null,systemMode:posture.mode,systemReasons:posture.reasons,localHardRisk:a.risk.hard,localSoftRisk:a.risk.soft,authority:'FINAL_VETO_DOWNGRADE_OR_BLOCK_ONLY'},reason:`CENTRAL BRAIN ${a.action}${a.reasons.length?` (${a.reasons.join(', ')})`:''} · ${row?.reason||''}`};
}

function planSummary(plan,prior={}){
  return{...prior,total:plan.length,prime:plan.filter(x=>x.finalVerdict==='PRIME'&&x.betEligible).length,value:plan.filter(x=>x.finalVerdict==='VALUE'&&x.betEligible).length,watch:plan.filter(x=>x.finalVerdict==='WATCH').length,noBet:plan.filter(x=>x.finalVerdict==='NO BET').length,eligible:plan.filter(x=>x.betEligible).length,centralBrainChanged:plan.filter(x=>x.centralBrain?.changed).length,centralBrainBlocked:plan.filter(x=>x.centralBrain?.action==='BLOCK').length,centralBrainPenalized:plan.filter(x=>x.centralBrain?.action==='PENALIZE').length};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!storageReady())return res.status(503).json({ok:false,version:'CENTRAL-BRAIN-1',status:'CRITICAL',error:'Storage unavailable'});
  if(req.method==='GET')return res.status(200).json(await readJson(STATE_PATH,{ok:true,version:'CENTRAL-BRAIN-1',generatedAt:null,status:'UNINITIALIZED',summary:{}}));
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const [cognitive,gpt,selfImprovement]=await Promise.all([readJson(COGNITIVE_PATH,null),readJson(GPT_PATH,null),readJson(SELF_IMPROVEMENT_PATH,null)]);
  const posture=cognitivePosture(cognitive,selfImprovement),advisoryWarnings=Array.isArray(gpt?.review?.warnings)?gpt.review.warnings.slice(0,8):[];
  const eligibility=req.body?.eligibility&&typeof req.body.eligibility==='object'?req.body.eligibility:null;
  const scheduler=req.body?.scheduler&&typeof req.body.scheduler==='object'?req.body.scheduler:null;
  const inputPlan=Array.isArray(req.body?.plan)?req.body.plan:Array.isArray(scheduler?.plan)?scheduler.plan:null;
  let protectedEligibility=null,protectedScheduler=null,rows=[];

  if(eligibility){const decisions=eligibility.decisions&&typeof eligibility.decisions==='object'?eligibility.decisions:{},out={};for(const [id,d] of Object.entries(decisions))out[id]=decisionWithBrain(id,d||{},posture);rows=Object.values(out);protectedEligibility={...eligibility,decisions:out}}
  if(inputPlan){const plan=inputPlan.map(row=>planRowWithBrain(row||{},posture));rows=plan;const base=scheduler||await readJson(DECISION_PLAN_PATH,{version:'DECISION-SCHEDULER',generatedAt:null,plan:[],summary:{}});protectedScheduler={...base,plan,summary:planSummary(plan,base?.summary||{}),centralBrain:{version:'CENTRAL-BRAIN-1',appliedAt:new Date().toISOString(),systemMode:posture.mode,systemReasons:posture.reasons,finalAuthority:true,mayUpgrade:false}};await writeJson(DECISION_PLAN_PATH,protectedScheduler)}

  const changed=rows.filter(x=>x.centralBrain?.changed),blocked=rows.filter(x=>x.centralBrain?.action==='BLOCK'),penalized=rows.filter(x=>x.centralBrain?.action==='PENALIZE');
  const summary={total:rows.length,changed:changed.length,blocked:blocked.length,penalized:penalized.length,kept:rows.length-changed.length,systemMode:posture.mode,systemReasons:posture.reasons,gptAdvisoryAvailable:Boolean(gpt?.reviewValidJson),gptAdvisoryWarnings:advisoryWarnings.length,planGateApplied:Boolean(inputPlan)};
  if(protectedEligibility)protectedEligibility.summary={...(protectedEligibility.summary||{}),centralBrain:summary};
  const snapshot={ok:true,version:'CENTRAL-BRAIN-1',generatedAt:new Date().toISOString(),status:posture.mode==='BLOCK'?'PROTECTIVE_BLOCK':posture.mode==='CAUTION'?'CAUTION':'HEALTHY',policy:{mayUpgrade:false,mayCreateCandidate:false,mayIncreaseConfidence:false,mayIncreaseStake:false,mayUnlockPrime:false,mayDowngrade:true,mayBlock:true,llmDirectAuthority:false,governanceVeto:true,finalDecisionPlanGate:Boolean(inputPlan)},posture,gpt:{generatedAt:gpt?.generatedAt||null,model:gpt?.model||null,reviewValidJson:Boolean(gpt?.reviewValidJson),advisoryWarnings},selfImprovement:{generatedAt:selfImprovement?.generatedAt||null,promotionFreeze:Boolean(selfImprovement?.promotionFreeze)},summary,eligibility:protectedEligibility,scheduler:protectedScheduler?{generatedAt:protectedScheduler.generatedAt||null,summary:protectedScheduler.summary,centralBrain:protectedScheduler.centralBrain}:null};
  await writeJson(STATE_PATH,snapshot);
  return res.status(200).json(snapshot);
}
