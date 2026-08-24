import { readJson, storageReady } from './_report-store.js';

const TZ='Europe/Brussels';
const BANK_PATH='argus/paper/virtual-bankroll.json';
const TRACKING_SINCE='2026-08-24T10:17:00.000Z';
const MAX_CAPTURE_AGE_MIN=10;
const SUPPORTED=new Set(['HOME','DRAW','AWAY','OVER_1_5','UNDER_1_5','OVER_2_5','UNDER_2_5','OVER_3_5','UNDER_3_5','BTTS_YES','BTTS_NO','HOME_OVER_0_5','HOME_UNDER_0_5','AWAY_OVER_0_5','AWAY_UNDER_0_5','DOUBLE_CHANCE_1X','DOUBLE_CHANCE_12','DOUBLE_CHANCE_X2','DNB_HOME','DNB_AWAY']);
const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};
function brusselsDate(value=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
const ledgerPath=d=>`argus/ledger/${d}.json`;
function selection(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9:.-]+/g,'_').replace(/^_|_$/g,'')}
function supported(v){const x=selection(v);return SUPPORTED.has(x)||/^EXACT_SCORE:\d+-\d+$/.test(x)}
function alreadyPlayed(state,fixtureId){return Object.values(state?.bets||{}).some(b=>String(b.fixtureId)===String(fixtureId)&&String(b.cohort||'OFFICIAL_PAPER')==='OFFICIAL_PAPER')}
function eligibleRecord(rec){const published=new Date(rec?.publishedAt||0).getTime(),kickoff=new Date(rec?.kickoff||0).getTime();return Boolean(rec?.id&&rec?.fixtureId&&n(rec?.recommendedStakePct,0)>0&&n(rec?.odds,0)>1&&supported(rec?.selection)&&rec?.integrity?.settlementSupported!==false&&Number.isFinite(published)&&Number.isFinite(kickoff)&&published<kickoff&&published>=new Date(TRACKING_SINCE).getTime())}
function missReason(rec,nowMs){const published=new Date(rec?.publishedAt||0).getTime(),kickoff=new Date(rec?.kickoff||0).getTime();if(nowMs>=kickoff)return'MATCH_STARTED_BEFORE_CAPTURE';if((nowMs-published)/60000>MAX_CAPTURE_AGE_MIN)return'NOT_CAPTURED_IN_TIME';return null}
function simpleResult(rec){const s=String(rec?.settlement?.status||'PENDING').toUpperCase();return['WIN','LOSS','VOID'].includes(s)?s:'PENDING'}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  try{
    const state=await readJson(BANK_PATH,{bets:{}}),today=brusselsDate(),books=[];
    for(const d of[-1,0,1]){const book=await readJson(ledgerPath(addDays(today,d)),null);if(book?.records?.length)books.push(book)}
    const nowMs=Date.now(),byFixture=new Map();
    for(const rec of books.flatMap(b=>b.records||[])){
      if(!eligibleRecord(rec)||alreadyPlayed(state,rec.fixtureId))continue;
      const reason=missReason(rec,nowMs);if(!reason)continue;
      const old=byFixture.get(String(rec.fixtureId));if(old&&new Date(old.publishedAt)>=new Date(rec.publishedAt))continue;
      byFixture.set(String(rec.fixtureId),{fixtureId:Number(rec.fixtureId),publishedAt:rec.publishedAt,kickoff:rec.kickoff||null,competition:rec.competition||null,home:rec.home||null,away:rec.away||null,selection:selection(rec.selection),selectionLabel:rec.selectionLabel||rec.selection||null,odds:n(rec.odds),confidence:n(rec.confidence),recommendedStakePct:n(rec.recommendedStakePct),reason,status:simpleResult(rec),finalScore:rec?.settlement?.finalScore||null});
    }
    const missed=[...byFixture.values()].sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,50);
    return res.status(200).json({version:'MISSED-VIRTUAL-BETS-1',generatedAt:new Date().toISOString(),trackingSince:TRACKING_SINCE,count:missed.length,missed,policy:{prospectiveOnly:true,noHistoricalBackfill:true,noProviderCalls:true,meaning:'A valid virtual bet appeared but was not captured within the allowed time.'}});
  }catch(e){return res.status(500).json({error:e.message||'Unable to read missed virtual bets'})}
}
