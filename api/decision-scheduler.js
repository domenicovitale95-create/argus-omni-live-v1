import { readJson, writeJson, storageReady } from './_report-store.js';

const KEY='argus:intel:decision_scheduler:v1';
const STORE_TTL=20*60;
const VERSION='DECISION-SCHEDULER-14-FLOW-RECOVERY';
function noStore(res){res.setHeader('Cache-Control','no-store, max-age=0');}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function refTime(){return new Date();}
function ikick(m){const t=Date.parse(m?.kickoff||'');return Number.isFinite(t)?t:null}
function implied(o){return n(o)>1?1/n(o):0}
function marketProb(m={}){const h=implied(m.home),d=implied(m.draw),a=implied(m.away),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function modelProb(match){const p=match?.preMatchModel||match?.model||{},h=n(p.home),d=n(p.draw),a=n(p.away),s=h+d+a;if(s<=0)return null;return{home:h/s,draw:d/s,away:a/s}}
function qualityPct(raw){if(raw===null||raw===undefined||raw==='')return null;const x=Number(raw);if(!Number.isFinite(x))return null;const scaled=x>=0&&x<=1?x*100:x;return Math.max(0,Math.min(100,scaled))}
function dataQuality(match,decision){return qualityPct(match?.dataQuality??match?.quality??decision?.dataQuality??decision?.candidate?.dataQuality)}
function decisionsOf(body={}){const raw=body?.eligibility&&typeof body.eligibility==='object'?body.eligibility:{};return raw.decisions&&typeof raw.decisions==='object'?raw.decisions:raw}
function portfolioOf(body={}){const raw=body?.portfolio&&typeof body.portfolio==='object'?body.portfolio:{};return raw.portfolio&&typeof raw.portfolio==='object'?raw.portfolio:raw}
function stakesOf(body={}){const raw=body?.staking&&typeof body.staking==='object'?body.staking:{};return raw.stakes&&typeof raw.stakes==='object'?raw.stakes:raw}
function gatesOf(body={}){const out={};for(const g of Array.isArray(body?.preKickoffGates)?body.preKickoffGates:[]){const id=g?.fixtureId??g?.matchId??g?.id;if(id!==null&&id!==undefined)out[String(id)]=g}return out}
function pricedCandidate(decision){const c=decision?.candidate||null,odds=n(c?.odds),edge=n(c?.edgePct,NaN),prob=n(c?.probability,NaN);if(!c||!(odds>1)||!Number.isFinite(edge)||!Number.isFinite(prob)||!(prob>0&&prob<1))return null;return{side:c.side||c.selection||null,label:c.label||c.side||c.selection||null,marketType:c.marketType||null,edge,prob,decisionScore:n(c.decisionScore),source:'ELIGIBILITY_MULTI_MARKET'}}
function best1x2Residual(match){const market=marketProb(match?.markets),model=modelProb(match);if(!market||!model)return null;return ['home','draw','away'].map(k=>({side:k,label:k.toUpperCase(),marketType:'RESULT',edge:(model[k]-market[k])*100,prob:model[k],decisionScore:0,source:'1X2_FALLBACK'})).sort((a,b)=>b.edge-a.edge)[0]}
function bestResidual(match,decision){return pricedCandidate(decision)||best1x2Residual(match)}
function hasPricedMarket(match,decision){if(pricedCandidate(decision))return true;return[match?.markets?.home,match?.markets?.draw,match?.markets?.away].some(o=>n(o)>1)}
function tier(match,decision=null){
 let score=0;const reasons=[];const kickoff=ikick(match),now=Date.now(),mins=kickoff?(kickoff-now)/60000:null;
 if(match?.isLive){score+=40;reasons.push('live match');}
 if(mins!=null&&mins>=0&&mins<=120){score+=28;reasons.push('kickoff <=120m');}
 else if(mins!=null&&mins>120&&mins<=720){score+=12;reasons.push('kickoff <=12h');}
 const res=bestResidual(match,decision);
 if(res){score+=Math.min(35,Math.max(0,n(res.edge)*3));reasons.push(`market residual ${n(res.edge).toFixed(1)}% · ${res.label||res.side||'candidate'}`);if(res.source==='ELIGIBILITY_MULTI_MARKET')reasons.push('multi-market candidate')}
 const urgency=match?.riskFlags||match?.context?.riskFlags||[];
 if(Array.isArray(urgency)&&urgency.length){score-=Math.min(20,urgency.length*4);reasons.push('risk flags')}
 const dq=dataQuality(match,decision);if(dq!=null&&dq<55){score-=18;reasons.push(`low data quality ${dq.toFixed(0)}/100`)}else if(dq==null){score-=8;reasons.push('data quality unavailable')}
 if(!hasPricedMarket(match,decision)){score-=18;reasons.push('no priced market')}
 const meta={prioritySelection:res?.side||null,priorityLabel:res?.label||null,priorityMarketType:res?.marketType||null,priorityEdgePct:res?Number(n(res.edge).toFixed(2)):null,prioritySource:res?.source||null,dataQualityPct:dq};
 if(score>=58)return{tier:'A',score:Math.round(score),cadenceMinutes:10,reason:reasons,...meta};
 if(score>=28)return{tier:'B',score:Math.round(score),cadenceMinutes:30,reason:reasons,...meta};
 return{tier:'C',score:Math.round(score),cadenceMinutes:120,reason:reasons,...meta};
}
function allowedByCadence(row,previous){
 if(!previous)return true;
 const last=Date.parse(previous?.lastDecisionAt||previous?.checkedAt||previous?.updatedAt||'');
 if(!Number.isFinite(last))return true;
 return Date.now()-last>=n(row.cadenceMinutes,120)*60000;
}
function eligibilityGate(decision){
 if(!decision||typeof decision!=='object')return{allowed:false,forceTier:'C',status:'MISSING',reason:'MISSING_ELIGIBILITY_DECISION'};
 const status=String(decision?.status||decision?.verdict||'').trim().toUpperCase();
 if(!status)return{allowed:false,forceTier:'C',status:'MISSING',reason:'MISSING_ELIGIBILITY_STATUS'};
 if(['BLOCKED','SKIP','NO_BET','NO BET'].includes(status))return{allowed:false,forceTier:'C',status,reason:decision?.reason||decision?.gate||decision?.issues?.[0]||'eligibility blocked'};
 if(status==='WATCH')return{allowed:false,forceTier:'B',status,reason:decision?.reason||decision?.issues?.[0]||null};
 if(['PRIME','VALUE','ELIGIBLE'].includes(status))return{allowed:decision?.eligible!==false,status,reason:decision?.reason||null};
 return{allowed:Boolean(decision?.eligible),forceTier:decision?.eligible?null:'C',status,reason:decision?.reason||decision?.issues?.[0]||null};
}
function compactCandidate(c=null){if(!c)return null;return{side:c.side||c.selection||null,selection:c.selection||c.side||null,label:c.label||null,marketType:c.marketType||null,line:c.line??null,probability:c.probability??null,probabilityPct:c.probabilityPct??null,odds:c.odds??null,edgePct:c.edgePct??null,ev:c.ev??c.evPct??null,evPct:c.evPct??null,fairOdds:c.fairOdds??null,decisionScore:c.decisionScore??null,dataQuality:c.dataQuality??null,modelVersion:c.modelVersion||null,validationStatus:c.validationStatus||null,marketProbability:c.marketProbability??null,marketProbabilityPct:c.marketProbabilityPct??null,mathIntegrity:c.mathIntegrity||null,marketView:c.marketView?{rawImplied:c.marketView.rawImplied??null,adjustedImplied:c.marketView.adjustedImplied??null,priceDeviationPct:c.marketView.priceDeviationPct??null,marketSignalStrength:c.marketView.marketSignalStrength??null}:null}}
function decisionFields(decision={},portfolio={},stake={},gate={}){
 const g=eligibilityGate(decision),verdict=String(decision?.verdict||decision?.status||'NO BET').trim().toUpperCase(),portfolioBlocked=Boolean(portfolio?.blocked)||portfolio?.portfolioEligible===false,upstreamEligible=Boolean(decision?.eligible)&&g.allowed,eligible=upstreamEligible&&!portfolioBlocked&&['PRIME','VALUE','ELIGIBLE'].includes(verdict),stakePct=eligible?Math.max(0,n(stake?.stakePct,0)):0,candidate=compactCandidate(decision?.candidate),stakeSelection=stake?.selection||candidate?.selection||candidate?.side||null,stakeOdds=n(stake?.odds??candidate?.odds,null);
 return{verdict,eligible,betEligible:eligible,eligibilityStatus:g.status,eligibilityReason:g.reason,eligibilityIssues:Array.isArray(decision?.issues)?decision.issues.slice(0,24):[],eligibilityPositive:Array.isArray(decision?.positive)?decision.positive.slice(0,24):[],eligibilityCandidate:candidate,netConfidence:n(decision?.confidence?.net,null),rawConfidence:n(decision?.confidence?.raw,null),portfolioBlocked,portfolioReasons:Array.isArray(portfolio?.reasons)?portfolio.reasons.slice(0,16):[],portfolioRankScore:n(portfolio?.rankScore,null),recommendedStakePct:stakePct,recommendedUnits:stakePct,stakeSelection,stakeOdds:stakeOdds>1?stakeOdds:null,preKickoffGate:gate?.status||null,lineupsConfirmed:Boolean(gate?.lineupsConfirmed),evidenceFreshness:decision?.evidenceFreshness||null,marketRegime:decision?.marketRegime||null,marketMovement:decision?.marketMovement||null,marketMovementPct:decision?.marketMovementPct??null,timingAction:decision?.timingAction||null,timingReason:decision?.timingReason||null,timingTimeBucket:decision?.timingTimeBucket||null,signalDecay:decision?.signalDecay||null,crossSourceAgreement:decision?.crossSourceAgreement||null,uncertaintyBudget:decision?.uncertaintyBudget||null,robustnessTest:decision?.robustnessTest||null,robustnessStatus:decision?.robustnessStatus||null,robustnessScore:decision?.robustnessScore??null,decisionStability:decision?.decisionStability||null,decisionStabilityStatus:decision?.decisionStabilityStatus||null,decisionStabilityScore:decision?.decisionStabilityScore??null};
}
async function loadPrevious(){if(!storageReady())return null;try{return await readJson(KEY)}catch{return null}}
async function save(payload){if(!storageReady())return{stored:false};try{const r=await writeJson(KEY,payload,STORE_TTL);return{stored:Boolean(r?.stored),ttlSeconds:r?.ttlSeconds||STORE_TTL}}catch(e){return{stored:false,error:e?.message||'write failed'}}}

export default async function handler(req,res){
 noStore(res);
 if(req.method==='GET'){
  const previous=await loadPrevious();
  return res.status(200).json(previous||{version:VERSION,status:'EMPTY',plan:[],summary:{A:0,B:0,C:0},generatedAt:null,storage:{ready:storageReady()}});
 }
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const body=req.body||{},matches=Array.isArray(body.matches)?body.matches:[];
 if(!matches.length)return res.status(400).json({error:'matches required'});
 const eligibility=decisionsOf(body),portfolio=portfolioOf(body),stakes=stakesOf(body),gates=gatesOf(body),previous=await loadPrevious(),previousRows=Array.isArray(previous?.plan)?previous.plan:[],prevMap=new Map(previousRows.map(r=>[String(r.matchId),r]));
 const sourceHealth=body.sourceHealth||{},quota=body.quota||body.meta?.quota||{},profiles=body.profiles&&typeof body.profiles==='object'?body.profiles:{};
 const degraded=sourceHealth?.degraded===true||String(sourceHealth?.status||'').toUpperCase()==='DEGRADED';
 const remainingPct=quota?.remainingPct??(Number.isFinite(Number(quota?.dailyRemaining))&&Number(quota?.dailyLimit)>0?Number(quota.dailyRemaining)/Number(quota.dailyLimit)*100:100),lowQuota=n(remainingPct,100)<=20||quota?.exhausted===true;
 let nextPlan=matches.filter(m=>m&&!m.isFinished).slice(0,180).map(m=>{
  const id=String(m.id),decision=eligibility[id]||null,t=tier(m,decision),prev=prevMap.get(id),profile=profiles[id]||{},riskTier=String(profile?.riskTier||'').toUpperCase(),riskFlags=Array.isArray(profile?.riskFlags)?profile.riskFlags:[],p=portfolio[id]||{},stake=stakes[id]||{},gate=gates[String(m.fixtureId??m.id)]||gates[id]||{},flow=decisionFields(decision||{},p,stake,gate);let cadence=t.cadenceMinutes;
  if(riskTier==='HIGH'||riskFlags.length>=3)cadence=Math.max(cadence,120);else if(riskTier==='ELEVATED'||riskFlags.length)cadence=Math.max(cadence,30);
  if(degraded||lowQuota)cadence=Math.max(cadence,t.tier==='A'?30:120);
  let finalTier=t.tier;if(flow.eligibilityStatus==='MISSING'||['BLOCKED','SKIP','NO_BET','NO BET'].includes(flow.eligibilityStatus))finalTier='C';else if(flow.eligibilityStatus==='WATCH'&&finalTier==='A')finalTier='B';
  const runNow=allowedByCadence({...t,tier:finalTier,cadenceMinutes:cadence},prev),actionable=flow.eligible&&flow.recommendedStakePct>0&&['PRIME','VALUE'].includes(flow.verdict);
  return{matchId:m.id,fixtureId:m.fixtureId??m.id,home:m.home,away:m.away,competition:m.competition||null,kickoff:m.kickoff||null,status:m.status||null,isLive:Boolean(m.isLive),tier:finalTier,priorityScore:t.score,score:t.score,cadenceMinutes:cadence,runNow,lastDecisionAt:prev?.lastDecisionAt||null,nextDecisionAt:new Date(Date.now()+cadence*60000).toISOString(),reason:t.reason,changedTier:prev?prev.tier!==finalTier:false,riskTier:riskTier||null,riskFlags,matchContext:m.matchContext||null,competitionContext:m.competitionContext||null,sourceDegraded:Boolean(degraded),lowQuota:Boolean(lowQuota),prioritySelection:t.prioritySelection,priorityLabel:t.priorityLabel,priorityMarketType:t.priorityMarketType,priorityEdgePct:t.priorityEdgePct,prioritySource:t.prioritySource,dataQualityPct:t.dataQualityPct,pricedMarket:hasPricedMarket(m,decision),actionable,...flow,cooldownUntil:decision?.cooldownUntil||null};
 }).sort((a,b)=>{const rank={A:3,B:2,C:1};return(rank[b.tier]-rank[a.tier])||(b.priorityScore-a.priorityScore)});
 const summary=nextPlan.reduce((a,r)=>{a[r.tier]=(a[r.tier]||0)+1;if(r.runNow)a.runNow++;a.eligibility[r.eligibilityStatus]=(a.eligibility[r.eligibilityStatus]||0)+1;if(r.pricedMarket)a.funnel.priced++;if(r.dataQualityPct!=null&&r.dataQualityPct>=55)a.funnel.dataQualityPass++;if(r.eligibilityStatus!=='MISSING')a.funnel.eligibilityResolved++;if(r.eligibilityCandidate)a.funnel.candidates++;if(!r.portfolioBlocked)a.funnel.portfolioPassed++;if(r.recommendedStakePct>0)a.funnel.staked++;if(r.actionable)a.funnel.actionable++;if(r.verdict==='PRIME')a.verdicts.PRIME++;else if(r.verdict==='VALUE')a.verdicts.VALUE++;else if(r.verdict==='WATCH')a.verdicts.WATCH++;else a.verdicts.NO_BET++;return a},{A:0,B:0,C:0,runNow:0,eligibility:{},verdicts:{PRIME:0,VALUE:0,WATCH:0,NO_BET:0},funnel:{discovered:nextPlan.length,priced:0,dataQualityPass:0,eligibilityResolved:0,candidates:0,portfolioPassed:0,staked:0,actionable:0}});
 const payload={version:VERSION,status:'OK',generatedAt:refTime().toISOString(),summary,guardrails:{eligibilityGate:true,eligibilityShapeNormalized:true,missingEligibilityFailClosed:true,dataQualityScale:'0-100_NORMALIZED_FROM_0-1_OR_0-100',sourceDegraded:Boolean(degraded),lowQuota:Boolean(lowQuota),riskProfileAware:true,multiMarketPriority:true,portfolioApplied:true,stakingApplied:true,automaticRealWagering:false},plan:nextPlan,storage:{ready:storageReady()}};
 const stored=await save(payload);payload.storage={...payload.storage,...stored};
 return res.status(200).json(payload);
}
