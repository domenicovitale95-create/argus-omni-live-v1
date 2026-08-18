import { readJson, storageReady, writeJson } from './_report-store.js';

const FINISHED = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);
const TZ = 'Europe/Brussels';

function dateInBrussels(value) {
  const d = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
  const m = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function snapshotFrom(match, analysis) {
  return {
    recordedAt: new Date().toISOString(),
    phase: analysis?.phase || (match?.isLive ? 'LIVE' : 'PREMATCH'),
    status: match?.status || null,
    minute: match?.minute ?? null,
    score: match?.score || null,
    classification: analysis?.classification || 'NO BET',
    selection: analysis?.bestMarket || null,
    odds: analysis?.marketOdds ?? null,
    confidence: analysis?.confidence ?? null,
    edge: analysis?.edge ?? null,
    dataQuality: analysis?.quality ?? null,
    rawProbability: analysis?.rawProbability ?? null,
    shrunkProbability: analysis?.shrunkProbability ?? null,
    conservativeProbability: analysis?.conservativeProbability ?? null,
    conservativeEV: analysis?.conservativeEV ?? null,
    model: analysis?.model || null,
    market: analysis?.market || null,
    marketAvailable: Boolean(analysis?.marketAvailable),
    engineStatus: analysis?.engineStatus || null,
    shrinkageStatus: analysis?.shrinkageStatus || null,
    governanceReason: analysis?.governanceReason || null
  };
}

function signature(s) {
  return [s.phase,s.status,s.minute,s.classification,s.selection,s.odds,s.confidence,s.edge,s.score?.home,s.score?.away].join('|');
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!storageReady()) return res.status(503).json({ error:'Prediction archive storage is not configured', storageReady:false });

  if (req.method === 'GET') {
    const date = String(req.query?.date || dateInBrussels());
    const payload = await readJson(`argus/predictions/${date}.json`, { date, fixtures:{} });
    return res.status(200).json(payload);
  }

  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  const body = req.body || {};
  const matches = Array.isArray(body.matches) ? body.matches : [];
  const analyses = Array.isArray(body.analyses) ? body.analyses : [];
  if (!matches.length || matches.length !== analyses.length) return res.status(400).json({ error:'Invalid prediction snapshot payload' });

  const grouped = new Map();
  for (let i=0;i<matches.length;i++) {
    const match = matches[i];
    const analysis = analyses[i];
    if (!match?.id || FINISHED.has(match.status) || analysis?.phase === 'FINISHED') continue;
    const date = dateInBrussels(match.kickoff || Date.now());
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ match, analysis });
  }

  let saved = 0;
  for (const [date, rows] of grouped) {
    const path = `argus/predictions/${date}.json`;
    const store = await readJson(path, { date, timezone:TZ, createdAt:new Date().toISOString(), updatedAt:null, fixtures:{} });
    store.fixtures ||= {};

    for (const {match,analysis} of rows) {
      const id = String(match.id);
      const fixture = store.fixtures[id] || {
        fixtureId: match.id,
        competition: match.competition || null,
        country: match.country || null,
        home: match.home,
        away: match.away,
        kickoff: match.kickoff || null,
        snapshots: []
      };
      const snap = snapshotFrom(match,analysis);
      const last = fixture.snapshots[fixture.snapshots.length-1];
      if (!last || signature(last) !== signature(snap)) {
        fixture.snapshots.push(snap);
        if (fixture.snapshots.length > 30) fixture.snapshots = fixture.snapshots.slice(-30);
        saved++;
      }
      store.fixtures[id] = fixture;
    }
    store.updatedAt = new Date().toISOString();
    await writeJson(path,store);
  }

  return res.status(200).json({ ok:true, saved, dates:[...grouped.keys()] });
}
