import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../node_modules/web-push/src/web-push-lib.js', import.meta.url);
let source = await readFile(target, 'utf8');

const replacements = [
  ["const url = require('url');\n", ''],
  ['const parsedUrl = url.parse(subscription.endpoint);', 'const parsedUrl = new URL(subscription.endpoint);'],
  ['const urlParts = url.parse(requestDetails.endpoint);', 'const urlParts = new URL(requestDetails.endpoint);'],
  ['httpsOptions.path = urlParts.path;', 'httpsOptions.path = urlParts.pathname + urlParts.search;']
];

for (const [before, after] of replacements) {
  if (!source.includes(before) && !source.includes(after)) {
    throw new Error(`web-push patch invariant missing: ${before}`);
  }
  source = source.replace(before, after);
}

if (/\burl\.parse\s*\(/.test(source)) {
  throw new Error('DEP0169 guard failed: legacy url.parse() remains in web-push runtime');
}

await writeFile(target, source, 'utf8');
console.log('ARGUS web-push patch applied: WHATWG URL only.');
