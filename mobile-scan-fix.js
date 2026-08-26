(()=>{
  let lastManualAt=0;
  const getButton=target=>target?.closest?.('#scanBtn')||document.getElementById('scanBtn');

  const runScan=event=>{
    const btn=getButton(event?.target);
    if(!btn||btn.disabled)return;
    const now=Date.now();
    if(now-lastManualAt<700)return;
    lastManualAt=now;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if(typeof window.scanToday==='function'){
      window.scanToday();
      return;
    }
    const fallback=btn.__argusNativeClick;
    if(typeof fallback==='function')fallback();
  };

  const harden=()=>{
    const btn=document.getElementById('scanBtn');
    if(!btn)return;
    btn.type='button';
    btn.style.touchAction='manipulation';
    btn.style.webkitTapHighlightColor='transparent';
    btn.style.minHeight='46px';
    btn.style.pointerEvents='auto';
    btn.style.position='relative';
    btn.style.zIndex='5';
    if(!btn.__argusMobileBound){
      btn.__argusMobileBound=true;
      btn.__argusNativeClick=()=>btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      btn.addEventListener('touchend',runScan,{passive:false});
      btn.addEventListener('pointerup',event=>{
        if(event.pointerType==='touch'||event.pointerType==='pen')runScan(event);
      },{passive:false});
    }
  };

  harden();
  window.addEventListener('pageshow',harden);
  document.addEventListener('DOMContentLoaded',harden,{once:true});
})();
