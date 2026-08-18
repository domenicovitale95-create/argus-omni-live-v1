(function(){
 const KEY='argus-live-cache-v5';let last=0;
 function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
 function cls(c){c=String(c||'').toLowerCase();return c==='prime'?'prime':c==='value'?'value':c==='watch'?'watch':''}
 function label(m){return `${m.home} vs ${m.away}`}
 function fmtMarket(x){if(!x)return'No validated signal';const m=x.market;const price=m.marketOdds?` · ${m.marketOdds.toFixed(2)}`:'';return `${m.label}${price}`}
 function render(){const row=read();if(!row||!Array.isArray(row.matches)||!window.ArgusMarketEngine)return;const saved=Number(row.savedAt)||0;if(saved===last)return;last=saved;const matches=row.matches.filter(m=>!m.isFinished);const all=window.ArgusMarketEngine.bestAcross(matches);const goals=all.find(x=>x.market.category==='goals'||x.market.category==='btts');const exact=window.ArgusMarketEngine.bestExact(matches)[0];const oneX=matches.map(m=>({m,a:window.ArgusEngine?.analyze?.(m)})).filter(x=>x.a&&x.a.marketAvailable).sort((a,b)=>(b.a.edge||0)-(a.a.edge||0))[0];
  const a=document.getElementById('bestMatchShortcut'),b=document.getElementById('bestMarketShortcut'),c=document.getElementById('bestExactShortcut');if(!a||!b||!c)return;
  if(oneX){a.className=`market-shortcut ${cls(oneX.a.classification)}`;a.innerHTML=`<span>Best match bet</span><strong>${label(oneX.m)}</strong><small>${oneX.a.bestMarket} · ${oneX.a.confidence||0}% confidence</small><i class="mini-signal">${oneX.a.classification||'WATCH'}</i>`}else a.innerHTML='<span>Best match bet</span><strong>No validated 1X2 signal</strong><small>ARGUS prefers no bet to a weak edge.</small>';
  if(goals){b.className=`market-shortcut ${cls(goals.market.classification)}`;b.innerHTML=`<span>Best goal market</span><strong>${label(goals.match)}</strong><small>${fmtMarket(goals.market)} · ${goals.market.probabilityPct}% model</small><i class="mini-signal">${goals.market.classification}</i>`}else b.innerHTML='<span>Best goal market</span><strong>No validated market yet</strong><small>Open Markets for full coverage.</small>';
  if(exact){c.innerHTML=`<span>Best exact score</span><strong>${label(exact.match)}</strong><small>${exact.score.score} · ${exact.score.probabilityPct}% model probability</small><i class="mini-signal">MODEL</i>`}else c.innerHTML='<span>Best exact score</span><strong>Insufficient history</strong><small>ARGUS will not manufacture a scoreline.</small>';
 }
 setInterval(render,1200);document.addEventListener('DOMContentLoaded',render);render();
})();