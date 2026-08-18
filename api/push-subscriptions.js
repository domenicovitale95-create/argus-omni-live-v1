import { readJson, writeJson, storageReady } from './_report-store.js';

const PATH='argus/push/subscriptions.json';
function idOf(s){return String(s?.endpoint||'').slice(-80)}
function sameOrigin(req){
  const origin=String(req.headers.origin||'');
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
  if(!origin||!host)return true;
  try{return new URL(origin).host===host}catch(_){return false}
}
function validSubscription(sub){
  if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth)return false;
  try{const u=new URL(sub.endpoint);return u.protocol==='https:'&&sub.keys.p256dh.length>=32&&sub.keys.auth.length>=8}catch(_){return false}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!storageReady())return res.status(503).json({error:'Push storage unavailable'});
  if(req.method==='GET')return res.status(200).json({enabled:Boolean(process.env.VAPID_PUBLIC_KEY),publicKey:process.env.VAPID_PUBLIC_KEY||null});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!sameOrigin(req))return res.status(403).json({error:'Origin not allowed'});

  const sub=req.body?.subscription;
  if(!validSubscription(sub))return res.status(400).json({error:'Invalid push subscription'});

  const store=await readJson(PATH,{subscriptions:[]});
  const id=idOf(sub);
  const row={id,subscription:sub,createdAt:new Date().toISOString(),userAgent:String(req.headers['user-agent']||'').slice(0,220)};
  store.subscriptions=[row,...(store.subscriptions||[]).filter(x=>x.id!==id)].slice(0,50);
  store.updatedAt=new Date().toISOString();
  await writeJson(PATH,store);
  return res.status(200).json({ok:true,id,count:store.subscriptions.length});
}
