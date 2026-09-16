import assert from 'node:assert/strict';
import { fair1x2, fairExactScores, marketFairForKey } from '../api/_market-devig.js';
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

// 4) A sparse exact-score quote must fail closed: raw break-even is visible, but it cannot masquerade as fair evidence.
const incomplete=marketFairForKey(match,'score:1-1');
assert.equal(incomplete.method,'INCOMPLETE_EXACT_SCORE_BOOK_RAW_BREAK_EVEN');
assert.equal(incomplete.fair,null);
assert.ok(incomplete.rawImplied>0);
assert.equal(fairExactScores(match),null);

// 5) A sufficiently complete exact-score book may be normalized as one mutually-exclusive market.
const completeScores={
  '0-0':12,'1-0':12,'0-1':12,'1-1':12,'2-0':12,'0-2':12,'2-1':12,'1-2':12,'2-2':12,
  '3-0':12,'0-3':12,'3-1':12,'1-3':12,'3-2':12,'2-3':12
};
const complete={marketOdds:{exactScores:completeScores}},exactBook=fairExactScores(complete);
assert.ok(exactBook);
assert.equal(exactBook.method,'DEVIG_EXACT_SCORE_NORMALIZED');
assert.equal(exactBook.outcomes,15);
assert.ok(exactBook.overround>0);
assert.ok(Math.abs(Object.values(exactBook.fair).reduce((a,b)=>a+b,0)-1)<1e-12);
const exact=marketFairForKey(complete,'score:1-1');
assert.equal(exact.method,'DEVIG_EXACT_SCORE_NORMALIZED');
assert.equal(exact.marketOutcomes,15);
assert.ok(exact.fair>0&&exact.fair<exact.rawImplied,'normalizing positive overround must lower each fair probability versus raw inverse odds');

// 6) Apparent score coverage with sub-100% implied mass is still incomplete and must not be normalized upward.
const underMass={marketOdds:{exactScores:Object.fromEntries(Object.keys(completeScores).map(k=>[k,25]))}};
assert.equal(fairExactScores(underMass),null);
const underMassPick=marketFairForKey(underMass,'score:1-1');
assert.equal(underMassPick.method,'INCOMPLETE_EXACT_SCORE_BOOK_RAW_BREAK_EVEN');
assert.equal(underMassPick.fair,null);

// 7) MARKET_BLEND must be a no-op when a legacy row has odds but no explicitly de-vigged fair probability.
const legacy=[{_fixtureKey:'legacy-1',fixtureId:1,probability:.80,marketImpliedProbability:null,odds:2,outcome:'LOSS',clv:1}];
const baseline=scoreChallenger(legacy),blend=scoreChallenger(legacy,{id:'MARKET_24',type:'MARKET_BLEND',marketWeight:.24});
assert.equal(blend.marketFairSamples,0);
assert.equal(blend.brier,baseline.brier,'raw inverse odds must not be used as a calibration target');

// 8) MARKET_BLEND may use explicitly fair market evidence and reports its coverage.
const fairRows=[{_fixtureKey:'fair-1',fixtureId:2,probability:.80,marketImpliedProbability:.55,odds:2,outcome:'LOSS',clv:1}];
const fairBlend=scoreChallenger(fairRows,{id:'MARKET_24',type:'MARKET_BLEND',marketWeight:.24});
assert.equal(fairBlend.marketFairSamples,1);
assert.equal(fairBlend.marketFairFixtures,1);
assert.ok(fairBlend.brier<scoreChallenger(fairRows).brier);

console.log('shadow market de-vig regression: PASS');
