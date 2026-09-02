import fs from 'node:fs';
import assert from 'node:assert/strict';

const mobile=fs.readFileSync(new URL('../mobile-scan-fix.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

assert.match(mobile,/refreshSiteBtn/,'refresh control must be installed');
assert.match(mobile,/Refresh ARGUS site and latest data/,'refresh control must be accessible');
assert.match(mobile,/registration\.update\(\)/,'refresh must check for a fresh service worker');
assert.match(mobile,/Promise\.race/,'service-worker refresh must have a bounded wait');
assert.match(mobile,/_argusRefresh/,'refresh navigation must cache-bust the page URL');
assert.match(mobile,/window\.location\.replace/,'refresh must perform a full fresh navigation');
assert.match(mobile,/matchMedia\('\(max-width:700px\)'\)/,'mobile layout must be explicit');
assert.match(mobile,/touchAction='manipulation'/,'refresh control must be touch-safe');
assert.match(mobile,/minHeight='46px'/,'refresh control must keep a mobile tap target');
assert.match(mobile,/force:requestedForce&&explicitManualScan/,'background refresh must not gain forced provider authority');
assert.match(sw,/argus-shell-v13/,'PWA shell must be version-bumped for the refresh control');
assert.match(sw,/\/mobile-scan-fix\.js/,'mobile refresh code must remain in PWA precache');
assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\).*cache:'no-store'/s,'API requests must remain network no-store');

console.log('mobile refresh control regression: ok');
