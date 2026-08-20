export const config={maxDuration:120};
import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const OUT='argus/integrity/data-integrity.json';
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const arr=v=>Array.isArray(v)?v:[];
const hasText=v=>typeof v==='string'&&v.trim().length>0;
const timeMs=v=>{const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null};
const FRESHNESS_BUCKETS=[
  {key:'le60s',max:60},
  {key:'le5m',max:300},
  {key:'le15m',max:900},
  {key:'le1h',max:3600},
  {key:'gt1h',max:Infinity}
];
function provenanceOf(s){
  const source=s?.source??s?.provider??s?.providerName??s?.bookmaker??s?.provenance?.source??null;
  const capturedAt=s?.sourceRecordedAt??s?.sourceTimestamp??s?.observedAt??s?.provenance?.capturedAt??null;
  return{hasSource:hasText(source),hasSourceTimestamp:timeMs(capturedAt)!=null,capturedAt};
}
function observeProvenance(s,coverage){
  if(!coverage)return;
  coverage.snapshots=(coverage.snapshots||0)+1;
  const p=provenanceOf(s);
  if(p.hasSource)coverage.withSource=(coverage.withSource||0)+1;
  if(p.hasSourceTimestamp)coverage.withSourceTimestamp=(coverage.withSourceTimestamp||0)+1;
  const recordedAt=timeMs(s?.recordedAt),sourceAt=timeMs(p.capturedAt);
  if(recordedAt!=null&&sourceAt!=null){
    coverage.timestampPairs=(coverage.timestampPairs||0)+1;
    const lagSeconds=(recordedAt-sourceAt)/1000;
    if(lagSeconds<0)coverage.futureSourceTimestampCount=(coverage.futureSourceTimestampCount||0)+1;
    const ageSeconds=Math.max(0,lagSeconds);
    coverage.sourceAgeSecondsSum=(coverage.sourceAgeSecondsSum||0)+ageSeconds;
    coverage.maxSourceAgeSeconds=Math.max(Number(coverage.maxSourceAgeSeconds||0),ageSeconds);
    coverage.freshnessBuckets=coverage.freshnessBuckets||{};
    const bucket=FRESHNESS_BUCKETS.find(x=>ageSeconds<=x.max);
    if(bucket)coverage.freshnessBuckets[bucket.key]=Number(coverage.freshnessBuckets[bucket.key]||0)+1;
  }
}
export function auditPredictionDoc(doc,issues=[],coverage=null){
  const seen=new Set();
  for(const [id,f] of Object.entries(doc?.fixtures||{})){
    const key=String(f?.fixtureId??id);
    if(seen.has(key))issues.push({severity:'ERROR',code:'DUPLICATE_FIXTURE',fixtureId:key,date:doc?.date||null});
    seen.add(key);
    if(!f?.home||!f?.away)issues.push({severity:'ERROR',code:'MISSING_TEAMS',fixtureId:key,date:doc?.date||null});
    const ko=new Date(f?.kickoff||0).getTime();
    if(!Number.isFinite(ko)||ko<=0)issues.push({severity:'ERROR',code:'INVALID_KICKOFF',fixtureId:key,date:doc?.date||null});
    for(const s of arr(f?.snapshots)){
      observeProvenance(s,coverage);
      const t=new Date(s?.recordedAt||0).getTime();
      if(!Number.isFinite(t)||t<=0)issues.push({severity:'ERROR',code:'INVALID_SNAPSHOT_TIME',fixtureId:key,date:doc?.date||null});
      const odds=n(s?.odds??s?.price);
      if(odds!=null&&(odds<=1||odds>1000))issues.push({severity:'WARN',code:'SUSPICIOUS_ODDS',fixtureId:key,value:odds,date:doc?.date||null});
      const conf=n(s?.confidence??s?.probability);
      if(conf!=null&&(conf<0||conf>100))issues.push({severity:'ERROR',code:'INVALID_CONFIDENCE',fixtureId:key,value:conf,date:doc?.date||null});
    }
  }
  return issues;
}
export function auditMarketDoc(doc,issues=[],coverage=null){
  for(const [id,f] of Object.entries(doc?.fixtures||{})){
    let last=-Infinity;
    for(const s of arr(f?.snapshots)){
      observeProvenance(s,coverage);
      const t=new Date(s?.recordedAt||0).getTime();
      if(Number.isFinite(t)&&t<last)issues.push({severity:'WARN',code:'NON_MONOTONIC_MARKET_TIME',fixtureId:id,date:doc?.date||null});
      if(Number.isFinite(t))last=t;
      for(const [side,v] of Object.entries(s?.odds||{})){const x=n(v);if(x!=null&&(x<=1||x>1000))issues.push({severity:'WARN',code:'SUSPICIOUS_MARKET_ODDS',fixtureId:id,side,value:x,date:doc?.date||null})}
    }
  }
  return issues;
}
export function provenanceCoverage(coverage={}){
  const total=Number(coverage.snapshots||0),pairs=Number(coverage.timestampPairs||0);
  const pct=v=>total?Math.round((Number(v||0)/total)*10000)/100:100;
  const pairPct=v=>pairs?Math.round((Number(v||0)/pairs)*10000)/100:null;
  const round=v=>Math.round(Number(v)*100)/100;
  const bucketCounts={};
  const bucketPct={};
  for(const bucket of FRESHNESS_BUCKETS){
    const count=Number(coverage.freshnessBuckets?.[bucket.key]||0);
    bucketCounts[bucket.key]=count;
    bucketPct[bucket.key]=pairPct(count);
  }
  return{
    snapshots:total,
    withSource:Number(coverage.withSource||0),
    withSourceTimestamp:Number(coverage.withSourceTimestamp||0),
    sourceCoveragePct:pct(coverage.withSource),
    sourceTimestampCoveragePct:pct(coverage.withSourceTimestamp),
    timestampPairs:pairs,
    futureSourceTimestampCount:Number(coverage.futureSourceTimestampCount||0),
    averageSourceAgeSeconds:pairs?round(Number(coverage.sourceAgeSecondsSum||0)/pairs):null,
    maxSourceAgeSeconds:pairs?round(Number(coverage.maxSourceAgeSeconds||0)):null,
    freshnessDistribution:{counts:bucketCounts,pct:bucketPct}
  };
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Data integrity storage unavailable'});
  const [pb,mb]=await Promise.all([listJson('argus/predictions/',120),listJson('argus/market-memory/',120)]),[preds,markets]=await Promise.all([readManyJson(pb),readManyJson(mb)]),issues=[],coverage={snapshots:0,withSource:0,withSourceTimestamp:0,timestampPairs:0,futureSourceTimestampCount:0,sourceAgeSecondsSum:0,maxSourceAgeSeconds:0,freshnessBuckets:{}};
  for(const d of preds)auditPredictionDoc(d,issues,coverage);for(const d of markets)auditMarketDoc(d,issues,coverage);
  const errors=issues.filter(x=>x.severity==='ERROR').length,warnings=issues.filter(x=>x.severity==='WARN').length;
  const status=errors?'FAIL':warnings?'WATCH':'PASS';
  const state={version:'DATA-INTEGRITY-4',generatedAt:new Date().toISOString(),status,scanned:{predictionDocs:preds.length,marketDocs:markets.length},counts:{errors,warnings,total:issues.length},provenance:provenanceCoverage(coverage),issues:issues.slice(0,200),policy:{failClosedOnCriticalDataCorruption:true,neverRepairsHistoricalPredictions:true,neverInventsMissingData:true,readOnlyAudit:true,provenanceCoverageIsObservational:true,sourceFreshnessIsObservational:true,missingProvenanceDoesNotYetBlock:true,freshnessDistributionIsObservational:true}};
  await writeJson(OUT,state);return res.status(200).json(state)
}
