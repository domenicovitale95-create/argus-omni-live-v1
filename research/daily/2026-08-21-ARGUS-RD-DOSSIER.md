# ARGUS OMNI — Daily Research & Improvement Dossier

Date: 2026-08-21
Branch audited: `argus-autonomous-learning-loop`
Branch tip at audit: `ceb21cf155c868e599c133d64d11a154b1ad592d`
Operating doctrine: **FAST LEARNING, SLOW TRUST**
Canonical references: `ARGUS_PERFECTION_DIRECTIVE.md`, `ARGUS_MAXIMUM_PERFORMANCE_ROADMAP.md`, `ARGUS_EXTERNAL_BENCHMARK_PROTOCOL.md`, `ARGUS_DATA_MAXIMIZATION_PROTOCOL.md`.

## 1) EXECUTIVE PRIORITY

**Priority for the next 24 hours: maximize temporally valid evidence throughput and make evidence completeness measurable before adding new predictive complexity.**

ARGUS has already built substantial infrastructure around integrity, Watchtower, market truth, calibration, drift, NO BET, automated verification, historical backfill and resource controls. The next marginal unit of value is therefore not another specialist feature. It is a complete chain for every candidate fixture:

`RAW SOURCE -> NORMALIZED SNAPSHOT -> FROZEN PREMATCH PREDICTION -> ODDS PATH -> CLOSING TRUTH -> SETTLEMENT -> PROPER SCORE/CLV -> SEGMENT AUDIT`.

Today’s hard rule: **no readiness claim unless that chain is complete and temporally valid.**

Current audit found a meaningful environment distinction: recent work-branch Vercel deployments are `READY`, but they are preview deployments (`target=null`). The public project domain returned `404` on `/api/watchtower` during this audit. Vercel Cron documentation states that configured cron jobs call the project’s production deployment. Therefore cron configuration in `vercel.json` is evidence of intended scheduling, not evidence that the current work-branch jobs are executing in production. Treat production cron health as **UNVERIFIED** until a production-target deployment and runtime invocation evidence are observed.

## 2) TOP 5 SELECTED IDEAS

### 1. Evidence Completeness Gate — highest priority
**Hypothesis:** readiness quality improves faster if ARGUS first maximizes complete frozen-prediction + closing-odds + settlement records rather than expanding feature count.

Minimum implementation/shadow step:
- add per-fixture completeness flags for frozen prediction, entry odds, intermediate odds, closing odds, settlement, source timestamp, source identity, model/version ID and immutable prediction hash;
- aggregate daily `completeEvidencePct`, `closingCoveragePct`, `settledFrozenPerDay`, `clvEligiblePct`, `calibrationEligiblePct`;
- require missing fields to remain explicit `UNKNOWN`, never zero/false.

Success: rising complete-evidence percentage without increased leakage/staleness or quota waste.
Failure: higher data volume but no growth in CLV/calibration-eligible settled samples.

### 2. Selected-Case Calibration + Risk/Coverage Curves
**Hypothesis:** global calibration can look acceptable while PRIME/VALUE-selected cases remain badly calibrated. ARGUS must evaluate exactly the subset on which it acts.

Research basis: selective-prediction literature treats abstention as part of the prediction problem; current work in conformal selective risk control explicitly targets error control among trusted cases. Proper-score research reinforces calibration + discrimination/resolution rather than raw hit rate.

Minimum replay:
- compute Brier, log-loss, calibration error and Brier reliability/resolution by verdict, market, league, odds bucket, data-quality bucket and `READINESS` bucket;
- plot/tabulate risk-vs-coverage for progressively stricter eligibility thresholds;
- compare against no-vig market baseline on the **same selected cases**.

KEEP only if stricter selection lowers probabilistic risk in a stable walk-forward sense rather than merely improving historical ROI.

### 3. Closing-Truth Backfill + No-Vig Market Baseline
**Hypothesis:** ARGUS cannot prove incremental information without a strong market baseline and reliable closing truth.

Minimum test:
- use existing API-Football capture for current/future perishable odds;
- separately replay historical Football-Data.co.uk opening/closing market averages on supported leagues;
- exclude/downweight stale Pinnacle fields after 2025-07-23 because Football-Data explicitly warns that Pinnacle’s public odds feed became systematically stale and is no longer used in its market average/max calculations;
- compare ARGUS probability vs no-vig consensus using Brier/log-loss and CLV, not only ROI.

### 4. Source Registry + Field-Level Provenance Gate
**Hypothesis:** observational provenance metrics are useful but insufficient; confidence should eventually be capped when critical fields have no source/time semantics.

Current code already measures source and source-timestamp coverage and freshness distribution, but `missingProvenanceDoesNotYetBlock:true`. Keep that behavior in RESEARCH while collecting baseline missingness. Then pre-register thresholds before making provenance a trust gate.

Minimum step: create a versioned source registry with provider, legal/terms status, fields, competition-season coverage, latency, request cost, conflict rate, observed missingness, last success and fallback.

### 5. Delayed-Label / Production-Environment Truth
**Hypothesis:** infrastructure/readiness can be falsely optimistic when scheduled jobs are configured but not actually producing fresh artifacts, or when recent predictions remain unsettled.

Minimum step:
- distinguish `CONFIGURED`, `INVOKED`, `PERSISTED`, `FRESH`, `SETTLED` for each recurring pipeline;
- add environment (`preview|production`) and deployment SHA to all health artifacts;
- delayed-label monitor should show eligible predictions awaiting settlement separately from genuinely missing settlement.

## 3) TODAY'S INPUT

**Instrument evidence completeness before adding another predictive model.**

This is the single highest-value lesson today because it accelerates every later scientific decision: calibration, CLV, abstention, champion/challenger, drift and market-specific readiness all become more trustworthy when the denominator is explicit and the evidence chain is complete.

## 4) PRACTICAL ADVICE TO ARGUS

For every match, ask one question before deeper modeling: **“If this prediction is wrong, will I have enough immutable, timestamped evidence afterward to know exactly why?”** If the answer is no, collect/fix the evidence path before adding complexity.

Operational behavior today:
- spend API calls first on perishable truth: odds snapshots, closing prices, lineups/availability near kickoff and settlement;
- reuse cached/static historical data;
- never let a missing source timestamp silently appear “fresh”;
- preserve preview/production separation;
- downgrade quickly on negative evidence, promote slowly on positive evidence.

## 5) EXPERIMENT PLAN

### EXP-2026-08-21-A — Evidence Completeness Baseline
Hypothesis: at least one major readiness bottleneck is missing closing/provenance/settlement coverage rather than model quality.

Replay/shadow procedure:
1. Scan last 30–90 days of frozen prediction records.
2. For each fixture score binary presence of: valid kickoff, prediction timestamp < kickoff, model/version, immutable snapshot, entry odds, source+source timestamp, one near-close odds snapshot, settlement, Brier/log-loss eligibility, CLV eligibility.
3. Produce coverage by league/market/verdict.
4. Rank missing fields by lost evidence count.
5. Change acquisition scheduling only after the loss table identifies the highest-value gap.

Success metric: >=20 percentage-point improvement in complete evidence among new frozen records over baseline without higher temporal-integrity error rate.

### EXP-2026-08-21-B — Selected Risk/Coverage
Hypothesis: stricter evidence/readiness filters produce lower Brier/log-loss on accepted cases and sensible abstention trade-offs.

Procedure:
- replay only frozen OOS records;
- define thresholds without using future outcomes;
- measure coverage, Brier, log-loss, calibration gap and CLV at each threshold;
- bootstrap uncertainty and walk forward by time;
- compare to market-only baseline.

Failure condition: apparent benefit disappears out of sample, is concentrated in one league/week, or comes from sample shrinkage without meaningful risk reduction.

### EXP-2026-08-21-C — Football-Data Closing Baseline
Hypothesis: free historical closing market data can cheaply expand market-truth replay for supported leagues.

Procedure:
- ingest a tiny manually selected season/league sample first;
- normalize only fields needed for 1X2/OU baseline;
- preserve original CSV and retrieval metadata;
- verify opening/closing semantics against notes;
- do not use Pinnacle as truth after its documented reliability break;
- compare provider closing consensus to existing ARGUS market memory where dates overlap.

KEEP if field semantics are stable and legal/terms review permits intended use. Otherwise retain as manual research benchmark only.

## 6) FASTEST SAFE WINS

1. Add `evidenceCompleteness` metrics to Watchtower/developer health as observation-only first.
2. Add explicit `environment` + `deploymentSha` to generated health artifacts.
3. Split `awaitingSettlement` from `missingSettlement`.
4. Add selected-case calibration tables using existing settled ledger; no model mutation required.
5. Add source-registry scaffold before integrating any new recurring source.
6. Continue recent memory-pressure work: measure archive size before deserialization, compact persisted JSON, cap reads and prefer streaming/partitioned summaries where possible.
7. Ensure every cron has last-invoked, last-success, last-persisted-artifact and age fields; configuration alone is not health.

## 7) DATA OPPORTUNITIES — ranked by expected Value of Information

### A — API-Football (existing Pro plan) — KEEP / MAXIMIZE CURRENT PLAN
**VOI:** Very high for current/future evidence because odds are perishable.

Fields/coverage: fixtures, teams, standings, bookmakers, pre-match odds, live odds, events, lineups, players, statistics, predictions; league-season coverage flags indicate availability for events, lineups, statistics, players, standings, injuries, predictions and odds. Provider advertises 1,200+ leagues/cups; exact availability varies by season/fixture.

Historical/live: `/odds?fixture=` retains only the last 7 days in current API guidance; live odds available separately. This strongly favors local timestamped capture.

Terms/licensing: existing paid service; use strictly within subscription terms.

Freshness/reliability: high operational value but coverage flags do not guarantee 100% fixture-level availability, especially smaller leagues.

Integration effort: LOW — already integrated.

Quota/cost: current plan 7,500 requests/day; optimize value per request before any upgrade.

Smallest test: coverage-flag-aware scheduler that measures `usefulEvidenceGained/request` and prioritizes closing/lineup gaps.

Recommendation: **KEEP. Do not upgrade quota until measured missed high-value evidence proves 7,500/day is the bottleneck.**

### B — Football-Data.co.uk historical CSV — KEEP FOR RESEARCH/SHADOW, LEGAL STATUS TO CONFIRM FOR AUTOMATED PRODUCT USE
**VOI:** Very high for historical market-truth and baseline replay.

Fields: full/half-time results; match statistics on major leagues; 1X2 odds; average and maximum prices; totals and Asian handicap where available. Since 2019/20 files include early and closing odds (`C` columns). Dataset advertises results back to 1993/94, betting odds back to 2000/01, and market average/max from later seasons.

Coverage: up to 22 European divisions plus additional worldwide leagues; current files updated multiple times per week.

Historical/live: excellent historical; current fixture odds are periodic, not high-frequency live.

Terms/licensing: site states data are free, but automated redistribution/product-use rights are not sufficiently explicit from the public pages audited today. Do not assume unrestricted commercial ingestion.

Freshness/reliability caveat: provider warns that Pinnacle odds became systematically stale after 2025-07-23; those fields should not be used as closing truth from that point.

Integration effort: LOW-MEDIUM.

Quota/cost: free downloads; local backfill avoids API-Football quota.

Smallest test: one league, one season, opening + closing 1X2 only; verify schema and overlap against existing records.

Recommendation: **KEEP for research/shadow; confirm intended-use permission before recurring product ingestion.**

### C — StatsBomb Open Data — WATCH / RESEARCH ONLY UNTIL USE RIGHTS ARE CONFIRMED FOR ARGUS CONTEXT
**VOI:** High for event/xG/lineup research; low for broad live coverage.

Fields: competitions/seasons, matches, event JSON, lineups, and StatsBomb 360 for selected matches. Public documentation provides event definitions.

Coverage: selected competitions/seasons only, not the full football universe. Repository received a major data update in May 2026.

Historical/live: historical/open-data repository; not a substitute for current live odds/availability.

Terms/licensing: repository states free availability for research projects/genuine interest and requires attribution/logo on published/shared work; a separate license/user agreement exists. Because ARGUS may become a product/service, intended recurring use must be checked before ingestion.

Reliability: strong methodology, but repository issues also document occasional malformed/corrupt JSON or identity inconsistencies; ingestion must schema-validate.

Integration effort: MEDIUM.

Smallest test: one open competition/season, derive only pre-declared team xG/shot-quality aggregates in strict walk-forward replay and compare to simple Poisson/market baseline.

Recommendation: **WATCH / RESEARCH. Do not operationalize as a recurring source until license fit is confirmed and incremental OOS value is demonstrated.**

### D — Open-Meteo — WATCH, LOW PRIORITY
**VOI:** Low-to-medium; weather is plausible but should not outrank odds/lineups/settlements.

Fields: historical hourly temperature, humidity, precipitation, wind, gusts, pressure, weather code and many other variables; historical reanalysis back to 1940, with more recent high-resolution model data.

Historical/live: strong historical and forecast APIs.

Terms/licensing: API data are CC BY 4.0; free API is explicitly non-commercial and rate-limited (<10,000 calls/day). Commercial use requires a paid subscription endpoint.

Freshness/reliability: official model/reanalysis blend with explicit update frequencies; stadium-level microconditions remain an approximation.

Integration effort: MEDIUM because venue geocoding and kickoff-time semantics are required.

Smallest test: only heavy precipitation/wind/extreme temperature features for leagues with known venue coordinates; walk-forward and ablation against baseline.

Recommendation: **WATCH. Do not add recurring calls until replay proves value.**

## 8) DATA COVERAGE GAPS and cheapest way to close them

1. **Closing-odds coverage:** cheapest = prioritize current API-Football local snapshots + research backfill from Football-Data on supported leagues.
2. **Snapshot provenance/source timestamp:** cheapest = enrich existing normalized snapshot schema; no new source purchase needed.
3. **Lineup/availability coverage:** cheapest = coverage-flag-aware API-Football calls close to kickoff, only for candidate fixtures.
4. **Historical market baseline:** cheapest = free CSV research backfill before buying a new odds provider.
5. **Selected-case calibration sample:** cheapest = settle every existing frozen prediction correctly; no extra modeling required.
6. **Source conflicts:** cheapest = preserve duplicate observations and score disagreement instead of silently overwriting.
7. **Event/xG history:** cheapest = small open-data replay on legally safe research subsets before buying commercial event feeds.
8. **Weather:** cheapest = defer; only evaluate after higher-VOI gaps are under control.

## 9) RED TEAM

### What could make ARGUS look better than it is?
- preview deployments are `READY` but production may not be running the same code;
- configured crons may be mistaken for successful/persistent cron execution;
- global calibration can hide poor calibration among PRIME/VALUE selected cases;
- ROI-based NO BET rules can overfit small noisy samples;
- `minimumSample:20` in calibration/NO BET is useful for early warnings but far too small to establish professional readiness;
- CLV computed from the last locally captured pre-kickoff snapshot is not necessarily true market close if capture cadence is sparse;
- provider timestamps can differ from ARGUS retrieval timestamps; using one as the other can fake freshness;
- odds sources may change methodology over time;
- source coverage flags can be true while actual fixture-level completeness is poor;
- repeated experiments on many leagues/markets create multiple-testing risk;
- lineups and injuries can arrive after an earlier prediction; replay must only use the information actually available at that prediction timestamp;
- selected-case improvements may come purely from shrinking coverage.

### Strong adversarial test
Remove the best league, best week and top 5% CLV observations. Recompute calibration, log-loss, CLV and risk-coverage. If the claimed edge collapses, classify it as fragile.

## 10) REJECTED / DEFERRED

- **New complex specialist model today:** REJECTED. Evidence plumbing has higher marginal value.
- **Fractional Kelly / bankroll optimization:** DEFERRED until robust calibration and stable positive CLV exist.
- **Automatic online recalibration of production probabilities:** DEFERRED. Recent research on drift-aware online calibration is promising, but ARGUS must first establish clean delayed-label, temporal and baseline infrastructure.
- **Conformal automatic PRIME gate:** DEFERRED. Selective/conformal methods are research-worthy, but exchangeability/shift assumptions and ARGUS selection policy must be validated first.
- **Weather as recurring feature:** DEFERRED pending replay evidence.
- **Paid data-source expansion:** DEFERRED until measured evidence gaps show current 7,500/day API plan + free research backfill cannot meet required evidence throughput.

## 11) EVIDENCE GAPS

At audit time the following could not be proven from accessible runtime evidence and must remain `UNVERIFIED`, not guessed:
- current Watchtower health score/state from the latest preview because preview protection redirected endpoint fetches;
- current production Watchtower, because the public project domain returned `404` at `/api/watchtower`;
- current production cron invocation success and persistence for the work-branch schedule;
- exact Blob contents, ledger totals, current Brier/log-loss values, confidence-bucket sample counts, CLV sample/average, drift state, specialists state, NO BET recommended segments and daily API usage;
- exact closing-odds coverage %, lineup coverage %, stale-data %, source-conflict rate, frozen predictions settled/day and missingness by league/market;
- a canonical source-registry implementation was not found at `api/source-registry.js`.

These are evidence gaps, not negative findings.

## 12) NEXT RESEARCH QUESTIONS

1. What percentage of frozen predictions currently become fully CLV- and calibration-eligible records?
2. Which single missing field destroys the largest number of usable evidence records?
3. Does selected-case calibration improve monotonically as Decision Readiness rises?
4. Does ARGUS beat no-vig market consensus on Brier/log-loss after controlling for league, odds range and prediction horizon?
5. How close is the last stored “closing” snapshot to actual kickoff/market close by league and provider?
6. Which scheduled acquisition call has the highest evidence gain/request?
7. Is abstention reducing probabilistic risk, or merely reducing sample size?
8. Which current feature/module can be removed without harming OOS proper scores or CLV?

## 13) 24H EXECUTION ORDER

1. Measure evidence completeness on existing storage; no behavior change.
2. Measure production-vs-preview deployment/cron truth; do not promote work branch automatically.
3. Add environment/deployment SHA and last-persisted timestamps to health artifacts.
4. Build selected-case calibration/risk-coverage report from frozen settled evidence.
5. Quantify closing-odds gap and last-snapshot-to-kickoff distribution.
6. Build source-registry scaffold and terms-status field.
7. Run tiny Football-Data research replay on one league-season.
8. Rank API calls by evidence gained/request and adjust only in shadow/config research.
9. Retire any experiment with no pre-registered metric or no path to sufficient evidence.
10. Re-run Watchtower/integrity tests after instrumentation changes.

## 14) PROOF REQUIRED

Before stronger trust/promotion of any substantive model or decision rule:
- zero critical temporal-integrity violations;
- zero unresolved data-corruption errors on eligible records;
- immutable frozen prediction inputs and model/version provenance;
- sufficient OOS/walk-forward sample per claimed segment;
- Brier/log-loss and calibration diagnostics with uncertainty;
- selected-case calibration, not only global calibration;
- no-vig market baseline comparison on identical cases;
- persistent CLV with closing-source quality documented;
- robustness after removing best league/week/outliers;
- no evidence of selection leakage or experiment collision;
- rollback-ready shadow/canary path;
- production environment and cron health demonstrably fresh.

No single fixed sample count is declared “sufficient” for every market today. Minimum sample must be chosen per metric/segment with uncertainty bounds and pre-registered before evaluation. Existing `20`-sample warning thresholds are diagnostics, not professional-readiness proof.

## 15) DELETION / SIMPLIFICATION CHECK

Candidates for simplification review:
- any cron whose output duplicates another artifact and does not measurably improve evidence/observability;
- any feature with no stable OOS contribution to calibration/log-loss/CLV;
- overlapping health endpoints that can feed one canonical Error/Health Command Center;
- repeated deserialization of large decade archives where compact summaries/partitioning suffice;
- ROI-only logic in NO BET as a primary scientific signal; retain ROI as secondary diagnostic, not the governing metric;
- narrative/context variables that cannot be timestamped or falsified.

Rule: remove/merge only after replay shows no degradation and rollback is available.

## 16) STRUCTURAL IMPROVEMENT CHECK

### Strong current structure
- private Vercel Blob abstraction with explicit storage readiness;
- explicit data-integrity and temporal-integrity engines;
- Watchtower trust gate and read-only supervisor policy;
- calibration, drift and NO BET are separated and cannot independently create PRIME;
- market-truth module treats closing line as primary external truth and bars automatic real-money betting;
- extensive scheduled acquisition/verification surface;
- recent commits specifically target golden fixtures, fallback behavior, data provenance/freshness, memory pressure and deployment verification.

### Structural gaps to close
- provenance is currently observational; define pre-registered transition to trust capping for critical missing provenance;
- no visible canonical source registry found at the expected path;
- cron “configured vs executed vs persisted” should be explicit;
- environment/deployment identity must be first-class in health/evidence;
- health needs one canonical incident/error registry with recurrence/root-cause state;
- selected-case calibration and risk-coverage are not yet first-class readiness artifacts;
- large historical archives require size-aware/partition-aware processing to avoid memory failure.

## 17) ONE-MONTH READINESS PROGRESS — evidence metrics, not optimism

### What counts as progress
Track a daily table with:
- frozen predictions created;
- frozen predictions settled;
- complete evidence records %;
- closing-odds coverage %;
- source+source-timestamp coverage %;
- lineup/availability coverage %;
- stale-data rate;
- source-conflict rate;
- Brier/log-loss global and selected-case;
- calibration gap by confidence bucket;
- market-baseline Brier/log-loss delta;
- CLV sample and mean/median with uncertainty;
- risk/coverage by Decision Readiness threshold;
- number of eligible segments with sufficient evidence;
- number of segments blocked by integrity/uncertainty;
- API useful-evidence/request;
- cron invocation/persistence success rate;
- production health freshness;
- experiment KEEP/REJECT/RETIRE count;
- feature/module retirement count.

### Current readiness statement
**NOT YET PROVABLE AS PROFESSIONAL-READY from today’s accessible evidence.** Infrastructure progress is substantial, but the exact live evidence metrics required for a professional claim were not accessible/verified in this audit. That is precisely why evidence-completeness and production-truth instrumentation are today’s priority.

### One-month target
A small number of markets/segments may become `READY` only if their complete, independently frozen OOS evidence satisfies predeclared gates. If none do, the correct result remains `NOT READY / NO BET`.

---

## Public research assimilated today

- Deshpande, Marx & Kuleshov (UAI 2025), calibrated online regression under arbitrary/adversarial streams: https://proceedings.mlr.press/v286/deshpande25a.html
- Huang, Ma & Michailidis (UAI 2026), online calibration under temporal dependence/distribution shift using predict-then-update: https://proceedings.mlr.press/v337/huang26b.html
- Bai & Jin (2026), conformal selective prediction with general risk control: https://arxiv.org/abs/2603.24704
- Mao, Mohri & Zhong (ALT 2024), predictor-rejector abstention: https://proceedings.mlr.press/v237/mao24a.html
- Gneiting & Katzfuss, probabilistic forecasting: https://doi.org/10.1146/annurev-statistics-062713-085831
- Proper Scoring Rules for Estimation and Forecast Evaluation (Annual Review of Statistics, 2026): https://doi.org/10.1146/annurev-statistics-042424-050626
- Angelini & De Angelis, efficiency of online football betting markets: https://doi.org/10.1016/j.ijforecast.2018.07.008
- Football-Data historical results/odds and closing-data notes: https://www.football-data.co.uk/data and https://www.football-data.co.uk/downloadm.php
- API-Football current product/coverage guidance: https://www.api-football.com/ and https://www.api-football.com/coverage/
- StatsBomb Open Data repository and terms summary: https://github.com/statsbomb/open-data
- Google Cloud high-quality ML / monitoring guidance: https://docs.cloud.google.com/architecture/guidelines-for-developing-high-quality-ml-solutions
- Google Cloud MLOps CI/CD/CT guidance: https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning
- Vercel Cron behavior/management: https://vercel.com/docs/cron-jobs and https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Open-Meteo historical data/terms: https://open-meteo.com/en/docs/historical-weather-api and https://open-meteo.com/en/terms

---

## EXECUTE NEXT

1. Evidence Completeness baseline and daily counters.
2. Production/preview + cron invocation truth instrumentation.
3. Selected-case calibration and risk/coverage report.
4. Closing-truth gap analysis and no-vig baseline replay.
5. Source registry scaffold with legal/terms status.

## WATCH

- drift-aware online calibration research;
- conformal selective risk control;
- StatsBomb event/xG replay after license check;
- Open-Meteo only after higher-VOI gaps are closed;
- API quota utilization vs useful evidence gained.

## DO NOT DO

- do not merge this R&D branch to main automatically;
- do not auto-promote PRIME/model confidence;
- do not treat configured crons as proven healthy;
- do not use small-sample ROI as evidence of professional readiness;
- do not ingest new sources without terms/licensing review;
- do not rewrite frozen predictions with hindsight;
- do not buy more quota/data until the evidence-gap table proves necessity;
- do not enable automatic real-money wagering.

## PROOF REQUIRED

Strict temporal integrity, immutable provenance, OOS/walk-forward evidence, selected-case calibration, proper-score improvement vs market baseline, robust/persistent CLV, sufficient sample with uncertainty, robustness/stress tests, healthy production infrastructure and rollback readiness.

## DATA TO ACQUIRE NEXT

1. Near-closing multi-source 1X2/goal-market odds with provider timestamp and retrieval timestamp.
2. Settlements for every eligible frozen prediction.
3. Candidate-fixture lineups/availability close to kickoff where coverage supports it.
4. Historical opening/closing consensus for supported leagues via legally permitted backfill.
5. Field-level source provenance and conflict observations.
6. Only after those: event/xG enrichment and conditional context variables proven useful in replay.
