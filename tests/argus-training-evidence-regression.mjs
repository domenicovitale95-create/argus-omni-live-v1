import assert from 'node:assert/strict';
import { qualify } from '../api/training-bets-v1.js';

const now=Date.now();
const candidate={odds:2.5,probability:.46,edgePct:4,evPct:15,dataQuality:75,marketType:'1X2',selection:'HOME'};
const row={isLive:false,betEligible:false,finalVerdict:'NO BET',kickoff:new Date(now+7200000).toISOString(),eligibilityCandidate:candidate,netConfidence:55,dataQuality:75,eligibilityIssues:[]};
function check(patch,expected,reason){
 const current={...row,...patch};
 const got=qualify(current,now);
 assert.equal(got.ok,expected,'Unexpected result '+JSON.stringify(got));
 if(reason)assert.equal(got.reason,reason);
}
check({},true);
check({netConfidence:24},false,'CONFIDENCE_BELOW_TRAINING_FLOOR');
check({dataQuality:55},false,'QUALITY_BELOW_TRAINING_FLOOR');
check({eligibilityCandidate:{...candidate,probability:.31,evPct:5,odds:3.4}},false,'LOW_WIN_PROBABILITY_FOR_EVIDENCE_FIRST_COHORT');
check({eligibilityCandidate:{...candidate,edgePct:.9}},false,'EDGE_BELOW_TRAINING_FLOOR');
check({eligibilityCandidate:{...candidate,evPct:2}},false,'EV_BELOW_TRAINING_FLOOR');
check({eligibilityCandidate:{...candidate,evPct:20}},false,'ENTRY_PROBABILITY_ODDS_EV_INCONSISTENT');
check({eligibilityIssues:['EVIDENCE_STALE_OR_WEAK']},false,'EVIDENCE_STALE_OR_WEAK');
check({betEligible:true},false,'OFFICIAL_ACTIONABLE_NOT_DUPLICATED');
check({kickoff:new Date(now-1000).toISOString()},false,'MATCH_STARTED_OR_INVALID_KICKOFF');
console.log('ARGUS training evidence-first regression: OK');
