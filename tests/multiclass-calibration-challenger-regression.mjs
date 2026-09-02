import assert from 'node:assert/strict';
import { evaluateMulticlassCalibration, transformProbability } from '../api/_multiclass-calibration-challenger.js';

function fixture(i,truth,p){
  const kickoff=new Date(Date.UTC(2026,0,1,12,0)+i*3600000),frozen=new Date(kickoff.getTime()-3600000),score=truth==='home'?{home:2,away:1}:truth==='draw'?{home:1,away:1}:{home:0,away:2};
  return{fixtureId:100000+i,kickoff:kickoff.toISOString(),frozenAt:frozen.toISOString(),finalScore:score,picks:['home','draw','away'].map(k=>({key:k,probability:p[k],probabilitySource:'ARGUS_PREMATCH_1X2',outcome:k===truth?'WIN':'LOSS',probabilityFrozenAt:frozen.toISOString()}))};
}
function book(fixtures){return{fixtures:Object.fromEntries(fixtures.map(f=>[String(f.fixtureId),f]))}}
function stableTruth(i){const x=i%10;return x<5?'home':x<7?'draw':'away'}

{
  const q=transformProbability({home:.2,draw:.55,away:.25},{temperature:1,priorShiftPower:1,priorRatio:{home:2.5,draw:.36,away:1.2}});
  assert.ok(Math.abs(q.home+q.draw+q.away-1)<1e-12);
  assert.ok(q.home>.2);
  assert.ok(q.draw<.55);
}

{
  const fixtures=[];for(let i=0;i<420;i++)fixtures.push(fixture(i,stableTruth(i),{home:.20,draw:.55,away:.25}));
  const r=evaluateMulticlassCalibration([book(fixtures)]);
  assert.equal(r.sample,420);
  assert.equal(r.split.outerTrain,294);
  assert.equal(r.split.outerHoldout,126);
  assert.equal(r.policy.holdoutUsedForSelection,false);
  assert.equal(r.policy.marketDataUsedForTraining,false);
  assert.equal(r.status,'RESEARCH_VALIDATED');
  assert.ok(r.holdout.brierImprovementPct>3);
  assert.ok(r.holdout.logLossImprovementPct>1);
  assert.ok(r.holdout.pairedBrierBootstrap.upper95<0);
  assert.ok(r.holdout.challenger.brier<r.holdout.baseline.brier);
}

{
  const fixtures=[];
  for(let i=0;i<420;i++){
    const truth=i<294?stableTruth(i):((i%10)<2?'home':(i%10)<7?'draw':'away');
    fixtures.push(fixture(i,truth,{home:.20,draw:.55,away:.25}));
  }
  const r=evaluateMulticlassCalibration([book(fixtures)]);
  assert.equal(r.sample,420);
  assert.equal(r.policy.holdoutUsedForSelection,false);
  assert.equal(r.status,'HOLD');
  assert.ok(r.blockers.length>0);
}

{
  const fixtures=[];for(let i=0;i<120;i++)fixtures.push(fixture(i,stableTruth(i),{home:.20,draw:.55,away:.25}));
  const r=evaluateMulticlassCalibration([book(fixtures)]);
  assert.equal(r.status,'INSUFFICIENT_EVIDENCE');
  assert.ok(r.blockers.includes('TOTAL_FIXTURES_INSUFFICIENT'));
}

console.log('multiclass calibration challenger regression: OK');
