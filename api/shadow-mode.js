import { requestQuery } from './_request-query.js';
import { readJson, writeJson, listJson, listJsonComplete, readManyJson, storageReady } from './_report-store.js';
import { captureShadowEvidence, lastClosingSnapshot, reconcileSettlementScore } from './_shadow-evidence-core.js';
import {
  SHADOW_FIXTURE_REGISTRY_PATH,
  buildShadowFixtureRegistry,
  canonicalShadowFixture,
  isShadowFixtureRegistry,
  registerShadowBook,
  shadowBookDateForMatch
} from './_shadow-fixture-registry.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const QUOTA_GUARD_PATH='argus/data/api-football-quota-guard.json';
const FINAL=new Set(['FT','AET','PEN']);
const VOID=new Set(['CANC','ABD','AWD','WO']);

function dateBrussels(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
function providerDayUtc(value=new Date()){return value.toISOString().slice(0,10)}
function quotaGuardDay(state){if(!state)return null;const recorded=state.providerDayUtc||null,observed=state.observedAt?String(state.observedAt).slice(0,10):null;return recorded||observed||state.date||null}
function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
async function fetchFixtures(date){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();return j.response||[]}

async function loadShadowFixtureRegistry({seedIfMissing=true,now=new Date()}={}){
  const existing=await readJson(SHADOW_FIXTURE_REGISTRY_PATH,null);
  if(isShadowFixtureRegistry(existing))return{registry:existing,seeded:false};
  if(!seedIfMissing)throw new Error('SHADOW_FIXTURE_REGISTRY_MISSING');
  const listing=await listJsonComplete('argus/shadow/',{maxBlobs:5000,pageSize:500});
  if(!listing.complete)throw new Error(`SHADOW_FIXTURE_REGISTRY_SEED_INCOMPLETE:${listing.error||'UNKNOWN'}`);
  const books=await readManyJson(listing.blobs),registry=buildShadowFixtureRegistry(books,{nowIso:now.toISOString()});
  registry.seedDiagnostics={...registry.seedDiagnostics,pages:listing.pages,scanned:listing.scanned,complete:true};
  await writeJson(SHADOW_FIXTURE_REGISTRY_PATH,registry);
  return{registry,seeded:true};
}

async function persistShadowFixtureRegistry(registry,{now=new Date()}={}){
  if(!isShadowFixtureRegistry(registry))throw new Error('INVALID_SHADOW_FIXTURE_REGISTRY');
  registry.updatedAt=now.toISOString();
  await writeJson(SHADOW_FIXTURE_REGISTRY_PATH,registry);
  return registry;
}

async function capture(req,res){
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const body=req.body||{},matches=Array.isArray(body.matches)?body.matches:[],date=body.date?String(body.date):null;
  try{
    const {registry,seeded}=await loadShadowFixtureRegistry({seedIfMissing:true});
    const accepted=[],rescheduleSuppressed=[];
    for(const m of matches){
      const id=String(m?.id||'').trim();
      if(!id)continue;
      const targetDate=shadowBookDateForMatch(m,date),canonical=canonicalShadowFixture(registry,id);
      if(canonical&&canonical.canonicalDate!==targetDate){
        rescheduleSuppressed.push({fixtureId:id,canonicalDate:canonical.canonicalDate,targetDate,frozenAt:canonical.frozenAt||null,frozenKickoff:canonical.frozenKickoff||null,latestKickoff:m?.kickoff||null});
        continue;
      }
      accepted.push(m);
    }
    const result=await captureShadowEvidence(accepted,{date});
    let registryChanges=0;
    for(const row of result?.dates||[]){
      const d=String(row?.date||'').trim();
      if(!d)continue;
      const book=await readJson(`argus/shadow/${d}.json`,null);
      if(book)registryChanges+=registerShadowBook(registry,book);
    }
    if(registryChanges>0)await persistShadowFixtureRegistry(registry);
    return res.status(200).json({
      ...result,
      globalFixtureIdentity:{
        version:registry.version,
        registrySeeded:seeded,
        acceptedMatches:accepted.length,
        rescheduleSuppressed:rescheduleSuppressed.length,
        registryChanges,
        suppressed:rescheduleSuppressed.slice(0,25),
        policy:'FIRST FREEZE BY FIXTURE ID IS CANONICAL ACROSS DAILY BOOKS'
      }
    });
  }
  catch(error){return res.status(503).json({ok:false,error:String(error?.message||error),providerCalls:0,automaticRealWagering:false})}
}

function noteReschedule(f,providerKickoff,nowIso){
  if(!providerKickoff||!f?.kickoff||String(providerKickoff)===String(f.kickoff))return false;
  f.rescheduleHistory=Array.isArray(f.rescheduleHistory)?f.rescheduleHistory:[];
  if(f.rescheduleHistory.some(x=>String(x?.providerKickoff||'')===String(providerKickoff)))return false;
  const fromMs=new Date(f.kickoff).getTime(),toMs=new Date(providerKickoff).getTime();
  f.rescheduleHistory.push({frozenKickoff:f.kickoff,providerKickoff,detectedAt:nowIso,deltaMs:Number.isFinite(fromMs)&&Number.isFinite(toMs)?toMs-fromMs:null,source:'API_FOOTBALL_SETTLEMENT'});
  return true;
}

async function settle(req,res){
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const date=String(requestQuery(req)?.date||dateBrussels()),guard=await readJson(QUOTA_GUARD_PATH,null),providerBlocked=Boolean(guard?.exhausted&&quotaGuardDay(guard)===providerDayUtc());
  if(providerBlocked)return res.status(200).json({ok:true,date,settled:0,skipped:true,reason:'PROVIDER_BLOCKED_BY_QUOTA_GUARD',providerCallSkipped:true,providerCalls:0,automaticRealWagering:false});
  try{
    const {registry,seeded}=await loadShadowFixtureRegistry({seedIfMissing:true});
    const rows=await fetchFixtures(date),books=new Map();
    const loadBook=async bookDate=>{
      if(books.has(bookDate))return books.get(bookDate);
      const store=await readJson(`argus/shadow/${bookDate}.json`,null),entry={date:bookDate,store,dirty:false};
      books.set(bookDate,entry);return entry;
    };
    let settled=0,correctedOutcomes=0,scoreCorrections=0,voided=0,wins=0,losses=0,clvN=0,clvSum=0,crossBookFixtures=0,registryMisses=0,reschedulesDetected=0;
    const nowIso=new Date().toISOString();
    for(const r of rows){
      const id=String(r?.fixture?.id||'').trim();
      if(!id)continue;
      const canonical=canonicalShadowFixture(registry,id),bookDate=canonical?.canonicalDate||date;
      if(!canonical)registryMisses++;
      const entry=await loadBook(bookDate),f=entry.store?.fixtures?.[id];
      if(!f)continue;
      if(bookDate!==date)crossBookFixtures++;
      const st=String(r?.fixture?.status?.short||'').toUpperCase(),providerKickoff=r?.fixture?.date||null;
      if(noteReschedule(f,providerKickoff,nowIso)){reschedulesDetected++;entry.dirty=true}
      if(VOID.has(st)){
        let changed=false;for(const p of f.picks||[])if(!p.outcome){p.outcome='VOID';voided++;changed=true}
        if(changed){f.settledAt=nowIso;f.settlementSource='API_FOOTBALL_RECOVERY';entry.dirty=true}
        continue;
      }
      if(!FINAL.has(st))continue;
      const h=Number(r?.goals?.home),a=Number(r?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))continue;
      const close=lastClosingSnapshot(f),result=reconcileSettlementScore(f,h,a,{nowIso,source:'API_FOOTBALL_RECOVERY',closingSnapshot:close});if(result.changed)entry.dirty=true;settled+=result.settled;correctedOutcomes+=result.correctedOutcomes;scoreCorrections+=result.scoreCorrected?1:0;wins+=result.wins;losses+=result.losses;for(const clv of result.clvValues){clvN++;clvSum+=clv}
    }
    let booksWritten=0;
    for(const entry of books.values())if(entry.store&&entry.dirty){entry.store.lastSettlement=nowIso;await writeJson(`argus/shadow/${entry.date}.json`,entry.store);booksWritten++}
    return res.status(200).json({ok:true,date,settled,correctedOutcomes,scoreCorrections,voided,wins,losses,clvSamples:clvN,avgCLV:clvN?Number((clvSum/clvN).toFixed(2)):null,providerCalls:1,automaticRealWagering:false,globalFixtureIdentity:{version:registry.version,registrySeeded:seeded,crossBookFixtures,registryMisses,reschedulesDetected,booksWritten,policy:'SETTLE PROVIDER DATE INTO CANONICAL FIRST-FREEZE BOOK BY FIXTURE ID'}});
  }catch(error){return res.status(503).json({ok:false,date,error:String(error?.message||error),providerCalls:0,automaticRealWagering:false})}
}

async function summary(req,res){
  if(!storageReady())return res.status(200).json({storageReady:false,summary:{}});
  const blobs=await listJson('argus/shadow/',120),books=await readManyJson(blobs);
  let picks=0,settled=0,wins=0,pl=0,priced=0,independent=0,independentSettled=0,clvN=0,clvSum=0;
  const market={},sources={};
  for(const b of books)for(const f of Object.values(b.fixtures||{}))for(const p of f.picks||[]){
    picks++;if(p.modelIndependentOfPrice===true)independent++;if(p.odds)priced++;
    const source=String(p.probabilitySource||'LEGACY_OR_UNKNOWN');sources[source]||(sources[source]={picks:0,settled:0,priced:0});sources[source].picks++;if(p.odds)sources[source].priced++;
    if(!market[p.key])market[p.key]={sample:0,settled:0,wins:0,pl:0,clvN:0,clvSum:0};market[p.key].sample++;
    if(['WIN','LOSS'].includes(p.outcome)){
      settled++;sources[source].settled++;market[p.key].settled++;if(p.modelIndependentOfPrice===true)independentSettled++;
      if(p.outcome==='WIN'){wins++;market[p.key].wins++}
      if(Number.isFinite(Number(p.pl))){pl+=Number(p.pl);market[p.key].pl+=Number(p.pl)}
      if(p.clv!=null&&Number.isFinite(Number(p.clv))){clvN++;clvSum+=Number(p.clv);market[p.key].clvN++;market[p.key].clvSum+=Number(p.clv)}
    }
  }
  const prof=Object.fromEntries(Object.entries(market).map(([k,v])=>[k,{sample:v.sample,settled:v.settled,wins:v.wins,hitRate:v.settled?Number((v.wins/v.settled*100).toFixed(1)):null,roi:v.settled?Number((v.pl/v.settled*100).toFixed(1)):null,avgCLV:v.clvN?Number((v.clvSum/v.clvN).toFixed(2)):null,clvSamples:v.clvN}]));
  return res.status(200).json({storageReady:true,summary:{books:books.length,picks,settled,wins,hitRate:settled?Number((wins/settled*100).toFixed(1)):null,priced,independent,independentSettled,flatStakePL:Number(pl.toFixed(2)),roi:settled?Number((pl/settled*100).toFixed(1)):null,avgCLV:clvN?Number((clvSum/clvN).toFixed(2)):null,clvSamples:clvN},market:prof,sources,integrity:'IMMUTABLE FIRST FREEZE: model probabilities are frozen before kickoff. Prices may only be first-bound before kickoff; later pre-kickoff runs append timestamped snapshots. Market-implied probabilities are diagnostics only and are never used as the predictive source.'});
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='POST'){if(!authorized(req))return res.status(401).json({error:'Unauthorized'});return capture(req,res)}
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(String(requestQuery(req)?.mode||'').toLowerCase()==='settle'){if(!authorized(req))return res.status(401).json({error:'Unauthorized'});return settle(req,res)}
  return summary(req,res);
}
