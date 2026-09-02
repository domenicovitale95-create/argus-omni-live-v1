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
  'each build must load the shared quota guard before provider calls'
);
assert.match(
  source,
  /async function persistMinuteCooldown\(data\)\{minuteBlockedUntil=Date\.now\(\)\+MINUTE_COOLDOWN_MS;apiQuota\.minuteRemaining=0;/,
  'minute-limit responses must mark remaining minute capacity as exhausted locally'
);
assert.match(
  source,
  /minuteBlockedUntil:new Date\(minuteBlockedUntil\)\.toISOString\(\)/,
  'minute cooldown must be persisted in the shared quota guard'
);
assert.match(
  source,
  /sharedMinuteBlockedUntil=new Date\(state\?\.minuteBlockedUntil\|\|0\)\.getTime\(\)/,
  'each serverless instance must read the shared minute cooldown'
);
assert.match(
  source,
  /minuteBlockedUntil=Math\.max\(minuteBlockedUntil,sharedMinuteBlockedUntil\);apiQuota\.minuteRemaining=0;/,
  'shared cooldown must block the local instance and report zero remaining capacity'
);
assert.match(
  source,
  /if\(current\?\.exhausted&&currentDay===day&&!currentIsMinute\)return;/,
  'a minute cooldown must never overwrite a true daily exhaustion guard'
);
assert.match(
  source,
  /if\(kind==='minute'\)\{await persistMinuteCooldown\(data\);/,
  'provider minute-limit responses must activate and persist the shared cooldown'
);
assert.match(
  source,
  /function quotaMeta\(\)\{if\(minuteBlockedUntil&&Date\.now\(\)>=minuteBlockedUntil\)\{minuteBlockedUntil=0;apiQuota\.minuteRemaining=null;/,
  'quota reporting must clear an expired minute cooldown even on cache hits'
);

console.log('provider minute cooldown regression: ok');
