import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/official-decisions.js',import.meta.url),'utf8');
const archiveStart=source.indexOf('async function archive(');
const archiveEnd=source.indexOf('function enforceMetricSemantics',archiveStart);
const archive=archiveStart>=0&&archiveEnd>archiveStart?source.slice(archiveStart,archiveEnd):'';

assert.ok(archive,'prediction archive client must exist');
assert.match(archive,/fetch\('\/api\/predictions'/,'archive must use the same-origin prediction endpoint');
assert.match(archive,/method:'POST'/,'archive must remain a POST request');
assert.match(archive,/body:JSON\.stringify\(\{matches,analyses,meta\}\)/,'archive must send the complete snapshot');
assert.doesNotMatch(archive,/keepalive\s*:/,'large snapshots must not use keepalive because browsers reject payloads beyond the keepalive quota');
assert.match(archive,/if\(!r\.ok\)telemetry\('PREDICTION_ARCHIVE_HTTP_FAILURE'/,'HTTP failures must remain observable');
assert.match(archive,/catch\(error\)\{telemetry\('PREDICTION_ARCHIVE_FAILURE'/,'transport failures must remain observable');

console.log('prediction archive client regression: ok');
