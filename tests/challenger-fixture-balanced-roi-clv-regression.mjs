import assert from 'node:assert/strict';
import { CHALLENGER_VALIDATION_POLICY, evaluateChallengers } from '../api/_challenger-validation.js';

function row(fixtureId,time,outcome,clv){
  return {
    _fixtureKey:String(fixtureId),
    _eventTime:time,
    fixtureId,
    probability:.80,
    marketImpliedProbability:null,
    odds:2.00,
    clv,
    outcome
  };
}

assert.equal(CHALLENGER_VALIDATION_POLICY.version,'CHALLENGER-VALIDATION-6');

const rows=[];
for(let fixture=1;fixture<=120;fixture++){
  const time=Date.UTC(2026,0,1)+fixture*86400000;
  if(fixture<=84){
    // Stable training block: shrinkage improves an overconfident losing forecast.
    for(let i=0;i<3;i++)rows.push(row(fixture,time,'LOSS',-1));
  }else if(fixture===85){
    // One holdout fixture emits an unrealistic density of correlated winning markets.
    // This single match is intentionally capable of making raw ROI and raw CLV positive.
    for(let i=0;i<150;i++)rows.push(row(fixture,time,'WIN',2));
  }else{
    // The other 35 independent holdout fixtures are all negative.
    for(let i=0;i<3;i++)rows.push(row(fixture,time,'LOSS',-1));
  }
}

const validation=evaluateChallengers(rows);
assert.equal(validation.split.trainFixtures,84);
assert.equal(validation.split.holdoutFixtures,36);
assert.ok(validation.split.holdoutRows>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutSample);

const shrink=validation.evaluations.find(x=>x.id==='SHRINK_86');
assert.ok(shrink,'expected SHRINK_86 challenger');

// All conventional volume and diversity gates are satisfied.
assert.ok(shrink.holdout.simulatedBets>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutSimulatedBets);
assert.ok(shrink.holdout.simulatedBetFixtures>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutSimulatedBetFixtures);
assert.ok(shrink.holdout.clvSamples>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutClvSamples);
assert.ok(shrink.holdout.clvFixtures>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutClvFixtures);
assert.ok(shrink.trainImprovementPct>=CHALLENGER_VALIDATION_POLICY.minimumBrierImprovementPct);
assert.ok(shrink.holdoutImprovementPct>=CHALLENGER_VALIDATION_POLICY.minimumBrierImprovementPct);
assert.ok(shrink.holdoutBrierCI.upper95<0,'fixture bootstrap should confirm Brier improvement');

// Raw pick-level economics are positive only because fixture 85 emitted 150 correlated picks.
assert.ok(shrink.holdout.roi>0,'raw ROI should be inflated positive by the high-density fixture');
assert.ok(shrink.holdout.avgCLV>0,'raw CLV should be inflated positive by the high-density fixture');
assert.equal(shrink.blockers.includes('HOLDOUT_ROI_NOT_POSITIVE'),false);
assert.equal(shrink.blockers.includes('HOLDOUT_CLV_NOT_POSITIVE'),false);

// Equal fixture weighting reveals that most independent matches are negative.
assert.ok(shrink.holdout.fixtureBalancedRoi<0,'fixture-balanced ROI must expose the negative independent-match evidence');
assert.ok(shrink.holdout.fixtureBalancedAvgCLV<0,'fixture-balanced CLV must expose the negative independent-match evidence');
assert.ok(shrink.blockers.includes('HOLDOUT_FIXTURE_BALANCED_ROI_NOT_POSITIVE'));
assert.ok(shrink.blockers.includes('HOLDOUT_FIXTURE_BALANCED_CLV_NOT_POSITIVE'));
assert.notEqual(shrink.status,'VALIDATED_HOLDOUT','pick-density inflation must never validate a challenger');

console.log('challenger fixture-balanced ROI/CLV regression: PASS');
