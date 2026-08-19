import { readJson, writeJson, storageReady } from './_report-store.js';

const IN='argus/research/historical-walkforward.json';
const OUT='argus/research/historical-candidates.json';
function improve(base,cand,key){const b=Number(base?.[key]),c=Number(cand?.[key]);if(!Number.isFinite(b)||!Number.isFinite(c)||b===0)return null;return Number(((b-c)/Math.abs(b)*100).toFixed(2))}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const lab=await readJson(IN,null);if(!lab||lab.status==='INSUFFICIENT_DATA')return res.status(200).json({version:'HISTORICAL-CANDIDATE-GATE-1',status:'WAITING_FOR_WALKFORWARD',approved:[]});
  const base=(lab.variants||[]).find(x=>x.id==='BASELINE');if(!base)return res.status(200).json({version:'HISTORICAL-CANDIDATE-GATE-1',status:'NO_BASELINE',approved:[]});
  const evaluated=(lab.variants||[]).filter(x=>x.id!=='BASELINE').map(v=>{const sample=Number(v.holdout?.sample||0),ll=improve(base.holdout,v.holdout,'logLoss'),br=improve(base.holdout,v.holdout,'brier'),top3Delta=Number.isFinite(Number(v.holdout?.exactTop3))&&Number.isFinite(Number(base.holdout?.exactTop3))?Number((v.holdout.exactTop3-base.holdout.exactTop3).toFixed(1)):null;const approved=sample>=50&&ll!=null&&br!=null&&ll>=2&&br>=1&&top3Delta!=null&&top3Delta>=-2;return{id:v.id,holdoutSample:sample,logLossImprovementPct:ll,brierImprovementPct:br,exactTop3DeltaPct:top3Delta,approved,reason:sample<50?'HOLDOUT_SAMPLE_LT_50':ll==null||br==null?'METRICS_MISSING':ll<2?'LOGLOSS_IMPROVEMENT_LT_2PCT':br<1?'BRIER_IMPROVEMENT_LT_1PCT':top3Delta<-2?'EXACT_TOP3_DETERIORATION':'PASS_TO_SHADOW_RESEARCH'}});
  const approved=evaluated.filter(x=>x.approved).sort((a,b)=>(b.logLossImprovementPct+b.brierImprovementPct)-(a.logLossImprovementPct+a.brierImprovementPct));
  const report={version:'HISTORICAL-CANDIDATE-GATE-1',generatedAt:new Date().toISOString(),status:approved.length?'CANDIDATES_READY':'NO_APPROVED_CANDIDATE',policy:{researchOnly:true,minimumHoldout:50,minLogLossImprovementPct:2,minBrierImprovementPct:1,maxExactTop3DeteriorationPct:2,noDirectProductionPromotion:true,nextStage:'SHADOW_ONLY'},baseline:base.id,evaluated,approved};await writeJson(OUT,report);return res.status(200).json(report)
}
