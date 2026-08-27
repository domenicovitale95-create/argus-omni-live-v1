import { readFile } from 'node:fs/promises';

const backfill=await readFile('api/historical-recent-backfill.js','utf8');
const streak=await readFile('api/streak-intelligence.js','utf8');
const scheduler=await readFile('.github/workflows/argus-autonomous-scheduler.yml','utf8');

function requireAll(text,needles,label){
  for(const needle of needles){
    if(!text.includes(needle))throw new Error(`${label} invariant missing: ${needle}`);
  }
}

requireAll(backfill,[
  "PREFIX='argus/research/historical-recent/'",
  'monthPath(date)',
  "MIGRATION_FLOOR='2026-08-19'",
  'function guardCurrent(guard)',
  'providerHalted=guardCurrent(guard)',
  "status:'PAUSED_QUOTA_GUARD'",
  'providerCalls:0',
  "status:'DRY_RUN'",
  'noLegacyRewrite:true',
  'ACTIVE_OR_SCHEDULED',
  'blocking=unresolved.filter',
  'settlementReady:blocking.length===0',
  'if(!out.settlementReady){deferred.push',
  'DEFERRED_UNSETTLED',
  'activeStartedFixturesAlwaysBlock:true',
  'staleNeverStartedFixturesMayBeExcluded:true'
],'historical recent backfill');

requireAll(streak,[
  'archive?.dates?.[date]?.complete||recentIndex?.dates?.[date]?.complete',
  'archiveContinuous(archive,recentIndex',
  'noGapFilling:true',
  'olderMatchesNeverSubstitute:true',
  'continuityMayUseLegacyOrCertifiedRecentOverlay:true'
],'streak continuity');

requireAll(scheduler,["call '/api/historical-recent-backfill?dates=6' 'Historical recent backfill'"],'scheduler');
if(scheduler.includes("call '/api/historical-decade-backfill?dates=6'"))throw new Error('scheduler still targets oversized legacy monolith');

console.log('Historical recent overlay regression passed.');
