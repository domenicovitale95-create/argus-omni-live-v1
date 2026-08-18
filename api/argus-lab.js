import { listJson, readManyJson, storageReady } from './_report-store.js';

function safe(v){const n=Number(v);return Number.isFinite(n)?n:null}
function selectionKey(s){const x=String(s||'').toUpperCase();return x==='HOME'?'home':x==='DRAW'?'draw':x==='AWAY'?'away':null}
function actualVector(row){const h=safe(row?.finalScore?.home),a=safe(row?.finalScore?.away);if(h==null||a==null)return null;return h>a?{home:1,draw:0,away:0}:h<a?{home:0,draw:0,away:1}:{home:0,draw:1,away:0}}
function probabilityVector(p){const m=p?.model;if(!m)return null;const h=safe(m.home),d=safe(m.draw),a=safe(m.away);if(h==null||d==null||a==null)return null;const sum=h+d+a;if(sum<=0)return null;return{home:h/sum,draw:d/sum,away:a/sum}}
function brier(p,y){return ((p.home-y.home)**2+(p.draw-y.draw)**2+(p.away-y.away)**2)/3}
function logLoss(p,y){const eps=1e-9;return -(y.home*Math.log(Math.max(eps,p.home))+y.draw*Math.log(Math.max(eps,p.draw))+y.away*Math.log(Math.max(eps,p.away)))}
function bucket(c){const n=safe(c);if(n==null)return'UNKNOWN';if(n<50)return'<50';if(n<60)return'50-59';if(n<70)return'60-69';if(n<80)return'70-79';return'80+'}
function pushAgg(map,key,row){if(!map[key])map[key]={sample:0,wins:0,losses:0,pl:0,brierSum:0,brierN:0,logLossSum:0,logLossN:0};const a=map[key];a.sample++;if(row.outcome==='WIN')a.wins++;if(row.outcome==='LOSS')a.losses++;if(Number.isFinite(Number(row.pl)))a.pl+=Number(row.pl);if(row._brier!=null){a.brierSum+=row._brier;a.brierN++}if(row._logLoss!=null){a.logLossSum+=row._logLoss;a.logLossN++}}
function finish(map){return Object.entries(map).map(([key,a])=>({key,sample:a.sample,wins:a.wins,losses:a.losses,hitRate:(a.wins+a.losses)?Number((a.wins/(a.wins+a.losses)*100).toFixed(1)):null,pl:Number(a.pl.toFixed(2)),roi:(a.wins+a.losses)?Number((a.pl/(a.wins+a.losses)*100).toFixed(1)):null,brier:a.brierN?Number((a.brierSum/a.brierN).toFixed(4)):null,logLoss:a.logLossN?Number((a.logLossSum/a.logLossN).toFixed(4)):null})).sort((a,b)=>b.sample-a.sample)}

export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!storageReady())return res.status(503).json({error:'ARGUS LAB storage unavailable'});
 const blobs=await listJson('argus/reports/',400);const reports=await readManyJson(blobs);const rows=[];
 for(const report of reports)for(const r of report.matches||[]){if(!['WIN','LOSS'].includes(r.outcome)||!r.prediction)continue;const p=probabilityVector(r.prediction),y=actualVector(r);const row={...r,date:report.date,_brier:p&&y?brier(p,y):null,_logLoss:p&&y?logLoss(p,y):null};rows.push(row)}
 const byLeague={},byConfidence={},byClass={},byPhase={};let pl=0,wins=0,losses=0,brierSum=0,brierN=0,ll=0,llN=0;
 for(const r of rows){if(r.outcome==='WIN')wins++;else losses++;if(Number.isFinite(Number(r.pl)))pl+=Number(r.pl);if(r._brier!=null){brierSum+=r._brier;brierN++}if(r._logLoss!=null){ll+=r._logLoss;llN++}pushAgg(byLeague,r.competition||'UNKNOWN',r);pushAgg(byConfidence,bucket(r.prediction?.confidence),r);pushAgg(byClass,r.prediction?.classification||'UNKNOWN',r);pushAgg(byPhase,r.prediction?.phase||'UNKNOWN',r)}
 const settled=wins+losses;
 return res.status(200).json({generatedAt:new Date().toISOString(),reports:reports.length,summary:{settled,wins,losses,hitRate:settled?Number((wins/settled*100).toFixed(1)):null,flatStakePL:Number(pl.toFixed(2)),roi:settled?Number((pl/settled*100).toFixed(1)):null,brier:brierN?Number((brierSum/brierN).toFixed(4)):null,logLoss:llN?Number((ll/llN).toFixed(4)):null},byLeague:finish(byLeague),byConfidence:finish(byConfidence),byClassification:finish(byClass),byPhase:finish(byPhase),note:'Audit metrics use frozen archived predictions only. CLV requires market-memory closing snapshots and is intentionally not fabricated.'});
}
