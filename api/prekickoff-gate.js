import { readJson, writeJson, storageReady } from './_report-store.js';

const STATE_PATH='argus/autopilot/prekickoff-gates.json';
const WINDOWS=[60,30,10];
function n(v,f=0){if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f}
function implied(o){return n(o)>1?1/n(o):0}
function probs(match){const p=match?.preMatchModel;if(!p)return null;const h=Math.max(0,n(p.home)),d=Math.max(0,n(p.draw)),a=Math.max(0,n(p.away)),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function market(match){const m=match?.markets||{},h=implied(m.home),d=implied(m.draw),a=implied(m.away),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function bestEdge(match){const p=probs(match),m=market(match);if(!p||!m)return null;return ['home','draw','away'].map(side=>({side,probability:p[side],market:m[side],edge:(p[side]-m[side])*100,odd:n(match.markets?.[side])})).sort((a,b)=>b.edge-a.edge)[0]}
function minutesToKickoff(match){const t=new Date(match?.kickoff||0).getTime();return Number.isFinite(t)?Math.round((t-Date.now())/60000):99999}
function gateWindow(minutes){return WINDOWS.find(w=>minutes<=w&&minutes>=(w===10?0:Math.max(0,w-9)))||null}
function evaluate(match,availability){
 const minutes=minutesToKickoff(match),window=gateWindow(minutes),edge=bestEdge(match),av=availability||{},issues=[];
 const history=Boolean(match?.history90d?.home&&match?.history90d?.away);
 const odds=Boolean(match?.markets?.home&&match?.markets?.draw&&match?.markets?.away);
 const model=Boolean(match?.preMatchModel);
 if(!history)issues.push('HISTORY_INCOMPLETE');if(!odds)issues.push('MARKET_MISSING');if(!model)issues.push('MODEL_MISSING');
 if(window===10&&!av.lineupsConfirmed)issues.push('LINEUPS_NOT_CONFIRMED');
 const criticalHome=(match?.playerImpact?.home?.criticalAbsences||[]).length,criticalAway=(match?.playerImpact?.away?.criticalAbsences||[]).length;
 if(window===10&&(criticalHome+criticalAway)>0)issues.push('CRITICAL_ABSENCE_REVIEW');
 if(edge&&edge.edge<3)issues.push('EDGE_BELOW_FLOOR');
 const hardBlock=issues.some(x=>['HISTORY_INCOMPLETE','MARKET_MISSING','MODEL_MISSING','LINEUPS_NOT_CONFIRMED'].includes(x));
 const status=hardBlock?'BLOCKED':issues.length?'CAUTION':'CONFIRMED';
 return {fixtureId:match.id,home:match.home,away:match.away,kickoff:match.kickoff,minutesToKickoff:minutes,windowMinutes:window,status,issues,bestCandidate:edge,lineupsConfirmed:Boolean(av.lineupsConfirmed),homeAbsences:n(av.home?.absenceCount),awayAbsences:n(av.away?.absenceCount),criticalHomeAbsences:criticalHome,criticalAwayAbsences:criticalAway,checkedAt:new Date().toISOString(),carriedForward:false,policy:'Final gate requires confirmed lineups. Critical absences force caution. The gate may downgrade or block but cannot create PRIME.'};
}
function carryForward(prev,match){if(!prev)return null;const minutes=minutesToKickoff(match);if(minutes<0||minutes>60)return null;const previousWindow=n(prev.windowMinutes,null);if(![60,30,10].includes(previousWindow))return null;const nextBoundary=previousWindow===60?30:previousWindow===30?10:-1;if(minutes<=previousWindow&&minutes>nextBoundary)return{...prev,minutesToKickoff:minutes,carriedForward:true,carriedFromWindow:previousWindow,carriedAt:new Date().toISOString()};return null}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const matches=Array.isArray(req.body?.matches)?req.body.matches:[],availability=req.body?.availability||{},candidates=matches.filter(m=>!m.isLive&&!m.isFinished&&minutesToKickoff(m)>=0&&minutesToKickoff(m)<=69);
 const previous=storageReady()?await readJson(STATE_PATH,{gates:[]}):{gates:[]},previousById=new Map((previous?.gates||[]).map(g=>[String(g.fixtureId),g])),gates=[];
 for(const m of candidates){const window=gateWindow(minutesToKickoff(m));if(window){gates.push(evaluate(m,availability[String(m.id)]||null));continue}const carried=carryForward(previousById.get(String(m.id)),m);if(carried)gates.push(carried)}
 const state={version:'PREKICKOFF-GATE-4',generatedAt:new Date().toISOString(),windows:WINDOWS,summary:{checked:gates.filter(g=>!g.carriedForward).length,carried:gates.filter(g=>g.carriedForward).length,confirmed:gates.filter(g=>g.status==='CONFIRMED').length,caution:gates.filter(g=>g.status==='CAUTION').length,blocked:gates.filter(g=>g.status==='BLOCKED').length,lineupsConfirmed:gates.filter(g=>g.lineupsConfirmed).length,criticalAbsenceReviews:gates.filter(g=>g.issues?.includes('CRITICAL_ABSENCE_REVIEW')).length},policy:{windows:WINDOWS,lastGatePersistsUntilNextWindow:true,blockedPersistsUntilRecheck:true,finalGatePersistsThroughKickoff:true,finalGateRequiresConfirmedLineups:true,criticalAbsenceMayDowngrade:true,automaticBetPlacement:false},gates};
 if(storageReady())try{await writeJson(STATE_PATH,state)}catch(_){}
 return res.status(200).json(state);
}
