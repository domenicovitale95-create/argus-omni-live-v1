import { readJson, storageReady } from './_report-store.js';

const PLAN='argus/autopilot/decision-plan.json';
const FINISHED=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);
const LIVE_MODEL='LIVE-V2-MARKET-CALIBRATED-STATE-POISSON';
const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};
function close(a,b,tol){return a!=null&&b!=null&&Math.abs(a-b)<=tol}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'DECISION-INTEGRITY-AUDIT-4',status:'DEGRADED',error:'Storage unavailable',violations:[]});
  const state=await readJson(PLAN,{version:null,generatedAt:null,plan:[]}),rows=Array.isArray(state?.plan)?state.plan:[],violations=[];
  for(const r of rows){
    const id=String(r.fixtureId??'UNKNOWN'),match=`${r.home||'?'} vs ${r.away||'?'}`,verdict=String(r.finalVerdict||'NO BET').toUpperCase(),eligible=Boolean(r.betEligible),stake=Math.max(0,n(r.recommendedStakePct,0)||0),c=r.eligibilityCandidate||{},odds=n(r.stakeOdds??c.odds,null),p=n(c.probability,null),fair=n(c.fairOdds,null),edge=n(c.edgePct,null),ev=n(c.evPct,null),marketP=n(c.marketProbability,null)??(p!=null&&edge!=null?p-edge/100:null),confidence=n(r.netConfidence,null),decay=String(r.signalDecayStatus||'').toUpperCase(),movement=String(r.marketMovement||'').toUpperCase(),timing=String(r.timingAction||'').toUpperCase(),isLive=Boolean(r.isLive);
    const push=(type,severity='CRITICAL',extra={})=>violations.push({id,match,type,severity,...extra});
    if(eligible&&!['PRIME','VALUE'].includes(verdict))push('ELIGIBLE_WITH_NON_BET_VERDICT','CRITICAL',{verdict});
    if(eligible&&FINISHED.has(String(r.status||'').toUpperCase()))push('FINISHED_FIXTURE_ELIGIBLE','CRITICAL',{status:r.status});
    if(eligible&&r.preKickoffGate==='BLOCKED')push('BLOCKED_GATE_BYPASSED');
    if(eligible&&r.portfolioBlocked)push('PORTFOLIO_BLOCK_BYPASSED');
    if(eligible&&['EXPIRED','DECAYING'].includes(decay))push('SIGNAL_DECAY_VETO_BYPASSED','CRITICAL',{decay});
    if(eligible&&movement==='REVERSAL')push('MARKET_REVERSAL_BYPASSED');
    if(eligible&&movement==='ADVERSE_STEAM')push('ADVERSE_STEAM_BYPASSED');
    if(eligible&&timing==='WAIT')push('WAIT_TIMING_BYPASSED','HIGH');
    if(stake>0&&!eligible)push('STAKE_ON_INELIGIBLE_DECISION','CRITICAL',{stakePct:stake});
    if(stake>0&&!['PRIME','VALUE'].includes(verdict))push('STAKE_ON_NON_BET_VERDICT','CRITICAL',{verdict,stakePct:stake});
    if(eligible&&!(odds>1))push('ELIGIBLE_WITHOUT_REAL_PRICE','CRITICAL',{odds});
    if(p!=null&&!(p>0&&p<1))push('PROBABILITY_OUT_OF_RANGE','CRITICAL',{probability:p});
    if(p!=null&&fair!=null&&!close(fair,1/p,Math.max(.03,(1/p)*.015)))push('FAIR_ODDS_PROBABILITY_MISMATCH','CRITICAL',{probability:p,fairOdds:fair,expectedFairOdds:Number((1/p).toFixed(4))});
    if(p!=null&&marketP!=null&&edge!=null&&!close(edge,(p-marketP)*100,.2))push('EDGE_PROBABILITY_MISMATCH','CRITICAL',{probability:p,marketProbability:marketP,edgePct:edge,expectedEdgePct:Number(((p-marketP)*100).toFixed(3))});
    if(p!=null&&odds>1&&ev!=null&&!close(ev,(p*odds-1)*100,.25))push('EV_PROBABILITY_PRICE_MISMATCH','CRITICAL',{probability:p,odds,evPct:ev,expectedEvPct:Number(((p*odds-1)*100).toFixed(3))});
    if(eligible&&(!p||fair==null||edge==null||ev==null))push('ELIGIBLE_DECISION_MISSING_MATH_FIELDS','CRITICAL',{probability:p,fairOdds:fair,edgePct:edge,evPct:ev});
    if(eligible&&!(ev>0))push('ELIGIBLE_WITH_NON_POSITIVE_EV','CRITICAL',{evPct:ev});
    if(eligible&&fair!=null&&odds!=null&&!(odds>fair))push('ELIGIBLE_PRICE_NOT_ABOVE_FAIR_ODDS','CRITICAL',{odds,fairOdds:fair});
    if(isLive&&eligible){if(c.modelVersion!==LIVE_MODEL)push('LIVE_ELIGIBLE_WITHOUT_CANONICAL_MODEL','CRITICAL',{modelVersion:c.modelVersion||null});if(c.validationStatus!=='VALIDATED')push('LIVE_ELIGIBLE_WITHOUT_EMPIRICAL_VALIDATION','CRITICAL',{validationStatus:c.validationStatus||null});const age=n(c.observedAgeSeconds,null),maxAge=n(r.minute,0)>=80?45:75;if(age==null)push('LIVE_ELIGIBLE_WITH_UNKNOWN_SNAPSHOT_AGE','CRITICAL');else if(age>maxAge)push('LIVE_ELIGIBLE_WITH_STALE_SNAPSHOT','CRITICAL',{observedAgeSeconds:age,maxAgeSeconds:maxAge})}
    if(verdict==='PRIME'&&confidence!=null&&confidence<68)push('PRIME_CONFIDENCE_BELOW_POLICY','HIGH',{confidence});
    if(verdict==='PRIME'&&edge!=null&&edge<6)push('PRIME_EDGE_BELOW_POLICY','HIGH',{edgePct:edge});
    if(verdict==='VALUE'&&confidence!=null&&confidence<58)push('VALUE_CONFIDENCE_BELOW_POLICY','HIGH',{confidence});
    if(verdict==='VALUE'&&edge!=null&&edge<3.5)push('VALUE_EDGE_BELOW_POLICY','HIGH',{edgePct:edge});
    if(verdict==='PRIME'&&r.learningStatus==='DEGRADED')push('PRIME_SURVIVED_DEGRADED_LEARNING','HIGH');
    if(verdict==='PRIME'&&r.learningStatus==='CAUTION')push('PRIME_SURVIVED_CAUTION_LEARNING','HIGH');
    if(verdict==='PRIME'&&decay==='AGING')push('PRIME_SURVIVED_AGING_SIGNAL','HIGH');
    if(verdict==='PRIME'&&stake>1.5+1e-9)push('PRIME_STAKE_CAP_EXCEEDED','CRITICAL',{stakePct:stake});
    if(verdict==='VALUE'&&stake>.75+1e-9)push('VALUE_STAKE_CAP_EXCEEDED','CRITICAL',{stakePct:stake});
  }
  const totalStake=rows.reduce((s,r)=>s+(Boolean(r.betEligible)?Math.max(0,n(r.recommendedStakePct,0)||0):0),0);
  if(totalStake>4+1e-9)violations.push({id:'PORTFOLIO',match:'ALL ACTIVE POSITIONS',type:'DAILY_STAKE_CAP_EXCEEDED',severity:'CRITICAL',stakePct:Number(totalStake.toFixed(2))});
  const critical=violations.filter(x=>x.severity==='CRITICAL').length,high=violations.filter(x=>x.severity==='HIGH').length,status=critical?'FAIL':high?'CAUTION':'PASS';
  return res.status(200).json({version:'DECISION-INTEGRITY-AUDIT-4',generatedAt:new Date().toISOString(),sourceVersion:state.version||null,sourceGeneratedAt:state.generatedAt||null,status,checked:rows.length,eligible:rows.filter(r=>r.betEligible).length,totalRecommendedStakePct:Number(totalStake.toFixed(2)),summary:{critical,high,violations:violations.length},violations:violations.slice(0,300),policy:{readOnly:true,providerCalls:false,persistentWrites:false,probabilityFairOddsInvariant:true,edgeProbabilityInvariant:true,evProbabilityPriceInvariant:true,positiveExpectedValueRequired:true,offeredOddsMustExceedFairOdds:true,canonicalLiveModel:LIVE_MODEL,liveEmpiricalValidationRequired:true,liveSnapshotAgeRequired:true,liveLateSnapshotMaxAgeSeconds:45,liveOtherSnapshotMaxAgeSeconds:75,blockedGateMustNeverBeEligible:true,finishedMustNeverBeEligible:true,portfolioBlockMustNeverBeEligible:true,expiredOrDecayingMustNeverBeEligible:true,marketReversalMustNeverBeEligible:true,adverseSteamMustNeverBeEligible:true,waitTimingMustNotBeActionable:true,primeEdgeMinPct:6,primeConfidenceMin:68,valueEdgeMinPct:3.5,valueConfidenceMin:58,realPriceRequiredForEligible:true,stakeOnlyOnEligiblePrimeOrValue:true,dailyStakeCapPct:4,automaticWagering:false}})
}
