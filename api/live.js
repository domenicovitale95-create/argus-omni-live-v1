import { readJson, writeJson, storageReady } from './_report-store.js';
import { providerPlanMeta } from './_provider-plan.js';

const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL_MS = 4 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PREDICTION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ODDS_CACHE_TTL_MS = 15 * 60 * 1000;
const DISPLAY_TIMEZONE = 'Europe/Brussels';
const HISTORY_DAYS = 90;
const REQUEST_DEADLINE_MS = 25_000;
const CONCURRENCY = 4;
const MIN_DAILY_RESERVE = 1500;
const MAX_DAILY_RESERVE = 1800;
const LIVE_DAILY_RESERVE = 300;
const MIN_MINUTE_RESERVE = 5;
const MINUTE_COOLDOWN_MS = 65_000;
const SECONDARY_CALL_BUDGET_PER_BUILD = 8;
const QUOTA_GUARD_PATH = 'argus/data/api-football-quota-guard.json';
const LIVE_STATUSES = new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
const FINISHED_STATUSES = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);

let cache = { at: 0, payload: null };
let buildExternalCalls = 0;
let minuteBlockedUntil = 0;
let apiQuota = { dailyLimit:7500, dailyRemaining:null, minuteLimit:null, minuteRemaining:null, observedAt:null, exhausted:false, providerError:null };

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
  if(minuteRemaining!==null&&minuteRemaining>MIN_MINUTE_RESERVE)minuteBlockedUntil=0;
  apiQuota.observedAt=new Date().toISOString();
}
function dynamicDailyReserve(){
  const limit=Number(apiQuota.dailyLimit)||Number(providerPlanMeta().dailyLimit)||7500;
  return Math.max(MIN_DAILY_RESERVE,Math.min(MAX_DAILY_RESERVE,Math.ceil(limit*0.2)));
}
function quotaErrorKind(data){
  const text=JSON.stringify(data?.errors||data||{}).toLowerCase();
  if(text.includes('per minute')||text.includes('requests per minute'))return 'minute';
  if(text.includes('daily')||text.includes('per day')||text.includes('request limit')||text.includes('rate limit')||text.includes('too many requests'))return 'daily';
  return null;
}
function providerDayUtc(date=new Date()){return date.toISOString().slice(0,10)}
function quotaGuardDay(state){if(!state)return null;const recorded=state.providerDayUtc||null;const observed=state.observedAt?String(state.observedAt).slice(0,10):null;return recorded||observed||state.date||null}
async function persistQuotaExhausted(data){
  apiQuota.dailyLimit=Number(apiQuota.dailyLimit)||7500;apiQuota.dailyRemaining=0;apiQuota.exhausted=true;apiQuota.providerError=JSON.stringify(data?.errors||data||{});apiQuota.observedAt=new Date().toISOString();
  const day=providerDayUtc();
  if(storageReady())try{await writeJson(QUOTA_GUARD_PATH,{date:day,providerDayUtc:day,exhausted:true,dailyLimit:apiQuota.dailyLimit,dailyRemaining:0,providerError:apiQuota.providerError,observedAt:apiQuota.observedAt})}catch(_){}
}
async function clearFalseDailyGuard(state,currentDay){
  apiQuota.exhausted=false;apiQuota.providerError=null;apiQuota.dailyRemaining=null;
  if(storageReady())try{await writeJson(QUOTA_GUARD_PATH,{date:currentDay,providerDayUtc:currentDay,exhausted:false,dailyLimit:Number(state?.dailyLimit)||apiQuota.dailyLimit,dailyRemaining:null,providerError:null,observedAt:new Date().toISOString(),repair:'MINUTE_LIMIT_WAS_NOT_DAILY_EXHAUSTION'})}catch(_){}
}
async function loadQuotaGuard(){
  if(!storageReady())return;
  try{
    const state=await readJson(QUOTA_GUARD_PATH,null),currentDay=providerDayUtc(),guardDay=quotaGuardDay(state),providerError=String(state?.providerError||'').toLowerCase();
    if(state?.exhausted&&guardDay===currentDay&&(providerError.includes('per minute')||providerError.includes('requests per minute'))){await clearFalseDailyGuard(state,currentDay);return;}
    if(state?.exhausted&&guardDay===currentDay){apiQuota={...apiQuota,dailyLimit:Number(state.dailyLimit)||7500,dailyRemaining:0,exhausted:true,providerError:state.providerError||'DAILY_QUOTA_EXHAUSTED',observedAt:state.observedAt||new Date().toISOString()}}
    else if(state?.exhausted&&guardDay&&guardDay!==currentDay){apiQuota.exhausted=false;apiQuota.providerError=null;apiQuota.dailyRemaining=null}
  }catch(_){}
}
function canSpend(priority='secondary'){
  if(apiQuota.exhausted) return false;
  if(minuteBlockedUntil&&Date.now()<minuteBlockedUntil)return false;
  if(minuteBlockedUntil&&Date.now()>=minuteBlockedUntil){minuteBlockedUntil=0;apiQuota.minuteRemaining=null;}
  if(apiQuota.minuteRemaining!=null&&apiQuota.minuteRemaining<=MIN_MINUTE_RESERVE) return false;
  const reserve=priority==='live'?LIVE_DAILY_RESERVE:dynamicDailyReserve();
  if(apiQuota.dailyRemaining!=null&&apiQuota.dailyRemaining<=reserve) return false;
  if(priority==='secondary'&&buildExternalCalls>=SECONDARY_CALL_BUDGET_PER_BUILD) return false;
  return true;
}
async function apiGet(path,{priority='secondary'}={}){
  if(!canSpend(priority)) throw new Error(apiQuota.exhausted?'API-Football daily quota exhausted; provider calls paused':minuteBlockedUntil>Date.now()?'API-Football minute cooldown active':'API-Football quota governor blocked non-critical call');
  buildExternalCalls++;
  const response=await fetch(`${API_BASE}${path}`,{headers:apiHeaders()});
  captureQuota(response.headers);
  const data=await response.json().catch(()=>({}));
  const quotaKind=quotaErrorKind(data);
  if(quotaKind==='minute'){
    minuteBlockedUntil=Date.now()+MINUTE_COOLDOWN_MS;
    apiQuota.providerError=JSON.stringify(data?.errors||data||{});apiQuota.observedAt=new Date().toISOString();apiQuota.exhausted=false;
    throw new Error(`API-Football minute rate limit; cooldown active: ${JSON.stringify(data.errors||{})}`);
  }
  if(quotaKind==='daily'){await persistQuotaExhausted(data);throw new Error(`API-Football: ${JSON.stringify(data.errors||{})}`)}
  if(!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  return data;
}
function quotaMeta(){return {...apiQuota,providerDayUtc:providerDayUtc(),plan:providerPlanMeta(),dynamicReserve:dynamicDailyReserve(),liveReserve:LIVE_DAILY_RESERVE,minuteCooldownUntil:minuteBlockedUntil?new Date(minuteBlockedUntil).toISOString():null,secondaryCallBudgetPerBuild:SECONDARY_CALL_BUDGET_PER_BUILD,buildExternalCalls}}
function dateInTimezone(date,timeZone=DISPLAY_TIMEZONE){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`}
function todayInTimezone(){return dateInTimezone(new Date())}
function daysAgoInTimezone(days){return dateInTimezone(new Date(Date.now()-days*86400000))}
function isLiveFixture(f){return LIVE_STATUSES.has(f.fixture?.status?.short)}
function isFinishedFixture(f){return FINISHED_STATUSES.has(f.fixture?.status?.short)}
function statValue(stats=[],name){const item=stats.find(e=>String(e.type).toLowerCase()===name.toLowerCase());if(!item||item.value==null)return null;if(typeof item.value==='string'&&item.value.endsWith('%'))return Number(item.value.replace('%',''));const n=Number(item.value);return Number.isFinite(n)?n:null}
function extractStats(fixture){const blocks=fixture.statistics||[],home=blocks[0]?.statistics||[],away=blocks[1]?.statistics||[];return {shotsHome:statValue(home,'Total Shots'),shotsAway:statValue(away,'Total Shots'),shotsOnTargetHome:statValue(home,'Shots on Goal'),shotsOnTargetAway:statValue(away,'Shots on Goal'),cornersHome:statValue(home,'Corner Kicks'),cornersAway:statValue(away,'Corner Kicks'),possessionHome:statValue(home,'Ball Possession'),possessionAway:statValue(away,'Ball Possession'),dangerousAttacksHome:null,dangerousAttacksAway:null}}
function normalizeLabel(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function median(values){const s=values.filter(v=>Number.isFinite(v)&&v>1).sort((a,b)=>a-b);if(!s.length)return null;const mid=Math.floor(s.length/2);return s.length%2?s[mid]:(s[mid-1]+s[mid])/2}
function oddsMatch(payload,fixtureId){return (payload?.response||[]).find(item=>Number(item.fixture?.id)===Number(fixtureId))||null}
function allBets(match){const rows=[];if(!match)return rows;const books=match.bookmakers||match.odds||[];for(const bookmaker of books){if(Array.isArray(bookmaker?.bets)){for(const bet of bookmaker.bets)rows.push({bookmaker:bookmaker.name||null,bet});}else if(bookmaker?.name&&Array.isArray(bookmaker?.values)) rows.push({bookmaker:null,bet:bookmaker});}return rows;}
function collectOdds(match,predicate){const values=[];for(const {bet} of allBets(match)){const betName=normalizeLabel(bet?.name);for(const value of bet?.values||[]){const label=normalizeLabel(value?.value),odd=Number(value?.odd);if(Number.isFinite(odd)&&odd>1&&predicate(betName,label,value)) values.push(odd);}}return median(values);}
function extract1x2(oddsPayload,fixtureId){const match=oddsMatch(oddsPayload,fixtureId);if(!match)return {};const out={};out.home=collectOdds(match,(bet,label)=>/(match winner|1x2|winner)/.test(bet)&&['home','1'].includes(label));out.draw=collectOdds(match,(bet,label)=>/(match winner|1x2|winner)/.test(bet)&&['draw','x'].includes(label));out.away=collectOdds(match,(bet,label)=>/(match winner|1x2|winner)/.test(bet)&&['away','2'].includes(label));return out.home&&out.draw&&out.away?out:{};}
function valueHasLine(label,side,line){const s=normalizeLabel(label);const sideOk=side==='over'?/\bover\b/.test(s):/\bunder\b/.test(s);if(!sideOk)return false;const target=Number(line);if(!Number.isFinite(target))return false;const nums=(s.match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>Number(x.replace(',','.'))).filter(Number.isFinite);return nums.some(x=>Math.abs(x-target)<1e-9);}
function extractMultiMarkets(oddsPayload,fixtureId){const match=oddsMatch(oddsPayload,fixtureId);if(!match)return {};const result={exactScores:{}};const set=(key,val)=>{if(val)result[key]=val};const total=(side,line)=>collectOdds(match,(bet,label)=>/(goals over\/under|over\/under|total goals|goals)/.test(bet)&&!/(corner|team|home|away)/.test(bet)&&valueHasLine(label,side,line));set('over15',total('over',1.5));set('under15',total('under',1.5));set('over25',total('over',2.5));set('under25',total('under',2.5));set('over35',total('over',3.5));set('under35',total('under',3.5));set('bttsYes',collectOdds(match,(bet,label)=>/(both teams.*score|btts)/.test(bet)&&['yes','y'].includes(label)));set('bttsNo',collectOdds(match,(bet,label)=>/(both teams.*score|btts)/.test(bet)&&['no','n'].includes(label)));set('doubleChance1X',collectOdds(match,(bet,label)=>/double chance/.test(bet)&&['home/draw','1x','home or draw'].includes(label)));set('doubleChance12',collectOdds(match,(bet,label)=>/double chance/.test(bet)&&['home/away','12','home or away'].includes(label)));set('doubleChanceX2',collectOdds(match,(bet,label)=>/double chance/.test(bet)&&['draw/away','x2','draw or away'].includes(label)));const teamTotal=(team,side,line)=>collectOdds(match,(bet,label)=>{const teamOk=team==='home'?/(home team|home).*total.*goals|team total.*home/.test(bet):/(away team|away).*total.*goals|team total.*away/.test(bet);return teamOk&&valueHasLine(label,side,line);});set('homeOver05',teamTotal('home','over',0.5));set('homeUnder05',teamTotal('home','under',0.5));set('awayOver05',teamTotal('away','over',0.5));set('awayUnder05',teamTotal('away','under',0.5));const corners=(side,line)=>collectOdds(match,(bet,label)=>/corner/.test(bet)&&valueHasLine(label,side,line));set('cornersOver75',corners('over',7.5));set('cornersUnder75',corners('under',7.5));set('cornersOver85',corners('over',8.5));set('cornersUnder85',corners('under',8.5));set('cornersOver95',corners('over',9.5));set('cornersUnder95',corners('under',9.5));const scoreBuckets={};for(const {bet} of allBets(match)){const betName=normalizeLabel(bet?.name);if(!/(correct score|exact score)/.test(betName))continue;for(const value of bet?.values||[]){const odd=Number(value?.odd),raw=String(value?.value||'').trim();const m=raw.match(/(\d+)\s*[-:]\s*(\d+)/);if(!m||!Number.isFinite(odd)||odd<=1)continue;const key=`${Number(m[1])}-${Number(m[2])}`;(scoreBuckets[key]||(scoreBuckets[key]=[])).push(odd);}}for(const [score,values] of Object.entries(scoreBuckets)){const v=median(values);if(v)result.exactScores[score]=v;}if(!Object.keys(result.exactScores).length)delete result.exactScores;result.coverage=Object.keys(result).filter(k=>k!=='coverage'&&k!=='exactScores').length+(result.exactScores?Object.keys(result.exactScores).length:0);return result;}
function parsePercent(value){if(value==null)return null;const n=Number(String(value).replace('%','').trim());return Number.isFinite(n)?n/100:null}
function extractPrediction(payload){const row=payload?.response?.[0],percent=row?.predictions?.percent||{},home=parsePercent(percent.home),draw=parsePercent(percent.draw),away=parsePercent(percent.away);if(![home,draw,away].every(v=>Number.isFinite(v)&&v>0))return null;return {home,draw,away,advice:row?.predictions?.advice||null,winner:row?.predictions?.winner?.name||null,source:'API-FOOTBALL-PREDICTIONS'}}
function summarizeTeamHistory(fixtures,teamId){const rows=(fixtures||[]).filter(f=>['FT','AET','PEN'].includes(f.fixture?.status?.short)).sort((a,b)=>(a.fixture?.timestamp||0)-(b.fixture?.timestamp||0));let wins=0,draws=0,losses=0,gf=0,ga=0,cleanSheets=0,failedToScore=0,btts=0,over25=0,homeGames=0,homePoints=0,awayGames=0,awayPoints=0;const results=[];for(const f of rows){const isHome=Number(f.teams?.home?.id)===Number(teamId),isAway=Number(f.teams?.away?.id)===Number(teamId);if(!isHome&&!isAway)continue;const scored=Number(isHome?f.goals?.home:f.goals?.away)||0,conceded=Number(isHome?f.goals?.away:f.goals?.home)||0,points=scored>conceded?3:scored===conceded?1:0;if(points===3)wins++;else if(points===1)draws++;else losses++;gf+=scored;ga+=conceded;if(conceded===0)cleanSheets++;if(scored===0)failedToScore++;if(scored>0&&conceded>0)btts++;if(scored+conceded>2)over25++;if(isHome){homeGames++;homePoints+=points}else{awayGames++;awayPoints+=points}results.push({fixtureId:f.fixture?.id,timestamp:f.fixture?.timestamp||null,competition:f.league?.name||null,venue:isHome?'H':'A',opponent:isHome?f.teams?.away?.name:f.teams?.home?.name,gf:scored,ga:conceded,points})}const n=results.length,recent=results.slice(-5),recentPoints=recent.reduce((s,r)=>s+r.points,0),round=v=>Number(v.toFixed(3));return {matches:n,wins,draws,losses,pointsPerGame:n?round((wins*3+draws)/n):0,goalsForPerGame:n?round(gf/n):0,goalsAgainstPerGame:n?round(ga/n):0,winRate:n?round(wins/n):0,cleanSheetRate:n?round(cleanSheets/n):0,failedToScoreRate:n?round(failedToScore/n):0,bttsRate:n?round(btts/n):0,over25Rate:n?round(over25/n):0,homeGames,homePPG:homeGames?round(homePoints/homeGames):null,awayGames,awayPPG:awayGames?round(awayPoints/awayGames):null,last5PPG:recent.length?round(recentPoints/recent.length):0,recentResults:recent.map(r=>r.points===3?'W':r.points===1?'D':'L').join(''),windowDays:HISTORY_DAYS,from:daysAgoInTimezone(HISTORY_DAYS),to:todayInTimezone(),allMatches:results};}
async function mapConcurrent(items,worker,deadline){const results=new Array(items.length);let cursor=0;async function run(){while(cursor<items.length&&Date.now()<deadline&&canSpend('secondary')){const i=cursor++;try{results[i]=await worker(items[i],i)}catch(_){results[i]=null}}}await Promise.all(Array.from({length:Math.min(CONCURRENCY,items.length)},run));return results;}
async function loadAggregate(path,fallback){if(!storageReady())return fallback;try{return await readJson(path,fallback)}catch(_){return fallback}}
async function saveAggregate(path,value){if(!storageReady())return;try{await writeJson(path,value)}catch(_){} }
async function fetchHistories(fixtures,deadline){const from=daysAgoInTimezone(HISTORY_DAYS),to=todayInTimezone(),teamIds=[],seen=new Set();for(const f of fixtures){if(isFinishedFixture(f))continue;for(const id of [f.teams?.home?.id,f.teams?.away?.id]){const n=Number(id);if(n&&!seen.has(n)){seen.add(n);teamIds.push(n)}}}const path='argus/data/team-history-90d.json';const store=await loadAggregate(path,{teams:{}});store.teams||={};const cutoff=Date.now()-HISTORY_CACHE_TTL_MS;const histories=new Map(),missing=[];for(const id of teamIds){const row=store.teams[String(id)];if(row?.data&&new Date(row.savedAt||0).getTime()>=cutoff)histories.set(id,row.data);else missing.push(id)}const fetched=await mapConcurrent(missing,async id=>{const payload=await apiGet(`/fixtures?team=${id}&from=${from}&to=${to}&status=FT-AET-PEN`);return {id,data:summarizeTeamHistory(payload.response||[],id)}},deadline);let loaded=0;for(const row of fetched){if(!row)continue;histories.set(row.id,row.data);store.teams[String(row.id)]={savedAt:new Date().toISOString(),data:row.data};loaded++}if(loaded)await saveAggregate(path,store);return {histories,totalTeams:teamIds.length,loadedThisScan:loaded,missingAfter:teamIds.length-histories.size,from,to};}
async function enrichLiveFixtures(fixtures,deadline){const liveFixtures=fixtures.filter(isLiveFixture),detailsById=new Map();const rows=await mapConcurrent(liveFixtures,async fixture=>{const id=fixture.fixture?.id;if(!id)return null;const detail=await apiGet(`/fixtures?id=${id}`,{priority:'live'});return detail.response?.[0]||null},deadline);for(const row of rows)if(row?.fixture?.id)detailsById.set(Number(row.fixture.id),row);return fixtures.map(f=>detailsById.get(Number(f.fixture?.id))||f);}
async function fetchPrematchOddsByDate(date,deadline){const cachePath=`argus/data/odds-${date}.json`;const cached=await loadAggregate(cachePath,null);if(cached?.savedAt&&Date.now()-new Date(cached.savedAt).getTime()<ODDS_CACHE_TTL_MS&&cached.payload)return cached.payload;const combined={response:[]};try{const first=await apiGet(`/odds?date=${date}&page=1`);combined.response.push(...(first.response||[]));const totalPages=Number(first.paging?.total||1);for(let page=2;page<=totalPages&&Date.now()<deadline&&canSpend('secondary');page++){const next=await apiGet(`/odds?date=${date}&page=${page}`);combined.response.push(...(next.response||[]))}await saveAggregate(cachePath,{savedAt:new Date().toISOString(),payload:combined})}catch(_){}return combined;}
async function fetchPrematchPredictions(fixtures,date,deadline){const candidates=fixtures.filter(f=>!isLiveFixture(f)&&!isFinishedFixture(f));const cachePath=`argus/data/predictions-${date}.json`;const store=await loadAggregate(cachePath,{fixtures:{}});store.fixtures||={};const cutoff=Date.now()-PREDICTION_CACHE_TTL_MS;const predictions=new Map(),missing=[];for(const f of candidates){const id=Number(f.fixture?.id);if(!id)continue;const row=store.fixtures[String(id)];if(row?.data&&new Date(row.savedAt||0).getTime()>=cutoff)predictions.set(id,row.data);else missing.push(f)}const rows=await mapConcurrent(missing,async fixture=>{const id=Number(fixture.fixture?.id);const prediction=extractPrediction(await apiGet(`/predictions?fixture=${id}`));return prediction?{id,data:prediction}:null},deadline);let loaded=0;for(const row of rows){if(!row)continue;predictions.set(row.id,row.data);store.fixtures[String(row.id)]={savedAt:new Date().toISOString(),data:row.data};loaded++}if(loaded)await saveAggregate(cachePath,store);return {predictions,total:candidates.length,loadedThisScan:loaded,missingAfter:Math.max(0,candidates.length-predictions.size)};}
function normalizeFixture(fixture,liveOdds,prematchOdds,predictions,histories){const live=isLiveFixture(fixture),finished=isFinishedFixture(fixture),id=fixture.fixture?.id,homeTeamId=fixture.teams?.home?.id||null,awayTeamId=fixture.teams?.away?.id||null;const oddsPayload=live?liveOdds:prematchOdds;return {id,competition:fixture.league?.name,country:fixture.league?.country,status:fixture.fixture?.status?.short||'NS',statusLong:fixture.fixture?.status?.long||'',minute:fixture.fixture?.status?.elapsed||0,kickoff:fixture.fixture?.date||null,timestamp:fixture.fixture?.timestamp||null,isLive:live,isFinished:finished,homeTeamId,awayTeamId,home:fixture.teams?.home?.name||'Home',away:fixture.teams?.away?.name||'Away',score:{home:fixture.goals?.home??0,away:fixture.goals?.away??0},stats:extractStats(fixture),markets:extract1x2(oddsPayload,id),marketOdds:extractMultiMarkets(oddsPayload,id),preMatchModel:finished?null:(predictions.get(Number(id))||null),history90d:{home:histories.get(Number(homeTeamId))||null,away:histories.get(Number(awayTeamId))||null},source:'API-FOOTBALL',observedAt:new Date().toISOString()};}
async function buildPayload(){buildExternalCalls=0;await loadQuotaGuard();if(apiQuota.exhausted)throw new Error('API-Football daily quota exhausted; provider calls paused until daily reset');const started=Date.now(),deadline=started+REQUEST_DEADLINE_MS,date=todayInTimezone();const day=await apiGet(`/fixtures?date=${date}&timezone=${encodeURIComponent(DISPLAY_TIMEZONE)}`,{priority:'critical'}),fixtures=day.response||[];if(!fixtures.length)return {matches:[],meta:{provider:'API-FOOTBALL',mode:'ADVANCED-MULTI-MARKET',date,timezone:DISPLAY_TIMEZONE,fetchedAt:new Date().toISOString(),fixtureCount:0,quota:quotaMeta()}};const enriched=await enrichLiveFixtures(fixtures,deadline);let liveOdds={response:[]};if(enriched.some(isLiveFixture)&&Date.now()<deadline&&canSpend('live')){try{liveOdds=await apiGet('/odds/live',{priority:'live'})}catch(_){} }const prematchOdds=Date.now()<deadline&&canSpend('secondary')?await fetchPrematchOddsByDate(date,deadline):{response:[]};const historyResult=Date.now()<deadline&&canSpend('secondary')?await fetchHistories(enriched,deadline):{histories:new Map(),totalTeams:0,loadedThisScan:0,missingAfter:0,from:daysAgoInTimezone(HISTORY_DAYS),to:date};const predictionResult=Date.now()<deadline&&canSpend('secondary')?await fetchPrematchPredictions(enriched,date,deadline):{predictions:new Map(),total:0,loadedThisScan:0,missingAfter:0};const matches=enriched.map(f=>normalizeFixture(f,liveOdds,prematchOdds,predictionResult.predictions,historyResult.histories)).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));const historyCompleteMatches=matches.filter(m=>m.history90d?.home&&m.history90d?.away).length;const multiMarketMatches=matches.filter(m=>Number(m.marketOdds?.coverage)>0).length;const multiMarketSelections=matches.reduce((s,m)=>s+(Number(m.marketOdds?.coverage)||0),0);return {matches,meta:{provider:'API-FOOTBALL',mode:'ADVANCED-MULTI-MARKET',date,timezone:DISPLAY_TIMEZONE,fetchedAt:new Date().toISOString(),fixtureCount:matches.length,liveFixtureCount:matches.filter(m=>m.isLive).length,prematchAnalyzedCount:matches.filter(m=>m.preMatchModel).length,prematchTotal:predictionResult.total,prematchLoadedThisScan:predictionResult.loadedThisScan,prematchMissing:predictionResult.missingAfter,historyWindowDays:HISTORY_DAYS,historyFrom:historyResult.from,historyTo:historyResult.to,historyTeamsCovered:historyResult.histories.size,historyTeamsTotal:historyResult.totalTeams,historyLoadedThisScan:historyResult.loadedThisScan,historyTeamsMissing:historyResult.missingAfter,historyCompleteMatches,multiMarketMatches,multiMarketSelections,storage:storageReady()?'BLOB':'MEMORY',requestBudgetMs:REQUEST_DEADLINE_MS,elapsedMs:Date.now()-started,cacheSeconds:CACHE_TTL_MS/1000,oddsCacheSeconds:ODDS_CACHE_TTL_MS/1000,quota:quotaMeta()}};}
export default async function handler(req,res){res.setHeader('Cache-Control','s-maxage=240, stale-while-revalidate=60');res.setHeader('Access-Control-Allow-Origin','*');if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});try{if(cache.payload&&Date.now()-cache.at<CACHE_TTL_MS)return res.status(200).json({...cache.payload,meta:{...cache.payload.meta,quota:quotaMeta(),cache:'HIT'}});const payload=await buildPayload();cache={at:Date.now(),payload};return res.status(200).json({...payload,meta:{...payload.meta,quota:quotaMeta(),cache:'MISS'}})}catch(error){if(cache.payload)return res.status(200).json({...cache.payload,meta:{...cache.payload.meta,quota:quotaMeta(),cache:'STALE',degraded:true,degradedReason:error.message}});if(String(error?.message||'').includes('minute'))return res.status(200).json({error:error.message,matches:[],meta:{provider:'API-FOOTBALL',mode:'ADVANCED-MULTI-MARKET',timezone:DISPLAY_TIMEZONE,fetchedAt:new Date().toISOString(),quota:quotaMeta(),degraded:true,degradedReason:'MINUTE_RATE_LIMIT'}});return res.status(503).json({error:error.message,matches:[],meta:{provider:'API-FOOTBALL',mode:'ADVANCED-MULTI-MARKET',timezone:DISPLAY_TIMEZONE,fetchedAt:new Date().toISOString(),quota:quotaMeta()}})}}
