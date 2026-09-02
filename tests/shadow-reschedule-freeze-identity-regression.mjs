import assert from 'node:assert/strict';
import {
  SHADOW_FIXTURE_REGISTRY_VERSION,
  buildShadowFixtureRegistry,
  canonicalShadowFixture,
  registerShadowBook,
  shadowBookDateForMatch
} from '../api/_shadow-fixture-registry.js';

const first={
  date:'2026-08-31',
  fixtures:{
    '1549469':{fixtureId:1549469,kickoff:'2026-08-31T20:00:00.000Z',frozenAt:'2026-08-31T07:03:29.832Z',freezeVersion:'SHADOW-FREEZE-3',picks:[{key:'home',probability:.0996}]}
  }
};
const rescheduled={
  date:'2026-09-01',
  fixtures:{
    '1549469':{fixtureId:1549469,kickoff:'2026-09-01T20:00:00.000Z',frozenAt:'2026-09-01T08:32:56.256Z',freezeVersion:'SHADOW-FREEZE-3',finalScore:{home:1,away:0},picks:[{key:'home',probability:.0998,outcome:'WIN'}]}
  }
};

// Historical seeding must deterministically keep the earliest prospective freeze.
const registry=buildShadowFixtureRegistry([rescheduled,first],{nowIso:'2026-09-02T12:00:00.000Z'});
assert.equal(registry.version,SHADOW_FIXTURE_REGISTRY_VERSION);
assert.equal(registry.seedDiagnostics.fixtures,1);
assert.equal(registry.seedDiagnostics.duplicateCopiesObserved,1);
const canonical=canonicalShadowFixture(registry,'1549469');
assert.equal(canonical.canonicalDate,'2026-08-31');
assert.equal(canonical.frozenAt,'2026-08-31T07:03:29.832Z');
assert.equal(canonical.frozenKickoff,'2026-08-31T20:00:00.000Z');

// A later book for the same stable fixture ID must never replace the first freeze.
assert.equal(registerShadowBook(registry,rescheduled),0);
assert.equal(canonicalShadowFixture(registry,1549469).canonicalDate,'2026-08-31');
assert.equal(canonicalShadowFixture(registry,1549469).frozenAt,'2026-08-31T07:03:29.832Z');

// A genuinely new fixture is registered normally.
const newBook={date:'2026-09-01',fixtures:{'2000001':{fixtureId:2000001,kickoff:'2026-09-01T18:00:00.000Z',frozenAt:'2026-09-01T09:00:00.000Z',freezeVersion:'SHADOW-FREEZE-4'}}};
assert.equal(registerShadowBook(registry,newBook),1);
assert.equal(canonicalShadowFixture(registry,2000001).canonicalDate,'2026-09-01');

// Day routing follows the provider's latest kickoff in Brussels, which is exactly
// why the global fixture registry is required for reschedules across daily books.
assert.equal(shadowBookDateForMatch({kickoff:'2026-08-31T20:00:00.000Z'}),'2026-08-31');
assert.equal(shadowBookDateForMatch({kickoff:'2026-09-01T20:00:00.000Z'}),'2026-09-01');
assert.equal(shadowBookDateForMatch({kickoff:'2026-09-01T20:00:00.000Z'},'2026-09-05'),'2026-09-05');

console.log('shadow reschedule freeze identity regression: PASS');
