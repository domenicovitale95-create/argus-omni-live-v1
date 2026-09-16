import { dedupeShadowFixtures } from './_shadow-fixture-dedupe.js';

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const number=v=>finite(v)?Number(v):null;
const pct=(v,d=2)=>Number.isFinite(v)?Number((v*100).toFixed(d)):null;
const round=(v,d=4)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const EPS=1e-12;

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

export function shadowOddsBand(odds){
  const o=number(odds);
  if(!(o>1))return'UNPRICED';
  if(o<1.5)return'ODDS_LT_1_50';
  if(o<2)return'ODDS_1_50_1_99';
  if(o<3)return'ODDS_2_00_2_99';
  if(o<5)return'ODDS_3_00_4_99';
  return'ODDS_GE_5_00';
}

function leagueKey(value){
  if(value&&typeof value==='object'){
    const v=value.name??value.league?.name??value.id??value.league?.id;
    return String(v??'UNKNOWN').trim()||'UNKNOWN';
  }
  return String(value??'UNKNOWN').trim()||'UNKNOWN';
}
function empty(){
  return{sample:0,settled:0,wins:0,priced:0,independent:0,fairMarketSamples:0,deViggedFairSamples:0,pnlSamples:0,pl:0,frozenOddsPnlSamples:0,frozenOddsPL:0,lateBoundPnlSamples:0,clvSamples:0,clvSum:0,calibrationSamples:0,brierSum:0,logLossSum:0,predictedSum:0,actualSum:0};
}
function ensure(map,key){return map[key]||(map[key]=empty())}
function ensureNested(map,key){return map[key]||(map[key]={overall:empty(),families:{}})}
function observe(acc,p){
  acc.sample++;
  if(Number(p?.odds)>1)acc.priced++;
  if(p?.modelIndependentOfPrice===true)acc.independent++;
  const fair=number(p?.marketImpliedProbability);
  if(fair!=null&&fair>0&&fair<1){acc.fairMarketSamples++;if(String(p?.marketProbabilityMethod||'').startsWith('DEVIG_'))acc.deViggedFairSamples++}
  const outcome=String(p?.outcome||'').toUpperCase();
  if(!['WIN','LOSS'].includes(outcome))return;
  const y=outcome==='WIN'?1:0;acc.settled++;acc.wins+=y;
  const pl=number(p?.pl);
  if(pl!=null){
    acc.pnlSamples++;acc.pl+=pl;
    if(String(p?.entryPriceSource||'')==='PREKICKOFF_FREEZE'){acc.frozenOddsPnlSamples++;acc.frozenOddsPL+=pl}
    if(String(p?.entryPriceSource||'')==='PREKICKOFF_LATE_BIND')acc.lateBoundPnlSamples++;
  }
  const clv=number(p?.clv);if(clv!=null){acc.clvSamples++;acc.clvSum+=clv}
  const probability=number(p?.probability);
  if(probability!=null&&probability>0&&probability<1){
    const q=Math.min(1-EPS,Math.max(EPS,probability));
    acc.calibrationSamples++;acc.brierSum+=(probability-y)**2;acc.logLossSum+=-(y*Math.log(q)+(1-y)*Math.log(1-q));acc.predictedSum+=probability;acc.actualSum+=y;
  }
}
function finish(acc){
  const observed=acc.calibrationSamples?acc.actualSum/acc.calibrationSamples:null;
  const predicted=acc.calibrationSamples?acc.predictedSum/acc.calibrationSamples:null;
  return{
    sample:acc.sample,
    settled:acc.settled,
    settlementCoveragePct:acc.sample?pct(acc.settled/acc.sample,1):null,
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
    frozenOddsPnlSamples:acc.frozenOddsPnlSamples,
    frozenOddsFlatStakePL:round(acc.frozenOddsPL,2),
    frozenOddsRoiPct:acc.frozenOddsPnlSamples?round(acc.frozenOddsPL/acc.frozenOddsPnlSamples*100,2):null,
    lateBoundPnlSamples:acc.lateBoundPnlSamples,
    clvSamples:acc.clvSamples,
    clvCoveragePct:acc.settled?pct(acc.clvSamples/acc.settled,1):null,
    avgCLV:acc.clvSamples?round(acc.clvSum/acc.clvSamples,2):null,
    calibrationSamples:acc.calibrationSamples,
    calibrationCoveragePct:acc.settled?pct(acc.calibrationSamples/acc.settled,1):null,
    brier:acc.calibrationSamples?round(acc.brierSum/acc.calibrationSamples,5):null,
    logLoss:acc.calibrationSamples?round(acc.logLossSum/acc.calibrationSamples,5):null,
    meanPredictedPct:predicted==null?null:pct(predicted,1),
    observedWinPct:observed==null?null:pct(observed,1),
    calibrationGapPp:predicted==null||observed==null?null:round((predicted-observed)*100,1)
  };
}
function finishMap(map){return Object.fromEntries(Object.entries(map).map(([key,acc])=>[key,finish(acc)]))}
function finishNestedMap(map){return Object.fromEntries(Object.entries(map).map(([key,x])=>[key,{...finish(x.overall),families:finishMap(x.families)}]))}

export function buildShadowMarketObservability(books=[]){
  const canonicalView=dedupeShadowFixtures(Array.isArray(books)?books:[]),overall=empty(),families={},cohortAcc={},leagueAcc={},oddsBandAcc={};
  for(const fixture of canonicalView.fixtures){
    const cohort=String(fixture?.freezeVersion||'LEGACY_OR_UNKNOWN'),league=leagueKey(fixture?.competition),cohortEntry=ensureNested(cohortAcc,cohort),leagueEntry=ensureNested(leagueAcc,league);
    for(const p of Array.isArray(fixture?.picks)?fixture.picks:[]){
      const family=shadowMarketFamily(p?.key),band=shadowOddsBand(p?.odds),bandEntry=ensureNested(oddsBandAcc,band);
      observe(overall,p);
      observe(ensure(families,family),p);
      observe(cohortEntry.overall,p);observe(ensure(cohortEntry.families,family),p);
      observe(leagueEntry.overall,p);observe(ensure(leagueEntry.families,family),p);
      observe(bandEntry.overall,p);observe(ensure(bandEntry.families,family),p);
    }
  }
  return{
    version:'SHADOW-MARKET-OBSERVABILITY-2',
    overall:finish(overall),
    families:finishMap(families),
    leagues:finishNestedMap(leagueAcc),
    oddsBands:finishNestedMap(oddsBandAcc),
    cohorts:finishNestedMap(cohortAcc),
    canonicalEvidence:{diagnostics:canonicalView.diagnostics,policy:canonicalView.policy},
    oddsBandDefinitions:{
      UNPRICED:'No valid stored entry odds',
      ODDS_LT_1_50:'1.01-1.49',
      ODDS_1_50_1_99:'1.50-1.99',
      ODDS_2_00_2_99:'2.00-2.99',
      ODDS_3_00_4_99:'3.00-4.99',
      ODDS_GE_5_00:'5.00+'
    },
    policy:{
      descriptiveOnly:true,
      productionAuthority:false,
      automaticPromotion:false,
      automaticRealWagering:false,
      canonicalFixtureRule:'DEDUPLICATED BY STABLE FIXTURE ID; SAFE RESCHEDULES USE EARLIEST PROSPECTIVE FREEZE AND CONSISTENT FINAL SCORE; UNRESOLVED CONFLICTS FAIL CLOSED',
      roiDenominator:'SETTLED PICKS WITH RECORDED P/L ONLY',
      frozenOddsRoiDenominator:'SETTLED PICKS WITH RECORDED P/L AND entryPriceSource=PREKICKOFF_FREEZE ONLY',
      lateBoundPricesExcludedFromFrozenOddsRoi:true,
      calibration:'BINARY BRIER AND LOG LOSS ON SETTLED PICKS WITH PROSPECTIVELY FROZEN MODEL PROBABILITY',
      leagueBasis:'FIXTURE COMPETITION STORED WITH PROSPECTIVE SHADOW FREEZE',
      oddsBandBasis:'STORED PRE-KICKOFF ENTRY ODDS ON EACH SHADOW PICK',
      cohortRule:'FREEZE VERSIONS ARE REPORTED SEPARATELY; LEGACY EVIDENCE IS NOT REWRITTEN OR SILENTLY POOLED FOR VERSION-SPECIFIC CLAIMS'
    }
  };
}
