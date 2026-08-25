import { listJsonComplete, readManyJson } from './_report-store.js';

export const LEDGER_PREFIX = 'argus/ledger/';
const SETTLED = new Set(['WIN', 'LOSS']);
const ACTIONABLE = (r) => Number(r?.recommendedStakePct || 0) > 0;

function canonicalSelection(rec) {
  if (rec?.selection) return String(rec.selection);
  if (Array.isArray(rec?.candidateMarkets) && rec.candidateMarkets.length) {
    const first = rec.candidateMarkets[0];
    return String(first?.selection || first?.selectionKey || first?.market || '');
  }
  return '';
}

function stableKey(rec, sourcePath, index) {
  const id = String(rec?.id || '').trim();
  if (id) return `id:${id}`;
  const fixture = String(rec?.fixtureId ?? '').trim();
  const published = String(rec?.publishedAt || rec?.capturedAt || '').trim();
  const selection = canonicalSelection(rec);
  if (fixture && published) return `material:${fixture}|${published}|${selection}`;
  return `source:${sourcePath}|${index}`;
}

export function summarizeCanonicalRows(rows) {
  const settled = rows.filter((r) => SETTLED.has(String(r?.settlement?.status || '').toUpperCase()));
  const wins = settled.filter((r) => String(r?.settlement?.status || '').toUpperCase() === 'WIN').length;
  const losses = settled.length - wins;
  const pending = rows.filter((r) => String(r?.settlement?.status || '').toUpperCase() === 'PENDING').length;
  const voids = rows.filter((r) => String(r?.settlement?.status || '').toUpperCase() === 'VOID').length;
  const multiMarket = rows.filter((r) => Array.isArray(r?.candidateMarkets) && r.candidateMarkets.length > 1).length;
  const actionableSettled = settled.filter(ACTIONABLE);
  const actionableWins = actionableSettled.filter((r) => String(r?.settlement?.status || '').toUpperCase() === 'WIN').length;
  const pricedSettled = actionableSettled.filter((r) => Number.isFinite(Number(r?.settlement?.pl)));
  const flatStakePL = pricedSettled.reduce((sum, r) => sum + Number(r.settlement.pl), 0);
  return {
    records: rows.length,
    settled: settled.length,
    wins,
    losses,
    pending,
    voids,
    multiMarket,
    hitRate: settled.length ? Number((wins / settled.length * 100).toFixed(2)) : null,
    actionableSettled: actionableSettled.length,
    actionableWins,
    actionableLosses: actionableSettled.length - actionableWins,
    pricedSettled: pricedSettled.length,
    flatStakePL: Number(flatStakePL.toFixed(2)),
    roi: pricedSettled.length ? Number((flatStakePL / pricedSettled.length * 100).toFixed(2)) : null
  };
}

export async function readCanonicalLedger(options = {}) {
  const maxBlobs = Math.max(1, Math.min(10000, Number(options.maxBlobs) || 5000));
  const listing = await listJsonComplete(LEDGER_PREFIX, { maxBlobs, pageSize: 1000 });
  const books = await readManyJson(listing.blobs);
  const seen = new Set();
  const rows = [];
  let duplicateRecords = 0;
  let malformedBooks = 0;
  let sourceRecords = 0;

  for (let b = 0; b < books.length; b++) {
    const records = Array.isArray(books[b]?.records) ? books[b].records : null;
    if (!records) { malformedBooks += 1; continue; }
    sourceRecords += records.length;
    const sourcePath = listing.blobs[b]?.pathname || `book:${b}`;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const key = stableKey(rec, sourcePath, i);
      if (seen.has(key)) { duplicateRecords += 1; continue; }
      seen.add(key);
      rows.push(rec);
    }
  }

  rows.sort((a, b) => new Date(b?.publishedAt || b?.capturedAt || 0) - new Date(a?.publishedAt || a?.capturedAt || 0));
  const complete = Boolean(listing.complete) && malformedBooks === 0 && books.length === listing.blobs.length;
  return {
    rows,
    summary: summarizeCanonicalRows(rows),
    sourceIntegrity: {
      source: 'PREDICTION_LEDGER_CANONICAL_BLOB',
      prefix: LEDGER_PREFIX,
      complete,
      adaptationAllowed: complete,
      blobsDiscovered: listing.blobs.length,
      booksRead: books.length,
      pages: listing.pages,
      objectsScanned: listing.scanned,
      sourceRecords,
      canonicalRecords: rows.length,
      duplicateRecords,
      malformedBooks,
      hasMore: Boolean(listing.hasMore),
      capped: Boolean(listing.capped),
      error: listing.error || null
    }
  };
}

export function isSettledRow(r) {
  return SETTLED.has(String(r?.settlement?.status || '').toUpperCase());
}
