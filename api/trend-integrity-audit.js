import { readJson, storageReady } from './_report-store.js';

const IN='argus/research/streak-intelligence.json';
function dateTZ(v=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(v).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const report=await readJson(IN,null);
  if(!report)return res.status(200).json({version:'TREND-INTEGRITY-AUDIT-2',status:'WAITING_FOR_TRENDS',violations:[]});
  const yesterday=addDays(dateTZ(),-1),violations=[];
  if(report.requiredContinuityThrough!==yesterday)violations.push({id:'REPORT',type:'CONTINUITY_NOT_THROUGH_YESTERDAY',expected:yesterday,value:report.requiredContinuityThrough||null});
  for(const t of report.trends||[]){
    const id=`${t.team||t.teamId}|${t.condition||t.label}`;
    if(Number(t.recentSample)!==10)violations.push({id,type:'WINDOW_NOT_10',value:t.recentSample});
    if(Number(t.dataCoveragePct)!==100)violations.push({id,type:'COVERAGE_NOT_100',value:t.dataCoveragePct});
    if(t.completeWindow!==true)violations.push({id,type:'WINDOW_NOT_COMPLETE'});
    if(t.verifiedCalendarContinuity!==true)violations.push({id,type:'CALENDAR_CONTINUITY_UNVERIFIED'});
    if(t.continuityRequiredThrough!==yesterday)violations.push({id,type:'TREND_CONTINUITY_BOUNDARY_STALE',expected:yesterday,value:t.continuityRequiredThrough||null});
    if(Number(t.currentStreak)>10)violations.push({id,type:'STREAK_EXCEEDS_WINDOW',value:t.currentStreak});
    if(Number(t.currentStreak)<3)violations.push({id,type:'STREAK_BELOW_DISPLAY_MINIMUM',value:t.currentStreak});
    if(t.perfect10&&!(Number(t.currentStreak)===10&&Number(t.recentHits)===10&&Number(t.recentHitRate)===100))violations.push({id,type:'INVALID_PERFECT_10'});
  }
  const policy=report.policy||{};
  if(policy.recentWindow!==10)violations.push({id:'POLICY',type:'POLICY_WINDOW_NOT_10',value:policy.recentWindow});
  if(policy.strictLatestTen!==true)violations.push({id:'POLICY',type:'STRICT_LATEST_TEN_DISABLED'});
  if(policy.noGapFilling!==true)violations.push({id:'POLICY',type:'GAP_FILLING_NOT_BLOCKED'});
  if(policy.missingStatsSuppressTrend!==true)violations.push({id:'POLICY',type:'MISSING_STATS_NOT_SUPPRESSED'});
  if(policy.calendarContinuityRequiredThroughYesterday!==true)violations.push({id:'POLICY',type:'YESTERDAY_CONTINUITY_POLICY_DISABLED'});
  return res.status(200).json({version:'TREND-INTEGRITY-AUDIT-2',generatedAt:new Date().toISOString(),sourceVersion:report.version||null,expectedContinuityThrough:yesterday,status:violations.length?'FAIL':'PASS',checked:(report.trends||[]).length,violations:violations.slice(0,200),policy:{requireExactly10:true,requireCoverage100:true,requireCalendarContinuity:true,requireContinuityThroughYesterday:true,requireNoGapFilling:true}})
}