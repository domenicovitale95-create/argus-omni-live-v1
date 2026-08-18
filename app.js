const $ = (id) => document.getElementById(id);
const FINISHED_STATUSES = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);
const state = { matches: [], analyses: [], mode: 'CACHE', meta: null, filter: 'signals', sort: 'rank' };

function tickClock(){ $('clock').textContent = new Date().toLocaleTimeString([], {hour12:false}); }
setInterval(tickClock,1000); tickClock();

function isPastMatch(match, analysis){ return Boolean(match?.isFinished || FINISHED_STATUSES.has(match?.status) || analysis?.phase === 'FINISHED'); }
function kickoffText(match){
  if(match.isLive) return `LIVE ${match.minute||0}'`;
  if(FINISHED_STATUSES.has(match.status)) return 'FINAL';
  if(match.kickoff) return new Date(match.kickoff).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  return match.statusLong || match.status || 'PRE-MATCH';
}
function pct(v){ return Number.isFinite(Number(v)) ? `${(Number(v)*100).toFixed(1)}%` : '—'; }
function confidenceLabel(v){ const n=Number(v)||0; return n>=75?'HIGH':n>=55?'MEDIUM':'LOW'; }
function betLabel(analysis){
  const m=String(analysis?.bestMarket||'').toUpperCase();
  if(m==='HOME') return 'HOME WIN'; if(m==='DRAW') return 'DRAW'; if(m==='AWAY') return 'AWAY WIN';
  if(m && !['NO MARKET','MODEL PENDING'].includes(m)) return m;
  return 'NO BET RECOMMENDATION';
}
function signalType(match,analysis){
  if(isPastMatch(match,analysis)) return 'past';
  const c=String(analysis?.classification||'').toUpperCase();
  if(c.includes('PRIME')) return 'prime'; if(c.includes('STRONG VALUE')) return 'strong-value';
  if(c.includes('VALUE')) return 'value'; if(c.includes('WATCH')) return 'watch'; return 'no-bet';
}
function rankValue(type){ return ({prime:5,'strong-value':4,value:3,watch:2,'no-bet':1,past:0})[type]||0; }
function signalClass(analysis){ return signalType(null,analysis); }
function edgeNumber(a){ return Number.isFinite(Number(a?.edge)) ? Number(a.edge) : -999; }
function kickoffNumber(m){ return Number(m?.timestamp)|| (m?.kickoff ? new Date(m.kickoff).getTime()/1000 : Number.MAX_SAFE_INTEGER); }
function dataQualityText(a){ return Number.isFinite(Number(a?.quality)) ? `DATA QUALITY ${Math.round(Number(a.quality))}%` : 'LIMITED DATA'; }
function reasonText(match,a){
  if(isPastMatch(match,a)) return 'Finished match archived outside active signals.';
  if(!a?.marketAvailable) return 'Market pricing is incomplete, so ARGUS will not force an actionable edge.';
  if(a?.conservativeEV!=null && Number(a.conservativeEV)>0) return match.isLive ? 'Current live state and price retain positive conservative value.' : 'Current market price survives ARGUS conservative value testing.';
  if(signalType(match,a)==='watch') return 'Potential pricing discrepancy exists, but ARGUS governance requires more margin or stronger evidence.';
  return 'ARGUS does not find enough robust value at the current price.';
}
function historyText(match){
  const h=match.history90d?.home,a=match.history90d?.away;
  return h&&a ? `90D PPG ${Number(h.pointsPerGame||0).toFixed(2)} — ${Number(a.pointsPerGame||0).toFixed(2)}` : '90D HISTORY LIMITED';
}

function rowsWithTypes(){ return state.matches.map((match,index)=>({match,analysis:state.analyses[index],type:signalType(match,state.analyses[index]),index})); }
function sortRows(rows){
  return rows.slice().sort((a,b)=>{
    if(state.sort==='confidence') return (Number(b.analysis?.confidence)||0)-(Number(a.analysis?.confidence)||0);
    if(state.sort==='edge') return edgeNumber(b.analysis)-edgeNumber(a.analysis);
    if(state.sort==='kickoff') return kickoffNumber(a.match)-kickoffNumber(b.match);
    if(state.sort==='live') return Number(Boolean(b.match.isLive))-Number(Boolean(a.match.isLive)) || rankValue(b.type)-rankValue(a.type);
    return rankValue(b.type)-rankValue(a.type) || (Number(b.analysis?.confidence)||0)-(Number(a.analysis?.confidence)||0) || edgeNumber(b.analysis)-edgeNumber(a.analysis) || kickoffNumber(a.match)-kickoffNumber(b.match);
  });
}
function activeRows(){ return rowsWithTypes().filter(r=>r.type!=='past'); }
function actionableRows(){ return sortRows(activeRows().filter(r=>['prime','strong-value','value','watch'].includes(r.type))); }
function filteredRows(){
  let rows=rowsWithTypes();
  if(state.filter==='past') rows=rows.filter(r=>r.type==='past');
  else { rows=rows.filter(r=>r.type!=='past'); if(state.filter==='signals') rows=rows.filter(r=>['prime','strong-value','value','watch'].includes(r.type)); else if(state.filter==='value') rows=rows.filter(r=>['value','strong-value'].includes(r.type)); else if(state.filter!=='all') rows=rows.filter(r=>r.type===state.filter); }
  return sortRows(rows);
}

function updateQuota(meta){
  const q=meta?.quota; const remaining=q?.dailyRemaining; const limit=q?.dailyLimit;
  const text=remaining==null?'—':(limit!=null?`${remaining}/${limit}`:String(remaining));
  $('requestQuota').textContent=text; $('heroQuota').textContent=text;
  const safe=remaining!=null && Number(remaining)<=10;
  $('safeModeChip').classList.toggle('visible',safe);
  if(safe){ $('scanBtn').textContent = meta?.clientCache ? 'API BUDGET PROTECTED' : "ANALYZE TODAY'S MATCHES"; }
}
function updateHistoryCoverage(meta){ $('historyCoverage').textContent=(meta?.historyTeamsCovered!=null&&meta?.historyTeamsTotal!=null)?`${meta.historyTeamsCovered}/${meta.historyTeamsTotal}`:'—'; }
function updateGovernanceStatus(){
  const s=window.ArgusGovernance?.systemStatus?.(); $('calibrationStatus').textContent=s?.calibration||'UNKNOWN'; $('primeGateStatus').textContent=s?.primeGate||'UNKNOWN'; $('trackRecordCount').textContent=window.ArgusTrackRecord?.count?.()??0;
}

function opportunityCard(row,isTop=false){
  const {match,analysis,type,index}=row; const edge=Number.isFinite(Number(analysis.edge))?`${Number(analysis.edge)>=0?'+':''}${Number(analysis.edge).toFixed(1)}%`:'UNAVAILABLE';
  return `<article class="opportunity-card ${type} ${isTop?'number-one':''}">
    <div class="opp-head"><span class="signal-badge ${type}">${isTop?'#1 · ':''}${String(analysis.classification||type).toUpperCase()}</span><span>${match.isLive?kickoffText(match):kickoffText(match)}</span></div>
    <h4>${match.home} <em>vs</em> ${match.away}</h4>
    <div class="bet-block"><span>ARGUS BET</span><strong>${betLabel(analysis)}</strong></div>
    <div class="opp-metrics"><div><span>CONFIDENCE</span><strong>${confidenceLabel(analysis.confidence)} · ${analysis.confidence||0}%</strong></div><div><span>EDGE</span><strong>${edge}</strong></div></div>
    <p>${reasonText(match,analysis)}</p>
    <button class="detail-btn" data-detail-index="${index}">VIEW ARGUS ANALYSIS</button>
  </article>`;
}
function renderTopOpportunities(){
  const rows=actionableRows().slice(0,5); const top=$('topPick'), grid=$('topOpportunities');
  if(!rows.length){ top.className='top-pick empty-pick panel'; top.innerHTML='<span class="pick-kicker">ARGUS #1 PICK</span><strong>NO PRIME / VALUE / WATCH RIGHT NOW</strong><small>ARGUS has not found sufficient edge to justify an actionable position.</small>'; grid.innerHTML=''; return; }
  top.className=`top-pick panel ${rows[0].type}`; top.innerHTML=opportunityCard(rows[0],true);
  grid.innerHTML=rows.slice(1).map(r=>opportunityCard(r,false)).join('');
}

function cardTemplate(match,a,index){
  const type=signalType(match,a), past=type==='past'; const edge=Number.isFinite(Number(a.edge))?`${Number(a.edge)>=0?'+':''}${Number(a.edge).toFixed(1)}%`:'EDGE DATA UNAVAILABLE';
  if(past) return `<article class="match-card passed panel"><div class="match-main"><div class="match-topline"><span>${match.competition||'MATCH'} · ${match.country||''}</span><b>FINAL</b></div><h4>${match.home} <span>${match.score?.home??0} — ${match.score?.away??0}</span> ${match.away}</h4><p>Completed · archived outside active betting categories.</p></div><div class="passed-tag">PASSED</div></article>`;
  const canRecord=a.marketAvailable&&a.classification!=='NO BET';
  return `<article class="match-card panel ${type}">
    <div class="match-main"><div class="match-topline"><span>${match.competition||'MATCH'} · ${match.country||''}</span><b>${kickoffText(match)}</b></div><h4>${match.home} <em>vs</em> ${match.away}</h4><p>${historyText(match)}</p></div>
    <div class="decision-cell"><span>ARGUS BET</span><strong>${betLabel(a)}</strong><small>${reasonText(match,a)}</small></div>
    <div class="confidence-cell"><span>CONFIDENCE</span><strong>${confidenceLabel(a.confidence)} · ${a.confidence||0}%</strong><div class="confidence-bar"><i style="width:${Math.max(0,Math.min(100,Number(a.confidence)||0))}%"></i></div><small>${dataQualityText(a)}</small></div>
    <div class="signal ${type}"><strong>${a.classification}</strong><small>${edge}</small><button class="detail-btn tiny" data-detail-index="${index}">DETAILS</button>${canRecord?`<button class="record-btn" data-record-index="${index}">FREEZE V8</button>`:''}</div>
    <div class="analysis-detail" id="detail-${index}"><span>RAW ${pct(a.rawProbability)}</span><span>SHRUNK ${pct(a.shrunkProbability)}</span><span>CONSERVATIVE ${pct(a.conservativeProbability)}</span><span>CONS EV ${a.conservativeEV==null?'—':`${a.conservativeEV}%`}</span><span>${a.engineStatus||'ENGINE STATUS UNKNOWN'}</span><span>${a.shrinkageStatus||''}</span></div>
  </article>`;
}

function bindButtons(){
  document.querySelectorAll('[data-detail-index]').forEach(btn=>btn.addEventListener('click',()=>{ const el=$(`detail-${btn.dataset.detailIndex}`); if(el) el.classList.toggle('open'); else { state.filter='all'; renderBoard(); setTimeout(()=>{const d=$(`detail-${btn.dataset.detailIndex}`); d?.classList.add('open'); d?.scrollIntoView({behavior:'smooth',block:'center'});},0); } }));
  document.querySelectorAll('[data-record-index]').forEach(btn=>btn.addEventListener('click',()=>{ try{ const i=Number(btn.dataset.recordIndex); const f=window.ArgusTrackRecord.record(state.matches[i],state.analyses[i]); btn.textContent='FROZEN ✓';btn.disabled=true;updateGovernanceStatus();alert(`V8 record frozen: ${f.prediction_id}`);}catch(e){alert(e.message);} }));
}
function updateCounts(){
  const rows=rowsWithTypes(), active=rows.filter(r=>r.type!=='past');
  const prime=active.filter(r=>r.type==='prime').length, value=active.filter(r=>['value','strong-value'].includes(r.type)).length, watch=active.filter(r=>r.type==='watch').length, noBet=active.filter(r=>r.type==='no-bet').length, past=rows.filter(r=>r.type==='past').length;
  $('signalCount').textContent=prime+value+watch; $('primeFilterCount').textContent=prime; $('valueFilterCount').textContent=value; $('watchFilterCount').textContent=watch; $('noBetFilterCount').textContent=noBet; $('allFilterCount').textContent=active.length; $('pastFilterCount').textContent=past;
  $('heroAnalysed').textContent=active.length; $('heroPrime').textContent=prime; $('heroWatch').textContent=watch; $('todayCounts').textContent=`${prime} PRIME · ${value} VALUE · ${watch} WATCH · ${noBet} NO BET · ${past} PASSED`;
  const best=actionableRows()[0]; $('strongestSignal').textContent=best?`Strongest signal: ${best.match.home} vs ${best.match.away} — ${betLabel(best.analysis)} — ${best.analysis.confidence||0}% confidence`:'No current actionable signal.';
}
function renderBoard(){
  updateCounts(); renderTopOpportunities();
  const grid=$('matchGrid'), rows=filteredRows();
  if(!state.matches.length){ grid.innerHTML='<div class="empty-state">NO DATA LOADED · USE ANALYZE TODAY\'S MATCHES</div>'; return; }
  if(!rows.length){ const msg=state.filter==='prime'?'NO PRIME BETS RIGHT NOW':state.filter==='signals'?'NO ACTIONABLE BETS RIGHT NOW':`NO ${state.filter.toUpperCase()} MATCHES`; grid.innerHTML=`<div class="empty-state"><strong>${msg}</strong><span>ARGUS will not manufacture a position when the edge is insufficient.</span></div>`; return; }
  grid.innerHTML=rows.map(r=>cardTemplate(r.match,r.analysis,r.index)).join(''); bindButtons();
}
function render(){
  updateQuota(state.meta); updateHistoryCoverage(state.meta); updateGovernanceStatus();
  const stamp=state.meta?.fetchedAt?new Date(state.meta.fetchedAt):null; const t=stamp?stamp.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—'; $('heroUpdate').textContent=t; $('lastUpdate').textContent=stamp?`Updated ${t}${state.meta?.clientCache?' · CACHED':''}`:'Awaiting scan';
  renderBoard();
}
function analyzeMatches(matches,meta=null){ state.matches=matches; state.meta=meta; state.analyses=matches.map(m=>{const base=window.ArgusEngine.analyze(m);return window.ArgusGovernance?window.ArgusGovernance.apply(base,m):base;}); render(); }

async function scanToday(){
  $('scanBtn').disabled=true; const cache=window.ArgusProviders.cacheStatus?.(); $('scanBtn').textContent=cache?.safeMode&&cache?.fresh?'API BUDGET PROTECTED':'ANALYZING…';
  try{ const matches=await window.ArgusProviders.live({force:false}); state.mode=matches.meta?.clientCache?'CACHE':'TODAY'; analyzeMatches(matches,matches.meta||null); $('liveStatus').textContent=matches.meta?.clientCache?'CACHED':'CONNECTED'; }
  catch(e){ $('liveStatus').textContent='ERROR'; alert(e.message); }
  finally{ $('scanBtn').disabled=false; const c=window.ArgusProviders.cacheStatus?.(); $('scanBtn').textContent=c?.safeMode&&c?.fresh?'API BUDGET PROTECTED':"ANALYZE TODAY'S MATCHES"; }
}
async function detectLiveBackend(){
  const s=await window.ArgusProviders.health(); $('liveStatus').textContent=s.cached?'CACHE READY':'READY'; if(s.meta){ updateQuota(s.meta);updateHistoryCoverage(s.meta); }
  if(Array.isArray(s.matches)&&s.matches.length){ const m=s.matches.slice();m.meta=s.meta||null;state.mode='CACHE';analyzeMatches(m,s.meta||null); } else render();
}
function setFilter(f){state.filter=f;document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));renderBoard();}
$('scanBtn').addEventListener('click',scanToday);
document.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
$('sortSelect').addEventListener('change',e=>{state.sort=e.target.value;renderBoard();});
detectLiveBackend();
