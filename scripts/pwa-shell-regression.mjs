import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const failures = [];

const fail = (message) => failures.push(message);

for (const asset of ['src/providers.js', 'app.js', 'mobile-scan-fix.js']) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`${escaped}\\?v=`).test(index)) fail(`manual version pin found on ${asset}`);
}
if (/serviceWorker\.register\(['"]\/sw\.js\?v=/.test(index)) fail('manual version pin found on service worker registration');
if (!/serviceWorker\.register\(['"]\/sw\.js['"],\{updateViaCache:['"]none['"]\}\)/.test(index)) fail('service worker must register with updateViaCache:none');
if (!/await reg\.update\(\)/.test(index)) fail('service worker registration must explicitly request an update');

if (!/const CACHE=['"]argus-shell-v\d+['"]/.test(sw)) fail('service worker cache must use an argus-shell version');
if (!sw.includes("url.pathname.startsWith('/api/')")) fail('API requests must bypass the PWA shell cache');
if (!sw.includes("fetch(e.request,{cache:'no-store'})")) fail('service worker network requests must bypass HTTP cache');
if (!sw.includes("k.startsWith('argus-shell-')&&k!==CACHE")) fail('old ARGUS shell caches must be deleted on activation');
if (!sw.includes('self.skipWaiting()')) fail('new service worker must skip waiting');
if (!sw.includes('await self.clients.claim()')) fail('new service worker must claim active clients');

const protectedPaths = ['/', '/index.html', '/sw.js', '/app.js', '/mobile-scan-fix.js', '/src/providers.js'];
const headerRules = new Map((vercel.headers || []).map(rule => [rule.source, rule.headers || []]));
for (const source of protectedPaths) {
  const headers = headerRules.get(source);
  if (!headers) {
    fail(`missing anti-stale headers for ${source}`);
    continue;
  }
  const values = new Map(headers.map(header => [String(header.key).toLowerCase(), String(header.value).toLowerCase()]));
  if (!values.get('cache-control')?.includes('no-store')) fail(`Cache-Control no-store missing for ${source}`);
  if (!values.get('cdn-cache-control')?.includes('no-store')) fail(`CDN-Cache-Control no-store missing for ${source}`);
  if (!values.get('vercel-cdn-cache-control')?.includes('no-store')) fail(`Vercel-CDN-Cache-Control no-store missing for ${source}`);
}

if (failures.length) {
  console.error('PWA shell regression guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PWA shell regression guard passed. Core shell cannot silently rely on stale manual version pins or cacheable delivery.');
