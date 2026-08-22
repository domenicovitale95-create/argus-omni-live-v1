# ARGUS Mentor Gateway Protocol

Status: DORMANT / ZERO-COST / RESEARCH ONLY

## Purpose
Prepare ARGUS to consult an external scientific mentor in the future without granting that mentor authority over production, PRIME/VALUE, credentials, frozen predictions, settlements, or governance.

## Canonical principles
- FAST LEARNING, SLOW TRUST.
- Mentor output is hypothesis input, never privileged truth.
- Frozen predictions and temporal integrity are immutable.
- No subsystem, including Mentor, can create PRIME alone.
- No direct merge to main, production promotion, secret mutation, staking change, or real-money wagering.
- Prefer historical/frozen evidence before new provider spend.

## Mentor Brief contract
ARGUS should prepare a compact factual brief containing:
- generatedAt
- cycleId
- systemHealth
- deployment/branch parity
- runtime/build error summary
- quota/freshness/provenance summary
- temporal/ledger/settlement integrity summary
- calibration, Brier/log-loss, CLV and drift only when genuinely available
- unresolved failures
- recent changes
- evidence added since prior brief
- ranked hypotheses
- highest-value unresolved question
- constraints and forbidden actions

Never include secrets, API keys, credentials, raw environment variables, unnecessary personal data, or unbounded historical payloads.

## Expected Mentor response
A future external mentor must return structured advice with:
- OBSERVED
- HYPOTHESES
- RED_TEAM
- RECOMMENDED_ACTION
- WHY_NOW
- SMALLEST_VALID_TEST
- METRIC_TO_WATCH
- FAILURE_CONDITION
- ROLLBACK
- KEEP_WATCH_REJECT
- NEXT_BEST_ACTION

## Execution boundary
Mentor advice is not executable authority. ARGUS must independently validate evidence and governance before any action. Low-risk engineering changes may only be implemented on an isolated work branch and validated by CI/preview. Substantive model/decision changes remain RESEARCH/SHADOW until all canonical promotion gates pass.

## Cost state
No external AI API is called while the gateway is dormant. Activation requires explicit operator approval plus a separately configured server-side API credential and budget controls.
