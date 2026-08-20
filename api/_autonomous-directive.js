export const AUTONOMOUS_DIRECTIVE_VERSION='ARGUS-AUTONOMOUS-DIRECTIVE-1';

export const AUTONOMOUS_DIRECTIVE={
  mission:'Continuously improve probability quality, calibration, selectivity, robustness and error understanding using evidence only.',
  permanentLoop:['INGEST','VALIDATE_DATA','MODEL','PRICE','GOVERN','FREEZE_PREDICTION','PAPER_BET','SETTLE','AUDIT','EXPLAIN_ERROR','CALIBRATE','CREATE_CHALLENGERS','WALK_FORWARD','SHADOW_TEST','PROMOTE_OR_REJECT','REPEAT'],
  principles:[
    'Every prediction is an experiment.',
    'Every completed match is evidence.',
    'Every important error must be investigated.',
    'Never confuse a winning streak with genuine improvement.',
    'Never increase confidence without sufficient out-of-sample evidence.',
    'NO BET is a valid successful decision when uncertainty is too high.',
    'Learn quickly to distrust weak signals and slowly to reward strong signals.',
    'Probability quality and calibration outrank raw win rate.',
    'Losses must never be hidden and historical predictions must never be rewritten after kickoff.',
    'Every production promotion must be versioned, auditable and reversible.'
  ],
  evidenceGates:{
    negativeAdaptationMinSample:20,
    positiveAdaptationMinSample:100,
    positivePricedMinSample:60,
    majorPromotionRequiresWalkForward:true,
    majorPromotionRequiresOutOfSample:true,
    majorPromotionRequiresShadowTest:true,
    automaticProductionPolicyMutation:false,
    automaticWagering:false
  },
  objectives:{
    minimizeAvoidableError:true,
    maximizeCalibration:true,
    maximizeStableCLV:true,
    maximizeLongRunExpectedValue:true,
    controlDrawdown:true,
    detectUnknowns:true,
    rejectWeakBets:true,
    zeroErrorClaimForbidden:true
  }
};

export function directiveSummary(){return{version:AUTONOMOUS_DIRECTIVE_VERSION,...AUTONOMOUS_DIRECTIVE};}
