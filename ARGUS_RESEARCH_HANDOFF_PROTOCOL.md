# ARGUS RESEARCH HANDOFF PROTOCOL

Purpose: ensure Daily Research Dossier and Maximum Autopilot behave as one continuous improvement system so the human operator does not need to repeatedly say continue.

## Core operating rule
RESEARCH -> PRIORITIZE -> HANDOFF -> EXECUTE -> VERIFY -> RECORD -> RESEARCH AGAIN.

The daily researcher and hourly autopilot are complementary roles. Daily Research produces depth and direction. Maximum Autopilot turns the best validated direction into bounded measurable progress.

## Required daily handoff
Every Daily Research Dossier must end with a machine-readable human-readable handoff containing:
- DATE
- EXECUTE NEXT: exactly one highest-value safe next action
- WHY NOW: why this action outranks alternatives
- EXPECTED BENEFIT
- EVIDENCE LEVEL
- REQUIRED DATA
- MINIMUM TEST
- SUCCESS METRICS
- FAILURE CONDITION
- PROOF REQUIRED
- RISK / LEAKAGE RISKS
- ROLLBACK
- WATCH: up to two secondary ideas
- DO NOT DO: actions currently premature, unsafe, duplicated, overfit or quota-wasteful
- DATA TO ACQUIRE NEXT
- NEXT RESEARCH QUESTION
- BLOCKERS
- STATUS: READY_TO_EXECUTE / RESEARCH_ONLY / SHADOW_ONLY / BLOCKED / REJECTED

## Hourly execution contract
Maximum Autopilot must first inspect the latest daily handoff before selecting work.
1. If EXECUTE NEXT is still valid and safe, advance it one bounded step.
2. If it has become invalid because of new evidence, reject/defer it and record why.
3. If it is complete, move to the next highest-value handoff/roadmap item.
4. If blocked, reduce uncertainty through replay, tests, instrumentation, data-quality work, research synthesis or simplification.
5. Never manufacture progress. A justified rejection, deletion or NO CHANGE verdict counts as progress when it reduces risk or uncertainty.

## Persistent state to maintain
Research and execution should preserve durable state for:
- active experiment queue
- experiment status and owner
- current champion/challengers
- rejected ideas / negative results
- evidence debt
- data gaps
- structural debt
- unresolved research questions
- current proof requirements
- next safe action

When repository access is available, prefer a lightweight latest-handoff file under `research/LATEST_HANDOFF.md` plus dated dossiers under `research/daily/`. Do not overwrite scientific history; update the latest pointer/snapshot and append new dated evidence.

## Prioritization score
Prefer work with high expected reliable-decision improvement and low risk/cost. Consider:
- temporal/data integrity impact
- calibration improvement potential
- CLV/market-truth value
- uncertainty reduction
- abstention quality
- robustness/OOS value
- observability/reproducibility
- data coverage/evidence throughput
- structural simplification
- quota/compute efficiency
- reversibility
- speed-to-falsification

## Fast-learning contract
FAST LEARNING, SLOW TRUST.

Accelerate:
- research
- replay
- falsification
- evidence capture
- data normalization
- instrumentation
- negative adaptation
- early stopping
- deletion of weak ideas
- reuse of historical/frozen data

Do not accelerate:
- confidence inflation
- PRIME promotion
- production model mutation
- conclusions from small samples
- short-term ROI interpretation

## Human-intervention boundary
The system should not ask the human operator for routine continuation. Continue autonomously on safe, reversible work-branch tasks. Human approval remains required for sensitive production changes, merge to main, substantive production promotion, credential/security changes, paid-provider commitments, or real-money wagering.

## Quality bar
The goal is not to create the most complex betting system. The goal is to create the most evidence-disciplined, selective, calibrated, observable and continuously improving football decision system possible with available lawful data and resources.

No prediction or betting outcome is guaranteed. When evidence is inadequate, the correct output is WAIT / NO BET / RESEARCH.
