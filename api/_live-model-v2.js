const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number(v)||0));
const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};
const fact=k=>{let x=1;for(let i=2;i<=k;i++)x*=i;return x};
const pois=(k,l)=>Math.exp(-l)*Math.pow(l,k)/fact(k);
const LIVE_STATUSES=new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
const MODEL_VERSION='LIVE-V2-MARKET-CALIBRATED-STATE-POISSON';
const VALIDATION_STATUS='SHADOW_ONLY';

const ODDS_KEY={
 HOME:['markets','home'],DRAW:['markets','draw'],AWAY:['markets','away'],
 OVER_1_5:['marketOdds','over15'],UNDER_1_5:['marketOdds','under15'],OVER_2_5:['marketOdds','over25'],UNDER_2_5:['marketOdds','under25'],OVER_3_5:['marketOdds','over35'],UNDER_3_5:['marketOdds','under35'],
 BTTS_YES:['marketOdds','bttsYes'],BTTS_NO:['marketOdds','bttsNo'],HOME_OVER_0_5:['marketOdds','homeOver05'],HOME_UNDER_0_5:['marketOdds','homeUnder05'],AWAY_OVER_0_5:['marketOdds','awayOver05'],AWAY_UNDER_0_5:['marketOdds','awayUnder05'],
 DOUBLE_CHANCE_1X:['marketOdds','doubleChance1X'],DOUBLE_CHANCE_12:['marketOdds','doubleChance12'],DOUBLE_CHANCE_X2:['marketOdds','doubleChanceX2']
};
const PAIRS={OVER_1_5:'UNDER_1_5',UNDER_1_5:'OVER_1_5',OVER_2_5:'UNDER_2_5',UNDER_2_5:'OVER_2_5',OVER_3_5:'UNDER_3_5',UNDER_3_5:'OVER_3_5',BTTS_YES:'BTTS_NO',BTTS_NO:'BTTS_YES',HOME_OVER_0_5:'HOME_UNDER_0_5',HOME_UNDER_0_5:'HOME_OVER_0_5',AWAY_OVER_0_5:'AWAY_UNDER_0_5',AWAY_UNDER_0_5:'AWAY_OVER_0_5'};

function isLive(match){return Boolean(match?.isLive)||LIVE_STATUSES.has(String(match?.status||'').toUpperCase())}
function normalize3(x){const h=Math.max(0,n(x?.HOME??x?.home,0)),d=Math.max(0,n(x?.DRAW??x?.draw,0)),a=Math.max(0,n(x?.AWAY??x?.away,0)),s=h+d+a;return s?{HOME:h/s,DRAW:d/s,AWAY:a/s}:null}
function odd(match,selection){const path=ODDS_KEY[selection];if(!path)return null;const v=n(match?.[path[0]]?.[path[1]]);return v>1?v:null}
function market1x2(match){const h=odd(match,'HOME'),d=odd(match,'DRAW'),a=odd(match,'AWAY');if(!(h>1&&d>1&&a>1))return null;return normalize3({HOME:1/h,DRAW:1/d,AWAY:1/a})}
function provider1x2(match){return normalize3(match?.preMatchModel)}
function historyLambdas(match){
 const h=match?.history90d?.home,a=match?.history90d?.away;if(!h||!a||n(h.matches,0)<3||n(a.matches,0)<3)return null;
 const formDelta=(n(h.last5PPG,0)-n(a.last5PPG,0))/3;
 const venueDelta=((h.homePPG==null?n(h.pointsPerGame,1.4):n(h.homePPG,1.4))-(a.awayPPG==null?n(a.pointsPerGame,1.2):n(a.awayPPG,1.2)))/3;
 let home=n(h.goalsForPerGame,1.2)*.54+n(a.goalsAgainstPerGame,1.2)*.46;
 let away=n(a.goalsForPerGame,1.1)*.54+n(h.goalsAgainstPerGame,1.1)*.46;
 home*=1.06+formDelta*.11+venueDelta*.08;away*=.98-formDelta*.07-venueDelta*.05;
 return{home:clamp(home,.2,3.8),away:clamp(away,.2,3.8),quality:clamp(Math.min(n(h.matches,0),n(a.matches,0))/10,0,1),source:'HISTORY_90D'};
}
function marketDerivedLambdas(match){
 const q=market1x2(match);if(!q)return null;
 const provider=provider1x2(match),strength=provider?normalize3({HOME:q.HOME*.65+provider.HOME*.35,DRAW:q.DRAW*.65+provider.DRAW*.35,AWAY:q.AWAY*.65+provider.AWAY*.35}):q;
 const total=2.55,delta=clamp((strength.HOME-strength.AWAY)*1.15,-.42,.42),homeShare=clamp(.5+delta*.5,.28,.72);
 return{home:total*homeShare,away:total*(1-homeShare),quality:.45,source:provider?'MARKET_PLUS_PROVIDER':'MARKET_1X2_PRIOR'};
}
function baselineLambdas(match){return historyLambdas(match)||marketDerivedLambdas(match)||{home:1.35,away:1.15,quality:.2,source:'CONSERVATIVE_FALLBACK'}}
function horizon(match){const minute=clamp(n(match?.minute,0),0,130),status=String(match?.status||'').toUpperCase();if(status==='ET'||minute>100){const target=121;return{minute,remaining:Math.max(.25,target-minute),target}}const target=96;return{minute,remaining:Math.max(.25,target-minute),target}}
function completeness(match){
 const s=match?.stats||{},required=[match?.minute,match?.score?.home,match?.score?.away,match?.markets?.home,match?.markets?.draw,match?.markets?.away,s.shotsHome,s.shotsAway,s.shotsOnTargetHome,s.shotsOnTargetAway,s.possessionHome,s.possessionAway];
 return Math.round(required.filter(v=>v!==null&&v!==undefined&&v!=='').length/required.length*100);
}
function covariateTilt(match){
 const s=match?.stats||{};
 const share=(h,a,pad=2)=>(n(h,0)+pad/2)/(Math.max(0,n(h,0))+Math.max(0,n(a,0))+pad)-.5;
 const sot=share(s.shotsOnTargetHome,s.shotsOnTargetAway,3),shots=share(s.shotsHome,s.shotsAway,5),corners=share(s.cornersHome,s.cornersAway,3),poss=(clamp(n(s.possessionHome,50),0,100)-50)/100;
 return clamp(sot*.55+shots*.25+corners*.10+poss*.10,-.22,.22);
}
function scoreStateMultipliers(match,remaining){
 const h=n(match?.score?.home,0),a=n(match?.score?.away,0),delta=h-a,urgency=clamp(1-remaining/60,0,1);let hm=1,am=1;
 if(delta<0){hm*=1+.08+.10*urgency;am*=1-.03*urgency}else if(delta>0){am*=1+.08+.10*urgency;hm*=1-.03*urgency}
 return{home:clamp(hm,.82,1.22),away:clamp(am,.82,1.22)};
}
function liveLambdas(match){
 const base=baselineLambdas(match),hz=horizon(match),fraction=clamp(hz.remaining/95,.002,1.15),tilt=covariateTilt(match),state=scoreStateMultipliers(match,hz.remaining);
 const eventHome=Math.exp(tilt*.50),eventAway=Math.exp(-tilt*.50);
 const latePace=1+clamp((15-hz.remaining)/15,0,1)*.05;
 const home=clamp(base.home*fraction*eventHome*state.home*latePace,.003,4),away=clamp(base.away*fraction*eventAway*state.away*latePace,.003,4);
 return{home,away,baselineHome:base.home,baselineAway:base.away,baselineSource:base.source,baselineQuality:base.quality,remainingMinutes:hz.remaining,minute:hz.minute,targetMinute:hz.target,covariateTilt:tilt,stateMultipliers:state};
}
function finalScoreMatrix(match,maxAdditional=7){
 const l=liveLambdas(match),curH=Math.max(0,Math.round(n(match?.score?.home,0))),curA=Math.max(0,Math.round(n(match?.score?.away,0))),rows=[];
 for(let h=0;h<=maxAdditional;h++)for(let a=0;a<=maxAdditional;a++)rows.push({addHome:h,addAway:a,home:curH+h,away:curA+a,p:pois(h,l.home)*pois(a,l.away)});
 const sum=rows.reduce((s,r)=>s+r.p,0)||1;for(const r of rows)r.p/=sum;return{rows,lambdas:l,currentScore:{home:curH,away:curA}};
}
function state1x2(matrix){let HOME=0,DRAW=0,AWAY=0;for(const r of matrix.rows){if(r.home>r.away)HOME+=r.p;else if(r.home===r.away)DRAW+=r.p;else AWAY+=r.p}return normalize3({HOME,DRAW,AWAY})}
function official1x2(match,state,qualityPct){
 const market=market1x2(match);if(!market)return state;
 const w=clamp(.78-(qualityPct/100)*.18,.58,.78),raw={HOME:market.HOME*w+state.HOME*(1-w),DRAW:market.DRAW*w+state.DRAW*(1-w),AWAY:market.AWAY*w+state.AWAY*(1-w)};
 return normalize3(raw);
}
function rawStateProbability(selection,matrix,oneXtwo){
 const rows=matrix.rows,sum=fn=>rows.reduce((s,r)=>s+(fn(r)?r.p:0),0);
 if(selection==='HOME')return oneXtwo.HOME;if(selection==='DRAW')return oneXtwo.DRAW;if(selection==='AWAY')return oneXtwo.AWAY;
 if(selection==='DOUBLE_CHANCE_1X')return oneXtwo.HOME+oneXtwo.DRAW;if(selection==='DOUBLE_CHANCE_12')return oneXtwo.HOME+oneXtwo.AWAY;if(selection==='DOUBLE_CHANCE_X2')return oneXtwo.DRAW+oneXtwo.AWAY;
 if(selection==='OVER_1_5')return sum(r=>r.home+r.away>1.5);if(selection==='UNDER_1_5')return sum(r=>r.home+r.away<1.5);
 if(selection==='OVER_2_5')return sum(r=>r.home+r.away>2.5);if(selection==='UNDER_2_5')return sum(r=>r.home+r.away<2.5);
 if(selection==='OVER_3_5')return sum(r=>r.home+r.away>3.5);if(selection==='UNDER_3_5')return sum(r=>r.home+r.away<3.5);
 if(selection==='BTTS_YES')return sum(r=>r.home>0&&r.away>0);if(selection==='BTTS_NO')return sum(r=>!(r.home>0&&r.away>0));
 if(selection==='HOME_OVER_0_5')return sum(r=>r.home>.5);if(selection==='HOME_UNDER_0_5')return sum(r=>r.home<.5);if(selection==='AWAY_OVER_0_5')return sum(r=>r.away>.5);if(selection==='AWAY_UNDER_0_5')return sum(r=>r.away<.5);
 if(String(selection).startsWith('EXACT_SCORE:')){const score=String(selection).split(':')[1],m=score?.match(/^(\d+)-(\d+)$/);if(!m)return null;const h=Number(m[1]),a=Number(m[2]),row=rows.find(r=>r.home===h&&r.away===a);return row?.p??0}
 return null;
}
function pairMarketProbability(match,selection){const o=odd(match,selection),pair=PAIRS[selection],other=pair?odd(match,pair):null;if(!(o>1))return null;const q=1/o;if(other>1){const s=q+1/other;return s?q/s:q}return q}
function anchoredProbability(match,selection,stateProbability,snapshot){
 if(stateProbability==null)return null;
 if(['HOME','DRAW','AWAY'].includes(selection))return snapshot.official1x2[selection];
 if(['DOUBLE_CHANCE_1X','DOUBLE_CHANCE_12','DOUBLE_CHANCE_X2'].includes(selection))return stateProbability;
 const marketP=pairMarketProbability(match,selection);if(marketP==null||String(selection).startsWith('EXACT_SCORE:'))return stateProbability;
 const w=clamp(.70-(snapshot.dataCompleteness/100)*.15,.52,.70);return clamp(marketP*w+stateProbability*(1-w),.0001,.9999);
}
function observedAgeSeconds(match){const t=new Date(match?.observedAt||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,(Date.now()-t)/1000):null}
function liveModelSnapshot(match){
 if(!isLive(match))return null;const matrix=finalScoreMatrix(match),state=state1x2(matrix),dataCompleteness=completeness(match),official=official1x2(match,state,dataCompleteness),age=observedAgeSeconds(match);
 const sum=official.HOME+official.DRAW+official.AWAY,integrity={probabilitySum:Number(sum.toFixed(8)),simplexOk:Math.abs(sum-1)<1e-8,scoreConditioned:true,timeConditioned:true,marketCalibrated:Boolean(market1x2(match)),eventCovariatesBounded:true};
 return{modelVersion:MODEL_VERSION,validationStatus:VALIDATION_STATUS,matrix,state1x2:state,official1x2:official,dataCompleteness,observedAgeSeconds:age,lambdas:matrix.lambdas,currentScore:matrix.currentScore,integrity};
}
function probabilityForSelection(match,selection,snapshot=liveModelSnapshot(match)){if(!snapshot)return null;const stateP=rawStateProbability(selection,snapshot.matrix,snapshot.state1x2);return anchoredProbability(match,selection,stateP,snapshot)}
function candidateMathIntegrity(c,tol=.035){
 const p=n(c?.probability),o=n(c?.odds),mp=n(c?.marketProbability),fair=n(c?.fairOdds),edge=n(c?.edgePct),ev=n(c?.evPct),errors=[];
 if(!(p>0&&p<1))errors.push('PROBABILITY_OUT_OF_RANGE');if(!(o>1))errors.push('ODDS_INVALID');
 if(p>0&&fair!=null&&Math.abs(fair-1/p)>Math.max(.02,(1/p)*.01))errors.push('FAIR_ODDS_MISMATCH');
 if(p!=null&&mp!=null&&edge!=null&&Math.abs(edge-(p-mp)*100)>tol*100)errors.push('EDGE_MISMATCH');
 if(p!=null&&o>1&&ev!=null&&Math.abs(ev-(p*o-1)*100)>tol*100)errors.push('EV_MISMATCH');
 return{ok:errors.length===0,errors};
}

export{MODEL_VERSION,VALIDATION_STATUS,isLive,market1x2,historyLambdas,liveModelSnapshot,probabilityForSelection,candidateMathIntegrity};
