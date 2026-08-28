import { requestQuery } from './_request-query.js';
import { readJson, writeJson, storageReady } from './_report-store.js';

const ENV=String(process.env.VERCEL_ENV||'local').toLowerCase().replace(/[^a-z0-9_-]/g,'_');
const OUT=`argus/health/deployment-verification-${ENV}.json`;
const LEGACY_OUT='argus/health/deployment-verification.json';
const CRITICAL=['/api/site-health','/api/autopilot-health','/api/autonomy-health','/api/learning-health','/api/prediction-ledger?limit=1','/api/decision-integrity-audit','/api/policy-registry'];
const SEMANTIC_BLOCK=new Set(['FAIL','BLOCKED','ACTION_REQUIRED','CRITICAL','DEGRADED','STALE']);
function authorized(req){const s=String(process.env.CRON_SECRET||'').trim();return !s||req.headers.authorization===`Bearer ${s}`}
async function get(base,path,auth){const started=Date.now();try{const r=await fetch(`${base}${path}`,{headers:{Accept:'application/json',...(auth?{Authorization:auth}:{}),'x-argus-deployment-verifier':'1'},cache:'no-store'}),body=await r.json().catch(()=>null);return{path,ok:r.ok,status:r.status,ms:Date.now()-started,semanticStatus:body?.status||body?.summary?.status||null,error:body?.error||null}}catch(e){return{path,ok:false,status:0,ms:Date.now()-started,error:e.message}}}
async function latestSnapshot(){const scoped=await readJson(OUT,null);if(scoped)return scoped;if(ENV==='production')return readJson(LEGACY_OUT,{version:'DEPLOYMENT-VERIFIER-5',status:'UNKNOWN',generatedAt:null,snapshotScope:ENV});return{version:'DEPLOYMENT-VERIFIER-5',status:'UNKNOWN',generatedAt:null,snapshotScope:ENV}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!storageReady())return res.status(503).json({error:'Deployment verifier storage unavailable'});
  if(req.method==='GET'&&String(requestQuery(req)?.latest||'')==='1')return res.status(200).json(await latestSnapshot());
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});

  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(!host)return res.status(500).json({error:'Host unavailable'});
  const productionHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const base=ENV==='production'&&productionHost?`https://${productionHost}`:`${proto}://${host}`;
  const auth=String(req.headers.authorization||'');
  let selfTest=null;
  try{const r=await fetch(`${base}/api/site-self-test`,{headers:{Accept:'application/json'},cache:'no-store'});selfTest=await r.json().catch(()=>null)}catch(_){}
  const checks=await Promise.all(CRITICAL.map(p=>get(base,p,auth))),failed=checks.filter(x=>!x.ok),semanticFails=checks.filter(x=>SEMANTIC_BLOCK.has(String(x.semanticStatus||'').toUpperCase()));
  const selfStatus=String(selfTest?.status||'UNKNOWN').toUpperCase(),selfAdvisory=['DEGRADED','FAIL','SLOW'].includes(selfStatus);
  let status='READY';
  if(failed.length||semanticFails.length)status='BLOCKED';else if(checks.some(x=>x.ms>2500)||selfAdvisory)status='DEGRADED';
  const state={version:'DEPLOYMENT-VERIFIER-5',generatedAt:new Date().toISOString(),status,snapshotScope:ENV,checkedBase:new URL(base).host,vercel:{environment:process.env.VERCEL_ENV||null,gitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,gitBranch:process.env.VERCEL_GIT_COMMIT_REF||null,deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null},selfTest:{status:selfTest?.status||'UNAVAILABLE',checked:selfTest?.checked??null,failures:selfTest?.failures?.length??null,waiting:selfTest?.waiting?.length??null,slow:selfTest?.slow?.length??null,snapshotAgeMinutes:selfTest?.snapshotAgeMinutes??null,servedFromSnapshot:Boolean(selfTest?.servedFromSnapshot),supportingOnly:true},critical:{checked:checks.length,failed:failed.length,semanticFails:semanticFails.length,checks},policy:{readOnlyChecks:true,persistentSnapshot:true,environmentScopedSnapshot:true,previewCannotOverwriteProductionSnapshot:true,providerQuotaSpendAllowed:false,mutatingEndpointsExcluded:true,automaticRollback:false,automaticPromotion:false,autonomyIsCritical:true,readyRequiresCriticalHealth:true,broadSelfTestSnapshotSupportingOnly:true,criticalEndpointsRemainLive:true,waitingBroadSnapshotDoesNotBlockDeployment:true}};
  await writeJson(OUT,state);
  if(ENV==='production')await writeJson(LEGACY_OUT,state);
  return res.status(200).json(state);
}
