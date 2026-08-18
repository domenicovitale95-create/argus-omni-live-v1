import { readJson, writeJson, storageReady } from './_report-store.js';

const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL_MS = 60_000;
const HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PREDICTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ODDS_CACHE_TTL_MS = 10 * 60 * 1000;
const INJURY_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const DISPLAY_TIMEZONE = 'Europe/Brussels';
const HISTORY_DAYS = 90;
const REQUEST_DEADLINE_MS = 22_000;
const CONCURRENCY = 6;
const MIN_DAILY_RESERVE = 80;
const MAX_DAILY_RESERVE = 250;
const MIN_MINUTE_RESERVE = 4;
const DETAIL_WINDOW_MS = 100 * 60 * 1000;
const LIVE_STATUSES = new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
const FINISHED_STATUSES = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);

let cache = { at: 0, payload: null };
let apiQuota = { dailyLimit:null, dailyRemaining:null, minuteLimit:null, minuteRemaining:null, observedAt:null };

function apiHeaders(){
  const key=process.env.API_FOOTBALL_KEY;
  if(!key) throw new Error('API_FOOTBALL_KEY is not configured');
  return {'x-apisports-key':key,Accept:'application/json'};
}
function numericHeader(headers,name){const raw=headers.get(name);if(raw==null||raw==='')return null;const v=Number(raw);return Number.isFinite(v)?v:null}
function captureQuota(headers){
  const dailyLimit=numericHeader(headers,'x-ratelimit-requests-limit');
  const dailyRemaining=numericHeader(headers,'x-ratelimit-requests-remaining');
  const minuteLimit=numericHeader(headers,'x-ratelimit-limit');
  const minuteRemaining=numericHeader(headers,'x-ratelimit-remaining');
  if(dailyLimit!==null)apiQuota.dailyLimit=dailyLimit;
  if(dailyRemaining!==null)apiQuota.dailyRemaining=dailyRemaining;
  if(minuteLimit!==null)apiQuota.minuteLimit=minuteLimit;
  if(minuteRemaining!==null)apiQuota.minuteRemaining=minuteRemaining;
  apiQuota.observedAt=new Date().toISOString();
}
function dynamicDailyReserve(){
  if(!apiQuota.dailyLimit) return MIN_DAILY_RESERVE;
  return Math.max(MIN_DAILY_RESERVE,Math.min(MAX_DAILY_RESERVE,Math.ceil(apiQuota.dailyLimit*0.02)));
}
function canSpend(){
  if(apiQuota.dailyRemaining!=null&&apiQuota.dailyRemaining<=dynamicDailyReserve()) return false;
  if(apiQuota.minuteRemaining!=null&&apiQuota.minuteRemaining<=MIN_MINUTE_RESERVE) return false;
  return true;
}
async function apiGet(path){
  const response=await fetch(`${API_BASE}${path}`,{headers:apiHeaders()});
  captureQuota(response.headers);
  if(!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  const data=await response.json();
  if(data?.errors&&Object.keys(data.errors).length) throw new Error(`API-Football: ${JSON.stringify(data.errors)}`);
  return data;
}
function quotaMeta(){return {...apiQuota,dynamicReserve:dynamicDailyReserve()}}
function dateInTimezone(date,timeZone=DISPLAY_TIMEZONE){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`}
function todayInTimezone(){return dateInTimezone(new Date())}
function daysAgoInTimezone(days){return dateInTimezone(new Date(Date.now()-days*86400000))}
function isLiveFixture(f){return LIVE_STATUSES.has(f.fixture?.status?.short)}
function isFinishedFixture(f){return FINISHED_STATUSES.has(f.fixture?.status?.short)}
function kickoffMs(f){const ts=Number(f.fixture?.timestamp);if(Number.isFinite(ts)&&ts>0)return ts*1000;const parsed=new Date(f.fixture?.date||0).getTime();return Number.isFinite(parsed)?parsed:0}
function isImminentFixture(f){if(isLiveFixture(f)||isFinishedFixture(f))return isLiveFixture(f);const k=kickoffMs(f);return k>0&&k-Date.now()<=DETAIL_WINDOW_MS&&k-Date.now()>=-30*60*1000}
function statValue(stats=[],name){const item=stats.find(e=>String(e.type).toLowerCase()===name.toLowerCase());if(!item||item.value==null)return null;if(typeof item.value==='string'&&item.value.endsWith('%'))return Number(item.value.replace('%',''));const n=Number(item.value);return Number.isFinite(n)?n:null}
function extractStats(fixture){const blocks=fixture.statistics||[],home=blocks[0]?.statistics||[],away=blocks[1]?.statistics||[];return {shotsHome:statValue(home,'Total Shots'),shotsAway:statValue(away,'Total Shots'),shotsOnTargetHome:statValue(home,'Shots on Goal'),shotsOnTargetAway:statValue(away,'Shots on Goal'),cornersHome:statValue(home,'Corner Kicks'),cornersAway:statValue(away,'Corner Kicks'),possessionHome:statValue(home,'Ball Possession'),possessionAway:statValue(away,'Ball Possession'),dangerousAttacksHome:null,dangerousAttacksAway:null}}
function normalizeLabel(v){return String(v||'').trim().toLowerCase()}
function extract1x2(oddsPayload,fixtureId){
  const match=(oddsPayload?.response||[]).find(item=>Number(item.fixture?.id)===Number(fixtureId));if(!match)return {};
  const candidates=[];for(const bookmaker of match.bookmakers||match.odds||[]){for(const bet of bookmaker.bets||[]){const name=normalizeLabel(bet.name);if(!(name.includes('match winner')||name==='1x2'||name.includes('winner')))continue;const out={};for(const value of bet.values||[]){const label=normalizeLabel(value.value),odd=Number(value.odd);if(!Number.isFinite(odd)||odd<=1)continue;if(['home','1'].includes(label))out.home=odd;else if(['draw','x'].includes(label))out.draw=odd;else if(['away','2'].includes(label))out.away=odd}if(out.home&&out.draw&&out.away)candidates.push(out)}}
  if(!candidates.length)return {};const median=values=>{const s=values.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};return {home:median(candidates.map(x=>x.home)),draw:median(candidates.map(x=>x.draw)),away:median(candidates.map(x=>x.away))};
}
function parsePercent(value){if(value==null)return null;const n=Number(String(value).replace('%','').trim());return Number.isFinite(n)?n/100:null}
function extractPrediction(payload){const row=payload?.response?.[0],percent=row?.predictions?.percent||{},home=parsePercent(percent.home),draw=parsePercent(percent.draw),away=parsePercent(percent.away);if(![home,draw,away].every(v=>Number.isFinite(v)&&v>0))return null;return {home,draw,away,advice:row?.predictions?.advice||null,winner:row?.predictions?.winner?.name||null,source:'API-FOOTBALL-PREDICTIONS'}}
function summarizeTeamHistory(fixtures,teamId){
  const rows=(fixtures||[]).filter(f=>['FT','AET','PEN'].includes(f.fixture?.status?.short)).sort((a,b)=>(a.fixture?.timestamp||0)-(b.fixture?.timestamp||0));
  let wins=0,draws=0,losses=0,gf=0,ga=0,cleanSheets=0,failedToScore=0,btts=0,over25=0,homeGames=0,homePoints=0,awayGames=0,awayPoints=0;const results=[];
  for(const f of rows){const isHome=Number(f.teams?.home?.id)===Number(teamId),isAway=Number(f.teams?.away?.id)===Number(teamId);if(!isHome&&!isAway)continue;const scored=Number(isHome?f.goals?.home:f.goals?.away)||0,conceded=Number(isHome?f.goals?.away:f.goals?.home)||0,points=scored>conceded?3:scored===conceded?1:0;if(points===3)wins++;else if(points===1)draws++;else losses++;gf+=scored;ga+=conceded;if(conceded===0)cleanSheets++;if(scored===0)failedToScore++;if(scored>0&&conceded>0)btts++;if(scored+conceded>2)over25++;if(isHome){homeGames++;homePoints+=points}else{awayGames++;awayPoints+=points}results.push({fixtureId:f.fixture?.id,timestamp:f.fixture?.timestamp||null,competition:f.league?.name||null,venue:isHome?'H':'A',opponent:isHome?f.teams?.away?.name:f.teams?.home?.name,gf:scored,ga:conceded,points})}
  const n=results.length,recent=results.slice(-5),recentPoints=recent.reduce((s,r)=>s+r.points,0),round=v=>Number(v.toFixed(3));return {matches:n,wins,draws,losses,pointsPerGame:n?round((wins*3+draws)/n):0,goalsForPerGame:n?round(gf/n):0,goalsAgainstPerGame:n?round(ga/n):0,winRate:n?round(wins/n):0,cleanSheetRate:n?round(cleanSheets/n):0,failedToScoreRate:n?round(failedToScore/n):0,bttsRate:n?round(btts/n):0,over25Rate:n?round(over25/n):0,homeGames,homePPG:homeGames?round(homePoints/homeGames):null,awayGames,awayPPG:awayGames?round(awayPoints/awayGames):null,last5PPG:recent.length?round(recentPoints/recent.length):0,recentResults:recent.map(r=>r.points===3?'W':r.points===1?'D':'L').join(''),windowDays:HISTORY_DAYS,from:daysAgoInTimezone(HISTORY_DAYS),to:todayInTimezone(),allMatches:results};
}
async function mapConcurrent(items,worker,deadline){
  const results=new Array(items.length);let cursor=0;
  async function run(){while(cursor<items.length&&Date.now()<deadline&&canSpend()){const i=cursor++;try{results[i]=await worker(items[i],i)}catch(_){results[i]=null}}}
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,items.length)},run));return results;
}
async function loadAggregate(path,fallback){if(!storageReady())return fallback;try{return await readJson(path,fallback)}catch(_){return fallback}}
async function saveAggregate(path,value){if(!storageReady())return;try{await writeJson(path,value)}catch(_){} }

async function fetchHistories(fixtures,deadline){
  const from=daysAgoInTimezone(HISTORY_DAYS),to=todayInTimezone(),teamIds=[],seen=new Set();
  for(const f of fixtures){if(isFinishedFixture(f))continue;for(const id of [f.teams?.home?.id,f.teams?.away?.id]){const n=Number(id);if(n&&!seen.has(n)){seen.add(n);teamIds.push(n)}}}
  const path='argus/data/team-history-90d.json';const store=await loadAggregate(path,{teams:{}});store.teams||={};const cutoff=Date.now()-HISTORY_CACHE_TTL_MS;
  const histories=new Map(),missing=[];for(const id of teamIds){const row=store.teams[String(id)];if(row?.data&&new Date(row.savedAt||0).getTime()>=cutoff)histories.set(id,row.data);else missing.push(id)}
  const fetched=await mapConcurrent(missing,async id=>{const payload=await apiGet(`/fixtures?team=${id}&from=${from}&to=${to}&status=FT-AET-PEN`);return {id,data:summarizeTeamHistory(payload.response||[],id)}},deadline);
  let loaded=0;for(const row of fetched){if(!row)continue;histories.set(row.id,row.data);store.teams[String(row.id)]={savedAt:new Date().toISOString(),data:row.data};loaded++}if(loaded)await saveAggregate(path,store);
  return {histories,totalTeams:teamIds.length,loadedThisScan:loaded,missingAfter:teamIds.length-histories.size,from,to};
}

function chunk(items,size){const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out}
async function enrichPriorityFixtures(fixtures,deadline){
  const targets=fixtures.filter(isImminentFixture),detailsById=new Map();
  const idGroups=chunk(targets.map(f=>Number(f.fixture?.id)).filter(Boolean),20);
  for(const ids of idGroups){if(Date.now()>=deadline||!canSpend())break;try{const detail=await apiGet(`/fixtures?ids=${ids.join('-')}&timezone=${encodeURIComponent(DISPLAY_TIMEZONE)}`);for(const row of detail.response||[])if(row?.fixture?.id)detailsById.set(Number(row.fixture.id),row)}catch(_){}
  return {fixtures:fixtures.map(f=>detailsById.get(Number(f.fixture?.id))||f),requested:targets.length,loaded:detailsById.size,calls:idGroups.length};
}

async function fetchInjuriesByDate(date,deadline){
  const cachePath=`argus/data/injuries-${date}.json`;const cached=await loadAggregate(cachePath,null);
  if(cached?.savedAt&&Date.now()-new Date(cached.savedAt).getTime()<INJURY_CACHE_TTL_MS&&Array.isArray(cached.response))return {response:cached.response,cache:'HIT',loadedThisScan:0};
  if(Date.now()>=deadline||!canSpend())return {response:cached?.response||[],cache:cached?.response?'STALE':'MISS',loadedThisScan:0};
  try{const payload=await apiGet(`/injuries?date=${date}&timezone=${encodeURIComponent(DISPLAY_TIMEZONE)}`);const response=payload.response||[];await saveAggregate(cachePath,{savedAt:new Date().toISOString(),response});return {response,cache:'MISS',loadedThisScan:1}}catch(_){return {response:cached?.response||[],cache:cached?.response?'STALE':'ERROR',loadedThisScan:0}}
}
function injuryIndex(rows=[]){const map=new Map();for(const row of rows){const fixtureId=Number(row.fixture?.id),teamId=Number(row.team?.id);if(!fixtureId||!teamId)continue;const key=`${fixtureId}:${teamId}`;if(!map.has(key))map.set(key,[]);map.get(key).push({playerId:row.player?.id||null,name:row.player?.name||null,type:row.player?.type||null,reason:row.player?.reason||null})}return map}
function lineupForTeam(fixture,teamId){const lineups=Array.isArray(fixture.lineups)?fixture.lineups:[];const row=lineups.find(x=>Number(x.team?.id)===Number(teamId));if(!row)return null;const starters=(row.startXI||[]).map(x=>({id:x.player?.id||null,name:x.player?.name||null,number:x.player?.number||null,pos:x.player?.pos||null,grid:x.player?.grid||null}));const bench=(row.substitutes||[]).map(x=>({id:x.player?.id||null,name:x.player?.name||null,number:x.player?.number||null,pos:x.player?.pos||null}));return {confirmed:starters.length>=11,formation:row.formation||null,coach:row.coach?.name||null,starters,bench}}
function availabilityForFixture(fixture,index){const id=Number(fixture.fixture?.id),homeId=Number(fixture.teams?.home?.id),awayId=Number(fixture.teams?.away?.id),homeLineup=lineupForTeam(fixture,homeId),awayLineup=lineupForTeam(fixture,awayId),homeAbs=index.get(`${id}:${homeId}`)||[],awayAbs=index.get(`${id}:${awayId}`)||[],confirmed=Boolean(homeLineup?.confirmed&&awayLineup?.confirmed);return {lineupsConfirmed:confirmed,lineupStatus:confirmed?'CONFIRMED':(isImminentFixture(fixture)?'PENDING_OR_UNAVAILABLE':'NOT_DUE'),home:{formation:homeLineup?.formation||null,coach:homeLineup?.coach||null,starters:homeLineup?.starters||[],bench:homeLineup?.bench||[],absences:homeAbs,absenceCount:homeAbs.length},away:{formation:awayLineup?.formation||null,coach:awayLineup?.coach||null,starters:awayLineup?.starters||[],bench:awayLineup?.bench||[],absences:awayAbs,absenceCount:awayAbs.length},policy:'Availability data is contextual only until player-importance calibration is validated.'}}

async function fetchPrematchOddsByDate(date,deadline){
  const cachePath=`argus/data/odds-${date}.json`;const cached=await loadAggregate(cachePath,null);if(cached?.savedAt&&Date.now()-new Date(cached.savedAt).getTime()<ODDS_CACHE_TTL_MS&&cached.payload)return cached.payload;
  const combined={response:[]};try{const first=await apiGet(`/odds?date=${date}&page=1`);combined.response.push(...(first.response||[]));const totalPages=Number(first.paging?.total||1);for(let page=2;page<=totalPages&&Date.now()<deadline&&canSpend();page++){const next=await apiGet(`/odds?date=${date}&page=${page}`);combined.response.push(...(next.response||[]))}await saveAggregate(cachePath,{savedAt:new Date().toISOString(),payload:combined})}catch(_){}return combined;
}

async function fetchPrematchPredictions(fixtures,date,deadline){
  const candidates=fixtures.filter(f=>!isLiveFixture(f)&&!isFinishedFixture(f));const cachePath=`argus/data/predictions-${date}.json`;const store=await loadAggregate(cachePath,{fixtures:{}});store.fixtures||={};const cutoff=Date.now()-PREDICTION_CACHE_TTL_MS;const predictions=new Map(),missing=[];
  for(const f of candidates){const id=Number(f.fixture?.id);if(!id)continue;const row=store.fixtures[String(id)];if(row?.data&&new Date(row.savedAt||0).getTime()>=cutoff)predictions.set(id,row.data);else missing.push(f)}
  const rows=await mapConcurrent(missing,async fixture=>{const id=Number(fixture.fixture?.id);const prediction=extractPrediction(await apiGet(`/predictions?fixture=${id}`));return prediction?{id,data:prediction}:null},deadline);
  let loaded=0;for(const row of rows){if(!row)continue;predictions.set(row.id,row.data);store.fixtures[String(row.id)]={savedAt:new Date().toISOString(),data:row.data};loaded++}if(loaded)await saveAggregate(cachePath,store);return {predictions,total:candidates.length,loadedThisScan:loaded,missingAfter:Math.max(0,candidates.length-predictions.size)};
}

function normalizeFixture(fixture,liveOdds,prematchOdds,predictions,histories,injuries){const live=isLiveFixture(fixture),finished=isFinishedFixture(fixture),id=fixture.fixture?.id,homeTeamId=fixture.teams?.home?.id||null,awayTeamId=fixture.teams?.away?.id||null;return {id,competition:fixture.league?.name,country:fixture.league?.country,status:fixture.fixture?.status?.short||'NS',statusLong:fixture.fixture?.status?.long||'',minute:fixture.fixture?.status?.elapsed||0,kickoff:fixture.fixture?.date||null,timestamp:fixture.fixture?.timestamp||null,isLive:live,isFinished:finished,homeTeamId,awayTeamId,home:fixture.teams?.home?.name||'Home',away:fixture.teams?.away?.name||'Away',score:{home:fixture.goals?.home??0,away:fixture.goals?.away??0},stats:extractStats(fixture),markets:live?extract1x2(liveOdds,id):extract1x2(prematchOdds,id),preMatchModel:finished?null:(predictions.get(Number(id))||null),history90d:{home:histories.get(Number(homeTeamId))||null,away:histories.get(Number(awayTeamId))||null},availability:availabilityForFixture(fixture,injuries),source:'API-FOOTBALL',observedAt:new Date().toISOString()}}

async function buildPayload(){
  const started=Date.now(),deadline=started+REQUEST_DEADLINE_MS,date=todayInTimezone();const day=await apiGet(`/fixtures?date=${date}&timezone=${encodeURIComponent(DISPLAY_TIMEZONE)}`),fixtures=day.response||[];
  if(!fixtures.length)return {matches:[],meta:{provider:'API-FOOTBALL',mode:'PRO-DYNAMIC',date,timezone:DISPLAY_TIMEZONE,fetchedAt:new Date().toISOString(),fixtureCount:0,quota:quotaMeta()}};
  const detailResult=await enrichPriorityFixtures(fixtures,deadline),enriched=detailResult.fixtures;let liveOdds={response:[]};if(enriched.some(isLiveFixture)&&Date.now()<deadline&&canSpend()){try{liveOdds=await apiGet('/odds/live')}catch(_){}}
  const prematchOdds=Date.now()<deadline&&canSpend()?await fetchPrematchOddsByDate(date,deadline):{response:[]};
  const injuryResult=Date.now()<deadline?await fetchInjuriesByDate(date,deadline):{response:[],cache:'SKIPPED',loadedThisScan:0},injuries=injuryIndex(injuryResult.response);
  const historyResult=Date.now()<deadline?await fetchHistories(enriched,deadline):{histories:new Map(),totalTeams:0,loadedThisScan:0,missingAfter:0,from:daysAgoInTimezone(HISTORY_DAYS),to:date};
  const predictionResult=Date.now()<deadline?await fetchPrematchPredictions(enriched,date,deadline):{predictions:new Map(),total:0,loadedThisScan:0,missingAfter:0};
  const matches=enriched.map(f=>normalizeFixture(f,liveOdds,prematchOdds,predictionResult.predictions,historyResult.histories,injuries)).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
  const historyCompleteMatches=matches.filter(m=>m.history90d?.home&&m.history90d?.away).length,lineupsConfirmed=matches.filter(m=>m.availability?.lineupsConfirmed).length,matchesWithAbsences=matches.filter(m=>(m.availability?.home?.absenceCount||0)+(m.availability?.away?.absenceCount||0)>0).length;
  return {matches,meta:{provider:'API-FOOTBALL',mode:'PRO-DYNAMIC',date,timezone:DISPLAY_TIMEZONE,fetchedAt:new Date().toISOString(),fixtureCount:matches.length,liveFixtureCount:matches.filter(m=>m.isLive).length,prematchAnalyzedCount:matches.filter(m=>m.preMatchModel).length,prematchTotal:predictionResult.total,prematchLoadedThisScan:predictionResult.loadedThisScan,prematchMissing:predictionResult.missingAfter,historyWindowDays:HISTORY_DAYS,historyFrom:historyResult.from,historyTo:historyResult.to,historyTeamsCovered:historyResult.histories.size,historyTeamsTotal:historyResult.totalTeams,historyLoadedThisScan:historyResult.loadedThisScan,historyTeamsMissing:historyResult.missingAfter,historyCompleteMatches,detailFixturesRequested:detailResult.requested,detailFixturesLoaded:detailResult.loaded,detailBatchCalls:detailResult.calls,lineupsConfirmed,matchesWithAbsences,injuryCache:injuryResult.cache,injuryRows:injuryResult.response.length,storage:storageReady()?'BLOB':'MEMORY',requestBudgetMs:REQUEST_DEADLINE_MS,elapsedMs:Date.now()-started,cacheSeconds:CACHE_TTL_MS/1000,quota:quotaMeta()}};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=45, stale-while-revalidate=15');res.setHeader('Access-Control-Allow-Origin','*');if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{if(cache.payload&&Date.now()-cache.at<CACHE_TTL_MS)return res.status(200).json({...cache.payload,meta:{...cache.payload.meta,quota:quotaMeta(),cache:'HIT'}});const payload=await buildPayload();cache={at:Date.now(),payload};return res.status(200).json({...payload,meta:{...payload.meta,quota:quotaMeta(),cache:'MISS'}})}catch(error){return res.status(503).json({error:error.message,matches:[],meta:{provider:'API-FOOTBALL',mode:'PRO-DYNAMIC',timezone:DISPLAY_TIMEZONE,fetchedAt:new Date().toISOString(),quota:quotaMeta()}})}
}