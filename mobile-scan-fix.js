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
  const refreshServiceWorker=()=>{
    if(!('serviceWorker'in navigator)||!navigator.serviceWorker.getRegistration)return;
    Promise.resolve().then(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      if(!registration)return;
      await Promise.race([
        registration.update(),
        new Promise(resolve=>setTimeout(resolve,2000))
      ]);
    }).catch(()=>{});
  };
  const installRefreshButton=()=>{
    const actions=document.querySelector('.hero-actions');
    if(!actions||document.getElementById('refreshSiteBtn'))return;
    const btn=document.createElement('button');
    btn.id='refreshSiteBtn';
    btn.type='button';
    btn.className='primary';
    btn.textContent='Refresh';
    btn.setAttribute('aria-label','Refresh ARGUS site and latest data');
    btn.style.touchAction='manipulation';
    btn.style.pointerEvents='auto';
    btn.style.minHeight='46px';
    btn.style.background='transparent';
    btn.style.color='var(--text)';
    btn.style.border='1px solid var(--line-strong)';
    const applyMobileLayout=()=>{btn.style.width=window.matchMedia('(max-width:700px)').matches?'100%':''};
    applyMobileLayout();
    window.addEventListener('resize',applyMobileLayout,{passive:true});
    btn.addEventListener('click',()=>{
      if(btn.disabled)return;
      btn.disabled=true;
      btn.textContent='Refreshing…';
      const url=new URL(window.location.href);
      url.searchParams.set('_argusRefresh',Date.now().toString());
      refreshServiceWorker();
      window.location.assign(url.toString());
    });
    const note=actions.querySelector('.hero-note');
    if(note)actions.insertBefore(btn,note);else actions.appendChild(btn);
  };
  const hardenAll=()=>{harden();installRefreshCostGuard();installRefreshButton()};
  hardenAll();
  window.addEventListener('pageshow',hardenAll);
  document.addEventListener('DOMContentLoaded',hardenAll,{once:true});
})();