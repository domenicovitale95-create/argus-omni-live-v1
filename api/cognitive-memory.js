import { readJson, storageReady } from './_report-store.js';

const PATH='argus/cognitive/latest.json';
function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!storageReady())return res.status(503).json({ok:false,error:'Storage unavailable',mode:'SHADOW_READ_ONLY'});
 const memory=await readJson(PATH,null);
 if(!memory)return res.status(200).json({ok:true,version:'COGNITIVE-MEMORY-1',mode:'SHADOW_READ_ONLY',initialized:false,active:[],recentlyResolved:[]});
 return res.status(200).json({ok:true,version:'COGNITIVE-MEMORY-1',mode:'SHADOW_READ_ONLY',initialized:true,generatedAt:memory.generatedAt||null,active:memory.memory?.active||[],recentlyResolved:memory.memory?.recentlyResolved||[],attention:memory.attention||{},constraints:memory.constraints||{}});
}
