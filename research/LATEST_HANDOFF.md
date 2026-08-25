# ARGUS LATEST RESEARCH HANDOFF

DATE: 2026-08-25

EXECUTE NEXT: Build a shadow/work-branch Control Plane failure ledger and reason taxonomy that records every cron/provider/storage/auth failure with run/request identity, persistence state, severity, recurrence count and recovery state.

WHY NOW: Production telemetry currently shows a Vercel Blob credential failure, a cron authorization failure and 278 recurring `url.parse()` warnings across many routes. Vercel exposes requestId/invocationId/traceId/deployment metadata and recommends structured application logs; API-Football exposes authoritative quota headers. ARGUS needs one durable truth surface before more model complexity.

EXPECTED BENEFIT: Faster root-cause isolation, durable failure memory, safer cron learning, fewer silent failures, clearer operator UX and better separation of infrastructure failure from model failure.

EVIDENCE LEVEL: HIGH for the observability primitives; MEDIUM for the exact ARGUS taxonomy until prospectively exercised.

REQUIRED DATA:
- requestId / invocationId / traceId or cron run_id
- environment / deployment / route
- started_at / finished_at / persisted_at
- HTTP status + structured reason_code
- storage/auth/provider/quota state
- provider quota headers when applicable
- persistence acknowledgement/output digest
- first_seen / last_seen / recurrence_count / recovery_state

MINIMUM TEST: Instrument one non-critical research cron plus read-only aggregation of existing runtime failures for 7 days. No model, threshold, polling-frequency or production-state change.

SUCCESS METRICS:
- 100% of observed 5xx and instrumented cron failures receive a non-UNKNOWN reason code
- complete CONFIGURED -> DEPLOYED -> INVOKED -> SUCCEEDED/FAILED -> PERSISTED/NOT_PERSISTED lineage
- recurring failures are linked to stable failure families
- zero additional provider calls
- operator can separate DATA / MODEL / PROVIDER / STORAGE / AUTH / CRON / UNKNOWN failure classes

FAILURE CONDITION: Instrumentation changes runtime behavior, loses run identity, creates duplicate writes, keeps producing ambiguous reason codes, or increases provider consumption.

PROOF REQUIRED: Seven prospective days with sampled request/log cross-checks, persistence acknowledgements, duplicate detection and zero unexplained gaps.

RISK / LEAKAGE RISKS:
- do not let failure instrumentation mutate prediction/model state
- do not infer provider quota from local time or internal estimates when response headers exist
- do not treat recurring warnings as root cause before dependency/origin is identified
- live states from the same match are not independent samples

ROLLBACK: Disable the research failure-ledger writer/aggregator and retain existing Watchtower/runtime logs. No model or prediction state changes.

WATCH:
1. Formal conformal/selective thresholds only after empirical ARGUS risk-vs-coverage is stable on forward windows.
2. Dynamic event-process live modelling only after point-in-time event/stoppage coverage is proven adequate.

DO NOT DO:
- do not increase PRIME confidence or loosen NO BET
- do not treat Brier/log-loss alone as proof of calibration
- do not increase polling or upgrade API-Football to hide Control Plane defects
- do not treat cron configuration as execution proof
- do not auto-fix `url.parse()` warnings before identifying their origin and regression-testing the replacement
- do not copy published live ROI or conformal guarantees into ARGUS without independent OOS replication
- do not add a larger exact-score/live model before simple baselines are beaten consistently
- do not modify production from this dossier

DATA TO ACQUIRE NEXT:
- structured failure events with run/request identity
- provider quota headers on existing responses
- frozen kickoff + closing 1X2/O-U odds with timestamps/source
- settled accepted-selection cohorts for selected-case calibration
- complete point-in-time event/stoppage timestamps before richer live models

NEXT RESEARCH QUESTION: Once Control Plane failure truth is durable, does ARGUS confidence/readiness ranking produce a stable monotonic risk-coverage curve on independent forward match windows, and where does it break by market or league?

BLOCKERS:
- failure taxonomy not yet prospectively validated
- `url.parse()` origin is not yet identified
- richer live-event modelling remains blocked by point-in-time event-data proof

STATUS: READY_TO_EXECUTE

Machine-readable dossier: `research/daily/2026-08-25-argus-research-dossier.json`
