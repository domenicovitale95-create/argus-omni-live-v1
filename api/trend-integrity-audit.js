import { readJson, storageReady } from './_report-store.js';

const IN='argus/research/streak-intelligence.json';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const report=await readJson(IN,null);
  if(!report)return res.status(200).json({version:'TREND-INTEGRITY-AUDIT-1',status:'WAITING_FOR_TRENDS',violations:[]});
  const violations=[];
  for(const t of report.trends||[]){
    const id=`${t.team||t.teamId}|${t.condition||t.label}`;
    if(Number(t.recentSample)!==10)violations.push({id,type:'WINDOW_NOT_10',value:t.recentSample});
    if(Number(t.dataCoveragePct)!==100)violations.push({id,type:'COVERAGE_NOT_100',value:t.dataCoveragePct});
    if(t.completeWindow!==true)violations.push({id,type:'WINDOW_NOT_COMPLETE'});
    if(t.verifiedCalendarContinuity!==true)violations.push({id,type:'CALENDAR_CONTINUITY_UNVERIFIED'});
    if(Number(t.currentStreak)>10)violations.push({id,type:'STREAK_EXCEEDS_WINDOW',value:t.currentStreak});
    if(Number(t.currentStreak)<3)violations.push({id,type:'STREAK_BELOW_DISPLAY_MINIMUM',value:t.currentStreak});
    if(t.perfect10&&!(Number(t.currentStreak)===10&&Number(t.recentHits)===10&&Number(t.recentHitRate)===100))violations.push({id,type:'INVALID_PERFECT_10'});
  }
  const policy=report.policy||{};
  if(policy.recentWindow!==10)violations.push({id:'POLICY',type:'POLICY_WINDOW_NOT_10',value:policy.recentWindow});
  if(policy.strictLatestTen!==true)violations.push({id:'POLICY',type:'STRICT_LATEST_TEN_DISABLED'});
  if(policy.noGapFilling!==true)violations.push({id:'POLICY',type:'GAP_FILLING_NOT_BLOCKED'});
  if(policy.missingStatsSuppressTrend!==true)violations.push({id:'POLICY',type:'MISSING_STATS_NOT_SUPPRESSED'});
  return res.status(200).json({version:'TREND-INTEGRITY-AUDIT-1',generatedAt:new Date().toISOString(),sourceVersion:report.version||null,status:violations.length?'FAIL':'PASS',checked:(report.trends||[]).length,violations:violations.slice(0,200),policy:{requireExactly10:true,requireCoverage100:true,requireCalendarContinuity:true,requireNoGapFilling:true}})
}