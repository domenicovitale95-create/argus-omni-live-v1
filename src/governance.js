(function () {
  const VERSION_STACK = {
    master: 'ARGUS OMNI MASTER KNOWLEDGE 1.0',
    ensemble: 'ARGUS EXCELLENCE V5 ENSEMBLE PROTOCOL',
    calibration: 'ARGUS V7 CALIBRATION & GOVERNANCE ENGINE',
    trackRecord: 'ARGUS V8 TRACK RECORD & SELF-AUDIT ENGINE',
    commandCenter: 'ARGUS V9 COMMAND CENTER',
    live: 'ARGUS V10 LIVE BETTING INTELLIGENCE ENGINE',
    dataLayer: 'ARGUS V11 LIVE DATA LAYER',
    cognitive: 'ARGUS V12 COGNITIVE SUPERINTELLIGENCE & DECISION ENGINE',
    app: 'ARGUS OMNI LIVE V3.0'
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

  function governingEngine() { return ENGINE_REGISTRY['1X2']; }

  function freshnessState(match) {
    const stamp = match?.oddsUpdatedAt || match?.updatedAt || match?.timestamp || null;
    if (!stamp) return 'UNKNOWN';
    const age = Date.now() - new Date(stamp).getTime();
    if (!Number.isFinite(age) || age < 0) return 'UNKNOWN';
    if (age <= 5 * 60 * 1000) return 'FRESH';
    if (age <= 20 * 60 * 1000) return 'AGING';
    return 'STALE';
  }

  function modelConsensus(analysis) {
    const disagreement = safe(analysis?.modelDisagreement, 0);
    if (analysis?.providerModel && analysis?.historyModel) return Math.round(clamp(1 - disagreement / 35) * 100);
    if (analysis?.historyModel || analysis?.providerModel) return 58;
    if (analysis?.phase === 'LIVE') return analysis?.historyModel ? 64 : 50;
    return 35;
  }

  function adversarialAssessment(analysis, match, rawEdge, conservativeEV, consensus) {
    const quality = safe(analysis?.quality, 0);
    const uncertainty = safe(analysis?.uncertainty, 100);
    let score = 100;
    const flags = [];

    if (quality < 80) { score -= (80 - quality) * 0.65; flags.push('DATA QUALITY BELOW IDEAL'); }
    if (uncertainty > 45) { score -= (uncertainty - 45) * 0.55; flags.push('HIGH MODEL UNCERTAINTY'); }
    if (consensus < 65) { score -= (65 - consensus) * 0.55; flags.push('MODEL DISAGREEMENT'); }
    if (rawEdge < 0.05) { score -= 8; flags.push('THIN RAW EDGE'); }
    if (conservativeEV <= 0) { score -= 20; flags.push('EDGE FAILS CONSERVATIVE TEST'); }
    if (match?.isLive && safe(match?.minute, 0) < 18) { score -= 10; flags.push('EARLY LIVE STATE'); }
    if (freshnessState(match) === 'STALE') { score -= 20; flags.push('STALE INPUT RISK'); }

    return { score: Math.round(clamp(score / 100) * 100), flags };
  }

  function apply(analysis, match) {
    const engine = governingEngine(match, analysis);
    const key = sideKey(analysis?.bestMarket);
    const odds = safe(analysis?.marketOdds, 0);
    const raw = key ? safe(analysis?.model?.[key], 0) : 0;
    const marketPrior = key ? safe(analysis?.market?.[key], 0) : 0;
    const marketAvailable = Boolean(analysis?.marketAvailable && odds > 1 && marketPrior > 0);
    const freshness = freshnessState(match);
    const consensus = modelConsensus(analysis);

    const modelsExecuted = [];
    if (match?.isLive) modelsExecuted.push('V10 LIVE MATCH-STATE');
    if (analysis?.historyModel || match?.history90d) modelsExecuted.push('V5 90D TEAM-STRENGTH / POISSON');
    if (analysis?.providerModel || match?.preMatchModel) modelsExecuted.push('V5 PROVIDER MODEL (SECONDARY)');
    if (marketAvailable) modelsExecuted.push('V7 MARKET PRIOR / NO-VIG');
    modelsExecuted.push('V12 ADVERSARIAL / UNCERTAINTY GATE');

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
        survivingEdge: null,
        shrinkageStatus: 'UNAVAILABLE',
        uncertaintyStatus: 'HEURISTIC / UNCALIBRATED',
        engineStatus: engine.status,
        calibrationStatus: 'HEURISTIC / UNCALIBRATED',
        primeEligible: false,
        edgeSurvival: false,
        dataValidityScore: safe(analysis?.quality, 0),
        modelConsensusScore: consensus,
        adversarialScore: 0,
        adversarialFlags: ['CRITICAL PRICE OR MODEL INPUT MISSING'],
        freshnessStatus: freshness,
        modelsExecuted,
        governanceReason: match?.isFinished ? 'FINISHED — NOT ACTIONABLE' : 'CRITICAL PRICE OR MODEL INPUT MISSING',
        classification: 'NO BET',
        versionStack: VERSION_STACK
      };
    }

    // V5 + V7: market-dominant shrinkage while deployment calibration remains unvalidated.
    const wModel = engine.modelWeight;
    const shrunk = clamp(raw * wModel + marketPrior * (1 - wModel));

    // V12: uncertainty is explicitly penalized before edge is allowed to survive.
    const confidence = safe(analysis?.confidence, 0);
    const disagreement = Math.abs(raw - marketPrior);
    const engineUncertainty = safe(analysis?.uncertainty, 50) / 100;
    const dataRisk = (100 - safe(analysis?.quality, 0)) / 100;
    const uncertaintyBuffer = clamp(
      (1 - confidence / 100) * 0.020 +
      disagreement * 0.10 +
      engineUncertainty * 0.018 +
      dataRisk * 0.012,
      0.006,
      0.06
    );
    const conservative = clamp(shrunk - uncertaintyBuffer, 0.01, 0.99);

    const rawEdge = raw - marketPrior;
    const shrunkEdge = shrunk - marketPrior;
    const survivingEdge = conservative - marketPrior;
    const baseEV = shrunk * odds - 1;
    const conservativeEV = conservative * odds - 1;
    const conservativeFairOdds = 1 / conservative;
    const minimumAcceptableOdds = conservativeFairOdds;
    const edgeSurvival = conservativeEV > 0 && survivingEdge > 0;
    const adversarial = adversarialAssessment(analysis, match, rawEdge, conservativeEV, consensus);

    let classification = 'NO BET';
    let governanceReason = 'V12: EDGE DOES NOT SURVIVE UNCERTAINTY / ADVERSARIAL GATE';

    if (match?.isFinished) {
      governanceReason = 'FINISHED — NOT ACTIONABLE';
    } else if (freshness === 'STALE') {
      governanceReason = 'V11/V12: STALE INPUT — ACTION BLOCKED';
    } else if (edgeSurvival && confidence >= 62 && rawEdge >= 0.035 && adversarial.score >= 62 && consensus >= 50) {
      classification = 'VALUE — UNCALIBRATED';
      governanceReason = 'V5→V12 STACK PASSED: POSITIVE CONSERVATIVE EV + ADVERSARIAL SURVIVAL; CALIBRATION STILL HEURISTIC';
    } else if (rawEdge >= 0.03 || (baseEV > 0 && conservativeEV > -0.03)) {
      classification = 'WATCH';
      governanceReason = adversarial.flags.length
        ? `V12 WATCH: ${adversarial.flags.slice(0, 2).join(' + ')}`
        : 'POTENTIAL RESIDUAL EDGE; FAILS FULL CONSERVATIVE / CALIBRATION GATE';
    }

    // V7/V8 governance: PRIME remains locked until sufficient frozen out-of-sample evidence exists.
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
      survivingEdge: Number((survivingEdge * 100).toFixed(2)),
      baseEV: Number((baseEV * 100).toFixed(2)),
      conservativeEV: Number((conservativeEV * 100).toFixed(2)),
      conservativeFairOdds: Number(conservativeFairOdds.toFixed(2)),
      minimumAcceptableOdds: Number(minimumAcceptableOdds.toFixed(2)),
      shrinkageStatus: 'V5/V7 HEURISTIC / MARKET-DOMINANT',
      uncertaintyStatus: 'V12 PENALIZED / UNCALIBRATED',
      engineStatus: engine.status,
      calibrationStatus: 'V7 HEURISTIC / V8 AUDIT REQUIRED',
      primeEligible,
      edgeSurvival,
      dataValidityScore: safe(analysis?.quality, 0),
      modelConsensusScore: consensus,
      adversarialScore: adversarial.score,
      adversarialFlags: adversarial.flags,
      freshnessStatus: freshness,
      modelsExecuted,
      governanceReason,
      versionStack: VERSION_STACK
    };
  }

  function systemStatus() {
    return {
      versions: VERSION_STACK,
      calibration: 'V7 HEURISTIC / V8 AUDIT REQUIRED',
      primeGate: 'LOCKED PENDING VALIDATION',
      oneXTwo: ENGINE_REGISTRY['1X2'].status,
      dataLayer: 'V11 CACHE / FRESHNESS AWARE',
      cognitiveGate: 'V12 ACTIVE',
      doctrine: 'STRICTEST GOVERNANCE RULE WINS'
    };
  }

  window.ArgusGovernance = { apply, systemStatus, VERSION_STACK, ENGINE_REGISTRY };
})();
