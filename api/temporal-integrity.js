export const config={maxDuration:120};
import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const OUT='argus/integrity/temporal-integrity.json';
const arr=v=>Array.isArray(v)?v:[];
const ts=v=>{const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null};
function push(issues,severity,code,fixtureId,date,details={}){issues.push({severity,code,fixtureId:String(fixtureId||'UNKNOWN'),date:date||null,...details})}
export function auditPredictionDoc(doc,issues){
  for(const [id,f] of Object.entries(doc?.fixtures||{})){
    const ko=ts(f?.kickoff);if(!ko)continue;
    for(const s of arr(f?.snapshots)){
      const t=ts(s?.recordedAt);if(!t)continue;
      const phase=String(s?.phase||'PREMATCH').toUpperCase();
      if(phase==='PREMATCH'&&t>=ko)push(issues,'ERROR','PREMATCH_SNAPSHOT_AT_OR_AFTER_KICKOFF',id,doc?.date,{recordedAt:s.recordedAt,kickoff:f.kickoff});
      if(s?.frozen===true&&t>=ko)push(issues,'ERROR','FROZEN_PREDICTION_AFTER_KICKOFF',id,doc?.date,{recordedAt:s.recordedAt,kickoff:f.kickoff});
    }
  }
}
export function auditMarketDoc(doc,issues){
  for(const [id,f] of Object.entries(doc?.fixtures||{})){
    const ko=ts(f?.kickoff);if(!ko)continue;
    for(const s of arr(f?.snapshots)){
      const t=ts(s?.recordedAt);if(!t)continue;
      const phase=String(s?.phase||'PREMATCH').toUpperCase();
      if(phase==='PREMATCH'&&t>ko+60000)push(issues,'WARN','PREMATCH_MARKET_SNAPSHOT_AFTER_KICKOFF',id,doc?.date,{recordedAt:s.recordedAt,kickoff:f.kickoff});
    }
  }
}
export function auditReports(reports,issues){
  for(const rdoc of reports){for(const r of arr(rdoc?.matches)){
    const ko=ts(r?.kickoff),settled=ts(r?.settledAt||r?.verifiedAt||rdoc?.generatedAt);if(ko&&settled&&settled<ko)push(issues,'ERROR','SETTLEMENT_BEFORE_KICKOFF',r?.fixtureId,rdoc?.date,{settledAt:r?.settledAt||r?.verifiedAt||rdoc?.generatedAt,kickoff:r?.kickoff});
    const p=r?.prediction||{};const pt=ts(p?.recordedAt||p?.publishedAt||p?.frozenAt);if(ko&&pt&&String(p?.phase||'PREMATCH').toUpperCase()==='PREMATCH'&&pt>=ko)push(issues,'ERROR','REPORT_REFERENCES_LATE_PREMATCH_PREDICTION',r?.fixtureId,rdoc?.date,{predictionAt:p?.recordedAt||p?.publishedAt||p?.frozenAt,kickoff:r?.kickoff});
  }}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Temporal integrity storage unavailable'});
  const [pb,mb,rb]=await Promise.all([listJson('argus/predictions/',180),listJson('argus/market-memory/',180),listJson('argus/reports/',180)]),[preds,markets,reports]=await Promise.all([readManyJson(pb),readManyJson(mb),readManyJson(rb)]),issues=[];
  for(const d of preds)auditPredictionDoc(d,issues);for(const d of markets)auditMarketDoc(d,issues);auditReports(reports,issues);
  const errors=issues.filter(x=>x.severity==='ERROR').length,warnings=issues.filter(x=>x.severity==='WARN').length,status=errors?'FAIL':warnings?'WATCH':'PASS';
  const state={version:'TEMPORAL-INTEGRITY-1',generatedAt:new Date().toISOString(),status,scanned:{predictionDocs:preds.length,marketDocs:markets.length,reportDocs:reports.length},counts:{errors,warnings,total:issues.length},issues:issues.slice(0,200),policy:{futureLeakageForbidden:true,prematchMustPrecedeKickoff:true,settlementMustFollowKickoff:true,historicalPredictionsImmutable:true,failClosedOnTemporalViolation:true,readOnlyAudit:true}};
  await writeJson(OUT,state);return res.status(200).json(state)
}
