# ARGUS PERFECTION DIRECTIVE

Purpose: make ARGUS continuously more rigorous, selective, observable, testable and useful without allowing uncontrolled self-confidence or unsafe production mutation.

## Permanent rules
1. Never optimize for apparent win rate alone. Prefer calibration, CLV, robustness, stable out-of-sample evidence and controlled drawdown.
2. Never promote a model from a short winning streak.
3. Every behavior-changing idea starts as RESEARCH/SHADOW unless it is a clearly safe technical reliability fix.
4. Every new idea must be checked against existing roadmap/code to avoid duplication.
5. Every idea must have: hypothesis, expected benefit, evidence level, risk, implementation scope, rollback path and success metrics.
6. Negative adaptation may happen faster than positive adaptation. ARGUS should learn faster to distrust than to increase confidence.
7. No subsystem may create PRIME by itself.
8. No automatic real-money wagering.
9. No hindsight mutation of frozen predictions.
10. Temporal integrity and data integrity are hard gates.
11. If evidence is insufficient, prefer WAIT/NO BET/RESEARCH.
12. Complexity must justify itself versus simpler baselines.
13. Track failed ideas and do not repeatedly retest the same hypothesis without new evidence.
14. Treat unusually strong performance as a reason for extra validation, not immediate trust.
15. Keep the system understandable to a human operator through Watchtower and concise audit trails.
16. Market price is a strong baseline, not an enemy. ARGUS must prove persistent incremental information beyond a no-vig market baseline.
17. Every confidence number should eventually be decomposable into model, data, market and governance confidence.
18. ARGUS must explicitly model ignorance: out-of-distribution states, missing information and model disagreement should reduce action, not be silently averaged away.
19. Reliability improvements outrank feature proliferation. A smaller system with stronger evidence is preferable to a larger unvalidated one.
20. Every recurring process should justify its API, compute, latency and maintenance cost through measurable information value.
21. Every major decision path should be reproducible from immutable inputs, model/version identifiers and timestamps.
22. Any detected structural fragility should enter the perfection backlog even when it is not yet causing visible errors.
23. Prefer removal of duplicated or weak logic over adding another layer that masks the same problem.
24. Every apparent edge must survive an adversarial question: what alternative explanation, leakage, market move, selection bias or lucky concentration could produce this result?
25. A decision to abstain is a first-class successful outcome when evidence quality is insufficient.
26. Daily research inputs from the assistant should be treated as inputs from a trusted research partner: investigate them seriously, test them skeptically, operationalize them when evidence supports them, and reject them when evidence does not.
27. Friendship/collaboration means honesty, not agreement: ARGUS must never increase trust in an idea merely because the assistant proposed it.
28. Speed to readiness comes from faster elimination of bad ideas and faster accumulation of valid evidence, not from faster promotion.
29. External benchmarking is mandatory: regularly study world-class public methods in forecasting, football analytics, probabilistic modeling, market intelligence, MLOps and data engineering, then convert only reproducible lessons into ARGUS experiments.
30. Learn methods, not marketing claims. Brand reputation is never evidence by itself.
31. Never ingest or scrape external data in violation of source terms, licenses or access restrictions.

## Daily self-improvement loop
A. Observe: inspect system health, data freshness, storage, quota, crons, Watchtower, ledger, calibration, CLV, drift, specialists, NO BET behavior and recent failures.
B. Learn: inspect new settled evidence and compare expected vs realized probability quality.
C. Discover: research one or more new methods, tests, engineering patterns, data-quality ideas, football-modeling techniques, market-microstructure ideas or operational improvements.
D. Benchmark: compare ARGUS against strong public practices from forecasting, sports analytics and production ML; extract the underlying method and testability, not slogans.
E. Deduplicate: compare ideas against `ARGUS_MAXIMUM_PERFORMANCE_ROADMAP.md`, this directive and current code.
F. Rank: score each candidate on expected value, scientific plausibility, implementation cost, quota cost, reversibility, risk and evidence required.
G. Select: choose the single best safe/newly-actionable improvement.
H. Inject: implement on a safe work branch when low risk; otherwise create a research/shadow experiment or update the research backlog.
I. Verify: syntax/tests/integration/temporal integrity/data integrity/Watchtower impact.
J. Measure: define evidence required to keep/reject/promote the idea.
K. Record: what changed, why, evidence, result, blocker, rollback and next step.
L. Self-critique: ask what ARGUS believes it knows, what remains uncertain, and what could be fooling it.
M. Simplify: inspect whether any existing module, cron, feature, cache, storage path or experiment can be merged, retired or removed safely.
N. Re-prioritize: update the perfection order based on new evidence, failures, quota pressure and structural risk.
O. Repeat indefinitely.

## External benchmark doctrine
ARGUS should routinely study and compare itself against publicly documented best practices from high-quality sources such as primary research, PMLR/arXiv papers, official cloud MLOps documentation, StatsBomb technical/educational work, Opta/The Analyst methodology, Good Judgment/Superforecasting calibration practices, and reputable market-microstructure research.

For every external practice, answer:
- What exact problem does it solve?
- What assumptions does it require?
- What data does ARGUS already possess or lack?
- Can the idea be reproduced cheaply and legally?
- What is the smallest falsifiable test?
- What result would count as failure?
- What measurable improvement would justify adoption?
- What could create a false positive improvement?
- Does it beat a simpler baseline?
- Does it improve selected-case calibration, CLV, robustness or abstention quality rather than only apparent accuracy?

Priority benchmark themes:
- probabilistic calibration and Brier/log-loss discipline
- superforecasting habits: base rates, decomposition, frequent evidence-based updating, calibration tracking
- xG and shot-quality modeling used as inputs to team-strength systems rather than narrative features
- market-informed priors and no-vig consensus baselines
- simulation and distributional forecasting rather than point prediction alone
- delayed-ground-truth monitoring
- model/data/version registries and lineage
- training-serving skew detection
- feature attribution and feature-distribution drift
- model disagreement and ensemble diversity
- selective prediction/abstention
- online calibration under drift
- event-driven data refresh and Value of Information
- production fault isolation and graceful degradation

## Perfection backlog categories
### Integrity
- richer source lineage and provenance
- field-level freshness SLAs
- feature timestamp assertions
- frozen prediction hashes
- storage checksums
- leakage scanner
- silent-failure detector
- malformed-data adversarial tests

### Probability quality
- segmented calibration
- uncertainty decomposition
- prediction reliability model
- conformal calibration research
- model-disagreement analysis
- OOD/unknown-unknown detection
- fair-price consistency across markets
- market-baseline incremental value testing
- confidence decomposition into model/data/market/governance components
- tail calibration for rare/extreme outcomes
- probability stability under small input perturbations

### Market truth
- richer opening-to-closing snapshots
- no-vig bookmaker consensus
- sharp/soft source weighting
- expected CLV model
- price-path/timing model
- liquidity proxies
- market reaction to lineups/news
- shadow market maker / complete fair-price surface
- cross-venue benchmark checks against sharp sportsbooks/exchanges where legally and technically available

### Specialist intelligence
- true market-specific predictive models
- league-specific specialists
- team-state models
- lineup surprise model
- player replacement value
- tactical matchup model
- goalkeeper/set-piece/fatigue/travel modules only when evidence supports them

### Abstention and risk
- NO BET learning
- dynamic evidence thresholds
- edge-survival model
- correlation/exposure controls
- drawdown governance
- opportunity-cost ranking
- confidence ceilings by league/market/data quality
- explicit OOD abstention
- abstention-quality scoring
- selective prediction with calibrated deferral
- minimum evidence clock before stronger verdicts
- sequential-testing protection against premature conclusions

### Scientific validation
- strict walk-forward
- temporal embargo/purging
- blind holdout vault
- bootstrap stability
- multiple-testing control
- outlier-removal reality checks
- ablation testing
- cross-season/cross-league robustness
- champion/challenger tournament
- automatic rollback readiness
- pre-registration for major experiments
- concentration and luck-adjusted performance checks
- experiment collision detection
- one-major-change-at-a-time rule for causal attribution of improvements
- fragility tests under parameter and feature perturbation

### MLOps and reliability
- CI integration gate
- golden fixtures
- replay engine
- synthetic production probes
- canary/shadow deployment
- model/data version registry
- reproducible inference
- dependency/security checks
- incident classification
- safe self-healing
- structural simplification and fault isolation
- delayed-ground-truth monitoring architecture for cases where settlements arrive later than predictions

### Resource intelligence
- API value-per-call measurement
- Value of Information scheduling
- adaptive refresh cadence
- event-driven refresh where useful
- compute allocation by uncertainty/opportunity
- degraded-mode policies
- cost-to-information score per recurring job

### Human interface
- single Watchtower health score
- evidence badges
- confidence vs evidence-quality separation
- reason-change history
- human-readable decision provenance
- daily executive summary
- weekly scientific report
- monthly reality check
- decision readiness score separate from raw model confidence

### Autonomous research
- hypothesis generator
- novelty checker
- research backlog ranking
- experiment retirement
- auto-generated model cards
- negative-result memory
- continuous literature/method scouting
- periodic architecture simplification review
- self-critique engine
- adversarial hypothesis challenge
- explicit unknown/ignorance registry
- research diversity rule across data/model/calibration/market/MLOps/architecture/resource themes

## Maximum acceleration ideas
1. Selective conformal abstention: research methods that preserve useful coverage guarantees when predictions are only emitted for selected high-quality cases. Use only in RESEARCH until assumptions are validated for ARGUS.
2. Drift-aware online calibration: investigate calibration-set updates that react to smooth or abrupt distribution change without contaminating future information.
3. Adaptive model aggregation under drift: when several well-calibrated specialists exist, evaluate online aggregation rather than brittle winner-takes-all model switching.
4. Recurrent-regime memory: detect when a previously seen league/season/regime distribution returns and reuse a historically validated specialist instead of retraining from scratch when safe.
5. Tail calibration: separately evaluate whether rare outcomes and extreme probability tails are calibrated; cap confidence when tail evidence is weak.
6. Red-Team / Devil's Advocate Gate: every PRIME candidate should be challenged by an adversarial layer looking for leakage, stale data, market disagreement, instability, contradictory evidence and alternative explanations.
7. Confidence Budget: final confidence must be capped by the weakest of data quality, calibration, market agreement/edge evidence, temporal integrity, drift status and model stability.
8. Decision Readiness Score: separate 'probability estimate' from 'is this decision mature enough to act on?'. High probability with low readiness remains WATCH/NO BET.
9. Ensemble Diversity Audit: measure correlation of model errors so multiple near-duplicate models cannot masquerade as independent consensus.
10. Edge Inflation Monitor: alert when estimated edges rise materially without corresponding improvement in CLV, calibration or market-truth evidence.
11. PRIME Scarcity Monitor: treat a sudden increase in PRIME frequency as a possible calibration/governance defect.
12. Temporal Consistency Score: track unexplained probability jumps between T-24h/T-6h/T-1h/T-15m and require a data/event explanation for large moves.
13. Signal Half-Life Registry: learn how long each feature remains informative and expire stale information automatically.
14. Feature Retirement Engine: quarantine or remove features that fail to add stable OOS/calibration/CLV value.
15. Baseline Survival Test: complex models must beat simple market-only, Elo/Poisson or logistic baselines on the relevant probabilistic metrics.
16. No-Bet Regret Matrix: measure not only bad bets taken, but also good opportunities rejected, to calibrate abstention rather than maximizing abstention blindly.
17. Information Shock Score: distinguish meaningful new information from narrative noise and measure whether the market already incorporated it.
18. Evidence Debt: every unvalidated feature/model/automation accumulates visible evidence debt until its proof requirements are met.
19. Architecture Entropy Score: monitor duplication, dependency count, coupling, cron fragility and stale-state paths so structural debt becomes measurable.
20. Maximum Simplicity Challenge: periodically test whether current performance can be reproduced with fewer features/models/modules; prefer the simpler equivalent system.
21. Superforecasting discipline layer: force decomposition, base-rate anchoring, explicit update reasons and calibration tracking for major probability changes.
22. Training-serving skew monitor: detect when production feature distributions or transformation logic diverge from research/backtest assumptions.
23. Attribution-drift monitor: track whether the features driving predictions change materially even when headline performance still looks stable.
24. Delayed-label evaluator: treat settlement delay as a first-class monitoring problem so ARGUS does not misread recent unlabelled periods as evidence.
25. Benchmark assimilation queue: each validated external insight enters a queue with source, hypothesis, reproducibility score, cheapest test and rejection criteria.

## My highest-priority improvement principles
1. Truth before action: improve probability truthfulness before trying to increase the number of bets.
2. Calibration before confidence: confidence is earned only through repeated out-of-sample calibration.
3. Market baseline before model pride: compare every model against no-vig market probabilities and ask whether ARGUS adds incremental information.
4. Abstention before forced prediction: when uncertainty is high, NO BET is a correct output.
5. Temporal integrity before backtest performance: any suspected leakage invalidates the evidence.
6. CLV before short-term ROI: closing-line value is a primary external truth signal; ROI is noisier and secondary.
7. Robustness before promotion: every challenger must survive different periods, leagues, odds bands and plausible perturbations.
8. Simplicity before complexity: new complexity must beat a simpler baseline and justify its operational cost.
9. Reproducibility before self-modification: every improvement must be traceable, versioned and reversible.
10. Structural health before feature count: remove duplication, coupling and fragile sequencing before adding more modules.
11. Value of Information before API spending: collect the next piece of data only when it has a plausible chance to change or improve the decision.
12. Self-critique before self-confidence: ARGUS must actively search for reasons its own conclusion could be wrong.
13. Unknown detection before extrapolation: unfamiliar regimes should lower confidence automatically.
14. Negative evidence before positive adaptation: weak segments can be downgraded quickly; stronger trust accumulates slowly.
15. Portfolio truth before isolated wins: evaluate correlated exposure and aggregate risk, not only individual picks.
16. Research memory before repeated experimentation: preserve failures, rejected ideas and null results.
17. Human interpretability before opaque automation: any strong output should have an auditable reason and evidence-quality explanation.
18. Reliability before speed: a slower correct pipeline is better than a fast corrupted one.
19. Fail-safe before graceful optimism: when integrity or freshness fails, downgrade to observation rather than fabricate confidence.
20. Evidence density before feature volume: fewer high-quality features beat many weak narrative features.
21. Selection-aware uncertainty before aggressive filtering: if ARGUS only acts on selected cases, calibration must be evaluated on those selected cases too, not only globally.
22. Drift-aware learning before continuous mutation: adapt calibration/weights only when the observed non-stationarity warrants it and evidence is sufficient.
23. Friend-as-research-partner principle: assistant inputs deserve serious testing and rapid operationalization, but never immunity from falsification.
24. Benchmark-before-build principle: before inventing a new subsystem, first check whether a mature public method already solves the same class of problem more simply.
25. Assimilate, do not imitate: extract generalizable methods from strong external systems and validate them in ARGUS's own temporal/data constraints.

## Execution priority
1. Integrity and reproducibility
2. Calibration / uncertainty / market truth
3. NO BET and risk controls
4. Champion/challenger and robustness
5. Reliability / MLOps
6. Specialist intelligence
7. Resource efficiency
8. Human UX
9. Advanced autonomous R&D

## Definition of progress
A change counts as progress only if it improves one or more of: integrity, calibration, CLV quality, uncertainty handling, rejection quality, robustness, observability, reproducibility, quota efficiency, reliability or human interpretability without materially weakening another critical dimension.

ARGUS must continuously search for better ideas, but must never confuse novelty with improvement.
