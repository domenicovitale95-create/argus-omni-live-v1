const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL_MS = 60_000;
const HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DISPLAY_TIMEZONE = 'Europe/Brussels';
const HISTORY_DAYS = 90;
const MAX_DETAILED_LIVE_FIXTURES = 6;
const MAX_PREMATCH_PREDICTIONS = 24;
const MAX_HISTORY_TEAMS_PER_SCAN = 36;
const MAX_ODDS_PAGES = 5;
const QUOTA_RESERVE = 16;
const LIVE_STATUSES = new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
const FINISHED_STATUSES = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);

let cache = { at: 0, payload: null };
const historyCache = new Map();
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

function dateInTimezone(date, timeZone = DISPLAY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function todayInTimezone() { return dateInTimezone(new Date()); }
function daysAgoInTimezone(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return dateInTimezone(d);
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
    shotsHome: statValue(home, 'Total Shots'), shotsAway: statValue(away, 'Total Shots'),
    shotsOnTargetHome: statValue(home, 'Shots on Goal'), shotsOnTargetAway: statValue(away, 'Shots on Goal'),
    cornersHome: statValue(home, 'Corner Kicks'), cornersAway: statValue(away, 'Corner Kicks'),
    possessionHome: statValue(home, 'Ball Possession'), possessionAway: statValue(away, 'Ball Possession'),
    dangerousAttacksHome: null, dangerousAttacksAway: null
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

function summarizeTeamHistory(fixtures, teamId) {
  const rows = (fixtures || [])
    .filter(f => ['FT','AET','PEN'].includes(f.fixture?.status?.short))
    .sort((a, b) => (a.fixture?.timestamp || 0) - (b.fixture?.timestamp || 0));

  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, cleanSheets = 0, failedToScore = 0, btts = 0, over25 = 0;
  let homeGames = 0, homePoints = 0, awayGames = 0, awayPoints = 0;
  const results = [];

  for (const f of rows) {
    const isHome = Number(f.teams?.home?.id) === Number(teamId);
    const isAway = Number(f.teams?.away?.id) === Number(teamId);
    if (!isHome && !isAway) continue;
    const scored = Number(isHome ? f.goals?.home : f.goals?.away) || 0;
    const conceded = Number(isHome ? f.goals?.away : f.goals?.home) || 0;
    const points = scored > conceded ? 3 : scored === conceded ? 1 : 0;
    if (points === 3) wins++; else if (points === 1) draws++; else losses++;
    gf += scored; ga += conceded;
    if (conceded === 0) cleanSheets++;
    if (scored === 0) failedToScore++;
    if (scored > 0 && conceded > 0) btts++;
    if (scored + conceded > 2) over25++;
    if (isHome) { homeGames++; homePoints += points; } else { awayGames++; awayPoints += points; }
    results.push({
      fixtureId: f.fixture?.id,
      timestamp: f.fixture?.timestamp || null,
      competition: f.league?.name || null,
      venue: isHome ? 'H' : 'A',
      opponent: isHome ? f.teams?.away?.name : f.teams?.home?.name,
      gf: scored, ga: conceded, points
    });
  }

  const n = results.length;
  const recent = results.slice(-5);
  const recentPoints = recent.reduce((sum, r) => sum + r.points, 0);
  const round = (v) => Number(v.toFixed(3));
  return {
    matches: n,
    wins, draws, losses,
    pointsPerGame: n ? round((wins * 3 + draws) / n) : 0,
    goalsForPerGame: n ? round(gf / n) : 0,
    goalsAgainstPerGame: n ? round(ga / n) : 0,
    winRate: n ? round(wins / n) : 0,
    cleanSheetRate: n ? round(cleanSheets / n) : 0,
    failedToScoreRate: n ? round(failedToScore / n) : 0,
    bttsRate: n ? round(btts / n) : 0,
    over25Rate: n ? round(over25 / n) : 0,
    homeGames,
    homePPG: homeGames ? round(homePoints / homeGames) : null,
    awayGames,
    awayPPG: awayGames ? round(awayPoints / awayGames) : null,
    last5PPG: recent.length ? round(recentPoints / recent.length) : 0,
    recentResults: recent.map(r => r.points === 3 ? 'W' : r.points === 1 ? 'D' : 'L').join(''),
    windowDays: HISTORY_DAYS,
    from: daysAgoInTimezone(HISTORY_DAYS),
    to: todayInTimezone(),
    allMatches: results
  };
}

async function fetchTeamHistory(teamId, from, to) {
  const key = `${teamId}:${from}:${to}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL_MS) return cached.value;
  const payload = await apiGet(`/fixtures?team=${teamId}&from=${from}&to=${to}&status=FT-AET-PEN`);
  const summary = summarizeTeamHistory(payload.response || [], teamId);
  historyCache.set(key, { at: Date.now(), value: summary });
  return summary;
}

async function fetchHistories(fixtures) {
  const from = daysAgoInTimezone(HISTORY_DAYS);
  const to = todayInTimezone();
  const teamIds = [];
  const seen = new Set();
  for (const f of fixtures) {
    if (isFinishedFixture(f)) continue;
    for (const id of [f.teams?.home?.id, f.teams?.away?.id]) {
      if (!id || seen.has(Number(id))) continue;
      seen.add(Number(id));
      teamIds.push(Number(id));
    }
  }

  const available = apiQuota.dailyRemaining == null
    ? MAX_HISTORY_TEAMS_PER_SCAN
    : Math.max(0, apiQuota.dailyRemaining - QUOTA_RESERVE);
  const budget = Math.min(MAX_HISTORY_TEAMS_PER_SCAN, available, teamIds.length);
  const histories = new Map();

  for (const teamId of teamIds.slice(0, budget)) {
    if (apiQuota.dailyRemaining !== null && apiQuota.dailyRemaining <= QUOTA_RESERVE) break;
    try { histories.set(teamId, await fetchTeamHistory(teamId, from, to)); } catch (_) {}
  }
  return { histories, totalTeams: teamIds.length, attemptedTeams: budget, from, to };
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

function normalizeFixture(fixture, liveOdds, prematchOdds, predictions, histories) {
  const live = isLiveFixture(fixture);
  const finished = isFinishedFixture(fixture);
  const id = fixture.fixture?.id;
  const homeTeamId = fixture.teams?.home?.id || null;
  const awayTeamId = fixture.teams?.away?.id || null;
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
    homeTeamId,
    awayTeamId,
    home: fixture.teams?.home?.name || 'Home',
    away: fixture.teams?.away?.name || 'Away',
    score: { home: fixture.goals?.home ?? 0, away: fixture.goals?.away ?? 0 },
    stats: extractStats(fixture),
    markets: live ? extract1x2(liveOdds, id) : extract1x2(prematchOdds, id),
    preMatchModel: finished ? null : (predictions.get(Number(id)) || null),
    history90d: {
      home: histories.get(Number(homeTeamId)) || null,
      away: histories.get(Number(awayTeamId)) || null
    },
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
  const historyResult = await fetchHistories(enriched);
  const predictions = await fetchPrematchPredictions(enriched);

  const matches = enriched
    .map((fixture) => normalizeFixture(fixture, liveOdds, prematchOdds, predictions, historyResult.histories))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const historyCompleteMatches = matches.filter(m => m.history90d?.home && m.history90d?.away).length;
  return {
    matches,
    meta: {
      provider: 'API-FOOTBALL', mode: 'TODAY', date, timezone: DISPLAY_TIMEZONE,
      fetchedAt: new Date().toISOString(), fixtureCount: matches.length,
      liveFixtureCount: matches.filter((m) => m.isLive).length,
      prematchAnalyzedCount: matches.filter((m) => m.preMatchModel).length,
      historyWindowDays: HISTORY_DAYS,
      historyFrom: historyResult.from,
      historyTo: historyResult.to,
      historyTeamsCovered: historyResult.histories.size,
      historyTeamsTotal: historyResult.totalTeams,
      historyCompleteMatches,
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
