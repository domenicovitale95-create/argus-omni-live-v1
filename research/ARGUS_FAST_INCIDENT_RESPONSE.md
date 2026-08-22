# ARGUS Fast Incident Response Lane

Status: R&D / ZERO-COST / NO PRODUCTION AUTHORITY

## Goal
Reduce time from detection to a falsifiable, reversible engineering fix while keeping scientific trust deliberately slow.

## Two-speed operating model

### FAST TECHNICAL LANE
Use for 4xx/5xx, 413 payload errors, OOM/resource pressure, build failures, cron/storage/auth failures, stale health snapshots, provider transport failures, cache/fallback defects, logging gaps and deployment parity problems.

Target flow:
1. DETECT — identify route, status, time window and affected deployment.
2. PACK — call `/api/mentor-brief` to produce a compact snapshot-only incident packet.
3. CORRELATE — add fresh Vercel runtime counts/error clusters and the active GitHub branch diff.
4. HYPOTHESIZE — rank root causes and explicitly list evidence against each.
5. TEST — choose exactly one smallest reversible action with a measurable failure condition.
6. PATCH — isolated branch only.
7. PREVIEW — build + route-level validation + regression checks.
8. OBSERVE — compare before/after error rate, latency, memory/payload pressure and semantic output.
9. DECIDE — KEEP / WATCH / REJECT.
10. REMEMBER — record the negative or positive result so the same failed hypothesis is not repeated.

Operational goals, not promises:
- incident packet generation: seconds, snapshot-only;
- first evidence-backed diagnosis: minutes when Vercel/GitHub evidence is available;
- small local engineering fix: target 15–30 minutes when root cause is reproducible and bounded;
- production promotion: never accelerated merely to meet a time target.

### SLOW SCIENTIFIC TRUST LANE
Use for probability/model changes, confidence changes, PRIME/VALUE rules, feature promotion, specialist/champion changes and staking policy.

Required evidence remains temporal-integrity-safe OOS/walk-forward evidence, sufficient sample, calibration/CLV where genuine, robustness, rollback readiness and governance approval. Speed never reduces these gates.

## Mentor packet rule
`/api/mentor-brief` is deliberately read-only, snapshot-only and zero-cost. It does not call API-Football, OpenAI or any other external AI/provider. It exposes no secret values and performs no writes.

The packet contains a deterministic incident fingerprint so repeated symptoms can be recognized as the same incident class. It also lists which external observability evidence the assistant must add before recommending a patch: recent Vercel 4xx/5xx counts, runtime error clusters, preview/build status and the relevant GitHub diff.

## Decision rule
For every incident, prefer the action with the best combination of:
- evidence quality;
- expected uncertainty reduction;
- reversibility;
- low implementation risk;
- low opportunity cost;
- clean attribution.

Do not stack coupled fixes if doing so prevents learning which change solved the incident.

## Failure memory
A rejected hypothesis is progress. Record:
- incident fingerprint;
- observed evidence;
- hypothesis;
- test performed;
- result;
- why it failed or succeeded;
- KEEP/WATCH/REJECT;
- rollback status;
- next-best hypothesis.

## Hard boundaries
No secrets. No direct main merge. No production promotion from this lane. No rewriting frozen history. No confidence/PRIME creation. No real-money wagering. No hiding errors by converting them into false success states.
