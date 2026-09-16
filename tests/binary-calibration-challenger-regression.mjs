import assert from 'node:assert/strict';
import {
  BINARY_CALIBRATION_POLICY,
  evaluateBinaryCalibration,
  fitWeightedIsotonic,
  predictIsotonic,
  temporalFixtureSplit
} from '../api/_binary-calibration-challenger.js';

assert.equal(BINARY_CALIBRATION_POLICY.version,'BINARY-CALIBRATION-CHALLENGER-1');
assert.equal(BINARY_CALIBRATION_POLICY.mode,'SHADOW_ONLY');

// 1) Whole fixtures must remain entirely on one side of every temporal split.
const splitRows=[];
for(let fixture=1;fixture<=10;fixture++){
  const eventTime=Date.UTC(2026,0,fixture);
  splitRows.push({fixtureId:String(fixture),eventTime,key:'bttsYes',probability:.4,y:0});
  splitRows.push({fixtureId:String(fixture),eventTime,key:'bttsNo',probability:.6,y:1});
}
const split=temporalFixtureSplit(splitRows,.70);
assert.equal(split.leftFixtures,7);
assert.equal(split.rightFixtures,3);
const leftIds=new Set(split.left.map(r=>r.fixtureId)),rightIds=new Set(split.right.map(r=>r.fixtureId));
for(const id of leftIds)assert.equal(rightIds.has(id),false,`fixture ${id} leaked across temporal split`);

// 2) Weighted PAVA must remain monotone and explicitly fixture-balanced.
const pavaRows=[];
for(let i=0;i<20;i++)pavaRows.push({fixtureId:String(i+1),probability:.05+i*.045,y:(i>=5&&i<10)||(i>=15)?1:0});
const fit=fitWeightedIsotonic(pavaRows);
assert.ok(fit,'expected isotonic fit');
assert.equal(fit.fixtures,20);
assert.equal(fit.distinctProbabilities,20);
assert.equal(fit.weighting,'EQUAL_TOTAL_WEIGHT_PER_FIXTURE');
for(let i=1;i<fit.blocks.length;i++)assert.ok(fit.blocks[i-1].value<=fit.blocks[i].value,'PAVA output must be monotone non-decreasing');
let previous=0;
for(let i=0;i<=100;i++){const q=predictIsotonic(fit,i/100);assert.ok(q>=previous-1e-12,'isotonic prediction must be monotone');previous=q}

function deterministicOutcome(fixture,probability,phase){
  const u=((fixture*37)%101)/101;
  if(phase==='TRAIN'){
    // Earlier regime is deliberately over-dispersed: true rates are pulled toward 0.5.
    const q=.25+.50*probability;
    return u<q?'WIN':'LOSS';
  }
  // Later regime is deliberately closer to the raw model, creating a real temporal stress test.
  return u<probability?'WIN':'LOSS';
}
function makeBooks({flipHoldout=false}={}){
  const fixtures={};
  for(let fixture=1;fixture<=200;fixture++){
    const level=(fixture-1)%20,probability=.07+level*(.86/19),phase=fixture<=140?'TRAIN':'HOLDOUT';
    let outcome=deterministicOutcome(fixture,probability,phase);
    if(flipHoldout&&fixture>140)outcome=outcome==='WIN'?'LOSS':'WIN';
    const kickoff=new Date(Date.UTC(2026,0,1)+fixture*86400000).toISOString();
    const frozenAt=new Date(Date.UTC(2026,0,1)+fixture*86400000-8*3600000).toISOString();
    fixtures[String(fixture)]={
      fixtureId:fixture,competition:'Synthetic League',home:`H${fixture}`,away:`A${fixture}`,kickoff,frozenAt,freezeVersion:'SHADOW-FREEZE-5',finalScore:outcome==='WIN'?{home:1,away:1}:{home:1,away:0},
      picks:[{key:'bttsYes',probability,probabilitySource:'HISTORY90D_POISSON',sourceClass:'STRUCTURAL_MODEL',modelIndependentOfPrice:true,outcome}]
    };
  }
  return[{fixtures}];
}

// 3) Nested temporal calibration: outer holdout must never influence fit or alpha selection.
const a=evaluateBinaryCalibration(makeBooks()),b=evaluateBinaryCalibration(makeBooks({flipHoldout:true}));
assert.equal(a.policy.shadowOnly,true);
assert.equal(a.policy.readOnly,true);
assert.equal(a.policy.noShuffle,true);
assert.equal(a.policy.holdoutUsedForSelection,false);
assert.equal(a.policy.automaticPromotion,false);
assert.equal(a.policy.productionProbabilityMutation,false);
assert.equal(a.policy.officialLedgerEligible,false);

const id='HISTORY90D_POISSON|||BTTS',sa=a.segments.find(x=>x.segment===id),sb=b.segments.find(x=>x.segment===id);
assert.ok(sa,'expected BTTS calibration segment');
assert.ok(sb,'expected mutated-holdout BTTS calibration segment');
assert.equal(sa.split.totalFixtures,200);
assert.equal(sa.split.outerTrainFixtures,140);
assert.equal(sa.split.outerHoldoutFixtures,60);
assert.equal(sa.split.innerFitFixtures,105);
assert.equal(sa.split.innerValidationFixtures,35);
assert.ok(sa.selection,'sufficient evidence must produce an inner-validation selection');
assert.equal(sa.selection.alpha,sb.selection.alpha,'changing only outer holdout outcomes must never change selected alpha');
assert.deepEqual(sa.selection.leaderboard,sb.selection.leaderboard,'outer holdout must never leak into inner candidate ranking');
assert.equal(sa.refit.alpha,sb.refit.alpha);
assert.equal(sa.refit.fixtures,sb.refit.fixtures);
assert.notEqual(sa.holdout.baseline.brier,sb.holdout.baseline.brier,'mutating outer holdout must change only the final exam metrics');
assert.equal(sa.holdout.pairedBootstrap.fixtures,60);
assert.ok(['HOLD','RESEARCH_VALIDATED'].includes(sa.status));
assert.ok(['HOLD','RESEARCH_VALIDATED'].includes(sb.status));

// 4) Sparse segments must fail closed instead of fitting a small-sample calibrator.
const sparseFixtures={};
for(let fixture=1;fixture<=40;fixture++){
  const kickoff=new Date(Date.UTC(2027,0,fixture)).toISOString(),frozenAt=new Date(Date.UTC(2027,0,fixture)-3600000).toISOString();
  sparseFixtures[String(fixture)]={fixtureId:fixture,competition:'Sparse',home:'H',away:'A',kickoff,frozenAt,freezeVersion:'SHADOW-FREEZE-5',picks:[{key:'homeOver05',probability:.2+(fixture%15)*.04,probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true,outcome:fixture%2?'WIN':'LOSS'}]};
}
const sparse=evaluateBinaryCalibration([{fixtures:sparseFixtures}]),team=sparse.segments.find(x=>x.family==='TEAM_GOALS');
assert.ok(team);
assert.equal(team.status,'INSUFFICIENT_EVIDENCE');
assert.ok(team.blockers.includes('TOTAL_FIXTURES_INSUFFICIENT'));

console.log('binary calibration challenger regression: PASS');
