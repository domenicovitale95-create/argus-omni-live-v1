(function(){
  function persist(matches,meta){
    if(!Array.isArray(matches)||!matches.length)return;
    fetch('/api/market-memory',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({matches,meta}),keepalive:true})
      .then(r=>{if(!r.ok)throw new Error(`Market Memory HTTP ${r.status}`);if(window.ArgusAutopilot)window.ArgusAutopilot.recordScan(meta||{})})
      .catch(e=>{if(window.ArgusAutopilot)window.ArgusAutopilot.recordError(e?.message||e)});
  }
  function install(){
    const p=window.ArgusProviders;if(!p||p.__marketMemoryInstalled)return false;
    const original=p.live.bind(p);
    p.live=async function(options={}){const matches=await original(options);persist(matches,matches?.meta||null);return matches};
    p.persistMarketMemory=persist;p.__marketMemoryInstalled=true;return true;
  }
  if(!install()){
    let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer)},50);
  }
})();
