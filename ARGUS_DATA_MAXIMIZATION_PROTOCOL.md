# ARGUS DATA MAXIMIZATION PROTOCOL

Purpose: maximize the amount, quality, usability and decision-value of football data available to ARGUS without wasting quota, violating source terms, introducing leakage, or confusing data volume with predictive value.

## Core principle
MORE DATA IS USEFUL ONLY WHEN IT IS TIMELY, TRUSTWORTHY, TRACEABLE, NORMALIZED AND CAPABLE OF CHANGING A DECISION.

ARGUS should aggressively expand its evidence base, but every recurring data source must pass a Value-of-Information gate.

## 1. Build a normalized local Match Intelligence Record
For every fixture, maintain one canonical machine-readable record keyed by fixture ID. It should be simple for models and humans to inspect and should evolve from sparse to rich as kickoff approaches.

Target fields/categories:
- fixture identity, competition, season, round, venue, kickoff timestamp and timezone
- team identities and canonical IDs
- standings and season context
- recent results and opponent-adjusted form
- historical head-to-head with low weight unless contextually valid
- goals/xG/xGA/shot-quality data when legally and technically available
- shots, possession, territory/progression, set-piece and goalkeeper indicators when evidence supports them
- projected and confirmed lineups
- minutes/availability/suspensions/injuries
- player continuity and replacement-value proxies
- manager/coach regime and tenure
- rest, travel and schedule congestion
- competition stage and incentive context
- weather/pitch/venue only when material and reliable
- pre-match odds snapshots from multiple times and sources
- no-vig consensus probabilities
- live odds snapshots when captured in time
- market movement, entry, closing and best-later prices
- ARGUS model versions, features, probabilities, uncertainty and verdict history
- prediction freeze timestamp and immutable hash
- settlement, outcome, CLV, Brier/log-loss contribution and audit result
- source provenance, retrieval timestamp, freshness and confidence for every important field.

## 2. Data layers
RAW -> NORMALIZED -> FEATURED -> FROZEN PREDICTION INPUT -> SETTLED OUTCOME -> AUDIT/LEARNING.

Never overwrite raw evidence. Derived values must be reproducible from raw or normalized state.

## 3. Source registry
Maintain a source registry with:
- source name/type
- permitted use / terms status
- coverage by league/season
- available fields
- latency/freshness
- historical depth
- reliability score
- API/request cost
- missingness rate
- conflict rate versus other sources
- observed incremental Value of Information
- last successful retrieval
- fallback source.

## 4. Data acquisition priorities
Priority A — must-have truth:
- fixtures/results
- kickoff time/status
- odds snapshots and closing prices
- lineups/availability when available
- settlement truth
- timestamps/provenance.

Priority B — high-value modeling evidence:
- recent opponent-adjusted performance
- xG/xGA and shot quality
- player minutes/availability
- team strength ratings
- market consensus / no-vig probabilities
- travel/rest/congestion
- manager/squad regime change.

Priority C — conditional enrichment:
- detailed event data
- goalkeeper/set-piece/player role data
- weather/pitch/referee/context variables
- live-event enrichment.

Priority C data should only become recurring if replay/shadow tests prove added value.

## 5. Historical data strategy
Use free/open/licensed historical datasets to expand research coverage without consuming live provider quota. Reuse cached historical information aggressively. Historical backfill must preserve event timestamps and avoid reconstruction that would leak information unavailable at prediction time.

## 6. Odds capture is critical
Market history is perishable. Capture pre-match odds at multiple predetermined horizons when quota allows (for example T-24h, T-6h, T-1h, T-15m and close) and live odds only when the system can persist them immediately. Store bookmaker/source, market, line, price and retrieval timestamp.

## 7. Coverage-aware API spending
Before requesting expensive enrichment, check whether the provider reports coverage for that league/season/fixture. Do not waste calls on unsupported categories. Resource Intelligence should prefer calls that can change a WATCH/NO BET/decision boundary or close a high-value evidence gap.

## 8. Data Quality Gate
Every candidate input should have:
- provenance
- observed/retrieved timestamp
- event timestamp when applicable
- freshness status
- missing/unknown state distinct from zero/false
- schema validation
- plausible range validation
- conflict detection
- leakage risk status.

## 9. Cross-source conflict handling
When sources disagree, never silently choose one. Record the conflict, rank source reliability, preserve both observations, and lower data confidence until resolved.

## 10. Feature-store discipline
Create canonical reusable features rather than recomputing slightly different definitions across modules. Each feature should have:
- version
- definition
- source inputs
- timestamp semantics
- valid leagues/markets
- missing-data behavior
- evidence of usefulness
- retirement status.

## 11. Data compression for easy study
ARGUS should produce a compact `MATCH SNAPSHOT` for each candidate fixture so both machine and human readers can understand it quickly:
- DATA COVERAGE SCORE
- DATA FRESHNESS SCORE
- MARKET CONSENSUS
- ARGUS FAIR PROBABILITY
- CALIBRATION/READINESS
- LINEUP/AVAILABILITY STATUS
- KEY SUPPORTING SIGNALS
- KEY CONTRADICTING SIGNALS
- WHAT IS STILL UNKNOWN
- ODDS/CLV PATH
- VERDICT + WHY
- NEXT DATA EVENT THAT COULD CHANGE THE VERDICT.

## 12. Evidence accumulation over the next month
The fastest safe route to readiness is not to force more bets. It is to maximize the number of temporally valid frozen predictions, odds snapshots, settlements and audit records so ARGUS can measure real calibration and CLV across segments.

Every day prioritize:
1. increasing complete frozen prediction + odds + settlement coverage;
2. capturing missing closing-line truth;
3. filling the most valuable historical gaps;
4. identifying leagues/markets where data quality is strongest;
5. reducing missingness/conflicts;
6. increasing sample size for calibration and abstention evaluation;
7. rejecting low-quality leagues/markets instead of diluting evidence.

## 13. One-month readiness objective
Within approximately one month, the goal is NOT certainty or guaranteed profit. The goal is a site that can show a small number of highly filtered opportunities only when evidence is strong, with explicit calibrated probability, data coverage, market comparison, uncertainty, CLV history, readiness and reasons to abstain.

A market/segment may be called READY only after its predefined evidence gates are satisfied. If no segment satisfies them, ARGUS must say NOT READY / NO BET rather than fabricate certainty.

## 14. Daily data research obligation
Daily R&D should actively search for new legitimate data sources and data categories. For each candidate source produce:
- exact fields available
- leagues/seasons covered
- historical/live availability
- terms/licensing status
- expected Value of Information
- integration effort
- quota/cost
- reliability/freshness
- smallest replay/shadow test
- KEEP / WATCH / REJECT recommendation.

## 15. Success metrics
Track at minimum:
- complete prediction-record coverage %
- closing-odds coverage %
- lineup/availability coverage %
- source conflict rate
- stale-data rate
- missingness by league/market
- useful information gained per API call
- frozen predictions settled per day
- calibration sample growth
- CLV sample growth
- number of segments reaching minimum evidence thresholds
- number of low-quality segments correctly blocked.

FAST LEARNING, SLOW TRUST. Maximize valid evidence throughput, not confidence inflation.
