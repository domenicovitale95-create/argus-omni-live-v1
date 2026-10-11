const { execFileSync } = require('node:child_process');

const ref = process.env.VERCEL_GIT_COMMIT_REF;
const current = process.env.VERCEL_GIT_COMMIT_SHA;

// Keep preview branches ignored, matching the existing project policy.
if (ref !== 'main') process.exit(0);

// Fail open to a normal build whenever the current commit is unavailable.
if (!current) process.exit(1);

function changedFiles(revision) {
  return execFileSync(
    'git',
    ['show', '--pretty=', '--name-only', revision],
    { encoding: 'utf8' }
  ).trim().split(/\r?\n/).filter(Boolean);
}

function isDataOnly(files) {
  return files.length > 0 && files.every(file =>
    file.startsWith('research/daily/') ||
    file.startsWith('capital/data/')
  );
}

try {
  const currentFiles = changedFiles(current);

  // Runtime changes always build. Data-only commits are normally skipped, but
  // the first one after a runtime change builds as a recovery path when the
  // original Git webhook/deployment was missed or superseded.
  if (!isDataOnly(currentFiles)) process.exit(1);

  const parentFiles = changedFiles(`${current}^`);
  process.exit(isDataOnly(parentFiles) ? 0 : 1);
} catch (_) {
  // A shallow clone may not contain the parent. Building is safer than hiding
  // a potentially undeployed runtime change.
  process.exit(1);
}
