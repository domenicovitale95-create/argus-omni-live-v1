import { readJson, writeJson, storageReady } from './_report-store.js';
import { listMonthShards, readShardIndex } from './_historical-shards.js';

const OUT='argus/research/historical-walk-forward.json';
const EPS=1e-12;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function softmax(v){const m=Math.max(...v),e=v.map(x=>Math.exp(x-m)),s=e.reduce((a,b)=>a+b,0);return e.map(x=>x/s)}
function poisson(lambda,k){let f=1;for(let i=2;i<=k;i++)f*=i;return Math.exp(-lambda)*Math.pow(lambda,k)/f}
function outcomeIndex(w){return w==='HOME'?0:w==='DRAW'?1:2}
function scoreGrid(lh,la){const rows=[];let mass=0;for(let h=0;h<=8;h++)for(let a=0;a<=8;a++){const p=poisson(lh,h)*poisson(la,a);rows.push({h,a,score:`${h}-${a}`,p});mass+=p}for(const r of rows)r.p/=mass||1;return rows}
function teamState(){return{rating:1500,played:0,gf:0,ga:0,homePlayed:0,homeGF:0,homeGA:0,awayPlayed:0,awayGF:0,awayGA:0}}
function expectedGoals(h,a,variant){const hf=h.homePlayed?h.homeGF/h.homePlayed:h.played?h.gf/h.played:1.35,ha=h.homePlayed?h.homeGA/h.homePlayed:h.played?h.ga/h.played:1.15,af=a.awayPlayed?a.awayGF/a.awayPlayed:a.played?a.gf/a.played:1.05,aa=a.awayPlayed?a.awayGA/a.awayPlayed:a.played?a.ga/a.played:1.35;let lh=(hf+aa)/2,la=(af+ha)/2;if(variant==='DEFENSIVE'){lh=.88*lh+.12*1.25;la=.88*la+.12*1.05}else if(variant==='RECENCY'){lh=1.04*lh;la=.98*la}return[clamp(lh,.2,4.5),clamp(la,.2,4.5)]}
function predict(h,a,variant){const shrink=variant==='CONSERVATIVE'?.72:variant==='DEFENSIVE'?.82:variant==='RECENCY'?.90:.86,diff=((h.rating-a.rating)/400)*Math.log(10),homeAdv=variant==='DEFENSIVE'?.18:.25;let probs=softmax([diff+homeAdv,-Math.abs(diff)*.35,-diff]);probs=probs.map(x=>shrink*x+(1-shrink)/3);const s=probs.reduce((x,y)=>x+y,0);probs=probs.map(x=>x/s);const[lh,la]=expectedGoals(h,a,variant),grid=scoreGrid(lh,la),sum=test=>grid.reduce((acc,x)=>acc+(test(x)?x.p:0),0),scores=grid.slice().sort((x,y)=>y.p-x.p);return{probs,exactScores:scores.slice(0,5),marketProbs:{bttsYes:sum(x=>x.h>0&&x.a>0),over15:sum(x=>x.h+x.a>1.5),over25:sum(x=>x.h+x.a>2.5),over35:sum(x=>x.h+x.a>3.5),over45:sum(x=>x.h+x.a>4.5),homeOver05:sum(x=>x.h>.5),homeOver15:sum(x=>x.h>1.5),homeOver25:sum(x=>x.h>2.5),awayOver05:sum(x=>x.a>.5),awayOver15:sum(x=>x.a>1.5),awayOver25:sum(x=>x.a>2.5)}}}
function update(h,a,f,variant){const y=f.winner==='HOME'?1:f.winner==='DRAW'?.5:0,exp=1/(1+10**(-((h.rating+55)-a.rating)/400)),k=variant==='RECENCY'?28:variant==='CONSERVATIVE'?18:22,d=k*(y-exp);h.rating+=d;a.rating-=d;h.played++;a.played++;h.gf+=f.homeGoals;h.ga+=f.awayGoals;a.gf+=f.awayGoals;a.ga+=f.homeGoals;h.homePlayed++;h.homeGF+=f.homeGoals;h.homeGA+=f.awayGoals;a.awayPlayed++;a.awayGF+=f.awayGoals;a.awayGA+=f.homeGoals}
function acc(){return{sample:0,correct:0,brier:0,ll:0,t1:0,t3:0,t5:0}}
function add(a,f,p){const y=outcomeIndex(f.winner);a.sample++;a.correct+=p.probs.indexOf(Math.max(...p.probs))===y?1:0;a.brier+=p.probs.reduce((s,x,i)=>s+(x-(i===y?1:0))**2,0)/3;a.ll+=-Math.log(Math.max(EPS,p.probs[y]));const actual=`${f.homeGoals}-${f.awayGoals}`,scores=p.exactScores.map(x=>x.score);if(scores[0]===actual)a.t1++;if(scores.slice(0,3).includes(actual))a.t3++;if(scores.includes(actual))a.t5++}
function done(a){return a.sample?{sample:a.sample,accuracy:Number((a.correct/a.sample*100).toFixed(1)),brier:Number((a.brier/a.sample).toFixed(4)),logLoss:Number((a.ll/a.sample).toFixed(4)),exactTop1:Number((a.t1/a.sample*100).toFixed(1)),exactTop3:Number((a.t3/a.sample*100).toFixed(1)),exactTop5:Number((a.t5/a.sample*100).toFixed(1))}:{sample:0,accuracy:null,brier:null,logLoss:null,exactTop1:null,exactTop3:null,exactTop5:null}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const index=await readShardIndex(),blobs=await listMonthShards(),fixtureCount=Number(index.fixtureCount)||0;
  if(fixtureCount<80||!blobs.length)return res.status(200).json({version:'HISTORICAL-WALK-FORWARD-4',status:'INSUFFICIENT_SHARDED_HISTORY',fixtureCount,shardCount:blobs.length,minimum:80,source:'MONTHLY_SHARDS'});

  const variants=['BASELINE','CONSERVATIVE','DEFENSIVE','RECENCY'],states=Object.fromEntries(variants.map(v=>[v,new Map()])),raw=Object.fromEntries(variants.map(v=>[v,{train:acc(),holdout:acc()}]));
  const cut=Math.floor(fixtureCount*.75);let ordinal=0,processed=0,cutDate=null;
  for(const blob of blobs){
    const shard=await readJson(blob.pathname,{fixtures:{}});
    const fixtures=Object.values(shard.fixtures||{}).filter(f=>Number.isFinite(Number(f.timestamp))).sort((a,b)=>a.timestamp-b.timestamp);
    for(const f of fixtures){
      const bucket=ordinal<cut?'train':'holdout';if(ordinal===cut)cutDate=f.date||null;
      for(const v of variants){const teams=states[v],h=teams.get(f.homeId)||teamState(),a=teams.get(f.awayId)||teamState();if(f.homeId&&f.awayId&&h.played>=5&&a.played>=5)add(raw[v][bucket],f,predict(h,a,v));if(f.homeId&&f.awayId){update(h,a,f,v);teams.set(f.homeId,h);teams.set(f.awayId,a)}}
      ordinal++;processed++;
    }
  }
  const results={};for(const v of variants)results[v]={train:done(raw[v].train),holdout:done(raw[v].holdout)};
  const base=results.BASELINE.holdout,ranking=variants.map(v=>{const m=results[v].holdout,improvement=base.logLoss&&m.logLoss?((base.logLoss-m.logLoss)/base.logLoss)*100:0;return{variant:v,holdout:m,logLossImprovementPct:Number(improvement.toFixed(2))}}).filter(x=>x.holdout.logLoss!=null).sort((a,b)=>a.holdout.logLoss-b.holdout.logLoss);
  const report={version:'HISTORICAL-WALK-FORWARD-4',generatedAt:new Date().toISOString(),status:'OK',storageMode:'MONTHLY_SHARDS_STREAM',fixtureCount:processed,shardCount:blobs.length,archiveWindow:{start:index.windowStart||null,end:index.windowEnd||null,completedDates:index.completedDates||0},split:{trainPct:75,holdoutPct:25,cutDate,chronological:true,randomSplit:false},results,ranking,policy:{pastOnly:true,noHindsight:true,minimumPriorMatchesPerTeam:5,historicalROI:null,historicalROIReason:'No historical ROI is fabricated without genuine frozen pre-match odds.',researchOnly:true,noMonolithicRead:true,boundedShardReads:true,legacyArchivePreserved:true}};
  await writeJson(OUT,report);return res.status(200).json(report)
}
