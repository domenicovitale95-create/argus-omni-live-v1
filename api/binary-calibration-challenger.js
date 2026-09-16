import { listJsonComplete, readManyJson, storageReady } from './_report-store.js';
import { BINARY_CALIBRATION_POLICY, evaluateBinaryCalibration } from './_binary-calibration-challenger.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({ok:false,version:BINARY_CALIBRATION_POLICY.version,mode:'SHADOW_ONLY',error:'Calibration challenger storage unavailable',productionAuthority:false,automaticRealWagering:false});
  try{
    const listing=await listJsonComplete('argus/shadow/',{maxBlobs:5000,pageSize:500});
    if(!listing.complete)return res.status(503).json({ok:false,version:BINARY_CALIBRATION_POLICY.version,mode:'SHADOW_ONLY',error:`SHADOW_LISTING_INCOMPLETE:${listing.error||'UNKNOWN'}`,scanned:listing.scanned||0,pages:listing.pages||0,productionAuthority:false,automaticRealWagering:false});
    const books=await readManyJson(listing.blobs),result=evaluateBinaryCalibration(books);
    return res.status(200).json({ok:true,generatedAt:new Date().toISOString(),books:books.length,scanned:listing.scanned||listing.blobs.length,pages:listing.pages||null,...result,productionAuthority:false,automaticPromotion:false,automaticRealWagering:false,persistentWrites:0,providerCalls:0});
  }catch(error){
    return res.status(500).json({ok:false,version:BINARY_CALIBRATION_POLICY.version,mode:'SHADOW_ONLY',error:String(error?.message||error),productionAuthority:false,automaticPromotion:false,automaticRealWagering:false,persistentWrites:0,providerCalls:0});
  }
}
