const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL_MS = 60_000;
const DISPLAY_TIMEZONE = 'Europe/Brussels';
const MAX_DETAILED_LIVE_FIXTURES = 6;
const MAX_PREMATCH_PREDICTIONS = 30;
const MAX_ODDS_PAGES = 5;
const QUOTA_RESERVE = 20;
const LIVE_STATUSES = new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
const FINISHED_STATUSES = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);

let cache = { at: 0, payload: null };
let apiQuota = {
  dailyLimit: null,
  dailyRemaining: null,
  minuteLimit: null,
  minuteRemaining: null,
  observedAt: null
};

function apiHeaders() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not configured');
  return { 'x-apisports-key': key, Accept: 'application/json' };
}

function numericHeader(headers, name) {
  const raw = headers.get(name);
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function captureQuota(headers) {
  const dailyLimit = numericHeader(headers, 'x-ratelimit-requests-limit');
  const dailyRemaining = numericHeader(headers, 'x-ratelimit-requests-remaining');
  const minuteLimit = numericHeader(headers, 'x-ratelimit-limit');
  const minuteRemaining = numericHeader(headers, 'x-ratelimit-remaining');
  if (dailyLimit !== null) apiQuota.dailyLimit = dailyLimit;
  if (dailyRemaining !== null) apiQuota.dailyRemaining = dailyRemaining;
  if (minuteLimit !== null) apiQuota.minuteLimit = minuteLimit;
  if (minuteRemaining !== null) apiQuota.minuteRemaining = minuteRemaining;
  apiQuota.observedAt = new Date().toISOString();
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: apiHeaders() });
  captureQuota(response.headers);
  if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  const data = await response.json();
  if (data?.errors && Object.keys(data.errors).length) {
    throw new Error(`API-Football: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

function quotaMeta() { return { ...apiQuota }; }

function todayInTimezone(timeZone = DISPLAY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function statValue(stats = [], name) {
  const item = stats.find((entry) => String(entry.type).toLowerCase() === name.toLowerCase());
  if (!item || item.value == null) return null;
  if (typeof item.value === 'string' && item.value.endsWith('%')) return Number(item.value.replace('%', ''));
  const n = Number(item.value);
  return Number.isFinite(n) ? n : null;
}

function extractStats(fixture) {
  const blocks = fixture.statistics || [];
  const home = blocks[0]?.statistics || [];
  const away = blocks[1]?.statistics || [];
  return {
    shotsHome: statValue(home, 'Total Shots'),
    shotsAway: statValue(away, 'Total Shots'),
    shotsOnTargetHome: statValue(home, 'Shots on Goal'),
    shotsOnTargetAway: statValue(away, 'Shots on Goal'),
    cornersHome: statValue(home, 'Corner Kicks'),
    cornersAway: statValue(away, 'Corner Kicks'),
    possessionHome: statValue(home, 'Ball Possession'),
    possessionAway: statValue(away, 'Ball Possession'),
    dangerousAttacksHome: null,
    dangerousAttacksAway: null
  };
}

function normalizeLabel(value) { return String(value || '').trim().toLowerCase(); }

function extract1x2(oddsPayload, fixtureId) {
  const match = (oddsPayload?.response || []).find((item) => Number(item.fixture?.id) === Number(fixtureId));
  if (!match) return {};
  const containers = match.bookmakers || match.odds || [];
  const candidates = [];

  for (const bookmaker of containers) {
    for (const bet of bookmaker.bets || []) {
      const name = normalizeLabel(bet.name);
      if (!(name.includes('match winner') || name === '1x2' || name.includes('winner'))) continue;
      const out = {};
      for (const value of bet.values || []) {
        const label = normalizeLabel(value.value);
        const odd = Number(value.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        if (['home', '1'].includes(label)) out.home = odd;
        else if (['draw', 'x'].includes(label)) out.draw = odd;
        else if (['away', '2'].includes(label)) out.away = odd;
      }
      if (out.home && out.draw && out.away) candidates.push(out);
    }
  }

  if (!candidates.length) return {};
  const median = (values) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    home: median(candidates.map((x) => x.home)),
    draw: median(candidates.map((x) => x.draw)),
    away: median(candidates.map((x) => x.away))
  };
}

function isLiveFixture(fixture) { return LIVE_STATUSES.has(fixture.fixture?.status?.short); }
function isFinishedFixture(fixture) { return FINISHED_STATUSES.has(fixture.fixture?.status?.short); }

function parsePercent(value) {
  if (value == null) return null;
  const n = Number(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? n / 100 : null;
}

function extractPrediction(payload) {
  const row = payload?.response?.[0];
  const percent = row?.predictions?.percent || {};
  const home = parsePercent(percent.home);
  const draw = parsePercent(percent.draw);
  const away = parsePercent(percent.away);
  if (![home, draw, away].every(v => Number.isFinite(v) && v > 0)) return null;
  return {
    home, draw, away,
    advice: row?.predictions?.advice || null,
    winner: row?.predictions?.winner?.name || null,
    source: 'API-FOOTBALL-PREDICTIONS'
  };
}

async function enrichLiveFixtures(fixtures) {
  const liveFixtures = fixtures.filter(isLiveFixture).slice(0, MAX_DETAILED_LIVE_FIXTURES);
  const detailsById = new Map();
  for (const fixture of liveFixtures) {
    try {
      const id = fixture.fixture?.id;
      if (!id) continue;
      const detail = await apiGet(`/fixtures?id=${id}`);
      if (detail.response?.[0]) detailsById.set(Number(id), detail.response[0]);
    } catch (_) {}
  }
  return fixtures.map((fixture) => detailsById.get(Number(fixture.fixture?.id)) || fixture);
}

async function fetchPrematchOddsByDate(date) {
  const combined = { response: [] };
  try {
    const first = await apiGet(`/odds?date=${date}&page=1`);
    combined.response.push(...(first.response || []));
    const totalPages = Math.min(Number(first.paging?.total || 1), MAX_ODDS_PAGES);
    for (let page = 2; page <= totalPages; page++) {
      if (apiQuota.dailyRemaining !== null && apiQuota.dailyRemaining <= QUOTA_RESERVE) break;
      const next = await apiGet(`/odds?date=${date}&page=${page}`);
      combined.response.push(...(next.response || []));
    }
  } catch (_) {}
  return combined;
}

async function fetchPrematchPredictions(fixtures) {
  const predictions = new Map();
  const candidates = fixtures.filter(f => !isLiveFixture(f) && !isFinishedFixture(f));
  const remaining = apiQuota.dailyRemaining == null ? MAX_PREMATCH_PREDICTIONS : Math.max(0, apiQuota.dailyRemaining - QUOTA_RESERVE);
  const budget = Math.min(MAX_PREMATCH_PREDICTIONS, remaining, candidates.length);

  for (const fixture of candidates.slice(0, budget)) {
    if (apiQuota.dailyRemaining !== null && apiQuota.dailyRemaining <= QUOTA_RESERVE) break;
    const id = fixture.fixture?.id;
    if (!id) continue;
    try {
      const prediction = extractPrediction(await apiGet(`/predictions?fixture=${id}`));
      if (prediction) predictions.set(Number(id), prediction);
    } catch (_) {}
  }
  return predictions;
}

function normalizeFixture(fixture, liveOdds, prematchOdds, predictions) {
  const live = isLiveFixture(fixture);
  const finished = isFinishedFixture(fixture);
  const id = fixture.fixture?.id;
  return {
    id,
    competition: fixture.league?.name,
    country: fixture.league?.country,
    status: fixture.fixture?.status?.short || 'NS',
    statusLong: fixture.fixture?.status?.long || '',
    minute: fixture.fixture?.status?.elapsed || 0,
    kickoff: fixture.fixture?.date || null,
    timestamp: fixture.fixture?.timestamp || null,
    isLive: live,
    isFinished: finished,
    home: fixture.teams?.home?.name || 'Home',
    away: fixture.teams?.away?.name || 'Away',
    score: { home: fixture.goals?.home ?? 0, away: fixture.goals?.away ?? 0 },
    stats: extractStats(fixture),
    markets: live ? extract1x2(liveOdds, id) : extract1x2(prematchOdds, id),
    preMatchModel: live || finished ? null : (predictions.get(Number(id)) || null),
    source: 'API-FOOTBALL',
    observedAt: new Date().toISOString()
  };
}

async function buildPayload() {
  const date = todayInTimezone();
  const day = await apiGet(`/fixtures?date=${date}&timezone=${encodeURIComponent(DISPLAY_TIMEZONE)}`);
  const fixtures = day.response || [];

  if (!fixtures.length) {
    return { matches: [], meta: { provider: 'API-FOOTBALL', mode: 'TODAY', date, timezone: DISPLAY_TIMEZONE, fetchedAt: new Date().toISOString(), fixtureCount: 0, quota: quotaMeta() } };
  }

  const enriched = await enrichLiveFixtures(fixtures);
  let liveOdds = { response: [] };
  if (enriched.some(isLiveFixture)) {
    try { liveOdds = await apiGet('/odds/live'); } catch (_) {}
  }

  const prematchOdds = await fetchPrematchOddsByDate(date);
  const predictions = await fetchPrematchPredictions(enriched);

  const matches = enriched
    .map((fixture) => normalizeFixture(fixture, liveOdds, prematchOdds, predictions))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return {
    matches,
    meta: {
      provider: 'API-FOOTBALL', mode: 'TODAY', date, timezone: DISPLAY_TIMEZONE,
      fetchedAt: new Date().toISOString(), fixtureCount: matches.length,
      liveFixtureCount: matches.filter((m) => m.isLive).length,
      prematchAnalyzedCount: matches.filter((m) => m.preMatchModel).length,
      cacheSeconds: CACHE_TTL_MS / 1000,
      quota: quotaMeta()
    }
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=15');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
      return res.status(200).json({ ...cache.payload, meta: { ...cache.payload.meta, quota: quotaMeta(), cache: 'HIT' } });
    }
    const payload = await buildPayload();
    cache = { at: Date.now(), payload };
    return res.status(200).json({ ...payload, meta: { ...payload.meta, quota: quotaMeta(), cache: 'MISS' } });
  } catch (error) {
    return res.status(503).json({ error: error.message, matches: [], meta: { provider: 'API-FOOTBALL', mode: 'TODAY', timezone: DISPLAY_TIMEZONE, fetchedAt: new Date().toISOString(), quota: quotaMeta() } });
  }
}
