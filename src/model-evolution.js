(function(){
  const KEY='argus-model-evolution-v1',TTL=30*60*1000,FALLBACK={champion:'BASELINE',candidates:[],registry:{history:[]}};
  const clamp=(v,min=.01,max=.99)=>Math.max(min,Math.min(max,v));
  function readRow(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
  function save(payload){try{localStorage.setItem(KEY,JSON.stringify({savedAt:Date.now(),payload}))}catch(_){}return payload}
  function payload(){return readRow()?.payload||FALLBACK}
  async function refresh(force=false){const row=readRow();if(!force&&row&&Date.now()-row.savedAt<TTL)return row.payload;try{const r=await fetch('/api/model-evolution',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Model evolution unavailable');return save(j)}catch(_){return row?.payload||FALLBACK}}
  function apply(probability,marketProbability=null){const p=Number(probability);if(!Number.isFinite(p))return{rawProbability:probability,evolvedProbability:probability,champion:'BASELINE',applied:false};const name=payload()?.champion||'BASELINE',mp=Number(marketProbability);let out=p;if(name==='CONSERVATIVE')out=.5+(p-.5)*.90;else if(name==='DEFENSIVE')out=.5+(p-.5)*.82;else if(name==='MARKET_AWARE'&&Number.isFinite(mp))out=p*.75+mp*.25;out=clamp(out);return{rawProbability:p,evolvedProbability:out,champion:name,applied:name!=='BASELINE',delta:Number(((out-p)*100).toFixed(2))}}
  function status(){const p=payload();return{champion:p.champion||'BASELINE',history:p.registry?.history||[],candidates:p.candidates||[],promoted:Boolean(p.promoted)}}
  window.ArgusModelEvolution={refresh,payload,apply,status};refresh(false);
})();
