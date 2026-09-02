const EPS=1e-12;
const ONE_X_TWO=['home','draw','away'];

function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function num(v,f=null){return finite(v)?Number(v):f}
function canonical(v){return String(v||'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'UNKNOWN'}
function clamp(v,lo=EPS,hi=1-EPS){return Math.max(lo,Math.min(hi,Number(v)))}
function isoMs(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null}
function pct(v){return Number((Number(v)*100).toFixed(2))}
function round(v,d=6){return Number(Number(v).toFixed(d))}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}

function truthFromScore(fixture){
  const h=num(fixture?.finalScore?.home),a=num(fixture?.finalScore?.away);
  if(h==null||a==null)return null;
  return h>a?'home':h<a?'away':'draw';
}

function oneXTwoPicks(fixture,source){
  const wanted=canonical(source),map={};
  for(const p of fixture?.picks||[]){
    const key=String(p?.key||'').trim();
    if(!ONE_X_TWO.includes(key))continue;
    if(canonical(p?.probabilitySource||p?.sourceClass||'UNKNOWN')!==wanted)continue;
    if(map[key])return{error:'DUPLICATE_1X2_PICK',map};
    map[key]=p;
  }
  return{map};
}

function eceBinary(rows,bins=10){
  const groups=Array.from({length:bins},()=>({n:0,sumP:0,sumY:0}));
  for(const r of rows){
    const p=clamp(r.p),idx=Math.min(bins-1,Math.floor(p*bins)),g=groups[idx];g.n++;g.sumP+=p;g.sumY+=r.y;
  }
  let ece=0;
  const detail=groups.map((g,i)=>{
    if(!g.n)return{bin:i,n:0,range:[round(i/bins,3),round((i+1)/bins,3)],avgProbability:null,observedRate:null,gap:null};
    const avg=g.sumP/g.n,obs=g.sumY/g.n,gap=Math.abs(avg-obs);ece+=g.n/Math.max(1,rows.length)*gap;
    return{bin:i,n:g.n,range:[round(i/bins,3),round((i+1)/bins,3)],avgProbability:round(avg,4),observedRate:round(obs,4),gap:round(gap,4)};
  });
  return{ece:rows.length?round(ece,5):null,bins:detail};
}

function topLabelEce(rows,bins=10){return eceBinary(rows.map(r=>({p:r.confidence,y:r.correct?1:0})),bins)}

function classCalibration(rows,key,bins=10){
  if(!rows.length)return{sample:0,averagePredicted:null,observedRate:null,calibrationGapPct:null,absoluteGapPct:null,ece:eceBinary([],bins)};
  const binary=rows.map(r=>({p:r.probabilities[key],y:r.truth===key?1:0})),mP=mean(binary.map(r=>r.p)),obs=mean(binary.map(r=>r.y)),gap=obs-mP;
  return{sample:binary.length,averagePredicted:round(mP,4),observedRate:round(obs,4),calibrationGapPct:pct(gap),absoluteGapPct:pct(Math.abs(gap)),ece:eceBinary(binary,bins)};
}

function monotonicityWarnings(rows,key,bins=10,minBinSample=12,tolerance=.05){
  const e=eceBinary(rows.map(r=>({p:r.probabilities[key],y:r.truth===key?1:0})),bins).bins.filter(x=>x.n>=minBinSample&&x.avgProbability!=null),warnings=[];
  for(let i=1;i<e.length;i++){
    const prev=e[i-1],cur=e[i];
    if(cur.avgProbability>prev.avgProbability&&cur.observedRate+tolerance<prev.observedRate){
      warnings.push({fromBin:prev.bin,toBin:cur.bin,fromPredicted:prev.avgProbability,toPredicted:cur.avgProbability,fromObserved:prev.observedRate,toObserved:cur.observedRate,dropPct:pct(prev.observedRate-cur.observedRate)});
    }
  }
  return{minimumBinSample:minBinSample,tolerancePct:pct(tolerance),eligibleBins:e.length,warnings};
}

function metrics(rows,probField='probabilities'){
  if(!rows.length)return{sample:0,brier:null,brierUnscaled:null,logLoss:null,accuracy:null,topLabelEce:null};
  let brier=0,logLoss=0,correct=0;const top=[];
  for(const r of rows){
    const p=r[probField],truth=r.truth;let sumSq=0,best=ONE_X_TWO[0];
    for(const k of ONE_X_TWO){const y=truth===k?1:0;sumSq+=(p[k]-y)**2;if(p[k]>p[best])best=k}
    brier+=sumSq/3;logLoss+=-Math.log(clamp(p[truth]));if(best===truth)correct++;top.push({confidence:p[best],correct:best===truth});
  }
  return{sample:rows.length,brier:round(brier/rows.length,6),brierUnscaled:round(brier*3/rows.length,6),logLoss:round(logLoss/rows.length,6),accuracy:round(correct/rows.length,4),topLabelEce:topLabelEce(top,10).ece};
}

function baseRateMetrics(rows){
  if(!rows.length)return{sample:0,frequencies:null,brier:null,brierUnscaled:null,logLoss:null,accuracy:null,topLabelEce:null};
  const counts={home:0,draw:0,away:0};for(const r of rows)counts[r.truth]++;
  const p=Object.fromEntries(ONE_X_TWO.map(k=>[k,counts[k]/rows.length]));
  return{frequencies:Object.fromEntries(ONE_X_TWO.map(k=>[k,round(p[k],4)])),...metrics(rows.map(r=>({...r,base:p})),'base')};
}

function marketMetrics(rows){
  const covered=rows.filter(r=>r.marketProbabilities&&ONE_X_TWO.every(k=>finite(r.marketProbabilities[k])));
  if(!covered.length)return{sample:0,coveragePct:0,brier:null,logLoss:null,accuracy:null,brierDeltaVsModel:null,logLossDeltaVsModel:null};
  const model=metrics(covered),market=metrics(covered,'marketProbabilities');
  return{sample:covered.length,coveragePct:pct(covered.length/rows.length),brier:market.brier,logLoss:market.logLoss,accuracy:market.accuracy,brierDeltaVsModel:round(market.brier-model.brier,6),logLossDeltaVsModel:round(market.logLoss-model.logLoss,6),interpretation:{deltaDefinition:'MARKET_LOSS_MINUS_MODEL_LOSS',negativeDeltaMeansMarketBetter:true}};
}

export function auditSourceCalibration(books,{source='ARGUS_PREMATCH_1X2',simplexTolerance=.005}={}){
  const rows=[],issues={missingTriplet:0,duplicatePick:0,invalidProbability:0,simplexFailure:0,missingFinalScore:0,outcomeContradiction:0,lateFreeze:0,missingFreezeTime:0,missingKickoff:0},freezeVersions={},sourceName=canonical(source);
  let fixtureCandidates=0;
  for(const book of books||[])for(const [fixtureKey,fixture] of Object.entries(book?.fixtures||{})){
    const picked=oneXTwoPicks(fixture,sourceName),map=picked.map||{};
    if(!ONE_X_TWO.some(k=>map[k]))continue;
    fixtureCandidates++;
    if(picked.error){issues.duplicatePick++;continue}
    if(!ONE_X_TWO.every(k=>map[k])){issues.missingTriplet++;continue}
    const truth=truthFromScore(fixture);if(!truth){issues.missingFinalScore++;continue}
    const outcomes=ONE_X_TWO.map(k=>String(map[k]?.outcome||'').toUpperCase()),wins=outcomes.filter(x=>x==='WIN').length;
    if(wins!==1||String(map[truth]?.outcome||'').toUpperCase()!=='WIN'){issues.outcomeContradiction++;continue}
    const probabilities={};let invalid=false;
    for(const k of ONE_X_TWO){const p=num(map[k]?.probability);if(!(p>0&&p<1)){invalid=true;break}probabilities[k]=p}
    if(invalid){issues.invalidProbability++;continue}
    const sum=ONE_X_TWO.reduce((s,k)=>s+probabilities[k],0);
    if(Math.abs(sum-1)>simplexTolerance){issues.simplexFailure++;continue}
    for(const k of ONE_X_TWO)probabilities[k]/=sum;
    const kickoff=isoMs(fixture?.kickoff),frozen=isoMs(fixture?.frozenAt||map.home?.probabilityFrozenAt||map.draw?.probabilityFrozenAt||map.away?.probabilityFrozenAt);
    if(kickoff==null)issues.missingKickoff++;
    if(frozen==null)issues.missingFreezeTime++;
    if(kickoff!=null&&frozen!=null&&frozen>=kickoff)issues.lateFreeze++;
    const marketProbabilities={};let marketComplete=true;
    for(const k of ONE_X_TWO){const p=num(map[k]?.marketImpliedProbability);if(!(p>0&&p<1)){marketComplete=false;break}marketProbabilities[k]=p}
    if(marketComplete){const ms=ONE_X_TWO.reduce((s,k)=>s+marketProbabilities[k],0);if(ms>.95&&ms<1.05)for(const k of ONE_X_TWO)marketProbabilities[k]/=ms;else marketComplete=false}
    const version=String(fixture?.freezeVersion||'LEGACY_OR_UNKNOWN');freezeVersions[version]=(freezeVersions[version]||0)+1;
    const best=ONE_X_TWO.reduce((a,k)=>probabilities[k]>probabilities[a]?k:a,'home');
    rows.push({fixtureKey:String(fixture?.fixtureId??fixtureKey),truth,probabilities,marketProbabilities:marketComplete?marketProbabilities:null,confidence:probabilities[best],correct:best===truth,kickoff,frozen,freezeVersion:version});
  }
  const model=metrics(rows),baseRate=baseRateMetrics(rows),market=marketMetrics(rows),calibration=Object.fromEntries(ONE_X_TWO.map(k=>[k,classCalibration(rows,k,10)])),monotonicity=Object.fromEntries(ONE_X_TWO.map(k=>[k,monotonicityWarnings(rows,k,10)]));
  const integrityFailures=issues.duplicatePick+issues.invalidProbability+issues.simplexFailure+issues.outcomeContradiction+issues.lateFreeze;
  const maxGap=Math.max(0,...ONE_X_TWO.map(k=>Math.abs(calibration[k]?.calibrationGapPct||0)));
  const riskFlags=[];
  if(integrityFailures)riskFlags.push('DATA_INTEGRITY_FAILURES_PRESENT');
  if(maxGap>=10)riskFlags.push('SEVERE_SOURCE_MISCALIBRATION');else if(maxGap>=5)riskFlags.push('SOURCE_MISCALIBRATION');
  if(baseRate?.brier!=null&&model?.brier!=null&&model.brier>baseRate.brier)riskFlags.push('MODEL_BRIER_WORSE_THAN_IN_SAMPLE_BASE_RATE');
  const monotonicWarnings=ONE_X_TWO.reduce((s,k)=>s+(monotonicity[k]?.warnings?.length||0),0);if(monotonicWarnings)riskFlags.push('CALIBRATION_BUCKET_ORDER_WARNINGS');
  const status=integrityFailures?'CRITICAL':maxGap>=10?'MODEL_RISK':maxGap>=5||monotonicWarnings?'CAUTION':'HEALTHY';
  return{version:'SOURCE-CALIBRATION-INTEGRITY-1',source:sourceName,status,fixtureCandidates,validFixtures:rows.length,integrity:{simplexTolerance,failures:integrityFailures,issues,freezeVersions},model,baseRateDescriptive:baseRate,marketFairComparison:market,calibration,monotonicity,riskFlags,policy:{readOnly:true,providerCalls:0,persistentWrites:0,mayChangePredictions:false,mayChangeStake:false,mayPromoteModel:false,baseRateIsInSampleDescriptiveOnly:true,marketComparisonRequiresCompleteDevigged1X2:true,performanceRiskIsNotDataCorruption:true}};
}
