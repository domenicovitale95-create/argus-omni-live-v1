import fs from 'node:fs';

const requiredFiles = [
  'ARGUS_PERFECTION_DIRECTIVE.md',
  'ARGUS_MAXIMUM_PERFORMANCE_ROADMAP.md',
  'ARGUS_EXTERNAL_BENCHMARK_PROTOCOL.md',
  'DEPLOYMENT_READINESS_CHECKLIST.md',
  'scripts/verify-integration.mjs',
  'scripts/verify-golden-fixtures.mjs',
  'api/deployment-verifier.js',
  'vercel.json'
];

const failures = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`missing:${file}`);
}

function mustContain(file, needles) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${file}:missing:${needle}`);
  }
}

mustContain('api/deployment-verifier.js', [
  'readOnlyChecks:true',
  'providerQuotaSpendAllowed:false',
  'automaticRollback:false',
  'automaticPromotion:false',
  'mutatingEndpointsExcluded:true'
]);

mustContain('DEPLOYMENT_READINESS_CHECKLIST.md', [
  'Frozen predictions and settlements remain immutable',
  'READY_FOR_REVIEW',
  'Human approval remains required',
  'previous known-good production commit/deployment'
]);

if (fs.existsSync('vercel.json')) {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const crons = Array.isArray(config.crons) ? config.crons : [];
  if (!crons.some(c => String(c.path || '').startsWith('/api/deployment-verifier'))) {
    failures.push('vercel.json:missing deployment-verifier cron');
  }
}

const result = {
  gate: 'ARGUS_DEPLOYMENT_READINESS',
  status: failures.length ? 'BLOCKED' : 'READY_FOR_REVIEW',
  checks: requiredFiles.length + 10,
  failures,
  policy: {
    productionPromotionAuthorized: false,
    humanApprovalRequired: true,
    frozenHistoryMutable: false,
    providerQuotaSpend: false
  }
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
