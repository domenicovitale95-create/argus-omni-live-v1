import { readJson, listJson, storageReady } from './_report-store.js';

const ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATE='argus/research/historical-decade-state.json';
const RECENT_INDEX='argus/research/historical-recent-index.json';
const SHARD_INDEX='argus/research/historical-shards-index.json';
const SHARD_INDEX_VERSION='HISTORICAL-SHARD-INDEX-2';
const DAYS=3653;
const MEMORY_GUARD_BYTES=24*1024*1024;
const TZ='Europe/Brussels';
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
function expectedDates(){const out=[],end=addDays(brusselsDate(),-1);for(let i=0;i<DAYS;i++)out.push(addDays(end,-i));return out}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'HISTORICAL-ARCHIVE-HEALTH-6',status:'DEGRADED',error:'Storage unavailable'});
  const blobs=await listJson('argus/research/',300),meta=blobs.find(b=>b.pathname===ARCHIVE)||null,archiveSizeBytes=Number.isFinite(Number(meta?.size))?Number(meta.size):null,memoryGuardTriggered=archiveSizeBytes!=null&&archiveSizeBytes>MEMORY_GUARD_BYTES;
  const [state,recentIndex,shardIndex]=await Promise.all([readJson(STATE,null),readJson(RECENT_INDEX,{dates:{},months:{}}),readJson(SHARD_INDEX,null)]);
  if(!meta)return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-6',status:'NO_ARCHIVE',providerCalls:false,writes:false});
  const dates=expectedDates(),overlay=recentIndex?.dates||{},overlayCompleteDates=dates.filter(d=>overlay[d]?.complete).length;let overlayRecentCompleteDays=0;for(const d of dates){if(overlay[d]?.complete)overlayRecentCompleteDays++;else break}
  const firstOverlayGaps=dates.filter(d=>!overlay[d]?.complete).slice(0,30),trustedV2=shardIndex?.version===SHARD_INDEX_VERSION;
  const completedEntries=trustedV2?Object.entries(shardIndex?.months||{}).filter(([,v])=>v?.complete&&v?.sourceScanComplete===true):[],migratedFixtureCount=completedEntries.reduce((s,[,v])=>s+(Number(v.fixtureCount)||0),0),migrationComplete=Boolean(trustedV2&&shardIndex?.migrationComplete),discoveryComplete=Boolean(trustedV2&&shardIndex?.discoveryComplete),discoveredMonths=trustedV2&&Array.isArray(shardIndex?.discoveredMonths)?shardIndex.discoveredMonths.length:0,completedMonths=trustedV2&&Array.isArray(shardIndex?.completedMonths)?shardIndex.completedMonths.length:completedEntries.length,remainingMonths=Math.max(0,discoveredMonths-completedMonths);
  let migrationStatus='NOT_STARTED';if(shardIndex){if(!trustedV2)migrationStatus='LEGACY_SHARDS_UNTRUSTED';else if(migrationComplete)migrationStatus='COMPLETE';else if(!discoveryComplete)migrationStatus='DISCOVERY_REQUIRED';else migrationStatus='IN_PROGRESS'}
  const integrity=trustedV2?(shardIndex?.integrity||(!migrationComplete?'IN_PROGRESS':'UNKNOWN')):'REBUILD_REQUIRED';
  const status=migrationComplete&&integrity==='VERIFIED_COUNT_MATCH'?'SHARDED_ARCHIVE_HEALTHY':overlayRecentCompleteDays>=30?'RECENT_CONTINUITY_HEALTHY':memoryGuardTriggered?'SHARD_MIGRATION_REQUIRED':'LEGACY_ARCHIVE_AVAILABLE';
  return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-6',generatedAt:new Date().toISOString(),status,archiveSizeBytes,memoryGuardBytes:MEMORY_GUARD_BYTES,memoryGuardTriggered,legacyArchiveRead:false,windowDays:DAYS,legacyState:{complete:Boolean(state?.complete),lastRun:state?.lastRun||null,recentCompleteDays:Number(state?.recentCompleteDays)||0},shards:{version:shardIndex?.version||null,trusted:trustedV2,status:migrationStatus,migrationComplete,discoveryComplete,discoveredMonths,completedMonths,remainingMonths,fixtureCount:migratedFixtureCount,sourceFixtureCount:trustedV2?shardIndex?.sourceFixtureCount??null:null,integrity,windowStart:trustedV2?shardIndex?.windowStart||null:null,windowEnd:trustedV2?shardIndex?.windowEnd||null:null,updatedAt:shardIndex?.updatedAt||null,lastRun:shardIndex?.lastRun||null,previousIndex:trustedV2?shardIndex?.previousIndex||null:{version:shardIndex?.version||null,months:Object.keys(shardIndex?.months||{}).length,fixtureCount:Number(shardIndex?.fixtureCount||0),orderViolation:shardIndex?.orderViolation||shardIndex?.lastRun?.orderViolation||null}},recentOverlay:{version:recentIndex?.version||null,migrationFloor:recentIndex?.migrationFloor||null,requiredThrough:recentIndex?.requiredThrough||null,updatedAt:recentIndex?.updatedAt||null,months:Object.keys(recentIndex?.months||{}).length,completeDates:overlayCompleteDates,recentCompleteDays:overlayRecentCompleteDays,firstGaps:firstOverlayGaps},policy:{readOnly:true,providerCalls:false,writes:false,diagnosticOnly:true,largeLegacyBlobNeverParsed:true,doesNotRelaxTrendIntegrity:true,memoryGuardObserved:true,monthlyShardMigration:true,orderIndependentMigrationRequired:true,legacyPartialShardsNeverTrusted:true,completionRequiresCountMatch:true}})
}
