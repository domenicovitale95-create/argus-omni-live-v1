import assert from 'node:assert/strict';
import { inspectShadowFixtureDuplicates } from '../api/_shadow-duplicate-inspector.js';

function fixture(id,{home=.45,draw=.28,away=.27,score={home:2,away:1},kickoff='2026-09-01T12:00:00Z',frozen='2026-09-01T10:00:00Z'}={}){
  return{fixtureId:id,kickoff,frozenAt:frozen,freezeVersion:'SHADOW-FREEZE-3',finalScore:score,picks:[
    {key:'home',probability:home,probabilitySource:'ARGUS_PREMATCH_1X2',outcome:score.home>score.away?'WIN':'LOSS',modelIndependentOfPrice:true},
    {key:'draw',probability:draw,probabilitySource:'ARGUS_PREMATCH_1X2',outcome:score.home===score.away?'WIN':'LOSS',modelIndependentOfPrice:true},
    {key:'away',probability:away,probabilitySource:'ARGUS_PREMATCH_1X2',outcome:score.home<score.away?'WIN':'LOSS',modelIndependentOfPrice:true}
  ]};
}
function book(date,...fixtures){return{date,generatedAt:`${date}T23:00:00Z`,version:'TEST',fixtures:Object.fromEntries(fixtures.map(f=>[String(f.fixtureId),f]))}}

{
  const a=fixture(1,{frozen:'2026-09-01T09:00:00Z'}),b=fixture(1,{frozen:'2026-09-01T10:00:00Z'});
  const r=inspectShadowFixtureDuplicates([book('2026-09-01',a),book('2026-09-02',b)]);
  assert.equal(r.duplicateIds,1);
  assert.equal(r.duplicates[0].classification,'IDENTICAL_CORE');
  assert.equal(r.duplicates[0].changedSections.frozenAt,true);
  assert.equal(r.duplicates[0].changedSections.picks,false);
}

{
  const a=fixture(2),b=fixture(2,{home:.25,draw:.48,away:.27});
  const r=inspectShadowFixtureDuplicates([book('2026-09-01',a),book('2026-09-02',b)],{onlyIds:['2']});
  assert.equal(r.duplicateIds,1);
  assert.equal(r.duplicates[0].classification,'CONFLICTING_CORE');
  assert.equal(r.duplicates[0].changedSections.picks,true);
  assert.equal(r.duplicates[0].changedSections.finalScore,false);
  assert.equal(r.duplicates[0].copiesDetail.length,2);
}

{
  const a=fixture(3),b=fixture(3,{score:{home:0,away:1}});
  const r=inspectShadowFixtureDuplicates([book('2026-09-01',a),book('2026-09-02',b)]);
  assert.equal(r.duplicates[0].changedSections.finalScore,true);
  assert.equal(r.duplicates[0].changedSections.picks,true,'outcomes must also reveal score-dependent conflicts');
}

console.log('shadow duplicate inspector regression: OK');
