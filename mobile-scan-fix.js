(()=>{
  const harden=()=>{
    const btn=document.getElementById('scanBtn');
    if(!btn)return;
    btn.type='button';
    btn.style.touchAction='manipulation';
    btn.style.pointerEvents='auto';
    btn.style.minHeight='46px';
  };
  harden();
  window.addEventListener('pageshow',harden);
  document.addEventListener('DOMContentLoaded',harden,{once:true});
})();
