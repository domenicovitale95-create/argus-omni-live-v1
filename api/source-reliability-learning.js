import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const OUT='argus/learning/source-reliability.json';
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
function sourceKeys(p={}){
  const keys=new Set();
  const modelSource=String(p?.model?.source||p?.source||'').trim();
  if(modelSource)keys.add(`MODEL:${modelSource}`);
  if(p?.phase)keys.add(`PHASE:${String(p.phase).toUpperCase()}`);
  if(p?.marketRegime)keys.add(`MARKET_REGIME:${String(p.marketRegime).toUpperCase()}`);
  if(p?.marketMovement)keys.add(`MARKET_MOVE:${String(p.marketMovement).toUpperCase()}`);
  if(p?.timingAction)keys.add(`TIMING:${String(p.timingAction).toUpperCase()}`);
  if(p?.dataQualitySource)keys.add(`QUALITY:${String(p.dataQualitySource).toUpperCase()}`);
  return [...keys];
}
function add(map,key,row){if(!map[key])map[key]={sample:0,wins:0,losses:0,pl:0,probN:0,brier:0};const a=map[key];a.sample++;if(row.outcome==='WIN')a.wins++;if(row.outcome==='LOSS')a.losses++;if(n(row.pl)!=null)a.pl+=Number(row.pl);const p=n(row.prediction?.confidence);if(p!=null){const pr=Math.max(0,Math.min(1,p/100)),y=row.outcome==='WIN'?1:0;a.probN++;a.brier+=(pr-y)**2}}
function profile(a){const settled=a.wins+a.losses,hit=settled?a.wins/settled*100:null,roi=settled?a.pl/settled*100:null,brier=a.probN?a.brier/a.probN:null;let status='LEARNING',penalty=0,multiplier=1,reason='Need 30 settled observations';if(settled>=30){if((roi!=null&&roi<=-15)||(brier!=null&&brier>=.30)){status='DEGRADED';penalty=8;multiplier=.88;reason='Persistently weak settled performance for this source family'}else if((roi!=null&&roi<=-5)||(brier!=null&&brier>=.24)){status='CAUTION';penalty=4;multiplier=.94;reason='Source family underperforms enough to warrant caution'}else if(settled>=80&&roi!=null&&roi>=5&&brier!=null&&brier<=.20){status='VALIDATING_POSITIVE';multiplier=1.02;reason='Positive evidence observed; reinforcement remains capped and cannot create PRIME'}else{status='NEUTRAL';reason='No material reliability warning'}}return{sample:settled,wins:a.wins,losses:a.losses,hitRate:hit==null?null:Number(hit.toFixed(1)),roi:roi==null?null:Number(roi.toFixed(1)),brier:brier==null?null:Number(brier.toFixed(4)),status,confidencePenalty:penalty,multiplier,reason}}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});if(req.method==='GET'){const {readJson}=await import('./_report-store.js');return res.status(200).json(await readJson(OUT,{version:'SOURCE-RELIABILITY-1',generatedAt:null,profiles:{}}))}const blobs=await listJson('argus/reports/',400),reports=await readManyJson(blobs),map={};let settled=0;for(const report of reports)for(const row of report.matches||[]){if(!['WIN','LOSS'].includes(row.outcome)||!row.prediction)continue;settled++;for(const key of sourceKeys(row.prediction))add(map,key,row)}const profiles=Object.fromEntries(Object.entries(map).map(([k,a])=>[k,profile(a)])),state={version:'SOURCE-RELIABILITY-1',generatedAt:new Date().toISOString(),settled,profiles,policy:{minimumSample:30,positiveSample:80,maxPenalty:8,minMultiplier:.88,maxPositiveMultiplier:1.02,downgradeFirst:true,positiveEvidenceCannotCreatePrime:true,directProbabilityMutation:false,automaticBetPlacement:false}};await writeJson(OUT,state);return res.status(200).json(state)}
