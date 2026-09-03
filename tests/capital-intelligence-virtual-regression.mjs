import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../market.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../capital/app.js',import.meta.url),'utf8');
const lab=fs.readFileSync(new URL('../capital/intelligence-lab.js',import.meta.url),'utf8');

assert.match(html,/id="intelligence"/,'intelligence section must be visible');
assert.match(html,/id="virtual"/,'virtual money lab must be visible');
assert.match(html,/id="simulator"/,'long-horizon investment simulator must remain present');
assert.match(html,/capital\/intelligence-lab\.js/,'shadow intelligence module must load');
assert.match(app,/ARGUS_CAPITAL_LAB\?\.render/,'dashboard data must feed the intelligence lab');

assert.match(lab,/REAL EXECUTION: /,'UI must expose real-execution state');
assert.match(lab,/real:'BLOCKED'/,'real-money execution must remain hard blocked');
assert.match(lab,/PAPER ONLY/,'virtual module must state paper-only');
assert.match(lab,/Risk Governor kept the virtual portfolio in cash/,'risk governor must be able to reject allocation');
assert.match(lab,/coverage<60/,'weak verified-data coverage must block paper allocation');
assert.match(lab,/entryProxyPrice/,'virtual entries must freeze a proxy entry price');
assert.match(lab,/scoreAtEntry/,'virtual entries must freeze the score at entry');
assert.match(lab,/benchmarkEntry/,'virtual portfolio must freeze a benchmark entry');
assert.doesNotMatch(lab,/broker.*(send|place|execute)|placeOrder|executeOrder/i,'shadow lab must not contain broker execution calls');

console.log('capital intelligence + virtual money regression: OK');
