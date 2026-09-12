import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../api/autopilot-v2.js',import.meta.url),'utf8');

assert.match(
  source,
  /function compactPreKickoffBody\(body=\{\}\)/,
  'autopilot must provide a dedicated pre-kickoff payload projection'
);
assert.match(
  source,
  /if\(path==='\/api\/prekickoff-gate'\)return compactPreKickoffBody\(body\)/,
  'pre-kickoff requests must use the dedicated compact projection'
);
assert.match(
  source,
  /minutesToKickoff\(m\)>=0&&minutesToKickoff\(m\)<=69/,
  'the projection must retain exactly the gate evaluation horizon'
);
assert.match(
  source,
  /markets:\{home:x\.home\?\?null,draw:x\.draw\?\?null,away:x\.away\?\?null\}/,
  'the projection must preserve the 1X2 odds required for edge checks'
);
assert.match(
  source,
  /preMatchModel:p\?\{home:p\.home\?\?null,draw:p\.draw\?\?null,away:p\.away\?\?null\}:null/,
  'the projection must preserve the forecast triplet'
);
assert.match(
  source,
  /critical=a=>Array\.from\(\{length:Array\.isArray\(a\)\?a\.length:0\},\(\)=>1\)/,
  'critical absence counts must survive compaction without detailed player payloads'
);
assert.match(
  source,
  /Object\.entries\(body\.availability\)\.filter\(\(\[id\]\)=>ids\.has\(String\(id\)\)\)/,
  'availability data must be restricted to retained fixtures'
);

console.log('pre-kickoff payload compaction regression: ok');
