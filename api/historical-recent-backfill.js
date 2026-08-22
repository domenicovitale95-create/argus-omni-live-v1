import { readJson, writeJson, storageReady } from './_report-store.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const INDEX='argus/research/historical-recent-index.json';
const PREFIX='argus/research/historical-recent/';
const QUOTA_GUARD='argus/data/api-football-quota-guard.json';
const MIGRATION_FLOOR='2026-08-19';
const FINAL=new Set(['FT','AET','PEN']);
const DEFAULT_BATCH=6;
const MAX_BATCH=12;

function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function ymd(d){return d.toISOString().slice(0,10)}
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return ymd(x)}
function datesToYesterday(){const end=addDays(brusselsDate(),-1),out=[];for(let d=end;d>=MIGRATION_FLOOR;d=addDays(d,-1))out.push(d);return out}
function monthPath(date){return`${PREFIX}${date.slice(0,7)}.json`}
function quota(headers){const remaining=Number(headers.get('x-ratelimit-requests-remaining')),limit=Number(headers.get('x-ratelimit-requests-limit')),minute=Number(headers.get('x-ratelimit-remaining'));return{dailyRemaining:Number.isFinite(remaining)?remaining:null,dailyLimit:Number.isFinite(limit)?limit:null,minuteRemaining:Number.isFinite(minute)?minute:null}}
function reserve(q){if(Number.isFinite(q?.dailyLimit))return Math.max(250,Math.ceil(q.dailyLimit*.15));return 500}
function normalize(f){const status=f?.fixture?.status?.short;if(!FINAL.has(status))return null;const h=Number(f?.goals?.home),a=Number(f?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))return null;return{fixtureId:Number(f.fixture?.id),timestamp:Number(f.fixture?.timestamp)||Math.floor(new Date(f.fixture?.date||0).getTime()/1000),date:f.fixture?.date||null,leagueId:Number(f.league?.id)||null,competition:f.league?.name||null,country:f.league?.country||null,season:f.league?.season||null,round:f.league?.round||null,homeId:Number(f.teams?.home?.id)||null,home:f.teams?.home?.name||null,awayId:Number(f.teams?.away?.id)||null,away:f.teams?.away?.name||null,homeGoals:h,awayGoals:a,totalGoals:h+a,exactScore:`${h}-${a}`,winner:h>a?'HOME':h<a?'AWAY':'DRAW',status}}
async function fetchDate(date){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});const q=quota(r.headers);if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return{rows:(j.response||[]).map(normalize).filter(Boolean),quota:q}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req)&&String(req.query?.dryRun||'')!=='1')return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});

  const [guard,indexRaw]=await Promise.all([readJson(QUOTA_GUARD,null),readJson(INDEX,null)]),today=brusselsDate();
  const index=indexRaw||{version:'HISTORICAL-RECENT-INDEX-1',migrationFloor:MIGRATION_FLOOR,dates:{},months:{}};index.dates||={};index.months||={};
  const allDates=datesToYesterday(),pending=allDates.filter(d=>!index.dates[d]?.complete),requested=Math.max(1,Math.min(MAX_BATCH,Number(req.query?.dates)||DEFAULT_BATCH));
  if(String(req.query?.dryRun||'')==='1')return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-BACKFILL-1',status:'DRY_RUN',today,migrationFloor:MIGRATION_FLOOR,requiredThrough:allDates[0]||null,pendingDates:pending.slice(0,requested),pendingCount:pending.length,providerCalls:0,writes:0,policy:{dryRun:true,providerQuotaSpend:false,persistentWrites:false,monthlyShards:true,noLegacyRewrite:true}});
  if(guard?.date===today&&guard?.exhausted)return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-BACKFILL-1',status:'PAUSED_QUOTA_GUARD',today,processedDates:0,providerCalls:0,guardDate:guard.date,policy:{failClosed:true,noProviderQuotaSpend:true,automaticResumeOnNewBrusselsDate:true}});

  const monthCache=new Map(),dirty=new Set();async function month(date){const p=monthPath(date);if(monthCache.has(p))return monthCache.get(p);const m=await readJson(p,{version:'HISTORICAL-RECENT-SHARD-1',month:date.slice(0,7),fixtures:{},dates:{}});m.fixtures||={};m.dates||={};monthCache.set(p,m);return m}
  let processed=0,newFixtures=0,providerCalls=0,lastQuota=null;const errors=[];
  for(const date of pending){if(processed>=requested)break;try{const out=await fetchDate(date);providerCalls++;lastQuota=out.quota;const shard=await month(date),path=monthPath(date);for(const row of out.rows){const k=String(row.fixtureId);if(!shard.fixtures[k])newFixtures++;shard.fixtures[k]=row}shard.dates[date]={complete:true,fixtures:out.rows.length,savedAt:new Date().toISOString()};shard.updatedAt=new Date().toISOString();index.dates[date]={complete:true,fixtures:out.rows.length,month:date.slice(0,7),savedAt:shard.updatedAt};index.months[date.slice(0,7)]={path,updatedAt:shard.updatedAt};dirty.add(path);processed++;const r=reserve(lastQuota);if(lastQuota?.dailyRemaining!=null&&lastQuota.dailyRemaining<=r)break;if(lastQuota?.minuteRemaining!=null&&lastQuota.minuteRemaining<=3)break}catch(e){errors.push({date,error:e.message});break}}
  for(const path of dirty)await writeJson(path,monthCache.get(path));
  const coverageDates=datesToYesterday(),recentCompleteDays=(()=>{let c=0;for(const d of coverageDates){if(index.dates[d]?.complete)c++;else break}return c})();index.version='HISTORICAL-RECENT-INDEX-1';index.migrationFloor=MIGRATION_FLOOR;index.updatedAt=new Date().toISOString();index.requiredThrough=coverageDates[0]||null;index.recentCompleteDays=recentCompleteDays;await writeJson(INDEX,index);
  return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-RECENT-BACKFILL-1',status:errors.length?'PARTIAL':'OK',migrationFloor:MIGRATION_FLOOR,requiredThrough:index.requiredThrough,processedDates:processed,providerCalls,newFixtures,pendingBeforeRun:pending.length,recentCompleteDays,quota:lastQuota,reserve:reserve(lastQuota),errors,policy:{monthlyShards:true,noLegacyRewrite:true,recentFirst:true,noGapFilling:true,quotaAware:true,persistentIndex:true,completedDatesNeverRefetched:true,maxBatch:MAX_BATCH}})
}
