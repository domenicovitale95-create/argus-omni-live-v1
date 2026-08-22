import { readJson, listJson, readManyJson, storageReady } from './_report-store.js';

const PLAN='argus/autopilot/decision-plan.json';
const RESOURCE='argus/autopilot/resource-policy.json';
const SKILL='argus/learning/skill-map.json';
const WALK='argus/research/historical-walk-forward.json';
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const ts=v=>{const x=new Date(v||0).getTime();return Number.isFinite(x)?x:0};
const mins=v=>{const x=ts(v);return x?Math.round((x-Date.now())/60000):999999};

function constrained(resource={}){
  const mode=String(resource.mode||resource.quotaMode||'UNKNOWN').toUpperCase();
  return ['HALT','EXHAUSTED','EMERGENCY','SAFE','CONSERVE'].includes(mode);
}
function modePenalty(resource={}){
  const mode=String(resource.mode||resource.quotaMode||'UNKNOWN').toUpperCase();
  return ({HALT:70,EXHAUSTED:70,EMERGENCY:60,SAFE:45,CONSERVE:25,NORMAL:0,EXPAND:0})[mode]??10;
}
function prematchCandidate(row){
  const ko=mins(row.kickoff),urgency=ko>=0&&ko<=60?25:ko<=360?15:ko<=1440?8:2;
  const unresolved=row.finalVerdict==='WATCH'||row.finalVerdict==='NO BET'||!row.finalVerdict?12:4;
  const score=clamp((Number(row.score)||20)*.65+urgency+unresolved);
  return{population:'FUTURE_PREMATCH',kind:'REVIEW_PREMATCH',fixtureId:row.fixtureId,competition:row.competition||null,kickoff:row.kickoff||null,priorityScore:Number(score.toFixed(1)),providerDependent:false,reason:`existing decision score ${Number(row.score)||0}; kickoff ${ko}m; verdict ${row.finalVerdict||'UNSET'}`};
}
function liveCandidate(row,resource){
  const base=(Number(row.score)||30)*.7+20,penalty=modePenalty(resource),score=clamp(base-penalty);
  return{population:'LIVE',kind:'LIVE_VALUE_OF_INFORMATION',fixtureId:row.fixtureId,competition:row.competition||null,kickoff:row.kickoff||null,priorityScore:Number(score.toFixed(1)),providerDependent:true,reason:`live candidate; resource penalty ${penalty}; existing decision score ${Number(row.score)||0}`};
}
function settledCandidate(books=[],skill={}){
  const rows=books.flatMap(b=>b?.records||[]),settled=rows.filter(r=>['WIN','LOSS','VOID'].includes(r?.settlement?.status));
  const newest=Math.max(0,...settled.map(r=>ts(r?.settlement?.settledAt))),learnedAt=ts(skill?.generatedAt),newSinceLearning=settled.filter(r=>ts(r?.settlement?.settledAt)>learnedAt).length;
  if(!settled.length)return null;
  const freshness=newest?Math.max(0,36-(Date.now()-newest)/3600000):0,score=clamp(38+Math.min(35,newSinceLearning*5)+Math.min(20,freshness));
  return{population:'SETTLED',kind:'SETTLEMENT_LEARNING',priorityScore:Number(score.toFixed(1)),providerDependent:false,evidence:{settled: settled.length,newSinceLearning,newestSettlementAt:newest?new Date(newest).toISOString():null,skillMapGeneratedAt:skill?.generatedAt||null},reason:newSinceLearning?`${newSinceLearning} settled records newer than current skill-map evidence`:'settled evidence exists; no clearly newer settlement than skill map'};
}
function historicalCandidate(walk={},resource={}){
  const status=String(walk.status||'READY').toUpperCase();
  if(status==='PAUSED_MEMORY_GUARD')return{population:'HISTORICAL',kind:'HISTORICAL_SHARDING',priorityScore:82,providerDependent:false,evidence:{status,fixtureCount:walk.fixtureCount??null,archiveSizeBytes:walk.archiveSizeBytes??null},reason:'historical replay is memory-guarded; sharding is higher value than forcing replay'};
  if(status==='INSUFFICIENT_HISTORY')return{population:'HISTORICAL',kind:'HISTORICAL_EVIDENCE_GAP',priorityScore:42,providerDependent:false,evidence:{status,fixtureCount:walk.fixtureCount??null,minimum:walk.minimum??null},reason:'historical sample is below walk-forward minimum; do not fabricate evidence'};
  const ageHours=walk.generatedAt?Math.max(0,(Date.now()-ts(walk.generatedAt))/3600000):999,boost=constrained(resource)?20:0,score=clamp(45+Math.min(25,ageHours/6)+boost);
  return{population:'HISTORICAL',kind:'WALK_FORWARD_REVIEW',priorityScore:Number(score.toFixed(1)),providerDependent:false,evidence:{status:status||'UNKNOWN',fixtureCount:walk.fixtureCount??null,generatedAt:walk.generatedAt||null},reason:`stored historical validation available; ${constrained(resource)?'provider constrained so offline evidence receives boost':'provider normal'}`};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Match-Universe storage unavailable'});
  const [planDoc,resource,skill,walk,ledgerBlobs]=await Promise.all([
    readJson(PLAN,{plan:[],generatedAt:null}),
    readJson(RESOURCE,{}),
    readJson(SKILL,{}),
    readJson(WALK,{}),
    listJson('argus/ledger/',30)
  ]);
  const books=await readManyJson(ledgerBlobs),plan=Array.isArray(planDoc?.plan)?planDoc.plan:[];
  const future=plan.filter(x=>!x?.isLive&&x?.tier!=='ARCHIVE'&&mins(x?.kickoff)>0),live=plan.filter(x=>x?.isLive&&x?.tier!=='ARCHIVE');
  const finished=books.flatMap(b=>b?.records||[]).filter(r=>['WIN','LOSS','VOID'].includes(r?.settlement?.status));
  const candidates=[];
  for(const row of future.slice().sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).slice(0,12))candidates.push(prematchCandidate(row));
  for(const row of live.slice().sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).slice(0,8))candidates.push(liveCandidate(row,resource));
  const settled=settledCandidate(books,skill);if(settled)candidates.push(settled);
  const historical=historicalCandidate(walk,resource);if(historical)candidates.push(historical);
  candidates.sort((a,b)=>b.priorityScore-a.priorityScore);
  const next=candidates[0]||null;
  return res.status(200).json({
    version:'MATCH-UNIVERSE-SCHEDULER-1',generatedAt:new Date().toISOString(),readOnly:true,providerCalls:0,
    doctrine:{liveIsSensorNotBrain:true,fourPopulations:true,fastLearningSlowTrust:true,noPrimeCreation:true,noModelPromotion:true,noFrozenPredictionRewrite:true},
    resource:{mode:resource.mode||null,quotaMode:resource.quotaMode||null,providerConstrained:constrained(resource)},
    populations:{futurePrematch:{count:future.length},live:{count:live.length},settled:{count:finished.length,ledgerDaysRead:books.length},historical:{fixtureCount:walk.fixtureCount??null,status:walk.status||null}},
    candidates,nextBestAction:next,
    scoring:{type:'transparent heuristic v1',principle:'Expected learning/decision value adjusted by urgency and resource cost. Existing ARGUS scores are reused; missing evidence is not invented.'},
    boundaries:{decisionSchedulerReused:true,doesNotReplaceDecisionScheduler:true,providerFree:true,readOnly:true,mayChangeVerdict:false,mayChangeStake:false,mayPromote:false}
  });
}
