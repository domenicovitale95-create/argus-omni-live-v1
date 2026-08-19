import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const PREFIX='argus/ledger/';
const OUT='argus/learning/counterfactual.json';
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const pct=(x,d=1)=>Number.isFinite(Number(x))?Number(Number(x).toFixed(d)):null;
function validResult(r){return ['WIN','LOSS'].includes(r?.settlement?.status)}
function implied(o){const x=n(o);return x&&x>1?1/x:null}
function regime(rec){const r=rec?.context?.regime||rec?.marketRegime||{};return String(r.type||r.regime||r.label||'UNKNOWN').toUpperCase()}
function decisionBucket(rec){return `${String(rec.verdict||'UNKNOWN').toUpperCase()}|${String(rec.selection||'UNKNOWN').toUpperCase()}|${regime(rec)}`}
function alternativeFor(rec){
  const status=rec?.settlement?.status, conf=n(rec?.confidence), odds=n(rec?.odds), rank=n(rec?.rankScore), risks=Array.isArray(rec?.risks)?rec.risks:[];
  const loss=status==='LOSS';
  const highRisk=risks.length>=2||regime(rec).includes('VOLATILE')||regime(rec).includes('STALE')||regime(rec).includes('WIDE');
  const expensive=odds!=null&&odds<1.55;
  const marginal=conf!=null&&conf<64;
  const weakRank=rank!=null&&rank<75;
  if(loss&&(highRisk||marginal||weakRank))return{alternative:'NO_BET_OR_WAIT',avoidedLoss:true,reason:[highRisk?'risk flags':'',marginal?'marginal confidence':'',weakRank?'weak rank':''].filter(Boolean).join(' + ')};
  if(loss&&expensive)return{alternative:'WAIT_FOR_PRICE_OR_SKIP',avoidedLoss:true,reason:'short price loss'};
  if(status==='WIN'&&conf!=null&&conf>=68&&!highRisk)return{alternative:'KEEP_POLICY',avoidedLoss:false,reason:'winner with adequate confidence and no severe context risk'};
  return{alternative:'KEEP_POLICY',avoidedLoss:false,reason:'no clear counterfactual improvement from frozen evidence'};
}
function group(rows,keyFn){
  const map={};
  for(const r of rows){const k=keyFn(r);(map[k]||(map[k]=[])).push(r)}
  const out={};
  for(const [k,arr] of Object.entries(map)){
    const settled=arr.filter(validResult), losses=settled.filter(r=>r.settlement.status==='LOSS'), wins=settled.length-losses.length;
    const alt=settled.map(r=>alternativeFor(r));
    const avoidable=alt.filter(x=>x.avoidedLoss).length;
    const priced=settled.filter(r=>Number.isFinite(Number(r.settlement?.pl)));
    const pl=priced.reduce((s,r)=>s+Number(r.settlement.pl),0);
    const counterfactualPL=priced.reduce((s,r)=>{const a=alternativeFor(r);return s+(a.avoidedLoss&&r.settlement.status==='LOSS'?0:Number(r.settlement.pl));},0);
    out[k]={sample:settled.length,wins,losses,observedFlatPL:pct(pl,2),observedROI:priced.length?pct(pl/priced.length*100):null,avoidableLossesHeuristic:avoidable,avoidableLossRate:losses.length?pct(avoidable/losses.length*100):0,counterfactualFlatPL:pct(counterfactualPL,2),estimatedDeltaPL:pct(counterfactualPL-pl,2),status:settled.length<20?'LEARNING':avoidable>=Math.max(5,Math.ceil(losses.length*.35))?'POLICY_REVIEW':'STABLE'};
  }
  return out;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const blobs=await listJson(PREFIX,180),books=await readManyJson(blobs),rows=books.flatMap(b=>b?.records||[]).filter(validResult);
  const decisions=rows.map(r=>({id:r.id,fixtureId:r.fixtureId,match:`${r.home||'—'} vs ${r.away||'—'}`,competition:r.competition||'UNKNOWN',selection:r.selection,verdict:r.verdict,confidence:r.confidence,odds:r.odds,rankScore:r.rankScore,regime:regime(r),result:r.settlement.status,...alternativeFor(r)}));
  const losses=rows.filter(r=>r.settlement.status==='LOSS').length,avoidable=decisions.filter(d=>d.avoidedLoss).length;
  const report={version:'COUNTERFACTUAL-LEARNING-1',generatedAt:new Date().toISOString(),policy:{principle:'Compare frozen decisions with safer alternatives using only information already present at prediction time. No post-match features may influence alternatives.',noHindsight:true,positiveEvidenceCannotCreatePrime:true,minimumSampleForPolicyAction:20,action:'downgrade-only'},summary:{settled:rows.length,wins:rows.length-losses,losses,avoidableLossesHeuristic:avoidable,avoidableLossRate:losses?pct(avoidable/losses*100):0},byDecisionRegime:group(rows,decisionBucket),byLeague:group(rows,r=>r.competition||'UNKNOWN'),byVerdict:group(rows,r=>String(r.verdict||'UNKNOWN').toUpperCase()),recent:decisions.sort((a,b)=>String(b.id).localeCompare(String(a.id))).slice(0,100)};
  await writeJson(OUT,report);
  return res.status(200).json(report);
}
