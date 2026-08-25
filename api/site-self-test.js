import { readJson, writeJson, storageReady } from './_report-store.js';

const SNAPSHOT='argus/health/site-self-test.json';
const SEMANTIC_AUDITS=new Set(['/api/trend-integrity-audit','/api/decision-integrity-audit','/api/autonomy-health','/api/fast-cycle-health']);
const WAGER_SCOPE_CONTRACTS=new Map([['/api/autonomy-health','AUTONOMY_SUPERVISOR'],['/api/fast-cycle-health','FAST_CYCLE']]);
const SEMANTIC_FAILURE=new Set(['FAIL','CRITICAL','DEGRADED','STALE']);
const SEMANTIC_WAITING=new Set(['NO_DATA','WAITING_FOR_TRENDS','WAITING']);
const SEMANTIC_WARNING=new Set(['LATE','CAUTION','SLOW','RUNNING']);
function authorized(req){const s=String(process.env.CRON_SECRET||'').trim();return !s||req.headers.authorization===`Bearer ${s}`}
function ageMinutes(ts){const t=new Date(ts||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,Math.round((Date.now()-t)/60000)):null}
function wageringContract(path,body){
  const expected=WAGER_SCOPE_CONTRACTS.get(path);
  if(!expected)return null;
  const policy=body?.policy||{};
  if(policy.scope!==expected)return `WAGERING_SCOPE_MISSING_OR_INVALID:${policy.scope||'NONE'}`;
  if(policy.wageringCapabilityOwnedByThisEndpoint!==false)return 'WAGERING_OWNERSHIP_AMBIGUOUS';
  if(policy.globalWageringStatus!=='UNVERIFIED')return `GLOBAL_WAGERING_STATUS_MUST_BE_UNVERIFIED:${String(policy.globalWageringStatus)}`;
  if(typeof policy.automaticWagering==='boolean'||typeof policy.automaticRealWagering==='boolean')return 'MISLEADING_GLOBAL_WAGERING_BOOLEAN_PRESENT';
  return null;
}
async function probe(base,path){const started=Date.now();try{const r=await fetch(`${base}${path}`,{cache:'no-store',headers:{Accept:path.startsWith('/api/')?'application/json':'text/html','x-argus-health-check':'1'}});const contentType=r.headers.get('content-type')||'';let body=null;if(SEMANTIC_AUDITS.has(path)&&contentType.includes('application/json'))body=await r.json().catch(()=>null);const contractFailure=wageringContract(path,body),semanticFailure=SEMANTIC_AUDITS.has(path)&&body&&SEMANTIC_FAILURE.has(body.status),semanticWaiting=SEMANTIC_AUDITS.has(path)&&body&&SEMANTIC_WAITING.has(body.status),semanticWarning=SEMANTIC_AUDITS.has(path)&&body&&SEMANTIC_WARNING.has(body.status);return{path,ok:r.ok&&!semanticFailure&&!semanticWaiting&&!contractFailure,status:r.status,ms:Date.now()-started,contentType,semanticStatus:body?.status||null,semanticState:contractFailure?'FAIL':semanticFailure?'FAIL':semanticWaiting?'WAITING':semanticWarning?'WARNING':body?.status||null,contractFailure:contractFailure||undefined,checked:body?.checked??null,violations:semanticFailure?body.violations?.slice?.(0,10):undefined}}catch(e){return{path,ok:false,status:0,ms:Date.now()-started,error:e.message}}}
async function deepTest(req){const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host;if(!host)throw new Error('Host unavailable');const base=`${proto}://${host}`;
const paths=['/','/live.html','/daily-slip.html','/markets.html','/exact-scores.html','/trends.html','/shield.html','/prediction-results.html','/virtual-bankroll.html','/system-health.html','/historical-validation.html','/training-dashboard.html','/compte-rendu-des-predictions.html','/evolution-dashboard.html','/argus-lab.html','/developer-health.html','/manifest.webmanifest','/sw.js','/src/live-prime-follow.js','/src/live-command-center.js','/src/live-snapshot-guard.js','/src/surviving-edge-client.js','/src/pressure-window.js','/api/site-health','/api/autopilot-health','/api/autonomy-health','/api/fast-cycle-health','/api/learning-health','/api/developer-health','/api/deployment-verifier?latest=1','/api/prediction-ledger?limit=1','/api/pressure-window-memory','/api/trend-integrity-audit','/api/decision-integrity-audit'];
const checks=await Promise.all(paths.map(p=>probe(base,p))),failures=checks.filter(x=>!x.ok&&x.semanticState!=='WAITING'),waiting=checks.filter(x=>x.semanticState==='WAITING'),warnings=checks.filter(x=>x.semanticState==='WARNING'),slow=checks.filter(x=>x.ok&&x.ms>2500).map(x=>({path:x.path,ms:x.ms}));const state={version:'SITE-SELF-TEST-31',generatedAt:new Date().toISOString(),status:failures.length?'DEGRADED':waiting.length?'WAITING_FOR_EVIDENCE':warnings.length?'CAUTION':slow.length?'SLOW':'HEALTHY',checked:checks.length,failures,waiting,warnings,slow,checks,policy:{readOnly:true,publicObservability:true,secretValuesExposed:false,providerQuotaSpendAllowed:false,persistentWritesAllowed:'SNAPSHOT_ONLY',mutatingJobsExcluded:true,autopilotHealthObservedWithoutTriggeringAutopilot:true,autonomyHeartbeatObserved:true,fastCycleHeartbeatObserved:true,wageringHealthSemanticsScoped:true,globalWageringStateNeverInferredFromReadOnlyHealthEndpoints:true,schedulerJitterIsWarningBeforeStaleFailure:true,developerHealthObserved:true,deploymentSnapshotObserved:true,trendIntegrityObserved:true,decisionIntegrityObserved:true,virtualBankrollPageObserved:true,semanticNoDataIsNotHealthy:true,deepProbeFanoutOnlyOnAuthenticatedRefresh:true,publicReadsUsePersistedSnapshot:true}};await writeJson(SNAPSHOT,state);return state}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Site self-test storage unavailable'});
  if(!authorized(req)){
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=180');
    const snapshot=await readJson(SNAPSHOT,null);
    if(!snapshot)return res.status(200).json({version:'SITE-SELF-TEST-31',generatedAt:null,status:'WAITING',checked:0,failures:[],waiting:[],warnings:[],slow:[],checks:[],servedFromSnapshot:true,snapshotAgeMinutes:null,policy:{publicReadsUsePersistedSnapshot:true,deepProbeFanoutOnlyOnAuthenticatedRefresh:true,awaitingFirstAuthenticatedRun:true}});
    return res.status(200).json({...snapshot,servedFromSnapshot:true,snapshotAgeMinutes:ageMinutes(snapshot.generatedAt)});
  }
  res.setHeader('Cache-Control','no-store');
  try{return res.status(200).json(await deepTest(req))}catch(e){return res.status(500).json({version:'SITE-SELF-TEST-31',status:'DEGRADED',error:e.message,generatedAt:new Date().toISOString()})}
}
