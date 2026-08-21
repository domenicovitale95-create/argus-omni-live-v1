import { writeJson, listJson, storageReady } from './_report-store.js';
import { monthKey, readMonthShard, readShardIndex, writeMonthShard, writeShardIndex, SHARD_INDEX } from './_historical-shards.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const DAYS=3653;
const LEGACY_ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATE='argus/research/historical-decade-state.json';
const FINAL=new Set(['FT','AET','PEN']);
const DEFAULT_BATCH=12;
const MAX_BATCH=24;
const MAX_MONOLITH_BYTES=24*1024*1024;

function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function ymd(d){return d.toISOString().slice(0,10)}
function dateList(){const out=[];const end=new Date(Date.now()-86400000);for(let i=0;i<DAYS;i++)out.push(ymd(new Date(end.getTime()-i*86400000)));return out}
function quota(headers){const remaining=Number(headers.get('x-ratelimit-requests-remaining')),limit=Number(headers.get('x-ratelimit-requests-limit')),minute=Number(headers.get('x-ratelimit-remaining'));return{dailyRemaining:Number.isFinite(remaining)?remaining:null,dailyLimit:Number.isFinite(limit)?limit:null,minuteRemaining:Number.isFinite(minute)?minute:null}}
function reserve(q){if(Number.isFinite(q?.dailyLimit))return Math.max(250,Math.ceil(q.dailyLimit*.15));return 500}
function normalize(f){const status=f?.fixture?.status?.short;if(!FINAL.has(status))return null;const h=Number(f?.goals?.home),a=Number(f?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))return null;return{fixtureId:Number(f.fixture?.id),timestamp:Number(f.fixture?.timestamp)||Math.floor(new Date(f.fixture?.date||0).getTime()/1000),date:f.fixture?.date||null,leagueId:Number(f.league?.id)||null,competition:f.league?.name||null,country:f.league?.country||null,season:f.league?.season||null,round:f.league?.round||null,homeId:Number(f.teams?.home?.id)||null,home:f.teams?.home?.name||null,awayId:Number(f.teams?.away?.id)||null,away:f.teams?.away?.name||null,homeGoals:h,awayGoals:a,totalGoals:h+a,exactScore:`${h}-${a}`,winner:h>a?'HOME':h<a?'AWAY':'DRAW',status};}
async function fetchDate(date){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});const q=quota(r.headers);if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return{rows:(j.response||[]).map(normalize).filter(Boolean),quota:q}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});

  const legacyMeta=(await listJson(LEGACY_ARCHIVE,10)).find(b=>b.pathname===LEGACY_ARCHIVE)||null;
  const legacyArchiveSizeBytes=Number.isFinite(Number(legacyMeta?.size))?Number(legacyMeta.size):null;
  const legacyUnsafe=legacyArchiveSizeBytes!=null&&legacyArchiveSizeBytes>MAX_MONOLITH_BYTES;
  const dates=dateList();
  const index=await readShardIndex();
  index.dates||={};index.shards||={};
  index.windowDays=DAYS;index.windowStart=dates.at(-1);index.windowEnd=dates[0];
  index.legacyArchive={pathname:LEGACY_ARCHIVE,sizeBytes:legacyArchiveSizeBytes,readDisabled:legacyUnsafe,preserved:true};
  index.strategy='MONTHLY_SHARDS_RECENT_FIRST';

  const requested=Math.max(1,Math.min(MAX_BATCH,Number(req.query?.dates)||DEFAULT_BATCH));
  const pending=dates.filter(date=>!index.dates[date]?.complete);
  const shardCache=new Map();
  const changedMonths=new Set();
  let processed=0,newFixtures=0,lastQuota=null;const errors=[];

  async function shardFor(month){if(!shardCache.has(month))shardCache.set(month,await readMonthShard(month));return shardCache.get(month)}

  for(const date of pending){
    if(processed>=requested)break;
    try{
      const out=await fetchDate(date);lastQuota=out.quota;
      const month=monthKey(date),shard=await shardFor(month);shard.fixtures||={};shard.dates||={};
      let addedForDate=0;
      for(const row of out.rows){const k=String(row.fixtureId);if(!shard.fixtures[k]){newFixtures++;addedForDate++;}shard.fixtures[k]=row}
      shard.dates[date]={complete:true,fixtures:out.rows.length,newFixtures:addedForDate,savedAt:new Date().toISOString()};
      index.dates[date]={complete:true,fixtures:out.rows.length,month,savedAt:new Date().toISOString()};
      changedMonths.add(month);processed++;
      const r=reserve(lastQuota);if(lastQuota?.dailyRemaining!=null&&lastQuota.dailyRemaining<=r)break;if(lastQuota?.minuteRemaining!=null&&lastQuota.minuteRemaining<=3)break;
    }catch(e){errors.push({date,error:e.message});break}
  }

  for(const month of changedMonths){
    const shard=await writeMonthShard(month,shardCache.get(month));
    index.shards[month]={pathname:`argus/research/historical-decade-shards/${month}.json`,fixtureCount:shard.fixtureCount,completedDates:shard.completedDates,updatedAt:shard.updatedAt};
  }
  await writeShardIndex(index);

  const completedDates=Object.values(index.dates).filter(x=>x?.complete).length;
  const recentCompletePrefix=(()=>{let c=0;for(const date of dates){if(index.dates[date]?.complete)c++;else break}return c})();
  const state={complete:completedDates>=dates.length,lastRun:new Date().toISOString(),lastQuota,strategy:'MONTHLY_SHARDS_RECENT_FIRST',recentCompleteDays:recentCompletePrefix,completedDates,totalDates:dates.length,shardIndex:SHARD_INDEX,legacyArchivePreserved:true,legacyArchiveReadDisabled:legacyUnsafe};
  await writeJson(STATE,state);

  return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-DECADE-BACKFILL-4',status:errors.length?'PARTIAL':'OK',storageMode:'MONTHLY_SHARDS',strategy:'RECENT_FIRST',windowDays:DAYS,windowStart:index.windowStart,windowEnd:index.windowEnd,processedDates:processed,requestedDates:requested,completedDates,totalDates:dates.length,recentCompleteDays:recentCompletePrefix,newFixtures,totalFixtures:index.fixtureCount||0,shardCount:Object.keys(index.shards).length,complete:state.complete,quota:lastQuota,reserve:reserve(lastQuota),legacyArchiveSizeBytes,legacyArchiveReadDisabled:legacyUnsafe,legacyArchivePreserved:true,errors,policy:{globalByDate:true,tenYears:true,recentDatesFirst:true,exactScoresStored:true,persistentArchive:true,quotaAware:true,noRepeatedFetchForCompletedDates:true,historicalOddsNotFabricated:true,monthlyShards:true,noMonolithicRead:true,memorySafeRebuild:true,maxBatch:MAX_BATCH}})
}
