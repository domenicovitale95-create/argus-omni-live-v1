(function(){
  function insert(){
    if(document.getElementById('trainingPanel'))return;
    const anchor=document.querySelector('.market-shortcuts');if(!anchor)return;
    const section=document.createElement('section');section.id='trainingPanel';section.className='training-panel';
    section.innerHTML='<div class="training-head"><div><p class="eyebrow">ARGUS SELF-IMPROVEMENT</p><h3>How much should ARGUS trust itself?</h3><p>This panel does not create new predictions. It audits current data quality, reliability profiles, adaptive learning and track-record maturity.</p><span id="trainingStatus" class="training-status">WAITING FOR DATA</span></div><div class="training-score"><span>Current trust score</span><strong id="trainingScore">—</strong></div></div><div class="training-grid"><div class="training-metric"><span>Strong data matches</span><strong id="trainingStrong">—</strong></div><div class="training-metric"><span>Weak data matches</span><strong id="trainingWeak">—</strong></div><div class="training-metric"><span>Settled predictions</span><strong id="trainingSettled">—</strong></div><div class="training-metric"><span>Learning profiles</span><strong id="trainingProfiles">—</strong></div></div><div class="training-next"><span>What ARGUS still needs to improve</span><ul id="trainingNext"><li>Waiting for current cached data.</li></ul></div>';
    anchor.insertAdjacentElement('afterend',section);
  }
  function refresh(){
    insert();if(!window.ArgusSelfImprovement||!window.ArgusEngine)return;
    const row=window.ArgusProviders?.readCache?.();const matches=row?.matches||[];
    if(!matches.length)return;
    const analyses=matches.map(m=>{const base=window.ArgusEngine.analyze(m);return window.ArgusGovernance?window.ArgusGovernance.apply(base,m):base});
    const s=window.ArgusSelfImprovement.systemSnapshot(matches,analyses);
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
    set('trainingScore',`${s.avg}/100`);set('trainingStrong',`${s.strong}/${s.total}`);set('trainingWeak',String(s.weak));set('trainingSettled',String(s.track.settled||0));set('trainingProfiles',`${s.learned} learned · ${s.caution} caution`);
    const status=document.getElementById('trainingStatus');if(status){status.className='training-status '+(s.avg>=75?'':s.avg>=55?'caution':'weak');status.textContent=s.avg>=75?'TRAINING HEALTHY':s.avg>=55?'TRAINING CAUTIOUS':'TRAINING WEAK'}
    const ul=document.getElementById('trainingNext');if(ul)ul.innerHTML=s.next.map(x=>`<li>${x}</li>`).join('');
  }
  document.addEventListener('DOMContentLoaded',()=>{insert();setTimeout(refresh,500);setTimeout(refresh,1800)});setInterval(refresh,15000);
})();