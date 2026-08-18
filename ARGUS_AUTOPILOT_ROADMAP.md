# ARGUS AUTOPILOT — DEVELOPMENT ROADMAP

## Mission
Turn ARGUS OMNI from a scan-on-click application into a disciplined autonomous football intelligence loop:

OBSERVE → MODEL → PRICE → GOVERN → FREEZE → SETTLE → AUDIT → RECALIBRATE.

Automation must never lower governance standards. More data must increase the ability to reject weak bets, not force selections.

## Phase A — Data Foundation
- Persistent shared team-history cache.
- Persistent fixture snapshots.
- Persistent odds snapshots for opening / intermediate / closing prices.
- Deduplicate API-Football requests across Home, DANGER and audit jobs.
- Quota-aware adaptive enrichment.
- Store provenance and timestamps for every decision-critical input.

## Phase B — Multi-Model Ensemble
Independent components:
1. Market no-vig prior.
2. Team-strength / Poisson goal model.
3. Recent-form model (5 / 10 match windows).
4. Home-away split model.
5. API-Football provider prediction as secondary evidence only.
6. Live match-state model.

ARGUS must expose model disagreement and never hide missing evidence.

## Phase C — Market Intelligence
For actionable fixtures record price snapshots when available:
- early/opening observation
- T-24h
- T-6h
- T-1h
- lineup window
- closing observation
- live observations for monitored fixtures

Calculate Closing Line Value (CLV) for frozen selections. Winning a bet is not enough evidence of model quality; consistently beating the closing market is an independent diagnostic.

## Phase D — Autopilot Scheduler
Suggested automated cycle (Europe/Brussels):
- Morning: discover fixtures and seed histories.
- Daytime: refresh stale data and odds using adaptive cadence.
- Pre-kickoff: increase monitoring for WATCH/VALUE candidates.
- Lineup window: refresh lineups/injuries where supported and recalculate.
- Live: tiered monitoring. Scan all cheaply; intensify only candidates.
- 23:55: settle finished predictions and generate daily report.
- After settlement: update calibration/audit metrics.

## Phase E — V8 Learning Loop
Never self-train directly from a handful of wins/losses.
Maintain out-of-sample evidence by:
- market
- league
- phase (PREMATCH/LIVE)
- confidence bucket
- edge bucket
- data-quality bucket
- model version

Metrics:
- sample size
- hit rate
- ROI / yield (when valid frozen odds exist)
- Brier score
- log loss
- calibration error
- CLV

Model weights may only change after minimum sample and stability gates. Every weight change must be versioned and reversible.

## Phase F — Governance
PRIME stays locked until V8 validation criteria are met.
Block or downgrade signals when:
- price missing/stale
- critical data incomplete
- model disagreement excessive
- conservative EV <= 0
- edge disappears after price movement
- league/model bucket has insufficient validation

## Phase G — ARGUS LAB
Dashboard should expose:
- frozen predictions
- settled predictions
- win/loss/push/unresolved
- calibration by bucket
- CLV
- ROI/yield
- performance by league and market
- current model weights
- degraded/disabled model buckets
- data coverage and API efficiency

## Target architecture
API-FOOTBALL → PERSISTENT DATA LAYER → MODEL ENSEMBLE → MARKET PRICING → V12 GOVERNANCE → FROZEN DECISION LEDGER → SETTLEMENT → V8 AUDIT/CALIBRATION → VERSIONED MODEL WEIGHTS.
