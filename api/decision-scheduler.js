import { readJson, writeJson, storageReady } from './_report-store.js';

const KEY='argus:intel:decision_scheduler:v1';
const STORE_TTL=20*60;
const VERSION='DECISION-SCHEDULER-13';
function noStore(res){res.setHeader('Cache-Control','no-store, max-age=0');}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function refTime(){return new Date();}
function ikick(m){const t=Date.parse(m?.kickoff||'');return Number.isFinite(t)?t:null}
function implied(o){return n(o)>1?1/n(o):0}
function marketProb(m={}){const h=implied(m.home),d=implied(m.draw),a=implied(m.away),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function modelProb(match){const p=match?.preMatchModel||match?.model||{},h=n(p.home),d=n(p.draw),a=n(p.away),s=h+d+a;if(s<=0)return null;return{home:h/s,draw:d/s,away:a/s}}
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
 const dq=n(match?.dataQuality??match?.quality,1); if(dq<0.7){score-=18;reasons.push('low data quality')}
 if(!hasPricedMarket(match,decision)){score-=18;reasons.push('no priced market')}
 const meta={prioritySelection:res?.side||null,priorityLabel:res?.label||null,priorityMarketType:res?.marketType||null,priorityEdgePct:res?Number(n(res.edge).toFixed(2)):null,prioritySource:res?.source||null};
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
 const status=String(decision?.status||decision?.verdict||'').toUpperCase();
 if(!status)return{allowed:true,status:'UNKNOWN',reason:null};
 if(['BLOCKED','SKIP','NO_BET'].includes(status))return{allowed:false,forceTier:'C',status,reason:decision?.reason||decision?.gate||'eligibility blocked'};
 if(['WATCH'].includes(status))return{allowed:true,forceTier:'B',status,reason:decision?.reason||null};
 if(['PRIME','VALUE','ELIGIBLE'].includes(status))return{allowed:true,status,reason:decision?.reason||null};
 return{allowed:true,status,reason:decision?.reason||null};
}
function applyEligibility(plan,eligibility={}){
 return (plan||[]).map(row=>{const d=eligibility[String(row.matchId)]||null,g=eligibilityGate(d);let out={...row,eligibilityStatus:g.status,eligibilityReason:g.reason};if(g.forceTier==='C')out={...out,tier:'C',cadenceMinutes:120,actionable:false};else if(g.forceTier==='B'&&out.tier==='A')out={...out,tier:'B',cadenceMinutes:30};return out});
}
function compactCandidate(c=null){if(!c)return null;return{side:c.side||c.selection||null,label:c.label||null,marketType:c.marketType||null,probability:c.probability??null,odds:c.odds??null,edgePct:c.edgePct??null,ev:c.ev??null,decisionScore:c.decisionScore??null,marketView:c.marketView?{rawImplied:c.marketView.rawImplied??null,adjustedImplied:c.marketView.adjustedImplied??null,priceDeviationPct:c.marketView.priceDeviationPct??null,marketSignalStrength:c.marketView.marketSignalStrength??null}:null}}
async function loadPrevious(){
 if(!storageReady())return null;try{return await readJson(KEY)}catch{return null}
}
async function save(payload){if(!storageReady())return{stored:false};try{const r=await writeJson(KEY,payload,STORE_TTL);return{stored:Boolean(r?.stored),ttlSeconds:r?.ttlSeconds||STORE_TTL}}catch(e){return{stored:false,error:e?.message||'write failed'}}}

export default async function handler(req,res){
 noStore(res);
 if(req.method==='GET'){
  const previous=await loadPrevious();
  return res.status(200).json(previous||{version:VERSION,status:'EMPTY',plan:[],summary:{A:0,B:0,C:0},generatedAt:null,storage:{ready:storageReady()}});
 }
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const body=req.body||{},matches=Array.isArray(body.matches)?body.matches:[],eligibility=body.eligibility&&typeof body.eligibility==='object'?body.eligibility:{};
 if(!matches.length)return res.status(400).json({error:'matches required'});
 const previous=await loadPrevious(),previousRows=Array.isArray(previous?.plan)?previous.plan:[],prevMap=new Map(previousRows.map(r=>[String(r.matchId),r]));
 const sourceHealth=body.sourceHealth||{},quota=body.quota||{},profiles=body.profiles&&typeof body.profiles==='object'?body.profiles:{};
 const degraded=sourceHealth?.degraded===true||String(sourceHealth?.status||'').toUpperCase()==='DEGRADED';
 const lowQuota=n(quota?.remainingPct??100,100)<=20||quota?.exhausted===true;
 let nextPlan=matches.filter(m=>m&&!m.isFinished).slice(0,180).map(m=>{
  const decision=eligibility[String(m.id)]||null,t=tier(m,decision),prev=prevMap.get(String(m.id)); let cadence=t.cadenceMinutes;
  const profile=profiles[String(m.id)]||{},riskTier=String(profile?.riskTier||'').toUpperCase(),riskFlags=Array.isArray(profile?.riskFlags)?profile.riskFlags:[];
  if(riskTier==='HIGH'||riskFlags.length>=3)cadence=Math.max(cadence,120); else if(riskTier==='ELEVATED'||riskFlags.length)cadence=Math.max(cadence,30);
  if(degraded||lowQuota)cadence=Math.max(cadence,t.tier==='A'?30:120);
  const runNow=allowedByCadence({...t,cadenceMinutes:cadence},prev);
  return{matchId:m.id,fixtureId:m.fixtureId??m.id,home:m.home,away:m.away,competition:m.competition||null,kickoff:m.kickoff||null,status:m.status||null,isLive:Boolean(m.isLive),tier:t.tier,priorityScore:t.score,cadenceMinutes:cadence,runNow,lastDecisionAt:prev?.lastDecisionAt||null,nextDecisionAt:new Date(Date.now()+cadence*60000).toISOString(),reason:t.reason,changedTier:prev?prev.tier!==t.tier:false,riskTier:riskTier||null,riskFlags,marketRegime:m?.marketRegime?.regime||null,sourceDegraded:Boolean(degraded),lowQuota:Boolean(lowQuota),prioritySelection:t.prioritySelection,priorityLabel:t.priorityLabel,priorityMarketType:t.priorityMarketType,priorityEdgePct:t.priorityEdgePct,prioritySource:t.prioritySource,eligibilityStatus:decision?.status||'PENDING',eligibilityReason:decision?.reason||null,eligibilityCandidate:compactCandidate(decision?.candidate),cooldownUntil:decision?.cooldownUntil||null};
 }).sort((a,b)=>{const rank={A:3,B:2,C:1};return(rank[b.tier]-rank[a.tier])||(b.priorityScore-a.priorityScore)});
 nextPlan=applyEligibility(nextPlan,eligibility);
 const summary=nextPlan.reduce((a,r)=>{a[r.tier]=(a[r.tier]||0)+1;if(r.runNow)a.runNow++;if(r.eligibilityStatus)a.eligibility[r.eligibilityStatus]=(a.eligibility[r.eligibilityStatus]||0)+1;return a},{A:0,B:0,C:0,runNow:0,eligibility:{}});
 const payload={version:VERSION,status:'OK',generatedAt:refTime().toISOString(),summary,guardrails:{eligibilityGate:true,sourceDegraded:Boolean(degraded),lowQuota:Boolean(lowQuota),riskProfileAware:true,multiMarketPriority:true},plan:nextPlan,storage:{ready:storageReady()}};
 const stored=await save(payload);payload.storage={...payload.storage,...stored};
 return res.status(200).json(payload);
}
