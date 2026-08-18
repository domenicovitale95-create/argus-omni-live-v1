(function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safe(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function sideKey(value) {
    if (value === 'HOME') return 'home';
    if (value === 'DRAW') return 'draw';
    if (value === 'AWAY') return 'away';
    return null;
  }

  function baseline(match) {
    try {
      if (!window.ArgusEngine || typeof window.ArgusEngine.analyzePreMatch !== 'function') return null;
      var prematch = Object.assign({}, match, { isLive: false });
      var analysis = window.ArgusEngine.analyzePreMatch(prematch);
      return analysis && (analysis.baseModel || analysis.model) ? (analysis.baseModel || analysis.model) : null;
    } catch (error) {
      return null;
    }
  }

  function scoreState(match, side) {
    var home = safe(match && match.score && match.score.home, 0);
    var away = safe(match && match.score && match.score.away, 0);
    if (side === 'home') return Math.sign(home - away);
    if (side === 'away') return Math.sign(away - home);
    return home === away ? 1 : -1;
  }

  function pressureAlignment(live, side) {
    var pressure = safe(live && live.pressure, 50);
    if (side === 'home') return (pressure - 50) / 50;
    if (side === 'away') return (50 - pressure) / 50;
    return 1 - Math.abs(pressure - 50) / 25;
  }

  function evaluate(match, live) {
    if (!match || !match.isLive || !live || live.phase !== 'LIVE') {
      return { status: 'NOT_LIVE', score: 50, penalty: 0, blockPromotion: false, reason: 'Regime analysis applies only in live state' };
    }

    var side = sideKey(live.bestMarket);
    var pre = baseline(match);
    var minute = clamp(safe(match.minute, 0), 0, 95);

    if (!side || !pre) {
      return { status: 'UNKNOWN', score: 50, penalty: 4, blockPromotion: true, reason: 'No defensible pre-match baseline for regime comparison' };
    }

    var preProbability = safe(pre[side], 0);
    var liveSource = live.baseModel || live.model || {};
    var liveProbability = safe(liveSource[side], 0);
    var delta = (liveProbability - preProbability) * 100;
    var pressure = pressureAlignment(live, side);
    var score = scoreState(match, side);
    var regimeScore = 50 + delta * 2.2 + pressure * 18 + score * (minute >= 55 ? 16 : 10);
    regimeScore = clamp(Math.round(regimeScore), 0, 100);

    var status = 'STABLE';
    var penalty = 0;
    var blockPromotion = false;
    var reason = 'Live state broadly consistent with the pre-match thesis';

    if (regimeScore <= 25) {
      status = 'REVERSAL';
      penalty = 18;
      blockPromotion = true;
      reason = 'Live state materially contradicts the pre-match thesis';
    } else if (regimeScore <= 40) {
      status = 'BROKEN';
      penalty = 10;
      blockPromotion = true;
      reason = 'Pre-match thesis has weakened materially in live play';
    } else if (regimeScore >= 72) {
      status = 'STRENGTHENED';
      reason = 'Live state supports the pre-match thesis; no automatic promotion allowed';
    }

    return {
      status: status,
      score: regimeScore,
      penalty: penalty,
      blockPromotion: blockPromotion,
      side: side.toUpperCase(),
      prematchProbability: Number((preProbability * 100).toFixed(1)),
      liveProbability: Number((liveProbability * 100).toFixed(1)),
      probabilityDelta: Number(delta.toFixed(1)),
      pressureAlignment: Number(pressure.toFixed(2)),
      scoreAlignment: score,
      minute: minute,
      reason: reason
    };
  }

  window.ArgusLiveRegime = { evaluate: evaluate };
})();
