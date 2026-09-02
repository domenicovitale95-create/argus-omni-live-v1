import { listJson, readManyJson, storageReady } from './_report-store.js';
import { evaluateMulticlassCalibration } from './_multiclass-calibration-challenger.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({ok:false,error:'Calibration challenger storage unavailable'});
  try{
    const blobs=await listJson('argus/shadow/',240),books=await readManyJson(blobs),result=evaluateMulticlassCalibration(books,{source:'ARGUS_PREMATCH_1X2'});
    return res.status(200).json({ok:true,generatedAt:new Date().toISOString(),...result});
  }catch(error){
    return res.status(500).json({ok:false,version:'MULTICLASS-CALIBRATION-CHALLENGER-1',error:String(error?.message||error),policy:{shadowOnly:true,readOnly:true,providerCalls:0,persistentWrites:0,automaticPromotion:false}});
  }
}
