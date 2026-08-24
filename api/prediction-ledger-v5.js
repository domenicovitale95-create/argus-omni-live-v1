import legacyHandler from './prediction-ledger-v4.js';
import { readJsonFresh, storageReady } from './_report-store.js';

const PLAN_PATH='argus/autopilot/decision-plan.json';
const MAX_ATTESTATION_AGE_MIN=12;

function modeOf(req){return String(req.query?.mode||req.body?.mode||'capture').toLowerCase()}
function ms(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null}
function attestation(plan,cycleAfter){
  const generatedAt=plan?.generatedAt||null,brain=plan?.centralBrain||{},appliedAt=brain?.appliedAt||null;
  const g=ms(generatedAt),a=ms(appliedAt),after=cycleAfter?ms(cycleAfter):null,now=Date.now();
  const cycleId=g&&a?`CB-${a}-${g}`:null;
  const reasons=[];
  if(brain?.finalAuthority!==true)reasons.push('CENTRAL_BRAIN_FINAL_AUTHORITY_MISSING');
  if(!g)reasons.push('PLAN_GENERATED_AT_INVALID');
  if(!a)reasons.push('CENTRAL_BRAIN_APPLIED_AT_INVALID');
  if(g&&a&&a<g)reasons.push('CENTRAL_BRAIN_PRECEDES_PLAN');
  if(after&&a&&a<after)reasons.push('CENTRAL_BRAIN_NOT_FROM_CURRENT_CRON');
  if(after&&g&&g<after)reasons.push('PLAN_NOT_FROM_CURRENT_CRON');
  if(a&&((now-a)/60000)>MAX_ATTESTATION_AGE_MIN)reasons.push('CENTRAL_BRAIN_ATTESTATION_STALE');
  if(String(brain?.systemMode||'').toUpperCase()==='FAIL_CLOSED')reasons.push('CENTRAL_BRAIN_FAIL_CLOSED');
  return{ok:reasons.length===0,cycleId,generatedAt,appliedAt,cycleAfter:cycleAfter||null,ageMinutes:a?Number(((now-a)/60000).toFixed(2)):null,finalAuthority:brain?.finalAuthority===true,systemMode:brain?.systemMode||null,reasons};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(modeOf(req)!=='capture'||req.method!=='POST')return legacyHandler(req,res);
  if(!storageReady())return res.status(503).json({version:'PREDICTION-LEDGER-5',ok:false,status:'BLOCKED',reason:'STORAGE_UNAVAILABLE'});
  // Capture is cycle-attested against a plan that was just written by the
  // autopilot/central-brain path. A cached Blob read can return the previous
  // cycle for up to the store cache TTL and create a false fail-closed block.
  const plan=await readJsonFresh(PLAN_PATH,{generatedAt:null,plan:[],centralBrain:null});
  const proof=attestation(plan,String(req.query?.cycleAfter||req.body?.cycleAfter||'').trim()||null);
  if(!proof.ok)return res.status(200).json({version:'PREDICTION-LEDGER-5',ok:false,status:'BLOCKED',reason:'CURRENT_CYCLE_ATTESTATION_FAILED',attestation:proof,considered:0,captured:0,deduplicated:0,rejectedLate:0,rejectedInvalid:0,policy:{failClosed:true,currentCentralBrainCycleRequired:true,freshPlanReadRequired:true,automaticWagering:false}});
  const captureRes={statusCode:200,headers:{},body:null};
  const proxy={setHeader:(k,v)=>{captureRes.headers[String(k).toLowerCase()]=v;return proxy},status:c=>{captureRes.statusCode=Number(c)||200;return proxy},json:b=>{captureRes.body=b;return b},send:b=>{captureRes.body=b;return b},end:b=>{if(b!==undefined)captureRes.body=b;return b}};
  await legacyHandler(req,proxy);
  const body=captureRes.body&&typeof captureRes.body==='object'?captureRes.body:{};
  const ok=captureRes.statusCode>=200&&captureRes.statusCode<300&&!body.error;
  return res.status(captureRes.statusCode).json({...body,version:'PREDICTION-LEDGER-5',ok,attestation:proof,decisionCycleId:proof.cycleId,policy:{...(body.policy||{}),failClosed:true,currentCentralBrainCycleRequired:true,freshPlanReadRequired:true,cycleBoundToCronStart:Boolean(proof.cycleAfter),automaticWagering:false}});
}
