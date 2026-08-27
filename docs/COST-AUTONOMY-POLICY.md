# ARGUS cost/autonomy policy

Production scheduling is intentionally cost-aware and fail-closed.

- Vercel is the primary scheduler.
- Fast cycle, Autopilot and training paper-bet reconciliation run every 15 minutes.
- Autonomous supervisor runs every 30 minutes.
- GitHub Actions is backup-only for fast-cycle/supervisor recovery; it must not duplicate normal primary work.
- Health thresholds must be wider than the primary cadence and include scheduler jitter.
- Preview/branch commits are ignored by Vercel builds; production builds are created from `main` only.
- Data-quality degradation must reduce/stop candidate generation rather than increase polling.
- Real-money automatic wagering stays disabled. Paper-betting may be observed or simulated only.

Any future cadence change must update `vercel.json`, `api/fast-cycle-health.js`, `api/autonomy-health.js`, and the backup scheduler in the same commit.
