(()=>{
  const verdictRank=v=>({PRIME:5,'STRONG VALUE':4,VALUE:3,WATCH:2,MODEL:1,'NO BET':0}[String(v||'').toUpperCase()]??0);
  const finite=v=>Number.isFinite(Number(v))?Number(v):null;
  const humanSelection=v=>{
    const s=String(v||'').toUpperCase();
    const map={HOME:'Home team to win',DRAW:'Draw',AWAY:'Away team to win',OVER_1_5:'Over 1.5 goals',UNDER_1_5:'Under 1.5 goals',OVER_2_5:'Over 2.5 goals',UNDER_2_5:'Under 2.5 goals',OVER_3_5:'Over 3.5 goals',UNDER_3_5:'Under 3.5 goals',BTTS_YES:'Both teams to score · Yes',BTTS_NO:'Both teams to score · No',HOME_OVER_0_5:'Home team over 0.5 goals',HOME_UNDER_0_5:'Home team under 0.5 goals',AWAY_OVER_0_5:'Away team over 0.5 goals',AWAY_UNDER_0_5:'Away team under 0.5 goals',DOUBLE_CHANCE_1X:'Double chance 1X',DOUBLE_CHANCE_12:'Double chance 12',DOUBLE_CHANCE_X2:'Double chance X2'};
    if(map[s])return map[s];const exact=s.match(/^EXACT_SCORE:(\d+)-(\d+)$/);return exact?`Exact score ${exact[1]}-${exact[2]}`:(v||'No bet');
  };
  function localFallback(match,base){
    const candidates=[];
    if(base?.marketAvailable&&finite(base?.marketOdds)>1){candidates.push({classification:base.classification||'MODEL',label:humanSelection(base.bestMarket),selection:String(base.bestMarket||'').toUpperCase(),marketType:'1X2',odds:finite(base.marketOdds),fairOdds:null,edge:finite(base.edge),probability:finite(base.conservativeProbability??base.shrunkProbability??base.rawProbability),confidence:finite(base.confidence),quality:finite(base.quality),ev:finite(base.conservativeEV),source:'LOCAL_1X2'});}
    try{
      const multi=window.ArgusMarketEngine?.analyze?.(match);
      for(const m of multi?.markets||[]){
        if(!(finite(m.marketOdds)>1)||m.probability==null)continue;
        candidates.push({classification:m.classification||'MODEL',label:m.label,selection:m.key||m.label,marketType:String(m.category||'OTHER').toUpperCase(),odds:finite(m.marketOdds),fairOdds:finite(m.fairOdds),edge:finite(m.trainingEdge??m.edge),probability:finite(m.probability),confidence:finite(m.probabilityPct),quality:finite(m.qualityPct),ev:m.probability&&m.marketOdds?Number(((m.probability*m.marketOdds-1)*100).toFixed(2)):null,source:m.source||'LOCAL_MULTI_MARKET'});
      }
      for(const s of multi?.exactScores||[]){
        if(!(finite(s.marketOdds)>1)||s.probability==null)continue;
        candidates.push({classification:verdictRank(s.classification)>=verdictRank('WATCH')?'WATCH':'MODEL',label:`Exact score ${s.score}`,selection:`EXACT_SCORE:${s.score}`,marketType:'EXACT_SCORE',odds:finite(s.marketOdds),fairOdds:finite(s.fairOdds),edge:finite(s.trainingEdge??s.edge),probability:finite(s.probability),confidence:finite(s.probabilityPct),quality:finite(s.qualityPct),ev:s.probability&&s.marketOdds?Number(((s.probability*s.marketOdds-1)*100).toFixed(2)):null,source:s.source||'LOCAL_EXACT_SCORE'});
      }
    }catch(_){ }
    candidates.sort((a,b)=>verdictRank(b.classification)-verdictRank(a.classification)||(finite(b.edge)??-999)-(finite(a.edge)??-999)||(finite(b.probability)??0)-(finite(a.probability)??0));
    const c=candidates[0];if(!c||verdictRank(c.classification)<=0)return base;
    return{...base,classification:c.classification,bestMarket:c.label,selectionKey:c.selection,marketType:c.marketType,marketOdds:c.odds,fairOdds:c.fairOdds,edge:c.edge,confidence:c.confidence??base?.confidence,quality:c.quality??base?.quality,rawProbability:c.probability,shrunkProbability:c.probability,conservativeProbability:c.probability,conservativeEV:c.ev,marketAvailable:true,decisionSource:c.source,engineStatus:'ALL MODELLED MARKETS CHECKED'};
  }
  function officialFromRow(match,base,row){
    if(!row)return localFallback(match,base);
    const verdict=String(row.finalVerdict||'NO BET').toUpperCase(),c=row.eligibilityCandidate||{},selection=row.stakeSelection||c.selection||c.side||null,odds=finite(row.stakeOdds??c.odds),prob=finite(c.probability),edge=finite(c.edgePct),fair=finite(c.fairOdds),ev=finite(c.evPct),confidence=finite(row.netConfidence),quality=finite(c.dataQuality);
    const label=c.label||humanSelection(selection);
    return{...base,classification:verdict,bestMarket:verdict==='NO BET'?'No bet':label,selectionKey:selection,marketType:c.marketType||null,marketLine:c.line??null,marketOdds:odds,fairOdds:fair,edge,confidence:confidence??base?.confidence,quality:quality??base?.quality,rawProbability:prob??base?.rawProbability,shrunkProbability:prob??base?.shrunkProbability,conservativeProbability:prob??base?.conservativeProbability,conservativeEV:ev,marketAvailable:Boolean(odds&&odds>1),decisionSource:'OFFICIAL_DECISION_SCHEDULER',engineStatus:verdict==='NO BET'?'ARGUS checked the available modelled markets and found no bet strong enough.':'ARGUS checked the available modelled markets and selected the strongest option.'};
  }
  async function planMap(){
    try{const r=await fetch('/api/decision-scheduler',{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)return new Map();const j=await r.json();const rows=Array.isArray(j?.plan)?j.plan:[];return new Map(rows.map(x=>[String(x.fixtureId),x]));}catch(_){return new Map()}
  }
  async function archive(matches,analyses,meta){
    try{await fetch('/api/predictions',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({matches,analyses,meta}),keepalive:true})}catch(_){ }
  }
  const originalAnalyze=typeof analyzeMatches==='function'?analyzeMatches:null;
  if(!originalAnalyze)return;
  analyzeMatches=async function(matches,meta=null){
    state.matches=matches;state.meta=meta;
    const map=await planMap();
    state.analyses=matches.map(m=>{const raw=window.ArgusEngine.analyze(m),base=window.ArgusGovernance?window.ArgusGovernance.apply(raw,m):raw;return officialFromRow(m,base,map.get(String(m.id)))});
    render();
    archive(matches,state.analyses,meta);
  };
})();
