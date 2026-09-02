import { listJson, readManyJson, storageReady } from './_report-store.js';
import { auditSourceCalibration } from './_source-calibration-audit.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({ok:false,error:'Calibration audit storage unavailable'});
  try{
    const blobs=await listJson('argus/shadow/',240),books=await readManyJson(blobs),audit=auditSourceCalibration(books,{source:'ARGUS_PREMATCH_1X2'});
    return res.status(200).json({ok:true,generatedAt:new Date().toISOString(),...audit});
  }catch(error){
    return res.status(500).json({ok:false,version:'SOURCE-CALIBRATION-INTEGRITY-1',error:String(error?.message||error),policy:{readOnly:true,providerCalls:0,persistentWrites:0}});
  }
}
