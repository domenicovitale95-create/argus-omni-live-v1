import { get, list, put } from '@vercel/blob';

const ACCESS = 'private';
const QUOTA_GUARD_PATH = 'argus/data/api-football-quota-guard.json';
const TEMP_ZERO_QUOTA_DATE = '2026-08-22';

function brusselsDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Operator-requested temporary safety window. It is active only on 2026-08-22
// in Europe/Brussels and therefore self-expires automatically at local midnight.
// Only reads of the provider quota guard are overridden; all other Blob reads are unchanged.
function temporaryQuotaGuard(pathname) {
  if (pathname !== QUOTA_GUARD_PATH || brusselsDate() !== TEMP_ZERO_QUOTA_DATE) return null;
  return {
    date: TEMP_ZERO_QUOTA_DATE,
    exhausted: true,
    dailyRemaining: 0,
    providerError: 'TEMPORARY_ZERO_QUOTA_WINDOW',
    observedAt: new Date().toISOString(),
    temporary: true,
    expiresAutomaticallyAt: '2026-08-23T00:00:00+02:00'
  };
}

// Vercel Blob accepts either the legacy long-lived token or the OIDC pair that
// Vercel injects for a connected private store. Requiring the complete OIDC pair
// prevents false-positive "ready" states that would otherwise fail inside the SDK.
export function storageReady() {
  const legacyReady = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const oidcReady = Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN);
  return legacyReady || oidcReady;
}

function warnBlob(operation, pathname, error) {
  console.warn('[ARGUS_BLOB]', operation, pathname || '-', String(error?.message || error || 'unknown error'));
}

async function readJsonInternal(pathname, fallback, useCache) {
  const forced = temporaryQuotaGuard(pathname);
  if (forced) return forced;
  if (!storageReady()) return fallback;
  try {
    const result = await get(pathname, { access: ACCESS, useCache });
    if (!result || result.statusCode !== 200 || !result.stream) return fallback;
    const text = await new Response(result.stream).text();
    try { return JSON.parse(text); } catch (_) { return fallback; }
  } catch (error) {
    warnBlob('READ_FAILED', pathname, error);
    return fallback;
  }
}

export async function readJson(pathname, fallback = null) {
  // Prediction-ledger rows are mutable safety-critical coordination state until
  // kickoff/settlement. Never serve a stale CDN copy to bankroll or settlement
  // consumers; other report reads keep the normal cached path.
  const useCache = !String(pathname || '').startsWith('argus/ledger/');
  return readJsonInternal(pathname, fallback, useCache);
}

// Safety-critical mutable state (heartbeats, quota guards, recovery state) must
// observe the latest Blob version instead of the CDN copy. Keep ordinary reads
// cached so ARGUS does not pay the latency/cost penalty everywhere.
export async function readJsonFresh(pathname, fallback = null) {
  return readJsonInternal(pathname, fallback, false);
}

export async function writeJson(pathname, value) {
  if (!storageReady()) throw new Error('Vercel Blob storage credentials are unavailable');
  return put(pathname, JSON.stringify(value, null, 2), {
    access: ACCESS,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });
}

export async function listJson(prefix, limit = 100) {
  if (!storageReady()) return [];
  try {
    const { blobs } = await list({ prefix, limit });
    return (blobs || []).filter((b) => b.pathname.endsWith('.json'));
  } catch (error) {
    warnBlob('LIST_FAILED', prefix, error);
    return [];
  }
}

export async function readManyJson(blobs) {
  const out = [];
  for (const blob of blobs) {
    const row = await readJson(blob.pathname, null);
    if (row) out.push(row);
  }
  return out;
}
