import { listJson, readManyJson, storageReady } from './_report-store.js';

const settled = r => ['WIN','LOSS','VOID'].includes(String(r?.settlement?.status||''));
const present = v => v !== null && v !== undefined && v !== '';

function inspect(r){
  const frozen = Boolean(r?.integrity?.frozenBeforeKickoff && r?.integrity?.evidenceFrozenAtDecisionTime && r?.publishedAt && r?.kickoff && new Date(r.publishedAt) < new Date(r.kickoff));
  const base = {
    frozen,
    settlement: settled(r),
    odds: Number(r?.odds) > 1,
    confidence: Number.isFinite(Number(r?.confidence)),
    source: present(r?.integrity?.source),
    publishedAt: present(r?.publishedAt),
    kickoff: present(r?.kickoff),
    closingOdds: Number(r?.closingOdds) > 1 || Number(r?.marketTruth?.closingOdds) > 1,
    closingTimestamp: present(r?.closingOddsAt) || present(r?.marketTruth?.closingAt),
    sourceTimestamp: present(r?.sourceTimestamp) || present(r?.integrity?.sourceTimestamp)
  };
  return {...base,
    calibrationEligible: base.frozen && base.settlement && base.confidence,
    clvEligible: base.frozen && base.settlement && base.odds && base.closingOdds && base.closingTimestamp,
    completeEvidence: base.frozen && base.settlement && base.odds && base.confidence && base.source && base.sourceTimestamp && base.closingOdds && base.closingTimestamp
  };
}
const pct=(n,d)=>d?Number((100*n/d).toFixed(1)):null;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Evidence storage unavailable'});
  try{
    const days=Math.max(1,Math.min(90,Number(req.query?.days)||60));
    const blobs=await listJson('argus/ledger/',days),books=await readManyJson(blobs),rows=books.flatMap(b=>b?.records||[]),checks=rows.map(inspect);
    const count=k=>checks.filter(x=>x[k]).length;
    const fields=['frozen','settlement','odds','confidence','source','publishedAt','kickoff','closingOdds','closingTimestamp','sourceTimestamp'];
    const missing=Object.fromEntries(fields.map(k=>[k,rows.length-count(k)]));
    return res.status(200).json({version:'EVIDENCE-COMPLETENESS-1',generatedAt:new Date().toISOString(),windowDays:days,records:rows.length,metrics:{completeEvidencePct:pct(count('completeEvidence'),rows.length),calibrationEligiblePct:pct(count('calibrationEligible'),rows.length),clvEligiblePct:pct(count('clvEligible'),rows.length),settledFrozenPerWindow:checks.filter(x=>x.frozen&&x.settlement).length,closingCoveragePct:pct(count('closingOdds'),rows.length),sourceTimestampCoveragePct:pct(count('sourceTimestamp'),rows.length)},missing,policy:{observationalOnly:true,noTrustIncrease:true,unknownRemainsUnknown:true,noPrimeCreation:true}});
  }catch(e){return res.status(500).json({error:e.message})}
}
