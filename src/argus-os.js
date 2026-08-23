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

  const proof=`<div class="os-proof-strip" aria-label="ARGUS proof shortcuts"><span>CHECK</span><a href="/prediction-results.html"><i></i>Verified results</a><a href="/virtual-bankroll.html"><i></i>Virtual profit / loss</a><a href="/more.html"><i></i>Research &amp; system</a></div>`;
  if(isHome){
    const day=document.querySelector('.day-strip');if(day) day.insertAdjacentHTML('afterend',proof);
  }
  if(section==='results'){
    const summary=document.querySelector('.results-summary');if(summary) summary.insertAdjacentHTML('afterend','<a class="os-crosslink" href="/virtual-bankroll.html"><strong>Prediction accuracy and virtual profit are two different things.</strong><span>Open virtual bankroll →</span></a>');
  }
  if(section==='bankroll'){
    const strip=document.querySelector('.bank-strip');if(strip) strip.insertAdjacentHTML('afterend','<a class="os-crosslink" href="/prediction-results.html"><strong>Virtual profit alone does not prove ARGUS is reliable.</strong><span>Open verified results →</span></a>');
  }
  if(section==='live'){
    const summary=document.querySelector('.live-summary');if(summary) summary.insertAdjacentHTML('afterend','<a class="os-crosslink" href="/prediction-results.html"><strong>Live helps with decisions now. Verified results show how ARGUS performs over time.</strong><span>Open results →</span></a>');
  }

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function ageInfo(ts){
    if(!ts)return{label:'Waiting for data',stale:true};
    const mins=Math.max(0,Math.round((Date.now()-new Date(ts).getTime())/60000));
    if(mins<=2)return{label:'Updated now',stale:false};
    if(mins<=10)return{label:`Updated ${mins}m ago`,stale:false};
    return{label:`Needs refresh · ${mins}m`,stale:true};
  }
  function oddsText(v){const n=Number(v);return Number.isFinite(n)&&n>1?n.toFixed(2):'—'}
  function toneFor(type){return type==='prime'?'prime':(['value','strong-value'].includes(type)?'value':type==='watch'?'watch':'wait')}
  function protection(type,a){
    const offered=oddsText(a?.marketOdds),fair=oddsText(a?.fairOdds);
    if(type==='prime')return offered!=='—'&&fair!=='—'?`Current odds ${offered}; ARGUS fair odds ${fair}. If the current odds fall to ${fair} or lower, skip it.`:'Only act while the odds still meet ARGUS safety rules.';
    if(['value','strong-value'].includes(type))return offered!=='—'&&fair!=='—'?`Current odds ${offered}; ARGUS fair odds ${fair}. Check again if the odds drop.`:'Consider it only while the odds remain attractive.';
    if(type==='watch')return'Wait for better confirmation, better odds or clearer information.';
    return'Wait until ARGUS finds enough evidence, reliable data and a worthwhile price.';
  }
  function buildDecisionBrief(){
    const brief=document.createElement('section');brief.id='osV2Decision';brief.className='os-v2-decision';brief.setAttribute('aria-label','ARGUS quick decision');
    brief.innerHTML='<article class="os-v2-main wait" id="osV2Main"><div><div class="os-v2-actionline"><span class="os-v2-kicker">QUICK DECISION</span><span class="os-v2-fresh stale" id="osV2Fresh"><i></i><span>Waiting for data</span></span></div><div class="os-v2-action" id="osV2Action">ANALYSE</div><div class="os-v2-play" id="osV2Play">Run today\'s analysis</div><p class="os-v2-copy" id="osV2Copy">ARGUS turns today\'s matches into one simple answer: bet, consider, wait or skip.</p></div><div class="os-v2-protect" id="osV2Protect"><strong>Simple rule:</strong> if ARGUS sees no clear value, skip the bet.</div></article><aside class="os-v2-metrics"><div class="os-v2-metric"><span>Current odds</span><strong id="osV2Price">—</strong><small id="osV2Fair">ARGUS fair odds —</small></div><div class="os-v2-metric"><span>Confidence</span><strong id="osV2Confidence">—</strong><small id="osV2Edge">value advantage —</small></div><div class="os-v2-metric"><span>How unsure?</span><strong id="osV2Uncertainty">—</strong><small>lower is better</small></div><div class="os-v2-metric"><span>Data reliability</span><strong id="osV2Quality">—</strong><small id="osV2Kickoff">waiting for match</small></div></aside>';
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
    if(!hasMatches){main.className='os-v2-main wait';action.textContent='ANALYSE';play.textContent='Run today\'s analysis';copy.textContent='ARGUS turns today\'s matches into one simple answer: bet, consider, wait or skip.';protect.innerHTML='<strong>Simple rule:</strong> if ARGUS sees no clear value, skip the bet.';price.textContent=fair.textContent=conf.textContent=edge.textContent=unc.textContent=quality.textContent='—';fair.textContent='ARGUS fair odds —';edge.textContent='value advantage —';ko.textContent='waiting for match';return}
    if(!best){main.className='os-v2-main wait';action.textContent='WAIT';play.textContent='Nothing is strong enough right now';copy.textContent='ARGUS checked the available matches and found no bet worth taking yet.';protect.innerHTML='<strong>What could change this:</strong> '+protection('no-bet',null);price.textContent='—';fair.textContent='ARGUS fair odds —';conf.textContent='—';edge.textContent='no clear value';unc.textContent='—';quality.textContent='—';ko.textContent='check again when odds or data change';return}
    const {match,analysis,type}=best,tone=toneFor(type),act=typeof actionLabel==='function'?actionLabel(type):(type==='prime'?'BET NOW':type==='watch'?'WAIT':'CONSIDER'),bet=typeof betLabel==='function'?betLabel(analysis):(analysis?.bestMarket||'—'),reason=typeof reasonText==='function'?reasonText(match,analysis):'ARGUS sees a qualifying setup.',kick=typeof kickoffText==='function'?kickoffText(match):(match?.kickoff?new Date(match.kickoff).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—');
    main.className=`os-v2-main ${tone}`;action.textContent=act;play.textContent=`${match?.home||'—'} vs ${match?.away||'—'} · ${bet}`;copy.textContent=reason;protect.innerHTML='<strong>When to skip it:</strong> '+esc(protection(type,analysis));
    price.textContent=oddsText(analysis?.marketOdds);fair.textContent=`ARGUS fair odds ${oddsText(analysis?.fairOdds)}`;conf.textContent=Number.isFinite(Number(analysis?.confidence))?`${Number(analysis.confidence).toFixed(0)}%`:'—';edge.textContent=Number.isFinite(Number(analysis?.edge))?`value advantage ${Number(analysis.edge)>=0?'+':''}${Number(analysis.edge).toFixed(1)} pts`:'value advantage —';unc.textContent=Number.isFinite(Number(analysis?.uncertainty))?`${Number(analysis.uncertainty).toFixed(0)}%`:'—';quality.textContent=Number.isFinite(Number(analysis?.quality))?`${Number(analysis.quality).toFixed(0)}%`:'—';ko.textContent=kick;
    if(todayNav&&['prime','value'].includes(tone))todayNav.classList.add('os-v2-signal');
  }

  const simpleTerms=new Map([
    ['Virtual Bankroll','Virtual Bankroll'],
    ['Daily Slip','Today\'s Picks'],
    ['Decision Shield','Safety Checks'],
    ['Historical Lab','Past-data Tests'],
    ['System Health','System Status'],
    ['Paper P&L','Virtual Profit / Loss'],
    ['Net P&L','Profit / Loss'],
    ['ROI','Return on stake'],
    ['Flat ROI','Return on fixed stakes'],
    ['Max drawdown','Biggest drop'],
    ['Total staked','Total virtual stake'],
    ['Open positions','Open virtual bets'],
    ['Settled positions','Completed virtual bets'],
    ['Total paper bets','Total virtual bets'],
    ['Shadow engine','Virtual test engine'],
    ['Actionable bets settled','Bets completed'],
    ['Actionable record','Bet record'],
    ['Forecast sample','Predictions checked'],
    ['Learning state','Learning status'],
    ['Calibration','Accuracy check'],
    ['PRIME validation','Strong-pick validation'],
    ['History coverage','Past-match coverage'],
    ['Recorded picks','Saved predictions'],
    ['Data budget','API allowance'],
    ['Model fair','ARGUS fair odds'],
    ['Market price','Current odds'],
    ['Data quality','Data reliability'],
    ['Uncertainty','How unsure?'],
    ['Immutable source','Locked source'],
    ['No backfill','No retroactive picks'],
    ['No provider spend','No extra API use'],
    ['Shadow only','Virtual only']
  ]);
  function simplifyVisibleTerms(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
      if(!n.nodeValue||!n.nodeValue.trim())return NodeFilter.FILTER_REJECT;
      const p=n.parentElement;if(!p||['SCRIPT','STYLE','NOSCRIPT'].includes(p.tagName))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{
      const raw=n.nodeValue,trim=raw.trim();
      if(simpleTerms.has(trim))n.nodeValue=raw.replace(trim,simpleTerms.get(trim));
      else{
        let out=raw;
        out=out.replace(/immutable entries/gi,'locked before kickoff');
        out=out.replace(/waiting for settlement/gi,'waiting for the result');
        out=out.replace(/verified outcomes/gi,'confirmed results');
        out=out.replace(/settled stake only/gi,'completed bets only');
        out=out.replace(/peak-to-trough/gi,'largest fall from a previous high');
        out=out.replace(/virtual exposure/gi,'virtual money used');
        out=out.replace(/out-of-sample/gi,'new, unseen-match');
        out=out.replace(/paper-trading experiment/gi,'virtual betting test');
        out=out.replace(/paper bet/gi,'virtual bet');
        out=out.replace(/paper bets/gi,'virtual bets');
        out=out.replace(/settlement/gi,'result check');
        out=out.replace(/immutable/gi,'locked');
        if(out!==raw)n.nodeValue=out;
      }
    });
  }
  simplifyVisibleTerms();
  const languageObserver=new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===Node.ELEMENT_NODE)simplifyVisibleTerms(n)})));
  if(document.body)languageObserver.observe(document.body,{childList:true,subtree:true});

  if(isHome){
    const hero=document.querySelector('.hero');if(hero&&!document.getElementById('osV2Decision'))hero.insertAdjacentElement('afterend',buildDecisionBrief());
    renderDecisionBrief();
    const target=document.getElementById('topPick');if(target)new MutationObserver(()=>renderDecisionBrief()).observe(target,{childList:true,subtree:true,attributes:true});
    setInterval(renderDecisionBrief,60000);
    try{
      if(window.innerWidth<=760&&!localStorage.getItem('argus_os_v2_seen')){
        const note=document.createElement('aside');note.className='os-v2-update';note.innerHTML='<div class="os-v2-update-top"><div><small>ARGUS OS V2</small><strong>The answer now comes first.</strong><p>Today shows the action, current odds, ARGUS fair odds, confidence, how unsure the model is, and data reliability before deeper details.</p></div><button type="button" aria-label="Dismiss ARGUS OS V2 update">×</button></div>';document.body.appendChild(note);note.querySelector('button').onclick=()=>{localStorage.setItem('argus_os_v2_seen','1');note.remove()};
      }
    }catch(_){ }
  }
})();