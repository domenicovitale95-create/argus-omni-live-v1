import { requestQuery } from './_request-query.js';
import { readJson, readJsonFresh, writeJson, listJson, storageReady } from './_report-store.js';
import { providerPlanMeta } from './_provider-plan.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const DAYS=3653;
const ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATE='argus/research/historical-decade-state.json';
const QUOTA_GUARD='argus/data/api-football-quota-guard.json';
const FINAL=new Set(['FT','AET','PEN']);
const DEFAULT_BATCH=12;
const MAX_BATCH=24;
const MAX_MONOLITH_BYTES=24*1024*1024;
const LEARNING_RESERVE_RATIO=.25;
const MINUTE_RESERVE=5;

function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function ymd(d){return d.toISOString().slice(0,10)}
function providerDayUtc(){return new Date().toISOString().slice(0,10)}
function dateList(){const out=[];const end=new Date(Date.now()-86400000);for(let i=0;i<DAYS;i++)out.push(ymd(new Date(end.getTime()-i*86400000)));return out}
function hn(headers,name){const raw=headers.get(name);if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null}
function guardDay(g){return g?.providerDayUtc||g?.date||String(g?.observedAt||'').slice(0,10)||null}
function guardCurrent(g){return Boolean(g)&&guardDay(g)===providerDayUtc()}
function reserve(limit){const configured=Number(providerPlanMeta()?.dailyLimit)||7500,l=Number(limit)||configured;return Math.max(1,Math.ceil(l*LEARNING_RESERVE_RATIO))}
function seedQuota(guard){const current=guardCurrent(guard),configured=Number(providerPlanMeta()?.dailyLimit)||7500;return{providerCalls:0,dailyLimit:current&&Number(guard?.dailyLimit)>0?Number(guard.dailyLimit):configured,dailyRemaining:current&&guard?.dailyRemaining!=null&&Number.isFinite(Number(guard.dailyRemaining))?Number(guard.dailyRemaining):null,minuteRemaining:current&&guard?.minuteRemaining!=null&&Number.isFinite(Number(guard.minuteRemaining))?Number(guard.minuteRemaining):null,kind:current&&guard?.exhausted?'daily':null,providerError:current?guard?.providerError||null:null,observedAt:current?guard?.observedAt||null:null}}
function quotaBlocked(q){if(q.kind==='daily')return true;if(q.dailyRemaining!=null&&q.dailyRemaining<=reserve(q.dailyLimit))return true;if(q.minuteRemaining!=null&&q.minuteRemaining<=MINUTE_RESERVE)return true;return false}
function quotaErrorKind(data){const text=JSON.stringify(data?.errors||data||{}).toLowerCase();if(text.includes('per minute')||text.includes('requests per minute'))return'minute';if(text.includes('daily')||text.includes('per day')||text.includes('request limit')||text.includes('rate limit')||text.includes('too many requests'))return'daily';return null}
function captureQuota(q,headers){const remaining=hn(headers,'x-ratelimit-requests-remaining'),limit=hn(headers,'x-ratelimit-requests-limit'),minute=hn(headers,'x-ratelimit-remaining');if(remaining!=null)q.dailyRemaining=remaining;if(limit!=null)q.dailyLimit=limit;if(minute!=null)q.minuteRemaining=minute;q.observedAt=new Date().toISOString()}
function normalize(f){const status=f?.fixture?.status?.short;if(!FINAL.has(status))return null;const h=Number(f?.goals?.home),a=Number(f?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))return null;return{fixtureId:Number(f.fixture?.id),timestamp:Number(f.fixture?.timestamp)||Math.floor(new Date(f.fixture?.date||0).getTime()/1000),date:f.fixture?.date||null,leagueId:Number(f.league?.id)||null,competition:f.league?.name||null,country:f.league?.country||null,season:f.league?.season||null,round:f.league?.round||null,homeId:Number(f.teams?.home?.id)||null,home:f.teams?.home?.name||null,awayId:Number(f.teams?.away?.id)||null,away:f.teams?.away?.name||null,homeGoals:h,awayGoals:a,totalGoals:h+a,exactScore:`${h}-${a}`,winner:h>a?'HOME':h<a?'AWAY':'DRAW',status}}
async function fetchDate(date,q){if(quotaBlocked(q))throw new Error('HISTORICAL_LEARNING_QUOTA_RESERVE_PROTECTED');const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');q.providerCalls++;const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});captureQuota(q,r.headers);const j=await r.json().catch(()=>({})),kind=quotaErrorKind(j);if(kind){q.kind=kind;q.providerError=JSON.stringify(j?.errors||j||{});if(kind==='daily')q.dailyRemaining=0;throw new Error(kind==='minute'?'API_FOOTBALL_MINUTE_RATE_LIMIT':'API_FOOTBALL_DAILY_QUOTA_EXHAUSTED')}if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return(j.response||[]).map(normalize).filter(Boolean)}
async function persistQuota(q,previous){if(!storageReady()||!q.observedAt)return;try{const current=await readJsonFresh(QUOTA_GUARD,null),currentTime=new Date(current?.observedAt||0).getTime(),oursTime=new Date(q.observedAt||0).getTime();if(guardCurrent(current)&&current?.exhausted&&q.kind!=='daily')return;if(Number.isFinite(currentTime)&&Number.isFinite(oursTime)&&currentTime>oursTime)return;const dailyLimit=Number(q.dailyLimit)||Number(providerPlanMeta()?.dailyLimit)||7500,dailyRemaining=q.kind==='daily'?0:(q.dailyRemaining!=null&&Number.isFinite(Number(q.dailyRemaining))?Math.max(0,Number(q.dailyRemaining)):null),used=dailyRemaining==null?null:Math.max(0,dailyLimit-dailyRemaining),mode=q.kind==='daily'?'HALT':q.kind==='minute'?'THROTTLED':dailyRemaining!=null&&dailyRemaining<=reserve(dailyLimit)?'CRITICAL':dailyRemaining!=null&&dailyRemaining<=Math.ceil(dailyLimit*.2)?'THROTTLED':'NORMAL';await writeJson(QUOTA_GUARD,{...(guardCurrent(previous)?previous:{}),date:providerDayUtc(),providerDayUtc:providerDayUtc(),exhausted:q.kind==='daily',mode,reason:q.kind==='daily'?'PROVIDER_QUOTA_EXHAUSTED':q.kind==='minute'?'MINUTE_RATE_LIMIT_RECOVERABLE':null,dailyLimit,dailyRemaining,used,minuteRemaining:q.minuteRemaining,observedAt:q.observedAt,source:'API_FOOTBALL_HISTORICAL_DECADE',providerError:q.kind?q.providerError:null})}catch(_){}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});

  const guard=await readJsonFresh(QUOTA_GUARD,null),q=seedQuota(guard);
  if(quotaBlocked(q))return res.status(200).json({ok:true,version:'HISTORICAL-DECADE-BACKFILL-4',status:'PAUSED_LEARNING_RESERVE',processedDates:0,providerCalls:0,quota:{dailyLimit:q.dailyLimit,dailyRemaining:q.dailyRemaining,minuteRemaining:q.minuteRemaining,reserve:reserve(q.dailyLimit)},policy:{failClosed:true,operationalTrafficPriority:true,sharedQuotaGuard:true}});

  const archiveMeta=(await listJson(ARCHIVE,10)).find(b=>b.pathname===ARCHIVE)||null;
  const archiveSizeBytes=Number.isFinite(Number(archiveMeta?.size))?Number(archiveMeta.size):null;
  if(archiveSizeBytes!=null&&archiveSizeBytes>MAX_MONOLITH_BYTES){
    return res.status(200).json({ok:true,version:'HISTORICAL-DECADE-BACKFILL-4',status:'PAUSED_MEMORY_GUARD',generatedAt:new Date().toISOString(),archiveSizeBytes,maxMonolithBytes:MAX_MONOLITH_BYTES,processedDates:0,providerCalls:0,migrationRequired:true,recommendation:'Migrate the historical archive to year/month shards before resuming decade backfill.',policy:{failClosed:true,noOOMRiskAccepted:true,noProviderQuotaSpend:true,automaticBackfillPaused:true}});
  }

  const dates=dateList(),archive=await readJson(ARCHIVE,{version:'HISTORICAL-DECADE-ARCHIVE-2',fixtures:{},dates:{}}),state=await readJson(STATE,{complete:false});archive.fixtures||={};archive.dates||={};let processed=0,newFixtures=0,errors=[];
  const requested=Math.max(1,Math.min(MAX_BATCH,Number(requestQuery(req)?.dates)||DEFAULT_BATCH));
  const pending=dates.filter(date=>!archive.dates[date]?.complete);
  for(const date of pending){if(processed>=requested||quotaBlocked(q))break;try{const rows=await fetchDate(date,q);for(const row of rows){const k=String(row.fixtureId);if(!archive.fixtures[k])newFixtures++;archive.fixtures[k]=row}archive.dates[date]={complete:true,fixtures:rows.length,savedAt:new Date().toISOString()};processed++}catch(e){errors.push({date,error:e.message});break}}
  const completedDates=dates.filter(date=>archive.dates[date]?.complete).length;const recentCompletePrefix=(()=>{let c=0;for(const date of dates){if(archive.dates[date]?.complete)c++;else break}return c})();
  state.complete=completedDates>=dates.length;state.lastRun=new Date().toISOString();state.lastQuota={dailyRemaining:q.dailyRemaining,dailyLimit:q.dailyLimit,minuteRemaining:q.minuteRemaining};state.strategy='RECENT_FIRST';state.recentCompleteDays=recentCompletePrefix;archive.version='HISTORICAL-DECADE-ARCHIVE-2';archive.windowDays=DAYS;archive.windowStart=dates.at(-1);archive.windowEnd=dates[0];archive.fixtureCount=Object.keys(archive.fixtures).length;archive.completedDates=completedDates;archive.recentCompleteDays=recentCompletePrefix;archive.updatedAt=state.lastRun;await writeJson(ARCHIVE,archive);await writeJson(STATE,state);await persistQuota(q,guard);
  const stopped=quotaBlocked(q);return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-DECADE-BACKFILL-4',status:errors.length?'PARTIAL':stopped?'PAUSED_AFTER_PROGRESS':'OK',strategy:'RECENT_FIRST',windowDays:DAYS,windowStart:archive.windowStart,windowEnd:archive.windowEnd,processedDates:processed,requestedDates:requested,completedDates,totalDates:dates.length,recentCompleteDays:recentCompletePrefix,newFixtures,totalFixtures:archive.fixtureCount,complete:state.complete,providerCalls:q.providerCalls,quota:{dailyRemaining:q.dailyRemaining,dailyLimit:q.dailyLimit,minuteRemaining:q.minuteRemaining},reserve:reserve(q.dailyLimit),archiveSizeBytesBeforeRun:archiveSizeBytes,errors,policy:{globalByDate:true,tenYears:true,recentDatesFirst:true,exactScoresStored:true,persistentArchive:true,quotaAware:true,sharedQuotaGuard:true,learningReserveRatio:LEARNING_RESERVE_RATIO,operationalTrafficPriority:true,noRepeatedFetchForCompletedDates:true,historicalOddsNotFabricated:true,memoryGuard:true,maxBatch:MAX_BATCH}})
}
