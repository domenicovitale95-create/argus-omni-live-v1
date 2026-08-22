import { readJson, writeJson, storageReady } from './_report-store.js';

const PLAN='argus/autopilot/decision-plan.json';
const RESOURCE='argus/autopilot/resource-policy.json';
const OUT='argus/autopilot/quota-efficiency.json';
const DEFAULT_LIMIT=7500;
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function rows(plan){return Array.isArray(plan?.plan)?plan.plan:[]}
function extractRemaining(planRows=[]){return planRows.map(r=>n(r?.quota?.dailyRemaining,n(r?.dailyRemaining,null))).filter(Number.isFinite)}
function mode(remaining,limit){if(!Number.isFinite(remaining))return'UNKNOWN';const pct=limit>0?remaining/limit:0;if(remaining<=0)return'EXHAUSTED';if(pct<=.05)return'EMERGENCY';if(pct<=.15)return'SAFE';if(pct<=.35)return'CONSERVE';return'NORMAL'}
function reserve(modeName,limit){const p={NORMAL:.30,CONSERVE:.45,SAFE:.60,EMERGENCY:.80,EXHAUSTED:1,UNKNOWN:.50}[modeName]??.50;return Math.round(limit*p)}
function recommendation(modeName){if(modeName==='EXHAUSTED')return'OFFLINE_ONLY_UNTIL_RESET';if(modeName==='EMERGENCY')return'LIVE_ONLY_CRITICAL_REFRESHES';if(modeName==='SAFE')return'PROTECT_LIVE_RESERVE_AND_DISABLE_LOW_VOI_REFRESHES';if(modeName==='CONSERVE')return'ADAPTIVE_REFRESH_AND_CACHE_FIRST';if(modeName==='NORMAL')return'NORMAL_WITH_VOI_BUDGETING';return'OBSERVE_AND_VERIFY_PROVIDER_TELEMETRY'}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Quota intelligence storage unavailable'});
  const [plan,resource]=await Promise.all([readJson(PLAN,{plan:[],generatedAt:null}),readJson(RESOURCE,{})]);
  const planRows=rows(plan),remainingSamples=extractRemaining(planRows),limit=Math.max(1,n(process.env.ARGUS_PROVIDER_DAILY_LIMIT,DEFAULT_LIMIT));
  const remaining=remainingSamples.length?Math.min(...remainingSamples):null,used=Number.isFinite(remaining)?clamp(limit-remaining,0,limit):null,usedPct=Number.isFinite(used)?Number((used/limit*100).toFixed(1)):null;
  const quotaMode=mode(remaining,limit),reserveTarget=reserve(quotaMode,limit),reserveGap=Number.isFinite(remaining)?Math.max(0,reserveTarget-remaining):null;
  const urgent=planRows.filter(r=>r?.isLive||Number(r?.minutesToKickoff)>=0&&Number(r?.minutesToKickoff)<=90).length;
  const state={
    version:'ARGUS-QUOTA-EFFICIENCY-1',generatedAt:new Date().toISOString(),status:quotaMode==='EXHAUSTED'?'DEGRADED':quotaMode==='UNKNOWN'?'LEARNING':'HEALTHY',
    telemetry:{dailyLimit:limit,dailyRemaining:remaining,dailyUsed:used,usedPct,remainingSamples:remainingSamples.length,source:'DECISION_PLAN_SNAPSHOTS',providerCallMade:false,telemetryMayLag:true},
    budget:{mode:quotaMode,reserveTarget,reserveGap,urgentRows:urgent,recommendation:recommendation(quotaMode)},
    efficiency:{requestsAvoided:null,cacheHitRate:null,duplicateRequestsPrevented:null,requestsPerActionableFixture:null,score:null,status:'INSTRUMENTATION_REQUIRED'},
    nextInstrumentation:['COUNT_PROVIDER_CALLS_BY_ROUTE','COUNT_CACHE_HITS_AND_MISSES','COUNT_DUPLICATE_REQUESTS_PREVENTED','TRACK_REQUESTS_PER_FIXTURE','TRACK_REQUESTS_PER_ACTIONABLE_DECISION','ESTIMATE_HOURS_TO_EXHAUSTION'],
    policy:{readOnlyDecisionSupport:true,providerCalls:false,neverCreatesPrime:true,neverRaisesConfidence:true,offlineWorkAllowedWhenExhausted:true,protectLiveReserve:true,valueOfInformationBeforeFreshCall:true,resourcePolicyMode:resource?.mode||null,resourceQuotaMode:resource?.quotaMode||null}
  };
  await writeJson(OUT,state).catch(()=>{});
  return res.status(200).json(state);
}
