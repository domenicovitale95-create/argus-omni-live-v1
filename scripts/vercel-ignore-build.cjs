// Always build production commits, including real-estate dataset refreshes.
// Vercel ignoreCommand: exit 0 skips a build; exit 1 proceeds.
// Preview branches remain ignored under the existing project policy.
const ref = process.env.VERCEL_GIT_COMMIT_REF;
if (ref && ref !== 'main') process.exit(0);
process.exit(1);
