import assert from 'node:assert/strict';
import { buildShadowMarketObservability } from '../api/_shadow-market-observability.js';

function winFor(fixture){
  if(fixture<=5)return true;
  if(fixture<=9)return false;
  if(fixture<=21)return fixture%2===0;
  return true;
}

const fixtures={};
for(let fixture=1;fixture<=30;fixture++){
  const win=winFor(fixture),kickoff=new Date(Date.UTC(2026,5,1)+fixture*86400000).toISOString(),frozenAt=new Date(Date.UTC(2026,5,1)+fixture*86400000-6*3600000).toISOString();
  fixtures[String(fixture)]={
    fixtureId:fixture,competition:'Risk League',home:`H${fixture}`,away:`A${fixture}`,kickoff,frozenAt,freezeVersion:'SHADOW-FREEZE-5',
    picks:['over15','over25'].map((key,index)=>({
      key,probability:index===0?.72:.61,probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true,
      odds:2,entryPriceSource:'PREKICKOFF_FREEZE',outcome:win?'WIN':'LOSS',pl:win?1:-1,clv:win?1:-1,
      marketImpliedProbability:.5,marketProbabilityMethod:'DEVIG_BINARY_PAIR_NORMALIZED'
    }))
  };
}

const a=buildShadowMarketObservability([{fixtures}]),b=buildShadowMarketObservability([{fixtures}]);
assert.equal(a.version,'SHADOW-MARKET-OBSERVABILITY-3');
assert.equal(a.overall.pnlSamples,60);
assert.equal(a.overall.pnlFixtures,30,'correlated picks from one match must share one bootstrap block');
assert.equal(a.overall.flatStakePL,20);
assert.equal(a.overall.flatStakeRoiPct,33.33);
assert.equal(a.overall.maxDrawdownUnits,8,'four consecutive two-unit losing fixtures should produce an eight-unit drawdown');
assert.equal(a.overall.flatStakeRoiConfidence95.method,'FIXTURE_BLOCK_BOOTSTRAP');
assert.equal(a.overall.flatStakeRoiConfidence95.fixtures,30);
assert.equal(a.overall.flatStakeRoiConfidence95.reps,1200);
assert.ok(a.overall.flatStakeRoiConfidence95.lower95Pct<a.overall.flatStakeRoiPct);
assert.ok(a.overall.flatStakeRoiConfidence95.upper95Pct>a.overall.flatStakeRoiPct);
assert.deepEqual(a.overall.flatStakeRoiConfidence95,b.overall.flatStakeRoiConfidence95,'bootstrap output must be deterministic and auditable');

assert.equal(a.overall.frozenOddsPnlSamples,60);
assert.equal(a.overall.frozenOddsPnlFixtures,30);
assert.equal(a.overall.frozenOddsRoiPct,33.33);
assert.equal(a.overall.frozenOddsMaxDrawdownUnits,8);
assert.deepEqual(a.overall.frozenOddsRoiConfidence95,a.overall.flatStakeRoiConfidence95,'all prices are initial-freeze prices in this fixture');

const family=a.families.TOTAL_GOALS;
assert.equal(family.pnlFixtures,30);
assert.equal(family.flatStakeRoiPct,33.33);
assert.equal(family.maxDrawdownUnits,8);
assert.equal(family.flatStakeRoiConfidence95.reps,1200);

const league=a.leagues['Risk League'];
assert.equal(league.pnlFixtures,30);
assert.equal(league.flatStakeRoiPct,33.33);
assert.equal(league.families.TOTAL_GOALS.pnlFixtures,30);
assert.equal(league.families.TOTAL_GOALS.flatStakeRoiConfidence95.reps,1200);

const band=a.oddsBands.ODDS_2_00_2_99;
assert.equal(band.pnlSamples,60);
assert.equal(band.pnlFixtures,30);
assert.equal(band.flatStakeRoiConfidence95.reps,1200);
assert.equal(band.families.TOTAL_GOALS.maxDrawdownUnits,8);

assert.match(a.policy.roiUncertainty,/FIXTURE-BLOCK BOOTSTRAP/);
assert.match(a.policy.drawdown,/FIXTURE TIME/);
assert.equal(a.policy.productionAuthority,false);
assert.equal(a.policy.automaticRealWagering,false);

console.log('shadow market risk observability regression: PASS');
