import { readJson, listJson, storageReady } from './_report-store.js';

const ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATE='argus/research/historical-decade-state.json';
const RECENT_INDEX='argus/research/historical-recent-index.json';
const DAYS=3653;
const MEMORY_GUARD_BYTES=24*1024*1024;
const TZ='Europe/Brussels';
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
function expectedDates(){const out=[],end=addDays(brusselsDate(),-1);for(let i=0;i<DAYS;i++)out.push(addDays(end,-i));return out}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'HISTORICAL-ARCHIVE-HEALTH-3',status:'DEGRADED',error:'Storage unavailable'});
  const [archive,state,recentIndex,blobs]=await Promise.all([readJson(ARCHIVE,null),readJson(STATE,null),readJson(RECENT_INDEX,{dates:{},months:{}}),listJson(ARCHIVE,10)]);
  if(!archive)return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-3',status:'NO_ARCHIVE',providerCalls:false,writes:false});
  const meta=blobs.find(b=>b.pathname===ARCHIVE)||null,archiveSizeBytes=Number.isFinite(Number(meta?.size))?Number(meta.size):null;
  const dates=expectedDates(),stored=archive.dates||{},overlay=recentIndex?.dates||{},legacyCompletedDates=dates.filter(d=>stored[d]?.complete).length,overlayCompleteDates=dates.filter(d=>overlay[d]?.complete).length,combinedCompletedDates=dates.filter(d=>stored[d]?.complete||overlay[d]?.complete).length;
  let legacyRecentCompleteDays=0;for(const d of dates){if(stored[d]?.complete)legacyRecentCompleteDays++;else break}
  let combinedRecentCompleteDays=0;for(const d of dates){if(stored[d]?.complete||overlay[d]?.complete)combinedRecentCompleteDays++;else break}
  const firstLegacyGaps=dates.filter(d=>!stored[d]?.complete).slice(0,30),firstCombinedGaps=dates.filter(d=>!(stored[d]?.complete||overlay[d]?.complete)).slice(0,30),oldestCombinedRecentComplete=combinedRecentCompleteDays?dates[combinedRecentCompleteDays-1]:null;
  const memoryGuardTriggered=archiveSizeBytes!=null&&archiveSizeBytes>MEMORY_GUARD_BYTES,legacyStatus=memoryGuardTriggered?'BACKFILL_MEMORY_GUARD_TRIGGERED':legacyRecentCompleteDays>=30?'RECENT_COVERAGE_AVAILABLE':legacyRecentCompleteDays>0?'RECENT_COVERAGE_THIN':'NO_RECENT_CONTIGUOUS_COVERAGE';
  const status=combinedRecentCompleteDays>=30?'RECENT_CONTINUITY_HEALTHY':combinedRecentCompleteDays>0?'RECENT_CONTINUITY_THIN':memoryGuardTriggered&&overlayCompleteDates===0?'LEGACY_GUARD_OVERLAY_EMPTY':'NO_RECENT_CONTIGUOUS_COVERAGE';
  return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-3',generatedAt:new Date().toISOString(),status,legacyStatus,archiveVersion:archive.version||null,archiveSizeBytes,memoryGuardBytes:MEMORY_GUARD_BYTES,memoryGuardTriggered,windowDays:archive.windowDays||DAYS,windowStart:archive.windowStart||dates.at(-1),windowEnd:archive.windowEnd||null,fixtureCount:Number(archive.fixtureCount)||Object.keys(archive.fixtures||{}).length,legacyCompletedDates,overlayCompleteDates,combinedCompletedDates,legacyRecentCompleteDays,combinedRecentCompleteDays,oldestCombinedRecentComplete,firstLegacyGaps,firstCombinedGaps,recentOverlay:{version:recentIndex?.version||null,migrationFloor:recentIndex?.migrationFloor||null,requiredThrough:recentIndex?.requiredThrough||null,updatedAt:recentIndex?.updatedAt||null,months:Object.keys(recentIndex?.months||{}).length},state:{complete:Boolean(state?.complete),lastRun:state?.lastRun||null,recentCompleteDays:Number(state?.recentCompleteDays)||0},policy:{readOnly:true,providerCalls:false,writes:false,diagnosticOnly:true,doesNotRelaxTrendIntegrity:true,memoryGuardObserved:true,combinedContinuityUsesCertifiedDatesOnly:true,legacyOrRecentOverlay:true}})
}
