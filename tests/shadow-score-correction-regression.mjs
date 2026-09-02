import assert from 'node:assert/strict';
import { reconcileSettlementScore } from '../api/_shadow-evidence-core.js';

function fixture(){
  return {
    finalScore:{home:0,away:1},
    settledAt:'2026-09-02T10:00:00.000Z',
    settlementSource:'LIVE_FEED_FINAL_SCORE',
    picks:[
      {key:'home',odds:2.4,outcome:'LOSS',pl:-1},
      {key:'draw',odds:3.1,outcome:'LOSS',pl:-1},
      {key:'away',odds:2.9,outcome:'WIN',pl:1.9}
    ]
  };
}

{
  const f=fixture();
  const r=reconcileSettlementScore(f,2,0,{nowIso:'2026-09-02T11:00:00.000Z',source:'API_FOOTBALL_RECOVERY'});
  assert.equal(r.scoreCorrected,true);
  assert.equal(r.correctedOutcomes,3);
  assert.deepEqual(f.finalScore,{home:2,away:0});
  assert.deepEqual(f.picks.map(p=>p.outcome),['WIN','LOSS','LOSS']);
  assert.equal(f.settlementCorrections.length,1);
  assert.deepEqual(f.settlementCorrections[0].previousFinalScore,{home:0,away:1});
  assert.deepEqual(f.settlementCorrections[0].replacementFinalScore,{home:2,away:0});
  assert.deepEqual(f.settlementCorrections[0].previousOutcomes.map(x=>x.outcome),['LOSS','LOSS','WIN']);
  assert.equal(f.settledAt,'2026-09-02T10:00:00.000Z','first settlement timestamp must remain immutable');
}

{
  const f=fixture();
  reconcileSettlementScore(f,2,0,{nowIso:'2026-09-02T11:00:00.000Z',source:'API_FOOTBALL_RECOVERY'});
  const second=reconcileSettlementScore(f,2,0,{nowIso:'2026-09-02T12:00:00.000Z',source:'API_FOOTBALL_RECOVERY'});
  assert.equal(second.scoreCorrected,false);
  assert.equal(second.correctedOutcomes,0);
  assert.equal(f.settlementCorrections.length,1,'same corrected score must be idempotent');
}

{
  const f={picks:[{key:'draw',odds:3}]};
  const r=reconcileSettlementScore(f,1,1,{nowIso:'2026-09-02T10:00:00.000Z',source:'LIVE_FEED_FINAL_SCORE'});
  assert.equal(r.settled,1);
  assert.equal(f.picks[0].outcome,'WIN');
  assert.equal(f.picks[0].pl,2);
  assert.equal(f.settlementCorrections,undefined,'first settlement is not a correction');
}

console.log('shadow score correction regression: PASS');
