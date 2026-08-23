import { readJson, listJson, storageReady } from './_report-store.js';

const ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATE='argus/research/historical-decade-state.json';
const RECENT_INDEX='argus/research/historical-recent-index.json';
const SHARD_INDEX='argus/research/historical-shards-index.json';
const DAYS=3653;
const MEMORY_GUARD_BYTES=24*1024*1024;
const TZ='Europe/Brussels';
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
function expectedDates(){const out=[],end=addDays(brusselsDate(),-1);for(let i=0;i<DAYS;i++)out.push(addDays(end,-i));return out}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'HISTORICAL-ARCHIVE-HEALTH-5',status:'DEGRADED',error:'Storage unavailable'});
  const blobs=await listJson('argus/research/',300),meta=blobs.find(b=>b.pathname===ARCHIVE)||null,archiveSizeBytes=Number.isFinite(Number(meta?.size))?Number(meta.size):null,memoryGuardTriggered=archiveSizeBytes!=null&&archiveSizeBytes>MEMORY_GUARD_BYTES;
  const [state,recentIndex,shardIndex]=await Promise.all([readJson(STATE,null),readJson(RECENT_INDEX,{dates:{},months:{}}),readJson(SHARD_INDEX,null)]);
  if(!meta)return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-5',status:'NO_ARCHIVE',providerCalls:false,writes:false});
  const dates=expectedDates(),overlay=recentIndex?.dates||{},overlayCompleteDates=dates.filter(d=>overlay[d]?.complete).length;let overlayRecentCompleteDays=0;for(const d of dates){if(overlay[d]?.complete)overlayRecentCompleteDays++;else break}
  const firstOverlayGaps=dates.filter(d=>!overlay[d]?.complete).slice(0,30);
  const completedEntries=Object.entries(shardIndex?.months||{}).filter(([,v])=>v?.complete&&v?.sourceScanComplete!==false),migratedFixtureCount=completedEntries.reduce((s,[,v])=>s+(Number(v.fixtureCount)||0),0),migrationComplete=Boolean(shardIndex?.migrationComplete),discoveryComplete=Boolean(shardIndex?.discoveryComplete),discoveredMonths=Array.isArray(shardIndex?.discoveredMonths)?shardIndex.discoveredMonths.length:0,completedMonths=Array.isArray(shardIndex?.completedMonths)?shardIndex.completedMonths.length:completedEntries.length,remainingMonths=Math.max(0,discoveredMonths-completedMonths);
  let migrationStatus='NOT_STARTED';if(shardIndex){if(migrationComplete)migrationStatus='COMPLETE';else if(!discoveryComplete)migrationStatus='DISCOVERY_REQUIRED';else migrationStatus='IN_PROGRESS'}
  const integrity=shardIndex?.integrity||(!migrationComplete?'IN_PROGRESS':'UNKNOWN');
  const status=migrationComplete&&integrity==='VERIFIED_COUNT_MATCH'?'SHARDED_ARCHIVE_HEALTHY':overlayRecentCompleteDays>=30?'RECENT_CONTINUITY_HEALTHY':memoryGuardTriggered?'SHARD_MIGRATION_REQUIRED':'LEGACY_ARCHIVE_AVAILABLE';
  return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-5',generatedAt:new Date().toISOString(),status,archiveSizeBytes,memoryGuardBytes:MEMORY_GUARD_BYTES,memoryGuardTriggered,legacyArchiveRead:false,windowDays:DAYS,legacyState:{complete:Boolean(state?.complete),lastRun:state?.lastRun||null,recentCompleteDays:Number(state?.recentCompleteDays)||0},shards:{version:shardIndex?.version||null,status:migrationStatus,migrationComplete,discoveryComplete,discoveredMonths,completedMonths,remainingMonths,fixtureCount:migratedFixtureCount,sourceFixtureCount:shardIndex?.sourceFixtureCount??null,integrity,windowStart:shardIndex?.windowStart||null,windowEnd:shardIndex?.windowEnd||null,updatedAt:shardIndex?.updatedAt||null,lastRun:shardIndex?.lastRun||null,previousIndex:shardIndex?.previousIndex||null},recentOverlay:{version:recentIndex?.version||null,migrationFloor:recentIndex?.migrationFloor||null,requiredThrough:recentIndex?.requiredThrough||null,updatedAt:recentIndex?.updatedAt||null,months:Object.keys(recentIndex?.months||{}).length,completeDates:overlayCompleteDates,recentCompleteDays:overlayRecentCompleteDays,firstGaps:firstOverlayGaps},policy:{readOnly:true,providerCalls:false,writes:false,diagnosticOnly:true,largeLegacyBlobNeverParsed:true,doesNotRelaxTrendIntegrity:true,memoryGuardObserved:true,monthlyShardMigration:true,orderIndependentMigrationRequired:true,completionRequiresCountMatch:true}})
}
