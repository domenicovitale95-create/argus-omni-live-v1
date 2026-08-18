(function(){
  const KEY='argus-reliability-v1',TTL=15*60*1000;
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
  function write(data){try{localStorage.setItem(KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(_){}return data}
  function data(){return read()?.data||null}
  function leagueProfile(match){return data()?.league?.[match?.competition||'UNKNOWN']||null}
  function adjustment(match,analysis){const p=leagueProfile(match);if(!p||p.status==='UNVALIDATED')return{penalty:0,weight:1,status:p?.status||'UNVALIDATED',sample:p?.sample||0,reason:p?.reason||'No validated reliability profile'};let penalty=Number(p.penalty)||0;if(String(analysis?.phase||'')==='LIVE'){const phase=data()?.phase?.LIVE;if(phase?.penalty)penalty=Math.max(penalty,Number(phase.penalty)||0)}return{penalty,weight:Number(p.weight)||1,status:p.status,sample:p.sample||0,score:p.score??null,roi:p.roi??null,avgCLV:p.avgCLV??null,reason:p.reason}}
  async function refresh(force=false){const row=read();if(!force&&row&&Date.now()-row.savedAt<TTL)return row.data;try{const r=await fetch('/api/reliability',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Reliability unavailable');return write(j)}catch(_){return row?.data||null}}
  window.ArgusReliability={read:data,refresh,leagueProfile,adjustment};refresh(false);
})();