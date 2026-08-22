# ARGUS COGNITIVE CORE

## Mission

ARGUS already contains a strong deterministic intelligence stack: data integrity, market modelling, calibration, self-audit, counterfactual learning, challenger generation, shadow policy testing, drift detection, model evolution and governance.

The Cognitive Core does **not** replace those systems. It sits above them as a meta-orchestration layer whose job is to decide what deserves attention, what evidence is missing, what should be questioned, what should be remembered and what should be escalated for deeper reasoning.

Target loop:

OBSERVE → MODEL → PRICE → GOVERN → FREEZE → SETTLE → AUDIT → LEARN → REFLECT → PRIORITIZE → INVESTIGATE → RE-TEST.

## Principle

**SOFTWARE DOES THE REPEATABLE WORK. GPT DOES THE HARD REASONING. GOVERNANCE ALWAYS WINS.**

The Cognitive Core must reduce unnecessary LLM usage rather than put an LLM in every decision.

## Current implementation — C0 Cognitive Shadow

Implemented components:

- `/api/cognitive-brief` — aggregates cross-system health/readiness/memory/scheduler evidence and ranks unresolved priorities.
- `/api/cognitive-hypotheses` — converts priorities into explicitly labelled, falsifiable HYPOTHESIS objects with required evidence and next tests.
- `/api/cognitive-evidence` — separates observed condition from inferred root cause and returns conservative evidence verdicts.
- `/api/cognitive-cycle` — persists recurring cognitive issues, evidence verdicts, occurrence counts, attention scores and recently resolved items.
- `/api/cognitive-memory` — exposes the latest protected cognitive memory snapshot.
- Vercel cron — runs `/api/cognitive-cycle` after the self-improvement loop and before the policy-governance cycle every six hours.

Current mode: `SHADOW_READ_ONLY`.

Current authority: **NONE over production decisions.**

Current LLM connection: **OFF**. GPT reasoning is the next governed layer, not a prerequisite for C0.

### C0 invariant

The system must distinguish:

- OBSERVED CONDITION — a measurable state is present;
- HYPOTHESIS — a possible explanation;
- ROOT CAUSE — remains unresolved until sufficient evidence exists;
- FALSIFIED CURRENT CYCLE — the condition supporting an active hypothesis is no longer observed;
- SUPPORTED — evidence supports the narrow claim tested, not a broader narrative.

No hypothesis becomes a production fact merely by recurring.

## Rollout

### C0 — Cognitive Shadow (implemented)

- Aggregate health, readiness, calibration, drift, scheduler and memory signals into one compact cognitive packet.
- Rank the system's most important unresolved questions.
- Generate falsifiable hypotheses instead of narrative explanations.
- Track recurring unresolved problems in cognitive memory.
- Detect contradictions, missing evidence and degraded components.
- Never alter a bet, stake, model weight, policy, classification or production gate.
- Never bypass PRIME locking or any governance rule.

### C1 — GPT Assisted Reasoning

A GPT model receives the compact cognitive packet only when escalation is justified.

Allowed outputs:

- hypotheses to test;
- missing evidence requests;
- suspected failure modes;
- experiment proposals;
- priority changes;
- explanations of disagreement;
- recommendations for additional deterministic checks.

GPT output remains advisory and is stored separately from production state.

### C2 — Governed Cognitive Autopilot

Only after sufficient shadow validation:

- GPT may propose bounded actions through explicit schemas.
- Deterministic validators check every proposal.
- Existing governance gates retain veto authority.
- Policy/model changes still require champion/challenger evidence, stability gates and reversibility.
- No direct free-form mutation of production state.

## Cognitive Packet

The packet should remain compact and evidence-first. It may include:

- autopilot readiness and blocking reasons;
- provider/data health and quota state;
- model health and drift state;
- calibration sample and uncertainty state;
- prediction-ledger / tracking integrity;
- scheduler priorities and stale opportunities;
- false-positive memory and recurrent failure modes;
- unresolved disagreements between models/sources;
- recent counterfactual or policy-review candidates;
- current production locks and governance constraints.

Every field should preserve provenance and timestamp when available.

## Escalation policy

GPT should be called only when one or more conditions hold:

1. Contradictory high-quality evidence cannot be resolved deterministically.
2. A recurring failure mode survives existing calibration/penalty logic.
3. Drift is detected and root cause is unclear.
4. A challenger appears promising but needs a falsification plan.
5. The scheduler finds a high-information opportunity where additional reasoning could materially change what ARGUS learns.
6. A production incident spans multiple modules and simple health checks do not identify one cause.

Routine arithmetic, settlement, probability transforms, deduplication, quota routing, caching, metrics and known gates stay deterministic.

## Hard safety/governance constraints

The Cognitive Core may never by itself:

- unlock PRIME;
- fabricate missing odds or statistics;
- rewrite frozen predictions;
- change settled outcomes;
- promote a model or policy without the existing evidence gates;
- increase stake because of narrative confidence;
- hide model disagreement or missing data;
- weaken a deterministic block in order to create a bet.

When cognitive advice conflicts with governance, **GOVERNANCE WINS**.

## Memory model

ARGUS memory remains factual and structured:

- Prediction Ledger = what ARGUS predicted.
- Settlement = what actually happened.
- Error Attribution = why the prediction may have failed.
- Counterfactual Learning = what bounded alternative might have done better.
- False-Positive Memory = recurring patterns that looked attractive but failed.
- Market / Player / Tactical / Matchup Memory = domain-specific evidence.
- Cognitive Memory = tested hypotheses, rejected explanations, unresolved questions and experiment outcomes.

Cognitive memory must distinguish OBSERVED, DERIVED, MODEL, HEURISTIC and HYPOTHESIS.

## Success criteria

The Cognitive Core is useful only if it improves at least one of these without degrading governance:

- fewer unnecessary provider/LLM calls;
- faster root-cause identification;
- better experiment selection;
- lower repeated-error rate;
- better calibration / Brier score;
- better CLV where valid odds exist;
- fewer fragile VALUE signals;
- clearer explanations of why ARGUS chose NO BET.

The goal is not to make ARGUS sound intelligent. The goal is to make ARGUS **allocate attention intelligently and learn more efficiently from evidence**.
