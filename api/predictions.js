import { requestQuery } from './_request-query.js';
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
function internalAuth(req){const secret=process.env.CRON_SECRET;return Boolean(secret)&&req.headers.authorization===`Bearer ${secret}`}
function canWrite(req){return sameOrigin(req)||internalAuth(req)}

function dateInBrussels(value) {
  const d = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
  const m = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function finiteOrNull(v) { const n=Number(v); return Number.isFinite(n)?n:null; }
function clean(v,max=120){return v==null?null:String(v).slice(0,max)}
function validMatch(match) {
  const id=Number(match?.id), k=new Date(match?.kickoff||0).getTime();
  return Number.isFinite(id)&&id>0&&Number.isFinite(k)&&typeof match?.home==='string'&&match.home.length<=120&&typeof match?.away==='string'&&match.away.length<=120;
}

function snapshotFrom(match, analysis) {
  const selectionKey=clean(analysis?.selectionKey||analysis?.bestMarket,80);
  return {
    recordedAt: new Date().toISOString(), phase: analysis?.phase || (match?.isLive ? 'LIVE' : 'PREMATCH'), status: match?.status || null,
    minute: finiteOrNull(match?.minute), score: match?.score || null, classification: clean(analysis?.classification || 'NO BET',40),
    selection: analysis?.bestMarket ? clean(analysis.bestMarket,120) : null, selectionKey, marketType:clean(analysis?.marketType,40), marketLine:finiteOrNull(analysis?.marketLine),
    odds: finiteOrNull(analysis?.marketOdds), fairOdds:finiteOrNull(analysis?.fairOdds), confidence: finiteOrNull(analysis?.confidence),
    edge: finiteOrNull(analysis?.edge), expectedValue:finiteOrNull(analysis?.conservativeEV), dataQuality: finiteOrNull(analysis?.quality), rawProbability: finiteOrNull(analysis?.rawProbability),
    shrunkProbability: finiteOrNull(analysis?.shrunkProbability), conservativeProbability: finiteOrNull(analysis?.conservativeProbability), conservativeEV: finiteOrNull(analysis?.conservativeEV),
    decisionSource:clean(analysis?.decisionSource,80), model: analysis?.model || null, market: analysis?.market || null, marketAvailable: Boolean(analysis?.marketAvailable), engineStatus: clean(analysis?.engineStatus,240),
    shrinkageStatus: analysis?.shrinkageStatus || null, governanceReason: analysis?.governanceReason ? clean(analysis.governanceReason,500) : null
  };
}
function signature(s) {return [s.phase,s.status,s.minute,s.classification,s.marketType,s.selectionKey||s.selection,s.marketLine,s.odds,s.confidence,s.edge,s.score?.home,s.score?.away].join('|')}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!storageReady()) return res.status(503).json({ error:'Prediction archive storage is not configured', storageReady:false });
  if (req.method === 'GET') {const date=String(requestQuery(req)?.date||dateInBrussels());return res.status(200).json(await readJson(`argus/predictions/${date}.json`,{date,fixtures:{}}))}
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  if (!canWrite(req)) return res.status(403).json({ error:'Trusted writer required' });
  const body=req.body||{},matches=Array.isArray(body.matches)?body.matches:[],analyses=Array.isArray(body.analyses)?body.analyses:[];
  if (!matches.length || matches.length !== analyses.length || matches.length>MAX_ROWS_PER_POST) return res.status(400).json({ error:'Invalid prediction snapshot payload' });
  const grouped=new Map();
  for(let i=0;i<matches.length;i++){const match=matches[i],analysis=analyses[i];if(!validMatch(match)||FINISHED.has(match.status)||analysis?.phase==='FINISHED')continue;const date=dateInBrussels(match.kickoff);if(!grouped.has(date))grouped.set(date,[]);grouped.get(date).push({match,analysis})}
  let saved=0;
  for(const [date,rows] of grouped){const path=`argus/predictions/${date}.json`,store=await readJson(path,{date,timezone:TZ,createdAt:new Date().toISOString(),updatedAt:null,fixtures:{}});store.fixtures||={};let savedThisDate=0;
    for(const {match,analysis} of rows){const id=String(Number(match.id)),fixture=store.fixtures[id]||{fixtureId:Number(match.id),competition:match.competition||null,country:match.country||null,home:match.home,away:match.away,kickoff:match.kickoff||null,snapshots:[]};const snap=snapshotFrom(match,analysis),last=fixture.snapshots[fixture.snapshots.length-1];if(!last||signature(last)!==signature(snap)){fixture.snapshots.push(snap);if(fixture.snapshots.length>MAX_SNAPSHOTS_PER_FIXTURE)fixture.snapshots=fixture.snapshots.slice(-MAX_SNAPSHOTS_PER_FIXTURE);saved++;savedThisDate++}store.fixtures[id]=fixture}
    if(savedThisDate>0){store.updatedAt=new Date().toISOString();await writeJson(path,store)}
  }
  return res.status(200).json({ok:true,saved,maxSnapshotsPerFixture:MAX_SNAPSHOTS_PER_FIXTURE,maxRowsPerPost:MAX_ROWS_PER_POST,dates:[...grouped.keys()],policy:{trustedWriters:['same-origin-browser','cron-secret-server'],multiMarketMetadataFrozen:true,automaticWagering:false}})
}
