import { readJson, writeJson, storageReady } from './_report-store.js';

function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
async function safeRead(path,fallback=null){if(!storageReady())return fallback;try{return await readJson(path,fallback)}catch(_){return fallback}}
function ageMinutes(ts){const t=new Date(ts||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.round((Date.now()-t)/60000)):null}
function classify({quota,self}){
  if(quota?.exhausted||quota?.mode==='HALT'||Number(quota?.dailyRemaining)===0)return 'HALT';
  if(self?.promotionFreeze||Array.isArray(self?.errors)&&self.errors.length>0)return 'WATCH';
  const readiness=String(self?.results?.readiness?.status||'').toUpperCase();
  if(['DEGRADED','TRAINING_WEAK','NOT_READY'].includes(readiness))return 'WATCH';
  return 'HEALTHY';
}
function bestIdea({status,quota,self}){
  if(status==='HALT')return {action:'NO_CHANGE',idea:'Preserve provider halt until verified quota reset.',reason:'Quota protection outranks experimentation.',providerCallsRequired:0};
  if(self?.promotionFreeze)return {action:'NO_CHANGE',idea:'Keep promotion freeze and collect more verified evidence before any policy/model change.',reason:'Existing evidence has triggered a safety freeze.',providerCallsRequired:0};
  if(Array.isArray(self?.errors)&&self.errors.length)return {action:'ACTION_CANDIDATE',idea:'Investigate the first reproducible stored self-improvement error in an isolated preview.',reason:String(self.errors[0]).slice(0,300),providerCallsRequired:0};
  const readiness=String(self?.results?.readiness?.status||'').toUpperCase();
  if(['DEGRADED','TRAINING_WEAK','NOT_READY'].includes(readiness))return {action:'ACTION_CANDIDATE',idea:'Increase evidence quality from already stored settlements and immutable prematch records before adding provider calls.',reason:`Readiness=${readiness}`,providerCallsRequired:0};
  const quotaAge=ageMinutes(quota?.observedAt);
  if(quotaAge!=null&&quotaAge>120)return {action:'ACTION_CANDIDATE',idea:'Refresh quota observability through the existing scheduled provider-status check; do not increase its frequency.',reason:`Quota snapshot age=${quotaAge}m`,providerCallsRequired:0};
  return {action:'NO_CHANGE',idea:'No sufficiently strong improvement candidate this hour.',reason:'System evidence does not justify mutation.',providerCallsRequired:0};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  const started=Date.now();
  const quota=await safeRead('argus/data/api-football-quota-guard.json',null);
  const self=await safeRead('argus/self-improvement/latest.json',null);
  const status=classify({quota,self});
  const recommendation=bestIdea({status,quota,self});
  const snapshot={
    version:'HOURLY-MENTOR-1',
    generatedAt:new Date().toISOString(),
    status,
    mode:'ZERO_PROVIDER_CALLS',
    providerCallsUsed:0,
    automaticProductionMutation:false,
    mainMutationAllowed:false,
    inputs:{
      quota:{available:Boolean(quota),exhausted:Boolean(quota?.exhausted),dailyLimit:quota?.dailyLimit??null,dailyRemaining:quota?.dailyRemaining??null,observedAt:quota?.observedAt??null,ageMinutes:ageMinutes(quota?.observedAt)},
      selfImprovement:{available:Boolean(self),generatedAt:self?.generatedAt??null,promotionFreeze:Boolean(self?.promotionFreeze),errorCount:Array.isArray(self?.errors)?self.errors.length:0,readiness:self?.results?.readiness??null}
    },
    recommendation,
    policy:{maxIdeasPerCycle:1,allowNoChange:true,previewBeforePromotion:true,providerFreeFirst:true},
    elapsedMs:Date.now()-started
  };
  if(storageReady())try{await writeJson('argus/hourly-mentor/latest.json',snapshot)}catch(_){}
  return res.status(200).json({ok:true,...snapshot});
}
