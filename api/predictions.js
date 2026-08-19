import { readJson, storageReady, writeJson } from './_report-store.js';

const FINISHED = new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);
const TZ = 'Europe/Brussels';
const MAX_SNAPSHOTS_PER_FIXTURE = 120;
const MAX_ROWS_PER_POST = 120;

function sameOrigin(req) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch (_) { return false; }
}

function dateInBrussels(value) {
  const d = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
  const m = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function finiteOrNull(v) { const n=Number(v); return Number.isFinite(n)?n:null; }
function validMatch(match) {
  const id=Number(match?.id), k=new Date(match?.kickoff||0).getTime();
  return Number.isFinite(id)&&id>0&&Number.isFinite(k)&&typeof match?.home==='string'&&match.home.length<=120&&typeof match?.away==='string'&&match.away.length<=120;
}

function snapshotFrom(match, analysis) {
  return {
    recordedAt: new Date().toISOString(),
    phase: analysis?.phase || (match?.isLive ? 'LIVE' : 'PREMATCH'),
    status: match?.status || null,
    minute: finiteOrNull(match?.minute),
    score: match?.score || null,
    classification: String(analysis?.classification || 'NO BET').slice(0,40),
    selection: analysis?.bestMarket ? String(analysis.bestMarket).slice(0,80) : null,
    odds: finiteOrNull(analysis?.marketOdds),
    confidence: finiteOrNull(analysis?.confidence),
    edge: finiteOrNull(analysis?.edge),
    dataQuality: finiteOrNull(analysis?.quality),
    rawProbability: finiteOrNull(analysis?.rawProbability),
    shrunkProbability: finiteOrNull(analysis?.shrunkProbability),
    conservativeProbability: finiteOrNull(analysis?.conservativeProbability),
    conservativeEV: finiteOrNull(analysis?.conservativeEV),
    model: analysis?.model || null,
    market: analysis?.market || null,
    marketAvailable: Boolean(analysis?.marketAvailable),
    engineStatus: analysis?.engineStatus || null,
    shrinkageStatus: analysis?.shrinkageStatus || null,
    governanceReason: analysis?.governanceReason ? String(analysis.governanceReason).slice(0,500) : null
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
  if (!sameOrigin(req)) return res.status(403).json({ error:'Same-origin POST required' });

  const body = req.body || {};
  const matches = Array.isArray(body.matches) ? body.matches : [];
  const analyses = Array.isArray(body.analyses) ? body.analyses : [];
  if (!matches.length || matches.length !== analyses.length || matches.length>MAX_ROWS_PER_POST) return res.status(400).json({ error:'Invalid prediction snapshot payload' });

  const grouped = new Map();
  for (let i=0;i<matches.length;i++) {
    const match = matches[i];
    const analysis = analyses[i];
    if (!validMatch(match) || FINISHED.has(match.status) || analysis?.phase === 'FINISHED') continue;
    const date = dateInBrussels(match.kickoff);
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ match, analysis });
  }

  let saved = 0;
  for (const [date, rows] of grouped) {
    const path = `argus/predictions/${date}.json`;
    const store = await readJson(path, { date, timezone:TZ, createdAt:new Date().toISOString(), updatedAt:null, fixtures:{} });
    store.fixtures ||= {};
    let savedThisDate=0;

    for (const {match,analysis} of rows) {
      const id = String(Number(match.id));
      const fixture = store.fixtures[id] || {
        fixtureId: Number(match.id),
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
        if (fixture.snapshots.length > MAX_SNAPSHOTS_PER_FIXTURE) fixture.snapshots = fixture.snapshots.slice(-MAX_SNAPSHOTS_PER_FIXTURE);
        saved++;
        savedThisDate++;
      }
      store.fixtures[id] = fixture;
    }
    if(savedThisDate>0){store.updatedAt = new Date().toISOString(); await writeJson(path,store);}
  }

  return res.status(200).json({ ok:true, saved, maxSnapshotsPerFixture:MAX_SNAPSHOTS_PER_FIXTURE, maxRowsPerPost:MAX_ROWS_PER_POST, dates:[...grouped.keys()] });
}
