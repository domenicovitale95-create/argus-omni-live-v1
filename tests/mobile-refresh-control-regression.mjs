import fs from 'node:fs';
import assert from 'node:assert/strict';

const mobile=fs.readFileSync(new URL('../mobile-scan-fix.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

assert.match(mobile,/refreshSiteBtn/,'refresh control must be installed');
assert.match(mobile,/Refresh ARGUS site and latest data/,'refresh control must be accessible');
assert.match(mobile,/registration\.update\(\)/,'refresh should still check for a fresh service worker');
assert.match(mobile,/Promise\.race/,'service-worker refresh should remain bounded');
assert.match(mobile,/await window\.scanToday\(\)/,'refresh must request fresh visible data before navigation fallback');
assert.match(mobile,/aria-busy/,'refresh must expose its busy state accessibly');
assert.match(mobile,/_argusRefresh/,'fallback navigation must cache-bust the page URL');
assert.match(mobile,/window\.location\.assign/,'refresh must retain a full-navigation fallback');
assert.doesNotMatch(mobile,/await\s+refreshServiceWorker\(\)/,'refresh must not wait for service-worker activation');
assert.match(mobile,/matchMedia\('\(max-width:700px\)'\)/,'mobile layout must be explicit');
assert.match(mobile,/touchAction='manipulation'/,'refresh control must be touch-safe');
assert.match(mobile,/minHeight='46px'/,'refresh control must keep a mobile tap target');
assert.match(mobile,/force:requestedForce&&explicitManualScan/,'background refresh must not gain forced provider authority');
assert.match(sw,/argus-shell-v15/,'PWA shell must be version-bumped for the real-data refresh fix');
assert.match(sw,/\/mobile-scan-fix\.js/,'mobile refresh code must remain in PWA precache');
assert.doesNotMatch(sw,/clients\.matchAll\(\{type:'window'.*c\.navigate\(c\.url\)/s,'service-worker activation must not navigate open pages');
assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\).*cache:'no-store'/s,'API requests must remain network no-store');

console.log('mobile refresh control regression: ok');