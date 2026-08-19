import { listJson, readManyJson, readJson, storageReady } from './_report-store.js';

function latestIso(values=[]){const ts=values.map(v=>new Date(v||0).getTime()).filter(Number.isFinite).filter(v=>v>0);return ts.length?new Date(Math.max(...ts)).toISOString():null}
function ageMinutes(value){const t=new Date(value||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.round((Date.now()-t)/60000)):null}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'TRACKING-HEALTH-3',status:'DEGRADED',error:'Storage unavailable'});
  const blobs=await listJson('argus/ledger/',60),books=await readManyJson(blobs),records=books.flatMap(b=>b?.records||[]);
  const settled=records.filter(r=>['WIN','LOSS'].includes(r?.settlement?.status)),pending=records.filter(r=>r?.settlement?.status==='PENDING'),voids=records.filter(r=>r?.settlement?.status==='VOID');
  const lastCaptureAt=latestIso(records.map(r=>r?.lastSeenAt||r?.publishedAt)),lastSettlementAt=latestIso(records.map(r=>r?.settlement?.settledAt));
  const [learning,attribution,plan,cron]=await Promise.all([
    readJson('argus/learning/ledger-diagnostics.json',null),readJson('argus/learning/error-attribution.json',null),readJson('argus/autopilot/decision-plan.json',null),readJson('argus/health/prediction-ledger-cron.json',null)
  ]);
  const cronAge=ageMinutes(cron?.completedAt),capture=cron?.capture||null,planAge=ageMinutes(plan?.generatedAt);
  let status='HEALTHY',reason='Tracking pipeline is operating normally.';
  if(cron&&cron.ok===false){status='DEGRADED';reason='The latest Prediction Ledger cron completed with an error.'}
  else if(cronAge!=null&&cronAge>20){status='ATTENTION';reason='The Prediction Ledger cron has not refreshed within the expected window.'}
  else if(records.length===0){status='WAITING';reason=capture?`Latest capture considered ${capture.considered??0} rows and captured ${capture.captured??0}; no official prediction has qualified for freezing yet.`:'No Ledger record exists yet and no capture snapshot is available.'}
  if((planAge||0)>720){status='ATTENTION';reason='Autopilot decision plan is stale.'}
  return res.status(200).json({
    version:'TRACKING-HEALTH-3',generatedAt:new Date().toISOString(),status,reason,
    autopilot:{lastDecisionPlanAt:plan?.generatedAt||null,ageMinutes:planAge,planRows:Array.isArray(plan?.plan)?plan.plan.length:0},
    ledger:{records:records.length,settled:settled.length,pending:pending.length,voids:voids.length,lastCaptureAt,lastCaptureAgeMinutes:ageMinutes(lastCaptureAt),lastSettlementAt,lastSettlementAgeMinutes:ageMinutes(lastSettlementAt),lastCronAt:cron?.completedAt||null,lastCronAgeMinutes:cronAge,lastCronOk:cron?.ok??null,lastCaptureAttempt:capture?{status:capture.status??null,considered:capture.considered??null,captured:capture.captured??null,deduplicated:capture.deduplicated??null,rejectedLate:capture.rejectedLate??null,rejectedInvalid:capture.rejectedInvalid??null,error:capture.error||null}:null},
    learning:{lastUpdateAt:learning?.generatedAt||null,ageMinutes:ageMinutes(learning?.generatedAt),totalSettled:learning?.totalSettled||0,status:learning?.global?.status||'LEARNING'},
    attribution:{lastUpdateAt:attribution?.generatedAt||null,ageMinutes:ageMinutes(attribution?.generatedAt),totalSettled:attribution?.totalSettled||0,totalLosses:attribution?.totalLosses||0,status:attribution?.global?.status||'LEARNING'},
    policy:{readOnly:true,providerCalls:false,persistentWrites:false,lossesNeverHidden:true,positiveAttributionCannotCreatePrime:true,emptyLedgerIsNotAHealthFailure:true}
  });
}
