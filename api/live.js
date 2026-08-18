const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL_MS = 180_000;
const MAX_DETAILED_FIXTURES = 4;

let cache = { at: 0, payload: null };

function apiHeaders() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not configured');
  return { 'x-apisports-key': key, Accept: 'application/json' };
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: apiHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  if (data?.errors && Object.keys(data.errors).length) {
    throw new Error(`API-Football: ${JSON.stringify(data.errors)}`);
  }
  return data;
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

function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function extract1x2(oddsPayload, fixtureId) {
  const match = (oddsPayload?.response || []).find((item) => Number(item.fixture?.id) === Number(fixtureId));
  if (!match) return {};

  const candidates = [];
  for (const bookmaker of match.odds || []) {
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

function normalizeFixture(fixture, oddsPayload, detailed = false) {
  return {
    id: fixture.fixture?.id,
    competition: fixture.league?.name,
    country: fixture.league?.country,
    status: fixture.fixture?.status?.short || 'LIVE',
    minute: fixture.fixture?.status?.elapsed || 0,
    home: fixture.teams?.home?.name || 'Home',
    away: fixture.teams?.away?.name || 'Away',
    score: {
      home: fixture.goals?.home ?? 0,
      away: fixture.goals?.away ?? 0
    },
    stats: extractStats(fixture),
    markets: extract1x2(oddsPayload, fixture.fixture?.id),
    source: 'API-FOOTBALL',
    detailLevel: detailed ? 'FULL' : 'LIVE_SCORE',
    observedAt: new Date().toISOString()
  };
}

async function buildLivePayload() {
  // FREE PLAN SAFE: never use the paid-plan `ids` parameter.
  const live = await apiGet('/fixtures?live=all');
  const liveFixtures = live.response || [];
  if (!liveFixtures.length) {
    return {
      matches: [],
      meta: {
        provider: 'API-FOOTBALL',
        live: true,
        planMode: 'FREE_SAFE',
        fetchedAt: new Date().toISOString()
      }
    };
  }

  let odds = { response: [] };
  try {
    odds = await apiGet('/odds/live');
  } catch (_) {
    // Live scores remain usable even when in-play odds have no coverage.
  }

  // Prioritize fixtures that actually have live 1X2 market data. Those are the
  // fixtures where ARGUS can evaluate market edge instead of inventing one.
  const withOdds = [];
  const withoutOdds = [];
  for (const fixture of liveFixtures) {
    const market = extract1x2(odds, fixture.fixture?.id);
    (market.home && market.draw && market.away ? withOdds : withoutOdds).push(fixture);
  }
  const prioritized = [...withOdds, ...withoutOdds];

  const detailTargets = prioritized.slice(0, MAX_DETAILED_FIXTURES);
  const detailMap = new Map();

  // Singular `id=` requests are compatible with the free plan. We deliberately
  // cap the count to protect the 100 requests/day quota.
  for (const fixture of detailTargets) {
    const id = fixture.fixture?.id;
    if (!id) continue;
    try {
      const detail = await apiGet(`/fixtures?id=${id}`);
      if (detail.response?.[0]) detailMap.set(Number(id), detail.response[0]);
    } catch (_) {
      // Fall back to the live-score fixture instead of failing the whole scan.
    }
  }

  const matches = prioritized.map((fixture) => {
    const id = Number(fixture.fixture?.id);
    const detailed = detailMap.get(id);
    return normalizeFixture(detailed || fixture, odds, Boolean(detailed));
  });

  return {
    matches,
    meta: {
      provider: 'API-FOOTBALL',
      live: true,
      planMode: 'FREE_SAFE',
      fetchedAt: new Date().toISOString(),
      fixtureCount: matches.length,
      detailedFixtureCount: detailMap.size,
      detailedFixtureLimit: MAX_DETAILED_FIXTURES,
      cacheSeconds: CACHE_TTL_MS / 1000
    }
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=150, stale-while-revalidate=30');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
      return res.status(200).json({ ...cache.payload, meta: { ...cache.payload.meta, cache: 'HIT' } });
    }
    const payload = await buildLivePayload();
    cache = { at: Date.now(), payload };
    return res.status(200).json({ ...payload, meta: { ...payload.meta, cache: 'MISS' } });
  } catch (error) {
    return res.status(503).json({
      error: error.message,
      matches: [],
      meta: {
        provider: 'API-FOOTBALL',
        live: false,
        planMode: 'FREE_SAFE',
        fetchedAt: new Date().toISOString()
      }
    });
  }
}
