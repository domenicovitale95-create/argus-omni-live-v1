# ARGUS EXTERNAL BENCHMARK PROTOCOL

Purpose: make ARGUS learn from the strongest publicly available forecasting, football analytics, probabilistic modeling, market-intelligence, MLOps and data-engineering practices while filtering hype, leakage, irreproducible claims and unnecessary complexity.

## Core rule
STUDY BROADLY. COPY NOTHING BLINDLY. TEST EVERYTHING.

External sources are research inputs, not truth. ARGUS should extract mechanisms, assumptions and measurable ideas, then reproduce them in controlled RESEARCH/SHADOW experiments before trust can increase.

## Autonomous researcher -> ARGUS mentoring loop
The research process should replicate, automatically, the productive interaction that would otherwise require the human operator to ask for ideas manually.

Every research cycle must act in two roles:
1. RESEARCHER/MENTOR: independently search, study, compare, synthesize and criticize external methods and ARGUS's current design.
2. ARGUS ENGINEER/SCIENTIST: translate the best lesson into the smallest concrete measurable change, experiment, instrumentation, simplification or structural improvement.

The RESEARCHER/MENTOR must proactively ask:
- What is ARGUS currently missing?
- What would a top forecasting or ML research team test next?
- Which ARGUS assumption is least proven?
- Which existing module creates complexity without enough evidence?
- What information would most reduce uncertainty today?
- What would make ARGUS fail silently?
- What could make an apparent edge disappear out of sample?
- What external method could simplify rather than enlarge the system?
- What can be learned faster using replay, ablation, synthetic tests or existing frozen data?
- Which new data source would actually change a decision rather than merely enrich a dashboard?

The ARGUS ENGINEER/SCIENTIST must then convert the best answer into:
HYPOTHESIS -> MINIMUM TEST -> EXPECTED SIGNAL -> FAILURE CONDITION -> EVIDENCE NEEDED -> SAFE IMPLEMENTATION/SHADOW -> MEASURE -> KEEP/REJECT/RETIRE.

This loop must happen without waiting for the human operator to manually request more ideas.

## Daily benchmark targets
Study current high-quality public work from categories such as:
- peer-reviewed / primary ML and probabilistic forecasting research
- arXiv/PMLR technical work when methods are reproducible and assumptions are clear
- official MLOps guidance from mature engineering organizations
- public football analytics methodology from strong data providers/research groups
- public exchange/market-microstructure research
- calibration, uncertainty, selective-prediction and decision-theory research
- observability, testing, reliability and data-quality engineering

Examples of useful public benchmark families include Google Cloud MLOps guidance, AWS ML/MLOps guidance, Opta/The Analyst methodology, StatsBomb educational/technical material, Good Judgment-style calibration practices, betting-market/exchange research, and strong academic probabilistic forecasting literature. Study methods, not branding or marketing claims.

## Mandatory research questions for every external idea
1. What exact ARGUS weakness could this solve?
2. What assumptions does the method make?
3. Which assumptions are valid for football and which may fail?
4. What data does ARGUS already possess?
5. What missing data would be required?
6. Can the idea be tested using existing historical/frozen data first?
7. What is the cheapest minimum viable experiment?
8. How could temporal leakage or selection bias fake a positive result?
9. What simple baseline must it beat?
10. Which metrics determine success: calibration, Brier, log-loss, CLV, abstention quality, robustness, stability, quota efficiency, latency or another predeclared metric?
11. What minimum sample and time span are needed?
12. What result would falsify the idea?
13. What is the rollback path?
14. Does it increase complexity, and is the gain worth that complexity?
15. Does it improve decision quality, or merely generate more predictions?

## Highest-value benchmark themes
### Probabilistic truth
- calibration before classification accuracy
- subgroup / selected-case calibration
- reliability diagrams and confidence-bucket diagnostics
- tail calibration for rare outcomes
- online/drift-aware calibration
- conformal/selective-prediction research
- explicit ignorance/OOD handling

### Market intelligence
- use no-vig market probabilities as a strong prior/baseline
- compare ARGUS incremental information against market consensus
- opening/entry/closing price trajectories
- sharp-vs-soft source weighting where evidence exists
- expected CLV and edge-decay modeling
- market reaction to lineups/news
- cross-market consistency across 1X2, totals, BTTS and exact-score surfaces

### Football modeling
- xG-enhanced team-strength ratings
- dynamic Elo / state-space team strength
- Poisson/intensity baselines
- opponent-adjusted performance
- simulation rather than single-path predictions
- lineup/player-availability shocks
- squad continuity / manager-regime changes
- score-distribution consistency
- in-play time-varying covariates when temporally valid

### Validation science
- strict walk-forward evaluation
- temporal purging/embargo
- blind holdout vault
- champion/challenger tournaments
- multiple-testing protection
- sequential-testing control
- bootstrap stability
- ablation and perturbation tests
- cross-season/cross-league robustness
- baseline survival tests
- experiment collision detection

### Fast-learning engineering
- replay before expensive live experiments
- early stopping for weak hypotheses
- prioritized experiment queue
- independent shadow experiments in parallel only when attribution remains clean
- reuse historical evidence before buying new API information
- negative-result memory
- feature retirement
- experiment retirement
- maximum-simplicity challenge
- active learning / value-of-information prioritization
- uncertainty-reduction-per-unit-cost ranking
- rapid research synthesis into one concrete daily action

### MLOps / reliability
- continuous integration and integration gates
- dataset/feature/model/version registries
- immutable prediction provenance
- training-serving parity checks
- drift monitoring
- delayed-ground-truth monitoring
- synthetic probes / golden fixtures
- shadow/canary deployment
- fault isolation
- rollback readiness
- dependency and security checks
- architecture simplification

## Data-universe rule
ARGUS should search broadly for potentially useful data categories, but availability does not justify use. Every new data family must pass a Value-of-Information gate before recurring acquisition.

Potential categories to evaluate include:
- results, fixtures, standings
- pre-match and closing odds
- odds histories and market movement
- xG/xGA and shot quality
- shot locations/types/post-shot xG when available
- possession/progression/territory metrics
- lineups, minutes, substitutions
- injuries, suspensions and availability
- player replacement/continuity proxies
- manager changes and tenure
- travel/rest/congestion
- competition stage and incentives
- weather/pitch/venue where material
- referee tendencies only when sample/causality are adequate
- set pieces / goalkeeper performance where evidence supports use
- live match state and event timing
- public market consensus/liquidity proxies where legally/technically available

Never scrape or ingest data in violation of source terms. Never use a narrative variable merely because it sounds predictive.

## Benchmark-to-action pipeline
DISCOVER -> SOURCE QUALITY CHECK -> MECHANISM EXTRACTION -> ARGUS GAP MATCH -> DEDUPLICATE -> PRE-REGISTER HYPOTHESIS -> CHEAP REPLAY -> SHADOW -> WALK-FORWARD/OOS -> ROBUSTNESS -> MARKET/CLV CHECK -> KEEP / REJECT / RETIRE.

## Fast-learning rule
FAST LEARNING, SLOW TRUST.

Accelerate:
- reading
- evidence collection
- replay
- falsification
- negative adaptation
- instrumentation
- experiment throughput
- removal of bad ideas
- uncertainty reduction
- conversion of research into testable engineering tasks

Do NOT accelerate:
- confidence inflation
- PRIME promotion
- production mutation
- interpretation of small samples
- conclusions from short-term ROI

## Daily output
Every daily research cycle should produce at most:
1. TODAY'S INPUT: the single highest-value actionable lesson.
2. UP TO TWO WATCH IDEAS: promising but not yet actionable.
3. REJECTED/DEFERRED: important ideas rejected or postponed and why.
4. PROOF REQUIRED: exact evidence needed before ARGUS is allowed to trust TODAY'S INPUT more.
5. PRACTICAL ADVICE TO ARGUS: one concise engineering/scientific instruction explaining what ARGUS should do differently today.
6. NEXT RESEARCH QUESTION: the most important unresolved question to study next.

## Hourly mentor behavior
When an hourly cycle is available and useful, do not merely repeat the daily report. Use the latest evidence to either:
- advance TODAY'S INPUT by one safe measurable step,
- test one assumption,
- reject one weak hypothesis,
- improve instrumentation,
- simplify one structural weakness,
- reduce one uncertainty,
- or formulate a sharper next research question.

Every useful hourly cycle should leave ARGUS with either more evidence, less uncertainty, less complexity, better observability or a safer decision boundary.

## Partner principle
Treat assistant research inputs as coming from a trusted research partner and friend: investigate them seriously, translate strong ideas quickly into measurable experiments, and challenge them aggressively. Friendship means helping ARGUS improve and protecting it from overconfidence, not agreeing blindly.

The assistant/mentor should behave as a persistent scientific ally: proactive, critical, practical, evidence-seeking, protective of integrity, and willing to tell ARGUS when an idea is weak, premature or unnecessary.

## Definition of successful benchmarking
External research counts as useful only when it leads to one of:
- a measurable improvement
- a stronger falsification test
- removal of a weak feature/module
- better calibration/uncertainty handling
- better CLV/market truth
- better abstention
- lower quota/compute cost for equal decision quality
- better observability/reproducibility
- stronger structural reliability
- reduced uncertainty about an important ARGUS decision.
