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
    return clamp(50 + shotDelta * 2.4 + sotDelta * 5.2 + cornerDelta * 1.8 + dangerDelta * 0.55 + possessionDelta * 0.6);
  }

  function liveModelProbabilities(match, pressure) {
    const minute = clamp(safe(match.minute), 0, 95);
    const goalDelta = safe(match.score?.home) - safe(match.score?.away);
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

  function liveDataQuality(match) {
    const s = match.stats || {};
    const required = [
      match.minute, match.score?.home, match.score?.away,
      s.shotsHome, s.shotsAway, s.shotsOnTargetHome, s.shotsOnTargetAway,
      s.possessionHome, match.markets?.home, match.markets?.draw, match.markets?.away
    ];
    const present = required.filter(v => v !== undefined && v !== null && v !== '').length;
    return clamp(Math.round((present / required.length) * 100));
  }

  function liveUncertainty(match, quality) {
    const minute = safe(match.minute);
    let value = 42;
    if (minute < 20) value += 18;
    if (minute > 75) value -= 9;
    value += (100 - quality) * 0.36;
    const totalShots = safe(match.stats?.shotsHome) + safe(match.stats?.shotsAway);
    if (totalShots < 7) value += 8;
    return clamp(Math.round(value), 8, 88);
  }

  function chooseBest(model, market, markets, marketAvailable) {
    return [
      { key: 'HOME', probability: model.home, marketProbability: market.home, odds: safe(markets?.home) },
      { key: 'DRAW', probability: model.draw, marketProbability: market.draw, odds: safe(markets?.draw) },
      { key: 'AWAY', probability: model.away, marketProbability: market.away, odds: safe(markets?.away) }
    ].map(item => ({ ...item, edge: marketAvailable ? item.probability - item.marketProbability : 0 }))
      .sort((a, b) => b.edge - a.edge)[0];
  }

  function analyzeLive(match) {
    const marketAvailable = hasComplete1x2(match.markets);
    const market = normalizeMarket(match.markets);
    const pressure = Math.round(pressureIndex(match));
    const model = liveModelProbabilities(match, pressure);
    const quality = liveDataQuality(match);
    const uncertaintyScore = liveUncertainty(match, quality);
    const best = chooseBest(model, market, match.markets, marketAvailable);
    const edgePct = marketAvailable ? best.edge * 100 : 0;
    const confidence = clamp(Math.round(quality * 0.58 + (100 - uncertaintyScore) * 0.29 + Math.abs(pressure - 50) * 0.26));

    let classification = 'NO BET';
    if (marketAvailable && quality >= 78 && confidence >= 69 && edgePct >= 7.5 && safe(match.minute) >= 18) classification = 'PRIME';
    else if (marketAvailable && quality >= 62 && confidence >= 54 && edgePct >= 3.5) classification = 'WATCH';

    return {
      phase: 'LIVE', pressure, quality, uncertainty: uncertaintyScore, confidence,
      model, market, marketAvailable,
      bestMarket: marketAvailable ? best.key : 'NO MARKET',
      edge: Number(edgePct.toFixed(1)),
      fairOdds: marketAvailable && best.probability > 0 ? Number((1 / best.probability).toFixed(2)) : null,
      marketOdds: marketAvailable ? best.odds : null,
      classification
    };
  }

  function analyzePreMatch(match) {
    const p = match.preMatchModel || {};
    const modelAvailable = [p.home, p.draw, p.away].every(v => Number.isFinite(Number(v)) && Number(v) > 0);
    const marketAvailable = hasComplete1x2(match.markets);
    const market = normalizeMarket(match.markets);

    if (!modelAvailable) {
      return {
        phase: 'PREMATCH', pressure: null, quality: 0, uncertainty: 100, confidence: 0,
        model: { home: 0, draw: 0, away: 0 }, market, marketAvailable,
        bestMarket: marketAvailable ? 'MODEL PENDING' : 'NO MARKET', edge: 0,
        fairOdds: null, marketOdds: null, classification: 'NO BET'
      };
    }

    const raw = { home: safe(p.home), draw: safe(p.draw), away: safe(p.away) };
    const sum = raw.home + raw.draw + raw.away;
    const model = { home: raw.home / sum, draw: raw.draw / sum, away: raw.away / sum };
    const best = chooseBest(model, market, match.markets, marketAvailable);
    const edgePct = marketAvailable ? best.edge * 100 : 0;
    const spread = Math.max(model.home, model.draw, model.away) - Math.min(model.home, model.draw, model.away);
    const quality = marketAvailable ? 88 : 58;
    const uncertaintyScore = clamp(Math.round(48 - spread * 35 + (marketAvailable ? 0 : 24)), 18, 82);
    const confidence = clamp(Math.round(quality * 0.52 + (100 - uncertaintyScore) * 0.34 + spread * 28));

    let classification = 'NO BET';
    if (marketAvailable && confidence >= 72 && edgePct >= 6.5) classification = 'PRIME';
    else if (marketAvailable && confidence >= 56 && edgePct >= 3.5) classification = 'WATCH';

    return {
      phase: 'PREMATCH', pressure: null, quality, uncertainty: uncertaintyScore, confidence,
      model, market, marketAvailable,
      bestMarket: marketAvailable ? best.key : 'NO MARKET',
      edge: Number(edgePct.toFixed(1)),
      fairOdds: marketAvailable && best.probability > 0 ? Number((1 / best.probability).toFixed(2)) : null,
      marketOdds: marketAvailable ? best.odds : null,
      classification
    };
  }

  function analyze(match) {
    if (match.isLive) return analyzeLive(match);
    if (['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO'].includes(match.status)) {
      return { ...analyzePreMatch({ ...match, preMatchModel: null }), phase: 'FINISHED', classification: 'NO BET' };
    }
    return analyzePreMatch(match);
  }

  window.ArgusEngine = { analyze, analyzeLive, analyzePreMatch, normalizeMarket, pressureIndex, hasComplete1x2 };
})();
