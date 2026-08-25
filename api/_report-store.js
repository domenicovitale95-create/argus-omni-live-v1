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

export function storageReady() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
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
  const useCache = !String(pathname || '').startsWith('argus/ledger/');
  return readJsonInternal(pathname, fallback, useCache);
}

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

// Cursor-safe listing for integrity-sensitive consumers. The previous helper made
// one list() call and could silently expose a partial prefix when Blob pagination
// kicked in. Callers now get explicit completeness metadata and can fail closed.
export async function listJsonComplete(prefix, options = {}) {
  const maxBlobs = Math.max(1, Math.min(10000, Number(options.maxBlobs) || 5000));
  const pageSize = Math.max(1, Math.min(1000, Number(options.pageSize) || 1000));
  if (!storageReady()) return { blobs: [], complete: false, hasMore: false, pages: 0, scanned: 0, error: 'STORAGE_UNAVAILABLE' };

  const blobs = [];
  let cursor;
  let hasMore = false;
  let pages = 0;
  let scanned = 0;
  try {
    while (scanned < maxBlobs) {
      const limit = Math.min(pageSize, maxBlobs - scanned);
      const page = await list({ prefix, limit, ...(cursor ? { cursor } : {}) });
      pages += 1;
      const pageBlobs = Array.isArray(page?.blobs) ? page.blobs : [];
      scanned += pageBlobs.length;
      for (const blob of pageBlobs) if (String(blob?.pathname || '').endsWith('.json')) blobs.push(blob);
      hasMore = Boolean(page?.hasMore);
      if (!hasMore) break;
      if (!page?.cursor || pageBlobs.length === 0) {
        return { blobs, complete: false, hasMore: true, pages, scanned, error: 'PAGINATION_CURSOR_MISSING' };
      }
      cursor = page.cursor;
    }
    return {
      blobs,
      complete: !hasMore,
      hasMore,
      pages,
      scanned,
      capped: hasMore && scanned >= maxBlobs,
      error: hasMore && scanned >= maxBlobs ? 'MAX_BLOBS_REACHED' : null
    };
  } catch (error) {
    warnBlob('LIST_FAILED', prefix, error);
    return { blobs, complete: false, hasMore, pages, scanned, error: String(error?.message || error || 'LIST_FAILED') };
  }
}

export async function listJson(prefix, limit = 100) {
  const result = await listJsonComplete(prefix, { maxBlobs: Math.max(1, Number(limit) || 100) });
  return result.blobs;
}

export async function readManyJson(blobs) {
  const out = [];
  for (const blob of blobs) {
    const row = await readJson(blob.pathname, null);
    if (row) out.push(row);
  }
  return out;
}
