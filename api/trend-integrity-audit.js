import { readJson, storageReady } from './_report-store.js';

const IN='argus/research/streak-intelligence.json';
const REFRESH_UTC_HOUR=2;
const REFRESH_UTC_MINUTE=47;
const REFRESH_GRACE_MINUTES=15;
function dateTZ(v=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(v).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
export function expectedContinuityThrough(now=new Date()){
  const utcMinutes=now.getUTCHours()*60+now.getUTCMinutes();
  const refreshReadyMinutes=REFRESH_UTC_HOUR*60+REFRESH_UTC_MINUTE+REFRESH_GRACE_MINUTES;
  const latestRefreshDate=utcMinutes>=refreshReadyMinutes?now.toISOString().slice(0,10):addDays(now.toISOString().slice(0,10),-1);
  return addDays(latestRefreshDate,-1);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const report=await readJson(IN,null);
  if(!report)return res.status(200).json({version:'TREND-INTEGRITY-AUDIT-4',status:'WAITING_FOR_TRENDS',checked:0,violations:[],evidenceState:'NO_REPORT'});
  const expectedThrough=expectedContinuityThrough(),violations=[],trends=Array.isArray(report.trends)?report.trends:[];
  if(report.requiredContinuityThrough!==expectedThrough)violations.push({id:'REPORT',type:'CONTINUITY_NOT_THROUGH_EXPECTED_REFRESH_BOUNDARY',expected:expectedThrough,value:report.requiredContinuityThrough||null});
  for(const t of trends){
    const id=`${t.team||t.teamId}|${t.condition||t.label}`;
    if(Number(t.recentSample)!==10)violations.push({id,type:'WINDOW_NOT_10',value:t.recentSample});
    if(Number(t.dataCoveragePct)!==100)violations.push({id,type:'COVERAGE_NOT_100',value:t.dataCoveragePct});
    if(t.completeWindow!==true)violations.push({id,type:'WINDOW_NOT_COMPLETE'});
    if(t.verifiedCalendarContinuity!==true)violations.push({id,type:'CALENDAR_CONTINUITY_UNVERIFIED'});
    if(t.continuityRequiredThrough!==expectedThrough)violations.push({id,type:'TREND_CONTINUITY_BOUNDARY_STALE',expected:expectedThrough,value:t.continuityRequiredThrough||null});
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
  const checked=trends.length,status=violations.length?'FAIL':checked>0?'PASS':'NO_DATA',evidenceState=checked>0?'OBSERVED_TRENDS':'ZERO_TRENDS';
  return res.status(200).json({version:'TREND-INTEGRITY-AUDIT-4',generatedAt:new Date().toISOString(),sourceVersion:report.version||null,expectedContinuityThrough:expectedThrough,status,evidenceState,checked,violations:violations.slice(0,200),policy:{requireExactly10:true,requireCoverage100:true,requireCalendarContinuity:true,requireContinuityThroughScheduledRefreshBoundary:true,refreshScheduleUtc:`${String(REFRESH_UTC_HOUR).padStart(2,'0')}:${String(REFRESH_UTC_MINUTE).padStart(2,'0')}`,refreshGraceMinutes:REFRESH_GRACE_MINUTES,requireNoGapFilling:true,passRequiresCheckedData:true,zeroDataIsNotPass:true}})
}