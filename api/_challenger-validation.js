const clamp=(v,min=.01,max=.99)=>Math.max(min,Math.min(max,Number(v)||0));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const n=(v,f=null)=>finite(v)?Number(v):f;

export const CHALLENGER_VALIDATION_POLICY=Object.freeze({
  version:'CHALLENGER-VALIDATION-2',
  trainFraction:.70,
  minimumTrainSample:150,
  minimumHoldoutSample:100,
  minimumTrainFixtures:40,
  minimumHoldoutFixtures:20,
  minimumHoldoutSimulatedBets:20,
  minimumHoldoutClvSamples:20,
  minimumBrierImprovementPct:3,
  betEdgeFloor:.03,
  bootstrapReps:1200,
  maxApproved:3
});

export function generateChallengers(){
  const out=[];
  for(const shrink of [.86,.90,.94,.97])out.push({id:`SHRINK_${Math.round(shrink*100)}`,type:'SHRINK',shrink});
  for(const marketWeight of [.08,.12,.18,.24])out.push({id:`MARKET_${Math.round(marketWeight*100)}`,type:'MARKET_BLEND',marketWeight});
  return out;
}

export function applyChallenger(c,p,marketProbability){
  if(c?.type==='SHRINK')return clamp(.5+(p-.5)*c.shrink);
  if(c?.type==='MARKET_BLEND'&&finite(marketProbability))return clamp(p*(1-c.marketWeight)+Number(marketProbability)*c.marketWeight);
  return clamp(p);
}

function rowMarketProbability(r){
  const fair=n(r?.marketImpliedProbability);
  if(fair>0&&fair<1)return fair;
  const odds=n(r?.odds);
  return odds>1?1/odds:null;
}
function rowFixtureKey(r,index=0){return String(r?._fixtureKey??r?.fixtureId??`ROW-${index}`)}
function validScoringRow(r){const p=n(r?.probability);return p>0&&p<1&&['WIN','LOSS'].includes(String(r?.outcome||'').toUpperCase())}
function improvementPct(base,candidate){return base?.brier>0&&candidate?.brier!=null?Number(((base.brier-candidate.brier)/base.brier*100).toFixed(3)):null}

export function scoreChallenger(rows,c={id:'BASELINE',type:'BASELINE'}){
  let sample=0,bs=0,pnl=0,simulatedBets=0,clv=0,clvSamples=0;
  const fixtures=new Set();
  for(let i=0;i<(rows||[]).length;i++){
    const r=rows[i];if(!validScoringRow(r))continue;
    const p0=n(r.probability),marketProbability=rowMarketProbability(r),p=applyChallenger(c,p0,marketProbability),y=String(r.outcome).toUpperCase()==='WIN'?1:0;
    sample++;fixtures.add(rowFixtureKey(r,i));bs+=(p-y)**2;
    const odds=n(r.odds),rawImplied=odds>1?1/odds:null;
    if(rawImplied!=null&&p-rawImplied>=CHALLENGER_VALIDATION_POLICY.betEdgeFloor){
      simulatedBets++;pnl+=y?(odds-1):-1;
      if(finite(r.clv)){clv+=Number(r.clv);clvSamples++}
    }
  }
  return{
    ...c,
    sample,
    fixtures:fixtures.size,
    brier:sample?Number((bs/sample).toFixed(5)):null,
    simulatedBets,
    flatStakePL:Number(pnl.toFixed(2)),
    roi:simulatedBets?Number((pnl/simulatedBets*100).toFixed(2)):null,
    clvSamples,
    avgCLV:clvSamples?Number((clv/clvSamples).toFixed(2)):null
  };
}

export function temporalFixtureSplit(rows,fraction=CHALLENGER_VALIDATION_POLICY.trainFraction){
  const valid=[],invalid=[];
  for(let i=0;i<(rows||[]).length;i++){
    const r=rows[i],time=n(r?._eventTime),fixtureKey=r?._fixtureKey??r?.fixtureId;
    if(!(time>0)||fixtureKey===null||fixtureKey===undefined||fixtureKey===''){invalid.push(r);continue}
    valid.push({...r,_eventTime:time,_fixtureKey:String(fixtureKey)});
  }
  const groups=new Map();
  for(const r of valid){const g=groups.get(r._fixtureKey)||{key:r._fixtureKey,time:r._eventTime,rows:[]};g.time=Math.min(g.time,r._eventTime);g.rows.push(r);groups.set(r._fixtureKey,g)}
  const ordered=[...groups.values()].sort((a,b)=>a.time-b.time||a.key.localeCompare(b.key));
  if(ordered.length<2)return{train:[],holdout:[],trainFixtures:0,holdoutFixtures:0,invalidTemporalRows:invalid.length,splitAt:null};
  const raw=Math.floor(ordered.length*Math.max(.5,Math.min(.85,fraction))),cut=Math.max(1,Math.min(ordered.length-1,raw));
  const trainGroups=ordered.slice(0,cut),holdoutGroups=ordered.slice(cut),train=trainGroups.flatMap(g=>g.rows),holdout=holdoutGroups.flatMap(g=>g.rows);
  return{train,holdout,trainFixtures:trainGroups.length,holdoutFixtures:holdoutGroups.length,invalidTemporalRows:invalid.length,splitAt:new Date(holdoutGroups[0].time).toISOString()};
}

function seeded(seed=2166136261){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function quantile(sorted,q){if(!sorted.length)return null;const x=(sorted.length-1)*q,lo=Math.floor(x),hi=Math.ceil(x);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(x-lo)}

export function pairedFixtureBrier(rows,c,reps=CHALLENGER_VALIDATION_POLICY.bootstrapReps){
  const groups=new Map();
  for(let i=0;i<(rows||[]).length;i++){
    const r=rows[i];if(!validScoringRow(r))continue;
    const p0=n(r.probability),p=applyChallenger(c,p0,rowMarketProbability(r)),y=String(r.outcome).toUpperCase()==='WIN'?1:0,d=(p-y)**2-(p0-y)**2,key=rowFixtureKey(r,i),g=groups.get(key)||[];g.push(d);groups.set(key,g);
  }
  const fixtureMeans=[...groups.values()].map(g=>g.reduce((a,b)=>a+b,0)/g.length),mean=fixtureMeans.length?fixtureMeans.reduce((a,b)=>a+b,0)/fixtureMeans.length:null;
  if(fixtureMeans.length<2||reps<1)return{method:'FIXTURE_BLOCK_BOOTSTRAP',fixtures:fixtureMeans.length,reps:0,meanDelta:mean==null?null:Number(mean.toFixed(6)),lower95:null,upper95:null};
  const rng=seeded((fixtureMeans.length*2654435761+String(c?.id||'').split('').reduce((s,ch)=>s+ch.charCodeAt(0),0))>>>0),means=[];
  for(let z=0;z<reps;z++){let sum=0;for(let i=0;i<fixtureMeans.length;i++)sum+=fixtureMeans[Math.floor(rng()*fixtureMeans.length)];means.push(sum/fixtureMeans.length)}
  means.sort((a,b)=>a-b);
  return{method:'FIXTURE_BLOCK_BOOTSTRAP',fixtures:fixtureMeans.length,reps,meanDelta:mean==null?null:Number(mean.toFixed(6)),lower95:Number(quantile(means,.025).toFixed(6)),upper95:Number(quantile(means,.975).toFixed(6))};
}

function blockersFor(x){
  const p=CHALLENGER_VALIDATION_POLICY,b=[];
  if(x.train.sample<p.minimumTrainSample)b.push('TRAIN_SAMPLE_INSUFFICIENT');
  if(x.holdout.sample<p.minimumHoldoutSample)b.push('HOLDOUT_SAMPLE_INSUFFICIENT');
  if(x.train.fixtures<p.minimumTrainFixtures)b.push('TRAIN_FIXTURES_INSUFFICIENT');
  if(x.holdout.fixtures<p.minimumHoldoutFixtures)b.push('HOLDOUT_FIXTURES_INSUFFICIENT');
  if(!(x.trainImprovementPct>=p.minimumBrierImprovementPct))b.push('TRAIN_BRIER_GAIN_BELOW_FLOOR');
  if(!(x.holdoutImprovementPct>=p.minimumBrierImprovementPct))b.push('HOLDOUT_BRIER_GAIN_BELOW_FLOOR');
  if(!(x.holdoutBrierCI?.upper95<0))b.push('HOLDOUT_BRIER_GAIN_NOT_STATISTICALLY_SEPARATED');
  if(x.holdout.simulatedBets<p.minimumHoldoutSimulatedBets)b.push('HOLDOUT_BET_SAMPLE_INSUFFICIENT');
  if(!(x.holdout.roi>=0))b.push('HOLDOUT_ROI_NOT_POSITIVE');
  if(x.holdout.clvSamples<p.minimumHoldoutClvSamples)b.push('HOLDOUT_CLV_SAMPLE_INSUFFICIENT');
  if(!(x.holdout.avgCLV>=0))b.push('HOLDOUT_CLV_NOT_POSITIVE');
  return b;
}

export function evaluateChallengers(rows){
  const split=temporalFixtureSplit(rows),baseline=scoreChallenger(rows),trainBaseline=scoreChallenger(split.train),holdoutBaseline=scoreChallenger(split.holdout),evaluations=generateChallengers().map(c=>{
    const full=scoreChallenger(rows,c),train=scoreChallenger(split.train,c),holdout=scoreChallenger(split.holdout,c),holdoutBrierCI=pairedFixtureBrier(split.holdout,c),x={...c,full,train,holdout,trainImprovementPct:improvementPct(trainBaseline,train),holdoutImprovementPct:improvementPct(holdoutBaseline,holdout),holdoutBrierCI};
    const blockers=blockersFor(x);return{...x,status:blockers.length?'HOLD':'VALIDATED_HOLDOUT',blockers};
  }).sort((a,b)=>(a.train.brier??9)-(b.train.brier??9));
  const approved=evaluations.filter(x=>x.status==='VALIDATED_HOLDOUT').sort((a,b)=>(b.holdoutImprovementPct??-Infinity)-(a.holdoutImprovementPct??-Infinity)).slice(0,CHALLENGER_VALIDATION_POLICY.maxApproved);
  return{baseline,trainBaseline,holdoutBaseline,split:{trainRows:split.train.length,holdoutRows:split.holdout.length,trainFixtures:split.trainFixtures,holdoutFixtures:split.holdoutFixtures,invalidTemporalRows:split.invalidTemporalRows,splitAt:split.splitAt},evaluations,approved};
}
