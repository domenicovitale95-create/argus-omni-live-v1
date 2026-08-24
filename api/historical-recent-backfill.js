import { readJson, writeJson, storageReady } from './_report-store.js';
import { providerPlanMeta } from './_provider-plan.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const INDEX='argus/research/historical-recent-index.json';
const PREFIX='argus/research/historical-recent/';
const QUOTA_GUARD='argus/data/api-football-quota-guard.json';
const MIGRATION_FLOOR='2026-08-19';
const FINAL=new Set(['FT','AET','PEN']);
const ACTIVE_OR_SCHEDULED=new Set(['TBD','NS','1H','HT','2H','ET','BT','P','LIVE','INT']);
const DEFAULT_BATCH=6;
const MAX_BATCH=12;
const OPERATIONAL_RESERVE_RATIO=.20;
const LEARNING_RESERVE_RATIO=.25;
const MINUTE_RESERVE=5;

function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function ymd(d){return d.toISOString().slice(0,10)}
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function providerDayUtc(){return new Date().toISOString().slice(0,10)}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return ymd(x)}
function datesToYesterday(){const end=addDays(brusselsDate(),-1),out=[];for(let d=end;d>=MIGRATION_FLOOR;d=addDays(d,-1))out.push(d);return out}
function monthPath(date){return`${PREFIX}${date.slice(0,7)}.json`}
function hn(headers,name){const raw=headers.get(name);if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null}
function quota(headers){return{dailyRemaining:hn(headers,'x-ratelimit-requests-remaining'),dailyLimit:hn(headers,'x-ratelimit-requests-limit'),minuteRemaining:hn(headers,'x-ratelimit-remaining')}}
function budget(q={}){
  const configured=Number(providerPlanMeta()?.dailyLimit)||7500;
  const observedLimit=Number(q?.dailyLimit);
  const dailyLimit=Number.isFinite(observedLimit)&&observedLimit>0?observedLimit:configured;
  const operationalReserve=Math.max(1,Math.ceil(dailyLimit*OPERATIONAL_RESERVE_RATIO));
  const learningReserve=Math.max(operationalReserve,Math.ceil(dailyLimit*LEARNING_RESERVE_RATIO));
  const remaining=Number(q?.dailyRemaining);
  const dailyRemaining=Number.isFinite(remaining)?Math.max(0,remaining):null;
  const spendable=dailyRemaining==null?null:Math.max(0,dailyRemaining-learningReserve);
  return{dailyLimit,dailyRemaining,operationalReserve,learningReserve,spendable,minuteReserve:MINUTE_RESERVE,source:Number.isFinite(observedLimit)&&observedLimit>0?'PROVIDER_OBSERVED':'CONFIGURED_PLAN'};
}
function shouldStop(q){const b=budget(q);if(b.dailyRemaining!=null&&b.dailyRemaining<=b.learningReserve)return{stop:true,reason:'OPERATIONAL_RESERVE_PROTECTED',budget:b};if(q?.minuteRemaining!=null&&q.minuteRemaining<=MINUTE_RESERVE)return{stop:true,reason:'MINUTE_RESERVE_PROTECTED',budget:b};return{stop:false,reason:null,budget:b}}
function guardCurrent(guard){const day=guard?.providerDayUtc||guard?.date||String(guard?.observedAt||'').slice(0,10);return day===providerDayUtc()}
function normalize(f){const status=f?.fixture?.status?.short;if(!FINAL.has(status))return null;const h=Number(f?.goals?.home),a=Number(f?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))return null;return{fixtureId:Number(f.fixture?.id),timestamp:Number(f.fixture?.timestamp)||Math.floor(new Date(f.fixture?.date||0).getTime()/1000),date:f.fixture?.date||null,leagueId:Number(f.league?.id)||null,competition:f.league?.name||null,country:f.league?.country||null,season:f.league?.season||null,round:f.league?.round||null,homeId:Number(f.teams?.home?.id)||null,home:f.teams?.home?.name||null,awayId:Number(f.teams?.away?.id)||null,away:f.teams?.away?.name||null,homeGoals:h,awayGoals:a,totalGoals:h+a,exactScore:`${h}-${a}`,winner:h>a?'HOME':h<a?'AWAY':'DRAW',status}}
async function fetchDate(date){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});const q=quota(r.headers);if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);const all=j.response||[],active=all.filter(f=>ACTIVE_OR_SCHEDULED.has(String(f?.fixture?.status?.short||'')));return{rows:all.map(normalize).filter(Boolean),quota:q,settlementReady:active.length===0,activeUnsettled:active.length,activeStatuses:[...new Set(active.map(f=>String(f?.fixture?.status?.short||'UNKNOWN')))]}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req)&&String(req.query?.dryRun||'')!=='1')return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});

  const [guard,indexRaw]=await Promise.all([readJson(QUOTA_GUARD,null),readJson(INDEX,null)]),today=brusselsDate();
  const index=indexRaw||{version:'HISTORICAL-RECENT-INDEX-1',migrationFloor:MIGRATION_FLOOR,dates:{},months:{}};index.dates||={};index.months||={};
  const allDates=datesToYesterday(),pending=allDates.filter(d=>!index.dates[d]?.complete),requested=Math.max(1,Math.min(MAX_BATCH,Number(req.query?.dates)||DEFAULT_BATCH));
  const guardQuota=guardCurrent(guard)?{dailyLimit:Number(guard?.dailyLimit)||null,dailyRemaining:Number.isFinite(Number(guard?.dailyRemaining))?Number(guard.dailyRemaining):null}:{};
  const beforeBudget=budget(guardQuota);
  const providerHalted=guardCurrent(guard)&&Boolean(guard?.exhausted||guard?.mode==='HALT');
  const reserveBlocked=beforeBudget.dailyRemaining!=null&&beforeBudget.dailyRemaining<=beforeBudget.learningReserve;
  const maxCallsByBudget=beforeBudget.spendable==null?requested:Math.max(0,Math.min(requested,Math.floor(beforeBudget.spendable)));

  if(String(req.query?.dryRun||'')==='1')return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-BACKFILL-3',status:'DRY_RUN',today,migrationFloor:MIGRATION_FLOOR,requiredThrough:allDates[0]||null,pendingDates:pending.slice(0,requested),pendingCount:pending.length,providerCalls:0,writes:0,budget:beforeBudget,maxCallsByBudget,policy:{dryRun:true,providerQuotaSpend:false,persistentWrites:false,monthlyShards:true,noLegacyRewrite:true,operationalTrafficPriority:true}});
  if(providerHalted)return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-BACKFILL-3',status:'PAUSED_QUOTA_GUARD',today,processedDates:0,providerCalls:0,guardDate:guard?.date||guard?.providerDayUtc||null,budget:beforeBudget,stopReason:'PROVIDER_GUARD_HALTED',policy:{failClosed:true,noProviderQuotaSpend:true,automaticResumeOnNewProviderDay:true,operationalTrafficPriority:true}});
  if(reserveBlocked||maxCallsByBudget===0)return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-BACKFILL-3',status:'PAUSED_OPERATIONAL_RESERVE',today,processedDates:0,providerCalls:0,budget:beforeBudget,stopReason:'LEARNING_BUDGET_EXHAUSTED',policy:{failClosed:true,noProviderQuotaSpend:true,automaticResumeWhenBudgetReturns:true,operationalTrafficPriority:true}});

  const monthCache=new Map(),dirty=new Set();async function month(date){const p=monthPath(date);if(monthCache.has(p))return monthCache.get(p);const m=await readJson(p,{version:'HISTORICAL-RECENT-SHARD-1',month:date.slice(0,7),fixtures:{},dates:{}});m.fixtures||={};m.dates||={};monthCache.set(p,m);return m}
  let attempted=0,processed=0,newFixtures=0,providerCalls=0,lastQuota=null,stopReason=null;const errors=[],deferred=[];
  for(const date of pending){
    if(attempted>=maxCallsByBudget)break;
    try{
      attempted++;const out=await fetchDate(date);providerCalls++;lastQuota=out.quota;
      const stop=shouldStop(lastQuota);
      if(!out.settlementReady){deferred.push({date,activeUnsettled:out.activeUnsettled,statuses:out.activeStatuses});if(stop.stop){stopReason=stop.reason;break}continue}
      const shard=await month(date),path=monthPath(date);for(const row of out.rows){const k=String(row.fixtureId);if(!shard.fixtures[k])newFixtures++;shard.fixtures[k]=row}
      shard.dates[date]={complete:true,fixtures:out.rows.length,savedAt:new Date().toISOString(),settlementReady:true};shard.updatedAt=new Date().toISOString();index.dates[date]={complete:true,fixtures:out.rows.length,month:date.slice(0,7),savedAt:shard.updatedAt,settlementReady:true};index.months[date.slice(0,7)]={path,updatedAt:shard.updatedAt};dirty.add(path);processed++;
      if(stop.stop){stopReason=stop.reason;break}
    }catch(e){errors.push({date,error:e.message});stopReason='PROVIDER_OR_RUNTIME_ERROR';break}
  }
  for(const path of dirty)await writeJson(path,monthCache.get(path));
  const coverageDates=datesToYesterday(),recentCompleteDays=(()=>{let c=0;for(const d of coverageDates){if(index.dates[d]?.complete)c++;else break}return c})();index.version='HISTORICAL-RECENT-INDEX-1';index.migrationFloor=MIGRATION_FLOOR;index.updatedAt=new Date().toISOString();index.requiredThrough=coverageDates[0]||null;index.recentCompleteDays=recentCompleteDays;index.lastBudget={observedAt:index.updatedAt,before:beforeBudget,after:lastQuota?budget(lastQuota):beforeBudget,providerCalls,stopReason};await writeJson(INDEX,index);
  const status=errors.length?'PARTIAL':stopReason?'PAUSED_AFTER_PROGRESS':deferred.length?'DEFERRED_UNSETTLED':'OK';
  return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-RECENT-BACKFILL-3',status,migrationFloor:MIGRATION_FLOOR,requiredThrough:index.requiredThrough,attemptedDates:attempted,processedDates:processed,providerCalls,newFixtures,pendingBeforeRun:pending.length,recentCompleteDays,deferred,quota:lastQuota,budgetBefore:beforeBudget,budgetAfter:lastQuota?budget(lastQuota):beforeBudget,maxCallsByBudget,stopReason,errors,policy:{monthlyShards:true,noLegacyRewrite:true,recentFirst:true,noGapFilling:true,quotaAware:true,persistentIndex:true,completedDatesNeverRefetched:true,activeOrScheduledDatesDeferred:true,maxBatch:MAX_BATCH,learningReserveRatio:LEARNING_RESERVE_RATIO,operationalReserveRatio:OPERATIONAL_RESERVE_RATIO,minuteReserve:MINUTE_RESERVE,operationalTrafficPriority:true,providerGuardRespected:true,automaticResume:true}})
}
