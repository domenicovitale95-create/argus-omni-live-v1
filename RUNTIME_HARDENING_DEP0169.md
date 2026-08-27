# ARGUS Runtime Hardening — DEP0169

Status: candidate fix, not production-verified until preview/CI gates pass.

## Root cause

ARGUS contains no direct `url.parse()` call. The installed `web-push@3.6.7` runtime contains legacy `url.parse()` usage. Upstream commit `658a8889aa06cb7292d16ae7f95773a9e97ded04` replaces those calls with WHATWG `URL` while preserving the exports ARGUS uses.

## Change

- Pin `web-push` to upstream commit `658a8889aa06cb7292d16ae7f95773a9e97ded04`.
- Add a GitHub regression gate that installs dependencies on Node 24, rejects legacy `url.parse()` in the installed web-push runtime, and verifies required exports.

## Safety

- No forecasting model change.
- No PRIME/NO BET threshold change.
- No provider quota policy change.
- No authentication weakening.
- No real-money wagering change.
- Rollback: revert the package pin and regression workflow commit.

## Promotion gate

Merge only after preview build succeeds and the regression workflow passes. After production promotion, verify fresh runtime logs show no new DEP0169 occurrences attributable to the new deployment. Historical occurrences remain expected in a rolling 24h window until they age out.
