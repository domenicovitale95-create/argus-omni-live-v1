import { readJson, storageReady } from './_report-store.js';

const ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATE='argus/research/historical-decade-state.json';
const DAYS=3653;
function ymd(d){return d.toISOString().slice(0,10)}
function expectedDates(){const out=[];const end=new Date(Date.now()-86400000);for(let i=0;i<DAYS;i++)out.push(ymd(new Date(end.getTime()-i*86400000)));return out}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({version:'HISTORICAL-ARCHIVE-HEALTH-1',status:'DEGRADED',error:'Storage unavailable'});
  const [archive,state]=await Promise.all([readJson(ARCHIVE,null),readJson(STATE,null)]);
  if(!archive)return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-1',status:'NO_ARCHIVE',providerCalls:false,writes:false});
  const dates=expectedDates(),stored=archive.dates||{},completedDates=dates.filter(d=>stored[d]?.complete).length;
  let recentCompleteDays=0;for(const d of dates){if(stored[d]?.complete)recentCompleteDays++;else break}
  const firstRecentGaps=dates.filter(d=>!stored[d]?.complete).slice(0,30);
  const oldestRecentComplete=recentCompleteDays?dates[recentCompleteDays-1]:null;
  return res.status(200).json({version:'HISTORICAL-ARCHIVE-HEALTH-1',generatedAt:new Date().toISOString(),status:recentCompleteDays>=30?'RECENT_COVERAGE_AVAILABLE':recentCompleteDays>0?'RECENT_COVERAGE_THIN':'NO_RECENT_CONTIGUOUS_COVERAGE',archiveVersion:archive.version||null,windowDays:archive.windowDays||DAYS,windowStart:archive.windowStart||dates.at(-1),windowEnd:archive.windowEnd||dates[0],fixtureCount:Number(archive.fixtureCount)||Object.keys(archive.fixtures||{}).length,completedDates,recentCompleteDays,oldestRecentComplete,firstRecentGaps,state:{complete:Boolean(state?.complete),lastRun:state?.lastRun||null,recentCompleteDays:Number(state?.recentCompleteDays)||0},policy:{readOnly:true,providerCalls:false,writes:false,diagnosticOnly:true,doesNotRelaxTrendIntegrity:true}})
}
