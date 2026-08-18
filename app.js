const $ = (id) => document.getElementById(id);

const FINISHED_STATUSES = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);

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

function isPastMatch(match, analysis) {
  return Boolean(match?.isFinished || FINISHED_STATUSES.has(match?.status) || analysis?.phase === 'FINISHED');
}

function kickoffText(match) {
  if (match.isLive) return `${match.minute || 0}' LIVE`;
  if (FINISHED_STATUSES.has(match.status)) return match.status;
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

function updateHistoryCoverage(meta) {
  const el = $('historyCoverage');
  if (!el) return;
  if (meta?.historyTeamsCovered == null || meta?.historyTeamsTotal == null) {
    el.textContent = '—';
    el.classList.remove('ok');
    return;
  }
  el.textContent = `${meta.historyTeamsCovered} / ${meta.historyTeamsTotal}`;
  el.classList.toggle('ok', meta.historyTeamsTotal > 0 && meta.historyTeamsCovered === meta.historyTeamsTotal);
}

function updateGovernanceStatus() {
  const status = window.ArgusGovernance?.systemStatus?.();
  if ($('calibrationStatus')) $('calibrationStatus').textContent = status?.calibration || 'UNKNOWN';
  if ($('primeGateStatus')) $('primeGateStatus').textContent = status?.primeGate || 'UNKNOWN';
  if ($('trackRecordCount')) $('trackRecordCount').textContent = window.ArgusTrackRecord?.count?.() ?? 0;
}

function historyFormText(match) {
  const home = match.history90d?.home;
  const away = match.history90d?.away;
  if (!home || !away) return null;
  return `H ${Number(home.pointsPerGame || 0).toFixed(2)} · A ${Number(away.pointsPerGame || 0).toFixed(2)} PPG`;
}

function pct(v) {
  return Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(1)}%` : '—';
}

function signalClass(analysis) {
  const c = String(analysis.classification || 'NO BET').toUpperCase();
  if (c.includes('PRIME')) return 'prime';
  if (c.includes('STRONG VALUE')) return 'strong-value';
  if (c.includes('VALUE')) return 'value';
  if (c.includes('WATCH')) return 'watch';
  return 'no-bet';
}

function cardTemplate(match, analysis, stateIndex) {
  const past = isPastMatch(match, analysis);
  const score = `${match.score?.home ?? 0} — ${match.score?.away ?? 0}`;
  const marketText = analysis.marketOdds ? `${analysis.bestMarket} @ ${analysis.marketOdds}` : (match.isLive ? 'NO LIVE 1X2 ODDS' : 'NO PRE-MATCH 1X2 ODDS');
  const historyText = historyFormText(match);
  const inputLabel = match.isLive ? 'Pressure' : '90D form';
  const inputValue = match.isLive ? `${analysis.pressure ?? '—'}/100` : (historyText || 'HISTORY INCOMPLETE');
  const phase = match.isLive ? 'LIVE' : (past ? 'FINISHED' : 'PRE-MATCH');
  const modelLine = `RAW ${pct(analysis.rawProbability)} · SHR ${pct(analysis.shrunkProbability)} · CONS ${pct(analysis.conservativeProbability)}`;
  const evLine = analysis.conservativeEV == null
    ? `${analysis.confidence ?? 0}% CONF · ${analysis.governanceReason || 'DATA INCOMPLETE'}`
    : `CONS EV ${analysis.conservativeEV >= 0 ? '+' : ''}${analysis.conservativeEV}% · ${analysis.confidence}% CONF`;
  const canRecord = !past && analysis.marketAvailable && analysis.classification !== 'NO BET';

  return `
    <article class="match-card panel">
      <div class="match-meta">
        <small>${match.competition || 'MATCH'} · ${match.country || ''} · ${phase}</small>
        <div class="teams">${match.home} <span class="score">${score}</span> ${match.away}</div>
        <div class="minute">${kickoffText(match)}</div>
        ${canRecord ? `<button class="record-btn" data-record-index="${stateIndex}">FREEZE V8 RECORD</button>` : ''}
      </div>
      <div>
        <span class="mini-label">${inputLabel}</span>
        <span class="value">${past ? 'FINAL' : inputValue}</span>
        <small class="governance-line">${past ? 'ARCHIVED RESULT' : (analysis.engineStatus || 'ENGINE STATUS UNKNOWN')}</small>
      </div>
      <div>
        <span class="mini-label">${past ? 'Match status' : 'Current market'}</span>
        <span class="value">${past ? 'COMPLETED' : marketText}</span>
        <small class="governance-line">${past ? 'Excluded from active signal categories' : modelLine}</small>
      </div>
      <div class="signal ${past ? 'no-bet' : signalClass(analysis)}">
        <strong>${past ? 'PAST MATCH' : analysis.classification}</strong>
        <small>${past ? 'FINISHED · ARCHIVED' : evLine}</small>
        <small>${past ? '' : (analysis.shrinkageStatus || '')}</small>
      </div>
    </article>
  `;
}

function classifyMatch(match, analysis) {
  if (isPastMatch(match, analysis)) return 'past';
  const c = String(analysis?.classification || '').toUpperCase();
  if (c.includes('PRIME')) return 'prime';
  if (c.includes('STRONG VALUE')) return 'strong-value';
  if (c.includes('VALUE')) return 'value';
  if (c.includes('WATCH')) return 'watch';
  return 'no-bet';
}

function rowsWithTypes() {
  return state.matches.map((match, index) => ({ match, analysis: state.analyses[index], type: classifyMatch(match, state.analyses[index]), index }));
}

function filteredRows() {
  return rowsWithTypes().filter((row) => {
    if (state.filter === 'past') return row.type === 'past';
    if (row.type === 'past') return false;
    if (state.filter === 'all') return true;
    if (state.filter === 'signals') return ['prime','strong-value','value','watch'].includes(row.type);
    if (state.filter === 'value') return row.type === 'value' || row.type === 'strong-value';
    return row.type === state.filter;
  });
}

function updateFilterCounts() {
  const rows = rowsWithTypes().map(r => r.type);
  const activeRows = rows.filter(x => x !== 'past');
  const prime = activeRows.filter(x => x === 'prime').length;
  const value = activeRows.filter(x => x === 'value' || x === 'strong-value').length;
  const watch = activeRows.filter(x => x === 'watch').length;
  const noBet = activeRows.filter(x => x === 'no-bet').length;
  const past = rows.filter(x => x === 'past').length;
  $('signalCount').textContent = prime + value + watch;
  $('primeFilterCount').textContent = prime;
  $('valueFilterCount').textContent = value;
  $('watchFilterCount').textContent = watch;
  $('noBetFilterCount').textContent = noBet;
  $('allFilterCount').textContent = activeRows.length;
  $('pastFilterCount').textContent = past;
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
  render();
}

function bindRecordButtons() {
  document.querySelectorAll('[data-record-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.recordIndex);
      try {
        const frozen = window.ArgusTrackRecord.record(state.matches[index], state.analyses[index]);
        btn.textContent = 'FROZEN ✓';
        btn.disabled = true;
        updateGovernanceStatus();
        alert(`V8 record frozen: ${frozen.prediction_id}`);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function render() {
  const activePairs = state.matches.map((m, i) => ({ match: m, analysis: state.analyses[i] })).filter(x => !isPastMatch(x.match, x.analysis));
  const prime = activePairs.filter(x => classifyMatch(x.match, x.analysis) === 'prime').length;
  const watch = activePairs.filter(x => classifyMatch(x.match, x.analysis) === 'watch').length;

  $('matchCount').textContent = state.matches.length;
  $('primeCount').textContent = prime;
  $('watchCount').textContent = watch;
  $('modeLabel').textContent = state.mode;
  updateFilterCounts();
  updateQuota(state.meta);
  updateHistoryCoverage(state.meta);
  updateGovernanceStatus();

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
    const labels = { signals: 'ACTIONABLE / WATCH', past: 'PAST MATCH', all: 'ACTIVE' };
    const label = labels[state.filter] || state.filter.toUpperCase().replace('-', ' ');
    grid.innerHTML = `<div class="empty-state">NO ${label} MATCHES CURRENTLY</div>`;
    return;
  }

  grid.innerHTML = rows.map(({ match, analysis, index }) => cardTemplate(match, analysis, index)).join('');
  bindRecordButtons();
}

function analyzeMatches(matches, meta = null) {
  state.matches = matches;
  state.meta = meta;
  state.analyses = matches.map(match => {
    const base = window.ArgusEngine.analyze(match);
    return window.ArgusGovernance ? window.ArgusGovernance.apply(base, match) : base;
  });
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
    updateHistoryCoverage(status.meta);
  } else {
    $('liveStatus').textContent = 'V2 BACKEND REQUIRED';
  }
  updateGovernanceStatus();
}

$('demoBtn').addEventListener('click', loadDemo);
$('scanBtn').addEventListener('click', scanToday);
document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
detectLiveBackend();
