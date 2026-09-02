const CLASSES=['home','draw','away'];
const EPS=1e-9;

export const MULTICLASS_CALIBRATION_POLICY=Object.freeze({
  version:'MULTICLASS-CALIBRATION-CHALLENGER-1',
  outerTrainFraction:.70,
  innerFitFraction:.75,
  minimumTotalFixtures:300,
  minimumOuterTrainFixtures:200,
  minimumOuterHoldoutFixtures:100,
  minimumInnerFitFixtures:140,
  minimumInnerValidationFixtures:50,
  minimumHoldoutBrierImprovementPct:3,
  minimumHoldoutLogLossImprovementPct:1,
  maximumHoldoutTopLabelEceRegression:.01,
  bootstrapReps:2000,
  temperatures:[.70,.85,1,1.15,1.30,1.50,1.75,2],
  priorShiftPowers:[0,.25,.50,.75,1]
});

function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function num(v,f=null){return finite(v)?Number(v):f}
function clamp(v,lo=EPS,hi=1-EPS){return Math.max(lo,Math.min(hi,Number(v)))}
function canonical(v){return String(v||'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'UNKNOWN'}
function isoMs(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null}
function round(v,d=6){return v==null?null:Number(Number(v).toFixed(d))}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}
function normalize(p){const x=CLASSES.map(k=>Math.max(EPS,num(p?.[k],0))),s=x.reduce((a,b)=>a+b,0);return Object.fromEntries(CLASSES.map((k,i)=>[k,x[i]/s]))}
function softmax(xs){const m=Math.max(...xs),ex=xs.map(x=>Math.exp(x-m)),s=ex.reduce((a,b)=>a+b,0);return ex.map(x=>x/s)}

function truthFromScore(fixture){const h=num(fixture?.finalScore?.home),a=num(fixture?.finalScore?.away);return h==null||a==null?null:h>a?'home':h<a?'away':'draw'}

function sourceTriplet(fixture,source){
  const wanted=canonical(source),map={};
  for(const p of fixture?.picks||[]){const key=String(p?.key||'').trim();if(!CLASSES.includes(key)||canonical(p?.probabilitySource||p?.sourceClass)!==wanted)continue;if(map[key])return null;map[key]=p}
  if(!CLASSES.every(k=>map[k]))return null;
  const raw=Object.fromEntries(CLASSES.map(k=>[k,num(map[k]?.probability)]));
  if(!CLASSES.every(k=>raw[k]>0&&raw[k]<1))return null;
  const sum=CLASSES.reduce((s,k)=>s+raw[k],0);if(Math.abs(sum-1)>.005)return null;
  return normalize(raw);
}

export function extractCalibrationRows(books,{source='ARGUS_PREMATCH_1X2'}={}){
  const rows=[],seen=new Set(),issues={duplicateFixture:0,lateFreeze:0,invalidOrMissingTriplet:0,missingFinalScore:0};
  for(const book of books||[])for(const [fallbackKey,fixture] of Object.entries(book?.fixtures||{})){
    const id=String(fixture?.fixtureId??fallbackKey);if(seen.has(id)){issues.duplicateFixture++;continue}
    const hasSource=(fixture?.picks||[]).some(p=>CLASSES.includes(String(p?.key||''))&&canonical(p?.probabilitySource||p?.sourceClass)===canonical(source));if(!hasSource)continue;
    seen.add(id);
    const p=sourceTriplet(fixture,source);if(!p){issues.invalidOrMissingTriplet++;continue}
    const truth=truthFromScore(fixture);if(!truth){issues.missingFinalScore++;continue}
    const kickoff=isoMs(fixture?.kickoff),frozen=isoMs(fixture?.frozenAt||fixture?.picks?.[0]?.probabilityFrozenAt);if(kickoff!=null&&frozen!=null&&frozen>=kickoff){issues.lateFreeze++;continue}
    const eventTime=kickoff??frozen;if(eventTime==null){issues.invalidOrMissingTriplet++;continue}
    rows.push({fixtureId:id,eventTime,truth,p});
  }
  rows.sort((a,b)=>a.eventTime-b.eventTime||a.fixtureId.localeCompare(b.fixtureId));
  return{rows,issues};
}

function splitTemporal(rows,fraction){
  if(rows.length<2)return{left:[],right:[],splitAt:null};
  const cut=Math.max(1,Math.min(rows.length-1,Math.floor(rows.length*fraction)));
  return{left:rows.slice(0,cut),right:rows.slice(cut),splitAt:new Date(rows[cut].eventTime).toISOString()};
}

function fitPriorShift(rows){
  const actual={home:0,draw:0,away:0},pred={home:0,draw:0,away:0};
  for(const r of rows){actual[r.truth]++;for(const k of CLASSES)pred[k]+=r.p[k]}
  const ratio={};for(const k of CLASSES){const obs=(actual[k]+1)/(rows.length+CLASSES.length),avg=(pred[k]+1)/(rows.length+CLASSES.length);ratio[k]=Math.max(.25,Math.min(4,obs/avg))}
  return{actualRate:Object.fromEntries(CLASSES.map(k=>[k,round(actual[k]/Math.max(1,rows.length),4)])),averagePredicted:Object.fromEntries(CLASSES.map(k=>[k,round(pred[k]/Math.max(1,rows.length),4)])),ratio:Object.fromEntries(CLASSES.map(k=>[k,round(ratio[k],6)]))};
}

export function transformProbability(p,{temperature=1,priorShiftPower=0,priorRatio={home:1,draw:1,away:1}}={}){
  const base=normalize(p),t=Math.max(.25,Math.min(4,Number(temperature)||1)),a=Math.max(0,Math.min(1.5,Number(priorShiftPower)||0));
  const logits=CLASSES.map(k=>Math.log(clamp(base[k]))/t+a*Math.log(Math.max(.05,Math.min(20,num(priorRatio?.[k],1)))));const q=softmax(logits);
  return Object.fromEntries(CLASSES.map((k,i)=>[k,q[i]]));
}

function eceTop(rows,probFn,bins=10){
  if(!rows.length)return null;const g=Array.from({length:bins},()=>({n:0,p:0,y:0}));
  for(const r of rows){const p=probFn(r),best=CLASSES.reduce((a,k)=>p[k]>p[a]?k:a,'home'),conf=p[best],i=Math.min(bins-1,Math.floor(conf*bins));g[i].n++;g[i].p+=conf;g[i].y+=best===r.truth?1:0}
  let e=0;for(const x of g)if(x.n)e+=x.n/rows.length*Math.abs(x.p/x.n-x.y/x.n);return e;
}

function losses(rows,probFn){
  let brier=0,logLoss=0,correct=0;const perFixture=[];
  for(const r of rows){const p=probFn(r),best=CLASSES.reduce((a,k)=>p[k]>p[a]?k:a,'home');let sq=0;for(const k of CLASSES)sq+=(p[k]-(r.truth===k?1:0))**2;const b=sq/3,l=-Math.log(clamp(p[r.truth]));brier+=b;logLoss+=l;if(best===r.truth)correct++;perFixture.push({fixtureId:r.fixtureId,brier:b,logLoss:l})}
  return{sample:rows.length,brier:rows.length?brier/rows.length:null,logLoss:rows.length?logLoss/rows.length:null,accuracy:rows.length?correct/rows.length:null,topLabelEce:eceTop(rows,probFn),perFixture};
}

function publicMetrics(x){return{sample:x.sample,brier:round(x.brier),logLoss:round(x.logLoss),accuracy:round(x.accuracy,4),topLabelEce:round(x.topLabelEce,5)}}
function improvementPct(base,candidate,key){return base?.[key]>0&&candidate?.[key]!=null?(base[key]-candidate[key])/base[key]*100:null}

function candidateGrid(priorFit){const out=[];for(const temperature of MULTICLASS_CALIBRATION_POLICY.temperatures)for(const priorShiftPower of MULTICLASS_CALIBRATION_POLICY.priorShiftPowers)out.push({id:`T${String(temperature).replace('.','_')}_P${String(priorShiftPower).replace('.','_')}`,temperature,priorShiftPower,priorRatio:priorFit.ratio});return out}
function evaluate(rows,c){return losses(rows,r=>transformProbability(r.p,c))}

function selectOnInnerValidation(innerFit,innerValidation){
  const priorFit=fitPriorShift(innerFit),baseline=losses(innerValidation,r=>r.p),candidates=candidateGrid(priorFit).map(c=>({config:c,metrics:evaluate(innerValidation,c)}));
  candidates.sort((a,b)=>a.metrics.brier-b.metrics.brier||a.metrics.logLoss-b.metrics.logLoss||Math.abs(a.config.temperature-1)-Math.abs(b.config.temperature-1)||a.config.priorShiftPower-b.config.priorShiftPower);
  const champion=candidates[0];
  return{priorFit,baseline,champion,leaderboard:candidates.slice(0,8).map(x=>({id:x.config.id,temperature:x.config.temperature,priorShiftPower:x.config.priorShiftPower,...publicMetrics(x.metrics),brierImprovementPct:round(improvementPct(baseline,x.metrics,'brier'),3),logLossImprovementPct:round(improvementPct(baseline,x.metrics,'logLoss'),3)}))};
}

function seeded(seed=0x9e3779b9){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function quantile(sorted,q){if(!sorted.length)return null;const pos=(sorted.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo)}
function pairedBootstrap(base,candidate,reps=MULTICLASS_CALIBRATION_POLICY.bootstrapReps){
  if(base.perFixture.length!==candidate.perFixture.length||base.perFixture.length<2)return{reps:0,meanBrierDelta:null,lower95:null,upper95:null};
  const deltas=base.perFixture.map((x,i)=>candidate.perFixture[i].brier-x.brier),rng=seeded(deltas.length*2654435761),means=[];
  for(let r=0;r<reps;r++){let s=0;for(let i=0;i<deltas.length;i++)s+=deltas[Math.floor(rng()*deltas.length)];means.push(s/deltas.length)}means.sort((a,b)=>a-b);
  return{method:'PAIRED_FIXTURE_BOOTSTRAP',reps,meanBrierDelta:round(mean(deltas)),lower95:round(quantile(means,.025)),upper95:round(quantile(means,.975))};
}

export function evaluateMulticlassCalibration(books,{source='ARGUS_PREMATCH_1X2'}={}){
  const extracted=extractCalibrationRows(books,{source}),rows=extracted.rows,p=MULTICLASS_CALIBRATION_POLICY,blockers=[];
  if(rows.length<p.minimumTotalFixtures)blockers.push('TOTAL_FIXTURES_INSUFFICIENT');
  const outer=splitTemporal(rows,p.outerTrainFraction);if(outer.left.length<p.minimumOuterTrainFixtures)blockers.push('OUTER_TRAIN_INSUFFICIENT');if(outer.right.length<p.minimumOuterHoldoutFixtures)blockers.push('OUTER_HOLDOUT_INSUFFICIENT');
  const inner=splitTemporal(outer.left,p.innerFitFraction);if(inner.left.length<p.minimumInnerFitFixtures)blockers.push('INNER_FIT_INSUFFICIENT');if(inner.right.length<p.minimumInnerValidationFixtures)blockers.push('INNER_VALIDATION_INSUFFICIENT');
  if(blockers.length)return{version:p.version,status:'INSUFFICIENT_EVIDENCE',source:canonical(source),sample:rows.length,issues:extracted.issues,split:{outerTrain:outer.left.length,outerHoldout:outer.right.length,outerSplitAt:outer.splitAt,innerFit:inner.left.length,innerValidation:inner.right.length,innerSplitAt:inner.splitAt},blockers,policy:{shadowOnly:true,automaticPromotion:false,holdoutUsedForSelection:false}};
  const selection=selectOnInnerValidation(inner.left,inner.right),finalPrior=fitPriorShift(outer.left),config={...selection.champion.config,priorRatio:finalPrior.ratio},baseline=losses(outer.right,r=>r.p),challenger=evaluate(outer.right,config),ci=pairedBootstrap(baseline,challenger),brierGain=improvementPct(baseline,challenger,'brier'),logGain=improvementPct(baseline,challenger,'logLoss'),eceRegression=(challenger.topLabelEce??Infinity)-(baseline.topLabelEce??Infinity),validationBlockers=[];
  if(!(brierGain>=p.minimumHoldoutBrierImprovementPct))validationBlockers.push('HOLDOUT_BRIER_GAIN_BELOW_FLOOR');
  if(!(logGain>=p.minimumHoldoutLogLossImprovementPct))validationBlockers.push('HOLDOUT_LOGLOSS_GAIN_BELOW_FLOOR');
  if(!(ci.upper95<0))validationBlockers.push('HOLDOUT_BRIER_GAIN_NOT_STATISTICALLY_SEPARATED');
  if(!(eceRegression<=p.maximumHoldoutTopLabelEceRegression))validationBlockers.push('HOLDOUT_ECE_REGRESSION');
  const status=validationBlockers.length?'HOLD':'RESEARCH_VALIDATED';
  return{version:p.version,status,source:canonical(source),sample:rows.length,issues:extracted.issues,split:{outerTrain:outer.left.length,outerHoldout:outer.right.length,outerSplitAt:outer.splitAt,innerFit:inner.left.length,innerValidation:inner.right.length,innerSplitAt:inner.splitAt},selection:{rule:'HYPERPARAMETERS_SELECTED_ON_INNER_TEMPORAL_VALIDATION_ONLY',priorFit:selection.priorFit,innerBaseline:publicMetrics(selection.baseline),champion:{id:selection.champion.config.id,temperature:selection.champion.config.temperature,priorShiftPower:selection.champion.config.priorShiftPower,...publicMetrics(selection.champion.metrics)},leaderboard:selection.leaderboard},refit:{rule:'PRIOR_SHIFT_REFIT_ON_FULL_OUTER_TRAIN_AFTER_HYPERPARAMETER_SELECTION',priorFit:finalPrior,temperature:config.temperature,priorShiftPower:config.priorShiftPower},holdout:{baseline:publicMetrics(baseline),challenger:publicMetrics(challenger),brierImprovementPct:round(brierGain,3),logLossImprovementPct:round(logGain,3),topLabelEceDelta:round(eceRegression,5),pairedBrierBootstrap:ci},blockers:validationBlockers,policy:{shadowOnly:true,readOnly:true,providerCalls:0,persistentWrites:0,automaticPromotion:false,holdoutUsedForSelection:false,wholeFixtureTemporalOrder:true,marketDataUsedForTraining:false,productionProbabilityMutation:false,productionStakeMutation:false}};
}
