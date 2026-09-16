import assert from 'node:assert/strict';
import { dedupeShadowFixtures } from '../api/_shadow-fixture-dedupe.js';

function book(f){return{fixtures:{[String(f.fixtureId)]:f}}}

const first={
  fixtureId:2001,
  competition:'League A',
  home:'Home FC',
  away:'Away FC',
  kickoff:'2026-09-01T20:00:00Z',
  frozenAt:'2026-09-01T08:00:00Z',
  freezeVersion:'SHADOW-FREEZE-5',
  picks:[
    {key:'under15',probability:.31,probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true},
    {key:'under35',probability:.72,probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true},
    {key:'homeUnder05',probability:.18,probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true},
    {key:'awayUnder05',probability:.24,probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true}
  ]
};
const second={
  fixtureId:2001,
  competition:'League A',
  home:'Home FC',
  away:'Away FC',
  kickoff:'2026-09-02T20:00:00Z',
  frozenAt:'2026-09-02T08:00:00Z',
  freezeVersion:'SHADOW-FREEZE-5',
  finalScore:{home:2,away:1},
  settledAt:'2026-09-02T22:00:00Z',
  picks:[
    {key:'under15',probability:.30,outcome:'LOSS',probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true},
    {key:'under35',probability:.70,outcome:'WIN',probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true},
    {key:'homeUnder05',probability:.17,outcome:'LOSS',probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true},
    {key:'awayUnder05',probability:.23,outcome:'LOSS',probabilitySource:'HISTORY90D_POISSON',modelIndependentOfPrice:true}
  ]
};

const r=dedupeShadowFixtures([book(second),book(first)]);
assert.equal(r.diagnostics.rescheduleReconciledFixtureIds,1);
assert.equal(r.diagnostics.outputFixtures,1);
const f=r.fixtures[0];
assert.equal(f.freezeVersion,'SHADOW-FREEZE-5');
assert.deepEqual(f.finalScore,{home:2,away:1});
assert.equal(f.picks.find(p=>p.key==='under15').outcome,'LOSS');
assert.equal(f.picks.find(p=>p.key==='under35').outcome,'WIN');
assert.equal(f.picks.find(p=>p.key==='homeUnder05').outcome,'LOSS');
assert.equal(f.picks.find(p=>p.key==='awayUnder05').outcome,'LOSS');
for(const p of f.picks){
  assert.equal(p.pl,null,'research-only reschedule reconciliation must not fabricate P/L');
  assert.equal(p.clv,null,'research-only reschedule reconciliation must not import later CLV');
}

console.log('shadow dedupe complementary markets regression: PASS');
