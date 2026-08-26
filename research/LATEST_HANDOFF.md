# ARGUS LATEST RESEARCH HANDOFF

DATE: 2026-08-26

EXECUTE NEXT: Instrument one non-critical research cron with idempotent run identity, overlap protection and durable failure lineage, then verify CONFIGURED -> DEPLOYED -> INVOKED -> SUCCEEDED/FAILED -> PERSISTED/NOT_PERSISTED prospectively.

WHY NOW: Control Plane truth is prerequisite evidence for every downstream learning, calibration, settlement and data-acquisition claim. Vercel documents that failed cron invocations are not automatically retried and that overlapping scheduled invocations can occur; idempotence and locking are therefore correctness requirements, not optional polish.

EXPECTED BENEFIT: Eliminate silent/duplicate cron ambiguity, strengthen failure memory, make future research evidence trustworthy, and improve operator clarity without touching model logic.

EVIDENCE LEVEL: HIGH for Vercel platform behavior; MEDIUM for ARGUS-specific implementation until prospectively validated.

REQUIRED DATA:
- job_id / deterministic run_key / intended schedule window
- requestId or invocation identity when available
- deployment / environment / route
- started_at / finished_at
- HTTP or execution status + structured reason_code
- persisted_at + output_digest
- duplicate_detected / overlap_detected
- first_seen / last_seen / recurrence_count / recovery_state

MINIMUM TEST: One non-critical research cron for 7 days and at least 50 intended invocations, including a synthetic duplicate/overlap test. No model, threshold, provider polling or production-state change.

SUCCESS METRICS:
- complete CONFIGURED -> DEPLOYED -> INVOKED -> SUCCEEDED/FAILED -> PERSISTED/NOT_PERSISTED lineage
- zero duplicate writes during injected duplicate/overlap tests
- 100% of instrumented failures receive a non-UNKNOWN reason code
- zero additional provider calls caused by instrumentation

FAILURE CONDITION: Locking suppresses legitimate runs, instrumentation materially changes runtime behavior, duplicate writes remain possible, or run lineage contains unexplained gaps.

PROOF REQUIRED: Seven prospective days plus sampled cross-check against Vercel runtime logs and persistence acknowledgements.

RISK / LEAKAGE RISKS:
- instrumentation must not mutate prediction/model state
- do not infer execution success from cron configuration alone
- do not rewrite historical run state
- do not count repeated live states from one match as independent evidence
- do not use new observability as justification to increase confidence

ROLLBACK: Remove the research-only wrapper/lock and retain existing Watchtower/runtime logs. No model or prediction state is touched.

WATCH:
1. Selected-case risk-vs-coverage evaluation before any formal conformal thresholding.
2. Market-anchored live challenger only after point-in-time event completeness is proven.

DO NOT DO:
- do not modify production from this dossier
- do not increase PRIME confidence or loosen NO BET
- do not treat Brier/log-loss alone as proof of calibration
- do not add a larger live transformer or LLM exact-score reranker now
- do not copy published ROI into ARGUS rules
- do not upgrade API-Football merely to accelerate learning
- do not treat formal conformal guarantees as automatically valid under football drift

DATA TO ACQUIRE NEXT:
- prospective cron run lineage and failure families
- frozen settled predictions split ALL / ACCEPTED / PRIME / VALUE / NO BET
- timestamped kickoff and closing 1X2 + O/U odds with bookmaker/source
- provider quota truth from existing responses
- point-in-time event availability audit for live modelling

NEXT RESEARCH QUESTION: After Control Plane truth is proven, does existing ARGUS readiness/confidence produce stable monotonic risk reduction as accepted coverage decreases across independent forward windows, markets and leagues?

BLOCKERS:
- cron lineage not yet prospectively validated
- selected-cohort calibration sample may still be sparse
- point-in-time completeness for richer live-state features remains unproven

STATUS: READY_TO_EXECUTE

Machine-readable dossier: `research/daily/2026-08-26-argus-research-dossier.json`
