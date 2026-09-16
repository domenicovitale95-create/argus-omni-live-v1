import { dedupeShadowFixtures } from './_shadow-fixture-dedupe.js';
import { shadowMarketFamily } from './_shadow-market-observability.js';

const EPS=1e-9;
const SUPPORTED_FAMILIES=new Set(['DOUBLE_CHANCE','TOTAL_GOALS','BTTS','TEAM_GOALS']);

export const BINARY_CALIBRATION_POLICY=Object.freeze({
  version:'BINARY-CALIBRATION-CHALLENGER-1',
  mode:'SHADOW_ONLY',
  outerTrainFraction:.70,
  innerFitFraction:.75,
  minimumTotalFixtures:180,
  minimumOuterTrainFixtures:120,
  minimumOuterHoldoutFixtures:50,
  minimumInnerFitFixtures:80,
  minimumInnerValidationFixtures:25,
  minimumDistinctProbabilities:12,
  minimumHoldoutBrierImprovementPct:2,
  minimumHoldoutLogLossImprovementPct:1,
  maximumHoldoutCalibrationGapRegressionPp:1,
  bootstrapReps:1500,
  blendAlphas:[.25,.50,.75,1],
  probabilityFloor:.01,
  probabilityCeiling:.99
});

function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function num(v,f=null){return finite(v)?Number(v):f}
function canonical(v){return String(v||'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'UNKNOWN'}
function isoMs(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null}
function clamp(v,lo=BINARY_CALIBRATION_POLICY.probabilityFloor,hi=BINARY_CALIBRATION_POLICY.probabilityCeiling){return Math.max(lo,Math.min(hi,Number(v)))}
function round(v,d=6){return v==null||!Number.isFinite(Number(v))?null:Number(Number(v).toFixed(d))}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}
function segmentId(source,family){return `${canonical(source)}|||${family}`}

export function extractBinaryCalibrationSegments(books=[]){
  const dedupe=dedupeShadowFixtures(Array.isArray(books)?books:[]),segments=new Map(),issues={lateFreeze:0,missingTime:0,invalidProbability:0,unsettled:0,nonIndependentProbability:0,unsupportedFamily:0};
  for(const fixture of dedupe.fixtures){
    const fixtureId=String(fixture?.fixtureId??'');if(!fixtureId)continue;
    const kickoff=isoMs(fixture?.kickoff),frozen=isoMs(fixture?.frozenAt||fixture?.picks?.[0]?.probabilityFrozenAt);
    if(kickoff!=null&&frozen!=null&&frozen>=kickoff){issues.lateFreeze++;continue}
    const eventTime=kickoff??frozen;if(eventTime==null){issues.missingTime++;continue}
    for(const pick of fixture?.picks||[]){
      const family=shadowMarketFamily(pick?.key);
      if(!SUPPORTED_FAMILIES.has(family)){issues.unsupportedFamily++;continue}
      const outcome=String(pick?.outcome||'').toUpperCase();if(!['WIN','LOSS'].includes(outcome)){issues.unsettled++;continue}
      if(pick?.modelIndependentOfPrice!==true){issues.nonIndependentProbability++;continue}
      const probability=num(pick?.probability);if(!(probability>0&&probability<1)){issues.invalidProbability++;continue}
      const source=canonical(pick?.probabilitySource||pick?.sourceClass||'UNKNOWN'),id=segmentId(source,family),rows=segments.get(id)||[];
      rows.push({fixtureId,eventTime,key:String(pick?.key||''),family,source,probability,y:outcome==='WIN'?1:0});segments.set(id,rows);
    }
  }
  const out={};for(const[id,rows]of segments){rows.sort((a,b)=>a.eventTime-b.eventTime||a.fixtureId.localeCompare(b.fixtureId,undefined,{numeric:true})||a.key.localeCompare(b.key));out[id]=rows}
  return{segments:out,issues,dedupe:dedupe.diagnostics,dedupePolicy:dedupe.policy};
}

export function temporalFixtureSplit(rows=[],fraction=.70){
  const groups=new Map();
  for(const row of rows){const key=String(row?.fixtureId||'');if(!key)continue;const g=groups.get(key)||{fixtureId:key,eventTime:num(row?.eventTime,Infinity),rows:[]};g.eventTime=Math.min(g.eventTime,num(row?.eventTime,Infinity));g.rows.push(row);groups.set(key,g)}
  const ordered=[...groups.values()].filter(g=>Number.isFinite(g.eventTime)).sort((a,b)=>a.eventTime-b.eventTime||a.fixtureId.localeCompare(b.fixtureId,undefined,{numeric:true}));
  if(ordered.length<2)return{left:[],right:[],leftFixtures:ordered.length,rightFixtures:0,splitAt:null};
  const cut=Math.max(1,Math.min(ordered.length-1,Math.floor(ordered.length*Math.max(.5,Math.min(.85,fraction))))),leftGroups=ordered.slice(0,cut),rightGroups=ordered.slice(cut);
  return{left:leftGroups.flatMap(g=>g.rows),right:rightGroups.flatMap(g=>g.rows),leftFixtures:leftGroups.length,rightFixtures:rightGroups.length,splitAt:new Date(rightGroups[0].eventTime).toISOString()};
}

function fixtureWeights(rows){const counts=new Map();for(const r of rows)counts.set(r.fixtureId,(counts.get(r.fixtureId)||0)+1);return rows.map(r=>1/Math.max(1,counts.get(r.fixtureId)||1))}

export function fitWeightedIsotonic(rows=[]){
  const valid=rows.filter(r=>num(r?.probability)>0&&num(r?.probability)<1&&(r?.y===0||r?.y===1));
  const distinct=new Set(valid.map(r=>Number(r.probability).toFixed(8))).size;
  if(!valid.length||distinct<BINARY_CALIBRATION_POLICY.minimumDistinctProbabilities)return null;
  const weights=fixtureWeights(valid),points=new Map();
  for(let i=0;i<valid.length;i++){
    const r=valid[i],x=Number(r.probability),k=x.toFixed(12),w=weights[i],p=points.get(k)||{x,weight:0,weightedY:0,count:0};p.weight+=w;p.weightedY+=w*r.y;p.count++;points.set(k,p)
  }
  const ordered=[...points.values()].sort((a,b)=>a.x-b.x),blocks=[];
  for(const p of ordered){
    blocks.push({minP:p.x,maxP:p.x,weight:p.weight,weightedY:p.weightedY,count:p.count,value:p.weightedY/p.weight});
    while(blocks.length>=2&&blocks[blocks.length-2].value>blocks[blocks.length-1].value){
      const b=blocks.pop(),a=blocks.pop(),weight=a.weight+b.weight,weightedY=a.weightedY+b.weightedY;
      blocks.push({minP:a.minP,maxP:b.maxP,weight,weightedY,count:a.count+b.count,value:weightedY/weight});
    }
  }
  return{blocks:blocks.map(b=>({...b,value:clamp(b.value)})),rows:valid.length,fixtures:new Set(valid.map(r=>r.fixtureId)).size,distinctProbabilities:distinct,weighting:'EQUAL_TOTAL_WEIGHT_PER_FIXTURE'};
}

export function predictIsotonic(fit,probability){
  const blocks=fit?.blocks||[];if(!blocks.length)return clamp(probability);
  const p=Number(probability);if(p<=blocks[0].maxP)return blocks[0].value;
  for(let i=1;i<blocks.length;i++){const boundary=(blocks[i-1].maxP+blocks[i].minP)/2;if(p<=boundary)return blocks[i-1].value;if(p<=blocks[i].maxP)return blocks[i].value}
  return blocks[blocks.length-1].value;
}

function calibratedProbability(row,fit,alpha){const base=clamp(row.probability),iso=predictIsotonic(fit,base),a=Math.max(0,Math.min(1,Number(alpha)||0));return clamp(base*(1-a)+iso*a)}

export function binaryMetrics(rows=[],probabilityFn=r=>r.probability){
  const byFixture=new Map();
  for(const r of rows){
    const p=clamp(probabilityFn(r)),y=r.y,l=-Math.log(y?p:1-p),b=(p-y)**2,g=byFixture.get(r.fixtureId)||{count:0,brier:0,logLoss:0,predicted:0,actual:0};
    g.count++;g.brier+=b;g.logLoss+=l;g.predicted+=p;g.actual+=y;byFixture.set(r.fixtureId,g);
  }
  const fs=[...byFixture.values()].map(g=>({brier:g.brier/g.count,logLoss:g.logLoss/g.count,predicted:g.predicted/g.count,actual:g.actual/g.count})),pred=mean(fs.map(x=>x.predicted)),obs=mean(fs.map(x=>x.actual));
  return{sample:rows.length,fixtures:fs.length,brier:mean(fs.map(x=>x.brier)),logLoss:mean(fs.map(x=>x.logLoss)),meanPredicted:pred,observedRate:obs,calibrationGapPp:pred==null||obs==null?null:(pred-obs)*100};
}

function publicMetrics(x){return{sample:x.sample,fixtures:x.fixtures,brier:round(x.brier),logLoss:round(x.logLoss),meanPredictedPct:x.meanPredicted==null?null:round(x.meanPredicted*100,2),observedRatePct:x.observedRate==null?null:round(x.observedRate*100,2),calibrationGapPp:round(x.calibrationGapPp,2)}}
function improvementPct(base,candidate,key){return base?.[key]>0&&candidate?.[key]!=null?(base[key]-candidate[key])/base[key]*100:null}

function selectOnInnerValidation(innerFit,innerValidation){
  const fit=fitWeightedIsotonic(innerFit);if(!fit)return null;
  const baseline=binaryMetrics(innerValidation),candidates=BINARY_CALIBRATION_POLICY.blendAlphas.map(alpha=>({alpha,metrics:binaryMetrics(innerValidation,r=>calibratedProbability(r,fit,alpha))}));
  candidates.sort((a,b)=>a.metrics.brier-b.metrics.brier||a.metrics.logLoss-b.metrics.logLoss||a.alpha-b.alpha);
  return{fit,baseline,champion:candidates[0],leaderboard:candidates.map(x=>({alpha:x.alpha,...publicMetrics(x.metrics),brierImprovementPct:round(improvementPct(baseline,x.metrics,'brier'),3),logLossImprovementPct:round(improvementPct(baseline,x.metrics,'logLoss'),3)}))};
}

function seeded(seed=0x85ebca6b){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function quantile(sorted,q){if(!sorted.length)return null;const pos=(sorted.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo)}

export function pairedFixtureBootstrap(rows,baseFn,candidateFn,reps=BINARY_CALIBRATION_POLICY.bootstrapReps){
  const groups=new Map();
  for(const r of rows){const bp=clamp(baseFn(r)),cp=clamp(candidateFn(r)),y=r.y,g=groups.get(r.fixtureId)||{count:0,brier:0,logLoss:0};g.count++;g.brier+=(cp-y)**2-(bp-y)**2;g.logLoss+=(-Math.log(y?cp:1-cp))-(-Math.log(y?bp:1-bp));groups.set(r.fixtureId,g)}
  const deltas=[...groups.values()].map(g=>({brier:g.brier/g.count,logLoss:g.logLoss/g.count}));
  const result={method:'PAIRED_FIXTURE_BOOTSTRAP',fixtures:deltas.length,reps:0,brier:{meanDelta:round(mean(deltas.map(x=>x.brier))),lower95:null,upper95:null},logLoss:{meanDelta:round(mean(deltas.map(x=>x.logLoss))),lower95:null,upper95:null}};
  if(deltas.length<2||reps<1)return result;
  const rng=seeded((deltas.length*2654435761)>>>0),b=[],l=[];
  for(let z=0;z<reps;z++){let sb=0,sl=0;for(let i=0;i<deltas.length;i++){const d=deltas[Math.floor(rng()*deltas.length)];sb+=d.brier;sl+=d.logLoss}b.push(sb/deltas.length);l.push(sl/deltas.length)}
  b.sort((a,c)=>a-c);l.sort((a,c)=>a-c);result.reps=reps;result.brier.lower95=round(quantile(b,.025));result.brier.upper95=round(quantile(b,.975));result.logLoss.lower95=round(quantile(l,.025));result.logLoss.upper95=round(quantile(l,.975));return result;
}

function evaluateSegment(id,rows){
  const p=BINARY_CALIBRATION_POLICY,outer=temporalFixtureSplit(rows,p.outerTrainFraction),inner=temporalFixtureSplit(outer.left,p.innerFitFraction),blockers=[];
  const totalFixtures=new Set(rows.map(r=>r.fixtureId)).size;
  if(totalFixtures<p.minimumTotalFixtures)blockers.push('TOTAL_FIXTURES_INSUFFICIENT');
  if(outer.leftFixtures<p.minimumOuterTrainFixtures)blockers.push('OUTER_TRAIN_INSUFFICIENT');
  if(outer.rightFixtures<p.minimumOuterHoldoutFixtures)blockers.push('OUTER_HOLDOUT_INSUFFICIENT');
  if(inner.leftFixtures<p.minimumInnerFitFixtures)blockers.push('INNER_FIT_INSUFFICIENT');
  if(inner.rightFixtures<p.minimumInnerValidationFixtures)blockers.push('INNER_VALIDATION_INSUFFICIENT');
  const distinct=new Set(outer.left.map(r=>Number(r.probability).toFixed(8))).size;if(distinct<p.minimumDistinctProbabilities)blockers.push('DISTINCT_PROBABILITIES_INSUFFICIENT');
  const[source,family]=id.split('|||');
  const split={totalRows:rows.length,totalFixtures,outerTrainRows:outer.left.length,outerTrainFixtures:outer.leftFixtures,outerHoldoutRows:outer.right.length,outerHoldoutFixtures:outer.rightFixtures,outerSplitAt:outer.splitAt,innerFitRows:inner.left.length,innerFitFixtures:inner.leftFixtures,innerValidationRows:inner.right.length,innerValidationFixtures:inner.rightFixtures,innerSplitAt:inner.splitAt};
  if(blockers.length)return{segment:id,source,family,status:'INSUFFICIENT_EVIDENCE',split,blockers};
  const selection=selectOnInnerValidation(inner.left,inner.right);if(!selection)return{segment:id,source,family,status:'INSUFFICIENT_EVIDENCE',split,blockers:['ISOTONIC_FIT_UNAVAILABLE']};
  const finalFit=fitWeightedIsotonic(outer.left);if(!finalFit)return{segment:id,source,family,status:'INSUFFICIENT_EVIDENCE',split,blockers:['OUTER_TRAIN_ISOTONIC_FIT_UNAVAILABLE']};
  const alpha=selection.champion.alpha,baseFn=r=>r.probability,candidateFn=r=>calibratedProbability(r,finalFit,alpha),baseline=binaryMetrics(outer.right,baseFn),challenger=binaryMetrics(outer.right,candidateFn),bootstrap=pairedFixtureBootstrap(outer.right,baseFn,candidateFn),brierGain=improvementPct(baseline,challenger,'brier'),logGain=improvementPct(baseline,challenger,'logLoss'),gapRegression=Math.abs(challenger.calibrationGapPp??Infinity)-Math.abs(baseline.calibrationGapPp??Infinity),validationBlockers=[];
  if(!(brierGain>=p.minimumHoldoutBrierImprovementPct))validationBlockers.push('HOLDOUT_BRIER_GAIN_BELOW_FLOOR');
  if(!(logGain>=p.minimumHoldoutLogLossImprovementPct))validationBlockers.push('HOLDOUT_LOGLOSS_GAIN_BELOW_FLOOR');
  if(!(bootstrap.brier.upper95<0))validationBlockers.push('HOLDOUT_BRIER_GAIN_NOT_STATISTICALLY_SEPARATED');
  if(!(bootstrap.logLoss.upper95<0))validationBlockers.push('HOLDOUT_LOGLOSS_GAIN_NOT_STATISTICALLY_SEPARATED');
  if(!(gapRegression<=p.maximumHoldoutCalibrationGapRegressionPp))validationBlockers.push('HOLDOUT_CALIBRATION_GAP_REGRESSION');
  return{segment:id,source,family,status:validationBlockers.length?'HOLD':'RESEARCH_VALIDATED',split,selection:{rule:'ISOTONIC_FIT_ON_INNER_FIT; BLEND_ALPHA_SELECTED_ON_INNER_TEMPORAL_VALIDATION ONLY',alpha,fit:{rows:selection.fit.rows,fixtures:selection.fit.fixtures,distinctProbabilities:selection.fit.distinctProbabilities,blocks:selection.fit.blocks.length,weighting:selection.fit.weighting},innerBaseline:publicMetrics(selection.baseline),champion:{alpha,...publicMetrics(selection.champion.metrics)},leaderboard:selection.leaderboard},refit:{rule:'ISOTONIC REFIT ON FULL OUTER TRAIN AFTER ALPHA SELECTION',alpha,rows:finalFit.rows,fixtures:finalFit.fixtures,distinctProbabilities:finalFit.distinctProbabilities,blocks:finalFit.blocks.length,weighting:finalFit.weighting},holdout:{baseline:publicMetrics(baseline),challenger:publicMetrics(challenger),brierImprovementPct:round(brierGain,3),logLossImprovementPct:round(logGain,3),absoluteCalibrationGapRegressionPp:round(gapRegression,3),pairedBootstrap:bootstrap},blockers:validationBlockers};
}

export function evaluateBinaryCalibration(books=[]){
  const extracted=extractBinaryCalibrationSegments(books),segments=Object.entries(extracted.segments).map(([id,rows])=>evaluateSegment(id,rows)).sort((a,b)=>(a.family||'').localeCompare(b.family||'')||(a.source||'').localeCompare(b.source||''));
  return{version:BINARY_CALIBRATION_POLICY.version,mode:'SHADOW_ONLY',status:segments.some(x=>x.status==='RESEARCH_VALIDATED')?'RESEARCH_SIGNAL_AVAILABLE':'NO_VALIDATED_BINARY_CALIBRATOR',segments,issues:extracted.issues,dedupe:extracted.dedupe,policy:{...BINARY_CALIBRATION_POLICY,shadowOnly:true,readOnly:true,providerCalls:0,persistentWrites:0,automaticPromotion:false,productionProbabilityMutation:false,productionStakeMutation:false,officialLedgerEligible:false,wholeFixtureTemporalOrder:true,noShuffle:true,holdoutUsedForSelection:false,fitWeighting:'EACH FIXTURE CONTRIBUTES EQUAL TOTAL WEIGHT WITHIN A SEGMENT',supportedFamilies:[...SUPPORTED_FAMILIES],excludedFamilies:['RESULT_1X2','EXACT_SCORE','UNKNOWN'],duplicatePolicy:extracted.dedupePolicy}};
}
