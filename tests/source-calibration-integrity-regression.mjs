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

{
  // Safe provider reschedule: the audit must evaluate the earliest forecast against
  // the consistent later final score without treating the historical double-booking
  // itself as a current integrity failure.
  const first=fixture(200,'home',{home:.10,draw:.45,away:.45});
  first.home='Team A';first.away='Team B';first.competition='League';first.freezeVersion='SHADOW-FREEZE-3';
  first.finalScore=null;first.picks.forEach(p=>{p.outcome=null});
  const second=fixture(200,'home',{home:.11,draw:.44,away:.45});
  second.home='Team A';second.away='Team B';second.competition='League';second.freezeVersion='SHADOW-FREEZE-3';
  second.kickoff=new Date(new Date(first.kickoff).getTime()+86400000).toISOString();
  second.frozenAt=new Date(new Date(first.frozenAt).getTime()+86400000).toISOString();
  second.picks.forEach(p=>{p.probabilityFrozenAt=second.frozenAt});
  const a=auditSourceCalibration([book([second]),book([first])]);
  assert.equal(a.dedupe.rawConflictingDuplicateFixtureIds,1);
  assert.equal(a.dedupe.rescheduleReconciledFixtureIds,1);
  assert.equal(a.dedupe.conflictingDuplicateFixtureIds,0);
  assert.equal(a.integrity.failures,0);
  assert.equal(a.validFixtures,1);
  assert.equal(a.reconciledFixtures,1);
  assert.ok(a.riskFlags.includes('RESCHEDULE_DUPLICATES_RECONCILED_CANONICALLY'));
  assert.ok(!a.riskFlags.includes('DATA_INTEGRITY_FAILURES_PRESENT'));
}


{
  const f=fixture(7,'home',{home:.4,draw:.3,away:.3});
  f.picks.find(p=>p.key==='home').outcome='LOSS';
  f.picks.find(p=>p.key==='draw').outcome='WIN';
  const a=auditSourceCalibration([book([f])]);
  assert.equal(a.integrity.issues.outcomeContradiction,1);
  assert.equal(a.integrity.issueSamples.limitPerIssue,10);
  assert.deepEqual(a.integrity.issueSamples.outcomeContradiction,[{
    fixtureId:String(f.fixtureId),
    truth:'home',
    finalScore:{home:2,away:1},
    outcomes:{home:'LOSS',draw:'WIN',away:'LOSS'},
    freezeVersion:'SHADOW-FREEZE-4'
  }]);
  assert.equal(a.validFixtures,0);
  assert.equal(a.status,'CRITICAL');
}

console.log('source calibration integrity regression: OK');
