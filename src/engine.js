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
    const raw = { home: impliedProbability(markets.home), draw: impliedProbability(markets.draw), away: impliedProbability(markets.away) };
    const overround = raw.home + raw.draw + raw.away;
    if (!overround) return { home: 0, draw: 0, away: 0, overround: 0 };
    return { home: raw.home / overround, draw: raw.draw / overround, away: raw.away / overround, overround };
  }

  function normalizeModel(model) {
    const home = Math.max(0, safe(model?.home));
    const draw = Math.max(0, safe(model?.draw));
    const away = Math.max(0, safe(model?.away));
    const sum = home + draw + away;
    return sum > 0 ? { home: home / sum, draw: draw / sum, away: away / sum } : null;
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
    return normalizeModel({ home, draw, away });
  }

  function poisson(k, lambda) {
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
  }

  function historyProbabilities(match) {
    const home = match.history90d?.home;
    const away = match.history90d?.away;
    if (!home || !away || safe(home.matches) < 3 || safe(away.matches) < 3) return null;

    const venueHomePPG = home.homePPG == null ? safe(home.pointsPerGame, 1.4) : safe(home.homePPG, 1.4);
    const venueAwayPPG = away.awayPPG == null ? safe(away.pointsPerGame, 1.2) : safe(away.awayPPG, 1.2);
    const formDelta = (safe(home.last5PPG) - safe(away.last5PPG)) / 3;
    const venueDelta = (venueHomePPG - venueAwayPPG) / 3;

    let lambdaHome = safe(home.goalsForPerGame, 1.2) * 0.54 + safe(away.goalsAgainstPerGame, 1.2) * 0.46;
    let lambdaAway = safe(away.goalsForPerGame, 1.1) * 0.54 + safe(home.goalsAgainstPerGame, 1.1) * 0.46;
    lambdaHome *= 1.06 + formDelta * 0.11 + venueDelta * 0.08;
    lambdaAway *= 0.98 - formDelta * 0.07 - venueDelta * 0.05;
    lambdaHome = clamp(lambdaHome, 0.2, 3.8);
    lambdaAway = clamp(lambdaAway, 0.2, 3.8);

    let pHome = 0, pDraw = 0, pAway = 0;
    for (let h = 0; h <= 7; h++) {
      for (let a = 0; a <= 7; a++) {
        const p = poisson(h, lambdaHome) * poisson(a, lambdaAway);
        if (h > a) pHome += p;
        else if (h === a) pDraw += p;
        else pAway += p;
      }
    }

    const poissonModel = normalizeModel({ home: pHome, draw: pDraw, away: pAway });
    const ppgHome = clamp(0.34 + (safe(home.pointsPerGame) - safe(away.pointsPerGame)) * 0.10 + venueDelta * 0.08, 0.12, 0.72);
    const ppgAway = clamp(0.28 + (safe(away.pointsPerGame) - safe(home.pointsPerGame)) * 0.10 - venueDelta * 0.05, 0.10, 0.68);
    const ppgDraw = clamp(1 - ppgHome - ppgAway, 0.14, 0.42);
    const ppgModel = normalizeModel({ home: ppgHome, draw: ppgDraw, away: ppgAway });

    return normalizeModel({
      home: poissonModel.home * 0.82 + ppgModel.home * 0.18,
      draw: poissonModel.draw * 0.82 + ppgModel.draw * 0.18,
      away: poissonModel.away * 0.82 + ppgModel.away * 0.18
    });
  }

  function providerProbabilities(match) {
    return normalizeModel(match.preMatchModel);
  }

  function historicalCoverage(match) {
    const h = match.history90d?.home;
    const a = match.history90d?.away;
    if (!h || !a) return 0;
    return Math.min(1, Math.min(safe(h.matches), safe(a.matches)) / 10);
  }

  function blendPrematchModels(match) {
    const provider = providerProbabilities(match);
    const history = historyProbabilities(match);
    if (provider && history) {
      return {
        model: normalizeModel({
          home: provider.home * 0.58 + history.home * 0.42,
          draw: provider.draw * 0.58 + history.draw * 0.42,
          away: provider.away * 0.58 + history.away * 0.42
        }),
        provider, history,
        disagreement: (Math.abs(provider.home - history.home) + Math.abs(provider.draw - history.draw) + Math.abs(provider.away - history.away)) / 3
      };
    }
    const model = provider || history;
    return { model, provider, history, disagreement: 0 };
  }

  function liveDataQuality(match) {
    const s = match.stats || {};
    const required = [match.minute, match.score?.home, match.score?.away, s.shotsHome, s.shotsAway, s.shotsOnTargetHome, s.shotsOnTargetAway, s.possessionHome, match.markets?.home, match.markets?.draw, match.markets?.away];
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
    const pureLive = liveModelProbabilities(match, pressure);
    const prior = historyProbabilities(match);
    const minute = clamp(safe(match.minute), 0, 95);
    const priorWeight = prior ? clamp(0.34 * (1 - minute / 110), 0.10, 0.30) : 0;
    const model = prior ? normalizeModel({
      home: pureLive.home * (1 - priorWeight) + prior.home * priorWeight,
      draw: pureLive.draw * (1 - priorWeight) + prior.draw * priorWeight,
      away: pureLive.away * (1 - priorWeight) + prior.away * priorWeight
    }) : pureLive;

    const quality = liveDataQuality(match);
    const uncertaintyScore = liveUncertainty(match, quality);
    const best = chooseBest(model, market, match.markets, marketAvailable);
    const edgePct = marketAvailable ? best.edge * 100 : 0;
    const historyBonus = historicalCoverage(match) * 5;
    const confidence = clamp(Math.round(quality * 0.56 + (100 - uncertaintyScore) * 0.28 + Math.abs(pressure - 50) * 0.24 + historyBonus));

    let classification = 'NO BET';
    if (marketAvailable && quality >= 78 && confidence >= 69 && edgePct >= 7.5 && minute >= 18) classification = 'PRIME';
    else if (marketAvailable && quality >= 62 && confidence >= 54 && edgePct >= 3.5) classification = 'WATCH';

    return {
      phase: 'LIVE', pressure, quality, uncertainty: uncertaintyScore, confidence,
      model, market, marketAvailable, historyModel: prior, historyCoverage: historicalCoverage(match),
      bestMarket: marketAvailable ? best.key : 'NO MARKET',
      edge: Number(edgePct.toFixed(1)),
      fairOdds: marketAvailable && best.probability > 0 ? Number((1 / best.probability).toFixed(2)) : null,
      marketOdds: marketAvailable ? best.odds : null,
      classification
    };
  }

  function analyzePreMatch(match) {
    const marketAvailable = hasComplete1x2(match.markets);
    const market = normalizeMarket(match.markets);
    const blended = blendPrematchModels(match);
    const model = blended.model;
    const historyCoverage = historicalCoverage(match);

    if (!model) {
      return {
        phase: 'PREMATCH', pressure: null, quality: 0, uncertainty: 100, confidence: 0,
        model: { home: 0, draw: 0, away: 0 }, market, marketAvailable,
        historyModel: null, providerModel: null, historyCoverage,
        bestMarket: marketAvailable ? 'MODEL PENDING' : 'NO MARKET', edge: 0,
        fairOdds: null, marketOdds: null, classification: 'NO BET'
      };
    }

    const best = chooseBest(model, market, match.markets, marketAvailable);
    const edgePct = marketAvailable ? best.edge * 100 : 0;
    const spread = Math.max(model.home, model.draw, model.away) - Math.min(model.home, model.draw, model.away);
    const providerBonus = blended.provider ? 20 : 0;
    const historyBonus = historyCoverage * 45;
    const quality = clamp(Math.round((marketAvailable ? 30 : 0) + providerBonus + historyBonus + (blended.provider && blended.history ? 5 : 0)));
    const disagreementPenalty = blended.disagreement * 100 * 0.75;
    const uncertaintyScore = clamp(Math.round(52 - spread * 34 + disagreementPenalty + (marketAvailable ? 0 : 22) + (1 - historyCoverage) * 12), 16, 90);
    const confidence = clamp(Math.round(quality * 0.52 + (100 - uncertaintyScore) * 0.34 + spread * 26));

    let classification = 'NO BET';
    if (marketAvailable && historyCoverage >= 0.5 && confidence >= 73 && edgePct >= 6.5) classification = 'PRIME';
    else if (marketAvailable && historyCoverage >= 0.3 && confidence >= 56 && edgePct >= 3.5) classification = 'WATCH';

    return {
      phase: 'PREMATCH', pressure: null, quality, uncertainty: uncertaintyScore, confidence,
      model, market, marketAvailable,
      historyModel: blended.history, providerModel: blended.provider,
      modelDisagreement: Number((blended.disagreement * 100).toFixed(1)),
      historyCoverage,
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

  window.ArgusEngine = { analyze, analyzeLive, analyzePreMatch, normalizeMarket, pressureIndex, hasComplete1x2, historyProbabilities };
})();
