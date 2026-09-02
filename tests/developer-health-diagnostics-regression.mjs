import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../api/developer-health.js',import.meta.url),'utf8');
const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const errorTextSource=source.match(/function errorText\(value\)\{[\s\S]*?\n\}/)?.[0]||'';

assert.ok(errorTextSource,'structured error serializer must exist');
const errorText=vm.runInNewContext(`${errorTextSource}; errorText`);
assert.equal(errorText(' provider failure '),'provider failure');
assert.equal(errorText({type:'PROVIDER_FAILURE',status:429}),'{"type":"PROVIDER_FAILURE","status":429}');
assert.equal(errorText({count:3n}),'{"count":"3"}');
assert.match(source,/errors\.map\(errorText\)/,'Developer Health diagnostics must serialize structured errors');
assert.doesNotMatch(source,/errors\.map\(x=>String\(x\|\|''\)/,'structured errors must not collapse to [object Object]');

console.log('developer health diagnostics regression: ok');
