import { aggregateTelemetry, telemetryDay } from './_analysis-telemetry.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const day=String(req.query?.day||telemetryDay()).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return res.status(400).json({error:'Invalid day; expected YYYY-MM-DD'});
  try{
    const report=await aggregateTelemetry(day);
    return res.status(200).json({ok:report.status==='OK',...report});
  }catch(error){
    return res.status(500).json({ok:false,status:'ERROR',error:String(error?.message||error),day});
  }
}
