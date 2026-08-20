# ARGUS OMNI — Maximum Performance Program

Status: ACTIVE R&D ROADMAP
Branch: argus-autonomous-learning-loop
Principle: improve probability quality, calibration, market value detection, robustness and abstention quality before increasing complexity.

## Non-negotiable safety/governance
- No automatic real-money wagering.
- No model may create PRIME from one metric or one subsystem alone.
- Every production promotion requires temporal integrity, out-of-sample evidence, walk-forward validation, shadow testing and rollback capability.
- Historical predictions and settlements are immutable after kickoff.
- Negative evidence may downgrade faster than positive evidence may promote.
- Strong performance claims require sufficient sample size, uncertainty reporting and reproducibility.

## Phase 0 — Integration & verification
1. Validate current autonomous-learning branch as one coherent system.
2. Add syntax/build/integration checks for new endpoints.
3. Verify storage paths, cron persistence and endpoint health.
4. Add golden-fixture regression tests and safe fallback behavior.
5. Add deployment readiness gate and rollback checklist.

## Phase 1 — Data & temporal integrity
6. Central Data Integrity Engine: provenance, timestamp, freshness, completeness, reliability.
7. Temporal Integrity Firewall to prevent future leakage in training/backtests.
8. Feature-store versioning and prediction feature snapshots.
9. Dataset fingerprinting and immutable experiment inputs.
10. Automatic leakage/anomaly detection.
11. Missing-data and degraded-mode rules.
12. Source disagreement and reliability scoring.

## Phase 2 — Market truth & pricing
13. Market Truth / CLV V2 with opening, intermediate and closing snapshots.
14. Multi-bookmaker consensus and no-vig fair market baseline.
15. Bookmaker/source quality ranking.
16. Liquidity proxies and price dispersion.
17. Expected CLV model.
18. Price-path forecast: TAKE NOW / WAIT / STABLE / REVERSAL.
19. Market-reaction model for lineups, injuries and events.
20. Shadow Market Maker: ARGUS fair-price grid across all supported markets.
21. Cross-market consistency checks.

## Phase 3 — Specialist models
22. 1X2 specialist.
23. Goals specialist.
24. BTTS specialist.
25. Team-goals specialist.
26. Corners specialist.
27. Exact-score distribution specialist with strict confidence caps.
28. Live specialist separated from pre-match models.
29. League-specific specialists when sample allows.
30. Global/hierarchical fallback for small-sample leagues.

## Phase 4 — Team, player, tactical intelligence
31. Dynamic attack/defence team-strength state.
32. Opponent-strength adjusted form.
33. Adaptive recency weighting.
34. Regime-change detection: coach, transfers, tactical shift, season transition.
35. Player impact and replacement-value models.
36. Lineup surprise and lineup quality scoring.
37. Tactical matchup engine.
38. Fatigue, rest, travel and congestion engine.
39. Competition-stage and motivation skepticism rules.
40. Set-piece / goalkeeper / venue specialist features only after OOS validation.

## Phase 5 — Calibration & uncertainty
41. Calibration by league, market, odds bucket, confidence bucket and data quality.
42. Multiple calibrator challengers: isotonic / Platt / temperature where appropriate.
43. Instance-level uncertainty decomposition.
44. Model disagreement engine.
45. Out-of-distribution / unknown-unknown detection.
46. Dynamic confidence ceilings.
47. Evidence score separate from model confidence.
48. NO BET / abstention specialist model.
49. Dynamic decision thresholds by segment.

## Phase 6 — Validation science
50. Strict rolling walk-forward testing.
51. Purged temporal validation and embargo where needed.
52. Cross-season validation.
53. Cross-league transfer checks.
54. Holdout vault for major promotions.
55. Multiple-testing controls and pre-registered major experiments.
56. Bootstrap robustness and confidence intervals.
57. Stress tests: remove best league/week/bets and re-evaluate.
58. Ablation tests and feature redundancy checks.
59. Complexity budget: complex models must beat simple baselines.
60. Baseline army: market-only, Elo, Poisson, logistic/linear baselines.

## Phase 7 — Champion / Challenger governance
61. Automated hypothesis and challenger registry.
62. Shadow tournament among challengers.
63. Multi-objective promotion score: calibration, log loss, Brier, CLV, ROI, stability, drawdown, robustness.
64. Severe promotion gates and minimum samples.
65. Automatic rollback on verified degradation.
66. Model graveyard with reasons for rejection.
67. Recovery rules for previously degraded segments.
68. Experiment novelty checks to avoid repeating failed ideas.

## Phase 8 — Risk & portfolio intelligence
69. Paper portfolio with realistic correlated exposure.
70. Correlation engine across selections and markets.
71. Daily risk budget and concentration controls.
72. Drawdown governance.
73. Expected vs realized P/L decomposition.
74. Luck-adjusted performance diagnostics.
75. Monte Carlo bankroll and drawdown simulations.
76. Fractional Kelly research only after robust calibration.
77. Opportunity-cost engine for scarce risk/API budget.

## Phase 9 — Live intelligence
78. Separate live state model.
79. Event-shock detection and revalidation.
80. Live data latency/freshness measurement.
81. Red-card, score-state, substitution and tempo models.
82. Live market price-path and decay.
83. Live kill-switch when feeds are stale or inconsistent.
84. Market-specific live settlement validation.

## Phase 10 — Resource intelligence
85. Value-of-Information engine for API calls.
86. Adaptive refresh cadence by urgency, uncertainty and expected information value.
87. API ROI: useful evidence gained per request.
88. Adaptive historical depth.
89. Cache TTLs by data type and event proximity.
90. Event-driven rechecks with cron fallback.
91. Compute-depth allocation by match priority.

## Phase 11 — Reliability, testing & MLOps
92. Unit tests for probability, pricing and governance invariants.
93. Golden fixtures and deterministic replay.
94. End-to-end integration tests.
95. Chaos tests: API outage, quota 0, storage failure, malformed data.
96. CI gate before merge.
97. Canary/shadow deployment verification.
98. Observability: latency, errors, stale data, cron effectiveness, storage health.
99. Automatic incident classification and safe degraded modes.
100. Dependency/security scanning and secret hygiene.
101. Version compatibility and reproducible runtime/dependencies.
102. Full audit trail and prediction hashes.

## Phase 12 — Human control & transparency
103. Human-readable Today dashboard.
104. Learning dashboard: samples, Brier, log loss, CLV, Skill Map, specialists, champion/challengers.
105. Confidence vs evidence vs data-quality display.
106. Prediction age and last meaningful change.
107. Human reason: why / main risk / what would change the decision.
108. Daily executive learning summary.
109. Weekly R&D report.
110. Monthly reproducible model review.
111. Model cards and league cards.
112. Kill switches and global safe mode.

## Phase 13 — Advanced autonomous R&D
113. Research backlog generator from evidence gaps.
114. Active learning / data acquisition prioritization.
115. Hypothesis generator with strict test budget.
116. Experiment prioritization by expected value of information.
117. Automatic retirement of unproductive challengers.
118. Meta-model deciding which specialist to trust by context.
119. Reliability model predicting the trustworthiness of each probability estimate.
120. Scenario simulation engine and joint score distributions.
121. Conformal/prediction-set research where it improves decision quality.
122. Continuous-learning loop that learns continuously but mutates production slowly.

## Final readiness standard
ARGUS is not called mature/professional until it demonstrates, on independently frozen out-of-sample data: stable calibration, positive and persistent CLV where claimed, controlled drawdown, multisample/multiseason robustness, reproducible decisions, healthy infrastructure, and reliable abstention in weak/unknown segments.

## Execution order now
Immediate sequence: Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 5 -> Phase 6 -> Phase 7 -> Phase 12, then expand into Phases 4/8/9/10/11/13 as evidence and infrastructure justify it.
