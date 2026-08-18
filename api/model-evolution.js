import { listJson, readManyJson, readJson, writeJson, storageReady } from './_report-store.js';

const REGISTRY='argus/model-evolution/registry.json';
const clamp=(v,min=.01,max=.99)=>Math.max(min,Math.min(max,v));
function brier(p,y){return (p-y)**2}
function transform(name,p,marketProb){
  if(name==='BASELINE') return clamp(p);
  if(name==='CONSERVATIVE') return clamp(.5+(p-.5)*.90);
  if(name==='MARKET_AWARE' && Number.isFinite(marketProb)) return clamp(p*.75+marketProb*.25);
  if(name==='MARKET_AWARE') return clamp(p);
  if(name==='DEFENSIVE') return clamp(.5+(p-.5)*.82);
  return clamp(p);
}
function scoreCandidate(rows,name){
  let n=0,bs=0,cal=0,priced=0,pl=0,clvN=0,clv=0;
  for(const r of rows){const p0=Number(r.probability);if(!(p0>0&&p0<1)||!['WIN','LOSS'].includes(r.outcome))continue;const y=r.outcome==='WIN'?1:0,mp=Number(r.odds)>1?1/Number(r.odds):null,p=transform(name,p0,mp);n++;bs+=brier(p,y);cal+=Math.abs(p-y);if(Number(r.odds)>1){priced++;const edge=p-1/Number(r.odds);if(edge>=.03)pl+=y?(Number(r.odds)-1):-1}if(Number.isFinite(Number(r.clv))){clvN++;clv+=Number(r.clv)}}
  return {name,sample:n,brier:n?Number((bs/n).toFixed(4)):null,meanAbsError:n?Number((cal/n).toFixed(4)):null,priced,simulatedFlatPL:Number(pl.toFixed(2)),simulatedROI:priced?Number((pl/priced*100).toFixed(2)):null,avgCLV:clvN?Number((clv/clvN).toFixed(2)):null,clvSamples:clvN};
}
function eligiblePromotion(champion,challenger){if(!champion||!challenger||challenger.sample<120)return{eligible:false,reason:'MINIMUM_SAMPLE_120'};if(challenger.brier==null||champion.brier==null)return{eligible:false,reason:'MISSING_BRIER'};const improve=(champion.brier-challenger.brier)/champion.brier;const roiOK=challenger.simulatedROI==null||challenger.simulatedROI>=-2;const clvOK=challenger.avgCLV==null||challenger.avgCLV>=0;return {eligible:improve>=.02&&roiOK&&clvOK,reason:improve>=.02?(roiOK&&clvOK?'PASSED':'ROI_OR_CLV_FAIL'):'BRIER_IMPROVEMENT_LT_2PCT',brierImprovementPct:Number((improve*100).toFixed(2))}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Model evolution storage unavailable'});
  const blobs=await listJson('argus/shadow/',240),books=await readManyJson(blobs),rows=[];
  for(const b of books)for(const f of Object.values(b.fixtures||{}))for(const p of f.picks||[])if(['WIN','LOSS'].includes(p.outcome))rows.push(p);
  const names=['BASELINE','CONSERVATIVE','MARKET_AWARE','DEFENSIVE'],candidates=names.map(n=>scoreCandidate(rows,n));
  let registry=await readJson(REGISTRY,{version:'MODEL-EVOLUTION-1',champion:'BASELINE',history:[],updatedAt:null});
  const champion=candidates.find(x=>x.name===registry.champion)||candidates[0];
  const challengers=candidates.filter(x=>x.name!==champion.name).map(x=>({...x,promotion:eligiblePromotion(champion,x)})).sort((a,b)=>(a.brier??9)-(b.brier??9));
  const best=challengers[0];let promoted=false;
  if(best?.promotion?.eligible){registry.history.push({from:registry.champion,to:best.name,at:new Date().toISOString(),sample:best.sample,brierImprovementPct:best.promotion.brierImprovementPct,avgCLV:best.avgCLV,simulatedROI:best.simulatedROI});registry.champion=best.name;registry.updatedAt=new Date().toISOString();if(registry.history.length>50)registry.history=registry.history.slice(-50);await writeJson(REGISTRY,registry);promoted=true}
  return res.status(200).json({version:'MODEL-EVOLUTION-1',generatedAt:new Date().toISOString(),mode:'WALK_FORWARD_SHADOW',champion:registry.champion,promoted,candidates,challengers,registry:{history:registry.history,updatedAt:registry.updatedAt},policy:{minimumPromotionSample:120,minimumBrierImprovementPct:2,requiresNonNegativeCLV:true,maxAutomaticChange:'bounded probability transform only',rule:'No challenger may alter production probabilities until it beats the current champion on frozen out-of-sample shadow evidence. Automatic wagering is never authorized.'}})
}
