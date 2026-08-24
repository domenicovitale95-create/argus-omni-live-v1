import { readJson, writeJson, storageReady } from './_report-store.js';
import { providerPlanMeta } from './_provider-plan.js';

export const config = { maxDuration: 60 };

const STATE_PATH = 'argus/health/autonomous-supervisor.json';
const INCIDENTS_PATH = 'argus/health/incidents.json';
const PLAN_PATH = 'argus/autopilot/decision-plan.json';
const LEDGER_HEALTH_PATH = 'argus/health/prediction-ledger-cron.json';
const HIST_INDEX_PATH = 'argus/research/historical-shards-index.json';
const QUOTA_GUARD_PATH = 'argus/data/api-football-quota-guard.json';
const PLAN_STALE_MINUTES = 60;
const PLAN_CRITICAL_MINUTES = 180;
const LEDGER_STALE_MINUTES = 20;
const HIST_STALL_MINUTES = 35;
const HIST_RECOVERY_COOLDOWN_MINUTES = 30;
const AUTOPILOT_NO_FIXTURES_COOLDOWN_MINUTES = 30;
const OPERATIONAL_RESERVE_RATIO = .20;
const LEARNING_RESERVE_RATIO = .25;

function secret(){ return String(process.env.CRON_SECRET || '').trim(); }
function authorized(req){ const s = secret(); return !s || req.headers.authorization === `Bearer ${s}`; }
function ageMinutes(value){
  const t = value ? new Date(value).getTime() : 0;
  return t && Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
}
function providerDayUtc(){ return new Date().toISOString().slice(0,10); }
function brusselsClock(){
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Brussels', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date:`${p.year}-${p.month}-${p.day}`, hour:Number(p.hour), minute:Number(p.minute) };
}
function activeWindow(c){ return c.hour >= 6 || (c.hour === 0 && c.minute <= 30); }
function baseUrl(req){
  const production = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(production) return `https://${production}`;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${proto}://${host}` : null;
}
function authHeaders(){ const s = secret(); return { Accept:'application/json', ...(s ? { Authorization:`Bearer ${s}` } : {}) }; }
async function call(base, path, timeoutMs = 52000){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try{
    const r = await fetch(`${base}${path}`, { method:'GET', headers:authHeaders(), cache:'no-store', signal:controller.signal });
    const data = await r.json().catch(() => ({}));
    return { ok:r.ok, status:r.status, ms:Date.now()-started, data };
  }catch(error){
    return { ok:false, status:0, ms:Date.now()-started, error:error.name === 'AbortError' ? 'TIMEOUT' : error.message };
  }finally{ clearTimeout(timer); }
}
function guardDay(guard){ return guard?.providerDayUtc || guard?.date || String(guard?.observedAt || '').slice(0,10) || null; }
function currentQuotaHalt(guard){ return Boolean(guard?.exhausted && guardDay(guard) === providerDayUtc()); }
function quotaBudget(guard){
  const configured=Number(providerPlanMeta()?.dailyLimit)||7500;
  const observed=Number(guard?.dailyLimit);
  const dailyLimit=Number.isFinite(observed)&&observed>0?observed:configured;
  const remainingRaw=Number(guard?.dailyRemaining);
  const dailyRemaining=Number.isFinite(remainingRaw)?Math.max(0,remainingRaw):null;
  const operationalReserve=Math.max(1,Math.ceil(dailyLimit*OPERATIONAL_RESERVE_RATIO));
  const learningReserve=Math.max(operationalReserve,Math.ceil(dailyLimit*LEARNING_RESERVE_RATIO));
  const learningSpendable=dailyRemaining==null?null:Math.max(0,dailyRemaining-learningReserve);
  return{dailyLimit,dailyRemaining,operationalReserve,learningReserve,learningSpendable,learningAllowed:dailyRemaining==null?null:dailyRemaining>learningReserve};
}
function event(name, result, extra={}){
  return { name, attempted:true, ok:Boolean(result?.ok), status:result?.status ?? null, ms:result?.ms ?? null, error:result?.error || result?.data?.error || null, ...extra };
}
function effectiveRemediation(result){ return Boolean(result?.ok && !result?.data?.skipped); }
async function recordIncident(kind, state){
  const feed=await readJson(INCIDENTS_PATH,{version:'ARGUS-INCIDENT-FEED-1',incidents:[]});
  const incidents=Array.isArray(feed?.incidents)?feed.incidents:[];
  const signature=`${kind}|${state.status}|${(state.issues||[]).map(x=>x.code).sort().join(',')}`;
  const recent=incidents.find(x=>x.signature===signature&&ageMinutes(x.createdAt)!=null&&ageMinutes(x.createdAt)<60);
  if(recent)return{recorded:false,deduplicated:true,id:recent.id};
  const row={id:`incident-${Date.now()}`,signature,kind,severity:kind==='SYSTEM_RECOVERED'?'INFO':state.status,createdAt:new Date().toISOString(),status:state.status,consecutiveUnhealthyRuns:state.consecutiveUnhealthyRuns,issues:state.issues||[],actions:state.actions||[],components:state.components||{}};
  feed.version='ARGUS-INCIDENT-FEED-1';feed.updatedAt=row.createdAt;feed.incidents=[row,...incidents].slice(0,100);
  await writeJson(INCIDENTS_PATH,feed);
  return{recorded:true,deduplicated:false,id:row.id};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  if(!authorized(req)) return res.status(401).json({ error:'Unauthorized' });
  if(!storageReady()) return res.status(503).json({ version:'AUTONOMY-SUPERVISOR-5', status:'CRITICAL', error:'Storage unavailable' });

  const startedAt = new Date().toISOString();
  const clock = brusselsClock();
  const base = baseUrl(req);
  if(!base) return res.status(500).json({ error:'Host unavailable' });

  const [previous, planBefore, ledgerBefore, histBefore, guard] = await Promise.all([
    readJson(STATE_PATH, null),
    readJson(PLAN_PATH, {generatedAt:null, plan:[]}),
    readJson(LEDGER_HEALTH_PATH, null),
    readJson(HIST_INDEX_PATH, null),
    readJson(QUOTA_GUARD_PATH, null)
  ]);

  const quotaHalt = currentQuotaHalt(guard);
  const budget = quotaBudget(guard);
  const planAgeBefore = ageMinutes(planBefore?.generatedAt);
  const ledgerAgeBefore = ageMinutes(ledgerBefore?.completedAt || ledgerBefore?.startedAt);
  const histAgeBefore = ageMinutes(histBefore?.updatedAt);
  const previousNoFixturesAge = ageMinutes(previous?.lastAutopilotNoFixturesAt);
  const noFixturesCooldownBefore = previousNoFixturesAge != null && previousNoFixturesAge < AUTOPILOT_NO_FIXTURES_COOLDOWN_MINUTES;
  const actions = [];
  let heavyRemediationTaken = false;
  let ledgerRecoveryState = null;
  let lastAutopilotNoFixturesAt = previous?.lastAutopilotNoFixturesAt || null;

  const shouldRecoverPlan = activeWindow(clock) && !quotaHalt && !noFixturesCooldownBefore && (planAgeBefore == null || planAgeBefore > PLAN_STALE_MINUTES);
  if(shouldRecoverPlan){
    const result = await call(base, '/api/autopilot', 54000);
    const skipped = Boolean(result?.data?.skipped);
    const skipReason = skipped ? (result?.data?.reason || 'SKIPPED') : null;
    actions.push(event('AUTOPILOT_RECOVERY', result, { reason:'STALE_DECISION_PLAN', beforeAgeMinutes:planAgeBefore, skipped, skipReason, effective:effectiveRemediation(result) }));
    if(result?.ok && skipReason === 'NO_FIXTURES') lastAutopilotNoFixturesAt = new Date().toISOString();
    else if(effectiveRemediation(result)) lastAutopilotNoFixturesAt = null;
    heavyRemediationTaken = effectiveRemediation(result);
  }

  const shouldRecoverLedger = ledgerAgeBefore == null || ledgerAgeBefore > LEDGER_STALE_MINUTES;
  if(shouldRecoverLedger && !heavyRemediationTaken){
    const result = await call(base, '/api/prediction-ledger-cron', 54000);
    actions.push(event('LEDGER_RECOVERY', result, { reason:'STALE_LEDGER_HEARTBEAT', beforeAgeMinutes:ledgerAgeBefore, effective:effectiveRemediation(result) }));
    if(result?.ok && result?.data?.healthPersisted !== false && result?.data?.completedAt) ledgerRecoveryState = result.data;
    heavyRemediationTaken = effectiveRemediation(result);
  }

  const histIncomplete = !histBefore || histBefore.migrationComplete !== true;
  const previousHistAttemptAge = ageMinutes(previous?.lastHistoricalRecoveryAttemptAt);
  const histStalled = histIncomplete && (histAgeBefore == null || histAgeBefore > HIST_STALL_MINUTES);
  if(histStalled && !heavyRemediationTaken && (previousHistAttemptAge == null || previousHistAttemptAge > HIST_RECOVERY_COOLDOWN_MINUTES)){
    const result = await call(base, '/api/historical-shard-migrate?months=6', 54000);
    actions.push(event('HISTORICAL_MIGRATION_RECOVERY', result, { reason:'MIGRATION_STALLED', beforeAgeMinutes:histAgeBefore, effective:effectiveRemediation(result) }));
    heavyRemediationTaken = effectiveRemediation(result);
  }

  const [planAfter, ledgerAfter, histAfter] = await Promise.all([
    readJson(PLAN_PATH, {generatedAt:null, plan:[]}),
    readJson(LEDGER_HEALTH_PATH, null),
    readJson(HIST_INDEX_PATH, null)
  ]);
  const effectiveLedgerAfter = ledgerRecoveryState?.completedAt ? ledgerRecoveryState : ledgerAfter;
  const planAge = ageMinutes(planAfter?.generatedAt);
  const ledgerAge = ageMinutes(effectiveLedgerAfter?.completedAt || effectiveLedgerAfter?.startedAt);
  const histAge = ageMinutes(histAfter?.updatedAt);
  const noFixturesAge = ageMinutes(lastAutopilotNoFixturesAt);
  const noFixturesCooldownActive = noFixturesAge != null && noFixturesAge < AUTOPILOT_NO_FIXTURES_COOLDOWN_MINUTES;

  const issues = [];
  if(activeWindow(clock) && !quotaHalt && !noFixturesCooldownActive && (planAge == null || planAge > PLAN_STALE_MINUTES)) issues.push({ code:'DECISION_PLAN_STALE', severity:planAge == null || planAge > PLAN_CRITICAL_MINUTES ? 'CRITICAL' : 'DEGRADED', ageMinutes:planAge });
  if(ledgerAge == null || ledgerAge > LEDGER_STALE_MINUTES) issues.push({ code:'LEDGER_HEARTBEAT_STALE', severity:'DEGRADED', ageMinutes:ledgerAge });
  if((!histAfter || histAfter.migrationComplete !== true) && (histAge == null || histAge > HIST_STALL_MINUTES)) issues.push({ code:'HISTORICAL_MIGRATION_STALLED', severity:'DEGRADED', ageMinutes:histAge });

  let status = 'HEALTHY';
  if(quotaHalt) status = 'PAUSED_QUOTA';
  else if(issues.some(x => x.severity === 'CRITICAL')) status = 'CRITICAL';
  else if(issues.length) status = 'DEGRADED';

  const failureLike = status === 'CRITICAL' || status === 'DEGRADED';
  const previousFailureLike = previous?.status === 'CRITICAL' || previous?.status === 'DEGRADED';
  const consecutiveUnhealthyRuns = failureLike ? Number(previous?.consecutiveUnhealthyRuns || 0) + 1 : 0;
  const lastHistoricalRecoveryAttemptAt = actions.some(x => x.name === 'HISTORICAL_MIGRATION_RECOVERY') ? new Date().toISOString() : (previous?.lastHistoricalRecoveryAttemptAt || null);
  const state = {
    version:'AUTONOMOUS-SUPERVISOR-5',
    startedAt,
    completedAt:new Date().toISOString(),
    status,
    clock,
    providerDayUtc:providerDayUtc(),
    consecutiveUnhealthyRuns,
    issues,
    actions,
    lastHistoricalRecoveryAttemptAt,
    lastAutopilotNoFixturesAt,
    components:{
      autopilot:{ generatedAt:planAfter?.generatedAt || null, ageMinutes:planAge, rows:Array.isArray(planAfter?.plan) ? planAfter.plan.length : 0, activeWindow:activeWindow(clock), noFixturesCooldownActive, noFixturesAgeMinutes:noFixturesAge },
      predictionLedger:{ completedAt:effectiveLedgerAfter?.completedAt || null, ageMinutes:ledgerAge, ok:effectiveLedgerAfter?.ok ?? null },
      historicalMigration:{ exists:Boolean(histAfter), migrationComplete:histAfter?.migrationComplete === true, updatedAt:histAfter?.updatedAt || null, ageMinutes:histAge, months:Object.keys(histAfter?.months || {}).length, fixtureCount:Number(histAfter?.fixtureCount || 0) },
      providerQuota:{ halted:quotaHalt, guardDay:guardDay(guard), mode:guard?.mode || null, observedAt:guard?.observedAt || null, observedAgeMinutes:ageMinutes(guard?.observedAt), ...budget }
    },
    policy:{
      runsWithoutChat:true,
      cronDriven:true,
      selfHealing:true,
      oneEffectiveHeavyRemediationPerRun:true,
      skippedRecoveryDoesNotBlockNextRemediation:true,
      autopilotNoFixturesCooldownMinutes:AUTOPILOT_NO_FIXTURES_COOLDOWN_MINUTES,
      noFixturesDoesNotCreateFalsePlanStaleIncident:true,
      remediationPriority:['AUTOPILOT','PREDICTION_LEDGER','HISTORICAL_MIGRATION'],
      directProviderCalls:false,
      providerDayClock:'UTC',
      quotaGuardRespected:true,
      operationalReserveRatio:OPERATIONAL_RESERVE_RATIO,
      learningReserveRatio:LEARNING_RESERVE_RATIO,
      learningYieldToOperationalTraffic:true,
      automaticWagering:false,
      historicalRecoveryProviderCalls:0,
      operationalIncidentLedger:true,
      failClosedOnUnhealthyState:true
    }
  };

  if(consecutiveUnhealthyRuns >= 3) state.incident=await recordIncident('SYSTEM_UNHEALTHY',state);
  else if(!failureLike&&previousFailureLike) state.incident=await recordIncident('SYSTEM_RECOVERED',state);
  await writeJson(STATE_PATH, state);
  return res.status(200).json(state);
}
