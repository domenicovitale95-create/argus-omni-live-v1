import assert from 'node:assert/strict';
import { buildShadowMarketObservability, shadowMarketFamily, shadowOddsBand } from '../api/_shadow-market-observability.js';

assert.equal(shadowMarketFamily('home'),'RESULT_1X2');
assert.equal(shadowMarketFamily('doubleChanceX2'),'DOUBLE_CHANCE');
assert.equal(shadowMarketFamily('under35'),'TOTAL_GOALS');
assert.equal(shadowMarketFamily('bttsNo'),'BTTS');
assert.equal(shadowMarketFamily('awayUnder05'),'TEAM_GOALS');
assert.equal(shadowMarketFamily('score:2-1'),'EXACT_SCORE');
assert.equal(shadowMarketFamily('future-market'),'UNKNOWN');

assert.equal(shadowOddsBand(null),'UNPRICED');
assert.equal(shadowOddsBand(1.49),'ODDS_LT_1_50');
assert.equal(shadowOddsBand(1.50),'ODDS_1_50_1_99');
assert.equal(shadowOddsBand(1.99),'ODDS_1_50_1_99');
assert.equal(shadowOddsBand(2.00),'ODDS_2_00_2_99');
assert.equal(shadowOddsBand(3.00),'ODDS_3_00_4_99');
assert.equal(shadowOddsBand(5.00),'ODDS_GE_5_00');

const oldFixture={
  fixtureId:101,competition:'League A',kickoff:'2026-09-01T18:00:00Z',frozenAt:'2026-09-01T09:00:00Z',freezeVersion:'SHADOW-FREEZE-4',picks:[
    {key:'over25',probability:.60,probabilitySource:'HISTORY90D_POISSON',odds:1.90,outcome:'WIN',pl:.90,clv:2,entryPriceSource:'PREKICKOFF_FREEZE',modelIndependentOfPrice:true,marketImpliedProbability:.52,marketProbabilityMethod:'DEVIG_BINARY_PAIR_NORMALIZED'}
  ]
};
const currentFixture={
  fixtureId:102,competition:'League B',kickoff:'2026-09-02T18:00:00Z',frozenAt:'2026-09-02T09:00:00Z',freezeVersion:'SHADOW-FREEZE-5',picks:[
    {key:'under35',probability:.70,probabilitySource:'HISTORY90D_POISSON',odds:1.50,outcome:'WIN',pl:.50,clv:1,entryPriceSource:'PREKICKOFF_FREEZE',modelIndependentOfPrice:true,marketImpliedProbability:.68,marketProbabilityMethod:'DEVIG_BINARY_PAIR_NORMALIZED'},
    {key:'awayUnder05',probability:.40,probabilitySource:'HISTORY90D_POISSON',odds:2.30,outcome:'LOSS',pl:-1,clv:-2,entryPriceSource:'PREKICKOFF_LATE_BIND',modelIndependentOfPrice:true,marketImpliedProbability:.43,marketProbabilityMethod:'DEVIG_BINARY_PAIR_NORMALIZED'},
    {key:'bttsNo',probability:.55,probabilitySource:'HISTORY90D_POISSON',odds:null,outcome:'WIN',pl:null,clv:null,entryPriceSource:null,modelIndependentOfPrice:true,marketImpliedProbability:null,marketProbabilityMethod:'MISSING_PRICE'}
  ]
};

// oldFixture is intentionally repeated in a second book. Canonical observability must count it once.
const books=[{fixtures:{old:oldFixture,current:currentFixture}},{fixtures:{oldDuplicate:{...oldFixture,picks:oldFixture.picks.map(p=>({...p}))}}}];

const x=buildShadowMarketObservability(books);
assert.equal(x.version,'SHADOW-MARKET-OBSERVABILITY-3');
assert.equal(x.policy.descriptiveOnly,true);
assert.equal(x.policy.productionAuthority,false);
assert.equal(x.policy.automaticPromotion,false);
assert.equal(x.policy.automaticRealWagering,false);
assert.equal(x.policy.lateBoundPricesExcludedFromFrozenOddsRoi,true);

assert.equal(x.canonicalEvidence.diagnostics.inputFixtures,3);
assert.equal(x.canonicalEvidence.diagnostics.outputFixtures,2);
assert.equal(x.canonicalEvidence.diagnostics.duplicateCopiesRemoved,1);

assert.equal(x.overall.sample,4);
assert.equal(x.overall.settled,4);
assert.equal(x.overall.settlementCoveragePct,100);
assert.equal(x.overall.priced,3);
assert.equal(x.overall.pricingCoveragePct,75);
assert.equal(x.overall.clvSamples,3);
assert.equal(x.overall.clvCoveragePct,75);
assert.equal(x.overall.calibrationCoveragePct,100);
assert.equal(x.overall.flatStakePL,.4);
assert.equal(x.overall.flatStakeRoiPct,13.33);
assert.equal(x.overall.pnlFixtures,2);
assert.equal(x.overall.flatStakeRoiConfidence95.reps,0,'small fixture samples must not emit pseudo-precise ROI confidence intervals');
assert.equal(x.overall.maxDrawdownUnits,.5);
assert.equal(x.overall.frozenOddsPnlSamples,2);
assert.equal(x.overall.frozenOddsFlatStakePL,1.4);
assert.equal(x.overall.frozenOddsRoiPct,70);
assert.equal(x.overall.frozenOddsPnlFixtures,2);
assert.equal(x.overall.frozenOddsRoiConfidence95.reps,0);
assert.equal(x.overall.frozenOddsMaxDrawdownUnits,0);
assert.equal(x.overall.lateBoundPnlSamples,1);
assert.equal(x.overall.brier,.15313);
assert.equal(x.overall.logLoss,.49404);

assert.equal(x.families.TOTAL_GOALS.sample,2);
assert.equal(x.families.TOTAL_GOALS.settled,2);
assert.equal(x.families.TOTAL_GOALS.wins,2);
assert.equal(x.families.TOTAL_GOALS.pnlSamples,2);
assert.equal(x.families.TOTAL_GOALS.flatStakePL,1.4);
assert.equal(x.families.TOTAL_GOALS.flatStakeRoiPct,70);
assert.equal(x.families.TOTAL_GOALS.frozenOddsRoiPct,70);
assert.equal(x.families.TOTAL_GOALS.calibrationSamples,2);
assert.equal(x.families.TOTAL_GOALS.brier,.125);
assert.equal(x.families.TOTAL_GOALS.logLoss,.43375);
assert.equal(x.families.TOTAL_GOALS.meanPredictedPct,65);
assert.equal(x.families.TOTAL_GOALS.observedWinPct,100);
assert.equal(x.families.TOTAL_GOALS.calibrationGapPp,-35);
assert.equal(x.families.TOTAL_GOALS.deViggedFairSamples,2);

assert.equal(x.families.TEAM_GOALS.sample,1);
assert.equal(x.families.TEAM_GOALS.flatStakeRoiPct,-100);
assert.equal(x.families.TEAM_GOALS.frozenOddsRoiPct,null,'late-bound prices must be excluded from strict frozen-odds ROI');
assert.equal(x.families.TEAM_GOALS.lateBoundPnlSamples,1);
assert.equal(x.families.TEAM_GOALS.logLoss,.51083);
assert.equal(x.families.BTTS.pnlSamples,0);
assert.equal(x.families.BTTS.flatStakeRoiPct,null,'unpriced settled picks must not silently dilute ROI denominator');
assert.equal(x.families.BTTS.brier,.2025,'calibration remains measurable without an entry price');
assert.equal(x.families.BTTS.logLoss,.59784);

assert.equal(x.leagues['League A'].sample,1);
assert.equal(x.leagues['League A'].families.TOTAL_GOALS.sample,1);
assert.equal(x.leagues['League B'].sample,3);
assert.equal(x.leagues['League B'].flatStakeRoiPct,-25);
assert.equal(x.leagues['League B'].frozenOddsRoiPct,50);
assert.equal(x.leagues['League B'].families.TEAM_GOALS.sample,1);

assert.equal(x.oddsBands.ODDS_1_50_1_99.sample,2);
assert.equal(x.oddsBands.ODDS_1_50_1_99.families.TOTAL_GOALS.sample,2);
assert.equal(x.oddsBands.ODDS_1_50_1_99.frozenOddsRoiPct,70);
assert.equal(x.oddsBands.ODDS_2_00_2_99.sample,1);
assert.equal(x.oddsBands.ODDS_2_00_2_99.families.TEAM_GOALS.sample,1);
assert.equal(x.oddsBands.UNPRICED.sample,1);
assert.equal(x.oddsBands.UNPRICED.families.BTTS.sample,1);

assert.equal(x.cohorts['SHADOW-FREEZE-4'].sample,1,'canonical duplicate must not inflate legacy cohort');
assert.equal(x.cohorts['SHADOW-FREEZE-5'].sample,3);
assert.equal(x.cohorts['SHADOW-FREEZE-5'].families.TOTAL_GOALS.sample,1);
assert.equal(x.cohorts['SHADOW-FREEZE-5'].families.TEAM_GOALS.sample,1);
assert.equal(x.cohorts['SHADOW-FREEZE-5'].families.BTTS.sample,1);
assert.equal(x.cohorts['SHADOW-FREEZE-4'].families.TEAM_GOALS,undefined,'legacy cohorts must not be backfilled with new market families');

console.log('shadow market observability regression: PASS');
