import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/official-decisions.js',import.meta.url),'utf8');
const archiveStart=source.indexOf('async function archive(');
const archiveEnd=source.indexOf('function enforceMetricSemantics',archiveStart);
const archive=archiveStart>=0&&archiveEnd>archiveStart?source.slice(archiveStart,archiveEnd):'';

assert.ok(archive,'prediction archive client must exist');
assert.match(archive,/fetch\('\/api\/predictions'/,'archive must use the same-origin prediction endpoint');
assert.match(archive,/method:'POST'/,'archive must remain a POST request');
assert.match(source,/const ARCHIVE_BATCH_SIZE=20/,'archive batches must remain below common serverless body limits');
assert.match(archive,/matches\.slice\(start,start\+ARCHIVE_BATCH_SIZE\)/,'matches must be split into bounded batches');
assert.match(archive,/analyses\.slice\(start,start\+ARCHIVE_BATCH_SIZE\)/,'analyses must use identical batch boundaries');
assert.match(archive,/body:JSON\.stringify\(\{matches:batchMatches,analyses:batchAnalyses,meta\}\)/,'archive must send aligned batch payloads');
assert.match(archive,/await r\.json\(\)\.catch\(\(\)=>null\)/,'HTTP failures must capture the server reason safely');
assert.match(archive,/PREDICTION_ARCHIVE_CLIENT_PAYLOAD_INVALID/,'mismatched client arrays must be rejected before transport');
assert.doesNotMatch(archive,/keepalive\s*:/,'large snapshots must not use keepalive because browsers reject payloads beyond the keepalive quota');
assert.match(archive,/telemetry\('PREDICTION_ARCHIVE_HTTP_FAILURE'/,'HTTP failures must remain observable');
assert.match(archive,/catch\(error\)\{telemetry\('PREDICTION_ARCHIVE_FAILURE'/,'transport failures must remain observable');

console.log('prediction archive client regression: ok');
