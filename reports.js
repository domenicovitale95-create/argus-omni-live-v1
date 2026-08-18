const $=(id)=>document.getElementById(id);

function n(v,d=0){return Number.isFinite(Number(v))?Number(v):d;}
function pct(v){return v==null?'—':`${n(v).toFixed(1)}%`;}
function pl(v){if(v==null)return '—';const x=n(v);return `${x>=0?'+':''}${x.toFixed(2)}u`;}
function cls(outcome){return String(outcome||'').toLowerCase().replace(/\s+/g,'-');}
function predictionLabel(p){
  if(!p)return 'NO SNAPSHOT';
  const s=String(p.selection||'').toUpperCase();
  if(s==='HOME')return 'HOME WIN';if(s==='AWAY')return 'AWAY WIN';if(s==='DRAW')return 'DRAW';return s||'NO BET';
}

function globalSummary(reports){
  const sums=reports.map(r=>r.summary||{});
  const total=(k)=>sums.reduce((a,s)=>a+n(s[k]),0);
  const settled=total('settled'),wins=total('wins'),bets=total('actionableSettled'),betWins=total('actionableWins'),flat=sums.reduce((a,s)=>a+n(s.flatStakePL),0);
  const cards=[
    ['REPORTS',reports.length],['PREDICTIONS',total('predicted')],['HIT RATE',settled?`${(wins/settled*100).toFixed(1)}%`:'—'],['ACTIONABLE',bets],['BET HIT RATE',bets?`${(betWins/bets*100).toFixed(1)}%`:'—'],['FLAT P/L',`${flat>=0?'+':''}${flat.toFixed(2)}u`]
  ];
  $('globalSummary').innerHTML=cards.map(([a,b])=>`<article class="panel"><span>${a}</span><strong>${b}</strong></article>`).join('');
}

function dailyCard(r){
  const s=r.summary||{};
  const rows=(r.matches||[]).map(m=>{
    const p=m.prediction;
    const conf=p?.confidence==null?'—':`${p.confidence}%`;
    const edge=p?.edge==null?'—':`${n(p.edge)>=0?'+':''}${n(p.edge).toFixed(1)}%`;
    const score=m.finalScore?`${m.finalScore.home} — ${m.finalScore.away}`:(m.finalStatus||'PENDING');
    return `<div class="report-row">
      <div><strong>${m.home||'—'} vs ${m.away||'—'}</strong><small>${m.competition||''} · ${score}</small></div>
      <div><strong>${p?.classification||'NO RECORD'}</strong><small>${p?.phase||'—'}</small></div>
      <div><strong>${predictionLabel(p)}</strong><small>${p?.odds?`@ ${p.odds}`:'NO ODDS'}</small></div>
      <div><strong>${conf}</strong><small>EDGE ${edge}</small></div>
      <div class="outcome ${cls(m.outcome)}">${m.outcome||'—'}</div>
      <div><strong>${pl(m.pl)}</strong><small>${m.snapshotCount||0} SNAPSHOT(S)</small></div>
    </div>`;
  }).join('');
  return `<article class="daily-report panel">
    <div class="daily-head">
      <div><p class="eyebrow">DAILY REPORT</p><h3>${r.date}</h3><p>${r.integrity||''}</p></div>
      <div class="daily-stats"><span>${s.predicted||0} predictions</span><span>${pct(s.hitRate)} hit rate</span><span>${s.actionableSettled||0} actionable</span><span>${pct(s.roi)} ROI</span><span>${pl(s.flatStakePL)}</span></div>
    </div>
    <div class="report-table">${rows||'<div class="empty-state">AUCUNE PRÉDICTION ENREGISTRÉE</div>'}</div>
    <div class="integrity">${r.methodology||''}</div>
  </article>`;
}

async function load(){
  try{
    const res=await fetch('/api/daily-report?mode=list&limit=60',{headers:{Accept:'application/json'},cache:'no-store'});
    const payload=await res.json();
    const reports=Array.isArray(payload.reports)?payload.reports:[];
    if(payload.storageReady===false){$('storageWarning').innerHTML='<div class="storage-warning">ARCHIVE PERSISTANTE NON CONFIGURÉE — crée un Vercel Blob privé pour activer l’enregistrement automatique des prédictions et les rapports quotidiens.</div>';}
    globalSummary(reports);
    $('reportCount').textContent=`${reports.length} rapport${reports.length===1?'':'s'}`;
    $('reportList').innerHTML=reports.length?reports.map(dailyCard).join(''):'<div class="empty-state">AUCUN RAPPORT ENCORE · LE PREMIER SERA CRÉÉ APRÈS LA PROCHAINE CLÔTURE QUOTIDIENNE</div>';
  }catch(e){
    $('reportList').innerHTML=`<div class="empty-state">ERREUR DE CHARGEMENT · ${e.message}</div>`;
  }
}
load();
