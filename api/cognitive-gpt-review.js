import { requestQuery } from './_request-query.js';
import { readJson, writeJson, storageReady } from './_report-store.js';

export const config={maxDuration:90};
const LATEST='argus/cognitive/gpt/latest.json';
const USAGE='argus/cognitive/gpt/usage.json';

function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
function describe(body,status){const v=body?.error??body?.message??body?.status??null;if(typeof v==='string'&&v.trim())return v.trim();try{return v!=null?JSON.stringify(v):`HTTP ${status}`}catch(_){return `HTTP ${status}`}}
async function getJson(base,path,auth){const r=await fetch(`${base}${path}`,{headers:{Accept:'application/json',...(auth?{Authorization:auth}:{})},cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${path}: ${describe(j,r.status)}`);return j}
function brusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function num(v,d){const n=Number(v);return Number.isFinite(n)?n:d}
function hoursSince(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?(Date.now()-t)/36e5:Infinity}
function compact(brief,evidence,memory){
 const priorities=(Array.isArray(brief?.priorities)?brief.priorities:[]).slice(0,8).map(x=>({priority:x.priority,code:x.code,reason:x.reason,nextCheck:x.nextCheck}));
 const assessments=(Array.isArray(evidence?.assessments)?evidence.assessments:[]).slice(0,8).map(x=>({hypothesisId:x.hypothesisId,sourcePriority:x.sourcePriority,priority:x.priority,verdict:x.verdict,condition:x.condition,rootCause:x.rootCause,facts:x.facts,nextTests:x.nextTests}));
 const recurring=(Array.isArray(memory?.attention?.recurring)?memory.attention.recurring:[]).slice(0,6).map(x=>({key:x.key,priority:x.priority,occurrences:x.occurrences,evidenceVerdict:x.evidenceVerdict,rootCause:x.rootCause,statement:x.statement}));
 return{generatedAt:new Date().toISOString(),summary:brief?.summary||{},priorities,assessments,recurring,constraints:{productionAuthority:false,primeLockedByCognitiveCore:true,noBetSelection:true,noStakeAdvice:true,noDirectMutation:true,governanceVeto:true}};
}
function escalation(packet){
 const critical=packet.priorities.filter(x=>x.priority==='CRITICAL').length,high=packet.priorities.filter(x=>x.priority==='HIGH').length,recurring=packet.recurring.filter(x=>Number(x.occurrences||0)>=3).length,unresolved=packet.assessments.filter(x=>['CRITICAL','HIGH'].includes(x.priority)&&x.condition==='CONFIRMED'&&x.rootCause==='UNRESOLVED').length;
 const required=critical>0||recurring>0||unresolved>0||high>=2;
 return{required,critical,high,recurring,unresolved,reason:critical?'CRITICAL_PRIORITY':recurring?'RECURRING_FAILURE':unresolved?'HIGH_PRIORITY_ROOT_CAUSE_UNRESOLVED':high>=2?'MULTIPLE_HIGH_PRIORITIES':'NO_ESCALATION'};
}
function buildPrompt(packet,esc){return`You are the advisory reasoning layer of ARGUS OMNI. Analyze a protected SHADOW cognitive packet. You have NO production authority. Do not select bets, recommend stakes, unlock PRIME, change model weights, change policies, invent missing facts, or weaken deterministic governance. Distinguish OBSERVED facts from DERIVED interpretations and HYPOTHESES. Prefer falsification and the smallest test that can disprove a claim. Return ONLY valid JSON with this schema: {"summary":"string","rootCauseHypotheses":[{"claim":"string","confidence":0.0,"evidenceFor":["string"],"evidenceAgainst":["string"],"falsificationTest":"string"}],"missingEvidence":["string"],"experiments":[{"name":"string","expectedInformationGain":"LOW|MEDIUM|HIGH","deterministicCheck":"string","successCriterion":"string","stopCriterion":"string"}],"priorityAssessment":[{"code":"string","action":"KEEP|RAISE|LOWER","reason":"string"}],"warnings":["string"]}. Maximum 5 root-cause hypotheses and 5 experiments. Escalation: ${JSON.stringify(esc)}. Cognitive packet: ${JSON.stringify(packet)}`}
function safeParse(text){try{return JSON.parse(text)}catch(_){const a=String(text||'').indexOf('{'),b=String(text||'').lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(String(text).slice(a,b+1))}catch(__){}return null}}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 const enabled=String(process.env.COGNITIVE_LLM_ENABLED||'false').toLowerCase()==='true';
 const model=String(process.env.COGNITIVE_OPENAI_MODEL||'openai/gpt-5.6-sol').trim();
 if(!model.startsWith('openai/'))return res.status(500).json({ok:false,error:'Cognitive model must remain an OpenAI model',model});
 const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app',base=`${proto}://${host}`,auth=req.headers.authorization||'',started=Date.now();
 try{
  const [brief,evidence,memory]=await Promise.all([getJson(base,'/api/cognitive-brief',auth),getJson(base,'/api/cognitive-evidence',auth),getJson(base,'/api/cognitive-memory',auth)]);
  const packet=compact(brief,evidence,memory),esc=escalation(packet),prompt=buildPrompt(packet,esc),dryRun=String(requestQuery(req)?.dryRun||'')==='1';
  if(dryRun||!enabled)return res.status(200).json({ok:true,version:'COGNITIVE-GPT-REVIEW-1',mode:'SHADOW_ADVISORY',enabled,called:false,dryRun,model,escalation:esc,reason:dryRun?'DRY_RUN':!enabled?'LLM_KILL_SWITCH_OFF':'NO_CALL',promptChars:prompt.length,productionAuthority:false,costGuard:{dailyMax:num(process.env.COGNITIVE_LLM_DAILY_MAX,4),cooldownHours:num(process.env.COGNITIVE_LLM_COOLDOWN_HOURS,6)}});
  if(!esc.required)return res.status(200).json({ok:true,version:'COGNITIVE-GPT-REVIEW-1',mode:'SHADOW_ADVISORY',enabled:true,called:false,model,escalation:esc,reason:'NO_ESCALATION',productionAuthority:false});
  if(!storageReady())return res.status(503).json({ok:false,error:'Storage unavailable; refusing unmetered cognitive call'});
  const today=brusselsDate(),usage=await readJson(USAGE,{date:today,count:0}),dailyMax=Math.max(1,Math.min(12,num(process.env.COGNITIVE_LLM_DAILY_MAX,4))),count=usage?.date===today?num(usage.count,0):0;
  if(count>=dailyMax)return res.status(200).json({ok:true,version:'COGNITIVE-GPT-REVIEW-1',mode:'SHADOW_ADVISORY',enabled:true,called:false,model,escalation:esc,reason:'DAILY_BUDGET_GUARD',usage:{date:today,count,dailyMax},productionAuthority:false});
  const previous=await readJson(LATEST,null),cooldown=Math.max(1,num(process.env.COGNITIVE_LLM_COOLDOWN_HOURS,6));
  if(previous?.generatedAt&&hoursSince(previous.generatedAt)<cooldown&&previous?.escalation?.reason===esc.reason)return res.status(200).json({ok:true,version:'COGNITIVE-GPT-REVIEW-1',mode:'SHADOW_ADVISORY',enabled:true,called:false,model,escalation:esc,reason:'COOLDOWN_GUARD',cooldownHours:cooldown,productionAuthority:false});
  const token=String(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||'').trim();
  if(!token)return res.status(503).json({ok:false,error:'No AI Gateway or Vercel OIDC credential available',model});
  const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'You are ARGUS Cognitive Reviewer. Evidence first. Falsify before explaining. Governance always wins.'},{role:'user',content:prompt}],stream:false,max_tokens:1200})});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`AI Gateway HTTP ${r.status}: ${describe(body,r.status)}`);
  const text=body?.choices?.[0]?.message?.content||'',review=safeParse(text),valid=Boolean(review&&typeof review==='object'&&!Array.isArray(review));
  const snapshot={version:'COGNITIVE-GPT-REVIEW-1',generatedAt:new Date().toISOString(),mode:'SHADOW_ADVISORY',enabled:true,called:true,model,escalation:esc,reviewValidJson:valid,review:valid?review:null,rawFallback:valid?null:String(text).slice(0,6000),usage:body?.usage||null,productionAuthority:false,constraints:{mayChangeProduction:false,mayUnlockPrime:false,mayChangeWeights:false,mayChangePolicies:false,mayChangeStake:false,advisoryOnly:true,governanceVeto:true},elapsedMs:Date.now()-started};
  await writeJson(LATEST,snapshot);await writeJson(`argus/cognitive/gpt/history/${Date.now()}.json`,snapshot);await writeJson(USAGE,{date:today,count:count+1,updatedAt:new Date().toISOString(),dailyMax});
  return res.status(200).json({ok:true,...snapshot});
 }catch(error){return res.status(503).json({ok:false,error:error.message,mode:'SHADOW_ADVISORY',enabled,model,productionAuthority:false,elapsedMs:Date.now()-started})}
}
