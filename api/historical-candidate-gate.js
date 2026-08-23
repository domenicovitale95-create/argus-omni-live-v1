import { readJson, writeJson, storageReady } from './_report-store.js';

const IN='argus/research/historical-walk-forward.json';
const OUT='argus/research/historical-candidates.json';
function improve(base,cand,key){const b=Number(base?.[key]),c=Number(cand?.[key]);if(!Number.isFinite(b)||!Number.isFinite(c)||b===0)return null;return Number(((b-c)/Math.abs(b)*100).toFixed(2))}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const lab=await readJson(IN,null);
  if(!lab||lab.status==='INSUFFICIENT_HISTORY'||lab.status==='PAUSED_MEMORY_GUARD')return res.status(200).json({version:'HISTORICAL-CANDIDATE-GATE-3',status:'WAITING_FOR_WALK_FORWARD',approved:[],policy:{failClosed:true,noPartialPromotion:true}});
  const base=lab.results?.BASELINE?.holdout;
  if(!base)return res.status(200).json({version:'HISTORICAL-CANDIDATE-GATE-3',status:'NO_BASELINE',approved:[],policy:{failClosed:true,noPartialPromotion:true}});
  const evaluated=Object.entries(lab.results||{}).filter(([id])=>id!=='BASELINE').map(([id,row])=>{
    const h=row?.holdout||{},sample=Number(h.sample||0),ll=improve(base,h,'logLoss'),br=improve(base,h,'brier');
    const top3Delta=Number.isFinite(Number(h.exactTop3))&&Number.isFinite(Number(base.exactTop3))?Number((h.exactTop3-base.exactTop3).toFixed(1)):null;
    const evidencePass=sample>=50&&ll!=null&&br!=null&&ll>=2&&br>=1&&top3Delta!=null&&top3Delta>=-2;
    const approved=Boolean(lab.migrationComplete)&&evidencePass;
    return{id,holdoutSample:sample,logLossImprovementPct:ll,brierImprovementPct:br,exactTop3DeltaPct:top3Delta,evidencePass,approved,blockedByMigration:evidencePass&&!lab.migrationComplete};
  });
  const approved=evaluated.filter(x=>x.approved),partialBlock=!lab.migrationComplete;
  const report={version:'HISTORICAL-CANDIDATE-GATE-3',generatedAt:new Date().toISOString(),status:partialBlock?'MIGRATION_INCOMPLETE':approved.length?'CANDIDATES_READY':'NO_APPROVED_CANDIDATE',sourceStatus:lab.status,migrationComplete:Boolean(lab.migrationComplete),policy:{researchOnly:true,minimumHoldout:50,noDirectProductionPromotion:true,noPartialArchivePromotion:true,nextStage:'SHADOW_ONLY'},baseline:'BASELINE',evaluated,approved};
  await writeJson(OUT,report);return res.status(200).json(report)
}
