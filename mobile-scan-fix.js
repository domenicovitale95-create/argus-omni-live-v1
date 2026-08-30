(()=>{
  const harden=()=>{
    const btn=document.getElementById('scanBtn');
    if(!btn)return;
    btn.type='button';
    btn.style.touchAction='manipulation';
    btn.style.pointerEvents='auto';
    btn.style.minHeight='46px';
  };
  const installRefreshCostGuard=()=>{
    const providers=window.ArgusProviders;
    if(!providers?.live||providers.__backgroundRefreshCostGuard)return;
    const live=providers.live.bind(providers);
    providers.live=(options={})=>{
      const requestedForce=Boolean(options?.force);
      const explicitManualScan=Boolean(document.getElementById('scanBtn')?.disabled);
      return live({...options,force:requestedForce&&explicitManualScan});
    };
    providers.__backgroundRefreshCostGuard=true;
  };
  const hardenAll=()=>{harden();installRefreshCostGuard()};
  hardenAll();
  window.addEventListener('pageshow',hardenAll);
  document.addEventListener('DOMContentLoaded',hardenAll,{once:true});
})();
