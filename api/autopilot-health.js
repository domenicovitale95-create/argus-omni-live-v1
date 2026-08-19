import { readJson, storageReady } from './_report-store.js';

function brusselsClock(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return{hour:Number(p.hour),minute:Number(p.minute)}}
function scheduledActive(c){return c.hour>=6||(c.hour===0&&c.minute<=30)}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'AUTOPILOT-HEALTH-2',status:'DEGRADED',error:'Storage unavailable'});
  const plan=await readJson('argus/autopilot/decision-plan.json',{generatedAt:null,plan:[]});
  const t=plan?.generatedAt?new Date(plan.generatedAt).getTime():0;
  const ageMinutes=t?Math.max(0,Math.round((Date.now()-t)/60000)):null;
  const rows=Array.isArray(plan?.plan)?plan.plan:[],clock=brusselsClock(),activeWindow=scheduledActive(clock);
  let status='WAITING';
  if(!activeWindow)status=t?'SCHEDULED_IDLE':'WAITING';
  else if(t){if(ageMinutes<=35)status='ACTIVE';else if(ageMinutes<=180)status='AVAILABLE';else if(ageMinutes<=720)status='STALE';else status='VERY_STALE'}
  return res.status(200).json({version:'AUTOPILOT-HEALTH-2',generatedAt:new Date().toISOString(),status,scheduledActive:activeWindow,brusselsClock:clock,decisionPlanGeneratedAt:plan?.generatedAt||null,ageMinutes,planRows:rows.length,liveRows:rows.filter(x=>x?.isLive).length,primeRows:rows.filter(x=>x?.finalVerdict==='PRIME').length,policy:{readOnly:true,providerCalls:false,persistentWrites:false,scheduledIdleIsNotFailure:true,doesNotDisableAutopilot:true,automaticWagering:false}})
}
