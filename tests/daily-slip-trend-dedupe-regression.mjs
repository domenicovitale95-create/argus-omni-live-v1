import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dedupeTrendRows, trendIdentity } from '../api/_daily-slip-trend-dedupe.js';

const source=fs.readFileSync(new URL('../api/daily-slip.js',import.meta.url),'utf8');
const rows=[
  {fixtureId:1635072,team:'Iskra',condition:'OVER_0_5_GOALS'},
  {fixtureId:1635072,team:'Iskra',condition:'OVER_0_5_GOALS'},
  {fixtureId:1582788,team:'Velež',condition:'OVER_0_5_GOALS'},
  {fixtureId:1582788,team:'Vélez',condition:'OVER_0_5_GOALS'},
  {fixtureId:1582788,team:'Radnik Bijeljina',condition:'OVER_0_5_GOALS'}
];
const clean=dedupeTrendRows(rows);
assert.equal(clean.length,3,'exact and accent-only duplicate Trend rows must count once');
assert.equal(trendIdentity(rows[2]),trendIdentity(rows[3]),'team spelling accents must not bypass identity');
assert.match(source,/dedupeTrendRows\(rawTrend10\)/,'Daily Slip must use deterministic Trend dedupe');
assert.match(source,/deduplicatedCount:rawTrend10\.length-trend10\.length/,'Daily Slip must expose removed duplicates');
assert.match(source,/duplicateIdentity:'FIXTURE_TEAM_CONDITION'/,'Trend identity policy must be explicit');
assert.match(source,/status:rows\.length\?'READY':'WAIT'/,'Trend rows must remain unable to create READY');
assert.match(source,/automaticBetPlacement:false/,'automatic betting must remain disabled');
console.log('daily-slip trend dedupe regression: PASS');
