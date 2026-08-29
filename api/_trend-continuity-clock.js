const REFRESH_UTC_HOUR=2;
const REFRESH_UTC_MINUTE=47;
const REFRESH_GRACE_MINUTES=15;
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
export function expectedContinuityThrough(now=new Date()){
  const utcMinutes=now.getUTCHours()*60+now.getUTCMinutes();
  const refreshReadyMinutes=REFRESH_UTC_HOUR*60+REFRESH_UTC_MINUTE+REFRESH_GRACE_MINUTES;
  const currentUtcDate=now.toISOString().slice(0,10);
  const latestRefreshDate=utcMinutes>=refreshReadyMinutes?currentUtcDate:addDays(currentUtcDate,-1);
  return addDays(latestRefreshDate,-1);
}
export const trendRefreshPolicy=Object.freeze({refreshUtcHour:REFRESH_UTC_HOUR,refreshUtcMinute:REFRESH_UTC_MINUTE,refreshGraceMinutes:REFRESH_GRACE_MINUTES});
