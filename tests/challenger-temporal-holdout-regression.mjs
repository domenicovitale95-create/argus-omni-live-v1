import assert from 'node:assert/strict';
import { evaluateChallengers, pairedFixtureBrier, temporalFixtureSplit } from '../api/_challenger-validation.js';

function row(fixtureId,time,outcome,overrides={}){
  return {
    _fixtureKey:String(fixtureId),
    _eventTime:time,
    fixtureId,
    probability:.80,
    marketImpliedProbability:.69,
    odds:1.45,
    clv:1.0,
    outcome,
    ...overrides
  };
}

// 1) Temporal split must keep a complete fixture on one side only.
const splitRows=[];
for(let fixture=1;fixture<=10;fixture++){
  const t=Date.UTC(2026,0,fixture);
  splitRows.push(row(fixture,t,'WIN'),row(fixture,t,'LOSS'));
}
splitRows.push({...row(999,0,'WIN'),_eventTime:null});
const split=temporalFixtureSplit(splitRows,.70);
assert.equal(split.trainFixtures,7);
assert.equal(split.holdoutFixtures,3);
assert.equal(split.invalidTemporalRows,1);
const trainIds=new Set(split.train.map(r=>r._fixtureKey));
const holdoutIds=new Set(split.holdout.map(r=>r._fixtureKey));
for(const id of trainIds)assert.equal(holdoutIds.has(id),false,`fixture ${id} leaked across temporal boundary`);
assert.ok(Math.max(...split.train.map(r=>r._eventTime))<Math.min(...split.holdout.map(r=>r._eventTime)),'train must be strictly older than holdout');

// 2) Adversarial regime shift: shrink/blend challengers improve the older block
// but degrade the later block. No candidate may be approved from in-sample strength.
const rows=[];
for(let fixture=1;fixture<=120;fixture++){
  const t=Date.UTC(2026,0,1)+fixture*86400000;
  const inTrain=fixture<=84; // 70% fixture boundary by construction.
  // Training observed rate ~=65%; holdout observed rate ~=90%.
  const win=inTrain?(fixture%20<13):(fixture%10!==0);
  for(let pick=0;pick<4;pick++)rows.push(row(fixture,t,win?'WIN':'LOSS'));
}
const evaluation=evaluateChallengers(rows);
assert.equal(evaluation.split.trainFixtures,84);
assert.equal(evaluation.split.holdoutFixtures,36);
assert.equal(evaluation.split.trainRows,336);
assert.equal(evaluation.split.holdoutRows,144);
assert.equal(evaluation.approved.length,0,'a train-only winner must never pass an adverse temporal holdout');
const trainWinner=evaluation.evaluations.find(x=>x.trainImprovementPct>=3);
assert.ok(trainWinner,'fixture should contain at least one challenger with material train improvement');
assert.ok(trainWinner.holdoutImprovementPct<0,'the constructed challenger should degrade on holdout');
assert.ok(trainWinner.blockers.includes('HOLDOUT_BRIER_GAIN_BELOW_FLOOR'));

// 3) Fixture-block bootstrap is deterministic and preserves within-fixture dependence.
const c={id:'SHRINK_86',type:'SHRINK',shrink:.86};
const ci1=pairedFixtureBrier(evaluation.split.holdoutRows?temporalFixtureSplit(rows,.70).holdout:[],c,300);
const ci2=pairedFixtureBrier(temporalFixtureSplit(rows,.70).holdout,c,300);
assert.deepEqual(ci1,ci2,'bootstrap must be deterministic for auditable CI output');
assert.equal(ci1.fixtures,36);
assert.ok(ci1.meanDelta>0,'positive candidate-minus-baseline Brier delta means degradation');

// 4) Candidate ordering must be based on train only. Holdout is pass/fail, never a re-ranking signal.
for(let i=1;i<evaluation.evaluations.length;i++){
  const prev=evaluation.evaluations[i-1].train.brier??Infinity;
  const cur=evaluation.evaluations[i].train.brier??Infinity;
  assert.ok(prev<=cur,'candidate list must remain train-ranked');
}

console.log('challenger temporal holdout regression: PASS');
