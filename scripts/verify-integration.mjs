import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const failures = [];
const notes = [];

function fail(message) { failures.push(message); }
function note(message) { notes.push(message); }
function readJson(rel) {
  const abs = path.join(ROOT, rel);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (error) { fail(`${rel}: invalid JSON (${error.message})`); return null; }
}
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(?:js|mjs)$/.test(entry.name)) out.push(abs);
  }
  return out;
}
function endpointFile(route) {
  const clean = String(route || '').split('?')[0].replace(/\/$/, '');
  if (!clean.startsWith('/api/')) return null;
  return path.join(ROOT, `${clean.slice(1)}.js`);
}

const pkg = readJson('package.json');
const vercel = readJson('vercel.json');
if (pkg && pkg.type !== 'module') fail('package.json: expected type="module" for ARGUS ESM endpoints');

const jsFiles = walk(ROOT);
for (const file of jsFiles) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) {
    const stderr = error?.stderr?.toString().trim();
    fail(`${path.relative(ROOT, file)}: syntax check failed${stderr ? ` — ${stderr}` : ''}`);
  }
}
note(`syntax-checked ${jsFiles.length} JS/MJS files`);

const crons = Array.isArray(vercel?.crons) ? vercel.crons : [];
for (const cron of crons) {
  if (!cron?.path || !cron?.schedule) { fail(`vercel.json: malformed cron ${JSON.stringify(cron)}`); continue; }
  const file = endpointFile(cron.path);
  if (file && !fs.existsSync(file)) fail(`vercel.json: cron ${cron.path} has no matching ${path.relative(ROOT, file)}`);
}
note(`verified ${crons.length} Vercel cron route(s)`);

const selfTestPath = path.join(ROOT, 'api/site-self-test.js');
if (!fs.existsSync(selfTestPath)) fail('api/site-self-test.js: missing critical observability endpoint');
else {
  const source = fs.readFileSync(selfTestPath, 'utf8');
  const routeMatches = [...source.matchAll(/['"](\/api\/[A-Za-z0-9_?=&./-]+)['"]/g)].map(m => m[1]);
  const criticalRoutes = [...new Set(routeMatches)];
  for (const route of criticalRoutes) {
    const file = endpointFile(route);
    if (file && !fs.existsSync(file)) fail(`site-self-test: observed route ${route} has no matching ${path.relative(ROOT, file)}`);
  }
  note(`verified ${criticalRoutes.length} API route reference(s) in site-self-test`);
}

const governanceCore = path.join(ROOT, 'api/_governance-core.js');
if (!fs.existsSync(governanceCore)) fail('api/_governance-core.js: missing central governance core');

console.log('ARGUS integration verification');
for (const message of notes) console.log(`OK  ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`FAIL ${message}`);
  process.exit(1);
}
console.log('OK  integration invariants passed');
