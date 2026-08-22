import { readJson, writeJson, storageReady } from './_report-store.js';

export const config={maxDuration:90};
const LATEST='argus/cognitive/latest.json';

function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
function describe(body,status){const v=body?.error??body?.message??body?.status??null;if(typeof v==='string'&&v.trim())return v.trim();try{return v!=null?JSON.stringify(v):`HTTP ${status}`}catch(_){return `HTTP ${status}`}}
async function getJson(base,path,auth){const r=await fetch(`${base}${path}`,{headers:{Accept:'application/json',...(auth?{Authorization:auth}:{})},cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${path}: ${describe(j,r.status)}`);return j}
function weight(p){return{CRITICAL:100,HIGH:70,MEDIUM:40,LOW:10}[String(p||'').toUpperCase()]||5}
function key(h){return String(h?.sourcePriority||h?.id||'UNKNOWN')}
function compactHypothesis(h){return{id:h.id||null,sourcePriority:h.sourcePriority||null,priority:h.priority||'LOW',statement:h.statement||null,status:h.status||'UNTESTED',type:'HYPOTHESIS',productionEffect:'NONE'}}
function brusselsStamp(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}`}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app',base=`${proto}://${host}`,auth=req.headers.authorization||'',started=Date.now();
 try{
  const [brief,hypothesisPacket,evidencePacket]=await Promise.all([getJson(base,'/api/cognitive-brief',auth),getJson(base,'/api/cognitive-hypotheses',auth),getJson(base,'/api/cognitive-evidence',auth)]);
  const now=new Date().toISOString(),previous=storageReady()?await readJson(LATEST,null):null,prevActive=Array.isArray(previous?.memory?.active)?previous.memory.active:[],prevMap=new Map(prevActive.map(x=>[String(x.key),x]));
  const hypotheses=Array.isArray(hypothesisPacket.hypotheses)?hypothesisPacket.hypotheses:[],assessments=Array.isArray(evidencePacket.assessments)?evidencePacket.assessments:[],evidenceMap=new Map(assessments.map(x=>[String(x.hypothesisId),x]));
  const active=hypotheses.map(h=>{const k=key(h),old=prevMap.get(k),occurrences=Number(old?.occurrences||0)+1,firstSeen=old?.firstSeen||now,e=evidenceMap.get(String(h.id))||null,evidenceBoost=e?.verdict==='CONDITION_CONFIRMED_ROOT_CAUSE_UNRESOLVED'?10:e?.verdict==='SUPPORTED'?5:0;return{key:k,...compactHypothesis(h),evidenceVerdict:e?.verdict||'INSUFFICIENT_EVIDENCE',condition:e?.condition||'UNKNOWN',rootCause:e?.rootCause||'UNRESOLVED',facts:e?.facts||[],requiredEvidence:h.requiredEvidence||[],nextTests:h.nextTests||[],firstSeen,lastSeen:now,occurrences,attentionScore:weight(h.priority)+evidenceBoost+Math.min(20,Math.max(0,occurrences-1)*2)}}).sort((a,b)=>b.attentionScore-a.attentionScore);
  const currentKeys=new Set(active.map(x=>x.key));
  const newlyResolved=prevActive.filter(x=>!currentKeys.has(String(x.key))).map(x=>({...x,resolvedAt:now,resolution:'PRIORITY_NOT_PRESENT_THIS_CYCLE'}));
  const priorResolved=Array.isArray(previous?.memory?.recentlyResolved)?previous.memory.recentlyResolved:[];
  const recentlyResolved=[...newlyResolved,...priorResolved].slice(0,40);
  const snapshot={version:'COGNITIVE-CYCLE-2',generatedAt:now,mode:'SHADOW_READ_ONLY',productionAuthority:false,llmConnected:false,brief:{version:brief.version||null,summary:brief.summary||{},priorities:Array.isArray(brief.priorities)?brief.priorities:[]},hypotheses:{version:hypothesisPacket.version||null,count:hypotheses.length},evidence:{version:evidencePacket.version||null,summary:evidencePacket.summary||{},assessments},memory:{active,recentlyResolved},attention:{top:active.slice(0,5),recurring:active.filter(x=>x.occurrences>=3).slice(0,8),unresolvedRootCauses:active.filter(x=>x.rootCause==='UNRESOLVED'&&x.condition==='CONFIRMED').slice(0,8)},constraints:{mayChangeProduction:false,mayUnlockPrime:false,mayChangeWeights:false,mayChangePolicies:false,mayChangeStake:false,hypothesesAreNotFacts:true,governanceVeto:true},storage:{ready:storageReady(),latestPath:LATEST},elapsedMs:Date.now()-started};
  if(storageReady()){
   await writeJson(LATEST,snapshot);
   await writeJson(`argus/cognitive/history/${brusselsStamp()}.json`,snapshot);
  }
  return res.status(200).json({ok:true,...snapshot});
 }catch(error){return res.status(503).json({ok:false,error:error.message,mode:'SHADOW_READ_ONLY',elapsedMs:Date.now()-started})}
}
