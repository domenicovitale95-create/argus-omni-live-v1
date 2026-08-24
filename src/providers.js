(function(){
  const CACHE_KEY='argus-live-cache-v7';
  const PREMATCH_TTL=60*1000,LIVE_TTL=45*1000,LATE_LIVE_TTL=30*1000,SAFE_TTL=90*1000,AVAILABILITY_WINDOW_MS=100*60*1000;
  const LIVE_REQUEST_TIMEOUT_MS=32000,AVAILABILITY_REQUEST_TIMEOUT_MS=8000;
  let liveInFlight=null;

  const finite=v=>Number.isFinite(Number(v))?Number(v):null;
  async function fetchWithTimeout(url,options={},timeoutMs=LIVE_REQUEST_TIMEOUT_MS){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
  function readCache(){try{const row=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!row||!Array.isArray(row.matches)||!row.savedAt)return null;return row}catch(_){return null}}
  function notifyDataUpdated(detail={}){try{document.dispatchEvent(new CustomEvent('argus:data-updated',{detail}))}catch(_){}}
  function sourceObservedAt(payload){
    const values=[payload?.meta?.fetchedAt,...(payload?.matches||[]).map(m=>m?.observedAt)].map(v=>new Date(v||0).getTime()).filter(v=>Number.isFinite(v)&&v>0);
    return values.length?new Date(Math.max(...values)).toISOString():null;
  }
  function writeCache(payload){
    const sourceAt=sourceObservedAt(payload);
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({matches:payload.matches||[],meta:payload.meta||null,savedAt:Date.now(),sourceObservedAt:sourceAt}))}catch(_){}
    notifyDataUpdated({matches:payload.matches||[],meta:payload.meta||null});
  }
  function quotaInfo(row){const q=row?.meta?.quota||{},remaining=finite(q.dailyRemaining),limit=finite(q.dailyLimit),reserve=finite(q.dynamicReserve);return{remaining,limit,reserve}}
  function desiredTtl(row,safeMode){const live=(row?.matches||[]).filter(m=>m?.isLive);if(!live.length)return PREMATCH_TTL;if(safeMode)return SAFE_TTL;return live.some(m=>Number(m?.minute)>=80)?LATE_LIVE_TTL:LIVE_TTL}
  function cacheStatus(){
    const row=readCache();if(!row)return{available:false,fresh:false,ageMs:null,sourceAgeMs:null,safeMode:false,ttlMs:null};
    const q=quotaInfo(row),threshold=q.reserve??(q.limit?Math.max(80,Math.ceil(q.limit*.02)):80),safeMode=q.remaining!=null&&q.remaining<=threshold,ttl=desiredTtl(row,safeMode);
    const storedAgeMs=Math.max(0,Date.now()-row.savedAt),sourceMs=new Date(row.sourceObservedAt||row.meta?.fetchedAt||0).getTime(),sourceAgeMs=Number.isFinite(sourceMs)&&sourceMs>0?Math.max(0,Date.now()-sourceMs):storedAgeMs;
    const live=(row.matches||[]).some(m=>m?.isLive),ageMs=live?sourceAgeMs:storedAgeMs;
    return{available:true,fresh:ageMs<ttl,ageMs,sourceAgeMs,safeMode,remaining:q.remaining,limit:q.limit,threshold,ttlMs:ttl,lateLive:(row.matches||[]).some(m=>m?.isLive&&Number(m?.minute)>=80)};
  }
  function providerStatus(meta={}){
    if(meta?.quota?.exhausted)return'DAILY_EXHAUSTED';
    if(meta?.degradedReason==='MINUTE_RATE_LIMIT'||meta?.quota?.minuteCooldownUntil)return'RATE_LIMITED';
    if(meta?.degraded||String(meta?.cache||'').toUpperCase()==='STALE')return'DEGRADED';
    return'HEALTHY';
  }
  function decorate(matches,meta,extra={}){const out=(matches||[]).map(m=>({...m,...(extra.dataStale?{dataStale:true}:{}),providerStatus:extra.providerStatus||providerStatus(meta)}));out.meta={...(meta||{}),...extra};return out}
  function cachedMatches(row,{stale=false,reason=null}={}){
    const status=cacheStatus(),meta={...(row?.meta||{}),clientCache:true,clientCacheAgeMs:status.ageMs,clientSourceAgeMs:status.sourceAgeMs,clientCacheTtlMs:status.ttlMs,staleFallback:Boolean(stale),actionableData:!stale,degraded:Boolean(stale)||Boolean(row?.meta?.degraded),degradedReason:reason||row?.meta?.degradedReason||null,providerStatus:stale?'STALE_FALLBACK':providerStatus(row?.meta)};
    return decorate(row?.matches||[],meta,{dataStale:stale,providerStatus:meta.providerStatus});
  }
  function availabilityIds(matches){const now=Date.now();return matches.filter(m=>{if(m?.isFinished)return false;if(m?.isLive)return true;const k=new Date(m?.kickoff||0).getTime();return Number.isFinite(k)&&k>0&&k-now<=AVAILABILITY_WINDOW_MS&&k-now>=-30*60*1000}).map(m=>Number(m.id)).filter(Boolean)}
  async function mergeAvailability(matches,meta){const ids=availabilityIds(matches);if(!ids.length)return{matches,meta};try{const date=encodeURIComponent(meta?.date||''),res=await fetchWithTimeout(`/api/availability?ids=${ids.join('-')}${date?`&date=${date}`:''}`,{headers:{Accept:'application/json'},cache:'no-store'},AVAILABILITY_REQUEST_TIMEOUT_MS);if(!res.ok)return{matches,meta};const data=await res.json(),map=data.availability||{},merged=matches.map(m=>map[String(m.id)]?{...m,availability:map[String(m.id)]}:m);return{matches:merged,meta:{...(meta||{}),availability:data.meta||null}}}catch(_){return{matches,meta}}}
  async function persistPredictions(){return{ok:true,skipped:true,reason:'OFFICIAL_DECISION_WRITER_ONLY'}}
  async function demo(){const response=await fetch('data/demo-matches.json',{cache:'no-store'});if(!response.ok)throw new Error('Demo feed unavailable');return response.json()}

  async function fetchLive(force){
    const row=readCache(),status=cacheStatus();
    if(!force&&row&&status.fresh){const matches=cachedMatches(row);notifyDataUpdated({matches,meta:matches.meta,cached:true});return matches}
    const baseEndpoint=window.ARGUS_LIVE_ENDPOINT||'/api/live';
    const endpoint=force?`${baseEndpoint}${baseEndpoint.includes('?')?'&':'?'}manualRefresh=${Date.now()}`:baseEndpoint;
    try{
      const response=await fetchWithTimeout(endpoint,{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store'},LIVE_REQUEST_TIMEOUT_MS),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Live endpoint error ${response.status}`);
      const base={matches:Array.isArray(payload)?payload:payload.matches||[],meta:payload.meta||{}},pStatus=providerStatus(base.meta),normalized=await mergeAvailability(base.matches,base.meta),degraded=pStatus!=='HEALTHY'||Boolean(normalized.meta?.degraded),empty=normalized.matches.length===0;
      if(degraded&&row?.matches?.length){const fallback=cachedMatches(row,{stale:true,reason:normalized.meta?.degradedReason||pStatus});notifyDataUpdated({matches:fallback,meta:fallback.meta,cached:true,degraded:true});return fallback}
      if(degraded){return decorate(normalized.matches,{...(normalized.meta||{}),providerStatus:pStatus,actionableData:false,staleFallback:false},{dataStale:true,providerStatus:pStatus})}
      if(empty&&row?.matches?.length&&status.available){const fallback=cachedMatches(row,{stale:true,reason:'EMPTY_REFRESH_PRESERVED_LAST_GOOD_SNAPSHOT'});notifyDataUpdated({matches:fallback,meta:fallback.meta,cached:true,degraded:true});return fallback}
      const healthy={matches:normalized.matches,meta:{...(normalized.meta||{}),providerStatus:'HEALTHY',actionableData:true,staleFallback:false}};writeCache(healthy);return decorate(healthy.matches,healthy.meta,{providerStatus:'HEALTHY'});
    }catch(error){
      const reason=error?.name==='AbortError'?'LIVE_REQUEST_TIMEOUT':(error?.message||'LIVE_REFRESH_FAILED');
      if(row?.matches?.length){const fallback=cachedMatches(row,{stale:true,reason});notifyDataUpdated({matches:fallback,meta:fallback.meta,cached:true,degraded:true});return fallback}
      throw new Error(reason);
    }
  }
  async function live(options={}){
    const force=Boolean(options.force);
    if(liveInFlight){
      if(!force)return liveInFlight;
      try{await liveInFlight}catch(_){}
    }
    const request=fetchLive(force);
    liveInFlight=request;
    try{return await request}finally{if(liveInFlight===request)liveInFlight=null}
  }
  async function health(){const row=readCache(),status=cacheStatus();if(!row)return{ready:true,cached:false,meta:null,matches:[]};if(status.fresh){const matches=cachedMatches(row);return{ready:true,cached:true,meta:matches.meta,matches:[...matches]}}const matches=cachedMatches(row,{stale:true,reason:'CLIENT_CACHE_EXPIRED'});return{ready:true,cached:true,stale:true,meta:matches.meta,matches:[...matches]}}
  window.ArgusProviders={demo,live,health,cacheStatus,readCache,persistPredictions,providerStatus};
})();
