(()=>{
  const bind=()=>{
    const btn=document.getElementById('scanBtn');
    if(!btn)return;
    btn.type='button';
    btn.style.touchAction='manipulation';
    btn.style.pointerEvents='auto';
    btn.style.minHeight='46px';
    if(btn.__argusNativeClickBound)return;
    btn.__argusNativeClickBound=true;
    btn.addEventListener('click',()=>{
      if(btn.disabled)return;
      if(typeof window.scanToday==='function')window.scanToday();
    });
  };
  bind();
  window.addEventListener('pageshow',bind);
  document.addEventListener('DOMContentLoaded',bind,{once:true});
})();
