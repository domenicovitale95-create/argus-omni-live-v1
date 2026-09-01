# ARGUS vNext — SHADOW ONLY

## Contract

vNext is an evidence and falsification layer. It may observe protected ARGUS snapshots, preserve advisory hypotheses, request missing evidence and propose deterministic experiments.

It has no production authority.

## Allowed

- HYPOTHESIS
- MISSING_EVIDENCE
- DETERMINISTIC_TEST
- EXPERIMENT_PROPOSAL
- PRIORITY_RECOMMENDATION

## Forbidden

vNext cannot select a bet, change a stake, unlock PRIME, change model weights, change production policy, bypass governance, write to the official prediction ledger or mutate production decisions.

Every accepted proposal is emitted with `effect: NONE`, `productionAuthority: false` and `officialLedgerEligible: false`.

## Data flow

Cognitive and governance snapshots → vNext policy validator → shadow envelope.

The endpoint `/api/vnext-shadow` is authenticated, read-only and does not call a football provider, an LLM or a bookmaker. It reads already persisted evidence and emits a separate diagnostic envelope.

## Promotion

There is no automatic promotion path. Any future move beyond shadow mode requires a new explicit policy, evidence gates, regression coverage and human approval. Existing governance retains veto authority.
