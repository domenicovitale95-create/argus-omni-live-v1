# ARGUS OMNI — FULL STACK INTEGRATION

Integrated operational stack for the ARGUS OMNI LIVE web application.

## Priority hierarchy

1. Data integrity and temporal integrity.
2. ARGUS OMNI Master Knowledge.
3. V5 Ensemble / residual market protocol.
4. V7 Calibration & Governance.
5. V8 Track Record & Self-Audit.
6. V9 Command Center / routing.
7. V10 Live Betting Intelligence.

If a lower layer conflicts with governance: **GOVERNANCE WINS**.

## Master Knowledge

Mission: estimate calibrated probabilities, price markets, identify probability-price discrepancies, quantify uncertainty, reject fragile edges and measure performance from frozen forecasts.

Core chain:

OBSERVED DATA → MODEL → DECISION.

Decision pipeline:

MARKET PRIOR → SUPPORTED MODEL → RAW → SHRUNK → CONSERVATIVE → FAIR PRICE → EV → EDGE SURVIVAL → PRICE DISCIPLINE → ADVERSARIAL TEST → ACTION.

## V5 — Ensemble / residual protocol

Current research constraint:

- 1X2: MARKET-DOMINANT.
- Main goals: MARKET-DOMINANT / RESEARCH.
- Corners: RESEARCH.
- Cards: RESEARCH-PROMISING only.

The market no-vig price is the default prior for liquid markets. Historical/form models do not automatically override the market. Residual corrections require incremental evidence.

Every candidate uses RAW, SHRUNK and CONSERVATIVE probability. Conservative EV must survive for an actionable VALUE classification.

## V7 — Calibration & Governance

Adjustments are classified as VALIDATED, HEURISTIC or UNAVAILABLE.

The current website deployment uses fixed, global, market-dominant heuristic shrinkage because no deployment-specific replicated out-of-sample calibration registry is yet available.

Therefore:

- Shrinkage Status: HEURISTIC / MARKET-DOMINANT.
- Uncertainty Status: HEURISTIC / UNCALIBRATED.
- VALUE may be labelled VALUE — UNCALIBRATED when conservative EV remains positive.
- STRONG VALUE is blocked without validated/strongly supported engines.
- PRIME is locked while calibration remains materially heuristic.

No parameter is changed match-by-match to manufacture a signal.

## V8 — Track Record & Self-Audit

The web application includes a frozen local V8 record mechanism.

A user may freeze a current actionable forecast before settlement. Frozen fields include:

- version information;
- timestamp;
- match and competition;
- market/selection/odds;
- no-vig market probability;
- RAW / SHRUNK / CONSERVATIVE probabilities;
- fair odds;
- minimum acceptable odds;
- edge and EV;
- confidence/data quality;
- engine/shrinkage/uncertainty status;
- classification;
- models executed;
- main risks.

Frozen forecast fields are never rewritten after the result.

Audit philosophy:

FREEZE FIRST. MEASURE SECOND. CALIBRATE THIRD. PROMOTE LAST.

## V9 — Command Center

The dashboard implements the V9 daily-scan philosophy:

- broad fixture discovery;
- quota-aware pre-screening;
- detailed analysis only when inputs exist;
- market-first pricing;
- supported engine gating;
- RAW → SHRUNK → CONSERVATIVE;
- Edge Survival;
- price discipline;
- governed shortlist.

The website filters SIGNALS / PRIME / VALUE / WATCH / NO BET / ALL.

## V10 — Live intelligence

When a match is in play, ARGUS switches to live match-state analysis. Live data can include current score, minute, process statistics and current odds. Historical/pre-match information becomes a prior rather than being reused unchanged.

Live doctrine:

FRESH DATA FIRST.
MARKET FIRST.
INFORMATION SECOND.
MODEL THIRD.
PRICE FOURTH.
ACTION LAST.

A material live state or price change requires recalculation.

## Current validation state

The present deployment is an operational research system, not a validated profit engine.

Current PRIME Gate: **LOCKED**.

Reason: the deployment does not yet possess replicated out-of-sample calibration evidence for its current 90-day historical layer, API-Football provider blend, live process model and current heuristic shrinkage policy across the competitions being scanned.

This is intentional compliance with V5/V7/V8/V10 governance, not a missing feature.

## Final doctrine

**ANALYZE EVERYTHING. BET ALMOST NOTHING.**

**SEE EVERYTHING. PRICE EVERYTHING. BET ONLY THE EDGE.**

**CALIBRATION BEFORE CONFIDENCE. VALIDATION BEFORE PRIME.**
