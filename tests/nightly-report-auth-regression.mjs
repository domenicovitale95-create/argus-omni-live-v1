import assert from 'node:assert/strict';
import { reportAuthorization } from '../api/_cron-auth.js';

const cronRequest={headers:{authorization:'Bearer scheduler-secret'}};

assert.equal(
  reportAuthorization(cronRequest,{}),
  'Bearer scheduler-secret',
  'Daily cron must preserve the scheduler token when REPORT_CRON_SECRET is not configured.'
);

assert.equal(
  reportAuthorization(cronRequest,{REPORT_CRON_SECRET:'report-secret'}),
  'Bearer report-secret',
  'Daily report calls must use REPORT_CRON_SECRET when the report endpoint has a dedicated secret.'
);

assert.equal(
  reportAuthorization({headers:{}},{REPORT_CRON_SECRET:'  report-secret  '}),
  'Bearer report-secret',
  'Dedicated report credentials must be normalized before forwarding.'
);

assert.equal(
  reportAuthorization({headers:{}},{}),
  '',
  'No authorization header is emitted when neither credential exists.'
);

console.log('nightly report auth regression: ok');
