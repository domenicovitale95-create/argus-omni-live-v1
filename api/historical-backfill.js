import { readJson, writeJson, storageReady } from './_report-store.js';

const API_BASE='https://v3.football.api-sports.io';
const SOURCE='argus/data/team-history-90d.json';
const ARCHIVE='argus/research/historical-fixtures.json';
const STATE='argus/research/historical-backfill-state.json';
const FINISHED=new Set(['FT','AET','PEN']);
const DEFAULT_DAYS=730;
const DEFAULT_TEAMS_PER_RUN=6;
const MIN_RESERVE=100;

function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function ymd(ms){return new Date(ms).toISOString().slice(0,10)}
function normalizeFixture(f){
  const status=f?.fixture?.status?.short;if(!FINISHED.has(status))return null;
  const h=Number(f?.goals?.home),a=Number(f?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))return null;
  return{fixtureId:Number(f.fixture?.id),timestamp:Number(f.fixture?.timestamp)||Math.floor(new Date(f.fixture?.date||0).getTime()/1000),date:f.fixture?.date||null,leagueId:Number(f.league?.id)||null,competition:f.league?.name||null,country:f.league?.country||null,season:f.league?.season||null,homeId:Number(f.teams?.home?.id)||null,home:f.teams?.home?.name||null,awayId:Number(f.teams?.away?.id)||null,away:f.teams?.away?.name||null,homeGoals:h,awayGoals:a,winner:h>a?'HOME':h<a?'AWAY':'DRAW',status};
}
function quotaFrom(headers){const daily=Number(headers.get('x-ratelimit-requests-remaining'));const minute=Number(headers.get('x-ratelimit-remaining'));return{dailyRemaining:Number.isFinite(daily)?daily:null,minuteRemaining:Number.isFinite(minute)?minute:null}}
async function fetchTeam(teamId,from,to){
  const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');
  const r=await fetch(`${API_BASE}/fixtures?team=${teamId}&from=${from}&to=${to}&timezone=Europe%2FBrussels`,{headers:{'x-apisports-key':key,Accept:'application/json'}});
  const quota=quotaFrom(r.headers);if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return{rows:(j.response||[]).map(normalizeFixture).filter(Boolean),quota};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!authorized(req))return res.status(401).json({error:'Unauthorized'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const days=Math.max(180,Math.min(1460,Number(req.query?.days)||DEFAULT_DAYS));const maxTeams=Math.max(1,Math.min(12,Number(req.query?.teams)||DEFAULT_TEAMS_PER_RUN));
  const source=await readJson(SOURCE,{teams:{}}),archive=await readJson(ARCHIVE,{version:'HISTORICAL-ARCHIVE-1',fixtures:{},teams:{},updatedAt:null}),state=await readJson(STATE,{cursor:0,completedCycles:0,lastRun:null});
  const teamIds=Object.keys(source.teams||{}).map(Number).filter(Boolean).sort((a,b)=>a-b);if(!teamIds.length)return res.status(200).json({ok:true,skipped:true,reason:'NO_TEAM_HISTORY_SOURCE'});
  const now=Date.now(),from=ymd(now-days*86400000),to=ymd(now-86400000);let cursor=Number(state.cursor)||0,processed=0,saved=0,quota=null,errors=[];
  for(let i=0;i<maxTeams&&teamIds.length;i++){
    if(cursor>=teamIds.length){cursor=0;state.completedCycles=(state.completedCycles||0)+1}
    const teamId=teamIds[cursor++];try{const out=await fetchTeam(teamId,from,to);quota=out.quota;archive.teams[String(teamId)]={from,to,fixtures:out.rows.length,savedAt:new Date().toISOString()};for(const row of out.rows){const k=String(row.fixtureId);if(!archive.fixtures[k])saved++;archive.fixtures[k]=row}processed++;if(quota?.dailyRemaining!=null&&quota.dailyRemaining<=MIN_RESERVE)break;if(quota?.minuteRemaining!=null&&quota.minuteRemaining<=3)break}catch(e){errors.push({teamId,error:e.message})}
  }
  archive.updatedAt=new Date().toISOString();archive.windowDays=days;archive.fixtureCount=Object.keys(archive.fixtures||{}).length;state.cursor=cursor;state.lastRun=archive.updatedAt;state.lastQuota=quota;state.lastProcessed=processed;state.lastSaved=saved;await writeJson(ARCHIVE,archive);await writeJson(STATE,state);
  return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-BACKFILL-1',from,to,teamUniverse:teamIds.length,processedTeams:processed,newFixtures:saved,totalFixtures:archive.fixtureCount,cursor,stateCycles:state.completedCycles,quota,reserve:MIN_RESERVE,errors,policy:{quotaAware:true,persistentArchive:true,noRepeatedFetchForStoredFixtures:true,maxWindowDays:1460}})
}
