import { listJson, readManyJson, storageReady } from './_report-store.js';

const cap=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const pct=(v,d)=>d?Math.round(v/d*100):0;
function profileStats(books){let total=0,validated=0,caution=0,learning=0;for(const b of books)for(const f of Object.values(b.fixtures||{}))for(const p of f.picks||[]){if(!['WIN','LOSS'].includes(p.outcome))continue;total++}return{total,validated,caution,learning}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(200).json({score:15,status:'INFRASTRUCTURE BLOCKED',components:{storage:0},note:'Vercel Blob storage is not linked; learning cannot persist.'});
  const [reportBlobs,shadowBlobs]=await Promise.all([listJson('argus/reports/',180),listJson('argus/shadow/',180)]),[reports,shadows]=await Promise.all([readManyJson(reportBlobs),readManyJson(shadowBlobs)]);
  let recordedSettled=0,recordedActionable=0,shadowSettled=0,shadowPriced=0,shadowPicks=0,marketKeys=new Set(),leagueKeys=new Set();
  for(const report of reports)for(const row of report.matches||[]){if(['WIN','LOSS'].includes(row.outcome)){recordedSettled++;if(row.prediction&&String(row.prediction.classification||'').toUpperCase()!=='NO BET')recordedActionable++;if(row.competition)leagueKeys.add(row.competition)}}
  for(const book of shadows)for(const f of Object.values(book.fixtures||{})){if(f.competition)leagueKeys.add(f.competition);for(const p of f.picks||[]){shadowPicks++;marketKeys.add(p.key);if(p.odds)shadowPriced++;if(['WIN','LOSS'].includes(p.outcome))shadowSettled++}}
  const totalSettled=recordedSettled+shadowSettled;
  const components={
    dataPersistence:100,
    trackRecord:cap(recordedSettled),
    shadowLearning:cap(Math.round(shadowSettled/1.2)),
    marketCoverage:cap(Math.round((marketKeys.size/12)*100)),
    realPriceCoverage:cap(pct(shadowPriced,shadowPicks)),
    calibrationMaturity:cap(totalSettled),
    leagueDiversity:cap(Math.round((leagueKeys.size/12)*100)),
    automation:90
  };
  const weights={dataPersistence:.10,trackRecord:.18,shadowLearning:.18,marketCoverage:.12,realPriceCoverage:.10,calibrationMaturity:.15,leagueDiversity:.07,automation:.10};
  const score=Math.round(Object.entries(weights).reduce((s,[k,w])=>s+components[k]*w,0));
  const status=score>=85?'AUTOPILOT READY FOR SUPERVISED USE':score>=70?'ADVANCED TRAINING':score>=50?'TRAINING IN PROGRESS':'EARLY TRAINING';
  const blockers=[];if(recordedSettled<50)blockers.push(`Need ${50-recordedSettled} more settled recorded predictions for a stronger real track record`);if(shadowSettled<100)blockers.push(`Need ${100-shadowSettled} more settled shadow predictions for broader validation`);if(components.realPriceCoverage<60)blockers.push('Real-price coverage across shadow markets is still limited');if(marketKeys.size<8)blockers.push('More market families need settled evidence');
  return res.status(200).json({version:'AUTOPILOT-READINESS-1',generatedAt:new Date().toISOString(),score,status,components,evidence:{reports:reports.length,recordedSettled,recordedActionable,shadowBooks:shadows.length,shadowPicks,shadowSettled,shadowPriced,marketFamilies:marketKeys.size,leagues:leagueKeys.size},blockers,methodology:'Readiness is a governance heuristic derived from persisted evidence. It is not a profitability guarantee and does not authorize automatic wagering.'});
}
