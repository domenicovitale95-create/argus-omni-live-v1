# ARGUS PRE-MATCH vNext — SHADOW architecture

Status: SHADOW-ONLY. This document does not authorize real wagering and does not change PRIME/VALUE/WATCH, staking, confidence semantics, or production prediction behavior.

## Objective
Measure whether ARGUS adds prospective information beyond a de-vigged pre-kickoff market benchmark. Optimize probability quality before selection volume.

## Scientific contract
1. Every forecast is frozen before kickoff with timestamp and provenance.
2. No live information may mutate a frozen pre-match forecast.
3. Evaluation is prospective / walk-forward only.
4. Compare model, de-vigged market, and fusion on exactly the same fixtures.
5. Primary metrics: Log Loss, Brier/RPS, calibration/ECE.
6. Secondary diagnostics: frozen-odds ROI, CLV, drawdown and coverage.
7. Report by market × league × odds band × forecast horizon where sample size permits.
8. A challenger cannot affect production until it beats the incumbent prospectively under predeclared gates.

## Architecture
DATA QUALITY → INDEPENDENT FOOTBALL MODEL → MARKET DE-VIG → SHADOW FUSION → CALIBRATION → UNCERTAINTY / ABSTENTION → IMMUTABLE SNAPSHOT → SETTLEMENT → VALIDATION.

### Independent model
Keep the football model independent from the price it will later evaluate. Goal-distribution models should produce coherent 1X2, totals, BTTS, team totals and score probabilities from a common score distribution where possible.

### Market benchmark
Use complete pre-kickoff books only. Remove margin before comparison. Preserve source, observed time, odds, overround and method. Never substitute post-kickoff or reconstructed prices for a frozen price.

### Fusion challenger
The existing heuristic logit shrinkage remains production-safe. vNext learns fusion weights only from earlier out-of-sample history and validates them on later fixtures. If incremental ARGUS weight is unsupported, retain the market benchmark rather than forcing model influence.

### Calibration
Learn calibration only from earlier out-of-sample predictions. Hit rate alone can never promote a challenger.

### Uncertainty and abstention
Do not convert every disagreement into a signal. Estimate uncertainty and require a margin of safety. Low-quality, incomplete, stale or statistically weak cells abstain.

## Forecast horizons
Collect immutable snapshots when data permits:
- EARLY: approximately T-24h
- UPDATE: approximately T-6h
- LINEUP: approximately T-75m
- FINAL: final valid pre-kickoff snapshot
Exact timestamps, not labels, are authoritative.

## Promotion gates
No automatic promotion. Review only with complete provenance, no temporal leakage, adequate fixture diversity/sample size, stable proper-scoring improvement across time blocks, non-degraded calibration, no single-cell dependence, uncertainty-aware economic diagnostics, and real-bet automation disabled.

## Live scope
Live data is not part of vNext decision generation. Keep only what is needed for results, settlement, operational integrity and research datasets. Any future live model is a separate scientific system.

## Implementation sequence
1. Repair scheduler/cadence metadata so observability matches the real 30-minute fast-cycle contract.
2. Lock immutable pre-match snapshots and provenance.
3. Benchmark incumbent vs de-vigged market on identical prospective fixtures.
4. Add learned fusion as SHADOW challenger, never immediate replacement.
5. Add uncertainty/abstention diagnostics.
6. Expose compact scorecards only after evidence is sufficient.

## Safety invariant
`automaticBetPlacement=false` and `automaticRealBetPlacement=false` remain required. ARGUS supplies probabilistic research and decision support; it does not guarantee profitable outcomes.