import assert from 'node:assert/strict';
import { fair1x2, marketFairForKey } from '../api/_market-devig.js';
import { scoreChallenger } from '../api/_challenger-validation.js';

const match={
  markets:{home:2.05,draw:3.55,away:3.9},
  marketOdds:{
    doubleChance1X:1.28,doubleChance12:1.31,doubleChanceX2:1.72,
    over15:1.31,under15:3.45,
    over25:1.90,under25:1.95,
    over35:2.72,under35:1.45,
    bttsYes:1.82,bttsNo:1.98,
    homeOver05:1.27,homeUnder05:3.70,
    awayOver05:1.48,awayUnder05:2.62,
    exactScores:{'1-1':6.8}
  }
};

// 1) 1X2 overround is removed and the fair simplex sums to exactly one.
const one=fair1x2(match);
assert.ok(one&&one.overround>0);
assert.ok(Math.abs(one.home+one.draw+one.away-1)<1e-12);
for(const key of ['home','draw','away']){
  const x=marketFairForKey(match,key);
  assert.equal(x.method,'DEVIG_1X2_NORMALIZED');
  assert.ok(x.fair>0&&x.fair<1);
  assert.notEqual(Number(x.fair.toFixed(8)),Number(x.rawImplied.toFixed(8)),'de-vigged probability must not silently equal raw inverse odds in an overround market');
}

// 2) Binary paired markets are normalized together, not treated as two independent 1/odds probabilities.
for(const [a,b] of [['over15','under15'],['over25','under25'],['over35','under35'],['bttsYes','bttsNo'],['homeOver05','homeUnder05'],['awayOver05','awayUnder05']]){
  const x=marketFairForKey(match,a),y=marketFairForKey(match,b);
  assert.equal(x.method,'DEVIG_BINARY_PAIR_NORMALIZED');
  assert.equal(y.method,'DEVIG_BINARY_PAIR_NORMALIZED');
  assert.ok(Math.abs(x.fair+y.fair-1)<1e-12,`${a}/${b} fair probabilities must sum to one`);
  assert.ok(x.overround>0&&y.overround>0);
}

// 3) Double chance is derived from the normalized 1X2 simplex, never from its standalone quoted inverse odds.
const dc=marketFairForKey(match,'doubleChance1X');
assert.equal(dc.method,'DERIVED_FROM_DEVIG_1X2');
assert.ok(Math.abs(dc.fair-(one.home+one.draw))<1e-12);
assert.ok(Math.abs(dc.fair-dc.rawImplied)>1e-4);

// 4) An unpaired exact-score quote is explicitly raw break-even only and cannot masquerade as fair market evidence.
const exact=marketFairForKey(match,'score:1-1');
assert.equal(exact.method,'UNPAIRED_RAW_BREAK_EVEN');
assert.equal(exact.fair,null);
assert.ok(exact.rawImplied>0);

// 5) MARKET_BLEND must be a no-op when a legacy row has odds but no explicitly de-vigged fair probability.
const legacy=[{_fixtureKey:'legacy-1',fixtureId:1,probability:.80,marketImpliedProbability:null,odds:2,outcome:'LOSS',clv:1}];
const baseline=scoreChallenger(legacy),blend=scoreChallenger(legacy,{id:'MARKET_24',type:'MARKET_BLEND',marketWeight:.24});
assert.equal(blend.marketFairSamples,0);
assert.equal(blend.brier,baseline.brier,'raw inverse odds must not be used as a calibration target');

// 6) MARKET_BLEND may use explicitly fair market evidence and reports its coverage.
const fairRows=[{_fixtureKey:'fair-1',fixtureId:2,probability:.80,marketImpliedProbability:.55,odds:2,outcome:'LOSS',clv:1}];
const fairBlend=scoreChallenger(fairRows,{id:'MARKET_24',type:'MARKET_BLEND',marketWeight:.24});
assert.equal(fairBlend.marketFairSamples,1);
assert.equal(fairBlend.marketFairFixtures,1);
assert.ok(fairBlend.brier<scoreChallenger(fairRows).brier);

console.log('shadow market de-vig regression: PASS');
