import { get, list, put } from '@vercel/blob';

const ACCESS = 'private';

// New Vercel Blob stores use OIDC/system credentials rather than a
// long-lived BLOB_READ_WRITE_TOKEN. BLOB_STORE_ID is injected when the
// private store is linked to the project. Keep legacy-token compatibility.
export function storageReady() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readJson(pathname, fallback = null) {
  if (!storageReady()) return fallback;
  const result = await get(pathname, { access: ACCESS });
  if (!result || result.statusCode !== 200 || !result.stream) return fallback;
  const text = await new Response(result.stream).text();
  try { return JSON.parse(text); } catch (_) { return fallback; }
}

export async function writeJson(pathname, value) {
  if (!storageReady()) throw new Error('Vercel Blob storage is not linked to this project');
  return put(pathname, JSON.stringify(value), {
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
