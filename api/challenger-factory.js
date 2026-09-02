import { listJson, readManyJson, readJson, writeJson, storageReady } from './_report-store.js';
import { CHALLENGER_VALIDATION_POLICY, evaluateChallengers } from './_challenger-validation.js';
import { dedupeShadowFixtures } from './_shadow-fixture-dedupe.js';

const PATH='argus/model-evolution/challenger-factory.json';

function eventTime(f){
  const frozen=new Date(f?.frozenAt||0).getTime();
  if(Number.isFinite(frozen)&&frozen>0)return frozen;
  const kickoff=new Date(f?.kickoff||0).getTime();
  return Number.isFinite(kickoff)&&kickoff>0?kickoff:null;
}
function compact(x){
  return{
    id:x.id,type:x.type,shrink:x.shrink,marketWeight:x.marketWeight,status:x.status,blockers:x.blockers,
    train:x.train,holdout:x.holdout,full:x.full,trainImprovementPct:x.trainImprovementPct,
    holdoutImprovementPct:x.holdoutImprovementPct,holdoutBrierCI:x.holdoutBrierCI
  };
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const blobs=await listJson('argus/shadow/',300),books=await readManyJson(blobs),canonicalView=dedupeShadowFixtures(books),rows=[];
  for(const f of canonicalView.fixtures){
    const t=eventTime(f),fixtureKey=f?.fixtureId;
    for(const p of f.picks||[])if(['WIN','LOSS'].includes(String(p?.outcome||'').toUpperCase()))rows.push({...p,_fixtureKey:fixtureKey,_eventTime:t});
  }
  const validation=evaluateChallengers(rows),approved=validation.approved.map(compact),candidates=validation.evaluations.map(compact);
  let state=await readJson(PATH,{version:'CHALLENGER-FACTORY-2',approved:[],history:[]});
  const sig=JSON.stringify(approved.map(x=>x.id)),oldSig=JSON.stringify((state.approved||[]).map(x=>x.id));
  if(sig!==oldSig){
    state.history=Array.isArray(state.history)?state.history:[];
    state.history.push({at:new Date().toISOString(),approved:approved.map(x=>({id:x.id,holdoutBrier:x.holdout?.brier,holdoutImprovementPct:x.holdoutImprovementPct,holdoutRoi:x.holdout?.roi,holdoutAvgCLV:x.holdout?.avgCLV,holdoutSample:x.holdout?.sample,holdoutFixtures:x.holdout?.fixtures}))});
    state.approved=approved;state.updatedAt=new Date().toISOString();if(state.history.length>60)state.history=state.history.slice(-60);await writeJson(PATH,state);
  }
  state.version='CHALLENGER-FACTORY-2';
  return res.status(200).json({
    version:'CHALLENGER-FACTORY-2',generatedAt:new Date().toISOString(),baseline:validation.baseline,
    trainBaseline:validation.trainBaseline,holdoutBaseline:validation.holdoutBaseline,split:validation.split,
    canonicalShadowEvidence:canonicalView.diagnostics,candidates,approved,state:{updatedAt:state.updatedAt,history:state.history||[]},policy:{...CHALLENGER_VALIDATION_POLICY,selection:'Candidates are ranked on the earlier chronological fixture block and must independently clear every gate on the later holdout block.',fixtureIsolation:true,noSameFixtureAcrossTrainAndHoldout:true,fixtureIdentityCanonicalized:true,duplicatePolicy:canonicalView.policy,productionMutation:false,automaticPromotion:false,rule:'The factory may propose bounded challengers only. Approval requires independent temporal holdout evidence and still cannot alter production or bypass Champion/Challenger governance.'}
  });
}
