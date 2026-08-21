import { readJson, writeJson, listJson, storageReady } from './_report-store.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const DAYS=3653;
const ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATE='argus/research/historical-decade-state.json';
const FINAL=new Set(['FT','AET','PEN']);
const DEFAULT_BATCH=48;
const MAX_BATCH=120;

function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function ymd(d){return d.toISOString().slice(0,10)}
function dateList(){const out=[];const end=new Date(Date.now()-86400000);for(let i=0;i<DAYS;i++)out.push(ymd(new Date(end.getTime()-i*86400000)));return out}
function quota(headers){const remaining=Number(headers.get('x-ratelimit-requests-remaining')),limit=Number(headers.get('x-ratelimit-requests-limit')),minute=Number(headers.get('x-ratelimit-remaining'));return{dailyRemaining:Number.isFinite(remaining)?remaining:null,dailyLimit:Number.isFinite(limit)?limit:null,minuteRemaining:Number.isFinite(minute)?minute:null}}
function reserve(q){if(Number.isFinite(q?.dailyLimit))return Math.max(250,Math.ceil(q.dailyLimit*.15));return 500}
function normalize(f){const status=f?.fixture?.status?.short;if(!FINAL.has(status))return null;const h=Number(f?.goals?.home),a=Number(f?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))return null;return{fixtureId:Number(f.fixture?.id),timestamp:Number(f.fixture?.timestamp)||Math.floor(new Date(f.fixture?.date||0).getTime()/1000),date:f.fixture?.date||null,leagueId:Number(f.league?.id)||null,competition:f.league?.name||null,country:f.league?.country||null,season:f.league?.season||null,round:f.league?.round||null,homeId:Number(f.teams?.home?.id)||null,home:f.teams?.home?.name||null,awayId:Number(f.teams?.away?.id)||null,away:f.teams?.away?.name||null,homeGoals:h,awayGoals:a,totalGoals:h+a,exactScore:`${h}-${a}`,winner:h>a?'HOME':h<a?'AWAY':'DRAW',status};}
async function fetchDate(date){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});const q=quota(r.headers);if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return{rows:(j.response||[]).map(normalize).filter(Boolean),quota:q}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!authorized(req))return res.status(401).json({error:'Unauthorized'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
 const archiveMeta=(await listJson(ARCHIVE,10)).find((b)=>b.pathname===ARCHIVE)||null;
 console.log('[historical-decade-backfill] archive_meta',JSON.stringify({pathname:archiveMeta?.pathname||ARCHIVE,sizeBytes:Number.isFinite(archiveMeta?.size)?archiveMeta.size:null,uploadedAt:archiveMeta?.uploadedAt||null}));
 const dates=dateList(),archive=await readJson(ARCHIVE,{version:'HISTORICAL-DECADE-ARCHIVE-2',fixtures:{},dates:{}}),state=await readJson(STATE,{complete:false});archive.fixtures||={};archive.dates||={};let processed=0,newFixtures=0,lastQuota=null,errors=[];
 const requested=Math.max(1,Math.min(MAX_BATCH,Number(req.query?.dates)||DEFAULT_BATCH));
 const pending=dates.filter(date=>!archive.dates[date]?.complete);
 for(const date of pending){if(processed>=requested)break;try{const out=await fetchDate(date);lastQuota=out.quota;for(const row of out.rows){const k=String(row.fixtureId);if(!archive.fixtures[k])newFixtures++;archive.fixtures[k]=row}archive.dates[date]={complete:true,fixtures:out.rows.length,savedAt:new Date().toISOString()};processed++;const r=reserve(lastQuota);if(lastQuota?.dailyRemaining!=null&&lastQuota.dailyRemaining<=r)break;if(lastQuota?.minuteRemaining!=null&&lastQuota.minuteRemaining<=3)break}catch(e){errors.push({date,error:e.message});break}}
 const completedDates=dates.filter(date=>archive.dates[date]?.complete).length;const recentCompletePrefix=(()=>{let c=0;for(const date of dates){if(archive.dates[date]?.complete)c++;else break}return c})();
 state.complete=completedDates>=dates.length;state.lastRun=new Date().toISOString();state.lastQuota=lastQuota;state.strategy='RECENT_FIRST';state.recentCompleteDays=recentCompletePrefix;archive.version='HISTORICAL-DECADE-ARCHIVE-2';archive.windowDays=DAYS;archive.windowStart=dates.at(-1);archive.windowEnd=dates[0];archive.fixtureCount=Object.keys(archive.fixtures).length;archive.completedDates=completedDates;archive.recentCompleteDays=recentCompletePrefix;archive.updatedAt=state.lastRun;await writeJson(ARCHIVE,archive);await writeJson(STATE,state);
 return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-DECADE-BACKFILL-2',strategy:'RECENT_FIRST',windowDays:DAYS,windowStart:archive.windowStart,windowEnd:archive.windowEnd,processedDates:processed,completedDates,totalDates:dates.length,recentCompleteDays:recentCompletePrefix,newFixtures,totalFixtures:archive.fixtureCount,complete:state.complete,quota:lastQuota,reserve:reserve(lastQuota),errors,policy:{globalByDate:true,tenYears:true,recentDatesFirst:true,exactScoresStored:true,persistentArchive:true,quotaAware:true,noRepeatedFetchForCompletedDates:true,historicalOddsNotFabricated:true}})
}