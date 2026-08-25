# ARGUS OMNI — FULL STACK DOCTRINE

ARGUS OMNI is an autonomous football intelligence and paper-betting research system.

## Priority hierarchy

1. Data integrity and temporal integrity.
2. Canonical prediction ledger integrity.
3. Market-aware probability estimation.
4. Calibration and uncertainty governance.
5. Decision quality and edge survival.
6. Virtual bankroll execution.
7. Settlement, error attribution and learning.
8. User-facing simplicity and observability.

If a lower layer conflicts with governance or integrity: **GOVERNANCE WINS**.

## Core mission

Estimate calibrated probabilities, price markets, identify probability-price discrepancies, quantify uncertainty, reject fragile edges, execute only eligible virtual bets, freeze every decision before settlement, measure outcomes and learn from real results.

Core chain:

**OBSERVED DATA → MARKET PRIOR → MODEL → DECISION → PAPER EXECUTION → SETTLEMENT → LEARNING**

Detailed decision pipeline:

**MARKET PRIOR → SUPPORTED MODEL → RAW → SHRUNK → CONSERVATIVE → FAIR PRICE → EV → EDGE SURVIVAL → PRICE DISCIPLINE → ADVERSARIAL TEST → GOVERNANCE → ACTION**

## Market-first doctrine

For liquid markets, the no-vig market probability is the default prior. Historical and form models do not automatically override the market. Residual corrections require incremental evidence.

Every actionable candidate must expose RAW, SHRUNK and CONSERVATIVE probability. Conservative EV must survive integrity and governance gates before ARGUS may classify a decision as actionable.

## Calibration and governance

Adjustments are classified as VALIDATED, HEURISTIC or UNAVAILABLE.

ARGUS must not manufacture confidence match by match. Calibration status and uncertainty status are explicit and may block stronger labels.

A high-confidence label is earned by evidence, not by UI demand.

## Canonical ledger

The Prediction Ledger is the source of truth for frozen forecasts and settled results.

Learning, calibration, error attribution, reporting and proof dashboards must derive from the same canonical settled universe. Separate diagnostic stores must never silently replace the canonical ledger.

Frozen forecast fields are never rewritten after the result.

Audit doctrine:

**FREEZE FIRST. MEASURE SECOND. CALIBRATE THIRD. PROMOTE LAST.**

## Autonomous paper betting

ARGUS may automatically execute a bet only inside the virtual bankroll after all required gates pass.

Real-money bet placement remains disabled.

A valid operational cycle is:

**DISCOVER → VALIDATE → PRICE → DECIDE → PAPER BET / NO BET → FREEZE → SETTLE → LEARN**

ARGUS is allowed to analyse everything and place zero virtual bets. **NO BET is a first-class action, not a failure.**

Skipped, missed, voided, won and lost decisions remain visible for auditability.

## Live intelligence

When a match is in play, ARGUS switches to live match-state analysis. Historical and pre-match information become priors rather than static truth.

Live doctrine:

**FRESH DATA FIRST. MARKET FIRST. INFORMATION SECOND. MODEL THIRD. PRICE FOURTH. ACTION LAST.**

A material score, minute, red-card, process-statistic or price change requires recalculation. Stale LIVE flags must never survive beyond their plausible temporal window.

## Learning and error attribution

Learning must be evidence-based and ledger-aligned.

A learning component may modify future decisions only when:

- its input universe is canonical and complete enough;
- the adjustment is traceable;
- calibration evidence supports the direction and magnitude;
- the change does not bypass governance;
- the effect can be audited and reversed.

Diagnostic GET endpoints are read-only. Observability must never mutate betting, bankroll or canonical prediction state.

## User experience

The internal system can be complex; the user interface should not be.

The product should answer simple questions:

- What should I bet today?
- Is anything good enough?
- Should ARGUS wait?
- What virtual bets were actually played?
- What happened afterward?
- Is ARGUS learning?

The interface must clearly distinguish PAPER / VIRTUAL activity from real-money wagering.

## Cache and deployment integrity

Production code, service-worker shell and visible UI must represent the same deployed philosophy.

The PWA cache must be explicitly versioned and old ARGUS shell caches removed on activation so mobile devices do not remain on obsolete UI or behavior after a deployment.

## Current validation state

ARGUS is an operational research system, not a guaranteed-profit engine.

Validation, calibration, source freshness and temporal integrity take priority over signal quantity. Strong labels remain blocked whenever the required evidence is insufficient.

## Final doctrine

**SEE EVERYTHING. PRICE EVERYTHING. BET ONLY THE EDGE.**

**NO EDGE, NO BET.**

**VIRTUAL MONEY. REAL RESULTS. LEARN FROM EVERYTHING.**
