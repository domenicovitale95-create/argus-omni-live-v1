import { readJson, writeJson, storageReady } from './_report-store.js';

const STATE_PATH='argus/cognitive/central-brain/latest.json';
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

  const hardGlobalBlock=criticalConfirmed.some(x=>n(x.occurrences,0)>=2)
    || (promotionFreeze&&['CRITICAL','FAIL','FAILED'].includes(integrityStatus));
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
  const v=upper(verdict);
  const order=['PRIME','VALUE','WATCH','NO BET'];
  const i=order.indexOf(v);
  if(i<0)return v||'NO BET';
  return order[Math.min(order.length-1,i+Math.max(0,steps))];
}

function applyDecision(id,d,posture){
  const risk=localRisk(d),before=upper(d?.verdict)||'NO BET';
  let verdict=before,eligible=Boolean(d?.eligible),penalty=0,action='KEEP';
  const reasons=[];

  if(posture.mode==='BLOCK'&&eligible){
    verdict='NO BET';eligible=false;action='BLOCK';penalty=100;reasons.push(...posture.reasons);
  }else if(risk.hard.length&&eligible){
    verdict='NO BET';eligible=false;action='BLOCK';penalty=100;reasons.push(...risk.hard);
  }else{
    if(posture.mode==='CAUTION'&&verdict==='PRIME'){
      verdict='VALUE';action='PENALIZE';penalty=Math.max(penalty,6);reasons.push('SYSTEMIC_COGNITIVE_CAUTION');
    }
    if(risk.soft.length>=2&&['PRIME','VALUE'].includes(verdict)){
      verdict=downgradeVerdict(verdict,1);action='PENALIZE';penalty=Math.max(penalty,6+Math.min(6,risk.soft.length*2));reasons.push(...risk.soft);
      if(verdict==='WATCH')eligible=false;
    }else if(risk.soft.length===1&&verdict==='PRIME'){
      verdict='VALUE';action='PENALIZE';penalty=Math.max(penalty,4);reasons.push(...risk.soft);
    }
  }

  const confidence=d?.confidence&&typeof d.confidence==='object'?{...d.confidence}:null;
  if(confidence&&penalty>0&&penalty<100){
    const oldNet=n(confidence.net,0);
    confidence.preCentralBrainNet=oldNet;
    confidence.centralBrainPenalty=penalty;
    confidence.net=Number(clamp(oldNet-penalty).toFixed(2));
    confidence.penalty=n(confidence.penalty,0)+penalty;
  }
  const changed=verdict!==before||eligible!==Boolean(d?.eligible);
  const issues=uniq([...(Array.isArray(d?.issues)?d.issues:[]),...(changed?['CENTRAL_BRAIN_'+action]:[]),...reasons]);
  return{...d,verdict,eligible,issues,confidence,centralBrain:{version:'CENTRAL-BRAIN-1',fixtureId:id,action,beforeVerdict:before,afterVerdict:verdict,changed,penalty:penalty<100?penalty:null,systemMode:posture.mode,systemReasons:posture.reasons,localHardRisk:risk.hard,localSoftRisk:risk.soft,authority:'DOWNGRADE_OR_BLOCK_ONLY'}};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!storageReady())return res.status(503).json({ok:false,version:'CENTRAL-BRAIN-1',status:'CRITICAL',error:'Storage unavailable'});
  if(req.method==='GET')return res.status(200).json(await readJson(STATE_PATH,{ok:true,version:'CENTRAL-BRAIN-1',generatedAt:null,status:'UNINITIALIZED',summary:{}}));
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const eligibility=req.body?.eligibility&&typeof req.body.eligibility==='object'?req.body.eligibility:{},decisions=eligibility.decisions&&typeof eligibility.decisions==='object'?eligibility.decisions:{};
  const [cognitive,gpt,selfImprovement]=await Promise.all([
    readJson(COGNITIVE_PATH,null),
    readJson(GPT_PATH,null),
    readJson(SELF_IMPROVEMENT_PATH,null)
  ]);
  const posture=cognitivePosture(cognitive,selfImprovement);
  const out={};
  for(const [id,d] of Object.entries(decisions))out[id]=applyDecision(id,d||{},posture);

  const rows=Object.values(out),changed=rows.filter(x=>x.centralBrain?.changed),blocked=rows.filter(x=>x.centralBrain?.action==='BLOCK'),penalized=rows.filter(x=>x.centralBrain?.action==='PENALIZE');
  const advisoryWarnings=Array.isArray(gpt?.review?.warnings)?gpt.review.warnings.slice(0,8):[];
  const summary={total:rows.length,changed:changed.length,blocked:blocked.length,penalized:penalized.length,kept:rows.length-changed.length,systemMode:posture.mode,systemReasons:posture.reasons,gptAdvisoryAvailable:Boolean(gpt?.reviewValidJson),gptAdvisoryWarnings:advisoryWarnings.length};
  const snapshot={ok:true,version:'CENTRAL-BRAIN-1',generatedAt:new Date().toISOString(),status:posture.mode==='BLOCK'?'PROTECTIVE_BLOCK':posture.mode==='CAUTION'?'CAUTION':'HEALTHY',policy:{mayUpgrade:false,mayCreateCandidate:false,mayIncreaseConfidence:false,mayIncreaseStake:false,mayUnlockPrime:false,mayDowngrade:true,mayBlock:true,llmDirectAuthority:false,governanceVeto:true},posture,gpt:{generatedAt:gpt?.generatedAt||null,model:gpt?.model||null,reviewValidJson:Boolean(gpt?.reviewValidJson),advisoryWarnings},selfImprovement:{generatedAt:selfImprovement?.generatedAt||null,promotionFreeze:Boolean(selfImprovement?.promotionFreeze)},summary,eligibility:{...eligibility,decisions:out,summary:{...(eligibility.summary||{}),centralBrain:summary}}};
  await writeJson(STATE_PATH,{...snapshot,eligibility:{summary:snapshot.eligibility.summary,decisions:Object.fromEntries(Object.entries(out).map(([id,d])=>[id,{verdict:d.verdict,eligible:d.eligible,centralBrain:d.centralBrain}]))}});
  return res.status(200).json(snapshot);
}
