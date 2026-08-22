import { listJson, readManyJson, readJson, storageReady } from './_report-store.js';
const PATH='argus/learning/ledger-diagnostics.json';
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function dayDiff(a,b){const x=new Date(a).getTime(),y=new Date(b).getTime();return Number.isFinite(x)&&Number.isFinite(y)?Math.abs(x-y)/86400000:null}
function level(s){return s>=85?'HEALTHY':s>=65?'LEARNING':s>=40?'WEAK':'INSUFFICIENT'}
function immutable(r){return r?.integrity?.frozenBeforeKickoff===true&&r?.integrity?.evidenceFrozenAtDecisionTime===true}
function modelPresent(r){return Boolean(r?.model||r?.context?.adjustedModel||r?.context?.model)}
function dateOnly(v){const t=new Date(v||0).getTime();return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const [diagnostics,reportBlobs,ledgerBlobs,learningBlobs]=await Promise.all([readJson(PATH,null),listJson('argus/reports/',400),listJson('argus/ledger/',400),listJson('argus/learning/',80)]);
  const [reports,ledgers,learning]=await Promise.all([readManyJson(reportBlobs),readManyJson(ledgerBlobs),readManyJson(learningBlobs)]),forensics=learning.find(x=>x?.version==='POSTMATCH-FORENSICS-1')||{};
  let predicted=0,settled=0,actionableSettled=0,withModel=0,withOdds=0,withConfidence=0,withEdge=0,reportPredicted=0,reportSettled=0;
  const competitions=new Set(),published=[];
  for(const report of reports)for(const m of report.matches||[]){if(m.prediction)reportPredicted++;if(['WIN','LOSS'].includes(m.outcome))reportSettled++}
  for(const book of ledgers)for(const r of book.records||[]){if(!immutable(r))continue;predicted++;if(r.competition)competitions.add(r.competition);if(r.publishedAt)published.push(r.publishedAt);if(modelPresent(r))withModel++;if(n(r.odds)!=null)withOdds++;if(n(r.confidence)!=null)withConfidence++;if(n(r.edge)!=null)withEdge++;if(['WIN','LOSS'].includes(r.settlement?.status)){settled++;if(Number(r.recommendedStakePct)>0)actionableSettled++}}
  published.sort((a,b)=>new Date(a)-new Date(b));const first=published[0]||null,last=published[published.length-1]||null;
  const coverage={model:predicted?withModel/predicted:0,odds:predicted?withOdds/predicted:0,confidence:predicted?withConfidence/predicted:0,edge:predicted?withEdge/predicted:0},span=first&&last?dayDiff(first,last):0,fresh=last?dayDiff(last,new Date().toISOString()):999,predictedWeight=Math.min(1,predicted/20),settledWeight=Math.min(1,settled/20);
  let score=Math.min(30,settled/100*30)+Math.min(15,competitions.size/10*15)*settledWeight+(15*coverage.model+10*coverage.odds+10*coverage.confidence+10*coverage.edge)*predictedWeight+Math.min(5,(span||0)/60*5)*settledWeight+(fresh<=2?5*predictedWeight:fresh<=7?3*predictedWeight:0);score=Math.round(score);
  const blockers=[];if(settled<20)blockers.push('SETTLED_SAMPLE_LT_20');if(coverage.model<.8)blockers.push('MODEL_COVERAGE_LT_80');if(coverage.odds<.7)blockers.push('ODDS_COVERAGE_LT_70');if(coverage.confidence<.7)blockers.push('CONFIDENCE_COVERAGE_LT_70');if(fresh>7)blockers.push('LEARNING_DATA_STALE');
  const diagAge=diagnostics?Date.now()-new Date(diagnostics.generatedAt||0).getTime():NaN;
  return res.status(200).json({version:'LEARNING-HEALTH-3',generatedAt:new Date().toISOString(),score,status:level(score),available:predicted>0,sample:{ledgerBooks:ledgers.length,immutablePredicted:predicted,predicted,settled,actionableSettled,competitions:competitions.size,firstDate:dateOnly(first),lastDate:dateOnly(last),historyDays:span==null?null:Number(span.toFixed(1)),freshnessDays:Number(fresh.toFixed(1)),archiveReports:reports.length,reportPredicted,reportSettled},coverage:Object.fromEntries(Object.entries(coverage).map(([k,v])=>[k,Number((v*100).toFixed(1))])),forensics:{settled:forensics.settled||0,generatedAt:forensics.generatedAt||null},ledgerDiagnostics:{available:Boolean(diagnostics),status:diagnostics?.global?.status||null,totalSettled:diagnostics?.totalSettled||0,stale:!Number.isFinite(diagAge)||diagAge>86400000},blockers,policy:{readOnly:true,writes:false,recompute:false,sourceOfTruth:'IMMUTABLE_PREDICTION_LEDGER',dailyReportsDiagnosticOnly:true,coverageContributionsSampleWeighted:true,adaptivePromotionAllowed:score>=85&&settled>=100&&blockers.length===0,rule:'Learning health measures immutable evidence readiness only. It cannot promote bets, loosen governance, or modify probabilities.'}})
}
