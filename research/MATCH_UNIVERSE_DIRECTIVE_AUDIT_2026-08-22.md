# ARGUS OMNI — Match-Universe Learning Directive Audit

Date: 2026-08-22
Branch: argus-match-universe-learning
Doctrine: LIVE is a sensor, not the brain.

## Executive finding

ARGUS already contains most of the scientific primitives requested by the directive, but they are fragmented across decision, learning, historical, integrity and observability modules. The largest architectural gap is not lack of models; it is lack of one central Match-Universe layer that continuously ranks FUTURE/PREMATCH, LIVE, SETTLED and HISTORICAL work by Value of Information and resource cost.

The safest first implementation is therefore a read-only Match-Universe Scheduler that reuses existing stored outputs and does not alter prediction semantics, PRIME/VALUE thresholds, frozen predictions or provider spend.

## Audit matrix

| Directive area | Status | Existing ARGUS evidence | Gap / action |
|---|---|---|---|
| FUTURE / PREMATCH population | PARTIAL | decision-scheduler, prekickoff-gate, predictions, availability, market-regime, player/tactical/context modules | Central population accounting and cross-population priority missing |
| LIVE as Value-of-Information sensor | PARTIAL | live, live-events, decision-scheduler cadence, resource-intelligence | Legacy orchestration still over-centers Live; must be demoted to one population |
| SETTLED learning | EXISTS / PARTIAL | prediction-ledger, ledger-learning, postmatch-forensics, error-attribution, outcome-attribution | Needs central prioritization of newly settled evidence |
| HISTORICAL / RESEARCH | EXISTS | historical backfills, historical-walk-forward, candidate gate, market outcomes, counterfactual-learning | Needs central scheduling by information gain / resource pressure |
| Match-Universe Scheduler | MISSING | decision-scheduler only schedules decision rechecks | Implement central cross-population scheduler without duplicating decision-scheduler |
| Quota-aware intelligence | PARTIAL / STRONG | resource-intelligence plus current quota-governor work on stability branch | Unify quota mode with Match-Universe priorities and information gain per request |
| Failure Memory | PARTIAL | false-positive-memory, postmatch-forensics, error-attribution, training-memory | Missing unified failure taxonomy/fingerprint memory across scientific + technical failures |
| NO BET intelligence | EXISTS / PARTIAL | no-bet-optimizer, eligibility downgrade rules | Expand evaluation of rational abstention using settled evidence |
| SHADOW Lab | EXISTS | shadow-mode, shadow-cron, policy-shadow-test, challenger-factory | Central experiment portfolio priority still fragmented |
| Falsification | PARTIAL | robustness, counterfactual-learning, historical variants, policy review | Explicit falsification queue not centralized |
| Calibration | EXISTS | calibration-engine, probability-calibration, confidence-calibration, watchdog | More segmentation can be added only with sufficient samples |
| Prediction Ledger | EXISTS | immutable prematch capture + settlement path | Preserve; do not rewrite forecast fields |
| Data Quality Gate | EXISTS / PARTIAL | data-integrity, evidence-completeness, evidence-freshness, cross-source-agreement | Central scheduler should consume these quality signals |
| Temporal Integrity | EXISTS | temporal-integrity, decision-integrity-audit, historical chronological walk-forward | Preserve as hard gate |
| Edge Survival | EXISTS / PARTIAL | surviving-edge, signal-survival-learning, signal-decay, robustness | Can later expose one explicit Edge Survival Score contract |
| Central observability | PARTIAL / STRONG | watchtower, developer-health, site-health, learning-health, tracking-health | Population-level work/evidence velocity missing |
| Fail-safe / kill switch | PARTIAL | governance downgrade logic, memory guards, current quota governor work | General subsystem circuit-breaker remains incomplete |
| Self-improvement loop | EXISTS | self-improvement-loop, model-evolution, hierarchical-evolution | Must consume Match-Universe priorities instead of Live-centric opportunity flow |
| Autonomous research questions | PARTIAL | self-improvement + research artifacts | Needs explicit ranked research-question queue |
| Active learning | PARTIAL | resource-intelligence, skill-map, uncertainty-budget | Match-level Value-of-Information ranking missing |
| Scientific priority chain | PARTIAL / STRONG | integrity, governance and promotion gates exist | Encode cross-population orchestration order explicitly |
| KPI set | PARTIAL | calibration, market truth, CLV, learning health, survival | Add information gain/request, population coverage, learning velocity and failure resolution |
| Dynamic P0-P6 priorities | PARTIAL | Watchtower + resource modes + schedulers | Central priority arbitration missing |
| LIVE != ARGUS doctrine | CONFLICTING LEGACY | Autopilot currently starts from /api/live | Migrate orchestration incrementally; never break healthy Live functionality |

## Reuse, do not duplicate

The new Match-Universe layer must reuse:

- `argus/autopilot/decision-plan.json` for current FUTURE/LIVE decision work;
- `argus/ledger/*.json` for frozen and settled evidence;
- `argus/research/historical-walk-forward.json` for historical validation state;
- `argus/autopilot/resource-policy.json` for resource/quota mode;
- `argus/learning/skill-map.json` and existing learning outputs for uncertainty/skill context;
- existing Data Integrity, Temporal Integrity, Watchtower and governance gates.

It must not replace `decision-scheduler.js`. Decision Scheduler remains responsible for decision recheck cadence; Match-Universe Scheduler decides which population/workstream deserves attention across the full lifecycle.

## Highest-value safe first action

Implement `api/match-universe-scheduler.js` as a provider-free, read-only orchestration layer that:

1. classifies available work into FUTURE/PREMATCH, LIVE, SETTLED and HISTORICAL;
2. computes transparent heuristic priority scores from existing evidence only;
3. explicitly penalizes provider-dependent LIVE work when quota/resource mode is constrained;
4. raises newly settled and historical research work when fresh provider work is unavailable;
5. returns one ranked `nextBestAction` without changing any prediction or model;
6. exposes which evidence was missing rather than inventing it.

## Promotion boundary

This first layer is orchestration/observability only. It cannot create PRIME/VALUE, cannot alter staking, cannot call API-Football, cannot rewrite the Prediction Ledger, cannot modify model weights and cannot promote anything to production.
