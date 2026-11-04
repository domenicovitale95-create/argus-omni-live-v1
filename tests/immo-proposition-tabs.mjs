import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {BRUSSELS_COMMUNES} from '../api/immo-brussels-zones.js';
const code=readFileSync(new URL('../immo-simple.js',import.meta.url),'utf8');
const seed=readFileSync(new URL('./immo-one-click-search.mjs',import.meta.url),'utf8');
// Reuse the existing DOM harness, exposing the actual tab filter.
const harness=seed.slice(seed.indexOf('function element()'),seed.indexOf('vm.runInNewContext'));
const sets=[];
for(const path of ['/immo-opportunities','/immo-proposition-2']){
 const sandbox={assert,vm,readFileSync,URL,AbortSignal,setInterval,clearInterval,Intl,Date,console};
 vm.runInNewContext(harness.replace("pathname:'/immo-opportunities'",`pathname:'${path}'`)+"globalThis.ctx=context;",sandbox);
 vm.runInNewContext(code.replace('})();','globalThis.tab={allowed,city};})();'),sandbox.ctx);
 const {allowed,city}=sandbox.ctx.tab;
 sets.push(new Set(allowed));
 for(const commune of BRUSSELS_COMMUNES)for(const pc of commune.postcodes)assert.equal(city({postalCode:pc}),commune.name);
 const html=readFileSync(new URL(path.slice(1)+'.html','file://'+process.cwd()+'/'),'utf8');
 assert.ok(html.includes('href="/immo-proposition-2"'));
 assert.ok(html.includes(`aria-current="page" href="${path}"`));
}
assert.equal(sets[0].size,19);assert.equal(sets[1].size,4);
assert.deepEqual([...sets[1]].sort(),['Anderlecht','Auderghem','Saint-Josse-ten-Noode','Schaerbeek']);
assert.equal([...sets[0]].filter(c=>sets[1].has(c)).length,4);
assert.equal(new Set([...sets[0],...sets[1]]).size,19);
console.log('PASS: 19 main communes, 4 secondary shortcut communes, all postcodes and active tabs');
