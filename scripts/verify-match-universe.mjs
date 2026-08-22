import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const target=path.join(ROOT,'api/match-universe-scheduler.js');
const failures=[];
const requireMatch=(re,msg)=>{if(!re.test(source))failures.push(msg)};

if(!fs.existsSync(target)){
  console.error('FAIL api/match-universe-scheduler.js is missing');
  process.exit(1);
}
const source=fs.readFileSync(target,'utf8');

requireMatch(/version:\s*['"]MATCH-UNIVERSE-SCHEDULER-2['"]/, 'scheduler version contract missing');
requireMatch(/providerCalls:\s*0\b/, 'scheduler must declare zero provider calls');
requireMatch(/readOnly:\s*true\b/, 'scheduler must remain read-only');
requireMatch(/liveIsSensorNotBrain:\s*true\b/, 'LIVE sensor doctrine missing');
requireMatch(/fourPopulations:\s*true\b/, 'four-population doctrine missing');
requireMatch(/futurePrematch:\s*\{/, 'FUTURE/PREMATCH population missing');
requireMatch(/live:\s*\{count:/, 'LIVE population missing');
requireMatch(/settled:\s*\{count:/, 'SETTLED population missing');
requireMatch(/historical:\s*\{fixtureCount:/, 'HISTORICAL population missing');
requireMatch(/nextBestAction:\s*next/, 'nextBestAction arbitration missing');
requireMatch(/doesNotReplaceDecisionScheduler:\s*true\b/, 'decision-scheduler coexistence boundary missing');
requireMatch(/mayChangeVerdict:\s*false\b/, 'scheduler must not mutate verdicts');
requireMatch(/mayChangeStake:\s*false\b/, 'scheduler must not mutate stakes');
requireMatch(/mayPromote:\s*false\b/, 'scheduler must not promote models or policies');
requireMatch(/HALT:70,EXHAUSTED:70,EMERGENCY:60,SAFE:45,CONSERVE:25/, 'quota pressure must penalize LIVE value-of-information');
requireMatch(/argus\/autopilot\/quota-efficiency\.json/, 'quota-efficiency snapshot reuse missing');
requireMatch(/quotaEfficiencySnapshot:\s*true\b/, 'quota-efficiency reuse contract missing');
requireMatch(/PAUSED_MEMORY_GUARD/, 'historical memory-guard branch missing');
requireMatch(/INSUFFICIENT_HISTORY/, 'historical insufficient-evidence branch missing');

if(/\bfetch\s*\(/.test(source))failures.push('scheduler must not make network fetch calls');
if(/\bwriteJson\s*\(/.test(source))failures.push('scheduler must not persist or mutate state');
if(/API_FOOTBALL_KEY|v3\.football\.api-sports\.io/.test(source))failures.push('scheduler must not depend directly on API-Football');

console.log('ARGUS Match-Universe scheduler verification');
if(failures.length){for(const f of failures)console.error(`FAIL ${f}`);process.exit(1)}
console.log('OK  four populations present');
console.log('OK  LIVE is resource-penalized under quota pressure');
console.log('OK  quota-efficiency intelligence is reused without provider calls');
console.log('OK  provider-free, read-only and no-promotion boundaries preserved');
console.log('OK  historical memory/evidence fail-safe branches preserved');
