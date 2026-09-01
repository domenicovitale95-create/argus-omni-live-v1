import { createHash } from 'node:crypto';

export const VNEXT_SHADOW_POLICY=Object.freeze({
  version:'ARGUS-VNEXT-SHADOW-2',
  mode:'SHADOW_ONLY',
  productionAuthority:false,
  officialLedgerEligible:false,
  automaticPromotion:false,
  automaticRealWagering:false,
  maxCandidates:50,
  maxAccepted:20,
  maxDepth:8,
  maxNodes:500,
  sourceMaxAgeMinutes:Object.freeze({cognitive:390,gpt:390,governance:390}),
  allowedOutputs:Object.freeze(['HYPOTHESIS','MISSING_EVIDENCE','DETERMINISTIC_TEST','EXPERIMENT_PROPOSAL','PRIORITY_RECOMMENDATION']),
  forbiddenEffects:Object.freeze(['BET_SELECTION','STAKE_CHANGE','PRIME_UNLOCK','MODEL_WEIGHT_CHANGE','POLICY_CHANGE','GOVERNANCE_BYPASS','OFFICIAL_LEDGER_WRITE','PRODUCTION_MUTATION'])
});

const forbiddenKeys=new Set(['selection','stake','stakepct','stakeamount','prime','unlockprime','modelweight','modelweights','policymutation','productionmutation','officialledgerwrite','bet','wager','oddsadjustment']);
const poisonKeys=new Set(['__proto__','prototype','constructor']);
const text=v=>String(v??'').trim();
const upper=v=>text(v).toUpperCase();
const plainObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;

function inspect(value,state={nodes:0},depth=0){
  state.nodes++;
  if(state.nodes>VNEXT_SHADOW_POLICY.maxNodes)return'MAX_NODES_EXCEEDED';
  if(depth>VNEXT_SHADOW_POLICY.maxDepth)return'MAX_DEPTH_EXCEEDED';
  if(Array.isArray(value)){for(const item of value){const reason=inspect(item,state,depth+1);if(reason)return reason}return null}
  if(value&&typeof value==='object'){
    if(!plainObject(value))return'NON_PLAIN_OBJECT';
    for(const [key,item] of Object.entries(value)){
      const normalized=key.toLowerCase();
      if(poisonKeys.has(normalized))return'UNSAFE_OBJECT_KEY';
      if(forbiddenKeys.has(normalized))return'FORBIDDEN_PRODUCTION_FIELD';
      const reason=inspect(item,state,depth+1);if(reason)return reason;
    }
  }
  return null;
}
function normalizedType(value){const type=upper(value);return VNEXT_SHADOW_POLICY.allowedOutputs.includes(type)?type:null}
function cleanStrings(value,limit=12,maxLength=500){return Array.isArray(value)?value.filter(v=>typeof v==='string').map(text).filter(Boolean).slice(0,limit).map(v=>v.slice(0,maxLength)):[]}
function idFor(proposal){return createHash('sha256').update(JSON.stringify([proposal.type,proposal.statement,proposal.falsificationTest])).digest('hex').slice(0,20)}
function validDate(value){const time=new Date(value||0).getTime();return Number.isFinite(time)&&time>0?time:null}

export function sourceAttestation(sources={},now=new Date()){
  const nowMs=now.getTime(),details={};let missing=0,stale=0,invalid=0;
  for(const name of ['cognitive','gpt','governance']){
    const source=sources?.[name],generatedMs=validDate(source?.generatedAt),ageMinutes=generatedMs==null?null:Math.max(0,(nowMs-generatedMs)/60000),maxAgeMinutes=VNEXT_SHADOW_POLICY.sourceMaxAgeMinutes[name];
    let status='FRESH';
    if(!source){status='MISSING';missing++}
    else if(generatedMs==null){status='INVALID_TIMESTAMP';invalid++}
    else if(ageMinutes>maxAgeMinutes){status='STALE';stale++}
    details[name]={status,version:source?.version||null,generatedAt:source?.generatedAt||null,ageMinutes:ageMinutes==null?null:Number(ageMinutes.toFixed(1)),maxAgeMinutes};
  }
  const gpt=sources?.gpt,gptTrusted=Boolean(gpt&&gpt.mode==='SHADOW_ADVISORY'&&gpt.productionAuthority===false&&gpt.called===true&&gpt.reviewValidJson===true&&plainObject(gpt.review));
  details.gpt={...details.gpt,trustedAdvisory:gptTrusted};
  if(gpt&&!gptTrusted)invalid++;
  return{ok:missing===0&&stale===0&&invalid===0,status:missing?'WAITING_FOR_SOURCES':invalid?'UNTRUSTED_SOURCE':stale?'STALE_SOURCES':'FRESH',missing,stale,invalid,details};
}

export function governVnextProposal(candidate,context={}){
  if(!plainObject(candidate))return{accepted:false,reason:'INVALID_PROPOSAL',proposal:null};
  const structuralReason=inspect(candidate);if(structuralReason)return{accepted:false,reason:structuralReason,proposal:null};
  const type=normalizedType(candidate.type);if(!type)return{accepted:false,reason:'OUTPUT_TYPE_NOT_ALLOWED',proposal:null};
  const effect=upper(candidate.effect||'NONE');
  if(effect!=='NONE'||VNEXT_SHADOW_POLICY.forbiddenEffects.includes(effect))return{accepted:false,reason:'PRODUCTION_EFFECT_FORBIDDEN',proposal:null};
  const statement=text(candidate.statement||candidate.claim||candidate.name);
  if(!statement)return{accepted:false,reason:'EMPTY_PROPOSAL',proposal:null};
  const proposal={
    type,statement:statement.slice(0,1200),
    evidence:cleanStrings(candidate.evidence),
    falsificationTest:text(candidate.falsificationTest||candidate.deterministicCheck).slice(0,1200)||null,
    successCriterion:text(candidate.successCriterion).slice(0,800)||null,
    stopCriterion:text(candidate.stopCriterion).slice(0,800)||null,
    effect:'NONE',productionAuthority:false,officialLedgerEligible:false,
    provenance:{source:text(context.source||'VNEXT_SHADOW').slice(0,80),sourceVersion:text(context.sourceVersion).slice(0,120)||null,observedAt:text(context.observedAt).slice(0,40)||null}
  };
  proposal.id=idFor(proposal);
  return{accepted:true,reason:'SHADOW_ACCEPTED',proposal};
}

export function buildVnextShadowEnvelope(input={}){
  const candidates=Array.isArray(input.candidates)?input.candidates.slice(0,VNEXT_SHADOW_POLICY.maxCandidates):[],accepted=[],rejected=[],seen=new Set();
  candidates.forEach((candidate,index)=>{
    const result=governVnextProposal(candidate,input.context||{});
    if(!result.accepted){rejected.push({index,reason:result.reason});return}
    if(seen.has(result.proposal.id)){rejected.push({index,reason:'DUPLICATE_PROPOSAL'});return}
    seen.add(result.proposal.id);
    if(accepted.length>=VNEXT_SHADOW_POLICY.maxAccepted){rejected.push({index,reason:'ACCEPTED_LIMIT_REACHED'});return}
    accepted.push(result.proposal);
  });
  const attestation=input.attestation||null,sourceBlocked=Boolean(attestation&&!attestation.ok);
  return{
    ok:!sourceBlocked,version:VNEXT_SHADOW_POLICY.version,generatedAt:input.generatedAt||new Date().toISOString(),mode:VNEXT_SHADOW_POLICY.mode,status:sourceBlocked?attestation.status:'HEALTHY',productionAuthority:false,
    sourceVersions:plainObject(input.sourceVersions)?input.sourceVersions:{},sourceAttestation:attestation,
    summary:{received:Array.isArray(input.candidates)?input.candidates.length:0,processed:candidates.length,accepted:sourceBlocked?0:accepted.length,rejected:rejected.length,truncated:Math.max(0,(input.candidates?.length||0)-candidates.length)},
    proposals:sourceBlocked?[]:accepted,rejected:sourceBlocked?[...rejected,{index:null,reason:'SOURCE_ATTESTATION_FAILED'}]:rejected,
    constraints:{officialLedgerEligible:false,maySelectBet:false,mayChangeStake:false,mayUnlockPrime:false,mayChangeWeights:false,mayChangePolicies:false,mayBypassGovernance:false,mayMutateProduction:false,automaticPromotion:false,automaticRealWagering:false,governanceVeto:true}
  };
}
