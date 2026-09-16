import { dedupeShadowFixtures } from './_shadow-fixture-dedupe.js';

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const number=v=>finite(v)?Number(v):null;
const pct=(v,d=2)=>Number.isFinite(v)?Number((v*100).toFixed(d)):null;
const round=(v,d=4)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const EPS=1e-12;
const ROI_BOOTSTRAP_REPS=1200;
const ROI_BOOTSTRAP_MIN_FIXTURES=20;

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
  return{sample:0,settled:0,wins:0,priced:0,independent:0,fairMarketSamples:0,deViggedFairSamples:0,pnlSamples:0,pl:0,frozenOddsPnlSamples:0,frozenOddsPL:0,lateBoundPnlSamples:0,clvSamples:0,clvSum:0,calibrationSamples:0,brierSum:0,logLossSum:0,predictedSum:0,actualSum:0,returnFixtures:new Map(),frozenReturnFixtures:new Map()};
}
function ensure(map,key){return map[key]||(map[key]=empty())}
function ensureNested(map,key){return map[key]||(map[key]={overall:empty(),families:{}})}
function returnGroup(map,fixture){
  const fixtureId=String(fixture?.fixtureId??'UNKNOWN'),time=new Date(fixture?.kickoff||fixture?.frozenAt||0).getTime(),key=fixtureId,g=map.get(key)||{fixtureId,time:Number.isFinite(time)?time:0,pl:0,count:0};
  if(Number.isFinite(time)&&time>0&&(g.time<=0||time<g.time))g.time=time;map.set(key,g);return g;
}
function observe(acc,p,fixture){
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
    acc.pnlSamples++;acc.pl+=pl;const g=returnGroup(acc.returnFixtures,fixture);g.pl+=pl;g.count++;
    if(String(p?.entryPriceSource||'')==='PREKICKOFF_FREEZE'){acc.frozenOddsPnlSamples++;acc.frozenOddsPL+=pl;const fg=returnGroup(acc.frozenReturnFixtures,fixture);fg.pl+=pl;fg.count++}
    if(String(p?.entryPriceSource||'')==='PREKICKOFF_LATE_BIND')acc.lateBoundPnlSamples++;
  }
  const clv=number(p?.clv);if(clv!=null){acc.clvSamples++;acc.clvSum+=clv}
  const probability=number(p?.probability);
  if(probability!=null&&probability>0&&probability<1){
    const q=Math.min(1-EPS,Math.max(EPS,probability));
    acc.calibrationSamples++;acc.brierSum+=(probability-y)**2;acc.logLossSum+=-(y*Math.log(q)+(1-y)*Math.log(1-q));acc.predictedSum+=probability;acc.actualSum+=y;
  }
}
function seeded(seed=0x9e3779b9){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function quantile(sorted,q){if(!sorted.length)return null;const pos=(sorted.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo)}
function roiBootstrap(map,reps=ROI_BOOTSTRAP_REPS){
  const groups=[...map.values()].filter(g=>g.count>0),base={method:'FIXTURE_BLOCK_BOOTSTRAP',fixtures:groups.length,reps:0,lower95Pct:null,upper95Pct:null};
  if(groups.length<ROI_BOOTSTRAP_MIN_FIXTURES||reps<1)return base;
  const seed=(groups.length*2654435761+groups.reduce((s,g)=>s+g.count*31+Math.round(g.pl*100),0))>>>0,rng=seeded(seed),values=[];
  for(let z=0;z<reps;z++){let pl=0,count=0;for(let i=0;i<groups.length;i++){const g=groups[Math.floor(rng()*groups.length)];pl+=g.pl;count+=g.count}if(count)values.push(pl/count*100)}
  values.sort((a,b)=>a-b);return{method:'FIXTURE_BLOCK_BOOTSTRAP',fixtures:groups.length,reps:values.length,lower95Pct:round(quantile(values,.025),2),upper95Pct:round(quantile(values,.975),2)};
}
function maxDrawdown(map){
  const byTime=new Map();for(const g of map.values()){const t=Number(g.time)||0;byTime.set(t,(byTime.get(t)||0)+g.pl)}
  let equity=0,peak=0,max=0;for(const[,pl]of[...byTime.entries()].sort((a,b)=>a[0]-b[0])){equity+=pl;peak=Math.max(peak,equity);max=Math.max(max,peak-equity)}return round(max,2);
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
    pnlFixtures:acc.returnFixtures.size,
    flatStakePL:round(acc.pl,2),
    flatStakeRoiPct:acc.pnlSamples?round(acc.pl/acc.pnlSamples*100,2):null,
    flatStakeRoiConfidence95:roiBootstrap(acc.returnFixtures),
    maxDrawdownUnits:maxDrawdown(acc.returnFixtures),
    frozenOddsPnlSamples:acc.frozenOddsPnlSamples,
    frozenOddsPnlFixtures:acc.frozenReturnFixtures.size,
    frozenOddsFlatStakePL:round(acc.frozenOddsPL,2),
    frozenOddsRoiPct:acc.frozenOddsPnlSamples?round(acc.frozenOddsPL/acc.frozenOddsPnlSamples*100,2):null,
    frozenOddsRoiConfidence95:roiBootstrap(acc.frozenReturnFixtures),
    frozenOddsMaxDrawdownUnits:maxDrawdown(acc.frozenReturnFixtures),
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
      observe(overall,p,fixture);
      observe(ensure(families,family),p,fixture);
      observe(cohortEntry.overall,p,fixture);observe(ensure(cohortEntry.families,family),p,fixture);
      observe(leagueEntry.overall,p,fixture);observe(ensure(leagueEntry.families,family),p,fixture);
      observe(bandEntry.overall,p,fixture);observe(ensure(bandEntry.families,family),p,fixture);
    }
  }
  return{
    version:'SHADOW-MARKET-OBSERVABILITY-3',
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
      roiUncertainty:`${ROI_BOOTSTRAP_REPS}-REP FIXTURE-BLOCK BOOTSTRAP; CI REQUIRES ${ROI_BOOTSTRAP_MIN_FIXTURES} DISTINCT P/L FIXTURES`,
      drawdown:'CUMULATIVE FLAT-STAKE P/L AGGREGATED BY FIXTURE TIME BEFORE MAX-DRAWDOWN CALCULATION',
      calibration:'BINARY BRIER AND LOG LOSS ON SETTLED PICKS WITH PROSPECTIVELY FROZEN MODEL PROBABILITY',
      leagueBasis:'FIXTURE COMPETITION STORED WITH PROSPECTIVE SHADOW FREEZE',
      oddsBandBasis:'STORED PRE-KICKOFF ENTRY ODDS ON EACH SHADOW PICK',
      cohortRule:'FREEZE VERSIONS ARE REPORTED SEPARATELY; LEGACY EVIDENCE IS NOT REWRITTEN OR SILENTLY POOLED FOR VERSION-SPECIFIC CLAIMS'
    }
  };
}
