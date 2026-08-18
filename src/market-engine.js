(function(){
  const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
  const safe=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const fact=n=>{let x=1;for(let i=2;i<=n;i++)x*=i;return x};
  const pois=(k,l)=>Math.exp(-l)*Math.pow(l,k)/fact(k);
  const pct=v=>Number((v*100).toFixed(1));
  const fair=p=>p>0?Number((1/p).toFixed(2)):null;
  function lambdas(match){
    const h=match?.history90d?.home,a=match?.history90d?.away;
    if(!h||!a||safe(h.matches)<3||safe(a.matches)<3)return null;
    const formDelta=(safe(h.last5PPG)-safe(a.last5PPG))/3;
    const venueDelta=((h.homePPG==null?safe(h.pointsPerGame,1.4):safe(h.homePPG,1.4))-(a.awayPPG==null?safe(a.pointsPerGame,1.2):safe(a.awayPPG,1.2)))/3;
    let home=safe(h.goalsForPerGame,1.2)*.54+safe(a.goalsAgainstPerGame,1.2)*.46;
    let away=safe(a.goalsForPerGame,1.1)*.54+safe(h.goalsAgainstPerGame,1.1)*.46;
    home*=1.06+formDelta*.11+venueDelta*.08;away*=.98-formDelta*.07-venueDelta*.05;
    return {home:clamp(home,.2,3.8),away:clamp(away,.2,3.8),quality:clamp(Math.min(safe(h.matches),safe(a.matches))/10,0,1)};
  }
  function matrix(match,max=7){const l=lambdas(match);if(!l)return null;const rows=[];for(let h=0;h<=max;h++)for(let a=0;a<=max;a++)rows.push({home:h,away:a,p:pois(h,l.home)*pois(a,l.away)});const sum=rows.reduce((s,r)=>s+r.p,0)||1;rows.forEach(r=>r.p/=sum);return {rows,lambdas:l};}
  function sumWhere(rows,fn){return rows.reduce((s,r)=>s+(fn(r)?r.p:0),0)}
  function scoreDistribution(match,limit=5){const m=matrix(match);if(!m)return[];return m.rows.slice().sort((a,b)=>b.p-a.p).slice(0,limit).map(r=>({score:`${r.home}-${r.away}`,home:r.home,away:r.away,probability:r.p,probabilityPct:pct(r.p),fairOdds:fair(r.p),source:'ARGUS_POISSON_90D'}));}
  const aliases={
    over15:['over15','over1_5','over_1_5','goalsOver15'],over25:['over25','over2_5','over_2_5','goalsOver25'],over35:['over35','over3_5','over_3_5','goalsOver35'],under25:['under25','under2_5','under_2_5','goalsUnder25'],
    bttsYes:['bttsYes','btts_yes','bothTeamsToScoreYes'],bttsNo:['bttsNo','btts_no','bothTeamsToScoreNo'],homeOver05:['homeOver05','home_team_over_0_5'],awayOver05:['awayOver05','away_team_over_0_5'],
    doubleChance1X:['doubleChance1X','double_chance_1x'],doubleChanceX2:['doubleChanceX2','double_chance_x2'],cornersOver75:['cornersOver75','corners_over_7_5','over75Corners'],cornersOver85:['cornersOver85','corners_over_8_5','over85Corners'],cornersOver95:['cornersOver95','corners_over_9_5','over95Corners']
  };
  function sources(match){return [match?.marketOdds,match?.markets,match?.odds,match?.marketData,match].filter(Boolean)}
  function readOdd(match,key){for(const s of sources(match)){for(const k of aliases[key]||[key]){const v=s?.[k];if(v==null)continue;if(typeof v==='object'){const n=Number(v.odds??v.price??v.value);if(Number.isFinite(n)&&n>1)return n;}const n=Number(v);if(Number.isFinite(n)&&n>1)return n;}}return null}
  function classify(prob,odds,quality){const implied=odds&&odds>1?1/odds:null,edge=implied!=null?prob-implied:null;if(odds&&quality>=.7&&prob>=.56&&edge>=.06)return'PRIME';if(odds&&quality>=.55&&edge>=.03)return'VALUE';if(prob>=.60&&quality>=.5)return'WATCH';return'MODEL';}
  function item(key,label,cat,prob,quality,match){const odds=readOdd(match,key),implied=odds?1/odds:null,edge=implied!=null?prob-implied:null;return {key,label,category:cat,probability:prob,probabilityPct:pct(prob),fairOdds:fair(prob),marketOdds:odds,edge:edge==null?null:Number((edge*100).toFixed(1)),classification:classify(prob,odds,quality),qualityPct:Math.round(quality*100),source:'ARGUS_POISSON_90D'};}
  function analyze(match){const m=matrix(match);if(!m)return {available:false,reason:'Insufficient 90-day history',markets:[],exactScores:[]};const r=m.rows,q=m.lambdas.quality,total=x=>sumWhere(r,row=>row.home+row.away>x),homeGoals=x=>sumWhere(r,row=>row.home>x),awayGoals=x=>sumWhere(r,row=>row.away>x),btts=sumWhere(r,row=>row.home>0&&row.away>0),homeWin=sumWhere(r,row=>row.home>row.away),draw=sumWhere(r,row=>row.home===row.away),awayWin=sumWhere(r,row=>row.home<row.away);
    const markets=[item('over15','Over 1.5','goals',total(1.5),q,match),item('over25','Over 2.5','goals',total(2.5),q,match),item('over35','Over 3.5','goals',total(3.5),q,match),item('under25','Under 2.5','goals',1-total(2.5),q,match),item('bttsYes','BTTS Yes','btts',btts,q,match),item('bttsNo','BTTS No','btts',1-btts,q,match),item('homeOver05','Home team Over 0.5','team',homeGoals(.5),q,match),item('awayOver05','Away team Over 0.5','team',awayGoals(.5),q,match),item('doubleChance1X','Double Chance 1X','other',homeWin+draw,q,match),item('doubleChanceX2','Double Chance X2','other',awayWin+draw,q,match)];
    const cornerKeys=[['cornersOver75','Corners Over 7.5'],['cornersOver85','Corners Over 8.5'],['cornersOver95','Corners Over 9.5']];for(const [key,label] of cornerKeys){const odds=readOdd(match,key);markets.push({key,label,category:'corners',probability:null,probabilityPct:null,fairOdds:null,marketOdds:odds,edge:null,classification:odds?'AVAILABLE':'NO DATA',qualityPct:null,source:odds?'PROVIDER_ODDS_ONLY':'NO_VALIDATED_CORNER_MODEL'});}
    return {available:true,lambdas:{home:Number(m.lambdas.home.toFixed(2)),away:Number(m.lambdas.away.toFixed(2))},qualityPct:Math.round(q*100),markets,exactScores:scoreDistribution(match,5)};
  }
  function bestAcross(matches,category){const out=[];for(const match of matches||[]){if(match?.isFinished)continue;const a=analyze(match);for(const market of a.markets||[]){if(category&&market.category!==category)continue;if(market.probability==null)continue;out.push({match,market,analysis:a});}}return out.sort((x,y)=>{const rank={PRIME:4,VALUE:3,WATCH:2,MODEL:1};return (rank[y.market.classification]||0)-(rank[x.market.classification]||0)||(y.market.edge??-999)-(x.market.edge??-999)||(y.market.probability||0)-(x.market.probability||0);});}
  function bestExact(matches){const out=[];for(const match of matches||[]){if(match?.isFinished)continue;const scores=scoreDistribution(match,1);if(scores[0])out.push({match,score:scores[0]});}return out.sort((a,b)=>b.score.probability-a.score.probability);}
  window.ArgusMarketEngine={analyze,scoreDistribution,bestAcross,bestExact,lambdas,readOdd};
})();