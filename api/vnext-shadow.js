import { readJson, storageReady } from './_report-store.js';
import { buildVnextShadowEnvelope, VNEXT_SHADOW_POLICY } from './_vnext-shadow-policy.js';

const COGNITIVE='argus/cognitive/latest.json';
const GPT='argus/cognitive/gpt/latest.json';
const GOVERNANCE='argus/governance/latest.json';

function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return Boolean(secret)&&req.headers.authorization===`Bearer ${secret}`}
function proposalsFrom(gpt){
  const review=gpt?.review||{},out=[];
  for(const row of review.rootCauseHypotheses||[])out.push({type:'HYPOTHESIS',statement:row.claim,evidence:[...(row.evidenceFor||[]),...(row.evidenceAgainst||[])],falsificationTest:row.falsificationTest,effect:'NONE'});
  for(const row of review.experiments||[])out.push({type:'EXPERIMENT_PROPOSAL',statement:row.name,falsificationTest:row.deterministicCheck,successCriterion:row.successCriterion,stopCriterion:row.stopCriterion,effect:'NONE'});
  for(const row of review.missingEvidence||[])out.push({type:'MISSING_EVIDENCE',statement:row,effect:'NONE'});
  for(const row of review.priorityAssessment||[])out.push({type:'PRIORITY_RECOMMENDATION',statement:`${row.code||'UNKNOWN'}: ${row.action||'KEEP'} — ${row.reason||''}`,effect:'NONE'});
  return out;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({ok:false,version:VNEXT_SHADOW_POLICY.version,mode:'SHADOW_ONLY',error:'Storage unavailable',productionAuthority:false});
  const [cognitive,gpt,governance]=await Promise.all([readJson(COGNITIVE,null),readJson(GPT,null),readJson(GOVERNANCE,null)]);
  const envelope=buildVnextShadowEnvelope({
    candidates:proposalsFrom(gpt),
    sourceVersions:{cognitive:cognitive?.version||null,gpt:gpt?.version||null,governance:governance?.version||null}
  });
  return res.status(200).json({...envelope,readOnly:true,sourceFreshness:{cognitiveAt:cognitive?.generatedAt||null,gptAt:gpt?.generatedAt||null,governanceAt:governance?.generatedAt||null},doctrine:'VNEXT MAY OBSERVE, QUESTION AND PROPOSE TESTS. IT MAY NOT ACT.'});
}
