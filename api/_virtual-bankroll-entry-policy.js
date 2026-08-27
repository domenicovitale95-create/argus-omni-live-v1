const ACTIONABLE=new Set(['PRIME','VALUE','STRONG VALUE','STRONG_VALUE']);
const LEARNING_DENY_RISKS=['NOT_ELIGIBLE_UPSTREAM','NO_PRICED_MODELLED_MARKET','ODDS_MISSING','MATCH_FINISHED','EVIDENCE_STALE_OR_WEAK','LOW_DATA_QUALITY','PORTFOLIO_BLOCKED'];

const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};
const upper=v=>String(v||'').trim().toUpperCase();
const risksOf=rec=>[...(rec?.risks||[])].map(upper);

export function officialDecisionEligibility(rec){
  const verdict=upper(rec?.verdict);
  if(!ACTIONABLE.has(verdict))return{ok:false,reason:'VERDICT_NOT_ACTIONABLE'};
  if(rec?.portfolioBlocked===true)return{ok:false,reason:'PORTFOLIO_BLOCKED'};
  if(upper(rec?.preKickoffGate)==='BLOCKED')return{ok:false,reason:'PREKICKOFF_BLOCKED'};
  if(!(n(rec?.recommendedStakePct,0)>0))return{ok:false,reason:'NON_POSITIVE_RECOMMENDED_STAKE'};
  return{ok:true,reason:'ACTIONABLE_DECISION'};
}

export function learningDecisionEligibility(rec){
  const verdict=upper(rec?.verdict);
  if(verdict!=='WATCH')return{ok:false,reason:'LEARNING_REQUIRES_WATCH_VERDICT'};
  if(rec?.portfolioBlocked===true)return{ok:false,reason:'PORTFOLIO_BLOCKED'};
  if(upper(rec?.preKickoffGate)==='BLOCKED')return{ok:false,reason:'PREKICKOFF_BLOCKED'};
  if(n(rec?.recommendedStakePct,0)>0)return{ok:false,reason:'OFFICIAL_ACTIONABLE'};
  const risks=risksOf(rec);
  for(const deny of LEARNING_DENY_RISKS)if(risks.some(r=>r.includes(deny)))return{ok:false,reason:deny};
  const p=n(rec?.probability),fair=n(rec?.fairOdds),edge=n(rec?.edge),ev=n(rec?.evPct),conf=n(rec?.confidence);
  if(!(p>.02&&p<.98))return{ok:false,reason:'PROBABILITY_INVALID'};
  if(!(fair>1))return{ok:false,reason:'FAIR_ODDS_INVALID'};
  if(!(edge>=.75))return{ok:false,reason:'EDGE_BELOW_LEARNING_FLOOR'};
  if(!(ev>0))return{ok:false,reason:'EV_NON_POSITIVE'};
  if(!(conf>=35))return{ok:false,reason:'CONFIDENCE_BELOW_LEARNING_FLOOR'};
  return{ok:true,reason:'WATCH_ONLY_PROSPECTIVE_LEARNING'};
}

export function storedBetEntryViolation(bet){
  const cohort=upper(bet?.cohort||'OFFICIAL_PAPER');
  const verdict=upper(bet?.verdict);
  const risks=[...(bet?.decisionAudit?.risks||[])].map(upper);
  const portfolioBlocked=bet?.decisionAudit?.portfolioBlocked===true;
  if(cohort==='LEARNING_SHADOW'){
    if(verdict!=='WATCH')return'LEARNING_NON_WATCH_VERDICT';
    if(portfolioBlocked)return'LEARNING_PORTFOLIO_BLOCKED';
    if(risks.some(r=>r.includes('NOT_ELIGIBLE_UPSTREAM')))return'LEARNING_NOT_ELIGIBLE_UPSTREAM';
  }
  if(cohort==='OFFICIAL_PAPER'){
    if(!ACTIONABLE.has(verdict))return'OFFICIAL_VERDICT_NOT_ACTIONABLE';
    if(!(n(bet?.recommendedStakePct,0)>0))return'OFFICIAL_NON_POSITIVE_STAKE';
    if(portfolioBlocked)return'OFFICIAL_PORTFOLIO_BLOCKED';
  }
  return null;
}
