import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/daily-slip.js', import.meta.url), 'utf8');

assert.match(
  source,
  /status:rows\.length\?'READY':'WAIT'/,
  'Daily Slip must be READY only when an eligible PRIME/VALUE row exists',
);
assert.doesNotMatch(
  source,
  /status:rows\.length\|\|trend10\.length/,
  'Informational Trend 10/10 signals must not mark a betting slip READY',
);
assert.match(
  source,
  /informationalOnly:true/,
  'Trend 10/10 must remain explicitly informational-only',
);
assert.match(
  source,
  /automaticBetPlacement:false/,
  'Daily Slip must keep automatic bet placement disabled',
);

console.log('daily-slip status regression: PASS');
