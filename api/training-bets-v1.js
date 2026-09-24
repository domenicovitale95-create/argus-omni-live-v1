import { requestQuery } from './_request-query.js';
import { readJson, readJsonFresh, writeJson, storageReady } from './_report-store.js';

const PLAN='argus/autopilot/decision-plan.json';
const STATE='argus/paper/training-bets-v1.json';
const QUOTA_GUARD_PATH='argus/data/api-football-quota-guard.json';
const API_BASE='https://v3.football.api-sports.io';
const INITIAL_BANKROLL=10000;
const MAX_PLAN_AGE_MIN=135;
const MAX_OPEN=30;
const MAX_CAPTURE_PER_RUN=8;
const MAX_STAKE_PCT=.25;
const MIN_TRAINING_CONFIDENCE=15;
const MIN_TRAINING_QUALITY=50;
const RESULT_PROBE_AFTER_MIN=150;
const RESULT_PROBE_COOLDOWN_MIN=30;
const MAX_PROVIDER_DATES_PER_RUN=2;
const MAX_PROVIDER_BOOTSTRAP_DATES=16;
const MAX_PROVIDER_FIXTURE_LOOKUPS_PER_RUN=4;
const FINAL=new Set(['WIN','LOSS','VOID']);
const PROVIDER_FINAL=new Set(['FT','AET','PEN']);
const PROVIDER_VOID=new Set(['CANC','ABD','AWD','WO']);
const HARD_DENY=['NO_PRICED_MODELLED_MARKET','ODDS_MISSING','MATCH_FINISHED','DECISION_INTEGRITY_FAILURE','PREKICKOFF_BLOCKED','SIGNAL_EXPIRED','CROSS_SOURCE_CONTRADICTION','UNCERTAINTY_EXTREME'];
const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};
function secret(){return String(process.env.CRON_SECRET||'').trim()}
function authorized(req){const s=secret();return !s||req.headers.authorization===`Bearer ${s}`}
function brusselsDate(value=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`}
function providerDayUtc(value=new Date()){return value.toISOString().slice(0,10)}
function quotaGuardDay(state){if(!state)return null;const recorded=state.providerDayUtc||null,observed=state.observedAt?String(state.observedAt).slice(0,10):null;return recorded||observed||state.date||null}
function canonical(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9:.-]+/g,'_').replace(/^_|_$/g,'')}
function empty(){const now=new Date().toISOString();return{version:'TRAINING-BETS-3',createdAt:now,updatedAt:null,lastRunAt:null,currency:'EUR_VIRTUAL',initialBankroll:INITIAL_BANKROLL,bankroll:INITIAL_BANKROLL,peakBankroll:INITIAL_BANKROLL,totalPnL:0,totalStaked:0,bets:{},settlementProbe:{lastProviderProbeAt:null,lastProviderDates:[],lastProviderError:null,providerCalls:0,providerDateLastProbeAt:{}},integrity:{trainingOnly:true,paperOnly:true,noRealMoney:true,automaticRealBetPlacement:false,countsAsOfficialTrackRecord:false,officialEngineUnchanged:true,prospectiveOnly:true,noHistoricalBackfill:true,onePositionPerFixture:true,maxStakePct:MAX_STAKE_PCT,source:'CURRENT_DECISION_PLAN',providerCalls:0,promptSettlementFallback:true,providerFallbackCooldownMinutes:RESULT_PROBE_COOLDOWN_MIN}}}
function ensure(s){const x=s&&typeof s==='object'?s:empty();x.version='TRAINING-BETS-3';x.initialBankroll=n(x.initialBankroll,INITIAL_BANKROLL);x.bankroll=n(x.bankroll,INITIAL_BANKROLL);x.peakBankroll=n(x.peakBankroll,Math.max(INITIAL_BANKROLL,x.bankroll));x.totalPnL=n(x.totalPnL,0);x.totalStaked=n(x.totalStaked,0);x.bets=x.bets&&typeof x.bets==='object'?x.bets:{};x.settlementProbe={lastProviderProbeAt:x.settlementProbe?.lastProviderProbeAt||null,lastProviderDates:Array.isArray(x.settlementProbe?.lastProviderDates)?x.settlementProbe.lastProviderDates:[],lastProviderError:x.settlementProbe?.lastProviderError||null,providerCalls:n(x.settlementProbe?.providerCalls,0),providerDateLastProbeAt:x.settlementProbe?.providerDateLastProbeAt&&typeof x.settlementProbe.providerDateLastProbeAt==='object'?x.settlementProbe.providerDateLastProbeAt:{}};x.integrity={...(x.integrity||{}),trainingOnly:true,paperOnly:true,noRealMoney:true,automaticRealBetPlacement:false,countsAsOfficialTrackRecord:false,officialEngineUnchanged:true,prospectiveOnly:true,noHistoricalBackfill:true,onePositionPerFixture:true,maxStakePct:MAX_STAKE_PCT,source:'CURRENT_DECISION_PLAN',providerCalls:n(x.settlementProbe.providerCalls,0),promptSettlementFallback:true,providerFallbackCooldownMinutes:RESULT_PROBE_COOLDOWN_MIN};return x}
function candidate(row){return row?.eligibilityCandidate||row?.candidate||null}
function issues(row){return [...(row?.eligibilityIssues||row?.issues||[])].map(x=>String(x||'').toUpperCase())}
function hardReason(row){const xs=issues(row);for(const d of HARD_DENY)if(xs.some(x=>x.includes(d)))return d;if(row?.crossSourceAgreement?.hardBlock)return'CROSS_SOURCE_HARD_BLOCK';if(row?.uncertaintyBudget?.hardBlock)return'UNCERTAINTY_HARD_BLOCK';return null}
function stakePct(row,c){const edge=n(c?.edgePct,0),conf=n(row?.netConfidence??row?.confidence,0),market=String(c?.marketType||'').toUpperCase();let pct=.12;if(edge>=1.5)pct=.15;if(edge>=3)pct=.22;if(edge>=6)pct=.25;if(edge>=9&&conf>=45)pct=.25;if(market==='EXACT_SCORE'||canonical(c?.selection).startsWith('EXACT_SCORE:'))pct=Math.min(pct,.10);if(conf<30)pct=Math.min(pct,.12);return Math.min(MAX_STAKE_PCT,Math.max(.10,pct))}
function qualify(row,nowMs){if(!row||row.isLive)return{ok:false,reason:'LIVE_HAS_SEPARATE_TRAINING_ENGINE'};if(row.betEligible===true)return{ok:false,reason:'OFFICIAL_ACTIONABLE_NOT_DUPLICATED'};const verdict=String(row.finalVerdict||row.verdict||'').toUpperCase();if(!['WATCH','NO BET',''].includes(verdict))return{ok:false,reason:'NOT_TRAINING_VERDICT'};const ko=new Date(row.kickoff||0).getTime();if(!Number.isFinite(ko)||ko<=nowMs)return{ok:false,reason:'MATCH_STARTED_OR_INVALID_KICKOFF'};const hard=hardReason(row);if(hard)return{ok:false,reason:hard};const c=candidate(row),odds=n(c?.odds),p=n(c?.probability),edge=n(c?.edgePct),storedEv=n(c?.evPct),derivedEv=odds>1&&p>.02&&p<.98?(p*odds-1)*100:null,ev=storedEv!=null?storedEv:derivedEv,conf=n(row?.netConfidence??row?.confidence),quality=n(row?.dataQuality??c?.dataQuality);if(!c)return{ok:false,reason:'NO_CANDIDATE'};if(!(odds>1))return{ok:false,reason:'ODDS_MISSING'};if(!(p>.02&&p<.98))return{ok:false,reason:'PROBABILITY_INVALID'};if(!(edge>=.5))return{ok:false,reason:'EDGE_BELOW_TRAINING_FLOOR'};if(!(ev>0))return{ok:false,reason:'EV_NON_POSITIVE'};if(conf==null||conf<MIN_TRAINING_CONFIDENCE)return{ok:false,reason:'CONFIDENCE_BELOW_TRAINING_FLOOR'};if(quality==null||quality<MIN_TRAINING_QUALITY)return{ok:false,reason:'QUALITY_BELOW_TRAINING_FLOOR'};return{ok:true,reason:issues(row).includes('EVIDENCE_STALE_OR_WEAK')?'EXPERIMENTAL_STALE_EVIDENCE_POSITIVE_EV':'POSITIVE_PRICED_MODELLED_TRAINING_CANDIDATE',candidate:{...c,evPct:Number(ev.toFixed(2))}}}
function selectionOutcome(selection,score){if(!score)return null;const h=n(score.home),a=n(score.away);if(h==null||a==null)return null;const s=canonical(selection),total=h+a;if(s==='HOME')return h>a?'WIN':'LOSS';if(s==='DRAW')return h===a?'WIN':'LOSS';if(s==='AWAY')return a>h?'WIN':'LOSS';if(s==='OVER_1_5')return total>1.5?'WIN':'LOSS';if(s==='UNDER_1_5')return total<1.5?'WIN':'LOSS';if(s==='OVER_2_5')return total>2.5?'WIN':'LOSS';if(s==='UNDER_2_5')return total<2.5?'WIN':'LOSS';if(s==='OVER_3_5')return total>3.5?'WIN':'LOSS';if(s==='UNDER_3_5')return total<3.5?'WIN':'LOSS';if(s==='BTTS_YES')return h>0&&a>0?'WIN':'LOSS';if(s==='BTTS_NO')return h===0||a===0?'WIN':'LOSS';if(s==='HOME_OVER_0_5')return h>.5?'WIN':'LOSS';if(s==='HOME_UNDER_0_5')return h<.5?'WIN':'LOSS';if(s==='AWAY_OVER_0_5')return a>.5?'WIN':'LOSS';if(s==='AWAY_UNDER_0_5')return a<.5?'WIN':'LOSS';if(s==='DOUBLE_CHANCE_1X')return h>=a?'WIN':'LOSS';if(s==='DOUBLE_CHANCE_12')return h!==a?'WIN':'LOSS';if(s==='DOUBLE_CHANCE_X2')return a>=h?'WIN':'LOSS';if(s==='DNB_HOME')return h===a?'VOID':h>a?'WIN':'LOSS';if(s==='DNB_AWAY')return h===a?'VOID':a>h?'WIN':'LOSS';const m=s.match(/^EXACT_SCORE:(\d+)-(\d+)$/);if(m)return h===Number(m[1])&&a===Number(m[2])?'WIN':'LOSS';return null}
function applySettlement(state,bet,status,score,settledAt,source,providerStatus=null){if(bet.status!=='OPEN'||!FINAL.has(status))return false;const stake=n(bet.stakeAmount,0),odds=n(bet.odds,1),pnl=status==='WIN'?Number((stake*(odds-1)).toFixed(2)):status==='LOSS'?Number((-stake).toFixed(2)):0;bet.status=status;bet.settlement={status,settledAt,finalScore:score||null,source,...(providerStatus?{providerStatus}:{})};bet.pnl=pnl;state.bankroll=Number((state.bankroll+pnl).toFixed(2));state.totalPnL=Number((state.totalPnL+pnl).toFixed(2));state.peakBankroll=Math.max(state.peakBankroll,state.bankroll);return true}
async function settleFromLedger(state,now){let settled=0;for(const bet of Object.values(state.bets)){if(bet.status!=='OPEN')continue;const ko=new Date(bet.kickoff||0);if(!Number.isFinite(ko.getTime())||ko.getTime()>Date.now())continue;const book=await readJson(`argus/ledger/${brusselsDate(ko)}.json`,null),rec=(book?.records||[]).find(r=>String(r.fixtureId)===String(bet.fixtureId)&&FINAL.has(String(r?.settlement?.status||'').toUpperCase()));if(!rec)continue;const ledgerStatus=String(rec?.settlement?.status||'').toUpperCase();if(ledgerStatus==='VOID'){if(applySettlement(state,bet,'VOID',null,rec.settlement?.settledAt||now,'LEDGER_VOID_FOR_TRAINING'))settled++;continue}const score=rec?.settlement?.finalScore,outcome=selectionOutcome(bet.selection,score);if(!outcome)continue;if(applySettlement(state,bet,outcome,score,rec.settlement?.settledAt||now,'LEDGER_FINAL_SCORE_REEVALUATED_FOR_TRAINING_SELECTION'))settled++}return settled}
async function providerBlocked(){const guard=await readJsonFresh(QUOTA_GUARD_PATH,null);return Boolean(guard?.exhausted&&quotaGuardDay(guard)===providerDayUtc())}
async function fetchFixtures(date){const key=String(process.env.API_FOOTBALL_KEY||'').trim();if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?date=${date}&timezone=${encodeURIComponent('Europe/Brussels')}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return j.response||[]}
async function fetchFixtureById(id){const key=String(process.env.API_FOOTBALL_KEY||'').trim();if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const r=await fetch(`${API_BASE}/fixtures?id=${encodeURIComponent(String(id))}`,{headers:{'x-apisports-key':key,Accept:'application/json'}});if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const j=await r.json();if(j?.errors&&Object.keys(j.errors).length)throw new Error(`API-Football: ${JSON.stringify(j.errors)}`);return Array.isArray(j.response)?j.response[0]||null:null}
function providerResult(f){const short=String(f?.fixture?.status?.short||'').toUpperCase();if(PROVIDER_VOID.has(short))return{status:'VOID',providerStatus:short,score:null};if(!PROVIDER_FINAL.has(short))return{status:'PENDING',providerStatus:short,score:null};const home=n(f?.score?.fulltime?.home??f?.goals?.home),away=n(f?.score?.fulltime?.away??f?.goals?.away);if(home==null||away==null)return{status:'PENDING',providerStatus:short,score:null};return{status:'FINAL',providerStatus:short,score:{home,away}}}
export function reconcileProviderFixture(state,bet,fixture,now,source='API_FOOTBALL_TRAINING_SETTLEMENT'){
 if(!state||!bet||bet.status!=='OPEN'||!fixture)return{settled:false,rescheduled:false,resultStatus:'MISSING'};
 const result=providerResult(fixture),providerKickoff=String(fixture?.fixture?.date||''),currentKickoff=String(bet.kickoff||'');
 const providerMs=new Date(providerKickoff||0).getTime(),currentMs=new Date(currentKickoff||0).getTime();
 let rescheduled=false;
 if(providerKickoff&&Number.isFinite(providerMs)&&(!Number.isFinite(currentMs)||Math.abs(providerMs-currentMs)>=60000)){
  if(!bet.originalKickoff&&currentKickoff)bet.originalKickoff=currentKickoff;
  bet.kickoff=providerKickoff;
  bet.schedule={...(bet.schedule||{}),rescheduled:true,updatedAt:now,providerKickoff,providerStatus:result.providerStatus||null,source};
  rescheduled=true;
 }
 bet.providerTracking={...(bet.providerTracking||{}),lastCheckedAt:now,providerStatus:result.providerStatus||null,providerKickoff:providerKickoff||null,source};
 if(result.status==='VOID')return{settled:applySettlement(state,bet,'VOID',null,now,source,result.providerStatus),rescheduled,resultStatus:'VOID'};
 if(result.status!=='FINAL')return{settled:false,rescheduled,resultStatus:'PENDING',providerStatus:result.providerStatus||null};
 const outcome=selectionOutcome(bet.selection,result.score);
 if(!outcome)return{settled:false,rescheduled,resultStatus:'UNSUPPORTED_SELECTION',providerStatus:result.providerStatus||null};
 return{settled:applySettlement(state,bet,outcome,result.score,now,source,result.providerStatus),rescheduled,resultStatus:'FINAL',providerStatus:result.providerStatus||null};
}
function overdueOpen(state,nowMs){return Object.values(state.bets).filter(b=>{if(b.status!=='OPEN')return false;const ko=new Date(b.kickoff||0).getTime();return Number.isFinite(ko)&&nowMs-ko>=RESULT_PROBE_AFTER_MIN*60000})}
export function selectProviderProbeDates(state,overdue,maxDates=MAX_PROVIDER_DATES_PER_RUN){
 const history=state?.settlementProbe?.providerDateLastProbeAt&&typeof state.settlementProbe.providerDateLastProbeAt==='object'?state.settlementProbe.providerDateLastProbeAt:{};
 const dates=[...new Set((overdue||[]).map(b=>brusselsDate(new Date(b.kickoff))))];
 if(!dates.length)return[];
 const hasActiveHistory=dates.some(date=>Boolean(history[date]));
 const limit=Math.min(dates.length,hasActiveHistory?Math.max(1,maxDates):MAX_PROVIDER_BOOTSTRAP_DATES);
 const stamp=date=>{const ms=new Date(history[date]||0).getTime();return Number.isFinite(ms)&&ms>0?ms:0};
 return dates.sort((a,b)=>{const ta=stamp(a),tb=stamp(b);if(ta!==tb)return ta-tb;return b.localeCompare(a)}).slice(0,limit);
}
async function settleFromProvider(state,now,nowMs){
 const overdue=overdueOpen(state,nowMs);
 if(!overdue.length)return{settled:0,providerCalls:0,fixtureLookups:0,rescheduled:0,reason:'NO_OVERDUE_OPEN_BETS',dates:[]};
 if(await providerBlocked())return{settled:0,providerCalls:0,fixtureLookups:0,rescheduled:0,reason:'PROVIDER_BLOCKED_BY_QUOTA_GUARD',dates:[]};
 const lastMs=new Date(state.settlementProbe?.lastProviderProbeAt||0).getTime();
 const cooldownActive=Number.isFinite(lastMs)&&lastMs>0&&nowMs-lastMs<RESULT_PROBE_COOLDOWN_MIN*60000;
 const activeDates=new Set(overdue.map(b=>brusselsDate(new Date(b.kickoff))));
 const history=state.settlementProbe.providerDateLastProbeAt&&typeof state.settlementProbe.providerDateLastProbeAt==='object'?state.settlementProbe.providerDateLastProbeAt:{};
 for(const date of Object.keys(history))if(!activeDates.has(date))delete history[date];
 state.settlementProbe.providerDateLastProbeAt=history;
 const dates=cooldownActive?[]:selectProviderProbeDates(state,overdue);
 let settled=0,calls=0,error=null,fixtureLookups=0,rescheduled=0;
 state.settlementProbe.lastProviderError=null;

 for(const date of dates){
  let fixtures;
  history[date]=now;
  try{calls++;fixtures=await fetchFixtures(date)}
  catch(e){error=String(e?.message||e);state.settlementProbe.lastProviderError=error;break}
  const byId=new Map(fixtures.map(f=>[String(f?.fixture?.id),f]));
  for(const bet of overdue){
   if(bet.status!=='OPEN'||brusselsDate(new Date(bet.kickoff))!==date)continue;
   const fixture=byId.get(String(bet.fixtureId));
   if(!fixture)continue;
   const rec=reconcileProviderFixture(state,bet,fixture,now,'API_FOOTBALL_TRAINING_DATE_SETTLEMENT');
   if(rec.settled)settled++;
   if(rec.rescheduled)rescheduled++;
  }
 }

 if(!error){
  const eligible=overdue
   .filter(b=>b.status==='OPEN')
   .filter(b=>{const ms=new Date(b?.providerTracking?.lastCheckedAt||0).getTime();return !Number.isFinite(ms)||ms<=0||nowMs-ms>=RESULT_PROBE_COOLDOWN_MIN*60000})
   .sort((a,b)=>{const am=new Date(a?.providerTracking?.lastCheckedAt||0).getTime()||0,bm=new Date(b?.providerTracking?.lastCheckedAt||0).getTime()||0;return am-bm||new Date(a.kickoff||0)-new Date(b.kickoff||0)})
   .slice(0,MAX_PROVIDER_FIXTURE_LOOKUPS_PER_RUN);
  for(const bet of eligible){
   let fixture;
   try{calls++;fixtureLookups++;fixture=await fetchFixtureById(bet.fixtureId)}
   catch(e){error=String(e?.message||e);state.settlementProbe.lastProviderError=error;break}
   if(!fixture){bet.providerTracking={...(bet.providerTracking||{}),lastCheckedAt:now,providerStatus:'NOT_FOUND',providerKickoff:null,source:'API_FOOTBALL_TRAINING_FIXTURE_ID_RECOVERY'};continue}
   const rec=reconcileProviderFixture(state,bet,fixture,now,'API_FOOTBALL_TRAINING_FIXTURE_ID_RECOVERY');
   if(rec.settled)settled++;
   if(rec.rescheduled)rescheduled++;
  }
 }

 if(calls>0){
  state.settlementProbe.lastProviderProbeAt=now;
  state.settlementProbe.lastProviderDates=dates.length?dates:state.settlementProbe.lastProviderDates||[];
 }
 state.settlementProbe.providerCalls=n(state.settlementProbe.providerCalls,0)+calls;
 state.integrity.providerCalls=state.settlementProbe.providerCalls;
 const reason=error?'PROVIDER_ERROR':settled?'SETTLED_FROM_PROVIDER':rescheduled?'RESCHEDULED_FROM_PROVIDER':cooldownActive&&fixtureLookups===0?'PROVIDER_PROBE_COOLDOWN':'PROVIDER_CHECK_NO_FINAL_RESULT';
 return{settled,providerCalls:calls,fixtureLookups,rescheduled,reason,dates,error};
}
function view(state,run={}){
 const rows=Object.values(state.bets).sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt));
 const decided=rows.filter(x=>['WIN','LOSS'].includes(x.status)),voids=rows.filter(x=>x.status==='VOID').length,wins=decided.filter(x=>x.status==='WIN').length,losses=decided.filter(x=>x.status==='LOSS').length;
 const visible=rows.slice(0,200),included=new Set(visible.map(x=>x.id));
 for(const row of rows)if(row.status==='OPEN'&&!included.has(row.id)){visible.push(row);included.add(row.id)}
 const openRows=rows.filter(x=>x.status==='OPEN'),postponedOpen=openRows.filter(x=>['PST','TBD'].includes(String(x?.providerTracking?.providerStatus||'').toUpperCase())).length,rescheduledOpen=openRows.filter(x=>Boolean(x.originalKickoff)).length;return{version:state.version,generatedAt:new Date().toISOString(),summary:{bankroll:state.bankroll,pnl:Number((state.bankroll-INITIAL_BANKROLL).toFixed(2)),tracked:rows.length,open:openRows.length,overdueOpen:overdueOpen(state,Date.now()).length,postponedOpen,rescheduledOpen,settled:decided.length+voids,wins,losses,voids,hitRatePct:decided.length?Number((wins/decided.length*100).toFixed(1)):null,totalStaked:state.totalStaked},run,settlementProbe:state.settlementProbe,integrity:state.integrity,bets:visible};
}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({ok:false,status:'BLOCKED',reason:'TRAINING_STORAGE_AUTH_INCOMPLETE',error:'Training storage unavailable'});let state=ensure(await readJsonFresh(STATE,null));const mode=String(requestQuery(req)?.mode||'view').toLowerCase();if(mode!=='run')return res.status(200).json(view(state,{mode:'VIEW_ONLY',mutated:false}));if(!authorized(req))return res.status(401).json({error:'Unauthorized'});const now=new Date().toISOString(),nowMs=Date.now(),plan=await readJsonFresh(PLAN,{generatedAt:null,plan:[]}),generatedMs=new Date(plan?.generatedAt||0).getTime(),ageMin=Number.isFinite(generatedMs)&&generatedMs>0?(nowMs-generatedMs)/60000:null;let captured=0,settledLedger=await settleFromLedger(state,now),providerRun=await settleFromProvider(state,now,nowMs),settled=settledLedger+providerRun.settled,reason='OK',rejections={};if(ageMin==null||ageMin>MAX_PLAN_AGE_MIN){reason='DECISION_PLAN_STALE_OR_MISSING'}else{for(const row of plan.plan||[]){if(captured>=MAX_CAPTURE_PER_RUN)break;if(Object.values(state.bets).filter(x=>x.status==='OPEN').length>=MAX_OPEN){reason='MAX_OPEN_REACHED';break}if(Object.values(state.bets).some(x=>String(x.fixtureId)===String(row.fixtureId)))continue;const q=qualify(row,nowMs);if(!q.ok){rejections[q.reason]=(rejections[q.reason]||0)+1;continue}const c=q.candidate,pct=stakePct(row,c),amount=Number((state.bankroll*pct/100).toFixed(2)),id=`TRN-${row.fixtureId}-${Date.now()}`;state.bets[id]={id,trainingOnly:true,fixtureId:row.fixtureId,competition:row.competition||null,home:row.home||null,away:row.away||null,kickoff:row.kickoff,selection:canonical(c.selection||c.side),selectionLabel:c.label||c.selection||c.side,marketType:c.marketType||null,odds:n(c.odds),entryOdds:n(c.odds),latestOdds:n(c.odds),probability:n(c.probability),modelProbability:n(c.modelProbability),marketProbability:n(c.marketProbability),edgePct:n(c.edgePct),rawEdgePct:n(c.rawEdgePct),evPct:n(c.evPct),confidence:n(row.netConfidence??row.confidence),dataQuality:n(row.dataQuality??c.dataQuality),marketFusion:c.marketFusion||null,officialVerdict:row.finalVerdict||row.verdict||null,officialBetEligible:false,stakePct:pct,stakeAmount:amount,capturedAt:now,status:'OPEN',pnl:null,reason:q.reason,integrity:{paperOnly:true,trainingOnly:true,noRealMoney:true,countsAsOfficialTrackRecord:false,prospectiveCapture:true,pricedMarketRequired:true,positiveEvRequired:true}};state.totalStaked=Number((state.totalStaked+amount).toFixed(2));captured++}}
state.lastRunAt=now;state.updatedAt=now;try{await writeJson(STATE,state)}catch(error){console.error('[training-bets] persistence failed',{message:String(error?.message||error)});return res.status(503).json({ok:false,status:'BLOCKED',reason:'TRAINING_STATE_WRITE_FAILED',retryable:true,capturedNotPersisted:captured,settledNotPersisted:settled,error:String(error?.message||error)})}return res.status(200).json(view(state,{mode:'RUN',mutated:true,persisted:true,captured,settled,settledLedger,settledProvider:providerRun.settled,providerCalls:providerRun.providerCalls,providerFixtureLookups:providerRun.fixtureLookups||0,providerRescheduled:providerRun.rescheduled||0,providerSettlementReason:providerRun.reason,providerSettlementDates:providerRun.dates,providerSettlementError:providerRun.error||null,reason,decisionPlanGeneratedAt:plan?.generatedAt||null,decisionPlanAgeMinutes:ageMin==null?null:Number(ageMin.toFixed(1)),planRows:Array.isArray(plan?.plan)?plan.plan.length:0,rejections,thresholds:{edgeMinPct:.5,evPositive:true,confidenceMin:MIN_TRAINING_CONFIDENCE,dataQualityMin:MIN_TRAINING_QUALITY,maxStakePct:MAX_STAKE_PCT,maxCapturePerRun:MAX_CAPTURE_PER_RUN,maxOpen:MAX_OPEN,resultProbeAfterMinutes:RESULT_PROBE_AFTER_MIN,resultProbeCooldownMinutes:RESULT_PROBE_COOLDOWN_MIN}}))}
