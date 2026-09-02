import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../api/live.js',import.meta.url),'utf8');

assert.doesNotMatch(
  source,
  /minuteRemaining!==null&&minuteRemaining>MIN_MINUTE_RESERVE\)minuteBlockedUntil=0/,
  'a concurrent successful response must not cancel an active minute cooldown'
);
assert.match(
  source,
  /if\(minuteBlockedUntil&&Date\.now\(\)>=minuteBlockedUntil\)\{minuteBlockedUntil=0;apiQuota\.minuteRemaining=null\}/,
  'minute cooldown may only clear after its deadline'
);
assert.match(
  source,
  /buildExternalCalls=0;secondaryExternalCalls=0;apiQuota\.providerError=null;await loadQuotaGuard\(\)/,
  'each build must start with a fresh provider error observation'
);
assert.match(
  source,
  /if\(kind==='minute'\)\{minuteBlockedUntil=Date\.now\(\)\+MINUTE_COOLDOWN_MS;apiQuota\.providerError=/,
  'minute-limit responses must activate cooldown and expose the error'
);

console.log('provider minute cooldown regression: ok');
