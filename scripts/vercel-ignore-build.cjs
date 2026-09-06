const { execFileSync } = require('node:child_process');

const ref = process.env.VERCEL_GIT_COMMIT_REF;
const current = process.env.VERCEL_GIT_COMMIT_SHA;

// Keep preview branches ignored, matching the existing project policy.
if (ref !== 'main') process.exit(0);

// Fail open to a normal build whenever the current commit is unavailable.
if (!current) process.exit(1);

try {
  // Vercel's build clone may not contain VERCEL_GIT_PREVIOUS_SHA. Inspect the
  // current commit itself so data-only commits can still be skipped reliably.
  const files = execFileSync(
    'git',
    ['show', '--pretty=', '--name-only', current],
    { encoding: 'utf8' }
  ).trim().split(/\r?\n/).filter(Boolean);

  const noFootballRuntimeChange = files.length > 0 && files.every(file =>
    file.startsWith('research/daily/') ||
    file.startsWith('capital/data/')
  );

  process.exit(noFootballRuntimeChange ? 0 : 1);
} catch (_) {
  process.exit(1);
}
