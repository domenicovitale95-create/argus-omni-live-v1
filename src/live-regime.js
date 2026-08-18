(function(){
  const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,v));
  const safe=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const sideKey=x=>x==='HOME'?'home':x==='DRAW'?'draw':x==='AWAY'?'away':null;
  function baseline(match){
    try{
      if(!window.ArgusEngine?.analyzePreMatch)return null;
      const a=window.ArgusEngine.analyzePreMatch({...match,isLive:false});
      return a?.baseModel||a?.model||null;
    }catch(_){return null}
  }
  function scoreState(match,side){const h=safe(match?.score?.home),a=safe(match?.score?.away);if(side==='home')return Math.sign(h-a);if(side==='away')return Math.sign(a-h);return h===a?1:-1}
  function pressureAlignment(live,side){const p=safe(live?.pressure,50);if(side==='home')return (p-50)/50;if(side==='away')return (50-p)/50;return 1-Math.abs(p-50)/25}
  function evaluate(match,live){
    if(!match?.isLive||live?.phase!=='LIVE')return{status:'NOT_LIVE',score:50,penalty:0,blockPromotion:false,reason:'Regime analysis applies only in live state'};
    const side=sideKey(live?.bestMarket),pre=baseline(match),minute=clamp(safe(match?.minute),0,95);
    if(!side||!pre)return{status:'UNKNOWN',score:50,penalty:4,blockPromotion:true,reason:'No defensible pre-match baseline for regime comparison'};
    const preP=safe(pre[side]),liveP=safe(live?.baseModel?.[side]??live?.model?.[side]),delta=(liveP-preP)*100,pressure=pressureAlignment(live,side),score=scoreState(match,side);
    let regimeScore=50+delta*2.2+pressure*18+score*(minute>=55?16:10);
    regimeScore=clamp(Math.round(regimeScore));
    let status='STABLE',penalty=0,blockPromotion=false,reason='Live state broadly consistent with the pre-match thesis';
    if(regimeScore<=25){status='REVERSAL';penalty=18;blockPromotion=true;reason='Live state materially contradicts the pre-match thesis'}
    else if(regimeScore<=40){status='BROKEN';penalty=10;blockPromotion=true;reason='Pre-match thesis has weakened materially in live play'}
    else if(regimeScore>=72){status='STRENGTHENED';reason='Live state supports the pre-match thesis; no automatic promotion allowed'}
    return{status,score:regimeScore,penalty,blockPromotion,side:side.toUpperCase(),prematchProbability:Number((preP*100).toFixed(1)),liveProbability:Number((liveP*100).toFixed(1)),probabilityDelta:Number(delta.toFixed(1)),pressureAlignment:Number(pressure.toFixed(2)),scoreAlignment:score,minute,reason};
  }
  window.ArgusLiveRegime={evaluate};
})();