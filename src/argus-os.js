(()=>{
  const path=(location.pathname||'/').toLowerCase();
  const isHome=path==='/'||path.endsWith('/index.html');
  const section=path.includes('live.html')?'live':path.includes('prediction-results')?'results':path.includes('virtual-bankroll')?'bankroll':path.includes('more.html')?'more':'today';
  document.body.classList.add('os-has-shell');
  let viewport=document.querySelector('meta[name="viewport"]');
  if(viewport&&!viewport.content.includes('viewport-fit')) viewport.content+=',viewport-fit=cover';

  if(!document.querySelector('link[href*="argus-os-v2.css"]')){
    const v2css=document.createElement('link');v2css.rel='stylesheet';v2css.href='/argus-os-v2.css';document.head.appendChild(v2css);
  }
  document.body.classList.add('os-v2-ready');

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

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function ageInfo(ts){
    if(!ts)return{label:'Waiting for data',stale:true};
    const mins=Math.max(0,Math.round((Date.now()-new Date(ts).getTime())/60000));
    if(mins<=2)return{label:'Fresh now',stale:false};
    if(mins<=10)return{label:`Fresh · ${mins}m`,stale:false};
    return{label:`Aging · ${mins}m`,stale:true};
  }
  function oddsText(v){const n=Number(v);return Number.isFinite(n)&&n>1?n.toFixed(2):'—'}
  function toneFor(type){return type==='prime'?'prime':(['value','strong-value'].includes(type)?'value':type==='watch'?'watch':'wait')}
  function protection(type,a){
    const offered=oddsText(a?.marketOdds),fair=oddsText(a?.fairOdds);
    if(type==='prime')return offered!=='—'&&fair!=='—'?`Protect the edge: offered ${offered} vs model fair ${fair}. If the price falls to fair value or worse, do not chase.`:'Only act while the current market still clears ARGUS safeguards.';
    if(['value','strong-value'].includes(type))return offered!=='—'&&fair!=='—'?`Price discipline matters: offered ${offered}, model fair ${fair}. Re-check if the market shortens.`:'Consider only while the price remains attractive.';
    if(type==='watch')return'Wait for stronger confirmation, better price or lower uncertainty before upgrading the decision.';
    return'Do nothing until a setup clears the evidence, quality and pricing gates.';
  }
  function buildDecisionBrief(){
    const brief=document.createElement('section');brief.id='osV2Decision';brief.className='os-v2-decision';brief.setAttribute('aria-label','ARGUS five-second decision brief');
    brief.innerHTML='<article class="os-v2-main wait" id="osV2Main"><div><div class="os-v2-actionline"><span class="os-v2-kicker">5-SECOND DECISION</span><span class="os-v2-fresh stale" id="osV2Fresh"><i></i><span>Waiting for data</span></span></div><div class="os-v2-action" id="osV2Action">ANALYSE</div><div class="os-v2-play" id="osV2Play">Run today\'s analysis</div><p class="os-v2-copy" id="osV2Copy">ARGUS will reduce the slate to one clear action: bet, consider, wait or skip.</p></div><div class="os-v2-protect" id="osV2Protect"><strong>Decision rule:</strong> no clear edge means no bet.</div></article><aside class="os-v2-metrics"><div class="os-v2-metric"><span>Market price</span><strong id="osV2Price">—</strong><small id="osV2Fair">model fair —</small></div><div class="os-v2-metric"><span>Confidence</span><strong id="osV2Confidence">—</strong><small id="osV2Edge">probability edge —</small></div><div class="os-v2-metric"><span>Uncertainty</span><strong id="osV2Uncertainty">—</strong><small>lower is better</small></div><div class="os-v2-metric"><span>Data quality</span><strong id="osV2Quality">—</strong><small id="osV2Kickoff">waiting for match</small></div></aside>';
    return brief;
  }
  function renderDecisionBrief(){
    if(!isHome||!document.getElementById('osV2Decision'))return;
    const main=document.getElementById('osV2Main'),action=document.getElementById('osV2Action'),play=document.getElementById('osV2Play'),copy=document.getElementById('osV2Copy'),protect=document.getElementById('osV2Protect');
    const price=document.getElementById('osV2Price'),fair=document.getElementById('osV2Fair'),conf=document.getElementById('osV2Confidence'),edge=document.getElementById('osV2Edge'),unc=document.getElementById('osV2Uncertainty'),quality=document.getElementById('osV2Quality'),ko=document.getElementById('osV2Kickoff'),fresh=document.getElementById('osV2Fresh');
    let best=null,meta=null,hasMatches=false;
    try{hasMatches=typeof state!=='undefined'&&Array.isArray(state.matches)&&state.matches.length>0;meta=typeof state!=='undefined'?state.meta:null;if(typeof actionableRows==='function')best=actionableRows()[0]||null}catch(_){best=null}
    const age=ageInfo(meta?.fetchedAt);fresh.classList.toggle('stale',age.stale);fresh.querySelector('span').textContent=age.label;
    const todayNav=document.querySelector('.os-bottom-nav .today');if(todayNav)todayNav.classList.remove('os-v2-signal');
    if(!hasMatches){main.className='os-v2-main wait';action.textContent='ANALYSE';play.textContent='Run today\'s analysis';copy.textContent='ARGUS will reduce the slate to one clear action: bet, consider, wait or skip.';protect.innerHTML='<strong>Decision rule:</strong> no clear edge means no bet.';price.textContent=fair.textContent=conf.textContent=edge.textContent=unc.textContent=quality.textContent='—';fair.textContent='model fair —';edge.textContent='probability edge —';ko.textContent='waiting for match';return}
    if(!best){main.className='os-v2-main wait';action.textContent='WAIT';play.textContent='No bet clears the current standard';copy.textContent='ARGUS reviewed the available slate and found no setup strong enough to justify action.';protect.innerHTML='<strong>What changes this:</strong> '+protection('no-bet',null);price.textContent='—';fair.textContent='model fair —';conf.textContent='—';edge.textContent='no qualifying edge';unc.textContent='—';quality.textContent='—';ko.textContent='re-scan when data or prices change';return}
    const {match,analysis,type}=best,tone=toneFor(type),act=typeof actionLabel==='function'?actionLabel(type):(type==='prime'?'BET NOW':type==='watch'?'WAIT':'CONSIDER'),bet=typeof betLabel==='function'?betLabel(analysis):(analysis?.bestMarket||'—'),reason=typeof reasonText==='function'?reasonText(match,analysis):'ARGUS sees a qualifying setup.',kick=typeof kickoffText==='function'?kickoffText(match):(match?.kickoff?new Date(match.kickoff).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—');
    main.className=`os-v2-main ${tone}`;action.textContent=act;play.textContent=`${match?.home||'—'} vs ${match?.away||'—'} · ${bet}`;copy.textContent=reason;protect.innerHTML='<strong>What would invalidate it:</strong> '+esc(protection(type,analysis));
    price.textContent=oddsText(analysis?.marketOdds);fair.textContent=`model fair ${oddsText(analysis?.fairOdds)}`;conf.textContent=Number.isFinite(Number(analysis?.confidence))?`${Number(analysis.confidence).toFixed(0)}%`:'—';edge.textContent=Number.isFinite(Number(analysis?.edge))?`probability edge ${Number(analysis.edge)>=0?'+':''}${Number(analysis.edge).toFixed(1)}pp`:'probability edge —';unc.textContent=Number.isFinite(Number(analysis?.uncertainty))?`${Number(analysis.uncertainty).toFixed(0)}%`:'—';quality.textContent=Number.isFinite(Number(analysis?.quality))?`${Number(analysis.quality).toFixed(0)}%`:'—';ko.textContent=kick;
    if(todayNav&&['prime','value'].includes(tone))todayNav.classList.add('os-v2-signal');
  }
  if(isHome){
    const hero=document.querySelector('.hero');if(hero&&!document.getElementById('osV2Decision'))hero.insertAdjacentElement('afterend',buildDecisionBrief());
    renderDecisionBrief();
    const target=document.getElementById('topPick');if(target)new MutationObserver(()=>renderDecisionBrief()).observe(target,{childList:true,subtree:true,attributes:true});
    setInterval(renderDecisionBrief,60000);
    try{
      if(window.innerWidth<=760&&!localStorage.getItem('argus_os_v2_seen')){
        const note=document.createElement('aside');note.className='os-v2-update';note.innerHTML='<div class="os-v2-update-top"><div><small>ARGUS OS V2</small><strong>The answer now comes first.</strong><p>Today shows action, market price, model fair price, confidence, uncertainty and data quality before the deeper dashboards.</p></div><button type="button" aria-label="Dismiss ARGUS OS V2 update">×</button></div>';document.body.appendChild(note);note.querySelector('button').onclick=()=>{localStorage.setItem('argus_os_v2_seen','1');note.remove()};
      }
    }catch(_){ }
  }
})();