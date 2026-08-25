(()=>{
  let lastTouchAt=0;
  const isScanButton=target=>target?.closest?.('#scanBtn')||null;

  document.addEventListener('touchend',event=>{
    const btn=isScanButton(event.target);
    if(!btn||btn.disabled||typeof window.scanToday!=='function')return;
    lastTouchAt=Date.now();
    event.preventDefault();
    window.scanToday();
  },{passive:false});

  document.addEventListener('click',event=>{
    if(!isScanButton(event.target))return;
    if(Date.now()-lastTouchAt<900){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);

  const harden=()=>{
    const btn=document.getElementById('scanBtn');
    if(!btn)return;
    btn.type='button';
    btn.style.touchAction='manipulation';
    btn.style.webkitTapHighlightColor='transparent';
    btn.style.minHeight='46px';
    btn.style.pointerEvents='auto';
  };
  harden();
  window.addEventListener('pageshow',harden);
})();
