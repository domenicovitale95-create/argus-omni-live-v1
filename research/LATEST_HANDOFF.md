# ARGUS LATEST RESEARCH HANDOFF

DATE: 2026-08-23

EXECUTE NEXT: Add shadow-only provider-header quota reconciliation and explicit 503 reason classification before further live polling/model work.

WHY NOW: Production observability shows repeated `/api/live` 503s, while API-Football documents authoritative daily/minute quota headers and a 00:00 UTC daily reset. Data availability and Control Plane truth are prerequisites for trustworthy live learning.

EXPECTED BENEFIT: Fewer false halts, explainable quota failures, safer API use, and higher evidence throughput without upgrading the subscription.

EVIDENCE LEVEL: HIGH for provider quota semantics; MEDIUM for ARGUS causal diagnosis until the 503s are classified.

REQUIRED DATA:
- provider quota headers on each call
- endpoint and request timestamp
- internal quota ledger value
- structured 503/429 reason
- Vercel request/deployment ID

MINIMUM TEST: Instrumentation only across 3 UTC reset boundaries and at least 1,000 provider responses, with no increase in polling.

SUCCESS METRICS:
- zero unexplained false daily quota halts
- every quota-related 503 receives an explicit reason
- header-versus-ledger differences are explainable by concurrency/in-flight requests
- no increase in 429 rate or requests/day

FAILURE CONDITION: Reconciliation remains materially inconsistent or instrumentation changes provider consumption/latency.

PROOF REQUIRED: Timestamped header snapshots plus internal ledger records proving correct behavior before and after UTC reset and near quota limits.

RISK / LEAKAGE RISKS:
- concurrent requests can temporarily desynchronize counters
- never infer provider quota day from local Brussels time
- do not retry 429/503 in tight loops

ROLLBACK: Remove reconciliation telemetry and retain the current quota guard and polling schedule.

WATCH:
1. Production cron execution-evidence ledger: CONFIGURED -> DEPLOYED -> INVOKED -> SUCCEEDED -> PERSISTED.
2. Market-anchored live intensity challenger using frozen no-vig 1X2 + O/U kickoff prices.

DO NOT DO:
- do not upgrade API-Football merely to hide quota-control defects
- do not increase live polling until 503 causes are known
- do not deploy market-anchored live modelling from a 140-match research result
- do not auto-upgrade dependencies for `url.parse()` warnings before origin is proven
- do not promote exact-score dependence without walk-forward evidence

DATA TO ACQUIRE NEXT:
- quota headers on every provider response
- structured 503/429 causes
- closing/no-vig 1X2 and O/U snapshots
- independent held-out scoreline histories

NEXT RESEARCH QUESTION: Once quota and Control Plane truth are stable, does market anchoring improve live probability calibration out-of-time versus the current simple baseline?

BLOCKERS:
- 503 causes not yet fully classified
- research branch is diverged from main and must not be mistaken for production

STATUS: READY_TO_EXECUTE

Machine-readable dossier: `research/daily/2026-08-23.argus-evidence.json`
