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

// New Vercel Blob stores use OIDC/system credentials rather than a
// long-lived BLOB_READ_WRITE_TOKEN. BLOB_STORE_ID is injected when the
// private store is linked to the project. Keep legacy-token compatibility.
export function storageReady() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

async function readJsonInternal(pathname, fallback, useCache) {
  const forced = temporaryQuotaGuard(pathname);
  if (forced) return forced;
  if (!storageReady()) return fallback;
  const result = await get(pathname, { access: ACCESS, useCache });
  if (!result || result.statusCode !== 200 || !result.stream) return fallback;
  const text = await new Response(result.stream).text();
  try { return JSON.parse(text); } catch (_) { return fallback; }
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
  if (!storageReady()) throw new Error('Vercel Blob storage is not linked to this project');
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
  const { blobs } = await list({ prefix, limit });
  return (blobs || []).filter((b) => b.pathname.endsWith('.json'));
}

export async function readManyJson(blobs) {
  const out = [];
  for (const blob of blobs) {
    const row = await readJson(blob.pathname, null);
    if (row) out.push(row);
  }
  return out;
}
