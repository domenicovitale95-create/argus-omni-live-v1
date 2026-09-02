import assert from 'node:assert/strict';
import { dedupeShadowFixtures, researchFixtureFingerprint } from '../api/_shadow-fixture-dedupe.js';

function fixture(id,{p={home:.45,draw:.28,away:.27},frozen='2026-09-01T10:00:00Z',sourceField='probabilitySource',score={home:2,away:1}}={}){
  const picks=['home','draw','away'].map(key=>({key,probability:p[key],[sourceField]:'ARGUS_PREMATCH_1X2',outcome:key==='home'?'WIN':'LOSS',modelIndependentOfPrice:true,odds:2.1,marketImpliedProbability:key==='home'?.46:key==='draw'?.27:.27}));
  return{fixtureId:id,kickoff:'2026-09-01T12:00:00Z',frozenAt:frozen,finalScore:score,picks};
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
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,0);
  assert.equal(r.diagnostics.duplicateCopiesRemoved,1);
  assert.equal(r.diagnostics.outputFixtures,1);
  assert.equal(r.fixtures[0].frozenAt,'2026-09-01T09:30:00Z','earliest freeze must be the deterministic representative');
}

{
  const a=fixture(20),b=fixture(20,{p:{home:.35,draw:.38,away:.27}}),r=dedupeShadowFixtures([book(a),book(b)]);
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,1);
  assert.deepEqual(r.diagnostics.conflictingDuplicateIds,['20']);
  assert.equal(r.diagnostics.outputFixtures,0,'conflicting duplicate must fail closed and be excluded entirely');
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
