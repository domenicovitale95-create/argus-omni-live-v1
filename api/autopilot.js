import autopilotV2, { config } from './autopilot-v2.js';
import centralBrain from './central-brain.js';
import { readJson, writeJson, storageReady } from './_report-store.js';

export { config };

const DECISION_PLAN_PATH='argus/autopilot/decision-plan.json';

function captureRes(){
  let statusCode=200,body=null;
  const headers={};
  const res={
    setHeader(name,value){headers[String(name).toLowerCase()]=value;return res},
    status(code){statusCode=Number(code)||200;return res},
    json(value){body=value;return value},
    send(value){body=value;return value},
    end(value){if(value!==undefined)body=value;return value}
  };
  return{res,snapshot:()=>({statusCode,body,headers})};
}

function internalReq(req,body){
  const secret=String(process.env.CRON_SECRET||'').trim();
  return{method:'POST',query:{},body,headers:{...(req?.headers||{}),...(secret?{authorization:`Bearer ${secret}`}:{})}};
}

function failClosedRow(row,reason){
  return{...row,preCentralBrainVerdict:row?.finalVerdict||null,finalVerdict:'NO BET',betEligible:false,tier:row?.tier==='ARCHIVE'?'ARCHIVE':'BASE',score:Math.min(Number(row?.score)||0,39),recommendedStakePct:0,recommendedUnits:0,centralBrain:{version:'CENTRAL-BRAIN-1',action:'BLOCK',changed:true,afterVerdict:'NO BET',systemMode:'FAIL_CLOSED',systemReasons:[reason],authority:'FINAL_VETO_FAIL_CLOSED'},reason:`CENTRAL BRAIN FAIL CLOSED (${reason}) · ${row?.reason||''}`};
}

async function persistFailClosed(reason){
  if(!storageReady())return false;
  const scheduler=await readJson(DECISION_PLAN_PATH,null);
  if(!scheduler||!Array.isArray(scheduler.plan))return false;
  const plan=scheduler.plan.map(row=>failClosedRow(row,reason));
  const summary={...(scheduler.summary||{}),total:plan.length,prime:0,value:0,watch:0,noBet:plan.length,eligible:0,centralBrainChanged:plan.length,centralBrainBlocked:plan.length,centralBrainPenalized:0};
  await writeJson(DECISION_PLAN_PATH,{...scheduler,plan,summary,centralBrain:{version:'CENTRAL-BRAIN-1',appliedAt:new Date().toISOString(),systemMode:'FAIL_CLOSED',systemReasons:[reason],finalAuthority:true,mayUpgrade:false}});
  return true;
}

export default async function handler(req,res){
  const primary=captureRes();
  try{
    await autopilotV2(req,primary.res);
  }catch(error){
    return res.status(500).json({ok:false,error:`AUTOPILOT_V2_EXCEPTION: ${error?.message||error}`,centralBrain:{applied:false}});
  }
  const base=primary.snapshot(),body=base.body&&typeof base.body==='object'?base.body:{};
  if(base.statusCode<200||base.statusCode>=300||body?.skipped||body?.ok===false){
    return res.status(base.statusCode).json(body);
  }

  try{
    if(!storageReady())throw new Error('STORAGE_UNAVAILABLE');
    const scheduler=await readJson(DECISION_PLAN_PATH,null);
    if(!scheduler||!Array.isArray(scheduler.plan))throw new Error('DECISION_PLAN_UNAVAILABLE');
    const brainCapture=captureRes();
    await centralBrain(internalReq(req,{scheduler}),brainCapture.res);
    const brain=brainCapture.snapshot(),brainBody=brain.body&&typeof brain.body==='object'?brain.body:{};
    if(brain.statusCode<200||brain.statusCode>=300||brainBody?.ok===false)throw new Error(brainBody?.error||`CENTRAL_BRAIN_HTTP_${brain.statusCode}`);
    return res.status(base.statusCode).json({...body,centralBrain:{applied:true,status:brainBody.status||null,summary:brainBody.summary||null,posture:brainBody.posture||null,policy:brainBody.policy||null}});
  }catch(error){
    const reason=String(error?.message||error||'UNKNOWN_CENTRAL_BRAIN_FAILURE');
    let failClosedPersisted=false;
    try{failClosedPersisted=await persistFailClosed(reason)}catch(_){}
    return res.status(503).json({...body,ok:false,error:`CENTRAL_BRAIN_GATE_FAILED: ${reason}`,centralBrain:{applied:false,failClosed:true,failClosedPersisted}});
  }
}
