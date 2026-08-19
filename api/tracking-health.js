import { listJson, readManyJson, readJson, storageReady } from './_report-store.js';

function latestIso(values=[]){
  const ts=values.map(v=>new Date(v||0).getTime()).filter(Number.isFinite).filter(v=>v>0);
  return ts.length?new Date(Math.max(...ts)).toISOString():null;
}
function ageMinutes(value){
  const t=new Date(value||0).getTime();
  return Number.isFinite(t)&&t>0?Math.max(0,Math.round((Date.now()-t)/60000)):null;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'TRACKING-HEALTH-1',status:'DEGRADED',error:'Storage unavailable'});
  const blobs=await listJson('argus/ledger/',60),books=await readManyJson(blobs),records=books.flatMap(b=>b?.records||[]);
  const settled=records.filter(r=>['WIN','LOSS'].includes(r?.settlement?.status));
  const pending=records.filter(r=>r?.settlement?.status==='PENDING');
  const voids=records.filter(r=>r?.settlement?.status==='VOID');
  const lastCaptureAt=latestIso(records.map(r=>r?.lastSeenAt||r?.publishedAt));
  const lastSettlementAt=latestIso(records.map(r=>r?.settlement?.settledAt));
  const [learning,attribution,plan]=await Promise.all([
    readJson('argus/learning/ledger-diagnostics.json',null),
    readJson('argus/learning/error-attribution.json',null),
    readJson('argus/autopilot/decision-plan.json',null)
  ]);
  let status='HEALTHY';
  if(!lastCaptureAt&&records.length)status='ATTENTION';
  if((ageMinutes(plan?.generatedAt)||0)>720)status='ATTENTION';
  return res.status(200).json({
    version:'TRACKING-HEALTH-1',generatedAt:new Date().toISOString(),status,
    autopilot:{lastDecisionPlanAt:plan?.generatedAt||null,ageMinutes:ageMinutes(plan?.generatedAt)},
    ledger:{records:records.length,settled:settled.length,pending:pending.length,voids:voids.length,lastCaptureAt,lastCaptureAgeMinutes:ageMinutes(lastCaptureAt),lastSettlementAt,lastSettlementAgeMinutes:ageMinutes(lastSettlementAt)},
    learning:{lastUpdateAt:learning?.generatedAt||null,ageMinutes:ageMinutes(learning?.generatedAt),totalSettled:learning?.totalSettled||0,status:learning?.global?.status||'LEARNING'},
    attribution:{lastUpdateAt:attribution?.generatedAt||null,ageMinutes:ageMinutes(attribution?.generatedAt),totalSettled:attribution?.totalSettled||0,totalLosses:attribution?.totalLosses||0,status:attribution?.global?.status||'LEARNING'},
    policy:{readOnly:true,providerCalls:false,persistentWrites:false,lossesNeverHidden:true,positiveAttributionCannotCreatePrime:true}
  });
}
