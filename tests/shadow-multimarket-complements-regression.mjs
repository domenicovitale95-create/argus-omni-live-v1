import assert from 'node:assert/strict';
import { shadowPicks, settlePick } from '../api/_shadow-evidence-core.js';

const match={
  history90d:{
    home:{matches:10,last5PPG:1.8,homePPG:1.9,pointsPerGame:1.7,goalsForPerGame:1.6,goalsAgainstPerGame:1.0},
    away:{matches:10,last5PPG:1.2,awayPPG:1.1,pointsPerGame:1.2,goalsForPerGame:1.1,goalsAgainstPerGame:1.5}
  },
  marketOdds:{
    over15:1.30,under15:3.60,
    over25:1.85,under25:2.05,
    over35:2.70,under35:1.48,
    homeOver05:1.18,homeUnder05:4.90,
    awayOver05:1.62,awayUnder05:2.22,
    bttsYes:1.91,bttsNo:1.91
  }
};

const picks=shadowPicks(match);
const byKey=Object.fromEntries(picks.map(p=>[p.key,p]));

for(const key of ['under15','under35','homeUnder05','awayUnder05']){
  assert.ok(byKey[key],`missing ${key}`);
  assert.equal(byKey[key].modelIndependentOfPrice,true);
  assert.equal(byKey[key].probabilitySource,'HISTORY90D_POISSON');
  assert.equal(byKey[key].marketProbabilityMethod,'DEVIG_BINARY_PAIR_NORMALIZED');
}

for(const [a,b] of [['over15','under15'],['over25','under25'],['over35','under35'],['homeOver05','homeUnder05'],['awayOver05','awayUnder05']]){
  assert.ok(Math.abs((byKey[a].probability+byKey[b].probability)-1)<=0.00002,`${a}/${b} model probabilities must complement`);
}

assert.equal(settlePick({key:'under15'},0,1),true);
assert.equal(settlePick({key:'under15'},1,1),false);
assert.equal(settlePick({key:'under35'},1,2),true);
assert.equal(settlePick({key:'under35'},2,2),false);
assert.equal(settlePick({key:'homeUnder05'},0,3),true);
assert.equal(settlePick({key:'homeUnder05'},1,0),false);
assert.equal(settlePick({key:'awayUnder05'},2,0),true);
assert.equal(settlePick({key:'awayUnder05'},0,1),false);

console.log('shadow multimarket complements regression: PASS');
