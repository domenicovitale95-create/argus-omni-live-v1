(function(){
  const KEY='argus-probability-calibration-v2',MAX=15*60*1000;
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
  function save(payload){try{localStorage.setItem(KEY,JSON.stringify({savedAt:Date.now(),payload}))}catch(_){}return payload}
  async function refresh(force=false){const row=read();if(!force&&row&&Date.now()-row.savedAt<MAX)return row.payload;try{const r=await fetch('/api/probability-calibration',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Calibration unavailable');return save(j)}catch(_){return row?.payload||null}}
  function payload(){return read()?.payload||null}
  function bucket(p){const pc=Math.max(0,Math.min(99.999,Number(p)*100)),lo=Math.floor(pc/5)*5;return `${lo}-${lo+5}`}
  function profile(marketKey,p){const data=payload();if(!data||!Number.isFinite(Number(p)))return null;const mk=String(marketKey||'UNKNOWN').toUpperCase();return data.marketBucket?.[`${mk}|||${bucket(p)}`]||data.market?.[mk]||data.globalBucket?.[bucket(p)]||null}
  function adjust(marketKey,p){const raw=Number(p);if(!Number.isFinite(raw))return{raw:p,calibrated:p,adjustment:0,status:'NO_DATA',profile:null};const prof=profile(marketKey,raw);if(!prof||Number(prof.sample)<20)return{raw,calibrated:raw,adjustment:0,status:prof?.status||'UNVALIDATED',profile:prof};const adj=Number(prof.governedAdjustment)||0,cal=Math.max(.01,Math.min(.99,raw+adj));return{raw,calibrated:cal,adjustment:adj,status:prof.status,profile:prof}}
  window.ArgusProbabilityCalibration={refresh,payload,profile,adjust};refresh(false);
})();