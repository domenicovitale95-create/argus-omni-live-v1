// Common, conservative scope for prospective PRE-MATCH forecasts.
// Keep results providers untouched: past and live fixtures may still be needed
// for independent settlement, but they cannot enter the prediction plan.
const DISALLOWED_STATUSES=new Set(['1H','2H','HT','ET','BT','P','INT','LIVE','FT','AET','PEN','CANC','ABD','AWD','WO','SUSP']);
export function isPrematchFixture(match,at=Date.now()){
 if(!match||match.isLive===true||match.isFinished===true)return false;
 const rawStatus=match.status&&typeof match.status==='object'?match.status.short:match.status;
 if(DISALLOWED_STATUSES.has(String(rawStatus||'').trim().toUpperCase()))return false;
 const kickoff=Date.parse(match.kickoff||match.fixture?.date||'');
 return Number.isFinite(kickoff)&&Number.isFinite(Number(at))&&kickoff>Number(at);
}
export function prematchFixtures(matches,at=Date.now()){
 return(Array.isArray(matches)?matches:[]).filter(match=>isPrematchFixture(match,at));
}
