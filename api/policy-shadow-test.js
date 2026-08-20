import { readJson, writeJson, listJson, readManyJson, storageReady } from './_report-store.js';

const REVIEW='argus/learning/policy-review.json';
const OUT='argus/learning/policy-shadow.json';
const LEDGER='argus/ledger/';
const n=(v,f=0)=>{const x=Number(v);return Number.isFinite(x)?x:f};
function valid(r){return ['WIN','LOSS'].includes(r?.settlement?.status)}
function features(r){return{edge:n(r?.edge,null),confidence:n(r?.confidence,null),odds:n(r?.odds,null),uncertaintyStatus:String(r?.uncertaintyBudget?.status||'UNKNOWN').toUpperCase(),agreementStatus:String(r?.crossSourceAgreement?.status||'UNKNOWN').toUpperCase(),robustnessStatus:String(r?.robustness?.status||r?.robustnessStatus||'UNKNOWN').toUpperCase(),decayStatus:String(r?.signalDecay?.status||r?.signalDecayStatus||'UNKNOWN').toUpperCase(),riskCount:Array.isArray(r?.risks)?r.risks.length:0,regime:String(r?.marketRegime||'UNKNOWN').toUpperCase()}}
const RULES={
 STRICT_EDGE_4:f=>f.edge!=null&&f.edge<4,
 STRICT_EDGE_6:f=>f.edge!=null&&f.edge<6,
 CONFIDENCE_60:f=>f.confidence!=null&&f.confidence<60,
 CONFIDENCE_68:f=>f.confidence!=null&&f.confidence<68,
 UNCERTAINTY_HIGH_OFF:f=>['HIGH','EXTREME'].includes(f.uncertaintyStatus),
 AGREEMENT_REQUIRED:f=>['MIXED','HIGH_DISAGREEMENT','CONTRADICTION'].includes(f.agreementStatus),
 ROBUSTNESS_REQUIRED:f=>['FRAGILE','FAIL'].includes(f.robustnessStatus),
 DECAY_OFF:f=>['AGING','DECAYING','EXPIRED'].includes(f.decayStatus),
 CONSERVATIVE_COMBO:f=>(f.edge!=null&&f.edge<4)||(f.confidence!=null&&f.confidence<60)||['HIGH','EXTREME'].includes(f.uncertaintyStatus)||['HIGH_DISAGREEMENT','CONTRADICTION'].includes(f.agreementStatus)||['FRAGILE','FAIL'].includes(f.robustnessStatus)||['DECAYING','EXPIRED'].includes(f.decayStatus)
};
function evaluate(rows,fn){let observed=0,shadow=0,triggers=0,avoidedLosses=0,missedWins=0;for(const r of rows){const pl=n(r?.settlement?.pl,r?.settlement?.status==='LOSS'?-1:0),skip=Boolean(fn(features(r)));observed+=pl;if(skip){triggers++;if(r.settlement.status==='LOSS')avoidedLosses++;else missedWins++}else shadow+=pl}const delta=shadow-observed,sample=rows.length;let status='LEARNING';if(sample>=60){if(delta>=8&&avoidedLosses>=missedWins+3)status='SHADOW_PASS';else if(delta<=-5||missedWins>avoidedLosses)status='SHADOW_FAIL';else status='SHADOW_NEUTRAL'}return{sample,triggers,observedFlatPL:+observed.toFixed(2),shadowFlatPL:+shadow.toFixed(2),estimatedDeltaPL:+delta.toFixed(2),avoidedLosses,missedWins,status}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Policy shadow storage unavailable'});
 const [review,blobs]=await Promise.all([readJson(REVIEW,{proposals:[]}),listJson(LEDGER,240)]),books=await readManyJson(blobs),rows=books.flatMap(b=>b?.records||[]).filter(valid),candidates=(review.proposals||[]).filter(p=>p.eligibleForHumanReview&&RULES[p.name]);
 const tests=candidates.map(p=>({policy:p.name,reviewScore:p.reviewScore,reviewStatus:p.reviewStatus,...evaluate(rows,RULES[p.name])})).sort((a,b)=>b.estimatedDeltaPL-a.estimatedDeltaPL),passed=tests.filter(x=>x.status==='SHADOW_PASS');
 const state={ok:true,version:'POLICY-SHADOW-1',generatedAt:new Date().toISOString(),summary:{settled:rows.length,candidates:tests.length,passed:passed.length,failed:tests.filter(x=>x.status==='SHADOW_FAIL').length,best:tests[0]?.policy||null,bestDeltaPL:tests[0]?.estimatedDeltaPL??null},policy:{productionRulesUntouched:true,automaticAdoption:false,automaticPrimeCreation:false,minimumShadowSample:60,passRequiresMaterialDelta:true,rollbackRequiredBeforeAnyFutureAdoption:true,rule:'Candidate policies are replayed in shadow against frozen official ledger evidence. Shadow results can recommend validation only; they cannot alter production decisions.'},tests};await writeJson(OUT,state);return res.status(200).json(state)
}
