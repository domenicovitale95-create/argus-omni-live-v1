import { requestQuery } from './_request-query.js';
import legacyHandler from './virtual-bankroll-v3.js';
import { readJson, readJsonFresh, storageReady } from './_report-store.js';

const TZ='Europe/Brussels';
const PLAN_PATH='argus/autopilot/decision-plan.json';
const MAX_LEDGER_CAPTURE_AGE_MIN=10;
const MAX_BRAIN_AGE_MIN=12;

function authorized(req){const s=String(process.env.CRON_SECRET||'').trim();return !s||req.headers.authorization===`Bearer ${s}`}
function n(v,f=null){if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f}
function ms(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null}
function observedMs(rec){return ms(rec?.lastSeenAt)||ms(rec?.publishedAt)}
function brusselsDate(value=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
const ledgerPath=d=>`argus/ledger/${d}.json`;
function planProof(plan,now=Date.now()){
  const brain=plan?.centralBrain||{},g=ms(plan?.generatedAt),a=ms(brain?.appliedAt),reasons=[];
  if(brain?.finalAuthority!==true)reasons.push('CENTRAL_BRAIN_FINAL_AUTHORITY_MISSING');
  if(!g)reasons.push('PLAN_GENERATED_AT_INVALID');
  if(!a)reasons.push('CENTRAL_BRAIN_APPLIED_AT_INVALID');
  if(g&&a&&a<g)reasons.push('CENTRAL_BRAIN_PRECEDES_PLAN');
  if(a&&((now-a)/60000)>MAX_BRAIN_AGE_MIN)reasons.push('CENTRAL_BRAIN_ATTESTATION_STALE');
  if(String(brain?.systemMode||'').toUpperCase()==='FAIL_CLOSED')reasons.push('CENTRAL_BRAIN_FAIL_CLOSED');
  return{ok:reasons.length===0,generatedAt:plan?.generatedAt||null,appliedAt:brain?.appliedAt||null,appliedAtMs:a,decisionCycleId:g&&a?`CB-${a}-${g}`:null,ageMinutes:a?Number(((now-a)/60000).toFixed(2)):null,reasons};
}
function potentiallyCaptureable(rec,now){const p=ms(rec?.publishedAt),o=observedMs(rec),k=ms(rec?.kickoff),odds=n(rec?.odds),age=o?(now-o)/60000:null;return Boolean(rec?.id&&rec?.fixtureId&&p&&o&&k&&p<k&&o<k&&now<k&&age>=0&&age<=MAX_LEDGER_CAPTURE_AGE_MIN&&odds>1&&rec?.integrity?.settlementSupported!==false)}
async function freshLedgerRows(now){const today=brusselsDate(),rows=[];for(let d=-2;d<=4;d++){const date=addDays(today,d),book=await readJson(ledgerPath(date),null);for(const rec of book?.records||[])if(potentiallyCaptureable(rec,now))rows.push(rec)}return rows}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const mode=String(requestQuery(req)?.mode||'summary').toLowerCase();
  if(mode!=='run')return legacyHandler(req,res);
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({version:'VIRTUAL-BANKROLL-4',ok:false,status:'BLOCKED',reason:'STORAGE_UNAVAILABLE'});
  const now=Date.now(),plan=await readJsonFresh(PLAN_PATH,{generatedAt:null,plan:[],centralBrain:null}),proof=planProof(plan,now),fresh=await freshLedgerRows(now);
  if(fresh.length&&!proof.ok)return res.status(200).json({version:'VIRTUAL-BANKROLL-4',ok:false,status:'BLOCKED',reason:'CURRENT_CYCLE_ATTESTATION_FAILED',capturedOfficial:0,capturedLearning:0,settled:0,providerCalls:0,attestation:proof,freshLedgerRecords:fresh.length,policy:{failClosed:true,currentDecisionCycleRequired:true,freshPlanReadRequired:true,automaticRealBetPlacement:false,noRealMoney:true}});
  const current=fresh.filter(rec=>String(rec?.decisionCycleId||'')===String(proof.decisionCycleId||''));
  const conflicting=fresh.filter(rec=>rec?.decisionCycleId&&proof.decisionCycleId&&String(rec.decisionCycleId)!==String(proof.decisionCycleId)&&observedMs(rec)>=proof.appliedAtMs);
  if(conflicting.length)return res.status(200).json({version:'VIRTUAL-BANKROLL-4',ok:false,status:'BLOCKED',reason:'CONFLICTING_LEDGER_CYCLE_MEMBERSHIP',capturedOfficial:0,capturedLearning:0,settled:0,providerCalls:0,attestation:proof,freshLedgerRecords:fresh.length,currentCycleLedgerRecords:current.length,conflictingRecords:conflicting.map(x=>({id:x.id,fixtureId:x.fixtureId,publishedAt:x.publishedAt,lastSeenAt:x.lastSeenAt||null,decisionCycleId:x.decisionCycleId||null})).slice(0,20),policy:{failClosed:true,explicitDecisionCycleMembership:true,noNewVirtualPositionOnCycleConflict:true,freshPlanReadRequired:true,automaticRealBetPlacement:false,noRealMoney:true}});
  const captureRes={statusCode:200,headers:{},body:null};
  const proxy={setHeader:(k,v)=>{captureRes.headers[String(k).toLowerCase()]=v;return proxy},status:c=>{captureRes.statusCode=Number(c)||200;return proxy},json:b=>{captureRes.body=b;return b},send:b=>{captureRes.body=b;return b},end:b=>{if(b!==undefined)captureRes.body=b;return b}};
  const cycleReq={...req,method:req.method,headers:req.headers,query:{...(requestQuery(req)||{}),decisionCycleId:proof.ok?proof.decisionCycleId:'__NO_ATTESTED_CYCLE__'}};
  await legacyHandler(cycleReq,proxy);
  const body=captureRes.body&&typeof captureRes.body==='object'?captureRes.body:{};
  const previous=fresh.filter(rec=>rec?.decisionCycleId&&proof.decisionCycleId&&String(rec.decisionCycleId)!==String(proof.decisionCycleId)&&observedMs(rec)<proof.appliedAtMs);
  const untagged=fresh.filter(rec=>!rec?.decisionCycleId);
  return res.status(captureRes.statusCode).json({...body,version:'VIRTUAL-BANKROLL-4',attestation:proof,freshLedgerRecords:fresh.length,currentCycleLedgerRecords:current.length,ignoredPreviousCycleRecords:previous.length,ignoredUntaggedLegacyRecords:untagged.length,cycleAmbiguity:false,decisionCycleId:proof.decisionCycleId,policy:{...(body.policy||{}),failClosedOnCycleConflict:true,currentCentralBrainCycleRequiredForNewEntries:true,explicitDecisionCycleMembership:true,freshPlanReadRequired:true,previousCycleRowsIgnoredNotBlocked:true,legacyUntaggedRowsCannotCreateNewPositions:true,settlementRemainsIndependentOfEntryCycle:true,automaticRealBetPlacement:false,noRealMoney:true}});
}
