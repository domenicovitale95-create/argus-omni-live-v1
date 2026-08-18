import { readJson, writeJson, storageReady } from './_report-store.js';

const STATE_PATH='argus/autopilot/prekickoff-gates.json';
const WINDOWS=[60,30,10];
function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function implied(o){return n(o)>1?1/n(o):0}
function probs(match){const p=match?.preMatchModel;if(!p)return null;const h=Math.max(0,n(p.home)),d=Math.max(0,n(p.draw)),a=Math.max(0,n(p.away)),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function market(match){const m=match?.markets||{},h=implied(m.home),d=implied(m.draw),a=implied(m.away),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function bestEdge(match){const p=probs(match),m=market(match);if(!p||!m)return null;return ['home','draw','away'].map(side=>({side,probability:p[side],market:m[side],edge:(p[side]-m[side])*100,odd:n(match.markets?.[side])})).sort((a,b)=>b.edge-a.edge)[0]}
function minutesToKickoff(match){const t=new Date(match?.kickoff||0).getTime();return Number.isFinite(t)?Math.round((t-Date.now())/60000):99999}
function gateWindow(minutes){return WINDOWS.find(w=>minutes<=w&&minutes>=Math.max(0,w-9))||null}
function evaluate(match,availability){
 const minutes=minutesToKickoff(match),window=gateWindow(minutes),edge=bestEdge(match),av=availability||{},issues=[];
 const history=Boolean(match?.history90d?.home&&match?.history90d?.away);
 const odds=Boolean(match?.markets?.home&&match?.markets?.draw&&match?.markets?.away);
 const model=Boolean(match?.preMatchModel);
 if(!history)issues.push('HISTORY_INCOMPLETE');if(!odds)issues.push('MARKET_MISSING');if(!model)issues.push('MODEL_MISSING');
 if(window===10&&!av.lineupsConfirmed)issues.push('LINEUPS_NOT_CONFIRMED');
 if(edge&&edge.edge<3)issues.push('EDGE_BELOW_FLOOR');
 const hardBlock=issues.some(x=>['HISTORY_INCOMPLETE','MARKET_MISSING','MODEL_MISSING','LINEUPS_NOT_CONFIRMED'].includes(x));
 const status=hardBlock?'BLOCKED':issues.length?'CAUTION':'CONFIRMED';
 return {fixtureId:match.id,home:match.home,away:match.away,kickoff:match.kickoff,minutesToKickoff:minutes,windowMinutes:window,status,issues,bestCandidate:edge,lineupsConfirmed:Boolean(av.lineupsConfirmed),homeAbsences:n(av.home?.absenceCount),awayAbsences:n(av.away?.absenceCount),checkedAt:new Date().toISOString(),policy:'Gate validates freshness and evidence only. It cannot create a PRIME verdict by itself.'};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const matches=Array.isArray(req.body?.matches)?req.body.matches:[],availability=req.body?.availability||{};
 const candidates=matches.filter(m=>!m.isLive&&!m.isFinished&&minutesToKickoff(m)>=0&&minutesToKickoff(m)<=69);
 const gates=candidates.map(m=>evaluate(m,availability[String(m.id)]||null)).filter(g=>g.windowMinutes);
 const state={version:'PREKICKOFF-GATE-1',generatedAt:new Date().toISOString(),windows:WINDOWS,summary:{checked:gates.length,confirmed:gates.filter(g=>g.status==='CONFIRMED').length,caution:gates.filter(g=>g.status==='CAUTION').length,blocked:gates.filter(g=>g.status==='BLOCKED').length},gates};
 if(storageReady())try{await writeJson(STATE_PATH,state)}catch(_){}
 return res.status(200).json(state);
}
