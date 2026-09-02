import assert from 'node:assert/strict';
import { dedupeShadowFixtures, researchFixtureFingerprint } from '../api/_shadow-fixture-dedupe.js';

function fixture(id,{p={home:.45,draw:.28,away:.27},frozen='2026-09-01T10:00:00Z',kickoff='2026-09-01T12:00:00Z',sourceField='probabilitySource',score={home:2,away:1},home='Home FC',away='Away FC',competition='League A'}={}){
  const truth=score==null?null:score.home>score.away?'home':score.home<score.away?'away':'draw';
  const picks=['home','draw','away'].map(key=>({key,probability:p[key],[sourceField]:'ARGUS_PREMATCH_1X2',outcome:truth==null?null:(key===truth?'WIN':'LOSS'),modelIndependentOfPrice:true,odds:2.1,marketImpliedProbability:key==='home'?.46:key==='draw'?.27:.27,pl:truth==null?null:(key===truth?1.1:-1),clv:truth==null?null:1.5}));
  return{fixtureId:id,home,away,competition,kickoff,frozenAt:frozen,finalScore:score,picks};
}
function book(...fixtures){return{fixtures:Object.fromEntries(fixtures.map((f,i)=>[String(f.fixtureId??`missing-${i}`),f]))}}

{
  const a=fixture(1),b=fixture(2),r=dedupeShadowFixtures([book(a,b)]);
  assert.equal(r.diagnostics.inputFixtures,2);
  assert.equal(r.diagnostics.outputFixtures,2);
  assert.equal(r.diagnostics.duplicateFixtureIds,0);
}

{
  const later=fixture(10,{frozen:'2026-09-01T10:30:00Z'}),earlier=fixture(10,{frozen:'2026-09-01T09:30:00Z',sourceField:'sourceClass'});
  earlier.picks.forEach(p=>{p.odds=9.99;p.marketImpliedProbability=.01});
  assert.equal(researchFixtureFingerprint(later),researchFixtureFingerprint(earlier),'mutable market fields and source storage field must not create a false conflict');
  const r=dedupeShadowFixtures([book(later),book(earlier)]);
  assert.equal(r.diagnostics.duplicateFixtureIds,1);
  assert.equal(r.diagnostics.identicalDuplicateFixtureIds,1);
  assert.equal(r.diagnostics.rawConflictingDuplicateFixtureIds,0);
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,0);
  assert.equal(r.diagnostics.duplicateCopiesRemoved,1);
  assert.equal(r.diagnostics.outputFixtures,1);
  assert.equal(r.fixtures[0].frozenAt,'2026-09-01T09:30:00Z','earliest freeze must be the deterministic representative');
}

{
  const a=fixture(20),b=fixture(20,{p:{home:.35,draw:.38,away:.27}}),r=dedupeShadowFixtures([book(a),book(b)]);
  assert.equal(r.diagnostics.rawConflictingDuplicateFixtureIds,1);
  assert.equal(r.diagnostics.rescheduleReconciledFixtureIds,0);
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,1);
  assert.deepEqual(r.diagnostics.conflictingDuplicateIds,['20']);
  assert.equal(r.diagnostics.outputFixtures,0,'same-kickoff conflicting duplicate must still fail closed');
}

{
  // Exact shape of the production root cause: same stable fixture, +24h reschedule,
  // first prospective forecast unresolved, second copy settled with slightly changed probabilities.
  const first=fixture(1549469,{p:{home:.0996,draw:.4506,away:.4498},frozen:'2026-08-31T07:03:29.832Z',kickoff:'2026-08-31T20:00:00Z',score:null,home:'Canonical Home',away:'Canonical Away'});
  first.freezeVersion='SHADOW-FREEZE-3';
  const second=fixture(1549469,{p:{home:.0998,draw:.4504,away:.4498},frozen:'2026-09-01T08:32:56.256Z',kickoff:'2026-09-01T20:00:00Z',score:{home:1,away:0},home:'Canonical Home',away:'Canonical Away'});
  second.freezeVersion='SHADOW-FREEZE-3';
  const r=dedupeShadowFixtures([book(second),book(first)]);
  assert.equal(r.diagnostics.rawConflictingDuplicateFixtureIds,1);
  assert.equal(r.diagnostics.rescheduleReconciledFixtureIds,1);
  assert.deepEqual(r.diagnostics.rescheduleReconciledIds,['1549469']);
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,0);
  assert.equal(r.diagnostics.outputFixtures,1);
  const f=r.fixtures[0];
  assert.equal(f.frozenAt,'2026-08-31T07:03:29.832Z');
  assert.equal(f.kickoff,'2026-08-31T20:00:00Z','frozen kickoff remains immutable in research view');
  assert.deepEqual(f.finalScore,{home:1,away:0});
  assert.equal(f.picks.find(p=>p.key==='home').probability,.0996,'later re-freeze probability must be discarded');
  assert.equal(f.picks.find(p=>p.key==='draw').probability,.4506);
  assert.equal(f.picks.find(p=>p.key==='home').outcome,'WIN');
  assert.equal(f.picks.find(p=>p.key==='draw').outcome,'LOSS');
  assert.equal(f.picks.find(p=>p.key==='home').pl,null,'synthetic reconciliation must not fabricate ROI');
  assert.equal(f.picks.find(p=>p.key==='home').clv,null,'later CLV must not leak into first forecast');
  assert.equal(f.rescheduleReconciliation.discardedLaterProbabilities,true);
  assert.equal(f.rescheduleReconciliation.historicalBlobMutation,false);
}

{
  // A date change alone is not enough: team identity mismatch must remain blocked.
  const first=fixture(40,{frozen:'2026-09-01T08:00:00Z',kickoff:'2026-09-01T12:00:00Z',score:null,home:'Home A'}),second=fixture(40,{frozen:'2026-09-02T08:00:00Z',kickoff:'2026-09-02T12:00:00Z',score:{home:2,away:1},home:'Different Home'}),r=dedupeShadowFixtures([book(first),book(second)]);
  assert.equal(r.diagnostics.rescheduleReconciledFixtureIds,0);
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,1);
  assert.equal(r.diagnostics.outputFixtures,0);
}

{
  // Conflicting final scores cannot be reconciled even if everything else looks like a reschedule.
  const a=fixture(41,{frozen:'2026-09-01T08:00:00Z',kickoff:'2026-09-01T12:00:00Z',score:{home:1,away:0}}),b=fixture(41,{frozen:'2026-09-02T08:00:00Z',kickoff:'2026-09-02T12:00:00Z',score:{home:0,away:1}}),r=dedupeShadowFixtures([book(a),book(b)]);
  assert.equal(r.diagnostics.rescheduleReconciledFixtureIds,0);
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,1);
}

{
  const a=fixture(null);delete a.fixtureId;
  const r=dedupeShadowFixtures([book(a)]);
  assert.equal(r.diagnostics.missingFixtureId,1);
  assert.equal(r.diagnostics.outputFixtures,0);
}

{
  const first=fixture(30,{frozen:'2026-09-01T09:00:00Z'}),second=fixture(30,{frozen:'2026-09-01T10:00:00Z'}),u=fixture(31);
  const a=dedupeShadowFixtures([book(second,u),book(first)]),b=dedupeShadowFixtures([book(first),book(second,u)]);
  assert.equal(a.diagnostics.outputFixtures,b.diagnostics.outputFixtures);
  assert.deepEqual(a.fixtures.map(x=>String(x.fixtureId)),b.fixtures.map(x=>String(x.fixtureId)));
  assert.equal(a.fixtures.find(x=>x.fixtureId===30).frozenAt,b.fixtures.find(x=>x.fixtureId===30).frozenAt);
}

console.log('shadow fixture dedupe regression: OK');
