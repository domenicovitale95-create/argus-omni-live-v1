export const config={maxDuration:120};
import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const OUT='argus/integrity/data-integrity.json';
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const arr=v=>Array.isArray(v)?v:[];
function checkPredictionDoc(doc,issues){
  const seen=new Set();
  for(const [id,f] of Object.entries(doc?.fixtures||{})){
    const key=String(f?.fixtureId??id);
    if(seen.has(key))issues.push({severity:'ERROR',code:'DUPLICATE_FIXTURE',fixtureId:key,date:doc?.date||null});
    seen.add(key);
    if(!f?.home||!f?.away)issues.push({severity:'ERROR',code:'MISSING_TEAMS',fixtureId:key,date:doc?.date||null});
    const ko=new Date(f?.kickoff||0).getTime();
    if(!Number.isFinite(ko)||ko<=0)issues.push({severity:'ERROR',code:'INVALID_KICKOFF',fixtureId:key,date:doc?.date||null});
    for(const s of arr(f?.snapshots)){
      const t=new Date(s?.recordedAt||0).getTime();
      if(!Number.isFinite(t)||t<=0)issues.push({severity:'ERROR',code:'INVALID_SNAPSHOT_TIME',fixtureId:key,date:doc?.date||null});
      const odds=n(s?.odds??s?.price);
      if(odds!=null&&(odds<=1||odds>1000))issues.push({severity:'WARN',code:'SUSPICIOUS_ODDS',fixtureId:key,value:odds,date:doc?.date||null});
      const conf=n(s?.confidence??s?.probability);
      if(conf!=null&&(conf<0||conf>100))issues.push({severity:'ERROR',code:'INVALID_CONFIDENCE',fixtureId:key,value:conf,date:doc?.date||null});
    }
  }
}
function checkMarketDoc(doc,issues){
  for(const [id,f] of Object.entries(doc?.fixtures||{})){
    let last=-Infinity;
    for(const s of arr(f?.snapshots)){
      const t=new Date(s?.recordedAt||0).getTime();
      if(Number.isFinite(t)&&t<last)issues.push({severity:'WARN',code:'NON_MONOTONIC_MARKET_TIME',fixtureId:id,date:doc?.date||null});
      if(Number.isFinite(t))last=t;
      for(const [side,v] of Object.entries(s?.odds||{})){const x=n(v);if(x!=null&&(x<=1||x>1000))issues.push({severity:'WARN',code:'SUSPICIOUS_MARKET_ODDS',fixtureId:id,side,value:x,date:doc?.date||null})}
    }
  }
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Data integrity storage unavailable'});
  const [pb,mb]=await Promise.all([listJson('argus/predictions/',120),listJson('argus/market-memory/',120)]),[preds,markets]=await Promise.all([readManyJson(pb),readManyJson(mb)]),issues=[];
  for(const d of preds)checkPredictionDoc(d,issues);for(const d of markets)checkMarketDoc(d,issues);
  const errors=issues.filter(x=>x.severity==='ERROR').length,warnings=issues.filter(x=>x.severity==='WARN').length;
  const status=errors?'FAIL':warnings?'WATCH':'PASS';
  const state={version:'DATA-INTEGRITY-1',generatedAt:new Date().toISOString(),status,scanned:{predictionDocs:preds.length,marketDocs:markets.length},counts:{errors,warnings,total:issues.length},issues:issues.slice(0,200),policy:{failClosedOnCriticalDataCorruption:true,neverRepairsHistoricalPredictions:true,neverInventsMissingData:true,readOnlyAudit:true}};
  await writeJson(OUT,state);return res.status(200).json(state)
}
