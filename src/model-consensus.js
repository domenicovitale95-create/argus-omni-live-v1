(function(){
  const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  function normalize(model){if(!model)return null;const h=Math.max(0,num(model.home)??0),d=Math.max(0,num(model.draw)??0),a=Math.max(0,num(model.away)??0),s=h+d+a;return s>0?{home:h/s,draw:d/s,away:a/s}:null}
  function vectorDistance(a,b){a=normalize(a);b=normalize(b);if(!a||!b)return null;return (Math.abs(a.home-b.home)+Math.abs(a.draw-b.draw)+Math.abs(a.away-b.away))/3}
  function evaluate1X2({provider,history,market,finalModel,phase='PREMATCH'}={}){
    const sources=[['PROVIDER',normalize(provider)],['HISTORY_POISSON',normalize(history)],['MARKET_NO_VIG',normalize(market)],['FINAL_MODEL',normalize(finalModel)]].filter(x=>x[1]);
    const pairs=[];for(let i=0;i<sources.length;i++)for(let j=i+1;j<sources.length;j++){const d=vectorDistance(sources[i][1],sources[j][1]);if(d!=null)pairs.push({a:sources[i][0],b:sources[j][0],distance:d})}
    const avg=pairs.length?pairs.reduce((s,x)=>s+x.distance,0)/pairs.length:null,max=pairs.length?Math.max(...pairs.map(x=>x.distance)):null;
    let score=sources.length<=1?35:Math.round(clamp(1-(avg??.3)/.22)*100),status='LOW_EVIDENCE',blockPromotion=false,penalty=0;
    if(sources.length>=3){if((max??0)>=.20||(avg??0)>=.14){status='MODEL_CONFLICT';blockPromotion=true;penalty=18}else if((max??0)>=.13||(avg??0)>=.09){status='DIVERGENT';penalty=9}else if((avg??1)<=.045){status='STRONG_CONSENSUS'}else status='CONSENSUS'}
    else if(sources.length===2){status=(avg??1)<=.06?'CONSENSUS':'DIVERGENT';if(status==='DIVERGENT')penalty=7}
    return{version:'CONSENSUS-2',phase,sources:sources.map(x=>x[0]),sourceCount:sources.length,pairs:pairs.map(x=>({...x,distancePct:Number((x.distance*100).toFixed(1))})),averageDistancePct:avg==null?null:Number((avg*100).toFixed(1)),maxDistancePct:max==null?null:Number((max*100).toFixed(1)),score,status,penalty,blockPromotion};
  }
  function evaluateScalar({rawProbability,calibratedProbability,marketProbability,trainingStatus='LEARNING'}={}){
    const src=[];const r=num(rawProbability),c=num(calibratedProbability),m=num(marketProbability);if(r!=null)src.push(['RAW_MODEL',r]);if(c!=null)src.push(['CALIBRATED',c]);if(m!=null)src.push(['MARKET_NO_VIG',m]);
    const pairs=[];for(let i=0;i<src.length;i++)for(let j=i+1;j<src.length;j++)pairs.push({a:src[i][0],b:src[j][0],distance:Math.abs(src[i][1]-src[j][1])});
    const avg=pairs.length?pairs.reduce((s,x)=>s+x.distance,0)/pairs.length:null,max=pairs.length?Math.max(...pairs.map(x=>x.distance)):null;
    let status='LOW_EVIDENCE',penalty=0,blockPromotion=false,score=src.length<=1?35:Math.round(clamp(1-(avg??.3)/.20)*100);
    if(src.length>=3){if((max??0)>=.18||(avg??0)>=.12){status='MODEL_CONFLICT';penalty=16;blockPromotion=true}else if((max??0)>=.11||(avg??0)>=.075){status='DIVERGENT';penalty=8}else if((avg??1)<=.035)status='STRONG_CONSENSUS';else status='CONSENSUS'}else if(src.length===2){status=(avg??1)<=.055?'CONSENSUS':'DIVERGENT';if(status==='DIVERGENT')penalty=6}
    if(String(trainingStatus).toUpperCase()==='DEGRADED'){status='MODEL_CONFLICT';penalty=Math.max(penalty,16);blockPromotion=true}
    return{version:'CONSENSUS-2',sources:src.map(x=>x[0]),sourceCount:src.length,averageDistancePct:avg==null?null:Number((avg*100).toFixed(1)),maxDistancePct:max==null?null:Number((max*100).toFixed(1)),score,status,penalty,blockPromotion};
  }
  window.ArgusModelConsensus={evaluate1X2,evaluateScalar,vectorDistance};
})();
