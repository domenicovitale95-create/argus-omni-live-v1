import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../immo-option-pro.html',import.meta.url),'utf8');
for(const id of ['useLotMatrix','lotRows','lotMatrixSummary','cashAfterKeep','score','loadComps']){
  assert.ok(html.includes('id="'+id+'"'),'missing required Option Pro element: '+id);
}
const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(match,'Option Pro module script not found');
const source=match[1].replace(/^\s*import[^;]+;\s*/,'');
new Function(source);
console.log('ARGUS OPTION page syntax: OK');
