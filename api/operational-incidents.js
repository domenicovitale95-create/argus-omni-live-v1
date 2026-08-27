import { requestQuery } from './_request-query.js';
import { readJson, storageReady } from './_report-store.js';

const PATH='argus/health/incidents.json';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'OPERATIONAL-INCIDENTS-1',status:'DEGRADED',error:'Storage unavailable'});
  const feed=await readJson(PATH,{version:'ARGUS-INCIDENT-FEED-1',incidents:[]});
  const rows=Array.isArray(feed?.incidents)?feed.incidents:[];
  const limit=Math.max(1,Math.min(50,Number(requestQuery(req)?.limit)||20));
  const incidents=rows.slice(0,limit).map(x=>({id:x.id||null,kind:x.kind||null,severity:x.severity||null,createdAt:x.createdAt||null,status:x.status||null,consecutiveUnhealthyRuns:Number(x.consecutiveUnhealthyRuns||0),issues:Array.isArray(x.issues)?x.issues:[],actions:Array.isArray(x.actions)?x.actions:[]}));
  return res.status(200).json({version:'OPERATIONAL-INCIDENTS-1',generatedAt:new Date().toISOString(),status:'OK',count:rows.length,incidents,policy:{readOnly:true,providerCalls:false,writes:false,secretsExposed:false,automaticWagering:false}});
}
