import { requestQuery } from './_request-query.js';
import { get } from '@vercel/blob';
import { readJson, writeJson, storageReady } from './_report-store.js';

const ACCESS='private';
const LEGACY='argus/research/historical-decade-fixtures.json';
const INDEX='argus/research/historical-shards-index.json';
const PREFIX='argus/research/historical-shards/';
const VERSION='HISTORICAL-SHARD-INDEX-2';
const DEFAULT_MONTHS=6;
const MAX_MONTHS=8;

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
      collecting=true;parts=[m[1].replace(/,\s*$/,'')];continue;
    }
    if(/^\s{4}\}\s*,?\s*$/.test(line)){
      parts.push('}');
      try{const row=JSON.parse(parts.join('\n'));if(row&&typeof row==='object')yield row}catch(e){throw new Error(`Legacy fixture parse failed: ${e.message}`)}
      collecting=false;parts=[];
    }else parts.push(line);
  }
}

function freshIndex(previous=null){
  const oldMonths=previous?.months&&typeof previous.months==='object'?Object.keys(previous.months):[];
  return{
    version:VERSION,
    source:LEGACY,
    sourceOrder:'ARBITRARY',
    discoveryComplete:false,
    discoveredMonths:[],
    completedMonths:[],
    migrationComplete:false,
    months:{},
    fixtureCount:0,
    sourceFixtureCount:null,
    windowStart:null,
    windowEnd:null,
    updatedAt:null,
    previousIndex:previous?{version:previous.version||null,months:oldMonths.length,fixtureCount:Number(previous.fixtureCount||0),orderViolation:previous.orderViolation||previous.lastRun?.orderViolation||null}:null
  };
}

async function openLegacy(){
  const legacy=await get(LEGACY,{access:ACCESS});
  if(!legacy||legacy.statusCode!==200||!legacy.stream)return null;
  return legacy;
}

async function flush(month,fixtures){
  const rows=Object.values(fixtures||{});if(!month||!rows.length)return null;
  rows.sort((a,b)=>Number(a.timestamp||0)-Number(b.timestamp||0));
  const path=monthPath(month),migratedAt=new Date().toISOString();
  const shard={version:'HISTORICAL-MONTH-SHARD-2',month,path,source:LEGACY,sourceOrder:'ARBITRARY_REBUILT_AFTER_FULL_SCAN',fixtureCount:rows.length,windowStart:rows[0]?.date||null,windowEnd:rows.at(-1)?.date||null,fixtures:Object.fromEntries(rows.map(r=>[String(r.fixtureId),r])),migratedAt,complete:true};
  await writeJson(path,shard);
  return{path,fixtureCount:shard.fixtureCount,windowStart:shard.windowStart,windowEnd:shard.windowEnd,updatedAt:migratedAt,complete:true,sourceScanComplete:true};
}

function recalc(index){
  const metas=Object.entries(index.months||{}).filter(([,v])=>v?.complete&&v?.sourceScanComplete).sort((a,b)=>a[0].localeCompare(b[0]));
  index.fixtureCount=metas.reduce((sum,[,v])=>sum+(Number(v.fixtureCount)||0),0);
  index.windowStart=metas[0]?.[1]?.windowStart||null;
  index.windowEnd=metas.at(-1)?.[1]?.windowEnd||null;
  index.completedMonths=metas.map(([m])=>m);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});

  const previous=await readJson(INDEX,null);
  const index=previous?.version===VERSION?previous:freshIndex(previous);
  index.months=index.months&&typeof index.months==='object'?index.months:{};
  index.discoveredMonths=Array.isArray(index.discoveredMonths)?index.discoveredMonths:[];
  index.completedMonths=Array.isArray(index.completedMonths)?index.completedMonths:[];

  if(index.migrationComplete){
    return res.status(200).json({ok:true,version:'HISTORICAL-SHARD-MIGRATE-2',status:'COMPLETE',providerCalls:0,writes:0,discoveredMonths:index.discoveredMonths.length,monthsMigrated:index.completedMonths.length,fixtureCount:index.fixtureCount||0,sourceFixtureCount:index.sourceFixtureCount,updatedAt:index.updatedAt,policy:{orderIndependent:true,fullSourceScanPerBatch:true,providerQuotaSpend:false,boundedMemory:true,monthlyShards:true,legacyArchiveReadOnly:true}});
  }

  // Phase 1: discover the real month universe with a full streaming pass.
  // The old archive is a fixture-id object, not a chronologically ordered array,
  // therefore no shard is trusted until a complete source pass has seen every row.
  if(!index.discoveryComplete){
    const legacy=await openLegacy();
    if(!legacy)return res.status(200).json({ok:false,version:'HISTORICAL-SHARD-MIGRATE-2',status:'NO_LEGACY_ARCHIVE',providerCalls:0,writes:0});
    const months=new Set();let scannedFixtures=0,undatedFixtures=0;
    for await(const row of legacyFixtures(legacy.stream)){
      scannedFixtures++;const month=monthOf(row);if(month)months.add(month);else undatedFixtures++;
    }
    index.discoveryComplete=true;
    index.discoveredMonths=[...months].sort();
    index.sourceFixtureCount=scannedFixtures;
    index.updatedAt=new Date().toISOString();
    index.lastRun={phase:'DISCOVERY',scannedFixtures,undatedFixtures,discoveredMonths:index.discoveredMonths.length,sourceScanComplete:true,providerCalls:0};
    recalc(index);
    await writeJson(INDEX,index);
    return res.status(200).json({ok:true,version:'HISTORICAL-SHARD-MIGRATE-2',status:'DISCOVERY_COMPLETE',providerCalls:0,writes:1,scannedFixtures,undatedFixtures,discoveredMonths:index.discoveredMonths.length,monthsMigrated:index.completedMonths.length,migrationComplete:false,policy:{orderIndependent:true,discoveryPass:true,noShardTrustedBeforeFullSourceScan:true,providerQuotaSpend:false,boundedMemory:true,legacyArchiveReadOnly:true}});
  }

  const limit=Math.max(1,Math.min(MAX_MONTHS,Number(requestQuery(req)?.months)||DEFAULT_MONTHS));
  const completed=new Set(index.completedMonths);
  const targets=index.discoveredMonths.filter(m=>!completed.has(m)).slice(0,limit);
  if(!targets.length){
    recalc(index);
    const countMatches=index.sourceFixtureCount==null||index.fixtureCount===index.sourceFixtureCount;
    index.migrationComplete=countMatches;
    index.integrity=countMatches?'VERIFIED_COUNT_MATCH':'COUNT_MISMATCH';
    index.updatedAt=new Date().toISOString();
    index.lastRun={phase:'FINALIZE',providerCalls:0,fixtureCount:index.fixtureCount,sourceFixtureCount:index.sourceFixtureCount,countMatches};
    await writeJson(INDEX,index);
    return res.status(200).json({ok:countMatches,version:'HISTORICAL-SHARD-MIGRATE-2',status:countMatches?'COMPLETE':'COUNT_MISMATCH',providerCalls:0,writes:1,monthsMigrated:index.completedMonths.length,discoveredMonths:index.discoveredMonths.length,fixtureCount:index.fixtureCount,sourceFixtureCount:index.sourceFixtureCount,migrationComplete:index.migrationComplete,integrity:index.integrity});
  }

  const legacy=await openLegacy();
  if(!legacy)return res.status(200).json({ok:false,version:'HISTORICAL-SHARD-MIGRATE-2',status:'NO_LEGACY_ARCHIVE',providerCalls:0,writes:0});
  const targetSet=new Set(targets),buckets=Object.fromEntries(targets.map(m=>[m,{}]));
  let scannedFixtures=0,targetFixtures=0,undatedFixtures=0;
  for await(const row of legacyFixtures(legacy.stream)){
    scannedFixtures++;const month=monthOf(row);if(!month){undatedFixtures++;continue}
    if(targetSet.has(month)&&row.fixtureId!=null){buckets[month][String(row.fixtureId)]=row;targetFixtures++}
  }

  let writes=0,migratedFixtures=0;
  for(const month of targets){
    const meta=await flush(month,buckets[month]);
    if(!meta)continue;
    index.months[month]=meta;writes++;migratedFixtures+=meta.fixtureCount;
  }
  recalc(index);
  const remaining=index.discoveredMonths.filter(m=>!new Set(index.completedMonths).has(m));
  const allMonthsDone=remaining.length===0;
  const countMatches=index.sourceFixtureCount==null||index.fixtureCount===index.sourceFixtureCount;
  index.migrationComplete=Boolean(allMonthsDone&&countMatches);
  index.integrity=allMonthsDone?(countMatches?'VERIFIED_COUNT_MATCH':'COUNT_MISMATCH'):'IN_PROGRESS';
  index.updatedAt=new Date().toISOString();
  index.lastRun={phase:'MIGRATE_BATCH',targetMonths:targets,scannedFixtures,targetFixtures,migratedFixtures,newMonths:writes,remainingMonths:remaining.length,sourceScanComplete:true,undatedFixtures,providerCalls:0};
  await writeJson(INDEX,index);writes++;

  return res.status(200).json({ok:true,version:'HISTORICAL-SHARD-MIGRATE-2',status:index.migrationComplete?'COMPLETE':'PARTIAL',providerCalls:0,writes,targetMonths:targets,newMonths:targets.length,monthsMigrated:index.completedMonths.length,discoveredMonths:index.discoveredMonths.length,remainingMonths:remaining.length,scannedFixtures,migratedFixtures,totalMigratedFixtures:index.fixtureCount,sourceFixtureCount:index.sourceFixtureCount,migrationComplete:index.migrationComplete,integrity:index.integrity,windowStart:index.windowStart,windowEnd:index.windowEnd,policy:{orderIndependent:true,fullSourceScanPerBatch:true,providerQuotaSpend:false,boundedMemory:true,monthlyShards:true,legacyArchiveReadOnly:true,maxNewMonthsPerRun:limit,shardsTrustedOnlyAfterCompleteSourceScan:true,failClosedOnCountMismatch:true}});
}
