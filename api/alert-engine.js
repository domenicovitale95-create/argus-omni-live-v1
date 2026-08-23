import { readJson, writeJson, storageReady } from './_report-store.js';

const ALERT_STATE='argus/alerts/state.json';
const ALERT_FEED='argus/alerts/feed.json';
const FINISHED=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO']);
const now=()=>new Date().toISOString();
function n(v,f=0){if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f}
function dateTZ(v=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(v);const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
function keyOf(x){return `${x.fixtureId}|${x.selection||x.eligibilityCandidate?.side||''}|${x.finalVerdict||''}|${x.isLive?'LIVE':'PRE'}`}
function regimeRisk(row){return n(row.matchContext?.regime?.riskScore,row.contextRegime?.riskScore||0)}
function candidateEdge(row){return n(row.eligibilityCandidate?.edgePct,row.eligibilityCandidate?.edge??row.edge)}
function quality(row){let s=n(row.score);if(row.finalVerdict==='PRIME')s+=12;else if(row.finalVerdict==='VALUE')s+=5;if(row.betEligible)s+=8;if(row.preKickoffGate==='CONFIRMED')s+=5;if(row.lineupsConfirmed)s+=4;if(row.portfolioBlocked)s-=30;if(row.marketRegime==='VOLATILE'||row.marketRegime?.regime==='VOLATILE')s-=10;if(row.preKickoffGate==='BLOCKED')s-=25;const conf=n(row.netConfidence,row.confidence),edge=candidateEdge(row);if(conf>=75)s+=5;else if(conf>=70)s+=3;if(edge>=6)s+=5;else if(edge>=4)s+=2;if(row.portfolioRankScore!=null&&n(row.portfolioRankScore)>=80)s+=3;const rr=regimeRisk(row);if(rr>=65)s-=14;else if(rr>=35)s-=6;return Math.max(0,Math.min(100,Math.round(s)))}
function tier(sc){return sc>=94?'CRITICAL':sc>=88?'HIGH':'ELEVATED'}
function finished(row){return Boolean(row?.isFinished)||FINISHED.has(String(row?.status||'').toUpperCase())}
function qualifiesPrematch(row){if(!row||row.isLive||finished(row)||row.portfolioBlocked||!row.betEligible)return false;if(!['PRIME','VALUE'].includes(row.finalVerdict))return false;if(regimeRisk(row)>=65)return false;const s=quality(row),edge=candidateEdge(row),conf=n(row.netConfidence,row.confidence);if(row.finalVerdict==='PRIME')return s>=88&&conf>=65;if(row.finalVerdict==='VALUE')return s>=84&&conf>=70&&edge>=4;return false}
function qualifiesLivePrime(row){if(!row?.isLive||finished(row)||row.portfolioBlocked||!row.betEligible)return false;if(row.finalVerdict!=='PRIME')return false;if(regimeRisk(row)>=55)return false;const s=quality(row),conf=n(row.netConfidence,row.confidence),edge=candidateEdge(row);return s>=90&&conf>=70&&edge>=4}
function reason(row){const out=[];out.push(`${row.finalVerdict} eligible`);if(row.isLive)out.push(`live ${n(row.minute,0)}'`);if(row.lineupsConfirmed)out.push('lineups confirmed');if(row.preKickoffGate==='CONFIRMED')out.push('pre-kickoff gate confirmed');if(n(row.netConfidence)>0)out.push(`confidence ${n(row.netConfidence)}%`);const e=candidateEdge(row);if(e)out.push(`edge ${e.toFixed(1)}%`);const rr=regimeRisk(row);if(rr)out.push(`regime risk ${rr}/100`);return out.join(' · ')}
function movementFor(row,memory){const side=String(row.stakeSelection||row.eligibilityCandidate?.side||'').toLowerCase();if(!['home','draw','away'].includes(side))return null;const f=memory.fixtures?.[String(row.fixtureId)],snaps=(f?.snapshots||[]).filter(x=>x.phase==='PREMATCH'&&n(x.odds?.[side],0)>1);if(snaps.length<2)return null;const first=n(snaps[0].odds[side]),last=n(snaps[snaps.length-1].odds[side]),change=(last-first)/first*100;return{firstOdds:first,lastOdds:last,changePct:Number(change.toFixed(2)),material:Math.abs(change)>=3,direction:change>0?'BETTER_PRICE':'SHORTENING',snapshotCount:snaps.length}}
export default async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Alert storage unavailable'});
  const feedOnly=req.method==='GET'&&String(req.query?.mode||'').toLowerCase()==='feed';
  if(feedOnly){
    res.setHeader('Cache-Control','public, s-maxage=20, stale-while-revalidate=40');
    const feed=await readJson(ALERT_FEED,{alerts:[]});
    return res.status(200).json({version:'ALERT-ENGINE-6',generatedAt:now(),mode:'FEED_ONLY',newAlerts:[],feed:(feed.alerts||[]).slice(0,60),policy:{feedOnly:true,cacheSeconds:20,automaticWagering:false}});
  }
  res.setHeader('Cache-Control','no-store');
  const [plan,memory,state,feed]=await Promise.all([
    readJson('argus/autopilot/decision-plan.json',{plan:[],generatedAt:null}),
    readJson(`argus/market-memory/${dateTZ()}.json`,{fixtures:{}}),
    readJson(ALERT_STATE,{seen:{}}),
    readJson(ALERT_FEED,{alerts:[]})
  ]);
  const ts=Date.now(),cooldownMs=90*60*1000,liveCooldownMs=12*60*1000,newAlerts=[];
  for(const row of plan.plan||[]){
    const livePrime=qualifiesLivePrime(row),prematch=qualifiesPrematch(row);if(!livePrime&&!prematch)continue;
    const k=keyOf(row),prev=state.seen[k],sc=quality(row),odds=n(row.stakeOdds,row.eligibilityCandidate?.odds),movement=movementFor(row,memory),oddsImproved=movement?.material&&movement.direction==='BETTER_PRICE';
    const materiallyBetter=prev&&((odds&&prev.odds&&odds>=prev.odds*1.04)||(sc-prev.score>=6)||(row.lineupsConfirmed&&!prev.lineupsConfirmed)||oddsImproved||(livePrime&&n(row.minute,0)-n(prev.minute,0)>=10));
    const cooldown=livePrime?liveCooldownMs:cooldownMs;if(prev&&ts-prev.sentAt<cooldown&&!materiallyBetter)continue;
    const alert={id:`${k}|${ts}`,createdAt:now(),fixtureId:row.fixtureId,competition:row.competition,home:row.home,away:row.away,kickoff:row.kickoff,isLive:Boolean(row.isLive),minute:row.minute??null,verdict:row.finalVerdict,selection:row.stakeSelection||row.eligibilityCandidate?.side||null,odds:odds||null,confidence:row.netConfidence??null,edgePct:candidateEdge(row),qualityScore:sc,qualityTier:tier(sc),reason:reason(row),risk:(row.eligibilityIssues||[]).slice(0,3),oddsMovement:movement,type:livePrime?'LIVE_PRIME':oddsImproved?'PRICE_IMPROVED':prev?'SIGNAL_UPGRADED':'HIGH_INTEREST',pushEligible:!livePrime&&sc>=88&&(row.finalVerdict==='PRIME'||oddsImproved),siteOnly:livePrime};
    newAlerts.push(alert);state.seen[k]={sentAt:ts,score:sc,odds:odds||null,lineupsConfirmed:Boolean(row.lineupsConfirmed),movementPct:movement?.changePct??null,minute:row.minute??null};
  }
  if(newAlerts.length){feed.alerts=[...newAlerts,...(feed.alerts||[])].slice(0,120);await Promise.all([writeJson(ALERT_FEED,feed),writeJson(ALERT_STATE,state)])}
  return res.status(200).json({version:'ALERT-ENGINE-6',generatedAt:now(),mode:'GENERATE',newAlerts,feed:feed.alerts||[],policy:{primeThreshold:88,valueThreshold:84,pushThreshold:88,livePrimeThreshold:90,livePrimeConfidenceMin:70,livePrimeEdgeMinPct:4,liveRegimeRiskBlock:55,materialOddsMovementPct:3,cooldownMinutes:90,liveCooldownMinutes:12,liveAlerts:true,liveAlertsSiteOnly:true,regimeRiskBlock:65,automaticWagering:false,rule:'Alerts use the canonical eligibility edgePct, CONFIRMED pre-kickoff gates, and all terminal fixture statuses. LIVE PRIME remains on-site review only.'}});
}
