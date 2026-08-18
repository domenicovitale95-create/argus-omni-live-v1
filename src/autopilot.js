(function(){
  const STORAGE_KEY='argus-autopilot-state-v1',REL_KEY='argus-reliability-v1',REL_TTL=15*60*1000;
  const DEFAULTS={enabled:true,lastScanAt:null,lastHealthyAt:null,scanCount:0,errorCount:0};
  function read(){try{return{...DEFAULTS,...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch(_){return{...DEFAULTS}}}
  function write(next){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}catch(_){}return next}
  function recordScan(meta={}){const s=read();return write({...s,lastScanAt:new Date().toISOString(),lastHealthyAt:new Date().toISOString(),scanCount:(s.scanCount||0)+1,lastMeta:meta})}
  function recordError(message){const s=read();return write({...s,errorCount:(s.errorCount||0)+1,lastError:String(message||'Unknown error'),lastErrorAt:new Date().toISOString()})}
  function status(){return read()}
  function relRow(){try{return JSON.parse(localStorage.getItem(REL_KEY)||'null')}catch(_){return null}}
  function relData(){return relRow()?.data||null}
  function relWrite(data){try{localStorage.setItem(REL_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(_){}return data}
  function leagueProfile(match){return relData()?.league?.[match?.competition||'UNKNOWN']||null}
  function adjustment(match,analysis){const p=leagueProfile(match);if(!p||p.status==='UNVALIDATED')return{penalty:0,weight:1,status:p?.status||'UNVALIDATED',sample:p?.sample||0,reason:p?.reason||'No validated reliability profile'};let penalty=Number(p.penalty)||0;if(String(analysis?.phase||'')==='LIVE'){const phase=relData()?.phase?.LIVE;if(phase?.penalty)penalty=Math.max(penalty,Number(phase.penalty)||0)}return{penalty,weight:Number(p.weight)||1,status:p.status,sample:p.sample||0,score:p.score??null,roi:p.roi??null,avgCLV:p.avgCLV??null,reason:p.reason}}
  async function refreshReliability(force=false){const row=relRow();if(!force&&row&&Date.now()-row.savedAt<REL_TTL)return row.data;try{const r=await fetch('/api/reliability',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Reliability unavailable');return relWrite(j)}catch(e){recordError(e?.message||e);return row?.data||null}}
  window.ArgusAutopilot={status,recordScan,recordError,refreshReliability};
  window.ArgusReliability={read:relData,refresh:refreshReliability,leagueProfile,adjustment};
  refreshReliability(false);
})();