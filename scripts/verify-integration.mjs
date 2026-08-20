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
function storageLiteralCalls(source) {
  const calls = [];
  const re = /\b(readJson|writeJson|listJson)\s*\(\s*(['"])([^'"\n]+)\2/g;
  for (const match of source.matchAll(re)) calls.push({ fn: match[1], pathname: match[3] });
  return calls;
}
function validateStoragePath(file, fn, pathname) {
  const rel = path.relative(ROOT, file);
  if (!pathname) return fail(`${rel}: ${fn} has an empty storage path`);
  if (pathname.startsWith('/')) fail(`${rel}: ${fn} storage path must be relative: ${pathname}`);
  if (pathname.includes('\\')) fail(`${rel}: ${fn} storage path contains backslash: ${pathname}`);
  if (pathname.includes('..')) fail(`${rel}: ${fn} storage path contains parent traversal: ${pathname}`);
  if (pathname.includes('//')) fail(`${rel}: ${fn} storage path contains duplicate slash: ${pathname}`);
  if (fn === 'writeJson' && !pathname.endsWith('.json')) fail(`${rel}: writeJson literal path should end in .json: ${pathname}`);
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
const cronPaths = new Set();
for (const cron of crons) {
  if (!cron?.path || !cron?.schedule) { fail(`vercel.json: malformed cron ${JSON.stringify(cron)}`); continue; }
  const canonicalPath = String(cron.path).split('?')[0];
  if (cronPaths.has(canonicalPath)) fail(`vercel.json: duplicate cron endpoint ${canonicalPath}`);
  cronPaths.add(canonicalPath);
  const file = endpointFile(cron.path);
  if (file && !fs.existsSync(file)) fail(`vercel.json: cron ${cron.path} has no matching ${path.relative(ROOT, file)}`);
}
note(`verified ${crons.length} Vercel cron route(s) and uniqueness`);

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

const apiDir = path.join(ROOT, 'api');
const apiFiles = walk(apiDir);
let storageCalls = 0;
let storageWriters = 0;
let cronStorageWriters = 0;
const literalPaths = new Set();
for (const file of apiFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const calls = storageLiteralCalls(source);
  for (const call of calls) {
    storageCalls += 1;
    if (call.fn === 'writeJson') storageWriters += 1;
    literalPaths.add(call.pathname);
    validateStoragePath(file, call.fn, call.pathname);
  }
  const route = `/api/${path.basename(file, '.js')}`;
  if (cronPaths.has(route) && /\bwriteJson\s*\(/.test(source)) {
    cronStorageWriters += 1;
    if (!/from\s+['"]\.\/_report-store\.js['"]/.test(source)) {
      fail(`${path.relative(ROOT, file)}: cron writes persistent state without importing _report-store.js`);
    }
  }
}
note(`audited ${storageCalls} literal storage call(s), ${storageWriters} writer(s), ${literalPaths.size} unique path/prefix contract(s)`);
note(`identified ${cronStorageWriters} cron endpoint(s) with persistent write behavior`);

const reportStore = path.join(ROOT, 'api/_report-store.js');
if (!fs.existsSync(reportStore)) fail('api/_report-store.js: missing shared persistence adapter');
else {
  const source = fs.readFileSync(reportStore, 'utf8');
  for (const required of ['storageReady', 'readJson', 'writeJson', 'listJson']) {
    if (!new RegExp(`export\\s+(?:async\\s+)?function\\s+${required}\\b`).test(source)) {
      fail(`api/_report-store.js: missing exported ${required}()`);
    }
  }
  if (!/addRandomSuffix\s*:\s*false/.test(source) || !/allowOverwrite\s*:\s*true/.test(source)) {
    fail('api/_report-store.js: deterministic overwrite semantics are required for latest-state snapshots');
  }
  note('verified shared Vercel Blob persistence adapter and deterministic snapshot overwrite semantics');
}

const governanceCore = path.join(ROOT, 'api/_governance-core.js');
if (!fs.existsSync(governanceCore)) fail('api/_governance-core.js: missing central governance core');

console.log('ARGUS integration verification');
for (const message of notes) console.log(`OK  ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`FAIL ${message}`);
  process.exit(1);
}
console.log('OK  integration, cron and storage invariants passed');
