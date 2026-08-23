(()=>{
  const path=(location.pathname||'/').toLowerCase();
  const isHome=path==='/'||path.endsWith('/index.html');
  const section=path.includes('live.html')?'live':path.includes('prediction-results')?'results':path.includes('virtual-bankroll')?'bankroll':path.includes('more.html')?'more':'today';
  document.body.classList.add('os-has-shell');
  let viewport=document.querySelector('meta[name="viewport"]');
  if(viewport&&!viewport.content.includes('viewport-fit')) viewport.content+=',viewport-fit=cover';

  const top=document.querySelector('.top-status');
  if(top){
    const legacy=top.querySelector('.nav-more');
    if(legacy) legacy.classList.add('os-legacy-more');
    if(!top.querySelector('.os-bankroll-link')){
      const bank=document.createElement('a');
      bank.className='os-desktop-link os-bankroll-link'+(section==='bankroll'?' active':'');
      bank.href='/virtual-bankroll.html';bank.textContent='Bankroll';
      legacy?top.insertBefore(bank,legacy):top.appendChild(bank);
    }
    if(!top.querySelector('.os-more-link')){
      const more=document.createElement('a');
      more.className='os-desktop-link os-more-link'+(section==='more'?' active':'');
      more.href='/more.html';more.textContent='More';
      legacy?top.insertBefore(more,legacy):top.appendChild(more);
    }
  }

  const icon={
    today:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="8"/></svg>',
    live:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 6 13h5l-1 9 8-12h-5z"/></svg>',
    results:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>',
    bankroll:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h14a2 2 0 0 1 2 2v9H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13"/><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };
  const items=[['today','Today','/'],['live','Live','/live.html'],['results','Results','/prediction-results.html'],['bankroll','Bankroll','/virtual-bankroll.html'],['more','More','/more.html']];
  const nav=document.createElement('nav');nav.className='os-bottom-nav';nav.setAttribute('aria-label','ARGUS primary mobile navigation');
  nav.innerHTML=items.map(([key,label,href])=>`<a class="${key}${section===key?' active':''}" href="${href}"${section===key?' aria-current="page"':''}>${icon[key]}<span>${label}</span></a>`).join('');
  document.body.appendChild(nav);

  const proof=`<div class="os-proof-strip" aria-label="ARGUS proof shortcuts"><span>VERIFY</span><a href="/prediction-results.html"><i></i>Verified results</a><a href="/virtual-bankroll.html"><i></i>Paper P&amp;L</a><a href="/more.html"><i></i>Research &amp; system</a></div>`;
  if(isHome){
    const day=document.querySelector('.day-strip');if(day) day.insertAdjacentHTML('afterend',proof);
  }
  if(section==='results'){
    const summary=document.querySelector('.results-summary');if(summary) summary.insertAdjacentHTML('afterend','<a class="os-crosslink" href="/virtual-bankroll.html"><strong>Forecast quality and betting performance are different questions.</strong><span>Open paper bankroll →</span></a>');
  }
  if(section==='bankroll'){
    const strip=document.querySelector('.bank-strip');if(strip) strip.insertAdjacentHTML('afterend','<a class="os-crosslink" href="/prediction-results.html"><strong>Paper P&amp;L is not scientific validation by itself.</strong><span>Open verified results →</span></a>');
  }
  if(section==='live'){
    const summary=document.querySelector('.live-summary');if(summary) summary.insertAdjacentHTML('afterend','<a class="os-crosslink" href="/prediction-results.html"><strong>Live is for current decisions. Proof stays in the frozen ledger.</strong><span>Open results →</span></a>');
  }
})();