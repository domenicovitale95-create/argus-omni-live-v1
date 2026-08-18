import { listJson, readManyJson, storageReady } from './_report-store.js';

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function classify(a){
  if(a.sample<20)return{status:'UNVALIDATED',penalty:0,weight:1,reason:'Minimum sample not reached'};
  const roi=a.settled?100*a.pl/a.settled:null, hit=a.settled?100*a.wins/a.settled:null, avgClv=a.clvN?a.clvSum/a.clvN:null;
  let score=50;
  if(roi!=null)score+=Math.max(-20,Math.min(20,roi*.7));
  if(avgClv!=null)score+=Math.max(-15,Math.min(15,avgClv*1.4));
  if(a.brierN)score+=Math.max(-10,Math.min(10,(0.23-a.brierSum/a.brierN)*80));
  if(a.sample>=50)score+=4;if(a.sample>=100)score+=4;
  score=Math.max(0,Math.min(100,Math.round(score)));
  if(score<35)return{status:'DEGRADED',penalty:12,weight:.72,reason:'Observed out-of-sample performance is weak',score,roi,hitRate:hit,avgCLV:avgClv};
  if(score<48)return{status:'CAUTION',penalty:6,weight:.86,reason:'Reliability below neutral',score,roi,hitRate:hit,avgCLV:avgClv};
  if(score>=68&&a.sample>=50)return{status:'VALIDATING_POSITIVE',penalty:0,weight:1.04,reason:'Positive evidence, still governed',score,roi,hitRate:hit,avgCLV:avgClv};
  return{status:'NEUTRAL',penalty:0,weight:1,reason:'No reliability adjustment',score,roi,hitRate:hit,avgCLV:avgClv};
}
function add(map,key,row){if(!map[key])map[key]={sample:0,settled:0,wins:0,losses:0,pl:0,brierSum:0,brierN:0,clvSum:0,clvN:0};const a=map[key];a.sample++;if(row.outcome==='WIN'){a.wins++;a.settled++}else if(row.outcome==='LOSS'){a.losses++;a.settled++}if(n(row.pl)!=null)a.pl+=Number(row.pl);const p=row.prediction?.model,y=row.finalScore;if(p&&y&&n(p.home)!=null&&n(p.draw)!=null&&n(p.away)!=null){const sum=Number(p.home)+Number(p.draw)+Number(p.away);if(sum>0){const actual=Number(y.home)>Number(y.away)?'home':Number(y.home)<Number(y.away)?'away':'draw';const ph=Number(p.home)/sum,pd=Number(p.draw)/sum,pa=Number(p.away)/sum;a.brierSum+=((ph-(actual==='home'))**2+(pd-(actual==='draw'))**2+(pa-(actual==='away'))**2)/3;a.brierN++}}if(n(row._clv)!=null){a.clvSum+=Number(row._clv);a.clvN++}}
function result(map){return Object.fromEntries(Object.entries(map).map(([key,a])=>[key,{sample:a.sample,settled:a.settled,wins:a.wins,losses:a.losses,...classify(a)}]))}
function selKey(s){const x=String(s||'').toUpperCase();return x==='HOME'?'home':x==='DRAW'?'draw':x==='AWAY'?'away':null}
function closing(memory,kickoff){const ko=kickoff?new Date(kickoff).getTime():Infinity;return (memory?.snapshots||[]).filter(s=>s.phase==='PREMATCH'&&new Date(s.recordedAt).getTime()<=ko).sort((a,b)=>new Date(a.recordedAt)-new Date(b.recordedAt)).pop()||null}

export default async function handler(req,res){res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Reliability storage unavailable'});const [rb,mb]=await Promise.all([listJson('argus/reports/',400),listJson('argus/market-memory/',400)]),[reports,memories]=await Promise.all([readManyJson(rb),readManyJson(mb)]),memoryByDate=new Map(memories.map(m=>[String(m.date),m])),league={},phase={},classification={};let total=0;for(const report of reports){const mem=memoryByDate.get(String(report.date));for(const raw of report.matches||[]){if(!['WIN','LOSS'].includes(raw.outcome)||!raw.prediction)continue;const row={...raw};const key=selKey(row.prediction.selection),close=closing(mem?.fixtures?.[String(row.fixtureId)],row.kickoff),bet=n(row.prediction.odds),co=key?n(close?.odds?.[key]):null;if(bet&&co&&bet>1&&co>1)row._clv=Number(((bet/co-1)*100).toFixed(2));add(league,row.competition||'UNKNOWN',row);add(phase,row.prediction.phase||'UNKNOWN',row);add(classification,row.prediction.classification||'UNKNOWN',row);total++}}return res.status(200).json({version:'RELIABILITY-1',generatedAt:new Date().toISOString(),minimumSample:20,positiveValidationSample:50,totalSettled:total,league:result(league),phase:result(phase),classification:result(classification),policy:'Reliability may only penalize or mildly reweight. It never unlocks PRIME by itself.'})}