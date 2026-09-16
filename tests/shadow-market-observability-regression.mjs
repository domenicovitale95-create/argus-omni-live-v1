import assert from 'node:assert/strict';
import { buildShadowMarketObservability, shadowMarketFamily } from '../api/_shadow-market-observability.js';

assert.equal(shadowMarketFamily('home'),'RESULT_1X2');
assert.equal(shadowMarketFamily('doubleChanceX2'),'DOUBLE_CHANCE');
assert.equal(shadowMarketFamily('under35'),'TOTAL_GOALS');
assert.equal(shadowMarketFamily('bttsNo'),'BTTS');
assert.equal(shadowMarketFamily('awayUnder05'),'TEAM_GOALS');
assert.equal(shadowMarketFamily('score:2-1'),'EXACT_SCORE');
assert.equal(shadowMarketFamily('future-market'),'UNKNOWN');

const books=[{
  fixtures:{
    old:{freezeVersion:'SHADOW-FREEZE-4',picks:[
      {key:'over25',probability:.60,odds:1.90,outcome:'WIN',pl:.90,clv:2,modelIndependentOfPrice:true,marketImpliedProbability:.52,marketProbabilityMethod:'DEVIG_BINARY_PAIR_NORMALIZED'}
    ]},
    current:{freezeVersion:'SHADOW-FREEZE-5',picks:[
      {key:'under35',probability:.70,odds:1.50,outcome:'WIN',pl:.50,clv:1,modelIndependentOfPrice:true,marketImpliedProbability:.68,marketProbabilityMethod:'DEVIG_BINARY_PAIR_NORMALIZED'},
      {key:'awayUnder05',probability:.40,odds:2.30,outcome:'LOSS',pl:-1,clv:-2,modelIndependentOfPrice:true,marketImpliedProbability:.43,marketProbabilityMethod:'DEVIG_BINARY_PAIR_NORMALIZED'},
      {key:'bttsNo',probability:.55,odds:null,outcome:'WIN',pl:null,clv:null,modelIndependentOfPrice:true,marketImpliedProbability:null,marketProbabilityMethod:'MISSING_PRICE'}
    ]}
  }
}];

const x=buildShadowMarketObservability(books);
assert.equal(x.version,'SHADOW-MARKET-OBSERVABILITY-1');
assert.equal(x.policy.descriptiveOnly,true);
assert.equal(x.policy.productionAuthority,false);
assert.equal(x.policy.automaticPromotion,false);
assert.equal(x.policy.automaticRealWagering,false);

assert.equal(x.families.TOTAL_GOALS.sample,2);
assert.equal(x.families.TOTAL_GOALS.settled,2);
assert.equal(x.families.TOTAL_GOALS.wins,2);
assert.equal(x.families.TOTAL_GOALS.pnlSamples,2);
assert.equal(x.families.TOTAL_GOALS.flatStakePL,1.4);
assert.equal(x.families.TOTAL_GOALS.flatStakeRoiPct,70);
assert.equal(x.families.TOTAL_GOALS.calibrationSamples,2);
assert.equal(x.families.TOTAL_GOALS.meanPredictedPct,65);
assert.equal(x.families.TOTAL_GOALS.observedWinPct,100);
assert.equal(x.families.TOTAL_GOALS.calibrationGapPp,-35);
assert.equal(x.families.TOTAL_GOALS.deViggedFairSamples,2);

assert.equal(x.families.TEAM_GOALS.sample,1);
assert.equal(x.families.TEAM_GOALS.flatStakeRoiPct,-100);
assert.equal(x.families.BTTS.pnlSamples,0);
assert.equal(x.families.BTTS.flatStakeRoiPct,null,'unpriced settled picks must not silently dilute ROI denominator');
assert.equal(x.families.BTTS.brier,0.2025,'calibration remains measurable without an entry price');

assert.equal(x.cohorts['SHADOW-FREEZE-4'].sample,1);
assert.equal(x.cohorts['SHADOW-FREEZE-5'].sample,3);
assert.equal(x.cohorts['SHADOW-FREEZE-5'].families.TOTAL_GOALS.sample,1);
assert.equal(x.cohorts['SHADOW-FREEZE-5'].families.TEAM_GOALS.sample,1);
assert.equal(x.cohorts['SHADOW-FREEZE-5'].families.BTTS.sample,1);
assert.equal(x.cohorts['SHADOW-FREEZE-4'].families.TEAM_GOALS,undefined,'legacy cohorts must not be backfilled with new market families');

console.log('shadow market observability regression: PASS');
