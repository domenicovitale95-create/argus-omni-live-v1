import { recordAutopilotCycle } from './_analysis-telemetry.js';

export const config={maxDuration:180};
function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
function baseUrl(req){const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0];const host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app';return `${proto}://${host}`}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  const started=Date.now();
  const secret=String(process.env.CRON_SECRET||'').trim();
  const requestId=req.headers['x-vercel-id']||req.headers['x-request-id']||null;
  let body={ok:false,error:'AUTOPILOT_NOT_EXECUTED'};
  let httpStatus=500;
  try{
    const r=await fetch(`${baseUrl(req)}/api/autopilot`,{headers:{Accept:'application/json',...(secret?{Authorization:`Bearer ${secret}`}:{})}});
    httpStatus=r.status;
    body=await r.json().catch(()=>({ok:false,error:`AUTOPILOT_HTTP_${r.status}_NON_JSON`}));
  }catch(error){
    body={ok:false,error:String(error?.message||error),elapsedMs:Date.now()-started};
    httpStatus=500;
  }
  let telemetry={recorded:false};
  try{telemetry=await recordAutopilotCycle(body,{requestId,httpStatus});}
  catch(error){telemetry={recorded:false,reason:'TELEMETRY_WRITE_FAILED',error:String(error?.message||error)};}
  const response={...body,telemetry:{recorded:Boolean(telemetry?.recorded),path:telemetry?.path||null},wrapper:{version:'AUTOPILOT-METRICS-1',elapsedMs:Date.now()-started}};
  return res.status(httpStatus>=500?httpStatus:200).json(response);
}
