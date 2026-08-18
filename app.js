const $ = (id) => document.getElementById(id);

const state = {
  matches: [],
  analyses: [],
  mode: 'DEMO',
  meta: null
};

function tickClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString([], { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

function kickoffText(match) {
  if (match.isLive) return `${match.minute || 0}' LIVE`;
  if (['FT','AET','PEN'].includes(match.status)) return match.status;
  if (match.kickoff) {
    return new Date(match.kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return match.statusLong || match.status || 'SCHEDULED';
}

function cardTemplate(match, analysis) {
  const signalClass = analysis.classification.toLowerCase().replace(' ', '-');
  const score = `${match.score?.home ?? 0} — ${match.score?.away ?? 0}`;
  const marketText = analysis.marketOdds ? `${analysis.bestMarket} @ ${analysis.marketOdds}` : (match.isLive ? 'NO LIVE 1X2 ODDS' : 'PRE-MATCH / NO LIVE EDGE');
  const decision = match.isLive ? analysis.classification : 'SCHEDULED';
  const decisionClass = match.isLive ? signalClass : 'no-bet';
  return `
    <article class="match-card panel">
      <div class="match-meta">
        <small>${match.competition || 'MATCH'} · ${match.country || ''} · ${match.status || 'NS'}</small>
        <div class="teams">${match.home} <span class="score">${score}</span> ${match.away}</div>
        <div class="minute">${kickoffText(match)}</div>
      </div>
      <div>
        <span class="mini-label">Pressure</span>
        <span class="value">${match.isLive ? `${analysis.pressure}/100` : '—'}</span>
      </div>
      <div>
        <span class="mini-label">Best market</span>
        <span class="value">${marketText}</span>
      </div>
      <div class="signal ${decisionClass}">
        <strong>${decision}</strong>
        <small>${match.isLive ? `${analysis.edge > 0 ? '+' : ''}${analysis.edge}% EDGE · ${analysis.confidence}% CONF` : 'DAILY MATCH CENTER'}</small>
      </div>
    </article>
  `;
}

function render() {
  const prime = state.matches.filter((m, i) => m.isLive && state.analyses[i]?.classification === 'PRIME').length;
  const watch = state.matches.filter((m, i) => m.isLive && state.analyses[i]?.classification === 'WATCH').length;

  $('matchCount').textContent = state.matches.length;
  $('primeCount').textContent = prime;
  $('watchCount').textContent = watch;
  $('modeLabel').textContent = state.mode;

  const stamp = state.meta?.fetchedAt ? new Date(state.meta.fetchedAt) : new Date();
  $('lastUpdate').textContent = state.matches.length
    ? `Updated ${stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : state.mode === 'TODAY' ? 'Daily feed connected · no fixture today' : 'Awaiting scan';

  const grid = $('matchGrid');
  if (!state.matches.length) {
    grid.innerHTML = `<div class="empty-state">${state.mode === 'TODAY' ? 'DAILY DATA CONNECTED — NO FIXTURE FOUND TODAY' : 'RUN A SCAN TO LOAD MATCHES'}</div>`;
    return;
  }

  grid.innerHTML = state.matches.map((match, index) => cardTemplate(match, state.analyses[index])).join('');
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
  $('scanBtn').textContent = 'LOADING TODAY…';
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
    $('scanBtn').textContent = "LOAD TODAY'S MATCHES";
  }
}

async function detectLiveBackend() {
  const status = await window.ArgusProviders.health();
  if (status.ready) {
    $('liveStatus').textContent = 'READY';
    $('liveStatus').classList.add('ok');
  } else {
    $('liveStatus').textContent = 'V2 BACKEND REQUIRED';
  }
}

$('demoBtn').addEventListener('click', loadDemo);
$('scanBtn').addEventListener('click', scanToday);
detectLiveBackend();
