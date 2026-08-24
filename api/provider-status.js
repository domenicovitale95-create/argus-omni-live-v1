import { readJsonFresh, writeJson, storageReady } from './_report-store.js';
import { providerPlanMeta } from './_provider-plan.js';

const API_BASE='https://v3.football.api-sports.io';
const QUOTA_GUARD_PATH='argus/data/api-football-quota-guard.json';
const SOFT_DAILY_CAP=6000;

function apiHeaders(){
  const key=String(process.env.API_FOOTBALL_KEY||'').trim();
  if(!key) throw new Error('API_FOOTBALL_KEY is not configured');
  return {'x-apisports-key':key,Accept:'application/json'};
}
function numberHeader(headers,name){const raw=headers.get(name);if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null}
function numberValue(v){const n=Number(v);return Number.isFinite(n)?n:null}
function providerDayUtc(date=new Date()){return date.toISOString().slice(0,10)}
function quotaErrorKind(data){const text=JSON.stringify(data?.errors||data||{}).toLowerCase();if(text.includes('per minute')||text.includes('requests per minute'))return 'minute';if(text.includes('daily')||text.includes('per day')||text.includes('request limit')||text.includes('rate limit')||text.includes('too many requests'))return 'daily';return null}
function guardIsMinuteThrottle(guard){const text=JSON.stringify(guard?.providerError||guard?.reason||'').toLowerCase();return text.includes('per minute')||text.includes('requests per minute')}
async function readGuard(){if(!storageReady())return null;try{return await readJsonFresh(QUOTA_GUARD_PATH,null)}catch(_){return null}}
async function writeGuard(value){if(!storageReady())return;try{await writeJson(QUOTA_GUARD_PATH,value)}catch(_){} }
function guardBelongsToCurrentProviderDay(guard){
  if(!guard)return false;
  const observedDay=guard?.observedAt?String(guard.observedAt).slice(0,10):null;
  const recordedDay=guard?.providerDayUtc||null;
  return (observedDay||recordedDay)===providerDayUtc();
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const plan=providerPlanMeta(),planLimit=Number(plan.dailyLimit)||7500;
  let guard=await readGuard();
  if(guard?.exhausted&&guardBelongsToCurrentProviderDay(guard)&&guardIsMinuteThrottle(guard)){
    guard={date:providerDayUtc(),providerDayUtc:providerDayUtc(),exhausted:false,mode:'THROTTLED',reason:'MINUTE_RATE_LIMIT_RECOVERABLE',dailyLimit:guard.dailyLimit||planLimit,dailyRemaining:null,used:guard.used??null,observedAt:new Date().toISOString(),source:'QUOTA_GUARD_REPAIR',providerError:null,repair:'MINUTE_LIMIT_WAS_NOT_DAILY_EXHAUSTION'};
    await writeGuard(guard);
  }
  if(guard?.exhausted&&guardBelongsToCurrentProviderDay(guard)){
    return res.status(200).json({ok:true,provider:'API-FOOTBALL',plan,mode:'HALT',providerCallSkipped:true,reason:guard.reason||'QUOTA_GUARD_ACTIVE',usage:{used:guard.used??null,limit:guard.dailyLimit||planLimit,remaining:0,softCap:SOFT_DAILY_CAP},guard});
  }
  try{
    const response=await fetch(`${API_BASE}/status`,{headers:apiHeaders()});
    const data=await response.json().catch(()=>({}));
    const errorKind=quotaErrorKind(data);
    const account=data?.response||{};
    const headers={dailyLimit:numberHeader(response.headers,'x-ratelimit-requests-limit'),dailyRemaining:numberHeader(response.headers,'x-ratelimit-requests-remaining'),minuteLimit:numberHeader(response.headers,'x-ratelimit-limit'),minuteRemaining:numberHeader(response.headers,'x-ratelimit-remaining')};
    const accountUsed=numberValue(account?.requests?.current);
    const accountLimit=numberValue(account?.requests?.limit_day);
    const limit=accountLimit||headers.dailyLimit||planLimit;
    const used=accountUsed!=null?accountUsed:(headers.dailyRemaining!=null?Math.max(0,limit-headers.dailyRemaining):null);
    const remaining=used!=null?Math.max(0,limit-used):(headers.dailyRemaining!=null?headers.dailyRemaining:null);
    const providerExhausted=errorKind==='daily'||remaining===0;
    const minuteThrottled=errorKind==='minute';
    const softCapReached=used!=null&&used>=Math.min(SOFT_DAILY_CAP,limit);
    const mode=providerExhausted||softCapReached?'HALT':minuteThrottled?'THROTTLED':(remaining!=null&&remaining<=1800?'CRITICAL':remaining!=null&&remaining<=3000?'THROTTLED':'NORMAL');
    const observedAt=new Date().toISOString();
    const state={date:providerDayUtc(),providerDayUtc:providerDayUtc(),exhausted:mode==='HALT',mode,reason:providerExhausted?'PROVIDER_QUOTA_EXHAUSTED':softCapReached?'SOFT_DAILY_CAP_REACHED':minuteThrottled?'MINUTE_RATE_LIMIT_RECOVERABLE':null,dailyLimit:limit,dailyRemaining:mode==='HALT'?0:remaining,used,softCap:Math.min(SOFT_DAILY_CAP,limit),observedAt,source:'API_FOOTBALL_STATUS',providerError:minuteThrottled?null:(data?.errors||null)};
    await writeGuard(state);
    return res.status(response.ok||providerExhausted||minuteThrottled?200:503).json({ok:response.ok&&!providerExhausted,provider:'API-FOOTBALL',plan,subscription:{active:account?.subscription?.active??null,end:account?.subscription?.end??null},mode,providerCallSkipped:false,usage:{used,limit,remaining:state.dailyRemaining,softCap:state.softCap},headers:{minuteLimit:headers.minuteLimit,minuteRemaining:headers.minuteRemaining},providerErrors:data?.errors||null,guardPersisted:storageReady(),providerDayUtc:state.providerDayUtc,fetchedAt:state.observedAt,consistentGuardRead:true});
  }catch(error){return res.status(503).json({ok:false,provider:'API-FOOTBALL',plan,error:error.message,fetchedAt:new Date().toISOString()});}
}
