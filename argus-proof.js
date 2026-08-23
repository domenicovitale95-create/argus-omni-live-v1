(()=>{
  const $=id=>document.getElementById(id);
  const pct=(v,max)=>Math.max(0,Math.min(100,max?Number(v||0)/max*100:0));
  const num=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
  const signed=(v,d=1)=>Number.isFinite(Number(v))?`${Number(v)>0?'+':''}${Number(v).toFixed(d)}%`:'—';
  const statusMeta=s=>{
    const x=String(s||'BUILDING_EVIDENCE').toUpperCase();
    if(x==='STATISTICALLY_VALIDATED')return{label:'STATISTICALLY VALIDATED',state:'validated'};
    if(x==='PROVISIONALLY_VALIDATED')return{label:'PROVISIONAL',state:'provisional'};
    if(x==='PROMISING')return{label:'PROMISING',state:'promising'};
    return{label:'BUILDING EVIDENCE',state:'building'};
  };
  function setText(id,value){const el=$(id);if(el)el.textContent=value}
  function setWidth(id,value){const el=$(id);if(el)el.style.width=`${Math.max(0,Math.min(100,value))}%`}
  function render(j){
    const a=j?.assessment||{},f=j?.facts||{},ci=f?.confidenceInterval95||{},clv=f?.clv||{},period=f?.period||{},div=f?.diversification||{};
    const meta=statusMeta(a.status),badge=$('proofStatus');if(badge){badge.textContent=meta.label;badge.dataset.state=meta.state}
    setText('proofSettled',`${f.sample??0}`);setText('proofSettledSub','of 1,000 settled');
    setText('proofDays',`${Math.floor(Number(period.elapsedDays)||0)}`);setText('proofDaysSub','of 90 days');
    setText('proofRoi',signed(f.flatStakeRoiPct,1));setText('proofRoiSub','flat-stake ROI');
    const lower=Number.isFinite(Number(ci.lower95))?signed(ci.lower95,1):'—';
    const upper=Number.isFinite(Number(ci.upper95))?signed(ci.upper95,1):'—';
    setText('proofCi',lower==='—'?'—':`${lower} / ${upper}`);setText('proofCiSub','95% lower / upper');
    setText('proofClv',signed(clv.meanPct,2));setText('proofClvSub',`${clv.sample??0} / 300 near-close`);
    setText('proofSampleProgress',`${f.sample??0} / 1000`);setWidth('proofSampleFill',pct(f.sample,1000));
    setText('proofDayProgress',`${Math.floor(Number(period.elapsedDays)||0)} / 90`);setWidth('proofDayFill',pct(period.elapsedDays,90));
    setText('proofClvProgress',`${clv.sample??0} / 300`);setWidth('proofClvFill',pct(clv.sample,300));
    setText('proofMeta',`${div.competitions??0} competitions · ${div.marketFamilies??0} market families · max drawdown ${num(f.maxDrawdownUnits,2)}u`);
    const note=$('proofNote');if(note){note.classList.remove('argus-proof-error');note.textContent=a.statisticallyValidated?'Forward paper evidence has passed ARGUS validation thresholds. Future profit is never guaranteed.':'Prospective paper evidence only. ARGUS will not call itself validated until every threshold is passed.'}
  }
  function fail(){const note=$('proofNote');if(note){note.classList.add('argus-proof-error');note.textContent='Proof data temporarily unavailable. The validation process continues in the background.'}}
  async function load(){
    try{const r=await fetch('/api/profitability-proof',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);render(await r.json())}catch(_){fail()}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
  let timer=setInterval(()=>{if(!document.hidden)load()},300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
