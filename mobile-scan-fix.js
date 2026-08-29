(()=>{
  let lastTouchActivationAt=0;
  const TOUCH_DEBOUNCE_MS=900;
  const getButton=()=>document.getElementById('scanBtn');

  const activateScan=event=>{
    const btn=getButton();
    if(!btn||btn.disabled)return;
    const now=Date.now();
    if(now-lastTouchActivationAt<TOUCH_DEBOUNCE_MS)return;
    lastTouchActivationAt=now;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if(typeof window.scanToday==='function'){
      window.scanToday();
      return;
    }
    // If the app bundle failed to initialize, recover the PWA instead of
    // leaving a permanently inert button.
    btn.textContent='Refreshing ARGUS…';
    setTimeout(()=>window.location.reload(),60);
  };

  const harden=()=>{
    const btn=getButton();
    if(!btn)return;
    btn.type='button';
    btn.style.touchAction='manipulation';
    btn.style.webkitTapHighlightColor='transparent';
    btn.style.minHeight='46px';
    btn.style.pointerEvents='auto';
    btn.style.position='relative';
    btn.style.zIndex='5';
    if(btn.__argusMobileBound)return;
    btn.__argusMobileBound=true;

    // Modern iOS supports Pointer Events. Use one touch path only, rather
    // than binding both pointerup and touchend to the same gesture.
    if('PointerEvent' in window){
      btn.addEventListener('pointerup',event=>{
        if(event.pointerType==='touch'||event.pointerType==='pen')activateScan(event);
      },{passive:false});
    }else{
      btn.addEventListener('touchend',activateScan,{passive:false});
    }

    // iOS may emit a synthetic click after the touch activation. Suppress
    // only that synthetic follow-up; normal mouse/keyboard clicks still
    // reach app.js exactly once.
    btn.addEventListener('click',event=>{
      if(Date.now()-lastTouchActivationAt>=TOUCH_DEBOUNCE_MS)return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
  };

  harden();
  window.addEventListener('pageshow',harden);
  document.addEventListener('DOMContentLoaded',harden,{once:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)harden()});
})();
