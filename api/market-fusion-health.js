import { fuseModelWithMarket } from './_market-fusion.js';

const EPS=1e-9;
const between=(x,a,b)=>x>=Math.min(a,b)-EPS&&x<=Math.max(a,b)+EPS;

function evaluate(){
  const high=fuseModelWithMarket({modelProbability:.60,marketProbability:.50,source:'PREMATCH_MODEL',dataQuality:90});
  const low=fuseModelWithMarket({modelProbability:.60,marketProbability:.50,source:'POISSON_90D',dataQuality:65});
  const live=fuseModelWithMarket({modelProbability:.60,marketProbability:.50,source:'LIVE_V2',dataQuality:80,liveIntegrity:{marketCalibrated:true}});
  const noMarket=fuseModelWithMarket({modelProbability:.60,marketProbability:null,source:'PREMATCH_MODEL',dataQuality:90});
  const negative=fuseModelWithMarket({modelProbability:.45,marketProbability:.55,source:'PREMATCH_MODEL',dataQuality:90});
  const checks=[
    {name:'FUSED_BETWEEN_MODEL_AND_MARKET',ok:between(high.probability,.50,.60)},
    {name:'LOWER_QUALITY_SHRINKS_MORE',ok:Math.abs(low.probability-.50)<Math.abs(high.probability-.50)},
    {name:'LIVE_ALREADY_CALIBRATED_UNCHANGED',ok:Math.abs(live.probability-.60)<EPS&&live.marketWeight===0},
    {name:'MISSING_MARKET_FALLS_BACK_TO_MODEL',ok:Math.abs(noMarket.probability-.60)<EPS&&noMarket.mode==='MODEL_ONLY_NO_MARKET'},
    {name:'NEGATIVE_EDGE_SIGN_PRESERVED',ok:negative.probability<.55&&negative.probability>.45},
    {name:'HIGH_QUALITY_EDGE_REMAINS_CONSERVATIVE',ok:high.fusedEdgePct>0&&high.fusedEdgePct<high.rawEdgePct},
    {name:'WEAK_MODEL_EDGE_REDUCED_MORE',ok:low.edgeRetentionPct<high.edgeRetentionPct}
  ];
  return{checks,examples:{highQualityPrematch:high,lowerQualityPoisson:low,marketCalibratedLive:live,noMarket,negativeEdge:negative}};
}

export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const result=evaluate(),failures=result.checks.filter(x=>!x.ok);
  return res.status(failures.length?500:200).json({version:'MARKET-FUSION-HEALTH-1',generatedAt:new Date().toISOString(),status:failures.length?'FAIL':'HEALTHY',failures,...result,policy:{readOnly:true,deterministic:true,providerCalls:0,validatesConservativeFusionInvariants:true}});
}
