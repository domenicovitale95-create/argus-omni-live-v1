import { readJson, storageReady } from './_report-store.js';

const PLAN='argus/autopilot/decision-plan.json';
const FINISHED=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);
const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'DECISION-INTEGRITY-AUDIT-2',status:'DEGRADED',error:'Storage unavailable',violations:[]});
  const state=await readJson(PLAN,{version:null,generatedAt:null,plan:[]}),rows=Array.isArray(state?.plan)?state.plan:[],violations=[];
  for(const r of rows){
    const id=String(r.fixtureId??'UNKNOWN'),match=`${r.home||'?'} vs ${r.away||'?'}`,verdict=String(r.finalVerdict||'NO BET').toUpperCase(),eligible=Boolean(r.betEligible),stake=Math.max(0,n(r.recommendedStakePct,0)||0),odds=n(r.stakeOdds??r.eligibilityCandidate?.odds,null),edge=n(r.eligibilityCandidate?.edgePct,null),confidence=n(r.netConfidence,null),decay=String(r.signalDecayStatus||'').toUpperCase(),movement=String(r.marketMovement||'').toUpperCase(),timing=String(r.timingAction||'').toUpperCase();
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
  return res.status(200).json({version:'DECISION-INTEGRITY-AUDIT-2',generatedAt:new Date().toISOString(),sourceVersion:state.version||null,sourceGeneratedAt:state.generatedAt||null,status,checked:rows.length,eligible:rows.filter(r=>r.betEligible).length,totalRecommendedStakePct:Number(totalStake.toFixed(2)),summary:{critical,high,violations:violations.length},violations:violations.slice(0,200),policy:{readOnly:true,providerCalls:false,persistentWrites:false,blockedGateMustNeverBeEligible:true,finishedMustNeverBeEligible:true,portfolioBlockMustNeverBeEligible:true,expiredOrDecayingMustNeverBeEligible:true,marketReversalMustNeverBeEligible:true,adverseSteamMustNeverBeEligible:true,waitTimingMustNotBeActionable:true,primeEdgeMinPct:6,primeConfidenceMin:68,valueEdgeMinPct:3.5,valueConfidenceMin:58,realPriceRequiredForEligible:true,stakeOnlyOnEligiblePrimeOrValue:true,dailyStakeCapPct:4,automaticWagering:false}})
}
