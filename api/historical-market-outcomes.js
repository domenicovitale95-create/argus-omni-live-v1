import { readJson, writeJson, listJson, storageReady } from './_report-store.js';

const IN='argus/research/historical-decade-fixtures.json';
const OUT='argus/research/historical-market-outcomes.json';
const MAX_MONOLITH_BYTES=24*1024*1024;
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
function lineOutcome(total,line){if(total>line)return'OVER';if(total<line)return'UNDER';return'PUSH'}
function asianResult(h,a,line,side){const margin=side==='HOME'?(h-a):(a-h),v=margin+line;if(v>0)return'WIN';if(v<0)return'LOSS';return'PUSH'}
function derive(r){const h=n(r.homeGoals),a=n(r.awayGoals);if(h==null||a==null)return null;const t=h+a,w=h>a?'HOME':h<a?'AWAY':'DRAW';const o={fixtureId:r.fixtureId,date:r.date,competition:r.competition,country:r.country,season:r.season,home:r.home,away:r.away,homeGoals:h,awayGoals:a,totalGoals:t,exactScore:`${h}-${a}`,matchWinner:w,doubleChance:{homeDraw:w!=='AWAY',homeAway:w!=='DRAW',drawAway:w!=='HOME'},drawNoBet:{home:w==='DRAW'?'PUSH':w==='HOME'?'WIN':'LOSS',away:w==='DRAW'?'PUSH':w==='AWAY'?'WIN':'LOSS'},btts:h>0&&a>0?'YES':'NO',cleanSheet:{home:a===0,away:h===0},winToNil:{home:h>a&&a===0,away:a>h&&h===0},eitherTeamToScore:h>0||a>0,bothHalvesGoals:null,totals:{},homeTotals:{},awayTotals:{},goalBands:t===0?'0':t===1?'1':t<=3?'2-3':t<=5?'4-5':'6+',oddEven:t%2?'ODD':'EVEN',margin:h===a?'DRAW':Math.abs(h-a)===1?'1':Math.abs(h-a)===2?'2':'3+',winnerAndBTTS:`${w}|${h>0&&a>0?'YES':'NO'}`,winnerAndTotal25:`${w}|${t>2.5?'OVER':'UNDER'}`,exactTotalGoals:String(t),asianHandicap:{home:{},away:{}}};for(const line of [.5,1.5,2.5,3.5,4.5,5.5,6.5])o.totals[String(line)]=lineOutcome(t,line);for(const line of [.5,1.5,2.5,3.5]){o.homeTotals[String(line)]=lineOutcome(h,line);o.awayTotals[String(line)]=lineOutcome(a,line)}for(const line of [-2,-1.5,-1,-.5,0,.5,1,1.5,2]){o.asianHandicap.home[String(line)]=asianResult(h,a,line,'HOME');o.asianHandicap.away[String(line)]=asianResult(h,a,line,'AWAY')}return o}
function inc(obj,key){obj[key]=(obj[key]||0)+1}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const archiveMeta=(await listJson(IN,10)).find(b=>b.pathname===IN)||null;
  const archiveSizeBytes=Number.isFinite(Number(archiveMeta?.size))?Number(archiveMeta.size):null;
  if(archiveSizeBytes!=null&&archiveSizeBytes>MAX_MONOLITH_BYTES)return res.status(200).json({ok:true,version:'HISTORICAL-MARKET-OUTCOMES-2',status:'PAUSED_MEMORY_GUARD',records:0,archiveSizeBytes,maxMonolithBytes:MAX_MONOLITH_BYTES,migrationRequired:true,policy:{historicalResearchOnly:true,failClosed:true,noOOMRiskAccepted:true}});
  const a=await readJson(IN,null);
  if(!a)return res.status(200).json({version:'HISTORICAL-MARKET-OUTCOMES-2',status:'WAITING_FOR_DECADE_ARCHIVE',records:0});
  const rows=Object.values(a.fixtures||{}).map(derive).filter(Boolean),summary={records:rows.length,exactScores:{},matchWinner:{},btts:{},goalBands:{},total25:{},homeTotal05:{},awayTotal05:{}};
  for(const r of rows){inc(summary.exactScores,r.exactScore);inc(summary.matchWinner,r.matchWinner);inc(summary.btts,r.btts);inc(summary.goalBands,r.goalBands);inc(summary.total25,r.totals['2.5']);inc(summary.homeTotal05,r.homeTotals['0.5']);inc(summary.awayTotal05,r.awayTotals['0.5'])}
  const report={version:'HISTORICAL-MARKET-OUTCOMES-2',generatedAt:new Date().toISOString(),sourceVersion:a.version||null,windowStart:a.windowStart||null,windowEnd:a.windowEnd||null,archiveSizeBytes,records:rows.length,marketFamilies:['1X2','DOUBLE_CHANCE','DRAW_NO_BET','BTTS','CLEAN_SHEET','WIN_TO_NIL','TOTAL_GOALS','TEAM_TOTALS','GOAL_BANDS','ODD_EVEN','WIN_MARGIN','WINNER_BTTS','WINNER_TOTAL_2.5','EXACT_TOTAL_GOALS','EXACT_SCORE','ASIAN_HANDICAP_RESULT'],summary,sample:rows.slice(-500),policy:{historicalResearchOnly:true,derivedFromVerifiedFinalScore:true,noHistoricalOdds:true,noHistoricalROI:true,cornersCardsRequireStatisticsEnrichment:true,memoryGuard:true}};
  await writeJson(OUT,report);
  return res.status(200).json(report)
}
