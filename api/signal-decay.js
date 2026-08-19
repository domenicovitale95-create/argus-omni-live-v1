import { readJson, storageReady } from './_report-store.js';

const TZ='Europe/Brussels';
function dateTZ(v=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(v);const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
function n(v,f=null){const x=Number(v);return Number.isFinite(x)?x:f}
function implied(o){const x=n(o);return x&&x>1?1/x:0}
function probs(m={}){const h=implied(m.home),d=implied(m.draw),a=implied(m.away),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function model(m){const p=m?.preMatchModel;if(!p)return null;const h=Math.max(0,n(p.home,0)),d=Math.max(0,n(p.draw,0)),a=Math.max(0,n(p.away,0)),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function currentCandidate(m){const p=model(m),q=probs(m?.markets);if(!p||!q)return null;return ['home','draw','away'].map(side=>({side,edge:(p[side]-q[side])*100,odds:n(m.markets?.[side])})).sort((a,b)=>b.edge-a.edge)[0]}
function normSelection(s){const x=String(s||'').toUpperCase();if(x.includes('HOME'))return'home';if(x.includes('DRAW'))return'draw';if(x.includes('AWAY'))return'away';return null}
function actionable(s){return ['PRIME','VALUE','WATCH'].some(x=>String(s?.classification||'').toUpperCase().startsWith(x))}
function latestActionable(fixture){return (fixture?.snapshots||[]).filter(s=>s.phase==='PREMATCH'&&actionable(s)).sort((a,b)=>new Date(a.recordedAt)-new Date(b.recordedAt)).pop()||null}
function profile(match,archiveFixture){
 const prev=latestActionable(archiveFixture),cur=currentCandidate(match),marketAge=n(match?.marketRegime?.lastAgeMinutes),now=Date.now();
 if(!prev)return{status:'NEW',penalty:0,betEligible:true,reason:'No prior actionable signal to decay',ageMinutes:null,retentionPct:null,previousSelection:null,currentSelection:cur?.side||null};
 const age=Math.max(0,(now-new Date(prev.recordedAt).getTime())/60000),prevSide=normSelection(prev.selection),prevEdge=n(prev.edge),sameSide=Boolean(prevSide&&cur?.side===prevSide),retention=prevEdge&&prevEdge>0&&cur?Math.max(0,cur.edge/prevEdge*100):null,oddsMove=prev.odds&&cur?.odds?((cur.odds/prev.odds)-1)*100:null;
 let status='REVALIDATED',penalty=0,eligible=true,reason='Signal survived current evidence';
 if(!cur||cur.odds<=1){status='EXPIRED';penalty=10;eligible=false;reason='Current model or market evidence missing'}
 else if(!sameSide){status='EXPIRED';penalty=10;eligible=false;reason='Best model side changed since the frozen signal'}
 else if(cur.edge<2){status='EXPIRED';penalty=10;eligible=false;reason='Current edge fell below the minimum signal floor'}
 else if(marketAge!=null&&marketAge>45){status='EXPIRED';penalty=8;eligible=false;reason='Market evidence is too stale to preserve the signal'}
 else if(retention!=null&&retention<45){status='DECAYING';penalty=6;eligible=false;reason='Less than 45% of the original edge survives'}
 else if(retention!=null&&retention<70){status='AGING';penalty=3;eligible=cur.edge>=3.5;reason='Original edge has weakened materially'}
 else if(oddsMove!=null&&Math.abs(oddsMove)>=8){status='AGING';penalty=3;eligible=cur.edge>=3.5;reason='Price moved materially since the frozen signal'}
 else if(age>90){status='REVALIDATED';penalty=1;eligible=true;reason='Old signal remains valid only because current evidence still revalidates it'}
 return{status,penalty,betEligible:eligible,reason,ageMinutes:Number(age.toFixed(1)),retentionPct:retention==null?null:Number(retention.toFixed(1)),previousSelection:prevSide,currentSelection:cur?.side||null,previousEdge:prevEdge,currentEdge:cur?Number(cur.edge.toFixed(2)):null,previousOdds:n(prev.odds),currentOdds:cur?.odds??null,oddsMovePct:oddsMove==null?null:Number(oddsMove.toFixed(2)),marketAgeMinutes:marketAge,previousRecordedAt:prev.recordedAt,governance:{mayCreatePrime:false,mayUpgradeVerdict:false,mayDowngrade:true,expiredIsVeto:true}};
}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(200).json({ok:true,version:'SIGNAL-DECAY-1',signals:{},storage:false});const matches=Array.isArray(req.body?.matches)?req.body.matches:[],byDate=new Map(),signals={};for(const m of matches){const date=dateTZ(new Date(m.kickoff||Date.now()));if(!byDate.has(date))byDate.set(date,await readJson(`argus/predictions/${date}.json`,{fixtures:{}}));const archive=byDate.get(date);signals[String(m.id)]={fixtureId:m.id,...profile(m,archive?.fixtures?.[String(m.id)])}}const vals=Object.values(signals);return res.status(200).json({ok:true,version:'SIGNAL-DECAY-1',generatedAt:new Date().toISOString(),summary:{total:vals.length,new:vals.filter(x=>x.status==='NEW').length,revalidated:vals.filter(x=>x.status==='REVALIDATED').length,aging:vals.filter(x=>x.status==='AGING').length,decaying:vals.filter(x=>x.status==='DECAYING').length,expired:vals.filter(x=>x.status==='EXPIRED').length},policy:{edgeFloorPct:2,staleMarketMinutes:45,decayRetentionFloorPct:45,agingRetentionFloorPct:70,expiredSignalIsHardVeto:true,positiveDecayEvidenceCannotPromote:true,automaticBetPlacement:false},signals})}
