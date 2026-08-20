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

## Daily self-improvement loop
A. Observe: inspect system health, data freshness, storage, quota, crons, Watchtower, ledger, calibration, CLV, drift, specialists, NO BET behavior and recent failures.
B. Learn: inspect new settled evidence and compare expected vs realized probability quality.
C. Discover: research one or more new methods, tests, engineering patterns, data-quality ideas, football-modeling techniques, market-microstructure ideas or operational improvements.
D. Deduplicate: compare ideas against `ARGUS_MAXIMUM_PERFORMANCE_ROADMAP.md`, this directive and current code.
E. Rank: score each candidate on expected value, scientific plausibility, implementation cost, quota cost, reversibility, risk and evidence required.
F. Select: choose the single best safe/newly-actionable improvement.
G. Inject: implement on a safe work branch when low risk; otherwise create a research/shadow experiment or update the research backlog.
H. Verify: syntax/tests/integration/temporal integrity/data integrity/Watchtower impact.
I. Measure: define evidence required to keep/reject/promote the idea.
J. Record: what changed, why, evidence, result, blocker, rollback and next step.
K. Repeat indefinitely.

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

### Market truth
- richer opening-to-closing snapshots
- no-vig bookmaker consensus
- sharp/soft source weighting
- expected CLV model
- price-path/timing model
- liquidity proxies
- market reaction to lineups/news

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

### Resource intelligence
- API value-per-call measurement
- Value of Information scheduling
- adaptive refresh cadence
- event-driven refresh where useful
- compute allocation by uncertainty/opportunity
- degraded-mode policies

### Human interface
- single Watchtower health score
- evidence badges
- confidence vs evidence-quality separation
- reason-change history
- human-readable decision provenance
- daily executive summary
- weekly scientific report
- monthly reality check

### Autonomous research
- hypothesis generator
- novelty checker
- research backlog ranking
- experiment retirement
- auto-generated model cards
- negative-result memory
- continuous literature/method scouting
- periodic architecture simplification review

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
