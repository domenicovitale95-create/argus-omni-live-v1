import { readJson, storageReady } from './_report-store.js';

const PATH='argus/learning/ledger-diagnostics.json';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const data=await readJson(PATH,null);
  if(!data)return res.status(200).json({version:'LEARNING-HEALTH-1',status:'LEARNING',available:false,generatedAt:null,totalSettled:0,global:null,stale:true,policy:{readOnly:true,writes:false,recompute:false}});
  const ageMs=Date.now()-new Date(data.generatedAt||0).getTime();
  const stale=!Number.isFinite(ageMs)||ageMs>24*60*60*1000;
  return res.status(200).json({version:'LEARNING-HEALTH-1',status:data.global?.status||'LEARNING',available:true,generatedAt:data.generatedAt||null,totalSettled:data.totalSettled||0,global:data.global||null,stale,ageMinutes:Number.isFinite(ageMs)?Math.max(0,Math.round(ageMs/60000)):null,policy:{readOnly:true,writes:false,recompute:false}});
}
