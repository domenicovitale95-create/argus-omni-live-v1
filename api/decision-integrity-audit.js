import { readJson, storageReady } from './_report-store.js';

const PLAN='argus/autopilot/decision-plan.json';
const FINISHED=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);
const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'DECISION-INTEGRITY-AUDIT-1',status:'DEGRADED',error:'Storage unavailable',violations:[]});
  const state=await readJson(PLAN,{version:null,generatedAt:null,plan:[]}),rows=Array.isArray(state?.plan)?state.plan:[],violations=[];
  for(const r of rows){
    const id=String(r.fixtureId??'UNKNOWN'),verdict=String(r.finalVerdict||'NO BET').toUpperCase(),eligible=Boolean(r.betEligible),stake=Math.max(0,n(r.recommendedStakePct,0)||0),odds=n(r.stakeOdds??r.eligibilityCandidate?.odds,null);
    if(eligible&&!['PRIME','VALUE'].includes(verdict))violations.push({id,type:'ELIGIBLE_WITH_NON_BET_VERDICT',verdict});
    if(eligible&&FINISHED.has(String(r.status||'').toUpperCase()))violations.push({id,type:'FINISHED_FIXTURE_ELIGIBLE',status:r.status});
    if(eligible&&r.preKickoffGate==='BLOCKED')violations.push({id,type:'BLOCKED_GATE_BYPASSED'});
    if(eligible&&r.portfolioBlocked)violations.push({id,type:'PORTFOLIO_BLOCK_BYPASSED'});
    if(stake>0&&!eligible)violations.push({id,type:'STAKE_ON_INELIGIBLE_DECISION',stakePct:stake});
    if(stake>0&&!['PRIME','VALUE'].includes(verdict))violations.push({id,type:'STAKE_ON_NON_BET_VERDICT',verdict,stakePct:stake});
    if(eligible&&!(odds>1))violations.push({id,type:'ELIGIBLE_WITHOUT_REAL_PRICE',odds});
    if(verdict==='PRIME'&&r.learningStatus==='DEGRADED')violations.push({id,type:'PRIME_SURVIVED_DEGRADED_LEARNING'});
    if(verdict==='PRIME'&&r.learningStatus==='CAUTION')violations.push({id,type:'PRIME_SURVIVED_CAUTION_LEARNING'});
    if(verdict==='PRIME'&&stake>1.5+1e-9)violations.push({id,type:'PRIME_STAKE_CAP_EXCEEDED',stakePct:stake});
    if(verdict==='VALUE'&&stake>.75+1e-9)violations.push({id,type:'VALUE_STAKE_CAP_EXCEEDED',stakePct:stake});
  }
  const totalStake=rows.reduce((s,r)=>s+(Boolean(r.betEligible)?Math.max(0,n(r.recommendedStakePct,0)||0):0),0);
  if(totalStake>4+1e-9)violations.push({id:'PORTFOLIO',type:'DAILY_STAKE_CAP_EXCEEDED',stakePct:Number(totalStake.toFixed(2))});
  const status=violations.length?'FAIL':'PASS';
  return res.status(200).json({version:'DECISION-INTEGRITY-AUDIT-1',generatedAt:new Date().toISOString(),sourceVersion:state.version||null,sourceGeneratedAt:state.generatedAt||null,status,checked:rows.length,eligible:rows.filter(r=>r.betEligible).length,totalRecommendedStakePct:Number(totalStake.toFixed(2)),violations:violations.slice(0,200),policy:{readOnly:true,providerCalls:false,persistentWrites:false,blockedGateMustNeverBeEligible:true,finishedMustNeverBeEligible:true,portfolioBlockMustNeverBeEligible:true,realPriceRequiredForEligible:true,stakeOnlyOnEligiblePrimeOrValue:true,dailyStakeCapPct:4,automaticWagering:false}})
}
