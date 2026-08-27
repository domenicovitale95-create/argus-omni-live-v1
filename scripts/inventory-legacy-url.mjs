import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = 'node_modules';
const findings = [];

async function walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!/\.(?:js|cjs|mjs)$/.test(entry.name)) continue;
    let text = '';
    try { text = await readFile(path, 'utf8'); } catch { continue; }
    const matches = [];
    if (text.includes('url.parse(')) matches.push('url.parse');
    if (text.includes('url.resolve(')) matches.push('url.resolve');
    if (text.includes("require('url')") || text.includes('require("url")') || text.includes("require('node:url')") || text.includes('require("node:url")')) matches.push('legacy-url-import');
    if (matches.length) findings.push({ path, matches });
  }
}

await walk(root);
console.log(JSON.stringify({ count: findings.length, findings }, null, 2));
