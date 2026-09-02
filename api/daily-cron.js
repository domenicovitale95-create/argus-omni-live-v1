import { readJson } from './_report-store.js';

const QUOTA_GUARD_PATH='argus/data/api-football-quota-guard.json';
function brusselsParts(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function authorized(req){const secret=process.env.CRON_SECRET;return !secret||req.headers.authorization===`Bearer ${secret}`}
export function reportAuthorization(req,env=process.env){const secret=String(env?.REPORT_CRON_SECRET||'').trim();return secret?`Bearer ${secret}`:(req?.headers?.authorization||'')}
async function getJson(url,authorization){const r=await fetch(url,{headers:{Accept:'application/json',Authorization:authorization||''}});const data=await r.json().catch(()=>({}));return{ok:r.ok,status:r.status,data}}
async function postJson(url,authorization){const r=await fetch(url,{method:'POST',headers:{Accept:'application/json',Authorization:authorization||''}});const data=await r.json().catch(()=>({}));return{ok:r.ok,status:r.status,data}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  const p=brusselsParts();
  if(Number(p.hour)!==23)return res.status(200).json({ok:true,skipped:true,reason:'NOT_23H_BRUSSELS',localHour:p.hour});
  const date=`${p.year}-${p.month}-${p.day}`,proto=(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app',base=`${proto}://${host}`,auth=req.headers.authorization||'',reportAuth=reportAuthorization(req),guard=await readJson(QUOTA_GUARD_PATH,null),providerBlocked=Boolean(guard?.date===date&&guard?.exhausted);
  const report=providerBlocked?{ok:true,status:200,data:{summary:null,skipped:true,reason:'PROVIDER_BLOCKED_BY_QUOTA_GUARD'}}:await getJson(`${base}/api/daily-report?date=${date}&force=1`,reportAuth);
  if(!report.ok)return res.status(report.status).json({ok:false,error:report.data.error||'Daily report failed'});
  const ledger=await postJson(`${base}/api/prediction-ledger?mode=settle&date=${date}`,auth);
  const shadow=providerBlocked?{ok:true,status:200,data:{ok:true,date,settled:0,skipped:true,reason:'PROVIDER_BLOCKED_BY_QUOTA_GUARD'}}:await getJson(`${base}/api/shadow-mode?mode=settle&date=${date}`,auth);
  const learning=await getJson(`${base}/api/ledger-learning`,auth);
  const attribution=await getJson(`${base}/api/error-attribution`,auth);
  const counterfactual=await getJson(`${base}/api/counterfactual-learning`,auth);
  const training=await getJson(`${base}/api/training-memory`,auth);
  return res.status(200).json({ok:true,date,providerBlocked,quotaGuardObservedAt:guard?.observedAt||null,summary:report.data.summary||null,dailyReport:report.data.skipped?{skipped:true,reason:report.data.reason}:null,predictionLedger:ledger.ok?ledger.data:{error:ledger.data.error||'Ledger settlement failed'},ledgerLearning:learning.ok?{totalSettled:learning.data.totalSettled||0,global:learning.data.global||null}:{error:learning.data.error||'Ledger learning failed'},errorAttribution:attribution.ok?{totalSettled:attribution.data.totalSettled||0,totalLosses:attribution.data.totalLosses||0,global:attribution.data.global||null,topContributor:attribution.data.suspectedLossContributors?.[0]||null}:{error:attribution.data.error||'Error attribution failed'},counterfactualLearning:counterfactual.ok?{summary:counterfactual.data.summary||null}:{error:counterfactual.data.error||'Counterfactual learning failed'},shadowSettlement:shadow.ok?shadow.data:{error:shadow.data.error||'Shadow settlement failed'},training:training.ok?{totalSettled:training.data.totalSettled||0,shadowSettled:training.data.shadowSettled||0}:null,policy:{providerFallbackBlockedWhenQuotaExhausted:true,offlineLearningContinues:true,automaticResumeOnNewBrusselsDate:true}});
}
