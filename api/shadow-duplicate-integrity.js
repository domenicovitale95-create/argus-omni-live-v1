import { listJson, readManyJson, storageReady } from './_report-store.js';
import { inspectShadowFixtureDuplicates } from './_shadow-duplicate-inspector.js';

function queryValue(req,key){try{return new URL(req.url||'/', 'http://argus.local').searchParams.get(key)||''}catch(_){return''}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({ok:false,error:'Shadow duplicate audit storage unavailable'});
  try{
    const blobs=await listJson('argus/shadow/',240),books=await readManyJson(blobs),rawId=String(queryValue(req,'fixtureId')).trim(),onlyIds=rawId?[rawId]:null,result=inspectShadowFixtureDuplicates(books,{onlyIds,limit:rawId?1:20});
    return res.status(200).json({ok:true,generatedAt:new Date().toISOString(),...result});
  }catch(error){
    return res.status(500).json({ok:false,version:'SHADOW-DUPLICATE-INSPECTOR-1',error:String(error?.message||error),policy:{readOnly:true,providerCalls:0,persistentWrites:0}});
  }
}
