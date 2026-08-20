# ARGUS Deployment Readiness & Rollback Checklist

Purpose: define the minimum evidence required before any ARGUS R&D change can be considered deployment-ready. This checklist does not authorize production promotion.

## Hard readiness gates
- Integration verification passes.
- Deterministic golden fixtures pass, including governance and temporal-integrity invariants.
- Deployment Verifier remains read-only with provider quota spend disabled.
- Frozen predictions and settlements remain immutable.
- No automatic model promotion, rollback, PRIME creation, or real-money wagering is introduced.
- Storage/cron persistence contracts remain valid.
- Critical health endpoints are present and observable.
- Any substantive model/decision change remains RESEARCH/SHADOW until OOS, walk-forward, calibration/CLV, robustness, sufficient sample, and rollback evidence are satisfied.

## Rollback readiness
Before any future production promotion, record:
1. Exact source commit SHA and previous known-good production commit/deployment.
2. Files/modules changed and expected behavioral impact.
3. Predeclared failure signals: integrity failure, calibration/CLV degradation, material runtime error increase, stale data, storage failure, or unexpected PRIME frequency.
4. Reversion path: restore previous known-good commit/deployment; never rewrite frozen prediction history.
5. Data compatibility check: rollback must not require destructive migration of immutable evidence.
6. Post-rollback verification: site self-test, deployment verifier, decision integrity, ledger health, storage and cron health.

## Promotion boundary
Passing this checklist means only `READY_FOR_REVIEW`. It never means automatic production promotion. Human approval remains required for sensitive production changes and substantive model/decision promotions.
