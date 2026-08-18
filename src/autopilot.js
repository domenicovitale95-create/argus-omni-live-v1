(function(){
  const STORAGE_KEY='argus-autopilot-state-v1';
  const DEFAULTS={enabled:true,lastScanAt:null,lastHealthyAt:null,scanCount:0,errorCount:0};
  function read(){try{return{...DEFAULTS,...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch(_){return{...DEFAULTS}}}
  function write(next){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}catch(_){}return next}
  function recordScan(meta={}){const s=read();return write({...s,lastScanAt:new Date().toISOString(),lastHealthyAt:new Date().toISOString(),scanCount:(s.scanCount||0)+1,lastMeta:meta})}
  function recordError(message){const s=read();return write({...s,errorCount:(s.errorCount||0)+1,lastError:String(message||'Unknown error'),lastErrorAt:new Date().toISOString()})}
  function status(){return read()}
  window.ArgusAutopilot={status,recordScan,recordError};
})();
