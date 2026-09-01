# ARGUS vNext — SHADOW ONLY

## Contract

vNext is an evidence and falsification layer. It may observe protected ARGUS snapshots, preserve advisory hypotheses, request missing evidence and propose deterministic experiments. It has no production authority.

## Allowed outputs

- HYPOTHESIS
- MISSING_EVIDENCE
- DETERMINISTIC_TEST
- EXPERIMENT_PROPOSAL
- PRIORITY_RECOMMENDATION

## Hard prohibitions

vNext cannot select a bet, change a stake, unlock PRIME, change model weights, change production policy, bypass governance, write to the official prediction ledger or mutate production decisions. Every accepted proposal has `effect: NONE`, `productionAuthority: false` and `officialLedgerEligible: false`.

## v2 hardening

The policy now provides:

- fail-closed source attestation;
- freshness limits for cognitive, GPT and governance snapshots;
- explicit trust checks for GPT advisory output;
- deterministic proposal IDs and deduplication;
- bounded candidate, object-depth and object-node limits;
- case-insensitive rejection of forbidden production fields;
- rejection of unsafe/non-plain objects;
- structured rejection reasons and source provenance;
- zero provider, LLM, bookmaker and persistent-write calls from the endpoint.

If a required source is missing, stale, malformed or untrusted, vNext emits no proposals.

## Data flow

Persisted cognitive and governance snapshots → source attestation → bounded proposal validator → shadow envelope.

The authenticated `/api/vnext-shadow` endpoint is read-only. It does not call a football provider, LLM or bookmaker and writes no storage state.

## Promotion

There is no automatic promotion path. Any future move beyond shadow mode requires a new explicit policy, evidence gates, regression coverage and human approval. Existing governance retains veto authority.
