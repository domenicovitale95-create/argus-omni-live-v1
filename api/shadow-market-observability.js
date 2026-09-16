import { listJsonComplete, readManyJson, storageReady } from './_report-store.js';
import { buildShadowMarketObservability } from './_shadow-market-observability.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({ok:false,mode:'SHADOW_ONLY',error:'Storage unavailable',productionAuthority:false,automaticRealWagering:false});
  try{
    const listing=await listJsonComplete('argus/shadow/',{maxBlobs:5000,pageSize:500});
    if(!listing.complete)return res.status(503).json({ok:false,mode:'SHADOW_ONLY',error:`SHADOW_LISTING_INCOMPLETE:${listing.error||'UNKNOWN'}`,scanned:listing.scanned||0,pages:listing.pages||0,productionAuthority:false,automaticRealWagering:false});
    const books=await readManyJson(listing.blobs),observability=buildShadowMarketObservability(books);
    return res.status(200).json({
      ok:true,
      generatedAt:new Date().toISOString(),
      mode:'SHADOW_ONLY',
      readOnly:true,
      books:books.length,
      scanned:listing.scanned||listing.blobs.length,
      pages:listing.pages||null,
      ...observability,
      providerCalls:0,
      bookmakerCalls:0,
      persistentWrites:0,
      productionAuthority:false,
      officialLedgerEligible:false,
      automaticPromotion:false,
      automaticRealWagering:false
    });
  }catch(error){
    return res.status(503).json({ok:false,mode:'SHADOW_ONLY',error:String(error?.message||error),providerCalls:0,persistentWrites:0,productionAuthority:false,automaticRealWagering:false});
  }
}
