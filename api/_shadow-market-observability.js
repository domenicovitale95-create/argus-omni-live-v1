const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const number=v=>finite(v)?Number(v):null;
const pct=(v,d=2)=>Number.isFinite(v)?Number((v*100).toFixed(d)):null;
const round=(v,d=4)=>Number.isFinite(v)?Number(v.toFixed(d)):null;

const RESULT_1X2=new Set(['home','draw','away']);
const DOUBLE_CHANCE=new Set(['doubleChance1X','doubleChance12','doubleChanceX2']);
const TOTAL_GOALS=new Set(['over15','under15','over25','under25','over35','under35']);
const BTTS=new Set(['bttsYes','bttsNo']);
const TEAM_GOALS=new Set(['homeOver05','homeUnder05','awayOver05','awayUnder05']);

export function shadowMarketFamily(key){
  const k=String(key||'');
  if(RESULT_1X2.has(k))return'RESULT_1X2';
  if(DOUBLE_CHANCE.has(k))return'DOUBLE_CHANCE';
  if(TOTAL_GOALS.has(k))return'TOTAL_GOALS';
  if(BTTS.has(k))return'BTTS';
  if(TEAM_GOALS.has(k))return'TEAM_GOALS';
  if(k.startsWith('score:'))return'EXACT_SCORE';
  return'UNKNOWN';
}

function empty(){
  return{sample:0,settled:0,wins:0,priced:0,independent:0,fairMarketSamples:0,deViggedFairSamples:0,pnlSamples:0,pl:0,clvSamples:0,clvSum:0,calibrationSamples:0,brierSum:0,predictedSum:0,actualSum:0};
}
function ensure(map,key){return map[key]||(map[key]=empty())}
function observe(acc,p){
  acc.sample++;
  if(Number(p?.odds)>1)acc.priced++;
  if(p?.modelIndependentOfPrice===true)acc.independent++;
  const fair=number(p?.marketImpliedProbability);
  if(fair!=null&&fair>0&&fair<1){acc.fairMarketSamples++;if(String(p?.marketProbabilityMethod||'').startsWith('DEVIG_'))acc.deViggedFairSamples++}
  const outcome=String(p?.outcome||'').toUpperCase();
  if(!['WIN','LOSS'].includes(outcome))return;
  const y=outcome==='WIN'?1:0;acc.settled++;acc.wins+=y;
  const pl=number(p?.pl);if(pl!=null){acc.pnlSamples++;acc.pl+=pl}
  const clv=number(p?.clv);if(clv!=null){acc.clvSamples++;acc.clvSum+=clv}
  const probability=number(p?.probability);
  if(probability!=null&&probability>0&&probability<1){acc.calibrationSamples++;acc.brierSum+=(probability-y)**2;acc.predictedSum+=probability;acc.actualSum+=y}
}
function finish(acc){
  const observed=acc.calibrationSamples?acc.actualSum/acc.calibrationSamples:null;
  const predicted=acc.calibrationSamples?acc.predictedSum/acc.calibrationSamples:null;
  return{
    sample:acc.sample,
    settled:acc.settled,
    wins:acc.wins,
    hitRatePct:acc.settled?pct(acc.wins/acc.settled,1):null,
    priced:acc.priced,
    pricingCoveragePct:acc.sample?pct(acc.priced/acc.sample,1):null,
    independent:acc.independent,
    independentSharePct:acc.sample?pct(acc.independent/acc.sample,1):null,
    fairMarketSamples:acc.fairMarketSamples,
    deViggedFairSamples:acc.deViggedFairSamples,
    deViggedFairCoveragePct:acc.sample?pct(acc.deViggedFairSamples/acc.sample,1):null,
    pnlSamples:acc.pnlSamples,
    flatStakePL:round(acc.pl,2),
    flatStakeRoiPct:acc.pnlSamples?round(acc.pl/acc.pnlSamples*100,2):null,
    clvSamples:acc.clvSamples,
    avgCLV:acc.clvSamples?round(acc.clvSum/acc.clvSamples,2):null,
    calibrationSamples:acc.calibrationSamples,
    brier:acc.calibrationSamples?round(acc.brierSum/acc.calibrationSamples,5):null,
    meanPredictedPct:predicted==null?null:pct(predicted,1),
    observedWinPct:observed==null?null:pct(observed,1),
    calibrationGapPp:predicted==null||observed==null?null:round((predicted-observed)*100,1)
  };
}
function finishMap(map){return Object.fromEntries(Object.entries(map).map(([key,acc])=>[key,finish(acc)]))}

export function buildShadowMarketObservability(books=[]){
  const families={},cohortAcc={};
  for(const book of Array.isArray(books)?books:[]){
    for(const fixture of Object.values(book?.fixtures||{})){
      const cohort=String(fixture?.freezeVersion||'LEGACY_OR_UNKNOWN');
      const cohortEntry=cohortAcc[cohort]||(cohortAcc[cohort]={overall:empty(),families:{}});
      for(const p of Array.isArray(fixture?.picks)?fixture.picks:[]){
        const family=shadowMarketFamily(p?.key);
        observe(ensure(families,family),p);
        observe(cohortEntry.overall,p);
        observe(ensure(cohortEntry.families,family),p);
      }
    }
  }
  const cohorts=Object.fromEntries(Object.entries(cohortAcc).map(([cohort,x])=>[cohort,{...finish(x.overall),families:finishMap(x.families)}]));
  return{
    version:'SHADOW-MARKET-OBSERVABILITY-1',
    families:finishMap(families),
    cohorts,
    policy:{
      descriptiveOnly:true,
      productionAuthority:false,
      automaticPromotion:false,
      automaticRealWagering:false,
      roiDenominator:'SETTLED PICKS WITH RECORDED P/L ONLY',
      calibration:'BINARY BRIER ON SETTLED PICKS WITH FROZEN MODEL PROBABILITY',
      cohortRule:'FREEZE VERSIONS ARE REPORTED SEPARATELY; LEGACY EVIDENCE IS NOT REWRITTEN OR SILENTLY POOLED FOR VERSION-SPECIFIC CLAIMS'
    }
  };
}
