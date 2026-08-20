import fs from 'node:fs';
import path from 'node:path';
import { uncertaintyBand, uniquePenalty, promotionEvidence, GOVERNANCE_VERSION } from '../api/_governance-core.js';
import { auditPredictionDoc, auditMarketDoc, auditReports } from '../api/temporal-integrity.js';
import { auditPredictionDoc as auditDataPredictionDoc, auditMarketDoc as auditDataMarketDoc, provenanceCoverage } from '../api/data-integrity.js';

const ROOT = process.cwd();
const governanceFile = path.join(ROOT, 'tests/golden-governance.json');
const temporalFile = path.join(ROOT, 'tests/golden-temporal-integrity.json');
const dataIntegrityFile = path.join(ROOT, 'tests/golden-data-integrity.json');
const golden = JSON.parse(fs.readFileSync(governanceFile, 'utf8'));
const temporal = JSON.parse(fs.readFileSync(temporalFile, 'utf8'));
const dataIntegrity = JSON.parse(fs.readFileSync(dataIntegrityFile, 'utf8'));
const failures = [];

function fail(message) { failures.push(message); }
function sameArray(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

for (const row of golden.uncertaintyBands || []) {
  const got = uncertaintyBand(row.score);
  if (got.status !== row.status || got.penalty !== row.penalty || got.hardBlock !== row.hardBlock) {
    fail(`uncertaintyBand(${row.score}) expected ${row.status}/${row.penalty}/${row.hardBlock} got ${got.status}/${got.penalty}/${got.hardBlock}`);
  }
}

const up = golden.uniquePenalty;
if (up) {
  const got = uniquePenalty(up.parts || []);
  const acceptedKeys = got.accepted.map(x => x.key);
  const duplicateKeys = got.duplicates.map(x => x.key);
  if (got.total !== up.total) fail(`uniquePenalty total expected ${up.total} got ${got.total}`);
  if (!sameArray(acceptedKeys, up.acceptedKeys)) fail(`uniquePenalty accepted keys expected ${JSON.stringify(up.acceptedKeys)} got ${JSON.stringify(acceptedKeys)}`);
  if (!sameArray(duplicateKeys, up.duplicateKeys)) fail(`uniquePenalty duplicate keys expected ${JSON.stringify(up.duplicateKeys)} got ${JSON.stringify(duplicateKeys)}`);
}

for (const row of golden.promotionEvidence || []) {
  const got = promotionEvidence(row.input || {});
  if (got.ready !== row.ready) fail(`promotionEvidence ${row.name} expected ready=${row.ready} got ${got.ready}; checks=${JSON.stringify(got.checks)}`);
}

for (const testCase of temporal.cases || []) {
  const issues = [];
  for (const doc of testCase.predictionDocs || []) auditPredictionDoc(doc, issues);
  for (const doc of testCase.marketDocs || []) auditMarketDoc(doc, issues);
  auditReports(testCase.reports || [], issues);
  const got = issues.map(x => `${x.severity}:${x.code}`).sort();
  const expected = [...(testCase.expected || [])].sort();
  if (!sameArray(got, expected)) fail(`temporal ${testCase.name} expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`);
}

for (const testCase of dataIntegrity.cases || []) {
  const issues = [], coverage = { snapshots: 0, withSource: 0, withSourceTimestamp: 0 };
  for (const doc of testCase.predictionDocs || []) auditDataPredictionDoc(doc, issues, coverage);
  for (const doc of testCase.marketDocs || []) auditDataMarketDoc(doc, issues, coverage);
  const gotIssues = issues.map(x => `${x.severity}:${x.code}`).sort();
  const expectedIssues = [...(testCase.expectedIssues || [])].sort();
  if (!sameArray(gotIssues, expectedIssues)) fail(`data-integrity ${testCase.name} expected issues ${JSON.stringify(expectedIssues)} got ${JSON.stringify(gotIssues)}`);
  const gotCoverage = provenanceCoverage(coverage), expected = testCase.expectedProvenance || {};
  for (const key of ['snapshots','sourceCoveragePct','sourceTimestampCoveragePct']) if (gotCoverage[key] !== expected[key]) fail(`data-integrity ${testCase.name} expected ${key}=${expected[key]} got ${gotCoverage[key]}`);
}

console.log(`ARGUS golden governance verification — ${golden.version} against ${GOVERNANCE_VERSION}`);
console.log(`ARGUS golden temporal verification — ${temporal.version}`);
console.log(`ARGUS golden data-integrity verification — ${dataIntegrity.version}`);
if (failures.length) {
  for (const message of failures) console.error(`FAIL ${message}`);
  process.exit(1);
}
console.log(`OK  ${golden.uncertaintyBands?.length || 0} uncertainty boundary fixture(s)`);
console.log('OK  unique penalty deduplication invariant');
console.log(`OK  ${golden.promotionEvidence?.length || 0} promotion hard-gate fixture(s)`);
console.log(`OK  ${temporal.cases?.length || 0} temporal integrity fixture(s)`);
console.log(`OK  ${dataIntegrity.cases?.length || 0} data integrity/provenance fixture(s)`);
console.log('OK  deterministic governance, temporal and data-integrity golden fixtures passed');
