(()=>{
  const $=id=>document.getElementById(id);
  const hasNum=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const pct=(v,max)=>Math.max(0,Math.min(100,max&&hasNum(v)?Number(v)/max*100:0));
  const num=(v,d=1)=>hasNum(v)?Number(v).toFixed(d):'—';
  const signed=(v,d=1)=>hasNum(v)?`${Number(v)>0?'+':''}${Number(v).toFixed(d)}%`:'—';
  const statusMeta=s=>{
    const x=String(s||'BUILDING_EVIDENCE').toUpperCase();
    if(x==='STATISTICALLY_VALIDATED')return{label:'TEST PASSED',state:'validated'};
    if(x==='PROVISIONALLY_VALIDATED')return{label:'ALMOST READY',state:'provisional'};
    if(x==='PROMISING')return{label:'GOING WELL',state:'promising'};
    return{label:'STILL LEARNING',state:'building'};
  };
  function setText(id,value){const el=$(id);if(el)el.textContent=value}
  function setWidth(id,value){const el=$(id);if(el)el.style.width=`${Math.max(0,Math.min(100,value))}%`}
  function clarifyScope(){
    const heading=$('argus-proof-heading'),section=heading?.closest('.argus-proof');
    if(heading)heading.textContent='Is ARGUS officially validated?';
    const eyebrow=section?.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='ARGUS OFFICIAL VALIDATION';
    const sub=section?.querySelector('.argus-proof-sub');if(sub)sub.textContent='Only official paper bets count here. Shadow training bets are tracked separately.';
  }
  function render(j){
    const a=j?.assessment||{},f=j?.facts||{},ci=f?.confidenceInterval95||{},clv=f?.clv||{},period=f?.period||{},div=f?.diversification||{};
    const meta=statusMeta(a.status),badge=$('proofStatus');if(badge){badge.textContent=meta.label;badge.dataset.state=meta.state}
    setText('proofSettled',`${f.sample??0}`);setText('proofSettledSub','of 1,000 official finished bets');
    setText('proofDays',`${Math.floor(Number(period.elapsedDays)||0)}`);setText('proofDaysSub','of 90 official validation days');
    setText('proofRoi',signed(f.flatStakeRoiPct,1));setText('proofRoiSub','same virtual stake on official paper bets');
    const lower=hasNum(ci.lower95)?signed(ci.lower95,1):'—';
    const upper=hasNum(ci.upper95)?signed(ci.upper95,1):'—';
    setText('proofCi',lower==='—'||upper==='—'?'—':`${lower} / ${upper}`);setText('proofCiSub','possible low / high');
    setText('proofClv',signed(clv.meanPct,2));setText('proofClvSub',`${clv.sample??0} / 300 final odds`);
    setText('proofSampleProgress',`${f.sample??0} / 1000`);setWidth('proofSampleFill',pct(f.sample,1000));
    setText('proofDayProgress',`${Math.floor(Number(period.elapsedDays)||0)} / 90`);setWidth('proofDayFill',pct(period.elapsedDays,90));
    setText('proofClvProgress',`${clv.sample??0} / 300`);setWidth('proofClvFill',pct(clv.sample,300));
    setText('proofMeta',`${div.competitions??0} leagues · ${div.marketFamilies??0} bet types · biggest loss ${num(f.maxDrawdownUnits,2)}`);
    const note=$('proofNote');if(note){note.classList.remove('argus-proof-error');note.textContent=a.statisticallyValidated?'ARGUS passed its official long test. Future wins are never guaranteed.':'Official validation is still building. Shadow training does not count toward this 1,000-bet test.'}
  }
  function fail(){const note=$('proofNote');if(note){note.classList.add('argus-proof-error');note.textContent='Official validation results are temporarily unavailable. Shadow training continues separately.'}}
  async function load(){
    clarifyScope();
    try{const r=await fetch('/api/profitability-proof',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);render(await r.json())}catch(_){fail()}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
  let timer=setInterval(()=>{if(!document.hidden)load()},300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
