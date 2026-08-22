import { readJson, storageReady } from './_report-store.js';

const QUOTA_GUARD_PATH='argus/data/api-football-quota-guard.json';
function brusselsClock(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return{hour:Number(p.hour),minute:Number(p.minute)}}
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function scheduledActive(c){return c.hour>=6||(c.hour===0&&c.minute<=30)}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'AUTOPILOT-HEALTH-3',status:'DEGRADED',error:'Storage unavailable'});
  const [plan,guard]=await Promise.all([readJson('argus/autopilot/decision-plan.json',{generatedAt:null,plan:[]}),readJson(QUOTA_GUARD_PATH,null)]);
  const t=plan?.generatedAt?new Date(plan.generatedAt).getTime():0;
  const ageMinutes=t?Math.max(0,Math.round((Date.now()-t)/60000)):null;
  const rows=Array.isArray(plan?.plan)?plan.plan:[],clock=brusselsClock(),activeWindow=scheduledActive(clock),zeroQuota=Boolean(guard?.date===brusselsDate()&&guard?.exhausted&&guard?.temporary);
  let status='WAITING';
  if(zeroQuota)status='PAUSED_ZERO_QUOTA';
  else if(!activeWindow)status=t?'SCHEDULED_IDLE':'WAITING';
  else if(t){if(ageMinutes<=35)status='ACTIVE';else if(ageMinutes<=180)status='AVAILABLE';else if(ageMinutes<=720)status='STALE';else status='VERY_STALE'}
  return res.status(200).json({version:'AUTOPILOT-HEALTH-3',generatedAt:new Date().toISOString(),status,scheduledActive:activeWindow,brusselsClock:clock,provider:{mode:zeroQuota?'TEMP_ZERO_QUOTA':'NORMAL',guardActive:Boolean(guard?.date===brusselsDate()&&guard?.exhausted),temporary:Boolean(guard?.temporary),expiresAutomaticallyAt:guard?.expiresAutomaticallyAt||null},decisionPlanGeneratedAt:plan?.generatedAt||null,ageMinutes,planRows:rows.length,liveRows:rows.filter(x=>x?.isLive).length,primeRows:rows.filter(x=>x?.finalVerdict==='PRIME').length,policy:{readOnly:true,providerCalls:false,persistentWrites:false,scheduledIdleIsNotFailure:true,intentionalZeroQuotaPauseIsNotFailure:true,doesNotDisableAutopilot:true,automaticWagering:false}})
}
