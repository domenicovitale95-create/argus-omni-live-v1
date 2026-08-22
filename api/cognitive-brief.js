export const config={maxDuration:60};

function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
function describe(body,status){const v=body?.error??body?.message??body?.status??null;if(typeof v==='string'&&v.trim())return v.trim();try{return v!=null?JSON.stringify(v):`HTTP ${status}`}catch(_){return `HTTP ${status}`}}
async function getJson(base,path,auth){const r=await fetch(`${base}${path}`,{headers:{Accept:'application/json',...(auth?{Authorization:auth}:{})},cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${path}: ${describe(j,r.status)}`);return j}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function addPriority(list,condition,priority,code,reason,nextCheck){if(condition)list.push({priority,code,reason,nextCheck})}
function sortPriorities(list){const rank={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};return list.sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9))}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});

  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app';
  const base=`${proto}://${host}`;
  const auth=req.headers.authorization||'';
  const started=Date.now();
  const specs=[
    ['autopilot','/api/autopilot-health'],
    ['readiness','/api/autopilot-readiness'],
    ['learning','/api/learning-health'],
    ['tracking','/api/tracking-health'],
    ['model','/api/model-health'],
    ['provider','/api/provider-status'],
    ['drift','/api/drift-detection'],
    ['calibration','/api/calibration-engine'],
    ['falsePositiveMemory','/api/false-positive-memory'],
    ['scheduler','/api/decision-scheduler']
  ];
  const state={},errors=[];
  await Promise.all(specs.map(async([key,path])=>{try{state[key]=await getJson(base,path,auth)}catch(e){errors.push({source:key,error:e.message})}}));

  const priorities=[];
  const readinessScore=num(state.readiness?.score);
  const providerStatus=String(state.provider?.status||state.provider?.health?.status||'').toUpperCase();
  const learningStatus=String(state.learning?.status||state.learning?.global?.status||'').toUpperCase();
  const trackingStatus=String(state.tracking?.status||state.tracking?.global?.status||'').toUpperCase();
  const modelStatus=String(state.model?.status||state.model?.global?.status||'').toUpperCase();
  const driftStatus=String(state.drift?.global?.status||state.drift?.status||'').toUpperCase();
  const calibrationSettled=num(state.calibration?.settled??state.calibration?.totalSettled);
  const plan=Array.isArray(state.scheduler?.plan)?state.scheduler.plan:[];

  addPriority(priorities,errors.length>0,'HIGH','COGNITIVE_INPUT_GAPS',`${errors.length} cognitive source(s) could not be read.`,'Resolve source errors before trusting cross-system conclusions.');
  addPriority(priorities,Boolean(state.drift?.promotionFreeze)||['SEVERE','CRITICAL'].includes(driftStatus),'CRITICAL','STRUCTURAL_DRIFT','Drift or a promotion freeze is active.','Identify the smallest reproducible source of drift before any promotion.');
  addPriority(priorities,readinessScore!=null&&readinessScore<70,'HIGH','LOW_AUTOPILOT_READINESS',`Autopilot readiness is ${readinessScore}.`,'Inspect the readiness blockers with the largest score impact.');
  addPriority(priorities,['DEGRADED','DOWN','CRITICAL','UNAVAILABLE'].includes(providerStatus),'HIGH','PROVIDER_DEGRADED',`Provider state is ${providerStatus}.`,'Prefer cached/historical evidence and avoid spending quota on low-information refreshes.');
  addPriority(priorities,['DEGRADED','SEVERE','CRITICAL'].includes(learningStatus),'HIGH','LEARNING_DEGRADED',`Learning health is ${learningStatus}.`,'Inspect ledger integrity, sample sufficiency and recurrent error attribution.');
  addPriority(priorities,['DEGRADED','SEVERE','CRITICAL'].includes(trackingStatus),'HIGH','TRACKING_DEGRADED',`Tracking health is ${trackingStatus}.`,'Repair frozen-prediction/settlement continuity before trusting performance metrics.');
  addPriority(priorities,['DEGRADED','SEVERE','CRITICAL'].includes(modelStatus),'HIGH','MODEL_HEALTH_DEGRADED',`Model health is ${modelStatus}.`,'Find which league/market/model bucket is responsible and isolate it.');
  addPriority(priorities,calibrationSettled!=null&&calibrationSettled<60,'MEDIUM','CALIBRATION_SAMPLE_THIN',`Calibration has ${calibrationSettled} settled observations.`,'Keep PRIME locked and prioritize information-rich settled samples.');
  addPriority(priorities,plan.length===0,'LOW','NO_ACTIVE_SCHEDULER_PLAN','The decision scheduler currently exposes no active plan.','Verify whether this is expected for the current fixture window.');

  const packet={
    version:'COGNITIVE-BRIEF-1',
    generatedAt:new Date().toISOString(),
    mode:'SHADOW_READ_ONLY',
    productionAuthority:false,
    llmConnected:false,
    doctrine:'SOFTWARE DOES THE REPEATABLE WORK. GPT DOES THE HARD REASONING. GOVERNANCE ALWAYS WINS.',
    summary:{
      readinessScore,
      providerStatus:providerStatus||null,
      learningStatus:learningStatus||null,
      trackingStatus:trackingStatus||null,
      modelStatus:modelStatus||null,
      driftStatus:driftStatus||null,
      promotionFreeze:Boolean(state.drift?.promotionFreeze),
      calibrationSettled,
      scheduledItems:plan.length,
      sourceErrors:errors.length
    },
    priorities:sortPriorities(priorities),
    evidence:{
      autopilot:state.autopilot||null,
      readiness:state.readiness||null,
      learning:state.learning||null,
      tracking:state.tracking||null,
      model:state.model||null,
      provider:state.provider||null,
      drift:state.drift||null,
      calibration:state.calibration||null,
      falsePositiveMemory:state.falsePositiveMemory||null,
      scheduler:state.scheduler||null
    },
    constraints:{
      mayChangeProduction:false,
      mayUnlockPrime:false,
      mayChangeWeights:false,
      mayChangePolicies:false,
      mayChangeStake:false,
      frozenPredictionsImmutable:true,
      governanceVeto:true
    },
    errors,
    elapsedMs:Date.now()-started
  };
  return res.status(errors.length?207:200).json({ok:errors.length===0,...packet});
}
