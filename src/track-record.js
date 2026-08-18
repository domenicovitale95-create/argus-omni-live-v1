(function () {
  const STORAGE_KEY = 'argus-omni-v8-track-record';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function save(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function probabilityForSelection(analysis) {
    const key = analysis.bestMarket === 'HOME' ? 'home' : analysis.bestMarket === 'DRAW' ? 'draw' : analysis.bestMarket === 'AWAY' ? 'away' : null;
    return key ? analysis.model?.[key] ?? null : null;
  }

  function record(match, analysis) {
    if (!match || !analysis) throw new Error('Missing match or analysis');
    if (match.isFinished) throw new Error('Finished matches cannot be frozen as new forecasts');
    if (!analysis.marketAvailable || !analysis.marketOdds) throw new Error('A current market price is required');

    const records = load();
    const predictionId = `ARGUS-${match.id}-${Date.now()}`;
    const frozen = Object.freeze({
      prediction_id: predictionId,
      timestamp: new Date().toISOString(),
      argus_version: analysis.versionStack?.app || 'ARGUS OMNI LIVE',
      knowledge_version: analysis.versionStack?.master || 'MASTER KNOWLEDGE',
      calibration_version: analysis.versionStack?.calibration || 'ARGUS V7',
      match_id: match.id,
      match: `${match.home} vs ${match.away}`,
      competition: match.competition,
      kickoff: match.kickoff,
      phase: analysis.phase,
      minute: match.isLive ? match.minute : null,
      score: match.isLive ? match.score : null,
      market: '1X2',
      selection: analysis.bestMarket,
      odds: analysis.marketOdds,
      odds_source: 'API-FOOTBALL / AGGREGATED',
      market_no_vig_probability: analysis.marketPriorProbability,
      raw_probability: analysis.rawProbability ?? probabilityForSelection(analysis),
      shrunk_probability: analysis.shrunkProbability,
      conservative_probability: analysis.conservativeProbability,
      fair_odds: analysis.fairOdds,
      conservative_fair_odds: analysis.conservativeFairOdds,
      minimum_acceptable_odds: analysis.minimumAcceptableOdds,
      probability_edge_pct: analysis.rawEdge ?? analysis.edge,
      base_ev_pct: analysis.baseEV,
      conservative_ev_pct: analysis.conservativeEV,
      confidence: analysis.confidence,
      data_quality: analysis.quality,
      lineup_status: 'UNKNOWN / NOT INTEGRATED',
      engine_status: analysis.engineStatus,
      shrinkage_status: analysis.shrinkageStatus,
      uncertainty_status: analysis.uncertaintyStatus,
      classification: analysis.classification,
      models_executed: analysis.modelsExecuted || [],
      main_risks: [analysis.governanceReason].filter(Boolean),
      settled: false
    });

    records.push(frozen);
    save(records);
    return frozen;
  }

  function count() { return load().length; }

  function audit() {
    const records = load();
    const settled = records.filter(r => r.settled);
    const actionable = records.filter(r => r.classification !== 'NO BET');
    return {
      total: records.length,
      actionable: actionable.length,
      settled: settled.length,
      note: records.length < 25 ? 'DESCRIPTIVE ONLY — SAMPLE TOO SMALL' : records.length < 50 ? 'PRELIMINARY' : records.length < 100 ? 'EARLY AUDIT' : 'MEANINGFUL AUDIT SAMPLE'
    };
  }

  window.ArgusTrackRecord = { record, count, audit, load };
})();
