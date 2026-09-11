const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repo = mkdtempSync(join(tmpdir(), 'argus-vercel-ignore-'));
const script = join(process.cwd(), 'scripts', 'vercel-ignore-build.cjs');

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function commit(path, content, message) {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  git('add', path);
  git('commit', '-m', message);
  return git('rev-parse', 'HEAD');
}

function decision(sha, ref = 'main') {
  return spawnSync(process.execPath, [script], {
    cwd: repo,
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref, VERCEL_GIT_COMMIT_SHA: sha }
  }).status;
}

git('init', '-b', 'main');
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'ARGUS test');

const runtime = commit('api/runtime.js', 'v1\n', 'runtime change');
assert.equal(decision(runtime), 1, 'runtime changes must build');

const firstData = commit('capital/data/latest.json', '{}\n', 'first data refresh');
assert.equal(decision(firstData), 1, 'first data commit after runtime change must recover build');

const secondData = commit('capital/data/latest.json', '{"v":2}\n', 'second data refresh');
assert.equal(decision(secondData), 0, 'consecutive data-only commits must be ignored');
assert.equal(decision(secondData, 'preview'), 0, 'preview branches remain ignored');

console.log('vercel ignore-build regression: PASS');
