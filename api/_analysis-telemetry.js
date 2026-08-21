import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

export const TELEMETRY_VERSION='ARGUS-ANALYSIS-TELEMETRY-1';
export const TELEMETRY_PREFIX='argus/telemetry/analysis/';

function brusselsDay(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function bool(v){return Boolean(v)}
function safeIdPart(v){return String(v||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)}

export function telemetryDay(date=new Date()){return brusselsDay(date)}

export async function recordAutopilotCycle(result={},meta={}){
  if(!storageReady())return {recorded:false,reason:'STORAGE_UNAVAILABLE'};
  const now=new Date();
  const day=brusselsDay(now);
  const stamp=now.toISOString().replace(/[:.]/g,'-');
  const requestId=safeIdPart(meta.requestId||'');
  const random=Math.random().toString(36).slice(2,9);
  const path=`${TELEMETRY_PREFIX}${day}/${stamp}-${requestId||random}.json`;
  const schedulerPlan=n(result?.scheduler?.planRows??result?.scheduler?.plan??result?.scheduler?.total??result?.scheduler?.rows);
  const row={
    version:TELEMETRY_VERSION,
    day,
    recordedAt:now.toISOString(),
    requestId:meta.requestId||null,
    deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null,
    gitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,
    environment:process.env.VERCEL_ENV||null,
    cycle:{
      ok:result?.ok!==false,
      skipped:bool(result?.skipped),
      reason:result?.reason||null,
      elapsedMs:n(result?.elapsedMs),
      httpStatus:n(meta.httpStatus)||null
    },
    counters:{
      matchesAnalyzed:result?.skipped?0:n(result?.matches),
      marketSnapshotsCaptured:result?.skipped?0:n(result?.marketSnapshots),
      decisionRowsEvaluated:result?.skipped?0:schedulerPlan,
      nearKickoffRequested:result?.skipped?0:n(result?.availability?.requested),
      availabilityLoaded:result?.skipped?0:n(result?.availability?.loaded),
      eventsDetected:result?.skipped?0:n(result?.events),
      forcedRechecks:result?.skipped?0:n(result?.forcedRechecks),
      playerImpactFixtures:result?.skipped?0:n(result?.playerImpactFixtures),
      tacticalImpactFixtures:result?.skipped?0:n(result?.tacticalImpactFixtures),
      matchupImpactFixtures:result?.skipped?0:n(result?.matchupImpactFixtures),
      competitionContextFixtures:result?.skipped?0:n(result?.competitionContext?.fixtures),
      matchContextFixtures:result?.skipped?0:n(result?.matchContext?.fixtures),
      calibrationFixtures:result?.skipped?0:n(result?.calibration?.fixtures),
      calibrationApplied:result?.skipped?0:n(result?.calibration?.applied),
      confidenceCalibrationFixtures:result?.skipped?0:n(result?.confidenceCalibration?.fixtures),
      preKickoffEvaluated:result?.skipped?0:n(result?.preKickoff?.total??result?.preKickoff?.fixtures),
      eligibleDecisions:result?.skipped?0:n(result?.eligibility?.eligible),
      opportunitiesTracked:result?.skipped?0:n(result?.lifecycle?.tracked)
    },
    sourceMeta:{quota:result?.meta?.quota||null,brussels:result?.brussels||null},
    exactness:{
      appendOnlyEvent:true,
      countersAreObservedFromAutopilotResponse:true,
      noSyntheticDataPointEstimate:true,
      rawVariablesConsumedNotYetInstrumented:true,
      providerCallCountNotYetInstrumented:true,
      cacheHitCountNotYetInstrumented:true
    }
  };
  await writeJson(path,row);
  return {recorded:true,path,row};
}

export async function aggregateTelemetry(day=brusselsDay(new Date())){
  if(!storageReady())return {version:TELEMETRY_VERSION,day,status:'STORAGE_UNAVAILABLE',events:0,totals:{}};
  const blobs=await listJson(`${TELEMETRY_PREFIX}${day}/`,1000);
  const rows=await readManyJson(blobs);
  const totals={cycles:rows.length,fullRuns:0,skippedRuns:0,failedRuns:0,elapsedMs:0};
  const counters={};
  const skipReasons={};
  for(const row of rows){
    if(row?.cycle?.skipped){totals.skippedRuns++;skipReasons[row.cycle.reason||'UNKNOWN']=(skipReasons[row.cycle.reason||'UNKNOWN']||0)+1;}
    else if(row?.cycle?.ok===false)totals.failedRuns++;
    else totals.fullRuns++;
    totals.elapsedMs+=n(row?.cycle?.elapsedMs);
    for(const [k,v] of Object.entries(row?.counters||{}))counters[k]=(counters[k]||0)+n(v);
  }
  return {
    version:TELEMETRY_VERSION,
    day,
    status:'OK',
    events:rows.length,
    totals:{...totals,...counters},
    skipReasons,
    coverage:{
      expectedAutopilotSlotsPerDay:288,
      recordedSlots:rows.length,
      recordedSlotPct:Number(((rows.length/288)*100).toFixed(2))
    },
    exactness:{
      exactForRecordedCounters:true,
      appendOnlyEvents:true,
      rawVariablesConsumed:false,
      providerCalls:false,
      cacheHits:false,
      note:'Raw variable counts, provider-call counts and cache-hit counts require deeper source-level instrumentation and are intentionally not estimated.'
    },
    firstRecordedAt:rows.map(x=>x?.recordedAt).filter(Boolean).sort()[0]||null,
    lastRecordedAt:rows.map(x=>x?.recordedAt).filter(Boolean).sort().at(-1)||null
  };
}
