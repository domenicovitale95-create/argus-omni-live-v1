import assert from 'node:assert/strict';
import { marketReadiness } from '../api/paper-learning.js';

const collecting=marketReadiness({BTTS:{sample:12,roiPct:4,calibrationGapPct:2,brier:.2}}).BTTS;
assert.equal(collecting.status,'COLLECTING');
assert.equal(collecting.remainingToReview,48);
assert.equal(collecting.actionableInProduction,false);

const quarantined=marketReadiness({TOTAL_GOALS:{sample:20,roiPct:-12,calibrationGapPct:3,brier:.2}}).TOTAL_GOALS;
assert.equal(quarantined.status,'QUARANTINED');
assert.equal(quarantined.eligibleForGovernanceReview,false);

const weak=marketReadiness({DOUBLE_CHANCE:{sample:60,roiPct:2,calibrationGapPct:7,brier:.2}}).DOUBLE_CHANCE;
assert.equal(weak.status,'INSUFFICIENT_QUALITY');

const ready=marketReadiness({DOUBLE_CHANCE:{sample:75,roiPct:3.2,calibrationGapPct:3.5,brier:.19}}).DOUBLE_CHANCE;
assert.equal(ready.status,'REVIEW_READY');
assert.equal(ready.eligibleForGovernanceReview,true);
assert.equal(ready.actionableInProduction,false);

console.log('market readiness regression: ok');
