# ARGUS OMNI

ARGUS OMNI is an autonomous football intelligence and paper-betting research system.

Its job is not to produce as many bets as possible. Its job is to observe the available matches, estimate and price outcomes, reject weak or fragile edges, record every eligible virtual decision before settlement, learn from real results and keep the user interface simple.

## Product philosophy

**RESULTS FIRST. VIRTUAL MONEY ONLY. NO FORCED BETS.**

ARGUS follows these rules:

1. Fresh and temporally coherent data come first.
2. The market is a prior, not something to ignore.
3. A model signal is not a bet until it survives governance and integrity gates.
4. If nothing is good enough, ARGUS chooses **NO BET**.
5. Eligible bets may be executed automatically only inside the virtual/paper bankroll.
6. Real-money bet placement is disabled.
7. Forecasts are frozen before settlement and are never rewritten afterward.
8. Results, misses, skips and failures remain visible instead of being hidden.
9. Learning and calibration must use the same canonical prediction ledger as the track record.
10. The user-facing experience should stay simple even when the internal system is complex.

## Operational loop

DISCOVER → VALIDATE DATA → PRICE → MODEL → GOVERNANCE → DECIDE → PAPER BET / NO BET → FREEZE → SETTLE → ATTRIBUTE ERROR → LEARN → RECALIBRATE

ARGUS may analyse many matches and still place zero virtual bets. That is a valid outcome.

## Decision doctrine

For liquid markets, ARGUS starts from a no-vig market prior and applies only supported model corrections.

The decision chain is:

**OBSERVED DATA → MARKET PRIOR → MODEL → RAW → SHRUNK → CONSERVATIVE → FAIR PRICE → EV → EDGE SURVIVAL → GOVERNANCE → ACTION**

Missing odds, stale match state, incomplete coverage, weak evidence, calibration uncertainty or integrity failures can all force a candidate back to WATCH or NO BET.

## Virtual betting

ARGUS uses virtual money for training and evaluation.

- No real bookmaker account is connected for automatic wagering.
- `automaticBetPlacement=false` for real-money placement.
- Eligible decisions can be recorded and staked in the virtual bankroll.
- Open virtual bets are settled against real match results.
- WIN, LOSS, VOID, SKIPPED and MISSED states remain auditable.

The purpose is to measure whether ARGUS improves over time without risking real money.

## Prediction ledger and learning

The canonical Prediction Ledger is the source of truth for frozen forecasts and settled outcomes.

Learning, calibration and error attribution must derive from that same canonical universe. Diagnostic GET endpoints should remain read-only and must not mutate betting, bankroll or prediction state.

Core audit rule:

**FREEZE FIRST. MEASURE SECOND. CALIBRATE THIRD. PROMOTE LAST.**

## Live intelligence

When a match is live, ARGUS must use a fresh live match state rather than carrying forward stale pre-match assumptions.

Live doctrine:

**FRESH DATA FIRST. MARKET FIRST. INFORMATION SECOND. MODEL THIRD. PRICE FOURTH. ACTION LAST.**

A material score, minute, red-card, process-statistic or price change requires recalculation.

## User experience

The interface intentionally translates the internal system into simple questions:

- What should I bet today?
- Is there a good pick?
- Should ARGUS wait?
- What virtual bets were actually played?
- What won or lost?
- Is ARGUS getting better?

The UI should never imply that a bet must exist. **NO BET is a first-class decision.**

## Data and deployment

ARGUS uses server-side football data integrations and quota-aware caching. API secrets remain server-side and must never be committed to the repository.

The production application is deployed on Vercel. The PWA/service-worker cache is versioned so new philosophy, UI and runtime changes replace older mobile shells instead of leaving users on stale versions.

## Governance

ARGUS is an operational research system, not a guaranteed-profit engine.

Calibration status, uncertainty, provider freshness and integrity gates take priority over signal quantity. PRIME or other high-confidence labels must not be promoted unless the required validation evidence exists.

## Final doctrine

**SEE EVERYTHING. PRICE EVERYTHING. BET ONLY THE EDGE.**

**NO EDGE, NO BET.**

**VIRTUAL MONEY. REAL RESULTS. LEARN FROM EVERYTHING.**
