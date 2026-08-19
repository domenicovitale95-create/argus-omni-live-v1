import { readJson, storageReady } from './_report-store.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'AUTOPILOT-HEALTH-1',status:'DEGRADED',error:'Storage unavailable'});
  const plan=await readJson('argus/autopilot/decision-plan.json',{generatedAt:null,plan:[]});
  const t=plan?.generatedAt?new Date(plan.generatedAt).getTime():0;
  const ageMinutes=t?Math.max(0,Math.round((Date.now()-t)/60000)):null;
  const rows=Array.isArray(plan?.plan)?plan.plan:[];
  let status='WAITING';
  if(t){if(ageMinutes<=35)status='ACTIVE';else if(ageMinutes<=180)status='AVAILABLE';else if(ageMinutes<=720)status='STALE';else status='VERY_STALE'}
  return res.status(200).json({version:'AUTOPILOT-HEALTH-1',generatedAt:new Date().toISOString(),status,decisionPlanGeneratedAt:plan?.generatedAt||null,ageMinutes,planRows:rows.length,liveRows:rows.filter(x=>x?.isLive).length,primeRows:rows.filter(x=>x?.finalVerdict==='PRIME').length,policy:{readOnly:true,providerCalls:false,persistentWrites:false,doesNotDisableAutopilot:true,automaticWagering:false}})
}
