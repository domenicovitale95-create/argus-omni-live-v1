import { readJson, storageReady } from './_report-store.js';
import { buildVnextShadowEnvelope, sourceAttestation, VNEXT_SHADOW_POLICY } from './_vnext-shadow-policy.js';

const PATHS={cognitive:'argus/cognitive/latest.json',gpt:'argus/cognitive/gpt/latest.json',governance:'argus/governance/latest.json'};
function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return Boolean(secret)&&req.headers.authorization===`Bearer ${secret}`}
function clean(value){return typeof value==='string'?value.trim():''}
function proposalsFrom(gpt){
  const review=gpt?.review||{},out=[],context={source:'COGNITIVE_GPT_REVIEW',sourceVersion:gpt?.version||null,observedAt:gpt?.generatedAt||null};
  for(const row of Array.isArray(review.rootCauseHypotheses)?review.rootCauseHypotheses:[])out.push({type:'HYPOTHESIS',statement:clean(row?.claim),evidence:[...(Array.isArray(row?.evidenceFor)?row.evidenceFor:[]),...(Array.isArray(row?.evidenceAgainst)?row.evidenceAgainst:[])],falsificationTest:clean(row?.falsificationTest),effect:'NONE',_context:context});
  for(const row of Array.isArray(review.experiments)?review.experiments:[])out.push({type:'EXPERIMENT_PROPOSAL',statement:clean(row?.name),falsificationTest:clean(row?.deterministicCheck),successCriterion:clean(row?.successCriterion),stopCriterion:clean(row?.stopCriterion),effect:'NONE',_context:context});
  for(const row of Array.isArray(review.missingEvidence)?review.missingEvidence:[])out.push({type:'MISSING_EVIDENCE',statement:clean(row),effect:'NONE',_context:context});
  for(const row of Array.isArray(review.priorityAssessment)?review.priorityAssessment:[])out.push({type:'PRIORITY_RECOMMENDATION',statement:`${clean(row?.code)||'UNKNOWN'}: ${clean(row?.action)||'KEEP'} — ${clean(row?.reason)}`,effect:'NONE',_context:context});
  return{out,context};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'");
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({ok:false,version:VNEXT_SHADOW_POLICY.version,mode:'SHADOW_ONLY',status:'STORAGE_UNAVAILABLE',error:'Storage unavailable',productionAuthority:false});
  const [cognitive,gpt,governance]=await Promise.all(Object.values(PATHS).map(path=>readJson(path,null)));
  const sources={cognitive,gpt,governance},attestation=sourceAttestation(sources),{out:candidates,context}=proposalsFrom(attestation.details.gpt.trustedAdvisory?gpt:null);
  const envelope=buildVnextShadowEnvelope({candidates,context,attestation,sourceVersions:{cognitive:cognitive?.version||null,gpt:gpt?.version||null,governance:governance?.version||null}});
  return res.status(200).json({...envelope,readOnly:true,providerCalls:0,llmCalls:0,bookmakerCalls:0,persistentWrites:0,doctrine:'VNEXT MAY OBSERVE, QUESTION AND PROPOSE TESTS. IT MAY NOT ACT.'});
}
