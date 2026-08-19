import { readJson, storageReady } from './_report-store.js';

function n(v,f=0){if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f}
function implied(o){return n(o)>1?1/n(o):0}
function marketProb(m={}){const h=implied(m.home),d=implied(m.draw),a=implied(m.away),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function modelProb(m){const p=m?.preMatchModel;if(!p)return null;const h=Math.max(0,n(p.home)),d=Math.max(0,n(p.draw)),a=Math.max(0,n(p.away)),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function candidate(m){const p=modelProb(m),q=marketProb(m?.markets);if(!p||!q)return null;return ['home','draw','away'].map(side=>({side,probability:p[side],marketProbability:q[side],edgePct:(p[side]-q[side])*100,odds:n(m.markets?.[side])})).sort((a,b)=>b.edgePct-a.edgePct)[0]}
function explicitQuality(m){const raw=m?.dataQuality??m?.quality;if(raw===null||raw===undefined||raw==='')return null;const x=Number(raw);return Number.isFinite(x)?Math.max(0,Math.min(100,x)):null}
function derivedQuality(m){let q=0;const model=modelProb(m),market=marketProb(m?.markets),hh=m?.history90d?.home,ah=m?.history90d?.away;if(model)q+=30;if(market)q+=25;if(hh&&n(hh.matches,0)>=3)q+=15;if(ah&&n(ah.matches,0)>=3)q+=15;if(m?.kickoff&&m?.home&&m?.away)q+=5;if(m?.competition)q+=5;if(n(m?.marketOdds?.coverage,0)>0)q+=5;return Math.max(0,Math.min(100,q))}
function quality(m){const explicit=explicitQuality(m);return explicit==null?derivedQuality(m):explicit}
function qualitySource(m){return explicitQuality(m)==null?'DERIVED_FROM_PRESENT_EVIDENCE':'UPSTREAM_EXPLICIT'}
function confBucket(v){const x=n(v,null);if(x==null)return'UNKNOWN';const lo=Math.floor(x/10)*10;return`${lo}-${lo+9}`}
function oddsBucket(v){const x=n(v,null);if(x==null||x<=1)return'NO_PRICE';if(x<1.5)return'<1.50';if(x<1.8)return'1.50-1.79';if(x<2.2)return'1.80-2.19';if(x<3)return'2.20-2.99';return'3.00+'}
function regimeKey(m){return String(m?.marketRegime?.regime||m?.matchContext?.regime?.type||m?.matchContext?.regime?.regime||'UNKNOWN').toUpperCase()}
function attrPenalty(m,c,attr){if(!attr||!c)return{penalty:0,reasons:[]};const profiles=[['LEAGUE',attr.byLeague?.[m?.competition||'UNKNOWN']],['SELECTION',attr.bySelection?.[String(c.side||'UNKNOWN').toUpperCase()]],['CONFIDENCE',attr.byConfidence?.[confBucket((m?.confidence??c.probability*100))]],['ODDS',attr.byOdds?.[oddsBucket(c.odds)]],['REGIME',attr.byRegime?.[regimeKey(m)]]];let penalty=0,reasons=[];for(const [name,p] of profiles){if(!p||n(p.sample,0)<20||n(p.penalty,0)<=0)continue;penalty=Math.max(penalty,n(p.penalty,0));reasons.push(`ATTR_${name}_${p.status}`)}return{penalty:Math.min(8,penalty),reasons}}
function confidence(m,c,extraPenalty=0){const base=Math.max(0,Math.min(100,n(m?.confidence,c?.probability*100)));const penalty=Math.max(0,n(m?.confidencePenalty,0)+n(extraPenalty,0));return{raw:base,penalty,net:Math.max(0,Math.min(100,base-penalty))}}
function verdictFor(m,gate,attr){
 const c=candidate(m),q=quality(m),qSource=qualitySource(m),ap=attrPenalty(m,c,attr),conf=confidence(m,c,ap.penalty),regime=String(m?.marketRegime?.regime||'UNKNOWN'),movement=String(m?.marketRegime?.directionalStatus||'NEUTRAL'),timing=String(m?.marketRegime?.timingAction||'LEARNING'),issues=[...ap.reasons],positive=[];
 if(!c)return{verdict:'NO BET',eligible:false,issues:['MODEL_OR_MARKET_MISSING'],positive,confidence:conf,candidate:null,attributionPenalty:0,dataQuality:q,dataQualitySource:qSource};
 const gateBlocked=gate?.status==='BLOCKED';
 if(gateBlocked)issues.push(...(gate.issues?.length?gate.issues:['PREKICKOFF_BLOCKED']));
 if(q<55)issues.push('LOW_DATA_QUALITY');
 if(c.odds<=1)issues.push('ODDS_MISSING');
 if(c.edgePct<2)issues.push('EDGE_TOO_SMALL');
 if(conf.net<48)issues.push('CONFIDENCE_TOO_LOW');
 if(['STALE','WIDE'].includes(regime))issues.push(`MARKET_${regime}`);
 if(regime==='VOLATILE')issues.push('MARKET_VOLATILE');
 if(movement==='REVERSAL')issues.push('MARKET_REVERSAL');
 if(movement==='ADVERSE_STEAM')issues.push('MARKET_ADVERSE_STEAM');
 if(movement==='ADVERSE_DRIFT')issues.push('MARKET_ADVERSE_DRIFT');
 if(timing==='WAIT')issues.push('TIMING_WAIT');
 if(m?.isFinished)issues.push('MATCH_FINISHED');
 if(c.edgePct>=3)positive.push(`EDGE_${c.edgePct.toFixed(1)}%`);
 if(conf.net>=60)positive.push(`CONFIDENCE_${conf.net.toFixed(0)}%`);
 if(q>=70)positive.push(`QUALITY_${q.toFixed(0)}`);
 if(gate?.status==='CONFIRMED')positive.push('PREKICKOFF_CONFIRMED');
 if(regime==='STABLE')positive.push('MARKET_STABLE');
 if(['CONFIRMING_MOVE','CONFIRMING_STEAM'].includes(movement))positive.push(`MARKET_${movement}`);
 if(timing==='TAKE_NOW')positive.push('TIMING_TAKE_NOW_EVIDENCE');
 const hard=gateBlocked||movement==='REVERSAL'||issues.some(x=>['MODEL_OR_MARKET_MISSING','ODDS_MISSING','MATCH_FINISHED','LINEUPS_NOT_CONFIRMED','HISTORY_INCOMPLETE','MARKET_MISSING','MODEL_MISSING','PREKICKOFF_BLOCKED'].includes(x));
 let verdict='NO BET',eligible=false;
 if(!hard){
   if(c.edgePct>=6&&conf.net>=68&&q>=70&&gate?.status!=='CAUTION'&&!['VOLATILE','STALE','WIDE'].includes(regime)&&movement!=='ADVERSE_STEAM'){verdict='PRIME';eligible=true}
   else if(c.edgePct>=3.5&&conf.net>=58&&q>=60&&!['STALE','WIDE'].includes(regime)&&movement!=='ADVERSE_STEAM'){verdict='VALUE';eligible=true}
   else if(c.edgePct>=2&&conf.net>=48){verdict='WATCH';eligible=false}
 }
 if(timing==='WAIT'&&['PRIME','VALUE'].includes(verdict)){verdict='WATCH';eligible=false}
 if(movement==='ADVERSE_STEAM'&&['PRIME','VALUE'].includes(verdict)){verdict='WATCH';eligible=false}
 if(movement==='ADVERSE_DRIFT'&&verdict==='PRIME')verdict='VALUE';
 if(issues.includes('MARKET_VOLATILE')&&verdict==='PRIME')verdict='VALUE';
 if(issues.includes('MARKET_VOLATILE')&&verdict==='VALUE')verdict='WATCH',eligible=false;
 if(issues.includes('LOW_DATA_QUALITY')&&verdict==='VALUE')verdict='WATCH',eligible=false;
 if(gate?.status==='CAUTION'&&verdict==='PRIME')verdict='VALUE';
 if(ap.penalty>=8&&verdict==='PRIME')verdict='VALUE';
 if(ap.penalty>=8&&verdict==='VALUE')verdict='WATCH',eligible=false;
 if(gateBlocked||movement==='REVERSAL'){verdict='NO BET';eligible=false}
 return{verdict,eligible,issues:[...new Set(issues)],positive,candidate:{...c,edgePct:Number(c.edgePct.toFixed(2)),probability:Number(c.probability.toFixed(4)),marketProbability:Number(c.marketProbability.toFixed(4))},confidence:{raw:Number(conf.raw.toFixed(1)),penalty:Number(conf.penalty.toFixed(1)),net:Number(conf.net.toFixed(1))},dataQuality:Number(q.toFixed(1)),dataQualitySource:qSource,marketRegime:regime,marketMovement:movement,marketMovementPct:m?.marketRegime?.selectedMovePct??null,timingAction:timing,timingReason:m?.marketRegime?.timingReason??null,timingTimeBucket:m?.marketRegime?.timingTimeBucket??null,gateStatus:gate?.status||null,attributionPenalty:ap.penalty,attributionReasons:ap.reasons};
}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const matches=Array.isArray(req.body?.matches)?req.body.matches:[],gates=Array.isArray(req.body?.preKickoffGates)?req.body.preKickoffGates:[],gm=new Map(gates.map(g=>[String(g.fixtureId),g]));let attr=null;if(storageReady())try{attr=await readJson('argus/learning/error-attribution.json',null)}catch(_){}const decisions={};for(const m of matches)decisions[String(m.id)]={fixtureId:m.id,home:m.home,away:m.away,kickoff:m.kickoff,...verdictFor(m,gm.get(String(m.id)),attr)};const vals=Object.values(decisions);return res.status(200).json({ok:true,version:'BET-ELIGIBILITY-7',generatedAt:new Date().toISOString(),summary:{total:vals.length,prime:vals.filter(x=>x.verdict==='PRIME').length,value:vals.filter(x=>x.verdict==='VALUE').length,watch:vals.filter(x=>x.verdict==='WATCH').length,noBet:vals.filter(x=>x.verdict==='NO BET').length,eligible:vals.filter(x=>x.eligible).length,timingWait:vals.filter(x=>x.timingAction==='WAIT').length,timingTakeNow:vals.filter(x=>x.timingAction==='TAKE_NOW').length,attributionPenalized:vals.filter(x=>n(x.attributionPenalty,0)>0).length,preKickoffBlocked:vals.filter(x=>x.gateStatus==='BLOCKED').length,marketReversals:vals.filter(x=>x.marketMovement==='REVERSAL').length,adverseSteam:vals.filter(x=>x.marketMovement==='ADVERSE_STEAM').length,confirmingSteam:vals.filter(x=>x.marketMovement==='CONFIRMING_STEAM').length,derivedQuality:vals.filter(x=>x.dataQualitySource==='DERIVED_FROM_PRESENT_EVIDENCE').length},policy:{primeEdgeMinPct:6,primeConfidenceMin:68,primeQualityMin:70,valueEdgeMinPct:3.5,valueConfidenceMin:58,valueQualityMin:60,watchEdgeMinPct:2,primeMayBeCreatedOnlyHere:true,gateCanBlock:true,blockedGateIsHardVeto:true,marketReversalIsHardVeto:true,adverseSteamCannotBeActionable:true,timingWaitSuspendsActionability:true,takeNowCannotPromote:true,confirmingMovementCannotPromote:true,qualityMayBeDerivedOnlyFromPresentEvidence:true,confidencePenaltiesApplied:true,errorAttributionApplied:true,maxAttributionPenalty:8,positiveAttributionCannotPromote:true,marketRegimeApplied:true,directionalMarketMovementApplied:true,rule:'Final verdict is evidence-based and downgrade-first. Learned WAIT timing suspends actionability; TAKE_NOW is advisory only and never upgrades a verdict.'},decisions})}
