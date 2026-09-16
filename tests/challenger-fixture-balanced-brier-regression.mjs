import assert from 'node:assert/strict';
import { CHALLENGER_VALIDATION_POLICY, pairedFixtureBrier, scoreChallenger } from '../api/_challenger-validation.js';

function row(fixtureId,outcome,probability){
  return {
    _fixtureKey:String(fixtureId),
    fixtureId,
    probability,
    marketImpliedProbability:null,
    odds:null,
    clv:null,
    outcome
  };
}

assert.equal(CHALLENGER_VALIDATION_POLICY.version,'CHALLENGER-VALIDATION-6');

// One fixture emits many correlated markets and is badly wrong. Twenty other fixtures
// emit one pick each and are extremely accurate. A raw pick mean lets the high-volume
// fixture dominate; a fixture-balanced mean gives every football match equal weight.
const rows=[];
for(let i=0;i<50;i++)rows.push(row(1,'LOSS',.90));
for(let fixture=2;fixture<=21;fixture++)rows.push(row(fixture,'WIN',.99));

const baseline=scoreChallenger(rows);
const challenger={id:'SHRINK_86',type:'SHRINK',shrink:.86};
const shrink=scoreChallenger(rows,challenger);

assert.equal(baseline.fixtures,21);
assert.equal(baseline.sample,70);
assert.equal(baseline.brierWeighting,'FIXTURE_BALANCED_MEAN_OF_FIXTURE_MEANS');
assert.equal(shrink.brierWeighting,'FIXTURE_BALANCED_MEAN_OF_FIXTURE_MEANS');

// Pick-weighting says shrinkage improved because the one 50-pick fixture dominates.
assert.ok(shrink.rawPickBrier<baseline.rawPickBrier,'raw pick weighting should be fooled by the high-volume fixture');

// Fixture weighting correctly says the challenger is worse across independent matches.
assert.ok(shrink.brier>baseline.brier,'fixture-balanced Brier must prevent one multi-market fixture from dominating');

// The primary score must now estimate the same fixture-balanced quantity used by the
// paired fixture bootstrap, apart from presentation rounding.
const paired=pairedFixtureBrier(rows,challenger,0);
assert.equal(paired.fixtures,21);
assert.ok(paired.meanDelta>0,'positive candidate-minus-baseline delta means the challenger is worse');
assert.ok(Math.abs((shrink.brier-baseline.brier)-paired.meanDelta)<1e-5,'primary Brier delta and fixture-bootstrap mean delta must align');

console.log('challenger fixture-balanced Brier regression: PASS');
