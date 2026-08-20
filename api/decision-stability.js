import { readJson, storageReady } from './_report-store.js';

const LIFE='argus/autopilot/opportunity-lifecycle.json';
const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
function verdictRank(v){const x=String(v||'NO BET').toUpperCase();return x==='PRIME'?3:x==='VALUE'?2:x==='WATCH'?1:0}
function analyze(f={}){
  const events=Array.isArray(f.events)?f.events:[], recent=events.slice(-16);
  let verdictChanges=0, actionabilityFlips=0, selectionChanges=0, reversals=0, upgrades=0, downgrades=0;
  let lastDirection=0;
  for(const e of recent){
    const a=e?.from||{},b=e?.to||{};
    if(a.verdict&&b.verdict&&a.verdict!==b.verdict){
      verdictChanges++;
      const d=verdictRank(b.verdict)-verdictRank(a.verdict);
      if(d>0)upgrades++; if(d<0)downgrades++;
      const dir=Math.sign(d); if(lastDirection&&dir&&dir!==lastDirection)reversals++; if(dir)lastDirection=dir;
    }
    if(typeof a.eligible==='boolean'&&typeof b.eligible==='boolean'&&a.eligible!==b.eligible)actionabilityFlips++;
    if(a.selection&&b.selection&&a.selection!==b.selection)selectionChanges++;
  }
  const transitions=Math.max(0,recent.length-1), changeRate=transitions?verdictChanges/transitions:0;
  let score=100;
  score-=Math.min(36,verdictChanges*7);
  score-=Math.min(24,actionabilityFlips*8);
  score-=Math.min(24,selectionChanges*12);
  score-=Math.min(20,reversals*8);
  score=Math.max(0,Math.round(score));
  let status='STABLE',penalty=0,hardBlock=false;
  if(recent.length<4){status='LEARNING'}
  else if(score<35||selectionChanges>=2||actionabilityFlips>=4){status='CHAOTIC';penalty=10;hardBlock=true}
  else if(score<55||reversals>=2||verdictChanges>=5){status='UNSTABLE';penalty=7}
  else if(score<75||verdictChanges>=3||actionabilityFlips>=2){status='OSCILLATING';penalty=4}
  else if(verdictChanges>=1){status='MOSTLY_STABLE';penalty=1}
  return{score,status,penalty,hardBlock,sampleEvents:recent.length,verdictChanges,actionabilityFlips,selectionChanges,reversals,upgrades,downgrades,changeRate:Number((changeRate*100).toFixed(1)),reason:status==='CHAOTIC'?'Repeated decision reversals or selection instability':status==='UNSTABLE'?'Signal changed materially several times':status==='OSCILLATING'?'Signal shows repeated pre-kickoff oscillation':status==='MOSTLY_STABLE'?'Minor decision changes detected':status==='LEARNING'?'Not enough lifecycle transitions yet':'Signal has remained stable across recent transitions'}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!storageReady())return res.status(503).json({error:'Decision stability storage unavailable'});
  if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const state=await readJson(LIFE,{fixtures:{}}), ids=req.method==='POST'?(Array.isArray(req.body?.matches)?req.body.matches.map(x=>String(x.id||x.fixtureId)).filter(Boolean):[]):[];
  const source=state.fixtures||{}, stability={};
  const entries=ids.length?ids.map(id=>[id,source[id]]):Object.entries(source);
  for(const [id,f] of entries){if(!f)continue;stability[id]={fixtureId:Number(id),home:f.home||null,away:f.away||null,kickoff:f.kickoff||null,...analyze(f)}}
  const vals=Object.values(stability);
  return res.status(200).json({ok:true,version:'DECISION-STABILITY-1',generatedAt:new Date().toISOString(),summary:{fixtures:vals.length,stable:vals.filter(x=>x.status==='STABLE').length,mostlyStable:vals.filter(x=>x.status==='MOSTLY_STABLE').length,oscillating:vals.filter(x=>x.status==='OSCILLATING').length,unstable:vals.filter(x=>x.status==='UNSTABLE').length,chaotic:vals.filter(x=>x.status==='CHAOTIC').length},stability,policy:{source:'OPPORTUNITY_LIFECYCLE',downgradeOnly:true,mayCreatePrime:false,mayIncreaseConfidence:false,chaoticMayHardBlock:true,maxPenalty:10,automaticBetPlacement:false,rule:'Decision instability is uncertainty evidence. Repeated oscillation may penalize or block; stability never promotes a verdict.'}})
}
