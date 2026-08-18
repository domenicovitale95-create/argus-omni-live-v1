(function () {
  const VERSION_STACK = {
    master: 'ARGUS OMNI MASTER KNOWLEDGE 1.0',
    ensemble: 'ARGUS EXCELLENCE V5',
    calibration: 'ARGUS V7',
    trackRecord: 'ARGUS V8',
    commandCenter: 'ARGUS V9',
    live: 'ARGUS V10',
    app: 'ARGUS OMNI LIVE V2.5'
  };

  const ENGINE_REGISTRY = {
    '1X2': { status: 'MARKET-DOMINANT', modelWeight: 0.15 },
    GOALS: { status: 'MARKET-DOMINANT / RESEARCH', modelWeight: 0.10 },
    CORNERS: { status: 'RESEARCH', modelWeight: 0.08 },
    CARDS: { status: 'RESEARCH-PROMISING', modelWeight: 0.10 },
    'PLAYER PROPS': { status: 'RESEARCH', modelWeight: 0.08 },
    'MARKET RESIDUAL': { status: 'RESEARCH', modelWeight: 0.15 }
  };

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const safe = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

  function sideKey(bestMarket) {
    if (bestMarket === 'HOME') return 'home';
    if (bestMarket === 'DRAW') return 'draw';
    if (bestMarket === 'AWAY') return 'away';
    return null;
  }

  function governingEngine(_match, analysis) {
    if (!analysis || !analysis.marketAvailable) return ENGINE_REGISTRY['1X2'];
    return ENGINE_REGISTRY['1X2'];
  }

  function apply(analysis, match) {
    const engine = governingEngine(match, analysis);
    const key = sideKey(analysis?.bestMarket);
    const odds = safe(analysis?.marketOdds, 0);
    const raw = key ? safe(analysis?.model?.[key], 0) : 0;
    const marketPrior = key ? safe(analysis?.market?.[key], 0) : 0;
    const marketAvailable = Boolean(analysis?.marketAvailable && odds > 1 && marketPrior > 0);

    const modelsExecuted = [];
    if (match?.isLive) modelsExecuted.push('LIVE MATCH-STATE');
    if (analysis?.historyModel || match?.history90d) modelsExecuted.push('90D TEAM-STRENGTH / POISSON');
    if (analysis?.providerModel || match?.preMatchModel) modelsExecuted.push('PROVIDER PREDICTION (SECONDARY)');
    if (marketAvailable) modelsExecuted.push('MARKET PRIOR / NO-VIG');

    if (!marketAvailable || !key || raw <= 0) {
      return {
        ...analysis,
        rawProbability: raw || null,
        marketPriorProbability: marketPrior || null,
        shrunkProbability: null,
        conservativeProbability: null,
        baseEV: null,
        conservativeEV: null,
        conservativeFairOdds: null,
        minimumAcceptableOdds: null,
        shrinkageStatus: 'UNAVAILABLE',
        uncertaintyStatus: 'HEURISTIC / UNCALIBRATED',
        engineStatus: engine.status,
        calibrationStatus: 'HEURISTIC / UNCALIBRATED',
        primeEligible: false,
        edgeSurvival: false,
        modelsExecuted,
        governanceReason: match?.isFinished ? 'FINISHED — NOT ACTIONABLE' : 'CRITICAL PRICE OR MODEL INPUT MISSING',
        classification: 'NO BET',
        versionStack: VERSION_STACK
      };
    }

    // V5/V7: fixed market-dominant shrinkage policy while the engine is unvalidated.
    // The weight is global by engine status, never chosen match-by-match.
    const wModel = engine.modelWeight;
    const shrunk = clamp(raw * wModel + marketPrior * (1 - wModel));

    // Conservative estimate: fixed heuristic uncertainty buffer. It is explicitly uncalibrated.
    const confidence = safe(analysis?.confidence, 0);
    const disagreement = Math.abs(raw - marketPrior);
    const uncertaintyBuffer = clamp((1 - confidence / 100) * 0.025 + disagreement * 0.12, 0.005, 0.05);
    const conservative = clamp(shrunk - uncertaintyBuffer, 0.01, 0.99);

    const rawEdge = raw - marketPrior;
    const shrunkEdge = shrunk - marketPrior;
    const baseEV = shrunk * odds - 1;
    const conservativeEV = conservative * odds - 1;
    const conservativeFairOdds = 1 / conservative;
    const minimumAcceptableOdds = conservativeFairOdds; // No unvalidated extra safety margin is invented.
    const edgeSurvival = conservativeEV > 0;

    let classification = 'NO BET';
    let governanceReason = 'CONSERVATIVE EV DOES NOT SURVIVE';

    if (match?.isFinished) {
      classification = 'NO BET';
      governanceReason = 'FINISHED — NOT ACTIONABLE';
    } else if (edgeSurvival && confidence >= 60 && rawEdge >= 0.035) {
      // V7 permits VALUE with heuristic calibration only when explicitly labelled.
      classification = 'VALUE — UNCALIBRATED';
      governanceReason = 'POSITIVE CONSERVATIVE EV; CALIBRATION REMAINS HEURISTIC';
    } else if (rawEdge >= 0.03 || (baseEV > 0 && conservativeEV > -0.03)) {
      classification = 'WATCH';
      governanceReason = 'POTENTIAL RESIDUAL EDGE; FAILS FULL CONSERVATIVE / CALIBRATION GATE';
    }

    // V7/V10 PRIME gate: current 1X2 stack is not historically validated for this deployment.
    const primeEligible = false;

    return {
      ...analysis,
      classification,
      rawProbability: raw,
      marketPriorProbability: marketPrior,
      shrunkProbability: shrunk,
      conservativeProbability: conservative,
      rawEdge: Number((rawEdge * 100).toFixed(2)),
      shrunkEdge: Number((shrunkEdge * 100).toFixed(2)),
      baseEV: Number((baseEV * 100).toFixed(2)),
      conservativeEV: Number((conservativeEV * 100).toFixed(2)),
      conservativeFairOdds: Number(conservativeFairOdds.toFixed(2)),
      minimumAcceptableOdds: Number(minimumAcceptableOdds.toFixed(2)),
      shrinkageStatus: 'HEURISTIC / MARKET-DOMINANT',
      uncertaintyStatus: 'HEURISTIC / UNCALIBRATED',
      engineStatus: engine.status,
      calibrationStatus: 'HEURISTIC / UNCALIBRATED',
      primeEligible,
      edgeSurvival,
      modelsExecuted,
      governanceReason,
      versionStack: VERSION_STACK
    };
  }

  function systemStatus() {
    return {
      versions: VERSION_STACK,
      calibration: 'HEURISTIC / UNCALIBRATED',
      primeGate: 'LOCKED',
      oneXTwo: ENGINE_REGISTRY['1X2'].status,
      doctrine: 'GOVERNANCE WINS'
    };
  }

  window.ArgusGovernance = { apply, systemStatus, VERSION_STACK, ENGINE_REGISTRY };
})();
