const $ = (id) => document.getElementById(id);

const state = {
  matches: [],
  analyses: [],
  mode: 'DEMO'
};

function tickClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString([], { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

function formatPct(value) {
  return `${Math.round(value)}%`;
}

function cardTemplate(match, analysis) {
  const signalClass = analysis.classification.toLowerCase().replace(' ', '-');
  const score = `${match.score?.home ?? 0} — ${match.score?.away ?? 0}`;
  return `
    <article class="match-card panel">
      <div class="match-meta">
        <small>${match.competition || 'LIVE MATCH'} · ${match.status || 'IN PLAY'}</small>
        <div class="teams">${match.home} <span class="score">${score}</span> ${match.away}</div>
        <div class="minute">${match.minute || 0}' LIVE</div>
      </div>
      <div>
        <span class="mini-label">Pressure</span>
        <span class="value">${analysis.pressure}/100</span>
      </div>
      <div>
        <span class="mini-label">Best market</span>
        <span class="value">${analysis.bestMarket} @ ${analysis.marketOdds || '—'}</span>
      </div>
      <div class="signal ${signalClass}">
        <strong>${analysis.classification}</strong>
        <small>${analysis.edge > 0 ? '+' : ''}${analysis.edge}% EDGE · ${analysis.confidence}% CONF</small>
      </div>
    </article>
  `;
}

function render() {
  const prime = state.analyses.filter(a => a.classification === 'PRIME').length;
  const watch = state.analyses.filter(a => a.classification === 'WATCH').length;

  $('matchCount').textContent = state.matches.length;
  $('primeCount').textContent = prime;
  $('watchCount').textContent = watch;
  $('modeLabel').textContent = state.mode;
  $('lastUpdate').textContent = state.matches.length ? `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Awaiting scan';

  const grid = $('matchGrid');
  if (!state.matches.length) return;

  grid.innerHTML = state.matches.map((match, index) => cardTemplate(match, state.analyses[index])).join('');
}

function analyzeMatches(matches) {
  state.matches = matches;
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

async function scanLive() {
  $('scanBtn').disabled = true;
  $('scanBtn').textContent = 'SCANNING…';
  try {
    const matches = await window.ArgusProviders.live();
    state.mode = 'LIVE';
    analyzeMatches(matches);
  } catch (error) {
    state.mode = window.ARGUS_LIVE_ENDPOINT ? 'LIVE ERROR' : 'DEMO';
    render();
    alert(`${error.message}. Configure a secure live-data endpoint before using live mode.`);
  } finally {
    $('scanBtn').disabled = false;
    $('scanBtn').textContent = 'SCAN LIVE MATCHES';
  }
}

$('demoBtn').addEventListener('click', loadDemo);
$('scanBtn').addEventListener('click', scanLive);

if (window.ARGUS_LIVE_ENDPOINT) {
  $('liveStatus').textContent = 'READY';
  $('liveStatus').classList.add('ok');
}
