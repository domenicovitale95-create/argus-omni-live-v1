(function () {
  const CACHE_KEY = 'argus-live-cache-v3';
  const NORMAL_TTL = 5 * 60 * 1000;
  const SAFE_TTL = 12 * 60 * 1000;

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
  function quotaFrom(row) { return row?.meta?.quota?.dailyRemaining; }
  function cacheStatus() {
    const row = readCache();
    if (!row) return { available:false, fresh:false, ageMs:null, safeMode:false };
    const ageMs = Date.now() - row.savedAt;
    const remaining = quotaFrom(row);
    const safeMode = Number.isFinite(Number(remaining)) && Number(remaining) <= 10;
    const ttl = safeMode ? SAFE_TTL : NORMAL_TTL;
    return { available:true, fresh:ageMs < ttl, ageMs, safeMode, remaining };
  }
  function cachedMatches(row) {
    const matches = (row?.matches || []).slice();
    matches.meta = { ...(row?.meta || {}), clientCache:true, clientCacheAgeMs:Date.now()-row.savedAt };
    return matches;
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
    const normalized={matches:Array.isArray(payload)?payload:payload.matches||[],meta:payload.meta||null};
    writeCache(normalized); persistPredictions(normalized.matches,normalized.meta);
    const matches=normalized.matches.slice(); matches.meta=normalized.meta; return matches;
  }
  async function health() {
    const row=readCache(),status=cacheStatus();
    if(row&&status.fresh){ persistPredictions(row.matches||[],row.meta||null); return {ready:true,cached:true,meta:{...(row.meta||{}),clientCache:true,clientCacheAgeMs:status.ageMs},matches:row.matches||[]}; }
    return {ready:true,cached:false,meta:row?.meta||null,matches:row?.matches||[]};
  }
  function addReportLink(){
    const host=document.querySelector('.top-status');
    if(!host || document.getElementById('predictionReportLink')) return;
    const a=document.createElement('a');
    a.id='predictionReportLink'; a.href='/compte-rendu-des-predictions'; a.textContent='COMPTE RENDU';
    a.style.cssText='color:#d8ff45;text-decoration:none;border:1px solid #3b4424;background:#11150d;padding:8px 10px;font-size:8px;font-weight:800;letter-spacing:.12em';
    host.insertBefore(a,host.firstChild);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',addReportLink); else addReportLink();
  window.ArgusProviders={demo,live,health,cacheStatus,readCache,persistPredictions};
})();
