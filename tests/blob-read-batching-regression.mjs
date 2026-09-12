import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../api/_report-store.js', import.meta.url), 'utf8');

assert.match(
  source,
  /export async function readManyJson\(blobs, options = \{\}\)/,
  'bulk JSON reads must expose bounded batching options'
);
assert.match(
  source,
  /Math\.max\(1, Math\.min\(16, Number\(options\.concurrency\) \|\| 8\)\)/,
  'bulk reads must enforce a conservative concurrency bound'
);
assert.match(
  source,
  /blobs\.slice\(offset, offset \+ concurrency\)\.map\(\(blob\) => readJson\(blob\.pathname, null\)\)/,
  'each batch must keep using the existing cached JSON reader'
);
assert.match(
  source,
  /out\.push\(\.\.\.batch\.filter\(Boolean\)\)/,
  'results must retain source order while omitting unreadable blobs'
);
assert.doesNotMatch(
  source,
  /for \(const blob of blobs\) \{\s*const row = await readJson/,
  'bulk reads must not serialize every Blob round trip'
);

console.log('bounded Blob read batching regression: ok');
