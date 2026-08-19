import { readJson, writeJson, storageReady } from './_report-store.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const DAYS=365;
const ARCHIVE='argus/research/historical-fixtures.json';
const STATE='argus/research/historical-year-state.json';
const FINAL=new Set(['FT','AET','PEN']);
const MIN_DAILY_RESERVE=150;
const DATES_PER_RUN=12;

function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function ymd(d){return d.toISOString().slice(0,10)}
function dateList(){const out=[];const today=new Date();for(let i=DAYS;i>=1;i--){out.push(ymd(new Date(today.getTime()-i*86400000)))}return out}
function quota(headers){const d=Number(headers.get('x-ratelimit-requests-remaining')),m=Number(headers.get('x-ratelimit-remaining'));return{dailyRemaining:Number.isFinite(d)?d:null,minuteRemaining:Number.isFinite(m)?m:null}}
function normalize(f){const s=f?.fixture?.status?.short;if(!FINAL.has(s))return null;const h=Number(f?.goals?.home),a=Number(f?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))return null;return{fixtureId:Number(f.fixture?.id),timestamp:Number(f.fixture?.timestamp)||Math.floor(new Date(f.fixture?.date||0).getTime()/1000),date:f.fixture?.date||null,leagueId:Number(f.league?.id)||null,competition:f.league?.name||null,country:f.league?.country||null,season:f.league?.season||null,round:f.league?.round||null,homeId:Number(f.teams?.home?.id)||null,home:f.teams?.home?.name||null,awayId:Number(f.teams?.away?.id)||null,away:f.teams?.away?.name||null,homeGoals:h,awayGoals:a,exactScore:`${h}-${a}`,winner:h>a?'HOME':h<a?'AWAY':'DRAW',status:s};}
async function fetchDate(date){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});const q=quota(r.headers);if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return{rows:(j.response||[]).map(normalize).filter(Boolean),quota:q}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!authorized(req))return res.status(401).json({error:'Unauthorized'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const dates=dateList(),archive=await readJson(ARCHIVE,{version:'HISTORICAL-ARCHIVE-2',fixtures:{},dates:{}}),state=await readJson(STATE,{cursor:0,complete:false,lastRun:null});archive.fixtures||={};archive.dates||={};let cursor=Math.max(0,Number(state.cursor)||0),processed=0,newFixtures=0,lastQuota=null,errors=[];
  const maxDates=Math.max(1,Math.min(24,Number(req.query?.dates)||DATES_PER_RUN));
  while(cursor<dates.length&&processed<maxDates){const date=dates[cursor];if(archive.dates[date]?.complete){cursor++;continue}try{const out=await fetchDate(date);lastQuota=out.quota;for(const row of out.rows){const k=String(row.fixtureId);if(!archive.fixtures[k])newFixtures++;archive.fixtures[k]=row}archive.dates[date]={complete:true,fixtures:out.rows.length,savedAt:new Date().toISOString()};processed++;cursor++;if(lastQuota?.dailyRemaining!=null&&lastQuota.dailyRemaining<=MIN_DAILY_RESERVE)break;if(lastQuota?.minuteRemaining!=null&&lastQuota.minuteRemaining<=3)break}catch(e){errors.push({date,error:e.message});break}}
  state.cursor=cursor;state.complete=cursor>=dates.length;state.lastRun=new Date().toISOString();state.lastQuota=lastQuota;archive.version='HISTORICAL-ARCHIVE-2';archive.windowDays=DAYS;archive.windowStart=dates[0];archive.windowEnd=dates[dates.length-1];archive.fixtureCount=Object.keys(archive.fixtures).length;archive.completedDates=Object.values(archive.dates).filter(x=>x?.complete).length;archive.updatedAt=state.lastRun;await writeJson(ARCHIVE,archive);await writeJson(STATE,state);
  return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-YEAR-BACKFILL-1',windowDays:DAYS,windowStart:archive.windowStart,windowEnd:archive.windowEnd,processedDates:processed,completedDates:archive.completedDates,totalDates:dates.length,newFixtures,totalFixtures:archive.fixtureCount,cursor,complete:state.complete,quota:lastQuota,reserve:MIN_DAILY_RESERVE,errors,policy:{globalByDate:true,exactScoresStored:true,persistentArchive:true,quotaAware:true,noRepeatedFetchForCompletedDates:true}})
}
