import { readJson, writeJson, storageReady } from './_report-store.js';

const HISTORY_PATH='argus/data/team-history-90d.json';
const OUT='argus/research/historical-walkforward.json';
const EPS=1e-12;
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function poisson(k,l){let f=1;for(let i=2;i<=k;i++)f*=i;return Math.exp(-l)*Math.pow(l,k)/f}
function norm3(x){const s=x.home+x.draw+x.away;return s>0?{home:x.home/s,draw:x.draw/s,away:x.away/s}:null}
function resultSide(h,a){return h>a?'HOME':h<a?'AWAY':'DRAW'}
function scoreKey(h,a){return `${h}-${a}`}
function logLoss(p,y){return -Math.log(clamp(p[y],EPS,1))}
function brier(p,y){return ['home','draw','away'].reduce((s,k)=>s+Math.pow(p[k]-(k===y?1:0),2),0)}
function calibrationBucket(p){const x=Math.floor(clamp(p,0,.999)*10)*10;return `${x}-${x+9}`}
function variantParams(id){
  if(id==='CONSERVATIVE')return{minGames:6,shrink:.28,homeAdv:1.07,maxLambda:3.4};
  if(id==='DEFENSIVE')return{minGames:8,shrink:.38,homeAdv:1.05,maxLambda:3.1};
  if(id==='RECENCY')return{minGames:5,shrink:.18,homeAdv:1.08,maxLambda:3.7,recency:true};
  return{minGames:5,shrink:.20,homeAdv:1.08,maxLambda:3.6};
}
function weightedMean(rows,fn,recency=false){if(!rows.length)return null;let sw=0,s=0;for(let i=0;i<rows.length;i++){const w=recency?Math.pow(.88,rows.length-1-i):1;sw+=w;s+=w*fn(rows[i])}return sw?s/sw:null}
function expectedGoals(homeHist,awayHist,params){
  const hg=weightedMean(homeHist,r=>r.gf,params.recency),hga=weightedMean(homeHist,r=>r.ga,params.recency),ag=weightedMean(awayHist,r=>r.gf,params.recency),aga=weightedMean(awayHist,r=>r.ga,params.recency);
  if([hg,hga,ag,aga].some(x=>x==null))return null;
  const leagueMean=1.35;
  let lh=((hg+aga)/2)*params.homeAdv,la=(ag+hga)/2;
  lh=(1-params.shrink)*lh+params.shrink*leagueMean*params.homeAdv;
  la=(1-params.shrink)*la+params.shrink*leagueMean;
  return{home:clamp(lh,.25,params.maxLambda),away:clamp(la,.20,params.maxLambda)};
}
function distribution(lh,la){
  let home=0,draw=0,away=0;const scores=[];
  for(let h=0;h<=7;h++)for(let a=0;a<=7;a++){const p=poisson(h,lh)*poisson(a,la);scores.push({score:`${h}-${a}`,p});if(h>a)home+=p;else if(h<a)away+=p;else draw+=p}
  scores.sort((a,b)=>b.p-a.p);return{p:norm3({home,draw,away}),scores};
}
function buildFixtures(store){
  const map=new Map();
  for(const [teamId,row] of Object.entries(store?.teams||{})){
    for(const m of row?.data?.allMatches||[]){
      const id=String(m.fixtureId||'');if(!id||!m.timestamp)continue;
      const x=map.get(id)||{fixtureId:Number(id),timestamp:Number(m.timestamp),competition:m.competition||'UNKNOWN',home:null,away:null,homeId:null,awayId:null,homeGoals:null,awayGoals:null};
      if(m.venue==='H'){x.homeId=Number(teamId);x.home=row?.data?.teamName||row?.teamName||`TEAM_${teamId}`;x.away=x.away||m.opponent||null;x.homeGoals=n(m.gf);x.awayGoals=n(m.ga)}
      if(m.venue==='A'){x.awayId=Number(teamId);x.away=row?.data?.teamName||row?.teamName||`TEAM_${teamId}`;x.home=x.home||m.opponent||null;x.homeGoals=n(m.ga);x.awayGoals=n(m.gf)}
      map.set(id,x);
    }
  }
  return [...map.values()].filter(x=>x.homeId&&x.awayId&&x.homeGoals!=null&&x.awayGoals!=null).sort((a,b)=>a.timestamp-b.timestamp);
}
function teamRows(store,teamId,before){return (store?.teams?.[String(teamId)]?.data?.allMatches||[]).filter(x=>Number(x.timestamp)<before).sort((a,b)=>a.timestamp-b.timestamp)}
function evalVariant(fixtures,store,id,holdoutStart){
  const params=variantParams(id),rows=[];
  for(const f of fixtures){
    const hh=teamRows(store,f.homeId,f.timestamp),ah=teamRows(store,f.awayId,f.timestamp);if(hh.length<params.minGames||ah.length<params.minGames)continue;
    const eg=expectedGoals(hh,ah,params);if(!eg)continue;const d=distribution(eg.home,eg.away),actual=resultSide(f.homeGoals,f.awayGoals),yk=actual.toLowerCase(),top=d.scores.slice(0,5).map(x=>x.score),actualScore=scoreKey(f.homeGoals,f.awayGoals),pick=['home','draw','away'].sort((a,b)=>d.p[b]-d.p[a])[0];
    rows.push({fixtureId:f.fixtureId,timestamp:f.timestamp,competition:f.competition,actual,actualScore,predicted:pick.toUpperCase(),probability:d.p[pick],brier:brier(d.p,yk),logLoss:logLoss(d.p,yk),exactTop1:top[0]===actualScore,exactTop3:top.slice(0,3).includes(actualScore),exactTop5:top.includes(actualScore),topScores:d.scores.slice(0,3),holdout:f.timestamp>=holdoutStart});
  }
  function stats(a){const count=a.length,wins=a.filter(x=>x.predicted===x.actual).length;return{sample:count,accuracy:count?Number((wins/count*100).toFixed(1)):null,brier:count?Number((a.reduce((s,x)=>s+x.brier,0)/count).toFixed(4)):null,logLoss:count?Number((a.reduce((s,x)=>s+x.logLoss,0)/count).toFixed(4)):null,exactTop1:count?Number((a.filter(x=>x.exactTop1).length/count*100).toFixed(1)):null,exactTop3:count?Number((a.filter(x=>x.exactTop3).length/count*100).toFixed(1)):null,exactTop5:count?Number((a.filter(x=>x.exactTop5).length/count*100).toFixed(1)):null}}
  const train=rows.filter(x=>!x.holdout),hold=rows.filter(x=>x.holdout);return{id,params,train:stats(train),holdout:stats(hold),total:stats(rows),rows};
}
function calibration(rows){const buckets={};for(const r of rows){const k=calibrationBucket(r.probability);const b=buckets[k]||(buckets[k]={sample:0,pred:0,wins:0});b.sample++;b.pred+=r.probability;b.wins+=r.predicted===r.actual?1:0}return Object.fromEntries(Object.entries(buckets).map(([k,b])=>[k,{sample:b.sample,meanPred:Number((b.pred/b.sample*100).toFixed(1)),observed:Number((b.wins/b.sample*100).toFixed(1)),gap:Number(((b.pred/b.sample-b.wins/b.sample)*100).toFixed(1))}]))}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const store=await readJson(HISTORY_PATH,{teams:{}}),fixtures=buildFixtures(store);if(fixtures.length<20)return res.status(200).json({version:'HISTORICAL-WALKFORWARD-1',status:'INSUFFICIENT_DATA',fixtures:fixtures.length,policy:{noHindsight:true,noHistoricalROIWithoutFrozenOdds:true}});
  const minTs=fixtures[0].timestamp,maxTs=fixtures[fixtures.length-1].timestamp,holdoutStart=minTs+(maxTs-minTs)*.75,ids=['BASELINE','CONSERVATIVE','DEFENSIVE','RECENCY'];const variants=ids.map(id=>evalVariant(fixtures,store,id,holdoutStart));
  const ranked=variants.slice().sort((a,b)=>{const ah=a.holdout.sample||0,bh=b.holdout.sample||0;if(Math.min(ah,bh)<20)return(b.total.sample||0)-(a.total.sample||0);return(a.holdout.logLoss??99)-(b.holdout.logLoss??99)}),champion=ranked[0]||null;
  const report={version:'HISTORICAL-WALKFORWARD-1',generatedAt:new Date().toISOString(),status:'RESEARCH_ONLY',source:'cached 90-day team histories',fixtures:fixtures.length,period:{from:new Date(minTs*1000).toISOString(),to:new Date(maxTs*1000).toISOString(),holdoutStart:new Date(holdoutStart*1000).toISOString(),holdoutFraction:.25},policy:{chronologicalOnly:true,noHindsight:true,minimumHistoryGames:5,recentHoldoutFraction:.25,historicalROI:null,noHistoricalROIWithoutFrozenOdds:true,liveVerifiedPerformanceRemainsPrimary:true,researchCannotPromotePrimeDirectly:true},champion:champion?{id:champion.id,train:champion.train,holdout:champion.holdout,total:champion.total}:null,variants:variants.map(v=>({id:v.id,params:v.params,train:v.train,holdout:v.holdout,total:v.total})),calibration:champion?calibration(champion.rows.filter(x=>x.holdout)): {},recentExamples:champion?champion.rows.filter(x=>x.holdout).slice(-30).reverse():[]};
  await writeJson(OUT,report);return res.status(200).json(report);
}
