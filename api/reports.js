import { requestQuery } from './_request-query.js';
import { listJson, readManyJson, storageReady } from './_report-store.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!storageReady()) return res.status(200).json({storageReady:false,reports:[]});
  const limit=Math.max(1,Math.min(180,Number(requestQuery(req)?.limit)||60));
  const blobs=await listJson('argus/reports/',limit);
  const reports=await readManyJson(blobs);
  reports.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  return res.status(200).json({storageReady:true,reports});
}
