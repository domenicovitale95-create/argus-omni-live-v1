import { readJson, writeJson, storageReady } from './_report-store.js';
import { providerPlanMeta } from './_provider-plan.js';

const API_BASE='https://v3.football.api-sports.io';
const DISPLAY_TIMEZONE='Europe/Brussels';
const QUOTA_GUARD_PATH='argus/data/api-football-quota-guard.json';
const SOFT_DAILY_CAP=6000;

function apiHeaders(){
  const key=String(process.env.API_FOOTBALL_KEY||'').trim();
  if(!key) throw new Error('API_FOOTBALL_KEY is not configured');
  return {'x-apisports-key':key,Accept:'application/json'};
}
function numberHeader(headers,name){const raw=headers.get(name);if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null}
function numberValue(v){const n=Number(v);return Number.isFinite(n)?n:null}
function dateInTimezone(date,timeZone=DISPLAY_TIMEZONE){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`}
function today(){return dateInTimezone(new Date())}
function quotaError(data){const text=JSON.stringify(data?.errors||{}).toLowerCase();return text.includes('request limit')||text.includes('rate limit')||text.includes('too many requests')}
async function readGuard(){if(!storageReady())return null;try{return await readJson(QUOTA_GUARD_PATH,null)}catch(_){return null}}
async function writeGuard(value){if(!storageReady())return;try{await writeJson(QUOTA_GUARD_PATH,value)}catch(_){} }

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const plan=providerPlanMeta(),planLimit=Number(plan.dailyLimit)||7500,guard=await readGuard();
  if(guard?.date===today()&&guard?.exhausted){
    return res.status(200).json({ok:true,provider:'API-FOOTBALL',plan,mode:'HALT',providerCallSkipped:true,reason:guard.reason||'QUOTA_GUARD_ACTIVE',usage:{used:guard.used??null,limit:guard.dailyLimit||planLimit,remaining:0,softCap:SOFT_DAILY_CAP},guard});
  }
  try{
    const response=await fetch(`${API_BASE}/status`,{headers:apiHeaders()});
    const data=await response.json().catch(()=>({}));
    const account=data?.response||{};
    const headers={dailyLimit:numberHeader(response.headers,'x-ratelimit-requests-limit'),dailyRemaining:numberHeader(response.headers,'x-ratelimit-requests-remaining'),minuteLimit:numberHeader(response.headers,'x-ratelimit-limit'),minuteRemaining:numberHeader(response.headers,'x-ratelimit-remaining')};
    const accountUsed=numberValue(account?.requests?.current);
    const accountLimit=numberValue(account?.requests?.limit_day);
    const limit=accountLimit||headers.dailyLimit||planLimit;
    const used=accountUsed!=null?accountUsed:(headers.dailyRemaining!=null?Math.max(0,limit-headers.dailyRemaining):null);
    const remaining=used!=null?Math.max(0,limit-used):(headers.dailyRemaining!=null?headers.dailyRemaining:null);
    const providerExhausted=quotaError(data)||remaining===0;
    const softCapReached=used!=null&&used>=Math.min(SOFT_DAILY_CAP,limit);
    const mode=providerExhausted||softCapReached?'HALT':(remaining!=null&&remaining<=1800?'CRITICAL':remaining!=null&&remaining<=3000?'THROTTLED':'NORMAL');
    const state={date:today(),exhausted:mode==='HALT',mode,reason:providerExhausted?'PROVIDER_QUOTA_EXHAUSTED':softCapReached?'SOFT_DAILY_CAP_REACHED':null,dailyLimit:limit,dailyRemaining:mode==='HALT'?0:remaining,used,softCap:Math.min(SOFT_DAILY_CAP,limit),observedAt:new Date().toISOString(),source:'API_FOOTBALL_STATUS',providerError:data?.errors||null};
    await writeGuard(state);
    return res.status(response.ok||providerExhausted?200:503).json({ok:response.ok&&!providerExhausted,provider:'API-FOOTBALL',plan,subscription:{active:account?.subscription?.active??null,end:account?.subscription?.end??null},mode,providerCallSkipped:false,usage:{used,limit,remaining:state.dailyRemaining,softCap:state.softCap},headers:{minuteLimit:headers.minuteLimit,minuteRemaining:headers.minuteRemaining},providerErrors:data?.errors||null,guardPersisted:storageReady(),fetchedAt:state.observedAt});
  }catch(error){return res.status(503).json({ok:false,provider:'API-FOOTBALL',plan,error:error.message,fetchedAt:new Date().toISOString()});}
}
