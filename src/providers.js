(function () {
  const CACHE_KEY = 'argus-live-cache-v5';
  const NORMAL_TTL = 60 * 1000;
  const SAFE_TTL = 5 * 60 * 1000;
  const AVAILABILITY_WINDOW_MS = 100 * 60 * 1000;

  function readCache() {
    try {
      const row = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!row || !Array.isArray(row.matches) || !row.savedAt) return null;
      return row;
    } catch (_) { return null; }
  }
  function writeCache(payload) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ matches: payload.matches || [], meta: payload.meta || null, savedAt: Date.now() })); } catch (_) {}
  }
  function quotaInfo(row) {
    const q = row?.meta?.quota || {};
    const remaining = Number(q.dailyRemaining);
    const limit = Number(q.dailyLimit);
    const reserve = Number(q.dynamicReserve);
    return {
      remaining: Number.isFinite(remaining) ? remaining : null,
      limit: Number.isFinite(limit) ? limit : null,
      reserve: Number.isFinite(reserve) ? reserve : null
    };
  }
  function cacheStatus() {
    const row = readCache();
    if (!row) return { available:false, fresh:false, ageMs:null, safeMode:false };
    const ageMs = Date.now() - row.savedAt;
    const q = quotaInfo(row);
    const threshold = q.reserve ?? (q.limit ? Math.max(80, Math.ceil(q.limit * 0.02)) : 80);
    const safeMode = q.remaining != null && q.remaining <= threshold;
    const ttl = safeMode ? SAFE_TTL : NORMAL_TTL;
    return { available:true, fresh:ageMs < ttl, ageMs, safeMode, remaining:q.remaining, limit:q.limit, threshold };
  }
  function cachedMatches(row) {
    const matches = (row?.matches || []).slice();
    matches.meta = { ...(row?.meta || {}), clientCache:true, clientCacheAgeMs:Date.now()-row.savedAt };
    return matches;
  }
  function availabilityIds(matches){
    const now=Date.now();
    return matches.filter(m=>{
      if(m?.isFinished) return false;
      if(m?.isLive) return true;
      const k=new Date(m?.kickoff||0).getTime();
      return Number.isFinite(k)&&k>0&&k-now<=AVAILABILITY_WINDOW_MS&&k-now>=-30*60*1000;
    }).map(m=>Number(m.id)).filter(Boolean);
  }
  async function mergeAvailability(matches,meta){
    const ids=availabilityIds(matches);
    if(!ids.length) return {matches,meta};
    try{
      const date=encodeURIComponent(meta?.date||'');
      const res=await fetch(`/api/availability?ids=${ids.join('-')}${date?`&date=${date}`:''}`,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!res.ok) return {matches,meta};
      const data=await res.json(),map=data.availability||{};
      const merged=matches.map(m=>map[String(m.id)]?{...m,availability:map[String(m.id)]}:m);
      return {matches:merged,meta:{...(meta||{}),availability:data.meta||null}};
    }catch(_){return {matches,meta};}
  }
  async function persistPredictions(matches, meta = null) {
    if (!Array.isArray(matches) || !matches.length || !window.ArgusEngine) return;
    try {
      const analyses = matches.map((match) => {
        const base = window.ArgusEngine.analyze(match);
        return window.ArgusGovernance ? window.ArgusGovernance.apply(base, match) : base;
      });
      await fetch('/api/predictions', {
        method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({ matches, analyses, meta }), keepalive:true
      });
    } catch (_) {}
  }
  async function demo() {
    const response = await fetch('data/demo-matches.json',{cache:'no-store'});
    if(!response.ok) throw new Error('Demo feed unavailable');
    return response.json();
  }
  async function live(options={}) {
    const force=Boolean(options.force), row=readCache(), status=cacheStatus();
    if(!force && row && status.fresh){ const matches=cachedMatches(row); persistPredictions(matches,matches.meta); return matches; }
    const endpoint=window.ARGUS_LIVE_ENDPOINT||'/api/live';
    const response=await fetch(endpoint,{headers:{Accept:'application/json'},cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error||`Live endpoint error ${response.status}`);
    const base={matches:Array.isArray(payload)?payload:payload.matches||[],meta:payload.meta||null};
    const normalized=await mergeAvailability(base.matches,base.meta);
    writeCache(normalized); persistPredictions(normalized.matches,normalized.meta);
    const matches=normalized.matches.slice(); matches.meta=normalized.meta; return matches;
  }
  async function health() {
    const row=readCache(),status=cacheStatus();
    if(row&&status.fresh){ persistPredictions(row.matches||[],row.meta||null); return {ready:true,cached:true,meta:{...(row.meta||{}),clientCache:true,clientCacheAgeMs:status.ageMs},matches:row.matches||[]}; }
    return {ready:true,cached:false,meta:row?.meta||null,matches:row?.matches||[]};
  }
  window.ArgusProviders={demo,live,health,cacheStatus,readCache,persistPredictions};
})();