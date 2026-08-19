(function(){
  const KEY='argus-outcome-attribution-v2',TTL=15*60*1000;
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
  function write(data){try{localStorage.setItem(KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(_){}return data}
  function data(){return read()?.data||null}
  async function refresh(force=false){const row=read();if(!force&&row&&Date.now()-row.savedAt<TTL)return row.data;try{const r=await fetch('/api/outcome-attribution',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Outcome attribution unavailable');return write(j)}catch(_){return row?.data||null}}
  function profile(match,analysis){const d=data(),league=d?.league?.[match?.competition||'UNKNOWN']||null,phase=d?.phase?.[analysis?.phase||'UNKNOWN']||null;const candidates=[league,phase].filter(Boolean),worst=candidates.sort((a,b)=>(b.confidencePenalty||0)-(a.confidencePenalty||0))[0];return worst||{status:'UNVALIDATED',confidencePenalty:0,modelWeight:1,sample:0,reason:'No attribution profile'} }
  function install(){const base=window.ArgusReliability?.adjustment;if(typeof base!=='function')return false;if(base.__outcomeLearningWrapped)return true;const wrapped=function(match,analysis){const r=base.call(window.ArgusReliability,match,analysis)||{},o=profile(match,analysis);return{...r,penalty:Math.max(Number(r.penalty)||0,Number(o.confidencePenalty)||0),weight:Math.min(Number(r.weight)||1,Number(o.modelWeight)||1),outcomeLearningStatus:o.status||'UNVALIDATED',outcomeLearningSample:o.sample||0,outcomeLearningReason:o.reason||''}};wrapped.__outcomeLearningWrapped=true;window.ArgusReliability.adjustment=wrapped;return true}
  window.ArgusOutcomeLearning={read:data,refresh,profile,install};
  refresh(false).finally(()=>install());
  let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>20)clearInterval(timer)},250);
})();
