import { readJson, storageReady, writeJson } from './_report-store.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const FINAL_STATUSES=new Set(['FT','AET','PEN']);
const VOID_STATUSES=new Set(['CANC','ABD','AWD','WO']);

function dateInBrussels(value=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function validSelection(v){ return ['HOME','DRAW','AWAY'].includes(String(v||'').toUpperCase()); }
function isActionableClass(c){ const x=String(c||'').toUpperCase(); return x.includes('PRIME') || x.includes('VALUE'); }
function pickSnapshot(fixture){
  const snaps=Array.isArray(fixture?.snapshots)?fixture.snapshots:[];
  const kickoff=fixture?.kickoff?new Date(fixture.kickoff).getTime():Infinity;
  const prematch=snaps.filter(s=>s.phase==='PREMATCH' && new Date(s.recordedAt).getTime()<=kickoff && validSelection(s.selection));
  if(prematch.length) return prematch[prematch.length-1];
  const live=snaps.filter(s=>s.phase==='LIVE' && validSelection(s.selection));
  return live.length?live[live.length-1]:null;
}

function outcomeFromFixture(row){
  const status=row?.fixture?.status?.short;
  if(VOID_STATUSES.has(status)) return {state:'VOID'};
  if(!FINAL_STATUSES.has(status)) return {state:'PENDING'};
  const h=row?.score?.fulltime?.home ?? row?.goals?.home;
  const a=row?.score?.fulltime?.away ?? row?.goals?.away;
  if(!Number.isFinite(Number(h)) || !Number.isFinite(Number(a))) return {state:'PENDING'};
  const winner=Number(h)>Number(a)?'HOME':Number(h)<Number(a)?'AWAY':'DRAW';
  return {state:'FINAL',winner,home:Number(h),away:Number(a)};
}

function settle(snapshot,result){
  if(!snapshot || !validSelection(snapshot.selection)) return {outcome:'NO PREDICTION',pl:null};
  if(result.state==='VOID') return {outcome:'VOID',pl:0};
  if(result.state!=='FINAL') return {outcome:'PENDING',pl:null};
  const win=String(snapshot.selection).toUpperCase()===result.winner;
  const odds=Number(snapshot.odds);
  return {outcome:win?'WIN':'LOSS',pl:win && odds>1?Number((odds-1).toFixed(2)):-1};
}

async function fetchFixtures(date){
  const key=process.env.API_FOOTBALL_KEY;
  if(!key) throw new Error('API_FOOTBALL_KEY is not configured');
  const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent(TZ)}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});
  if(!r.ok) throw new Error(`API-Football HTTP ${r.status}`);
  const data=await r.json();
  if(data?.errors && Object.keys(data.errors).length) throw new Error(`API-Football: ${JSON.stringify(data.errors)}`);
  return data.response||[];
}

function buildSummary(rows){
  const predicted=rows.filter(r=>r.prediction).length;
  const settled=rows.filter(r=>['WIN','LOSS'].includes(r.outcome)).length;
  const wins=rows.filter(r=>r.outcome==='WIN').length;
  const losses=rows.filter(r=>r.outcome==='LOSS').length;
  const voids=rows.filter(r=>r.outcome==='VOID').length;
  const pending=rows.filter(r=>r.outcome==='PENDING').length;
  const actionable=rows.filter(r=>r.prediction && isActionableClass(r.prediction.classification));
  const actionableSettled=actionable.filter(r=>['WIN','LOSS'].includes(r.outcome));
  const actionableWins=actionableSettled.filter(r=>r.outcome==='WIN').length;
  const actionablePL=actionable.reduce((s,r)=>s+(Number.isFinite(Number(r.pl))?Number(r.pl):0),0);
  return {
    matches:rows.length,predicted,settled,wins,losses,voids,pending,
    hitRate:settled?Number((wins/settled*100).toFixed(1)):null,
    actionableBets:actionable.length,
    actionableSettled:actionableSettled.length,
    actionableWins,
    actionableLosses:actionableSettled.length-actionableWins,
    actionableHitRate:actionableSettled.length?Number((actionableWins/actionableSettled.length*100).toFixed(1)):null,
    flatStakePL:Number(actionablePL.toFixed(2)),
    roi:actionableSettled.length?Number((actionablePL/actionableSettled.length*100).toFixed(1)):null
  };
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!storageReady()) return res.status(503).json({error:'Prediction archive storage is not configured'});
  const secret=process.env.REPORT_CRON_SECRET;
  if(secret && req.headers.authorization!==`Bearer ${secret}`) return res.status(401).json({error:'Unauthorized'});

  const date=String(req.query?.date||dateInBrussels());
  const existing=await readJson(`argus/reports/${date}.json`,null);
  if(existing && req.query?.force!=='1') return res.status(200).json({...existing,idempotent:true});

  const [fixtures,predictionStore]=await Promise.all([
    fetchFixtures(date),
    readJson(`argus/predictions/${date}.json`,{date,fixtures:{}})
  ]);
  const byId=new Map(fixtures.map(f=>[String(f.fixture?.id),f]));
  const ids=new Set([...byId.keys(),...Object.keys(predictionStore.fixtures||{})]);
  const rows=[];

  for(const id of ids){
    const fixture=byId.get(id);
    const stored=predictionStore.fixtures?.[id]||null;
    const prediction=pickSnapshot(stored);
    const result=fixture?outcomeFromFixture(fixture):{state:'PENDING'};
    const settlement=settle(prediction,result);
    rows.push({
      fixtureId:Number(id),
      competition:fixture?.league?.name||stored?.competition||null,
      country:fixture?.league?.country||stored?.country||null,
      home:fixture?.teams?.home?.name||stored?.home||null,
      away:fixture?.teams?.away?.name||stored?.away||null,
      kickoff:fixture?.fixture?.date||stored?.kickoff||null,
      finalStatus:fixture?.fixture?.status?.short||null,
      finalScore:result.state==='FINAL'?{home:result.home,away:result.away}:null,
      prediction,
      snapshotCount:stored?.snapshots?.length||0,
      outcome:settlement.outcome,
      pl:settlement.pl
    });
  }
  rows.sort((a,b)=>new Date(a.kickoff||0)-new Date(b.kickoff||0));
  const report={
    date,timezone:TZ,generatedAt:new Date().toISOString(),
    integrity:'NO HINDSIGHT — report evaluates snapshots stored before settlement.',
    methodology:'Final pre-match snapshot is evaluated first; if absent, latest live snapshot is used.',
    summary:buildSummary(rows),
    matches:rows
  };
  await writeJson(`argus/reports/${date}.json`,report);
  return res.status(200).json(report);
}
