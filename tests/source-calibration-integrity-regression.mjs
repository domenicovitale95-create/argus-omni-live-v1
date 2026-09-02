import assert from 'node:assert/strict';
import { auditSourceCalibration } from '../api/_source-calibration-audit.js';

function fixture(i,truth,probabilities,{late=false,market=probabilities}={}){
  const kickoff=new Date(Date.UTC(2026,7,1,12,0,0)+i*3600000),frozen=new Date(kickoff.getTime()+(late?1000:-3600000));
  const score=truth==='home'?{home:2,away:1}:truth==='away'?{home:0,away:1}:{home:1,away:1};
  const pick=k=>({key:k,probability:probabilities[k],probabilitySource:'ARGUS_PREMATCH_1X2',outcome:k===truth?'WIN':'LOSS',marketImpliedProbability:market?.[k]??null,probabilityFrozenAt:frozen.toISOString()});
  return{fixtureId:1000+i,kickoff:kickoff.toISOString(),frozenAt:frozen.toISOString(),freezeVersion:'SHADOW-FREEZE-4',finalScore:score,picks:['home','draw','away'].map(pick)};
}
function book(fixtures){return{fixtures:Object.fromEntries(fixtures.map(f=>[String(f.fixtureId),f]))}}

{
  const fixtures=[];
  for(let i=0;i<120;i++)fixtures.push(fixture(i,['home','draw','away'][i%3],{home:.34,draw:.33,away:.33}));
  const a=auditSourceCalibration([book(fixtures)]);
  assert.equal(a.validFixtures,120);
  assert.equal(a.integrity.failures,0);
  assert.equal(a.status,'HEALTHY');
  assert.ok(a.model.brier>0&&a.model.logLoss>0);
  assert.equal(a.marketFairComparison.sample,120);
  assert.ok(a.model.topLabelEce>=0);
}

{
  const fixtures=[];
  for(let i=0;i<120;i++){
    const truth=i<60?'home':i<90?'draw':'away';
    fixtures.push(fixture(i,truth,{home:.20,draw:.60,away:.20},{market:{home:.48,draw:.27,away:.25}}));
  }
  const a=auditSourceCalibration([book(fixtures)]);
  assert.equal(a.integrity.failures,0);
  assert.equal(a.status,'MODEL_RISK');
  assert.ok(a.riskFlags.includes('SEVERE_SOURCE_MISCALIBRATION'));
  assert.ok(a.calibration.home.calibrationGapPct>25);
  assert.ok(a.calibration.draw.calibrationGapPct<-25);
  assert.ok(a.marketFairComparison.brier<a.model.brier);
  assert.ok(a.marketFairComparison.brierDeltaVsModel<0);
}

{
  const fixtures=[];
  for(let i=0;i<30;i++)fixtures.push(fixture(i,['home','draw','away'][i%3],{home:.34,draw:.33,away:.33},{late:i===0}));
  const a=auditSourceCalibration([book(fixtures)]);
  assert.equal(a.integrity.issues.lateFreeze,1);
  assert.equal(a.status,'CRITICAL');
  assert.ok(a.riskFlags.includes('DATA_INTEGRITY_FAILURES_PRESENT'));
}

{
  const f=fixture(1,'home',{home:.4,draw:.3,away:.3});
  f.picks.find(p=>p.key==='away').probability=.5;
  const a=auditSourceCalibration([book([f])]);
  assert.equal(a.validFixtures,0);
  assert.equal(a.integrity.issues.simplexFailure,1);
  assert.equal(a.status,'CRITICAL');
}

console.log('source calibration integrity regression: OK');
