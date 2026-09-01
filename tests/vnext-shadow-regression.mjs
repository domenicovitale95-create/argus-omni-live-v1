import assert from 'node:assert/strict';
import { buildVnextShadowEnvelope, governVnextProposal, sourceAttestation, VNEXT_SHADOW_POLICY } from '../api/_vnext-shadow-policy.js';

assert.equal(VNEXT_SHADOW_POLICY.mode,'SHADOW_ONLY');
for(const key of ['productionAuthority','officialLedgerEligible','automaticPromotion','automaticRealWagering'])assert.equal(VNEXT_SHADOW_POLICY[key],false);

const safe=governVnextProposal({type:'HYPOTHESIS',statement:'Provider drift may explain the gap',evidence:['timestamp mismatch'],falsificationTest:'Compare timestamped snapshots',effect:'NONE'},{source:'TEST',sourceVersion:'1'});
assert.equal(safe.accepted,true);
assert.match(safe.proposal.id,/^[a-f0-9]{20}$/);
assert.equal(safe.proposal.productionAuthority,false);
assert.equal(safe.proposal.provenance.source,'TEST');

for(const [proposal,reason] of [
  [{type:'HYPOTHESIS',statement:'place it',selection:'HOME',effect:'NONE'},'FORBIDDEN_PRODUCTION_FIELD'],
  [{type:'EXPERIMENT_PROPOSAL',statement:'raise stake',STAKEPCT:5,effect:'NONE'},'FORBIDDEN_PRODUCTION_FIELD'],
  [{type:'PRIORITY_RECOMMENDATION',statement:'unlock',unlockPrime:true,effect:'NONE'},'FORBIDDEN_PRODUCTION_FIELD'],
  [{type:'HYPOTHESIS',statement:'nested',evidence:[{modelWeights:{market:.2}}],effect:'NONE'},'FORBIDDEN_PRODUCTION_FIELD'],
  [{type:'HYPOTHESIS',statement:'mutate',effect:'PRODUCTION_MUTATION'},'PRODUCTION_EFFECT_FORBIDDEN'],
  [{type:'BET_SELECTION',statement:'home',effect:'NONE'},'OUTPUT_TYPE_NOT_ALLOWED']
])assert.equal(governVnextProposal(proposal).reason,reason);

let deep={};let cursor=deep;for(let i=0;i<12;i++)cursor=cursor.next={};
assert.equal(governVnextProposal({type:'HYPOTHESIS',statement:'deep',metadata:deep,effect:'NONE'}).reason,'MAX_DEPTH_EXCEEDED');

const now=new Date('2026-09-01T12:00:00.000Z'),freshAt='2026-09-01T11:00:00.000Z';
const sources={cognitive:{version:'C',generatedAt:freshAt},gpt:{version:'G',generatedAt:freshAt,mode:'SHADOW_ADVISORY',productionAuthority:false,called:true,reviewValidJson:true,review:{}},governance:{version:'P',generatedAt:freshAt}};
const fresh=sourceAttestation(sources,now);assert.equal(fresh.ok,true);assert.equal(fresh.status,'FRESH');
const stale=sourceAttestation({...sources,gpt:{...sources.gpt,generatedAt:'2026-08-31T00:00:00.000Z'}},now);assert.equal(stale.ok,false);assert.equal(stale.status,'STALE_SOURCES');
const untrusted=sourceAttestation({...sources,gpt:{...sources.gpt,productionAuthority:true}},now);assert.equal(untrusted.ok,false);assert.equal(untrusted.status,'UNTRUSTED_SOURCE');

const duplicate={type:'MISSING_EVIDENCE',statement:'Need closing odds',effect:'NONE'};
const envelope=buildVnextShadowEnvelope({generatedAt:now.toISOString(),attestation:fresh,candidates:[duplicate,duplicate]});
assert.equal(envelope.mode,'SHADOW_ONLY');assert.equal(envelope.summary.accepted,1);assert.equal(envelope.summary.rejected,1);assert.equal(envelope.rejected[0].reason,'DUPLICATE_PROPOSAL');
const blocked=buildVnextShadowEnvelope({attestation:stale,candidates:[duplicate]});
assert.equal(blocked.ok,false);assert.equal(blocked.proposals.length,0);assert.equal(blocked.status,'STALE_SOURCES');
for(const key of ['mayMutateProduction','maySelectBet','mayChangeStake','mayUnlockPrime','mayChangeWeights','mayChangePolicies','mayBypassGovernance'])assert.equal(envelope.constraints[key],false);
assert.equal(envelope.constraints.governanceVeto,true);
console.log('vNext shadow regression: ok');
