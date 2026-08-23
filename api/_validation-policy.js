export const VALIDATION_POLICY = Object.freeze({
  version: 'ARGUS-FORWARD-PROOF-POLICY-1',
  epoch: 'ARGUS-FORWARD-2026-08-23-V1',
  startsAt: '2026-08-23T14:35:00.000Z',
  cohort: 'OFFICIAL_PAPER',
  unitStake: 1,
  thresholds: Object.freeze({
    promising: Object.freeze({ settled: 300, days: 30 }),
    provisional: Object.freeze({ settled: 500, days: 45, competitions: 5, marketFamilies: 2, maxCompetitionShare: 0.50 }),
    validated: Object.freeze({ settled: 1000, days: 90, competitions: 8, marketFamilies: 3, maxCompetitionShare: 0.40, maxMarketShare: 0.55, clvSample: 300 })
  }),
  rules: Object.freeze({
    prospectiveOnly: true,
    noHistoricalBackfill: true,
    noHindsight: true,
    officialPaperOnly: true,
    oneOfficialPositionPerFixture: true,
    realizedOddsRequired: true,
    flatStakePrimaryStatistic: true,
    lower95ConfidenceBoundMustBePositiveForValidation: true,
    positiveNearCloseClvRequiredForFinalValidation: true,
    strategyEpochMustBeResetAfterMaterialDecisionPolicyChange: true,
    learningShadowExcluded: true,
    automaticRealWagering: false
  })
});

export function isInValidationEpoch(value) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) && t >= new Date(VALIDATION_POLICY.startsAt).getTime();
}
