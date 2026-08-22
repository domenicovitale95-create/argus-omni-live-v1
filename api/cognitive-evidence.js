export const config={maxDuration:60};

function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
function describe(body,status){const v=body?.error??body?.message??body?.status??null;if(typeof v==='string'&&v.trim())return v.trim();try{return v!=null?JSON.stringify(v):`HTTP ${status}`}catch(_){return `HTTP ${status}`}}
async function getJson(base,path,auth){const r=await fetch(`${base}${path}`,{headers:{Accept:'application/json',...(auth?{Authorization:auth}:{})},cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${path}: ${describe(j,r.status)}`);return j}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function upper(v){return String(v||'').toUpperCase()}
function assessment(h,brief){
 const code=String(h?.sourcePriority||'UNKNOWN'),s=brief?.summary||{},facts=[];
 let condition='UNKNOWN',rootCause='UNRESOLVED';
 if(code==='COGNITIVE_INPUT_GAPS'){
  const count=n(s.sourceErrors);facts.push({label:'sourceErrors',value:count});condition=count!=null&&count>0?'CONFIRMED':'NOT_OBSERVED';
 }else if(code==='STRUCTURAL_DRIFT'){
  const freeze=Boolean(s.promotionFreeze),status=upper(s.driftStatus);facts.push({label:'promotionFreeze',value:freeze},{label:'driftStatus',value:status||null});condition=freeze||['SEVERE','CRITICAL'].includes(status)?'CONFIRMED':'NOT_OBSERVED';
 }else if(code==='LOW_AUTOPILOT_READINESS'){
  const score=n(s.readinessScore);facts.push({label:'readinessScore',value:score});condition=score!=null&&score<70?'CONFIRMED':score!=null?'NOT_OBSERVED':'UNKNOWN';
 }else if(code==='PROVIDER_DEGRADED'){
  const status=upper(s.providerStatus);facts.push({label:'providerStatus',value:status||null});condition=['DEGRADED','DOWN','CRITICAL','UNAVAILABLE'].includes(status)?'CONFIRMED':status?'NOT_OBSERVED':'UNKNOWN';
 }else if(code==='LEARNING_DEGRADED'){
  const status=upper(s.learningStatus);facts.push({label:'learningStatus',value:status||null});condition=['DEGRADED','SEVERE','CRITICAL'].includes(status)?'CONFIRMED':status?'NOT_OBSERVED':'UNKNOWN';
 }else if(code==='TRACKING_DEGRADED'){
  const status=upper(s.trackingStatus);facts.push({label:'trackingStatus',value:status||null});condition=['DEGRADED','SEVERE','CRITICAL'].includes(status)?'CONFIRMED':status?'NOT_OBSERVED':'UNKNOWN';
 }else if(code==='MODEL_HEALTH_DEGRADED'){
  const status=upper(s.modelStatus);facts.push({label:'modelStatus',value:status||null});condition=['DEGRADED','SEVERE','CRITICAL'].includes(status)?'CONFIRMED':status?'NOT_OBSERVED':'UNKNOWN';
 }else if(code==='CALIBRATION_SAMPLE_THIN'){
  const settled=n(s.calibrationSettled);facts.push({label:'calibrationSettled',value:settled});condition=settled!=null&&settled<60?'CONFIRMED':settled!=null?'NOT_OBSERVED':'UNKNOWN';rootCause=condition==='CONFIRMED'?'OBSERVED_SAMPLE_LIMIT':'UNRESOLVED';
 }else if(code==='NO_ACTIVE_SCHEDULER_PLAN'){
  const items=n(s.scheduledItems);facts.push({label:'scheduledItems',value:items});condition=items===0?'CONFIRMED':items!=null?'NOT_OBSERVED':'UNKNOWN';
 }
 const verdict=condition==='NOT_OBSERVED'?'FALSIFIED_CURRENT_CYCLE':condition==='CONFIRMED'&&rootCause==='OBSERVED_SAMPLE_LIMIT'?'SUPPORTED':condition==='CONFIRMED'?'CONDITION_CONFIRMED_ROOT_CAUSE_UNRESOLVED':'INSUFFICIENT_EVIDENCE';
 return{hypothesisId:h.id||null,sourcePriority:code,priority:h.priority||'LOW',type:'EVIDENCE_ASSESSMENT',verdict,condition,rootCause,facts,statement:h.statement||null,requiredEvidence:h.requiredEvidence||[],nextTests:h.nextTests||[],productionEffect:'NONE'};
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app',base=`${proto}://${host}`,auth=req.headers.authorization||'',started=Date.now();
 try{
  const [brief,hypothesisPacket]=await Promise.all([getJson(base,'/api/cognitive-brief',auth),getJson(base,'/api/cognitive-hypotheses',auth)]);
  const hypotheses=Array.isArray(hypothesisPacket.hypotheses)?hypothesisPacket.hypotheses:[],assessments=hypotheses.map(h=>assessment(h,brief));
  const counts=assessments.reduce((a,x)=>{a[x.verdict]=(a[x.verdict]||0)+1;return a},{});
  return res.status(200).json({ok:true,version:'COGNITIVE-EVIDENCE-1',generatedAt:new Date().toISOString(),mode:'SHADOW_READ_ONLY',productionAuthority:false,llmConnected:false,summary:{hypotheses:hypotheses.length,verdicts:counts},assessments,constraints:{evidenceFirst:true,hypothesesAreNotFacts:true,noAutomaticMutation:true,governanceVeto:true},elapsedMs:Date.now()-started});
 }catch(error){return res.status(503).json({ok:false,error:error.message,mode:'SHADOW_READ_ONLY',elapsedMs:Date.now()-started})}
}
