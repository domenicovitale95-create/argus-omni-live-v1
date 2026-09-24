import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectProviderProbeDates } from '../api/training-bets-v1.js';

const bet=(date,id)=>({fixtureId:id,kickoff:`${date}T20:00:00+02:00`,status:'OPEN'});

{
  const overdue=[
    bet('2026-09-11',1),bet('2026-09-12',2),bet('2026-09-13',3),bet('2026-09-14',4),
    bet('2026-09-16',5),bet('2026-09-17',6),bet('2026-09-18',7),bet('2026-09-19',8),
    bet('2026-09-20',9),bet('2026-09-22',10),bet('2026-09-23',11)
  ];
  const state={settlementProbe:{providerDateLastProbeAt:{}}};
  const dates=selectProviderProbeDates(state,overdue);
  assert.equal(dates.length,11,'first run after upgrade must catch up the existing date backlog');
  assert.equal(dates[0],'2026-09-23','bootstrap catch-up should start with the newest unresolved date');
}

{
  const overdue=[bet('2026-09-20',1),bet('2026-09-22',2),bet('2026-09-23',3)];
  const state={settlementProbe:{providerDateLastProbeAt:{
    '2026-09-20':'2026-09-24T10:00:00.000Z',
    '2026-09-22':'2026-09-24T12:00:00.000Z',
    '2026-09-23':'2026-09-24T14:00:00.000Z'
  }}};
  assert.deepEqual(selectProviderProbeDates(state,overdue),['2026-09-20','2026-09-22'],'normal runs must rotate least-recently-probed dates instead of starving them');
}

{
  const overdue=[bet('2026-09-20',1),bet('2026-09-22',2),bet('2026-09-24',3)];
  const state={settlementProbe:{providerDateLastProbeAt:{
    '2026-09-20':'2026-09-24T10:00:00.000Z',
    '2026-09-22':'2026-09-24T12:00:00.000Z'
  }}};
  assert.equal(selectProviderProbeDates(state,overdue)[0],'2026-09-24','a never-probed new date must jump ahead of previously checked dates');
}

{
  const ui=await readFile(new URL('../training-bets.html',import.meta.url),'utf8');
  assert.match(ui,/RESULT PENDING/);
  assert.match(ui,/MATCH IN PROGRESS/);
  assert.match(ui,/settlement\?\.finalScore/);
}

console.log('training bets settlement regression: PASS');
