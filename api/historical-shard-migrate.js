import { get } from '@vercel/blob';
import { readJson, writeJson, storageReady } from './_report-store.js';

const ACCESS='private';
const LEGACY='argus/research/historical-decade-fixtures.json';
const INDEX='argus/research/historical-shards-index.json';
const PREFIX='argus/research/historical-shards/';
const DEFAULT_MONTHS=36;
const MAX_MONTHS=48;

function authorized(req){const s=String(process.env.CRON_SECRET||'').trim();return !s||req.headers.authorization===`Bearer ${s}`}
function monthPath(month){return`${PREFIX}${month}.json`}
function monthOf(row){if(String(row?.date||'').length>=7)return String(row.date).slice(0,7);const t=Number(row?.timestamp);if(Number.isFinite(t)&&t>0)return new Date(t*1000).toISOString().slice(0,7);return null}

async function* lines(stream){
  const reader=stream.getReader(),decoder=new TextDecoder();let carry='',done=false;
  try{
    while(true){const part=await reader.read();if(part.done){done=true;break}carry+=decoder.decode(part.value,{stream:true});let i;while((i=carry.indexOf('\n'))>=0){yield carry.slice(0,i);carry=carry.slice(i+1)}}
    carry+=decoder.decode();if(carry)yield carry;
  }finally{if(!done){try{await reader.cancel()}catch(_){}}try{reader.releaseLock()}catch(_){}}
}

async function* legacyFixtures(stream){
  let inside=false,collecting=false,parts=[];
  for await(const line of lines(stream)){
    if(!inside){if(/^\s*"fixtures"\s*:\s*\{\s*,?\s*$/.test(line))inside=true;continue}
    if(!collecting){
      if(/^\s{2}\}\s*,?\s*$/.test(line))return;
      const m=line.match(/^\s{4}"[^"]+"\s*:\s*(\{.*)$/);if(!m)continue;
      collecting=true;parts=[m[1].replace(/,\s*$/,'')];
      continue;
    }
    if(/^\s{4}\}\s*,?\s*$/.test(line)){
      parts.push('}');
      try{const row=JSON.parse(parts.join('\n'));if(row&&typeof row==='object')yield row}catch(e){throw new Error(`Legacy fixture parse failed: ${e.message}`)}
      collecting=false;parts=[];
    }else parts.push(line);
  }
}

function freshIndex(){return{version:'HISTORICAL-SHARD-INDEX-1',source:LEGACY,sourceOrder:'RECENT_TO_OLD',migrationComplete:false,months:{},fixtureCount:0,windowStart:null,windowEnd:null,updatedAt:null}}
async function flush(month,fixtures){
  const rows=Object.values(fixtures);if(!month||!rows.length)return null;
  rows.sort((a,b)=>Number(a.timestamp||0)-Number(b.timestamp||0));
  const path=monthPath(month),shard={version:'HISTORICAL-MONTH-SHARD-1',month,path,source:LEGACY,fixtureCount:rows.length,windowStart:rows[0]?.date||null,windowEnd:rows.at(-1)?.date||null,fixtures:Object.fromEntries(rows.map(r=>[String(r.fixtureId),r])),migratedAt:new Date().toISOString()};
  await writeJson(path,shard);
  return{path,fixtureCount:shard.fixtureCount,windowStart:shard.windowStart,windowEnd:shard.windowEnd,updatedAt:shard.migratedAt};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const index=await readJson(INDEX,freshIndex());index.months||={};
  if(index.migrationComplete)return res.status(200).json({ok:true,version:'HISTORICAL-SHARD-MIGRATE-1',status:'COMPLETE',providerCalls:0,writes:0,months:Object.keys(index.months).length,fixtureCount:index.fixtureCount||0,updatedAt:index.updatedAt,policy:{streaming:true,providerQuotaSpend:false,boundedMemory:true,monthlyShards:true}});
  const legacy=await get(LEGACY,{access:ACCESS});
  if(!legacy||legacy.statusCode!==200||!legacy.stream)return res.status(200).json({ok:false,version:'HISTORICAL-SHARD-MIGRATE-1',status:'NO_LEGACY_ARCHIVE',providerCalls:0,writes:0});
  const limit=Math.max(1,Math.min(MAX_MONTHS,Number(req.query?.months)||DEFAULT_MONTHS)),existing=new Set(Object.keys(index.months).filter(m=>index.months[m]?.complete!==false));
  let currentMonth=null,current={},newMonths=0,scannedFixtures=0,migratedFixtures=0,reachedEnd=true,lastSeenMonth=null,orderViolation=null;
  async function commit(){if(!currentMonth||existing.has(currentMonth)||!Object.keys(current).length)return;const meta=await flush(currentMonth,current);index.months[currentMonth]={...meta,complete:true};existing.add(currentMonth);newMonths++;migratedFixtures+=meta.fixtureCount}
  for await(const row of legacyFixtures(legacy.stream)){
    scannedFixtures++;const month=monthOf(row);if(!month)continue;
    if(lastSeenMonth&&month>lastSeenMonth){orderViolation={previous:lastSeenMonth,current:month,fixtureId:row.fixtureId};reachedEnd=false;break}
    if(month!==currentMonth){if(currentMonth){await commit();if(newMonths>=limit){reachedEnd=false;break}}currentMonth=month;current={};lastSeenMonth=month}
    if(!existing.has(month)&&row.fixtureId!=null)current[String(row.fixtureId)]=row;
  }
  if(!orderViolation&&currentMonth&&newMonths<limit)await commit();
  if(orderViolation){index.sourceOrderValid=false;index.orderViolation=orderViolation}else if(index.sourceOrderValid!==false)index.sourceOrderValid=true;
  const metas=Object.entries(index.months).filter(([,v])=>v?.complete).sort((a,b)=>a[0].localeCompare(b[0]));index.fixtureCount=metas.reduce((s,[,v])=>s+(Number(v.fixtureCount)||0),0);index.windowStart=metas[0]?.[1]?.windowStart||null;index.windowEnd=metas.at(-1)?.[1]?.windowEnd||null;index.updatedAt=new Date().toISOString();index.lastRun={newMonths,scannedFixtures,migratedFixtures,reachedEnd,orderViolation};index.migrationComplete=Boolean(reachedEnd&&!orderViolation);await writeJson(INDEX,index);
  const status=orderViolation?'ORDER_GUARD_TRIGGERED':index.migrationComplete?'COMPLETE':'PARTIAL';
  return res.status(200).json({ok:!orderViolation,version:'HISTORICAL-SHARD-MIGRATE-1',status,providerCalls:0,newMonths,monthsMigrated:Object.keys(index.months).length,scannedFixtures,migratedFixtures,totalMigratedFixtures:index.fixtureCount,migrationComplete:index.migrationComplete,windowStart:index.windowStart,windowEnd:index.windowEnd,orderViolation,policy:{streaming:true,providerQuotaSpend:false,boundedMemory:true,monthlyShards:true,legacyArchiveReadOnly:true,maxNewMonthsPerRun:limit,failClosedOnUnexpectedOrder:true}})
}
