import assert from 'node:assert/strict';
import handler from '../api/autopilot.js';

const originalFetch = globalThis.fetch;
const originalCronSecret = process.env.CRON_SECRET;
const originalProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

try {
  process.env.CRON_SECRET = '';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'argus-test.local';

  const calls = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);

    if (value.endsWith('/api/decision-scheduler')) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (value.endsWith('/api/live')) {
      return new Response(JSON.stringify({ error: 'provider temporarily unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${value}`);
  };

  let statusCode = null;
  let body = null;
  const req = { method: 'GET', headers: {} };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  await handler(req, res);

  assert.equal(statusCode, 200, 'transient /api/live outage must not become autopilot 500');
  assert.equal(body?.ok, true);
  assert.equal(body?.skipped, true);
  assert.equal(body?.retryable, true);
  assert.equal(body?.reason, 'LIVE_TEMPORARILY_UNAVAILABLE');
  assert.equal(body?.upstreamStatus, 503);
  assert.ok(calls.some((url) => url.endsWith('/api/live')), 'autopilot must attempt /api/live');

  console.log('PASS autopilot transient live outage degrades cleanly');
} finally {
  globalThis.fetch = originalFetch;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
  if (originalProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = originalProductionUrl;
}
