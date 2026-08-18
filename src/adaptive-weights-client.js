(function(){
  const KEY='argus-adaptive-weights-v1';
  const MAX_AGE=15*60*1000;
  const FALLBACK={version:'BASELINE',generatedAt:null,league:{},phase:{},classification:{},confidence:{},policy:{minMultiplier:.78,maxMultiplier:1.04,primeUnlock:false}};
  function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&x.payload?x:null}catch(_){return null}}
  function save(payload){try{localStorage.setItem(KEY,JSON.stringify({savedAt:Date.now(),payload}))}catch(_){}return payload}
  async function refresh(force=false){const cached=read();if(!force&&cached&&Date.now()-cached.savedAt<MAX_AGE)return cached.payload;try{const r=await fetch('/api/adaptive-weights',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Adaptive weights unavailable');return save(j)}catch(_){return cached?.payload||FALLBACK}}
  function payload(){return read()?.payload||FALLBACK}
  function profile(group,key){return payload()?.[group]?.[key]||null}
  function boundedMultiplier(match,phase){const p=payload(),min=Number(p?.policy?.minMultiplier)||.78,max=Number(p?.policy?.maxMultiplier)||1.04,vals=[];const league=profile('league',match?.competition||'UNKNOWN'),phaseP=profile('phase',phase||'UNKNOWN');if(league?.multiplier)vals.push(Number(league.multiplier));if(phaseP?.multiplier)vals.push(Number(phaseP.multiplier));if(!vals.length)return{multiplier:1,status:'BASELINE',sources:[]};const raw=Math.min(...vals);const multiplier=Math.max(min,Math.min(max,raw));const statuses=[league?.status,phaseP?.status].filter(Boolean);return{multiplier,status:statuses.includes('DEGRADED')?'DEGRADED':statuses.includes('CAUTION')?'CAUTION':statuses.includes('RECOVERING')?'RECOVERING':statuses.includes('VALIDATING_POSITIVE')?'VALIDATING_POSITIVE':'NEUTRAL',sources:[league&&{type:'league',key:match?.competition||'UNKNOWN',...league},phaseP&&{type:'phase',key:phase||'UNKNOWN',...phaseP}].filter(Boolean)}}
  window.ArgusAdaptiveWeights={refresh,payload,profile,boundedMultiplier};
  refresh(false);
})();