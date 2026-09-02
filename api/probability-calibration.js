import { listJson, readManyJson, storageReady } from './_report-store.js';
import { dedupeShadowFixtures } from './_shadow-fixture-dedupe.js';

function num(v){const x=Number(v);return Number.isFinite(x)?x:null}
function bucket(p){const n=num(p);if(n==null)return'UNKNOWN';const pc=Math.max(0,Math.min(99.999,n*100));const lo=Math.floor(pc/5)*5;return `${lo}-${lo+5}`}
function canonical(v){return String(v||'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'UNKNOWN'}
function add(map,key,p,outcome){if(!map[key])map[key]={n:0,sumP:0,wins:0,brier:0};const a=map[key],y=outcome==='WIN'?1:0;a.n++;a.sumP+=p;a.wins+=y;a.brier+=(p-y)**2}
function profile(a){const avg=a.sumP/a.n,obs=a.wins/a.n,delta=obs-avg;let shrink=0,status='UNVALIDATED';if(a.n>=20){status='LEARNING';shrink=Math.min(.25,(a.n-20)/160)}if(a.n>=60){status='VALIDATED';shrink=Math.min(.45,.20+(a.n-60)/300)}let adj=delta*shrink;if(adj>0){const positiveCap=a.n>=100?.02:a.n>=60?.01:0;adj=Math.min(adj,positiveCap)}else adj=Math.max(adj,-.04);return{sample:a.n,averagePredicted:Number(avg.toFixed(4)),observedRate:Number(obs.toFixed(4)),calibrationGapPct:Number((delta*100).toFixed(1)),brier:Number((a.brier/a.n).toFixed(4)),status,shrinkage:Number(shrink.toFixed(3)),governedAdjustment:Number(adj.toFixed(4)),direction:delta>0.025?'UNDERCONFIDENT':delta<-.025?'OVERCONFIDENT':'WELL_CALIBRATED'}}
function finish(map){return Object.fromEntries(Object.entries(map).map(([k,v])=>[k,profile(v)]))}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!storageReady())return res.status(503).json({error:'Calibration storage unavailable'});
 const blobs=await listJson('argus/shadow/',240),books=await readManyJson(blobs),canonicalView=dedupeShadowFixtures(books),marketBucket={},market={},globalBucket={},sourceMarket={},sourceMarketBucket={},sourceTotals={};let settled=0;
 for(const fixture of canonicalView.fixtures)for(const pick of fixture.picks||[]){
  if(!['WIN','LOSS'].includes(pick.outcome))continue;
  const p=num(pick.probability);if(p==null||p<=0||p>=1)continue;
  const mk=canonical(pick.key),b=bucket(p),source=canonical(pick.probabilitySource||pick.sourceClass||'UNKNOWN');
  add(marketBucket,`${mk}|||${b}`,p,pick.outcome);add(market,mk,p,pick.outcome);add(globalBucket,b,p,pick.outcome);
  add(sourceMarket,`${source}|||${mk}`,p,pick.outcome);add(sourceMarketBucket,`${source}|||${mk}|||${b}`,p,pick.outcome);sourceTotals[source]=(sourceTotals[source]||0)+1;settled++;
 }
 return res.status(200).json({version:'PROBABILITY-CALIBRATION-3-SOURCE',generatedAt:new Date().toISOString(),settled,canonicalShadowEvidence:canonicalView.diagnostics,policy:{bucketWidthPct:5,minimumSample:20,validatedSample:60,positiveAdjustmentRequires:60,strongPositiveRequires:100,maxPositiveAdjustment:.02,maxNegativeAdjustment:.04,sourceSegmentation:true,prospectiveFrozenEvidenceOnly:true,fixtureIdentityCanonicalized:true,duplicatePolicy:canonicalView.policy,rule:'Calibration may correct probability modestly; source-specific evidence is preferred for model correction. Negative corrections are allowed earlier than positive corrections. It never bypasses PRIME governance.'},sourceTotals,sourceMarket:finish(sourceMarket),sourceMarketBucket:finish(sourceMarketBucket),marketBucket:finish(marketBucket),market:finish(market),globalBucket:finish(globalBucket)})
}
