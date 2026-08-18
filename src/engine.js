(function () {
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  const safe = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function impliedProbability(odds) {
    const value = safe(odds);
    return value > 1 ? 1 / value : 0;
  }

  function hasComplete1x2(markets = {}) {
    return safe(markets.home) > 1 && safe(markets.draw) > 1 && safe(markets.away) > 1;
  }

  function normalizeMarket(markets = {}) {
    const raw = {
      home: impliedProbability(markets.home),
      draw: impliedProbability(markets.draw),
      away: impliedProbability(markets.away)
    };
    const overround = raw.home + raw.draw + raw.away;
    if (!overround) return { home: 0, draw: 0, away: 0, overround: 0 };
    return {
      home: raw.home / overround,
      draw: raw.draw / overround,
      away: raw.away / overround,
      overround
    };
  }

  function pressureIndex(match) {
    const s = match.stats || {};
    const shotDelta = safe(s.shotsHome) - safe(s.shotsAway);
    const sotDelta = safe(s.shotsOnTargetHome) - safe(s.shotsOnTargetAway);
    const cornerDelta = safe(s.cornersHome) - safe(s.cornersAway);
    const dangerDelta = safe(s.dangerousAttacksHome) - safe(s.dangerousAttacksAway);
    const possessionDelta = safe(s.possessionHome, 50) - 50;

    const homePressure = 50 + shotDelta * 2.4 + sotDelta * 5.2 + cornerDelta * 1.8 + dangerDelta * 0.55 + possessionDelta * 0.6;
    return clamp(homePressure);
  }

  function modelProbabilities(match, pressure) {
    const minute = clamp(safe(match.minute), 0, 95);
    const homeGoals = safe(match.score?.home);
    const awayGoals = safe(match.score?.away);
    const goalDelta = homeGoals - awayGoals;
    const timeWeight = 0.35 + (minute / 95) * 0.65;
    const pressureTilt = (pressure - 50) / 100;

    let home = 0.39 + pressureTilt * 0.34 + goalDelta * 0.18 * timeWeight;
    let away = 0.31 - pressureTilt * 0.30 - goalDelta * 0.18 * timeWeight;
    let draw = 1 - home - away;

    home = clamp(home * 100, 4, 90) / 100;
    away = clamp(away * 100, 4, 90) / 100;
    draw = clamp(draw * 100, 6, 72) / 100;

    const sum = home + draw + away;
    return { home: home / sum, draw: draw / sum, away: away / sum };
  }

  function dataQuality(match) {
    const s = match.stats || {};
    const required = [
      match.minute, match.score?.home, match.score?.away,
      s.shotsHome, s.shotsAway, s.shotsOnTargetHome, s.shotsOnTargetAway,
      s.possessionHome, match.markets?.home, match.markets?.draw, match.markets?.away
    ];
    const present = required.filter(v => v !== undefined && v !== null && v !== '').length;
    return clamp(Math.round((present / required.length) * 100));
  }

  function uncertainty(match, quality) {
    const minute = safe(match.minute);
    let value = 42;
    if (minute < 20) value += 18;
    if (minute > 75) value -= 9;
    value += (100 - quality) * 0.36;
    const totalShots = safe(match.stats?.shotsHome) + safe(match.stats?.shotsAway);
    if (totalShots < 7) value += 8;
    return clamp(Math.round(value), 8, 88);
  }

  function analyze(match) {
    const marketAvailable = hasComplete1x2(match.markets);
    const market = normalizeMarket(match.markets);
    const pressure = Math.round(pressureIndex(match));
    const model = modelProbabilities(match, pressure);
    const quality = dataQuality(match);
    const uncertaintyScore = uncertainty(match, quality);

    const candidates = [
      { key: 'HOME', probability: model.home, marketProbability: market.home, odds: safe(match.markets?.home) },
      { key: 'DRAW', probability: model.draw, marketProbability: market.draw, odds: safe(match.markets?.draw) },
      { key: 'AWAY', probability: model.away, marketProbability: market.away, odds: safe(match.markets?.away) }
    ].map(item => ({ ...item, edge: marketAvailable ? item.probability - item.marketProbability : 0 }))
      .sort((a, b) => b.edge - a.edge);

    const best = candidates[0];
    const edgePct = marketAvailable ? best.edge * 100 : 0;
    const confidence = clamp(Math.round(quality * 0.58 + (100 - uncertaintyScore) * 0.29 + Math.abs(pressure - 50) * 0.26));

    let classification = 'NO BET';
    if (marketAvailable && quality >= 78 && confidence >= 69 && edgePct >= 7.5 && safe(match.minute) >= 18) classification = 'PRIME';
    else if (marketAvailable && quality >= 62 && confidence >= 54 && edgePct >= 3.5) classification = 'WATCH';

    return {
      pressure,
      quality,
      uncertainty: uncertaintyScore,
      confidence,
      model,
      market,
      marketAvailable,
      bestMarket: marketAvailable ? best.key : 'NO MARKET',
      edge: Number(edgePct.toFixed(1)),
      fairOdds: marketAvailable && best.probability > 0 ? Number((1 / best.probability).toFixed(2)) : null,
      marketOdds: marketAvailable ? best.odds : null,
      classification
    };
  }

  window.ArgusEngine = { analyze, normalizeMarket, pressureIndex, hasComplete1x2 };
})();
