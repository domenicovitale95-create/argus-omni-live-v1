export const VNEXT_SHADOW_POLICY=Object.freeze({
  version:'ARGUS-VNEXT-SHADOW-1',
  mode:'SHADOW_ONLY',
  productionAuthority:false,
  officialLedgerEligible:false,
  automaticPromotion:false,
  automaticRealWagering:false,
  allowedOutputs:Object.freeze(['HYPOTHESIS','MISSING_EVIDENCE','DETERMINISTIC_TEST','EXPERIMENT_PROPOSAL','PRIORITY_RECOMMENDATION']),
  forbiddenEffects:Object.freeze(['BET_SELECTION','STAKE_CHANGE','PRIME_UNLOCK','MODEL_WEIGHT_CHANGE','POLICY_CHANGE','GOVERNANCE_BYPASS','OFFICIAL_LEDGER_WRITE','PRODUCTION_MUTATION'])
});

const forbiddenKeys=new Set(['selection','stake','stakePct','stakeAmount','prime','unlockPrime','modelWeight','modelWeights','policyMutation','productionMutation','officialLedgerWrite']);
const text=v=>String(v??'').trim();
const upper=v=>text(v).toUpperCase();

function plainObject(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)}
function containsForbiddenKey(value){
  if(Array.isArray(value))return value.some(containsForbiddenKey);
  if(!plainObject(value))return false;
  return Object.entries(value).some(([key,item])=>forbiddenKeys.has(key)||containsForbiddenKey(item));
}
function normalizedType(value){const type=upper(value);return VNEXT_SHADOW_POLICY.allowedOutputs.includes(type)?type:null}

export function governVnextProposal(candidate){
  if(!plainObject(candidate))return{accepted:false,reason:'INVALID_PROPOSAL',proposal:null};
  const type=normalizedType(candidate.type);
  if(!type)return{accepted:false,reason:'OUTPUT_TYPE_NOT_ALLOWED',proposal:null};
  const effect=upper(candidate.effect||'NONE');
  if(effect!=='NONE'||VNEXT_SHADOW_POLICY.forbiddenEffects.includes(effect))return{accepted:false,reason:'PRODUCTION_EFFECT_FORBIDDEN',proposal:null};
  if(containsForbiddenKey(candidate))return{accepted:false,reason:'FORBIDDEN_PRODUCTION_FIELD',proposal:null};
  const statement=text(candidate.statement||candidate.claim||candidate.name);
  if(!statement)return{accepted:false,reason:'EMPTY_PROPOSAL',proposal:null};
  return{accepted:true,reason:'SHADOW_ACCEPTED',proposal:{
    type,
    statement:statement.slice(0,1200),
    evidence:Array.isArray(candidate.evidence)?candidate.evidence.map(text).filter(Boolean).slice(0,12):[],
    falsificationTest:text(candidate.falsificationTest||candidate.deterministicCheck).slice(0,1200)||null,
    successCriterion:text(candidate.successCriterion).slice(0,800)||null,
    stopCriterion:text(candidate.stopCriterion).slice(0,800)||null,
    effect:'NONE',
    productionAuthority:false,
    officialLedgerEligible:false
  }};
}

export function buildVnextShadowEnvelope(input={}){
  const candidates=Array.isArray(input.candidates)?input.candidates:[],accepted=[],rejected=[];
  candidates.forEach((candidate,index)=>{const result=governVnextProposal(candidate);(result.accepted?accepted:rejected).push(result.accepted?result.proposal:{index,reason:result.reason});});
  return{
    ok:true,
    version:VNEXT_SHADOW_POLICY.version,
    generatedAt:input.generatedAt||new Date().toISOString(),
    mode:VNEXT_SHADOW_POLICY.mode,
    productionAuthority:false,
    sourceVersions:plainObject(input.sourceVersions)?input.sourceVersions:{},
    summary:{received:candidates.length,accepted:accepted.length,rejected:rejected.length},
    proposals:accepted,
    rejected,
    constraints:{
      officialLedgerEligible:false,
      maySelectBet:false,
      mayChangeStake:false,
      mayUnlockPrime:false,
      mayChangeWeights:false,
      mayChangePolicies:false,
      mayBypassGovernance:false,
      mayMutateProduction:false,
      automaticPromotion:false,
      automaticRealWagering:false,
      governanceVeto:true
    }
  };
}
