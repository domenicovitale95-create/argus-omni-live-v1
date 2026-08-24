const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number(v)));
const finite=v=>Number.isFinite(Number(v));
const EPS=1e-6;
const logit=p=>Math.log(clamp(p,EPS,1-EPS)/(1-clamp(p,EPS,1-EPS)));
const sigmoid=x=>1/(1+Math.exp(-x));

function marketWeight({source,dataQuality,liveIntegrity}={}){
  if(String(source||'').toUpperCase()==='LIVE_V2'&&liveIntegrity?.marketCalibrated)return 0;
  const q=clamp(finite(dataQuality)?Number(dataQuality)/100:.6,0,1);
  let w=String(source||'').toUpperCase()==='POISSON_90D'?.52:.42;
  if(q>=.85)w-=.10;
  else if(q>=.75)w-=.06;
  else if(q<.60)w+=.10;
  else if(q<.70)w+=.05;
  return clamp(w,.25,.62);
}

function fuseModelWithMarket({modelProbability,marketProbability,source,dataQuality,liveIntegrity}={}){
  const model=finite(modelProbability)?clamp(Number(modelProbability),EPS,1-EPS):null;
  const market=finite(marketProbability)?clamp(Number(marketProbability),EPS,1-EPS):null;
  if(model==null)return{probability:null,mode:'NO_MODEL',modelWeight:0,marketWeight:0,rawEdgePct:null,fusedEdgePct:null,edgeRetentionPct:null};
  if(market==null)return{probability:model,mode:'MODEL_ONLY_NO_MARKET',modelWeight:1,marketWeight:0,rawEdgePct:null,fusedEdgePct:null,edgeRetentionPct:null};
  const mw=marketWeight({source,dataQuality,liveIntegrity}),modelW=1-mw;
  const probability=mw===0?model:clamp(sigmoid(modelW*logit(model)+mw*logit(market)),EPS,1-EPS);
  const rawEdge=(model-market)*100,fusedEdge=(probability-market)*100;
  const retention=Math.abs(rawEdge)>1e-9?Math.abs(fusedEdge/rawEdge)*100:100;
  return{
    probability,
    mode:mw===0?'ALREADY_MARKET_CALIBRATED':'BENTER_LOGIT_SHRINKAGE_V1',
    modelWeight:+modelW.toFixed(4),
    marketWeight:+mw.toFixed(4),
    rawEdgePct:+rawEdge.toFixed(4),
    fusedEdgePct:+fusedEdge.toFixed(4),
    edgeRetentionPct:+retention.toFixed(1),
    conservativePrior:true,
    trainedSecondStage:false
  };
}

export{fuseModelWithMarket,marketWeight};
