import assert from 'node:assert/strict';
import { CHALLENGER_VALIDATION_POLICY, evaluateChallengers, scoreChallenger } from '../api/_challenger-validation.js';

function row(fixtureId,time,overrides={}){
  return {
    _fixtureKey:String(fixtureId),
    _eventTime:time,
    fixtureId,
    probability:.80,
    marketImpliedProbability:null,
    odds:1.10,
    clv:null,
    outcome:fixtureId%5===0?'LOSS':'WIN',
    ...overrides
  };
}

assert.equal(CHALLENGER_VALIDATION_POLICY.version,'CHALLENGER-VALIDATION-6');
assert.ok(CHALLENGER_VALIDATION_POLICY.minimumTrainMarketFairFixtures>0);
assert.ok(CHALLENGER_VALIDATION_POLICY.minimumHoldoutMarketFairFixtures>0);
assert.ok(CHALLENGER_VALIDATION_POLICY.minimumHoldoutSimulatedBetFixtures>0);
assert.ok(CHALLENGER_VALIDATION_POLICY.minimumHoldoutClvFixtures>0);

// Build 120 chronologically ordered fixtures. Row-count thresholds are deliberately met,
// while fair-market / simulated-bet / CLV evidence is concentrated in too few fixtures.
const rows=[];
for(let fixture=1;fixture<=120;fixture++){
  const time=Date.UTC(2026,0,1)+fixture*86400000;
  for(let i=0;i<3;i++)rows.push(row(fixture,time));

  // 108 train fair samples across only 6 fixtures; 72 holdout fair samples across only 4 fixtures.
  const fairFixture=fixture<=6||(fixture>=85&&fixture<=88);
  if(fairFixture){
    for(let i=0;i<18;i++)rows.push(row(fixture,time,{marketImpliedProbability:.69,odds:1.10}));
  }

  // 24 holdout simulated bets with CLV across only 6 fixtures.
  if(fixture>=85&&fixture<=90){
    for(let i=0;i<4;i++)rows.push(row(fixture,time,{odds:2.00,clv:1.25}));
  }
}

const all=scoreChallenger(rows,{id:'SHRINK_86',type:'SHRINK',shrink:.86});
assert.equal(all.marketFairSamples,180);
assert.equal(all.marketFairFixtures,10,'fair-market row volume must expose its fixture concentration');
assert.equal(all.simulatedBets,24);
assert.equal(all.simulatedBetFixtures,6,'many correlated bets from one match must count as one evidence fixture');
assert.equal(all.clvSamples,24);
assert.equal(all.clvFixtures,6,'many CLV rows from one match must count as one evidence fixture');

const validation=evaluateChallengers(rows);
assert.equal(validation.split.trainFixtures,84);
assert.equal(validation.split.holdoutFixtures,36);
assert.ok(validation.split.trainRows>=CHALLENGER_VALIDATION_POLICY.minimumTrainSample);
assert.ok(validation.split.holdoutRows>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutSample);

const market=validation.evaluations.find(x=>x.id==='MARKET_8');
assert.ok(market,'expected market-blend challenger');
assert.ok(market.train.marketFairSamples>=CHALLENGER_VALIDATION_POLICY.minimumTrainMarketFairSamples);
assert.ok(market.holdout.marketFairSamples>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutMarketFairSamples);
assert.equal(market.blockers.includes('TRAIN_FAIR_MARKET_SAMPLE_INSUFFICIENT'),false,'row-count fair-market gate should already pass');
assert.equal(market.blockers.includes('HOLDOUT_FAIR_MARKET_SAMPLE_INSUFFICIENT'),false,'row-count fair-market gate should already pass');
assert.ok(market.blockers.includes('TRAIN_FAIR_MARKET_FIXTURES_INSUFFICIENT'),'concentrated train fair-market evidence must be blocked');
assert.ok(market.blockers.includes('HOLDOUT_FAIR_MARKET_FIXTURES_INSUFFICIENT'),'concentrated holdout fair-market evidence must be blocked');

const shrink=validation.evaluations.find(x=>x.id==='SHRINK_86');
assert.ok(shrink,'expected shrink challenger');
assert.ok(shrink.holdout.simulatedBets>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutSimulatedBets);
assert.ok(shrink.holdout.clvSamples>=CHALLENGER_VALIDATION_POLICY.minimumHoldoutClvSamples);
assert.equal(shrink.blockers.includes('HOLDOUT_BET_SAMPLE_INSUFFICIENT'),false,'raw bet count should already pass');
assert.equal(shrink.blockers.includes('HOLDOUT_CLV_SAMPLE_INSUFFICIENT'),false,'raw CLV count should already pass');
assert.ok(shrink.blockers.includes('HOLDOUT_BET_FIXTURES_INSUFFICIENT'),'correlated bet rows must not satisfy fixture-independence gate');
assert.ok(shrink.blockers.includes('HOLDOUT_CLV_FIXTURES_INSUFFICIENT'),'correlated CLV rows must not satisfy fixture-independence gate');

assert.equal(validation.approved.length,0,'fixture-concentrated evidence must never produce an approved challenger');

console.log('challenger fixture evidence gates regression: PASS');
