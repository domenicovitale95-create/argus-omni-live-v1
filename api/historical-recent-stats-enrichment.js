import { readJson, writeJson, listJson, readManyJson, storageReady } from './_report-store.js';

const API='https://v3.football.api-sports.io';
const FIXTURE_PREFIX='argus/research/historical-recent/';
const STATS_PREFIX='argus/research/historical-recent-stats/';
const QUOTA_GUARD='argus/data/api-football-quota-guard.json';
const TZ='Europe/Brussels';
const DEFAULT_BATCH=4,MAX_BATCH=8;
function authorized(req){const s=process.env.CRON_SECRET;return !s||req.headers.authorization===`Bearer ${s}`}
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function hn(h,name){const raw=h.get(name);if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null}
function qh(h){return{dailyRemaining:hn(h,'x-ratelimit-requests-remaining'),dailyLimit:hn(h,'x-ratelimit-requests-limit'),minuteRemaining:hn(h,'x-ratelimit-remaining')}}
function reserve(q){return Number.isFinite(q?.dailyLimit)?Math.max(250,Math.ceil(q.dailyLimit*.15)):500}
function shouldStop(q){return(q?.dailyRemaining!=null&&q.dailyRemaining<=reserve(q))||(q?.minuteRemaining!=null&&q.minuteRemaining<=3)}
function val(stats,name){const x=(stats||[]).find(s=>String(s.type||'').toLowerCase()===String(name).toLowerCase())?.value;if(x==null)return null;const n=Number(String(x).replace('%',''));return Number.isFinite(n)?n:null}
async function getStats(id){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API}/fixtures/statistics?fixture=${id}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});const quota=qh(r.headers);if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(JSON.stringify(j.errors));const b=j.response||[],home=b[0]?.statistics||[],away=b[1]?.statistics||[];return{quota,data:{home:{corners:val(home,'Corner Kicks'),yellow:val(home,'Yellow Cards'),red:val(home,'Red Cards'),shots:val(home,'Total Shots'),shotsOnTarget:val(home,'Shots on Goal'),possession:val(home,'Ball Possession'),fouls:val(home,'Fouls')},away:{corners:val(away,'Corner Kicks'),yellow:val(away,'Yellow Cards'),red:val(away,'Red Cards'),shots:val(away,'Total Shots'),shotsOnTarget:val(away,'Shots on Goal'),possession:val(away,'Ball Possession'),fouls:val(away,'Fouls')}}}}
function derive(s){const h=s.home||{},a=s.away||{},sum=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)?x+y:null;return{cornersTotal:sum(h.corners,a.corners),homeCorners:h.corners,awayCorners:a.corners,yellowCardsTotal:sum(h.yellow,a.yellow),redCardsTotal:sum(h.red,a.red),shotsTotal:sum(h.shots,a.shots),shotsOnTargetTotal:sum(h.shotsOnTarget,a.shotsOnTarget),foulsTotal:sum(h.fouls,a.fouls),possessionHome:h.possession,possessionAway:a.possession}}
function monthPath(month){return`${STATS_PREFIX}${month}.json`}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!authorized(req)&&String(req.query?.dryRun||'')!=='1')return res.status(401).json({error:'Unauthorized'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const [guard,fixtureBlobs,statsBlobs]=await Promise.all([readJson(QUOTA_GUARD,null),listJson(FIXTURE_PREFIX,240),listJson(STATS_PREFIX,240)]),today=brusselsDate();
  const [fixtureShards,statsShards]=await Promise.all([readManyJson(fixtureBlobs),readManyJson(statsBlobs)]);if(!fixtureShards.length)return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-STATS-1',status:'WAITING_RECENT_FIXTURES',providerCalls:0});
  const existing=new Set();for(const s of statsShards)for(const id of Object.keys(s?.fixtures||{}))existing.add(id);
  const rows=[];for(const s of fixtureShards)for(const f of Object.values(s?.fixtures||{}))rows.push(f);rows.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));const pending=rows.filter(f=>!existing.has(String(f.fixtureId))),batch=Math.max(1,Math.min(MAX_BATCH,Number(req.query?.fixtures)||DEFAULT_BATCH));
  if(String(req.query?.dryRun||'')==='1')return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-STATS-1',status:'DRY_RUN',recentFixtures:rows.length,enriched:existing.size,pending:pending.length,nextFixtureIds:pending.slice(0,batch).map(f=>f.fixtureId),providerCalls:0,writes:0,policy:{dryRun:true,providerQuotaSpend:false,persistentWrites:false,monthlyShards:true,noLegacyRewrite:true}});
  if(guard?.date===today&&guard?.exhausted)return res.status(200).json({ok:true,version:'HISTORICAL-RECENT-STATS-1',status:'PAUSED_QUOTA_GUARD',processed:0,providerCalls:0,guardDate:guard.date,policy:{failClosed:true,noProviderQuotaSpend:true,automaticResumeOnNewBrusselsDate:true}});
  const cache=new Map(),dirty=new Set();async function shard(month){const p=monthPath(month);if(cache.has(p))return cache.get(p);const s=await readJson(p,{version:'HISTORICAL-RECENT-STATS-SHARD-1',month,fixtures:{}});s.fixtures||={};cache.set(p,s);return s}
  let processed=0,saved=0,providerCalls=0,lastQuota=null;const errors=[];
  for(const f of pending){if(processed>=batch)break;const k=String(f.fixtureId),month=String(f.date||'').slice(0,7)||'unknown';try{const out=await getStats(f.fixtureId);providerCalls++;lastQuota=out.quota;const d=derive(out.data),available=Object.values(d).some(Number.isFinite),s=await shard(month),p=monthPath(month);s.fixtures[k]={fixtureId:f.fixtureId,date:f.date,competition:f.competition,home:f.home,away:f.away,status:available?'AVAILABLE':'NOT_AVAILABLE',stats:out.data,derived:d,savedAt:new Date().toISOString()};s.updatedAt=new Date().toISOString();dirty.add(p);processed++;saved++;if(shouldStop(lastQuota))break}catch(e){errors.push({fixtureId:f.fixtureId,error:e.message});break}}
  for(const p of dirty)await writeJson(p,cache.get(p));
  return res.status(errors.length?207:200).json({ok:errors.length===0,version:'HISTORICAL-RECENT-STATS-1',status:errors.length?'PARTIAL':'OK',processed,saved,providerCalls,totalRecentFixtures:rows.length,previouslyEnriched:existing.size,pendingBeforeRun:pending.length,quota:lastQuota,reserve:reserve(lastQuota),errors,policy:{monthlyShards:true,noLegacyRewrite:true,newestUnenrichedFirst:true,quotaAware:true,noFabrication:true,marketsEnabledWhenAvailable:['CORNERS','CARDS','SHOTS','SHOTS_ON_TARGET','FOULS','POSSESSION']}})
}
