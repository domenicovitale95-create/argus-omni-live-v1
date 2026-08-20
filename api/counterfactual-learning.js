import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const PREFIX='argus/ledger/';
const OUT='argus/learning/counterfactual.json';
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const pct=(x,d=1)=>Number.isFinite(Number(x))?Number(Number(x).toFixed(d)):null;
function validResult(r){return ['WIN','LOSS'].includes(r?.settlement?.status)}
function regime(rec){const r=rec?.context?.regime||rec?.marketRegime||{};return String(r.type||r.regime||r.label||r||'UNKNOWN').toUpperCase()}
function risks(rec){return Array.isArray(rec?.risks)?rec.risks:[]}
function frozenFeatures(rec){return{edge:n(rec?.edge),confidence:n(rec?.confidence),odds:n(rec?.odds),rankScore:n(rec?.rankScore),regime:regime(rec),riskCount:risks(rec).length,verdict:String(rec?.verdict||'UNKNOWN').toUpperCase(),uncertaintyStatus:String(rec?.uncertaintyBudget?.status||'UNKNOWN').toUpperCase(),uncertaintyScore:n(rec?.uncertaintyBudget?.uncertaintyScore),decisionMargin:n(rec?.uncertaintyBudget?.decisionMargin),agreementStatus:String(rec?.crossSourceAgreement?.status||'UNKNOWN').toUpperCase(),agreementScore:n(rec?.crossSourceAgreement?.score),robustnessStatus:String(rec?.robustnessStatus||rec?.robustnessTest?.status||'UNKNOWN').toUpperCase(),robustnessScore:n(rec?.robustnessScore??rec?.robustnessTest?.score),decayStatus:String(rec?.signalDecay?.status||'UNKNOWN').toUpperCase(),stabilityStatus:String(rec?.decisionStabilityStatus||rec?.decisionStability?.status||'UNKNOWN').toUpperCase(),stabilityScore:n(rec?.decisionStabilityScore??rec?.decisionStability?.score)}}
const POLICIES={
 STRICT_EDGE_4:f=>f.edge!=null&&f.edge<4,
 STRICT_EDGE_6:f=>f.edge!=null&&f.edge<6,
 CONFIDENCE_60:f=>f.confidence!=null&&f.confidence<60,
 CONFIDENCE_68:f=>f.confidence!=null&&f.confidence<68,
 RISK_OFF:f=>f.riskCount>=2||['VOLATILE','STALE','WIDE'].some(x=>f.regime.includes(x)),
 SHORT_PRICE_WAIT:f=>f.odds!=null&&f.odds<1.55,
 UNCERTAINTY_HIGH_OFF:f=>['HIGH','EXTREME'].includes(f.uncertaintyStatus),
 DECISION_MARGIN_50:f=>f.decisionMargin!=null&&f.decisionMargin<50,
 AGREEMENT_REQUIRED:f=>['MIXED','HIGH_DISAGREEMENT','CONTRADICTION'].includes(f.agreementStatus),
 ROBUSTNESS_REQUIRED:f=>['FRAGILE','FAIL'].includes(f.robustnessStatus),
 DECAY_OFF:f=>['AGING','DECAYING','EXPIRED'].includes(f.decayStatus),
 STABILITY_REQUIRED:f=>['OSCILLATING','UNSTABLE','CHAOTIC'].includes(f.stabilityStatus),
 CONSERVATIVE_COMBO:f=>(f.edge!=null&&f.edge<4)||(f.confidence!=null&&f.confidence<60)||f.riskCount>=2||['VOLATILE','STALE','WIDE'].some(x=>f.regime.includes(x))||['HIGH','EXTREME'].includes(f.uncertaintyStatus)||['HIGH_DISAGREEMENT','CONTRADICTION'].includes(f.agreementStatus)||['FRAGILE','FAIL'].includes(f.robustnessStatus)||['DECAYING','EXPIRED'].includes(f.decayStatus)
};
function evalPolicy(rec,name,fn){const f=frozenFeatures(rec),skip=Boolean(fn(f)),pl=n(rec?.settlement?.pl,rec?.settlement?.status==='LOSS'?-1:0)||0;return{name,skip,observedPL:pl,counterfactualPL:skip?0:pl,deltaPL:(skip?0:pl)-pl,avoidedLoss:skip&&rec.settlement.status==='LOSS',missedWin:skip&&rec.settlement.status==='WIN',features:f}}
function policyStats(rows,name,fn){const ev=rows.map(r=>evalPolicy(r,name,fn)),acted=ev.filter(x=>x.skip),observed=ev.reduce((s,x)=>s+x.observedPL,0),cf=ev.reduce((s,x)=>s+x.counterfactualPL,0),avoided=acted.filter(x=>x.avoidedLoss).length,missed=acted.filter(x=>x.missedWin).length,losses=rows.filter(r=>r.settlement.status==='LOSS').length,wins=rows.length-losses,delta=cf-observed;let status='LEARNING';if(rows.length>=40){if(delta>=5&&avoided>=Math.max(5,missed+2))status='REVIEW_CANDIDATE';else if(delta<=-5&&missed>avoided)status='REJECTED';else status='NEUTRAL'}return{sample:rows.length,wins,losses,policyTriggers:acted.length,avoidedLosses:avoided,missedWins:missed,observedFlatPL:pct(observed,2),counterfactualFlatPL:pct(cf,2),estimatedDeltaPL:pct(delta,2),avoidableLossRate:losses?pct(avoided/losses*100):0,missedWinRate:wins?pct(missed/wins*100):0,status}}
function groupPolicies(rows,keyFn){const groups={};for(const r of rows){const k=keyFn(r);(groups[k]||(groups[k]=[])).push(r)}const out={};for(const[k,arr]of Object.entries(groups)){out[k]={};for(const[name,fn]of Object.entries(POLICIES))out[k][name]=policyStats(arr,name,fn)}return out}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
 const blobs=await listJson(PREFIX,240),books=await readManyJson(blobs),rows=books.flatMap(b=>b?.records||[]).filter(validResult),losses=rows.filter(r=>r.settlement.status==='LOSS').length;
 const policies={};for(const[name,fn]of Object.entries(POLICIES))policies[name]=policyStats(rows,name,fn);
 const best=Object.entries(policies).filter(([,p])=>p.status==='REVIEW_CANDIDATE').sort((a,b)=>(b[1].estimatedDeltaPL||0)-(a[1].estimatedDeltaPL||0))[0]||null;
 const heuristic=policies.CONSERVATIVE_COMBO,report={version:'COUNTERFACTUAL-LEARNING-3',generatedAt:new Date().toISOString(),policy:{principle:'Evaluate safer decision rules using only evidence frozen at decision time; settlement is used only to score the hypothetical policy.',noHindsightInPolicyChoice:true,noRetroactiveTrackRecordRewrite:true,automaticPolicyMutation:false,positiveEvidenceCannotCreatePrime:true,minimumSampleForPolicyReview:40,newLayerEvidenceRequiresLedgerV3:true,action:'research-and-downgrade-only'},summary:{settled:rows.length,wins:rows.length-losses,losses,avoidableLossesHeuristic:heuristic.avoidedLosses,avoidableLossRate:heuristic.avoidableLossRate,bestReviewCandidate:best?best[0]:null,bestEstimatedDeltaPL:best?best[1].estimatedDeltaPL:null},policies,byLeague:groupPolicies(rows,r=>r.competition||'UNKNOWN'),byVerdict:groupPolicies(rows,r=>String(r.verdict||'UNKNOWN').toUpperCase()),byUncertainty:groupPolicies(rows,r=>String(r.uncertaintyBudget?.status||'UNKNOWN').toUpperCase()),byRobustness:groupPolicies(rows,r=>String(r.robustnessStatus||r.robustnessTest?.status||'UNKNOWN').toUpperCase()),recent:rows.slice(-100).reverse().map(r=>({id:r.id,fixtureId:r.fixtureId,match:`${r.home||'—'} vs ${r.away||'—'}`,competition:r.competition||'UNKNOWN',result:r.settlement.status,features:frozenFeatures(r),policies:Object.fromEntries(Object.entries(POLICIES).map(([name,fn])=>{const x=evalPolicy(r,name,fn);return[name,{skip:x.skip,deltaPL:pct(x.deltaPL,2),avoidedLoss:x.avoidedLoss,missedWin:x.missedWin}]}))}))};
 await writeJson(OUT,report);return res.status(200).json(report)
}
