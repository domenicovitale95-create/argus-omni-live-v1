import { directiveSummary } from './_autonomous-directive.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json({
    version:'ARGUS-AUTONOMOUS-LEARNING-2',
    objective:'Continuously learn from historical and recent football data using frozen pre-match predictions, verified settlement, calibration, walk-forward validation, error attribution and reversible challenger promotion.',
    loop:['INGEST','FREEZE_PREDICTION','PAPER_BET','SETTLE','SCORE','ATTRIBUTION','CALIBRATE','CHALLENGE','VALIDATE','PROMOTE_OR_REJECT'],
    metrics:['sampleSize','hitRate','roi','yield','brier','logLoss','calibrationError','clv','confidenceGap'],
    safeguards:{
      noHindsight:true,
      paperBetBeforeRealMoney:true,
      minimumSampleGates:true,
      walkForwardRequired:true,
      outOfSampleValidation:true,
      automaticProductionPolicyMutation:false,
      challengerPromotionReversible:true,
      lossesNeverHidden:true,
      dataProvenanceRequired:true,
      automaticWagering:false
    },
    directive:directiveSummary(),
    principle:'ARGUS must optimize probability quality and decision discipline, not chase an unrealistic zero-error rate.'
  });
}
