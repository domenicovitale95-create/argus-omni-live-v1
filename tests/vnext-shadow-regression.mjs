import assert from 'node:assert/strict';
import { buildVnextShadowEnvelope, governVnextProposal, VNEXT_SHADOW_POLICY } from '../api/_vnext-shadow-policy.js';

assert.equal(VNEXT_SHADOW_POLICY.mode,'SHADOW_ONLY');
assert.equal(VNEXT_SHADOW_POLICY.productionAuthority,false);
assert.equal(VNEXT_SHADOW_POLICY.officialLedgerEligible,false);
assert.equal(VNEXT_SHADOW_POLICY.automaticPromotion,false);
assert.equal(VNEXT_SHADOW_POLICY.automaticRealWagering,false);

const safe=governVnextProposal({type:'HYPOTHESIS',statement:'Provider drift may explain the gap',falsificationTest:'Compare timestamped provider snapshots',effect:'NONE'});
assert.equal(safe.accepted,true);
assert.equal(safe.proposal.productionAuthority,false);
assert.equal(safe.proposal.officialLedgerEligible,false);

for(const proposal of [
  {type:'HYPOTHESIS',statement:'place it',selection:'HOME',effect:'NONE'},
  {type:'EXPERIMENT_PROPOSAL',statement:'raise stake',stakePct:5,effect:'NONE'},
  {type:'PRIORITY_RECOMMENDATION',statement:'unlock',unlockPrime:true,effect:'NONE'},
  {type:'HYPOTHESIS',statement:'mutate',effect:'PRODUCTION_MUTATION'},
  {type:'BET_SELECTION',statement:'home',effect:'NONE'}
])assert.equal(governVnextProposal(proposal).accepted,false);

const envelope=buildVnextShadowEnvelope({generatedAt:'2026-09-01T00:00:00.000Z',candidates:[
  {type:'MISSING_EVIDENCE',statement:'Need closing odds',effect:'NONE'},
  {type:'HYPOTHESIS',statement:'Forbidden nested field',evidence:[{modelWeights:{market:0.2}}],effect:'NONE'}
]});
assert.equal(envelope.mode,'SHADOW_ONLY');
assert.equal(envelope.summary.accepted,1);
assert.equal(envelope.summary.rejected,1);
assert.equal(envelope.constraints.mayMutateProduction,false);
assert.equal(envelope.constraints.governanceVeto,true);
console.log('vNext shadow regression: ok');
