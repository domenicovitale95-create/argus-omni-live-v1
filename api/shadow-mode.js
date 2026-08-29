import { requestQuery } from './_request-query.js';
import { readJson, writeJson, listJson, readManyJson, storageReady } from './_report-store.js';
import { captureShadowEvidence, settlePick, lastClosingSnapshot } from './_shadow-evidence-core.js';

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

async function capture(req,res){
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const body=req.body||{},matches=Array.isArray(body.matches)?body.matches:[],date=body.date?String(body.date):null;
  try{return res.status(200).json(await captureShadowEvidence(matches,{date}))}
  catch(error){return res.status(503).json({ok:false,error:String(error?.message||error),providerCalls:0,automaticRealWagering:false})}
}

async function settle(req,res){
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const date=String(requestQuery(req)?.date||dateBrussels()),guard=await readJson(QUOTA_GUARD_PATH,null),providerBlocked=Boolean(guard?.exhausted&&quotaGuardDay(guard)===providerDayUtc());
  if(providerBlocked)return res.status(200).json({ok:true,date,settled:0,skipped:true,reason:'PROVIDER_BLOCKED_BY_QUOTA_GUARD',providerCallSkipped:true,providerCalls:0,automaticRealWagering:false});
  const path=`argus/shadow/${date}.json`,store=await readJson(path,null);
  if(!store)return res.status(200).json({ok:true,date,settled:0,reason:'NO_SHADOW_BOOK',providerCalls:0,automaticRealWagering:false});
  const rows=await fetchFixtures(date),byId=new Map(rows.map(x=>[String(x.fixture?.id),x]));
  let settled=0,voided=0,wins=0,losses=0,clvN=0,clvSum=0;
  for(const[id,f]of Object.entries(store.fixtures||{})){
    const r=byId.get(id),st=r?.fixture?.status?.short;
    if(VOID.has(st)){
      let changed=false;for(const p of f.picks||[])if(!p.outcome){p.outcome='VOID';voided++;changed=true}
      if(changed){f.settledAt=new Date().toISOString();f.settlementSource='API_FOOTBALL_RECOVERY'}
      continue;
    }
    if(!FINAL.has(st))continue;
    const h=Number(r?.goals?.home),a=Number(r?.goals?.away);if(!Number.isFinite(h)||!Number.isFinite(a))continue;
    const close=lastClosingSnapshot(f);f.finalScore={home:h,away:a};f.settledAt=f.settledAt||new Date().toISOString();f.closingSnapshot=close||f.closingSnapshot||null;f.settlementSource=f.settlementSource||'API_FOOTBALL_RECOVERY';
    for(const p of f.picks||[]){
      if(['WIN','LOSS','VOID'].includes(p.outcome))continue;
      const ok=settlePick(p,h,a);if(ok==null)continue;
      p.outcome=ok?'WIN':'LOSS';p.pl=p.odds?Number((ok?(p.odds-1):-1).toFixed(2)):null;
      const closingOdds=Number(close?.odds?.[p.key]);p.closingOdds=Number.isFinite(closingOdds)&&closingOdds>1?closingOdds:null;p.clv=p.odds&&p.closingOdds?Number(((p.odds/p.closingOdds-1)*100).toFixed(2)):null;
      if(p.clv!=null){clvN++;clvSum+=p.clv}settled++;ok?wins++:losses++;
    }
  }
  store.lastSettlement=new Date().toISOString();await writeJson(path,store);
  return res.status(200).json({ok:true,date,settled,voided,wins,losses,clvSamples:clvN,avgCLV:clvN?Number((clvSum/clvN).toFixed(2)):null,providerCalls:1,automaticRealWagering:false});
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
