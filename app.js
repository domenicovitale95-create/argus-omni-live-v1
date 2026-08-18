const $ = (id) => document.getElementById(id);

const state = {
  matches: [],
  analyses: [],
  mode: 'DEMO',
  meta: null,
  filter: 'signals'
};

function tickClock() {
  $('clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

function kickoffText(match) {
  if (match.isLive) return `${match.minute || 0}' LIVE`;
  if (['FT','AET','PEN','CANC','ABD','AWD','WO'].includes(match.status)) return match.status;
  if (match.kickoff) return new Date(match.kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return match.statusLong || match.status || 'PRE-MATCH';
}

function updateQuota(meta) {
  const el = $('requestQuota');
  if (!el) return;
  const quota = meta?.quota;
  if (!quota || quota.dailyRemaining == null) {
    el.textContent = '—';
    el.classList.remove('ok');
    return;
  }
  el.textContent = quota.dailyLimit != null ? `${quota.dailyRemaining} / ${quota.dailyLimit}` : String(quota.dailyRemaining);
  el.classList.toggle('ok', quota.dailyRemaining > 20);
}

function strongestModelSide(analysis) {
  const model = analysis.model || {};
  const entries = [['HOME', model.home], ['DRAW', model.draw], ['AWAY', model.away]].filter(([,v]) => Number.isFinite(Number(v)));
  entries.sort((a,b) => Number(b[1]) - Number(a[1]));
  return entries[0] || ['—', 0];
}

function cardTemplate(match, analysis) {
  const signalClass = analysis.classification.toLowerCase().replace(' ', '-');
  const score = `${match.score?.home ?? 0} — ${match.score?.away ?? 0}`;
  const marketText = analysis.marketOdds ? `${analysis.bestMarket} @ ${analysis.marketOdds}` : (match.isLive ? 'NO LIVE 1X2 ODDS' : 'NO PRE-MATCH 1X2 ODDS');
  const [modelSide, modelProb] = strongestModelSide(analysis);
  const inputLabel = match.isLive ? 'Pressure' : 'Model lean';
  const inputValue = match.isLive ? `${analysis.pressure}/100` : (analysis.phase === 'PREMATCH' && modelProb > 0 ? `${modelSide} ${Math.round(modelProb * 100)}%` : 'NO MODEL');
  const phase = match.isLive ? 'LIVE' : (analysis.phase === 'FINISHED' ? 'FINISHED' : 'PRE-MATCH');

  return `
    <article class="match-card panel">
      <div class="match-meta">
        <small>${match.competition || 'MATCH'} · ${match.country || ''} · ${phase}</small>
        <div class="teams">${match.home} <span class="score">${score}</span> ${match.away}</div>
        <div class="minute">${kickoffText(match)}</div>
      </div>
      <div>
        <span class="mini-label">${inputLabel}</span>
        <span class="value">${inputValue}</span>
      </div>
      <div>
        <span class="mini-label">Best market</span>
        <span class="value">${marketText}</span>
      </div>
      <div class="signal ${signalClass}">
        <strong>${analysis.classification}</strong>
        <small>${analysis.marketAvailable ? `${analysis.edge > 0 ? '+' : ''}${analysis.edge}% EDGE · ${analysis.confidence}% CONF` : `${analysis.confidence}% CONF · DATA INCOMPLETE`}</small>
      </div>
    </article>
  `;
}

function classifyMatch(_match, analysis) {
  if (analysis.classification === 'PRIME') return 'prime';
  if (analysis.classification === 'WATCH') return 'watch';
  return 'no-bet';
}

function filteredRows() {
  return state.matches.map((match, index) => ({ match, analysis: state.analyses[index], type: classifyMatch(match, state.analyses[index]) }))
    .filter((row) => {
      if (state.filter === 'all') return true;
      if (state.filter === 'signals') return row.type === 'prime' || row.type === 'watch';
      return row.type === state.filter;
    });
}

function updateFilterCounts() {
  const rows = state.matches.map((match, index) => classifyMatch(match, state.analyses[index]));
  const prime = rows.filter(x => x === 'prime').length;
  const watch = rows.filter(x => x === 'watch').length;
  const noBet = rows.filter(x => x === 'no-bet').length;
  $('signalCount').textContent = prime + watch;
  $('primeFilterCount').textContent = prime;
  $('watchFilterCount').textContent = watch;
  $('noBetFilterCount').textContent = noBet;
  $('allFilterCount').textContent = rows.length;
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
  render();
}

function render() {
  const prime = state.analyses.filter(a => a?.classification === 'PRIME').length;
  const watch = state.analyses.filter(a => a?.classification === 'WATCH').length;

  $('matchCount').textContent = state.matches.length;
  $('primeCount').textContent = prime;
  $('watchCount').textContent = watch;
  $('modeLabel').textContent = state.mode;
  updateFilterCounts();
  updateQuota(state.meta);

  const stamp = state.meta?.fetchedAt ? new Date(state.meta.fetchedAt) : new Date();
  $('lastUpdate').textContent = state.matches.length
    ? `Updated ${stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : state.mode === 'TODAY' ? 'Daily feed connected · no fixture today' : 'Awaiting scan';

  const grid = $('matchGrid');
  if (!state.matches.length) {
    grid.innerHTML = `<div class="empty-state">${state.mode === 'TODAY' ? 'DAILY DATA CONNECTED — NO FIXTURE FOUND TODAY' : 'RUN A SCAN TO LOAD MATCHES'}</div>`;
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    const label = state.filter === 'signals' ? 'PRIME OR WATCH' : state.filter.toUpperCase().replace('-', ' ');
    grid.innerHTML = `<div class="empty-state">NO ${label} MATCHES CURRENTLY</div>`;
    return;
  }

  grid.innerHTML = rows.map(({ match, analysis }) => cardTemplate(match, analysis)).join('');
}

function analyzeMatches(matches, meta = null) {
  state.matches = matches;
  state.meta = meta;
  state.analyses = matches.map(match => window.ArgusEngine.analyze(match));
  render();
}

async function loadDemo() {
  $('demoBtn').disabled = true;
  $('demoBtn').textContent = 'LOADING…';
  try {
    const matches = await window.ArgusProviders.demo();
    state.mode = 'DEMO';
    analyzeMatches(matches);
  } catch (error) {
    alert(error.message);
  } finally {
    $('demoBtn').disabled = false;
    $('demoBtn').textContent = 'RUN DEMO FEED';
  }
}

async function scanToday() {
  $('scanBtn').disabled = true;
  $('scanBtn').textContent = 'ANALYZING TODAY…';
  try {
    const matches = await window.ArgusProviders.live();
    state.mode = 'TODAY';
    analyzeMatches(matches, matches.meta || null);
    $('liveStatus').textContent = 'CONNECTED';
    $('liveStatus').classList.add('ok');
  } catch (error) {
    state.mode = 'LIVE ERROR';
    $('liveStatus').textContent = 'ERROR';
    $('liveStatus').classList.remove('ok');
    render();
    alert(`${error.message}. V2 requires API_FOOTBALL_KEY on the server deployment.`);
  } finally {
    $('scanBtn').disabled = false;
    $('scanBtn').textContent = "ANALYZE TODAY'S MATCHES";
  }
}

async function detectLiveBackend() {
  const status = await window.ArgusProviders.health();
  if (status.ready) {
    $('liveStatus').textContent = 'READY';
    $('liveStatus').classList.add('ok');
    updateQuota(status.meta);
  } else {
    $('liveStatus').textContent = 'V2 BACKEND REQUIRED';
  }
}

$('demoBtn').addEventListener('click', loadDemo);
$('scanBtn').addEventListener('click', scanToday);
document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
detectLiveBackend();
