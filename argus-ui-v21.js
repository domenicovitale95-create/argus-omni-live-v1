(()=>{
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const fmtDate=()=>new Intl.DateTimeFormat(undefined,{weekday:'short',day:'2-digit',month:'short'}).format(new Date());

  function installHeader(){
    const shell=q('.shell');
    if(!shell||q('.v21-appbar',shell))return;
    const header=document.createElement('header');
    header.className='v21-appbar';
    header.innerHTML=`<div class="v21-brand"><div class="v21-mark">A</div><div class="v21-brandcopy"><strong>ARGUS OMNI</strong><small>FOOTBALL · MINUS THE NOISE</small></div></div><div class="v21-app-actions"><button class="v21-refresh" type="button" aria-label="Check matches again">↻</button></div>`;
    shell.insertBefore(header,shell.firstChild);
    q('.v21-refresh',header)?.addEventListener('click',()=>{if(typeof scanToday==='function')scanToday()});
  }

  function rebuildCommand(){
    const root=q('#v2Command');
    if(!root||root.dataset.v21==='1')return;
    root.dataset.v21='1';
    root.innerHTML=`
      <div class="v21-daynav" aria-label="Match day"><span class="v21-daylabel">TODAY · THE SHORTLIST</span><time>${fmtDate()}</time></div>
      <div class="v2-status-strip">
        <div><span>Prime picks</span><strong id="v2Prime">0</strong></div>
        <div><span>Good value</span><strong id="v2Value">0</strong></div>
        <div><span>Worth waiting</span><strong id="v2Watch">0</strong></div>
        <span id="v2NoBet" hidden>0</span>
      </div>
      <div class="v2-best-line"><span>What stands out</span><strong id="v2Best">Nothing checked yet</strong><small id="v2Updated">—</small></div>
      <div class="v2-filterbar" role="tablist"><button data-v2-filter="signals" class="active">Worth a look</button><button data-v2-filter="prime">Prime</button><button data-v2-filter="value">Value</button><button data-v2-filter="watch">Wait</button><button data-v2-filter="all">All matches</button></div>`;
    qa('[data-v2-filter]',root).forEach(btn=>btn.addEventListener('click',()=>{
      if(typeof state==='undefined')return;
      state.filter=btn.dataset.v2Filter;
      qa('[data-v2-filter]',root).forEach(x=>x.classList.toggle('active',x===btn));
      if(typeof renderBoard==='function')renderBoard();
    }));
  }

  function updateCounts(){
    try{
      if(typeof rowsWithTypes!=='function')return;
      const rows=rowsWithTypes().filter(r=>r.type!=='past'),set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
      const prime=rows.filter(r=>r.type==='prime').length,value=rows.filter(r=>['value','strong-value'].includes(r.type)).length,watch=rows.filter(r=>r.type==='watch').length,nobet=rows.filter(r=>r.type==='no-bet').length;
      set('v2Prime',prime);set('v2Value',value);set('v2Watch',watch);set('v2NoBet',nobet);
      const best=typeof actionableRows==='function'?actionableRows()[0]:null;
      if(best){
        const m=best.match,a=best.analysis,label=typeof betLabel==='function'?betLabel(a):(a?.bestMarket||'No bet');
        set('v2Best',`${m.country||'International'} · ${m.competition||'Match'} · ${m.home} vs ${m.away} · ${label}`);
      }else set('v2Best','Nothing worth forcing right now');
      const t=typeof state!=='undefined'&&state?.meta?.fetchedAt?new Date(state.meta.fetchedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—';
      set('v2Updated',`Checked ${t}`);
    }catch(_){}
  }

  function fixEnglandFlag(){qa('.v2-location span,.v2-league-head span').forEach(el=>{if(el.textContent==='🏴')el.textContent='🇬🇧'})}
  let queued=false;
  function sync(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;installHeader();rebuildCommand();updateCounts();fixEnglandFlag()})}
  sync();
  const obs=new MutationObserver(sync);obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();