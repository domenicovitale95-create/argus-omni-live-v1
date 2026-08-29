const { execFileSync } = require('node:child_process');

const ref = process.env.VERCEL_GIT_COMMIT_REF;
const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
const current = process.env.VERCEL_GIT_COMMIT_SHA;

// Keep preview branches ignored, matching the previous project behavior.
if (ref !== 'main') process.exit(0);

// Fail open to a normal build whenever the comparison is unavailable.
if (!previous || !current) process.exit(1);

try {
  const files = execFileSync(
    'git',
    ['diff', '--name-only', previous, current],
    { encoding: 'utf8' }
  ).trim().split(/\r?\n/).filter(Boolean);

  const researchOnly = files.length > 0 && files.every(file => file.startsWith('research/daily/'));
  process.exit(researchOnly ? 0 : 1);
} catch (_) {
  process.exit(1);
}
