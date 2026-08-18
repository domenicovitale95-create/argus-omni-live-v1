(function(){
  function safe(v,f=0){return Number.isFinite(Number(v))?Number(v):f}
  function scoreMatch(match,analysis){
    const reasons=[];let score=100;
    if(!match?.history90d?.home||!match?.history90d?.away){score-=28;reasons.push('Recent-history coverage is incomplete')}
    const q=safe(analysis?.quality,0);if(q<70){score-=Math.round((70-q)*.35);reasons.push('Data quality is below the preferred threshold')}
    const conf=safe(analysis?.confidence,0);if(conf<60){score-=12;reasons.push('Model confidence is still limited')}
    if(!analysis?.marketAvailable){score-=18;reasons.push('No reliable market price is available')}
    if(analysis?.freshnessStatus&&String(analysis.freshnessStatus).toUpperCase().includes('STALE')){score-=18;reasons.push('Some inputs are stale')}
    const rel=window.ArgusReliability?.adjustment?.(match,analysis);if(rel?.status==='DEGRADED'){score-=18;reasons.push('This league is currently degraded in the reliability profile')}else if(rel?.status==='CAUTION'){score-=10;reasons.push('This league is under caution')}
    const adapt=window.ArgusAdaptiveWeights?.boundedMultiplier?.(match,analysis?.phase);if(adapt?.status==='DEGRADED'){score-=12;reasons.push('Adaptive weights are reducing trust')}else if(adapt?.status==='CAUTION'){score-=7;reasons.push('Adaptive learning is cautious here')}
    return {score:Math.max(0,Math.min(100,score)),reasons,rel,adapt};
  }
  function systemSnapshot(matches=[],analyses=[]){
    const rows=matches.map((m,i)=>({match:m,analysis:analyses[i]||{},quality:scoreMatch(m,analyses[i]||{})}));
    const active=rows.filter(r=>!r.match?.isFinished);
    const avg=active.length?Math.round(active.reduce((s,r)=>s+r.quality.score,0)/active.length):0;
    const strong=active.filter(r=>r.quality.score>=75).length;
    const weak=active.filter(r=>r.quality.score<55).length;
    const track=window.ArgusTrackRecord?.audit?.()||{total:0,settled:0,note:'NO TRACK RECORD'};
    const adaptive=window.ArgusAdaptiveWeights?.payload?.()||{};
    const leagueProfiles=Object.values(adaptive.league||{});
    const learned=leagueProfiles.filter(x=>['VALIDATING_POSITIVE','RECOVERING','NEUTRAL'].includes(String(x?.status||''))).length;
    const caution=leagueProfiles.filter(x=>['CAUTION','DEGRADED'].includes(String(x?.status||''))).length;
    const next=[];
    if(track.settled<25)next.push('Need more settled predictions before trusting performance learning');
    if(weak>0)next.push(`${weak} current match${weak===1?'':'es'} need better data before stronger decisions`);
    if(caution>0)next.push(`${caution} reliability profile${caution===1?'':'s'} currently need caution`);
    if(!next.length)next.push('No major training weakness detected in the current cached sample');
    return {avg,strong,weak,total:active.length,track,learned,caution,next,rows};
  }
  window.ArgusSelfImprovement={scoreMatch,systemSnapshot};
})();