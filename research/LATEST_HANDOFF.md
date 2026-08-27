# ARGUS LATEST RESEARCH HANDOFF

DATE: 2026-08-27

EXECUTE NEXT: Treat the Control Plane experiment as `BLOCKED_BY_DEPLOYMENT_SCOPE`, not as running. Vercel cron jobs invoke production deployments; the probe currently exists only on the research/preview branch. Before any generalization, validate the zero-provider-call probe at runtime, pass Maximum Pilot safety gates, then promote only the minimal probe/cron needed for a prospective 7-day test.

WHY NOW: Configuration is not execution proof. A preview-only cron cannot satisfy the requested CONFIGURED -> DEPLOYED -> INVOKED -> SUCCEEDED/FAILED -> PERSISTED lineage through scheduled production invocations.

CURRENT ARGUS OBSERVATION: Production runtime status aggregation for the latest 24h exposed 16,731 HTTP 200, 112 HTTP 401 and 16 HTTP 207 responses, with no visible 5xx bucket in that aggregation. DEP0169 `url.parse()` warnings remain active (157 in the latest 24h error cluster, last seen 2026-08-27T06:18:43Z). Do not patch DEP0169 blindly until dependency/source attribution is proven.

EVIDENCE LEVEL: HIGH for Vercel deployment/cron behavior; HIGH for current runtime-log observation; MEDIUM for ARGUS Control Plane implementation until prospective production-safe validation.

KEEP:
1. Selected-case calibration: ALL / ACCEPTED / PRIME / VALUE / NO_BET with Brier + log-loss + ECE/reliability + sample sizes. Brier/log-loss alone do not prove calibration.
2. Empirical risk-vs-coverage before any NO BET threshold change or formal conformal policy.
3. Exact-score benchmark hierarchy: independent Poisson -> Dixon-Coles -> one dependence challenger, evaluated on full score distributions with forward splits.
4. Provider quota truth from API-SPORTS response headers on existing calls only; reconcile across >=3 UTC reset cycles.
5. Walk-forward leakage audit with explicit point-in-time cutoffs and a research embargo/gap sensitivity test.

WATCH:
1. Alternative odds de-margin methods beyond proportional/power; promising 2026 evidence exists but primary result is still a preprint and must be replicated on ARGUS provenance-complete odds.
2. Market-anchored live challenger: current 2026 evidence is interesting but only 140 EPL matches; require >=1,000 independent multi-league matches and market-only baseline.
3. Formal conformal/selective thresholds under football drift.
4. StatsBomb Open Data for offline event-state research only; do not imply production feature availability.

REJECT:
- LLM as primary probability/exact-score forecaster now.
- Large live transformer before event completeness and market baselines are proven.
- Published ROI as promotion evidence.
- API-Football upgrade without demonstrated quota bottleneck.
- Blind DEP0169 patch without root-cause attribution.

MINIMUM CONTROL PLANE TEST:
- authenticated/manual runtime validation first
- then one non-critical production-safe R&D probe only
- >=7 prospective days and >=50 intended invocations
- deterministic run key, duplicate/overlap detection, persistence read-back
- 100% instrumented failures with non-UNKNOWN reason code
- sampled cross-check against Vercel RequestId/invocation logs
- zero provider calls and zero model/threshold mutation from instrumentation

FAILURE CONDITION: Missing run lineage, duplicate writes, lock suppresses legitimate runs, persistence mismatch, unexplained gaps, or any instrumentation-induced provider/model behavior change.

ROLLBACK: Remove only the Control Plane R&D cron/probe from production configuration and retain Watchtower/runtime logs. No model/prediction state should be touched.

DO NOT DO:
- do not merge the whole research branch to main
- do not increase PRIME confidence or loosen NO BET
- do not count repeated live states as independent matches
- do not add provider requests solely for observability
- do not treat cron configuration as proof of scheduled execution
- do not use ROI alone as a promotion criterion

DATA TO ACQUIRE NEXT:
- prospective production-safe Control Plane lineage after safety-gated promotion
- frozen settled predictions by decision cohort
- timestamped kickoff/closing 1X2 + O/U odds with bookmaker/source
- provider quota headers from existing responses
- feature timestamps for walk-forward embargo audit
- point-in-time live event availability map

NEXT RESEARCH QUESTION: Once Control Plane execution truth is genuinely prospective, does ARGUS confidence/readiness produce stable monotonic risk reduction as accepted coverage decreases across independent forward windows, leagues and markets?

STATUS: READY_WITH_DEPLOYMENT_SCOPE_BLOCKER

Machine-readable dossier: `research/daily/2026-08-27-argus-research-dossier.json`
