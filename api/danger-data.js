import { readJson, writeJson, storageReady } from './_report-store.js';

const API_BASE = 'https://v3.football.api-sports.io';
const TZ = 'Europe/Brussels';
const HISTORY_DAYS = 90;
const CACHE_HOURS = 12;
const BATCH_SIZE = 30;
const DAILY_RESERVE = 120;
const FINISHED = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);

function apiHeaders(){
  const key=process.env.API_FOOTBALL_KEY;
  if(!key) throw new Error('API_FOOTBALL_KEY is not configured');
  return {'x-apisports-key':key,Accept:'application/json'};
}
function nHeader(headers,name){const v=Number(headers.get(name));return Number.isFinite(v)?v:null}
let quota={dailyLimit:null,dailyRemaining:null,minuteLimit:null,minuteRemaining:null};
async function apiGet(path){
  const r=await fetch(`${API_BASE}${path}`,{headers:apiHeaders()});
  quota={dailyLimit:nHeader(r.headers,'x-ratelimit-requests-limit'),dailyRemaining:nHeader(r.headers,'x-ratelimit-requests-remaining'),minuteLimit:nHeader(r.headers,'x-ratelimit-limit'),minuteRemaining:nHeader(r.headers,'x-ratelimit-remaining')};
  if(!r.ok) throw new Error(`API-Football HTTP ${r.status}`);
  const j=await r.json();
  if(j?.errors&&Object.keys(j.errors).length) throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);
  return j;
}
function dateInTZ(d){const p=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
function daysAgo(days){return dateInTZ(new Date(Date.now()-days*86400000))}
function summarize(fixtures,teamId){
  const rows=(fixtures||[]).filter(f=>['FT','AET','PEN'].includes(f.fixture?.status?.short)).sort((a,b)=>(a.fixture?.timestamp||0)-(b.fixture?.timestamp||0));
  let wins=0,draws=0,losses=0,gf=0,ga=0,homeGames=0,homePts=0,awayGames=0,awayPts=0;const results=[];
  for(const f of rows){const home=Number(f.teams?.home?.id)===Number(teamId),away=Number(f.teams?.away?.id)===Number(teamId);if(!home&&!away)continue;const scored=Number(home?f.goals?.home:f.goals?.away)||0,conceded=Number(home?f.goals?.away:f.goals?.home)||0;const pts=scored>conceded?3:scored===conceded?1:0;if(pts===3)wins++;else if(pts===1)draws++;else losses++;gf+=scored;ga+=conceded;if(home){homeGames++;homePts+=pts}else{awayGames++;awayPts+=pts}results.push({timestamp:f.fixture?.timestamp||null,gf:scored,ga:conceded,points:pts});}
  const recent=results.slice(-5);const round=v=>Number(v.toFixed(3)),count=results.length;
  return {matches:count,wins,draws,losses,pointsPerGame:count?round((wins*3+draws)/count):0,goalsForPerGame:count?round(gf/count):0,goalsAgainstPerGame:count?round(ga/count):0,homeGames,homePPG:homeGames?round(homePts/homeGames):null,awayGames,awayPPG:awayGames?round(awayPts/awayGames):null,last5PPG:recent.length?round(recent.reduce((s,r)=>s+r.points,0)/recent.length):0,windowDays:HISTORY_DAYS};
}
async function getHistory(teamId,from,to){const p=await apiGet(`/fixtures?team=${teamId}&from=${from}&to=${to}&status=FT-AET-PEN`);return summarize(p.response||[],teamId)}
function normalizeFixture(f,cache){const hId=Number(f.teams?.home?.id),aId=Number(f.teams?.away?.id);return {id:f.fixture?.id,competition:f.league?.name,country:f.league?.country,status:f.fixture?.status?.short||'NS',minute:f.fixture?.status?.elapsed||0,kickoff:f.fixture?.date||null,isLive:['1H','HT','2H','ET','BT','P','INT','LIVE'].includes(f.fixture?.status?.short),isFinished:FINISHED.has(f.fixture?.status?.short),homeTeamId:hId,awayTeamId:aId,home:f.teams?.home?.name||'Home',away:f.teams?.away?.name||'Away',score:{home:f.goals?.home??0,away:f.goals?.away??0},history90d:{home:cache[String(hId)]?.data||null,away:cache[String(aId)]?.data||null}}}

export default async function handler(req,res){
  try{
    const date=String(req.query?.date||dateInTZ(new Date()));const from=daysAgo(HISTORY_DAYS),to=date;
    const fixturesPayload=await apiGet(`/fixtures?date=${date}`);const fixtures=fixturesPayload.response||[];
    const active=fixtures.filter(f=>!FINISHED.has(f.fixture?.status?.short));const teamIds=[];const seen=new Set();
    for(const f of active)for(const id of [f.teams?.home?.id,f.teams?.away?.id]){const n=Number(id);if(n&&!seen.has(n)){seen.add(n);teamIds.push(n)}}
    const cachePath=`danger/history-${date}.json`;let cache=storageReady()?await readJson(cachePath,{}):{};if(!cache||typeof cache!=='object')cache={};
    const cutoff=Date.now()-CACHE_HOURS*3600000;const missing=teamIds.filter(id=>!cache[String(id)]||new Date(cache[String(id)].savedAt||0).getTime()<cutoff);
    let candidates=missing.slice(0,BATCH_SIZE);
    if(quota.dailyRemaining!=null){const safe=Math.max(0,quota.dailyRemaining-DAILY_RESERVE);candidates=candidates.slice(0,safe)}
    if(quota.minuteRemaining!=null)candidates=candidates.slice(0,Math.max(0,quota.minuteRemaining-5));
    const settled=await Promise.allSettled(candidates.map(async id=>({id,data:await getHistory(id,from,to)})));
    let loaded=0;for(const r of settled){if(r.status==='fulfilled'){cache[String(r.value.id)]={savedAt:new Date().toISOString(),data:r.value.data};loaded++;}}
    if(storageReady()&&loaded)await writeJson(cachePath,cache);
    const normalized=active.map(f=>normalizeFixture(f,cache));const usable=normalized.filter(m=>m.history90d.home?.matches>=3&&m.history90d.away?.matches>=3).length;
    const stillMissing=teamIds.filter(id=>!cache[String(id)]||!cache[String(id)].data||cache[String(id)].data.matches<3).length;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({date,matches:normalized,meta:{fetchedAt:new Date().toISOString(),activeMatches:active.length,totalTeams:teamIds.length,loadedThisCall:loaded,teamsWithCache:teamIds.length-missing.length+loaded,teamsStillMissing:stillMissing,usableMatches:usable,hasMore:missing.length>candidates.length,storage:storageReady()?'blob':'memory-only',quota}});
  }catch(error){console.error('DANGER data loader:',error);return res.status(500).json({error:error.message||'DANGER data loader failed',quota});}
}
