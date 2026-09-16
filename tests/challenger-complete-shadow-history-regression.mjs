import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/challenger-factory.js',import.meta.url),'utf8');

assert.match(source,/\blistJsonComplete\b/,'challenger factory must use cursor-safe complete listing');
assert.doesNotMatch(source,/\blistJson\s*\(/,'legacy capped listJson helper must not be used for challenger evidence');
assert.match(source,/listJsonComplete\('argus\/shadow\/',\{maxBlobs:5000,pageSize:500\}\)/,'challenger factory must scan the SHADOW prefix with an explicit high cap');
assert.match(source,/if\(!listing\.complete\)return res\.status\(503\)/,'incomplete evidence listing must fail closed');
assert.match(source,/SHADOW_LISTING_INCOMPLETE/,'incomplete-history error must be explicit');
assert.match(source,/readManyJson\(listing\.blobs\)/,'only the verified complete listing may be read');
assert.match(source,/completeShadowHistoryRequired:true/,'response policy must disclose complete-history requirement');
assert.match(source,/automaticPromotion:false/,'fail-closed path must not gain promotion authority');
assert.match(source,/automaticRealWagering:false/,'fail-closed path must not gain real-wagering authority');

const guard=source.indexOf('if(!listing.complete)');
const read=source.indexOf('readManyJson(listing.blobs)');
const write=source.indexOf('writeJson(PATH,state)');
assert.ok(guard>=0&&read>guard,'history completeness must be checked before evidence is read');
assert.ok(write>guard,'state mutation must remain unreachable until after the completeness guard');

console.log('challenger complete shadow history regression: PASS');
