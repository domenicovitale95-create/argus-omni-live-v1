import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dedupeShadowFixtures } from '../api/_shadow-fixture-dedupe.js';

function fixture(id,{kickoff='2026-09-01T20:00:00Z',frozen='2026-09-01T08:00:00Z',score=null,p={home:.10,draw:.45,away:.45}}={}){
  const truth=score?(score.home>score.away?'home':score.home<score.away?'away':'draw'):null;
  return{
    fixtureId:id,
    home:{id:1,name:'Home'},away:{id:2,name:'Away'},competition:{id:9,name:'League'},
    kickoff,frozenAt:frozen,freezeVersion:'SHADOW-FREEZE-3',finalScore:score,
    picks:['home','draw','away'].map(key=>({key,probability:p[key],probabilitySource:'ARGUS_PREMATCH_1X2',modelIndependentOfPrice:true,outcome:truth?(key===truth?'WIN':'LOSS'):null}))
  };
}
function book(date,...fixtures){return{date,fixtures:Object.fromEntries(fixtures.map(f=>[String(f.fixtureId),f]))}}

{
  const first=fixture(1549469,{kickoff:'2026-08-31T20:00:00Z',frozen:'2026-08-31T07:03:29Z'});
  const second=fixture(1549469,{kickoff:'2026-09-01T20:00:00Z',frozen:'2026-09-01T08:32:56Z',score:{home:1,away:0},p:{home:.1002,draw:.4499,away:.4499}});
  const r=dedupeShadowFixtures([book('2026-08-31',first),book('2026-09-01',second)]);
  assert.equal(r.diagnostics.rescheduleReconciledFixtureIds,1);
  assert.equal(r.diagnostics.conflictingDuplicateFixtureIds,0);
  assert.equal(r.fixtures.length,1);
  assert.equal(r.fixtures[0].frozenAt,first.frozenAt,'operational view must preserve the earliest prospective freeze');
  assert.deepEqual(r.fixtures[0].finalScore,{home:1,away:0});
  assert.equal(r.fixtures[0].picks.filter(p=>['WIN','LOSS'].includes(p.outcome)).length,3,'reconciled fixture must contribute one settled triplet, not two');
}

for(const path of ['api/probability-calibration.js','api/challenger-factory.js']){
  const src=await readFile(new URL(`../${path}`,import.meta.url),'utf8');
  assert.match(src,/dedupeShadowFixtures/);
  assert.match(src,/canonicalView=dedupeShadowFixtures\(books\)/);
  assert.match(src,/canonicalView\.fixtures/);
  assert.match(src,/canonicalShadowEvidence:canonicalView\.diagnostics/);
}

console.log('operational shadow dedupe regression: OK');
