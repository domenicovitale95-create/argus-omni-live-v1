function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function implied(o){return n(o)>1?1/n(o):0}
function marketProb(m={}){const h=implied(m.home),d=implied(m.draw),a=implied(m.away),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function modelProb(m){const p=m?.preMatchModel;if(!p)return null;const h=Math.max(0,n(p.home)),d=Math.max(0,n(p.draw)),a=Math.max(0,n(p.away)),s=h+d+a;return s?{home:h/s,draw:d/s,away:a/s}:null}
function candidate(m){const p=modelProb(m),q=marketProb(m?.markets);if(!p||!q)return null;return ['home','draw','away'].map(side=>({side,probability:p[side],marketProbability:q[side],edgePct:(p[side]-q[side])*100,odds:n(m.markets?.[side])})).sort((a,b)=>b.edgePct-a.edgePct)[0]}
function quality(m){return n(m?.dataQuality??m?.quality,0)}
function confidence(m,c){const base=Math.max(0,Math.min(100,n(m?.confidence,c?.probability*100)));const penalty=Math.max(0,n(m?.confidencePenalty,0));return{raw:base,penalty,net:Math.max(0,Math.min(100,base-penalty))}}
function verdictFor(m,gate){
 const c=candidate(m),q=quality(m),conf=confidence(m,c),regime=String(m?.marketRegime?.regime||'UNKNOWN'),issues=[],positive=[];
 if(!c)return{verdict:'NO BET',eligible:false,issues:['MODEL_OR_MARKET_MISSING'],positive,confidence:conf,candidate:null};
 if(gate?.status==='BLOCKED')issues.push(...(gate.issues?.length?gate.issues:['PREKICKOFF_BLOCKED']));
 if(q<55)issues.push('LOW_DATA_QUALITY');
 if(c.odds<=1)issues.push('ODDS_MISSING');
 if(c.edgePct<2)issues.push('EDGE_TOO_SMALL');
 if(conf.net<48)issues.push('CONFIDENCE_TOO_LOW');
 if(['STALE','WIDE'].includes(regime))issues.push(`MARKET_${regime}`);
 if(regime==='VOLATILE')issues.push('MARKET_VOLATILE');
 if(m?.isFinished)issues.push('MATCH_FINISHED');
 if(c.edgePct>=3)positive.push(`EDGE_${c.edgePct.toFixed(1)}%`);
 if(conf.net>=60)positive.push(`CONFIDENCE_${conf.net.toFixed(0)}%`);
 if(q>=70)positive.push(`QUALITY_${q.toFixed(0)}`);
 if(gate?.status==='CONFIRMED')positive.push('PREKICKOFF_CONFIRMED');
 if(regime==='STABLE')positive.push('MARKET_STABLE');
 const hard=issues.some(x=>['MODEL_OR_MARKET_MISSING','ODDS_MISSING','MATCH_FINISHED','LINEUPS_NOT_CONFIRMED','HISTORY_INCOMPLETE','MARKET_MISSING','MODEL_MISSING'].includes(x));
 let verdict='NO BET',eligible=false;
 if(!hard){
   if(c.edgePct>=6&&conf.net>=68&&q>=70&&gate?.status!=='CAUTION'&&!['VOLATILE','STALE','WIDE'].includes(regime)){verdict='PRIME';eligible=true}
   else if(c.edgePct>=3.5&&conf.net>=58&&q>=60&&!['STALE','WIDE'].includes(regime)){verdict='VALUE';eligible=true}
   else if(c.edgePct>=2&&conf.net>=48){verdict='WATCH';eligible=false}
 }
 if(issues.includes('MARKET_VOLATILE')&&verdict==='PRIME')verdict='VALUE';
 if(issues.includes('MARKET_VOLATILE')&&verdict==='VALUE')verdict='WATCH',eligible=false;
 if(issues.includes('LOW_DATA_QUALITY')&&verdict==='VALUE')verdict='WATCH',eligible=false;
 if(gate?.status==='CAUTION'&&verdict==='PRIME')verdict='VALUE';
 return{verdict,eligible,issues:[...new Set(issues)],positive,candidate:{...c,edgePct:Number(c.edgePct.toFixed(2)),probability:Number(c.probability.toFixed(4)),marketProbability:Number(c.marketProbability.toFixed(4))},confidence:{raw:Number(conf.raw.toFixed(1)),penalty:Number(conf.penalty.toFixed(1)),net:Number(conf.net.toFixed(1))},dataQuality:Number(q.toFixed(1)),marketRegime:regime,gateStatus:gate?.status||null};
}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const matches=Array.isArray(req.body?.matches)?req.body.matches:[],gates=Array.isArray(req.body?.preKickoffGates)?req.body.preKickoffGates:[],gm=new Map(gates.map(g=>[String(g.fixtureId),g])),decisions={};for(const m of matches)decisions[String(m.id)]={fixtureId:m.id,home:m.home,away:m.away,kickoff:m.kickoff,...verdictFor(m,gm.get(String(m.id)))};const vals=Object.values(decisions);return res.status(200).json({ok:true,version:'BET-ELIGIBILITY-2',generatedAt:new Date().toISOString(),summary:{total:vals.length,prime:vals.filter(x=>x.verdict==='PRIME').length,value:vals.filter(x=>x.verdict==='VALUE').length,watch:vals.filter(x=>x.verdict==='WATCH').length,noBet:vals.filter(x=>x.verdict==='NO BET').length,eligible:vals.filter(x=>x.eligible).length},policy:{primeEdgeMinPct:6,primeConfidenceMin:68,primeQualityMin:70,valueEdgeMinPct:3.5,valueConfidenceMin:58,valueQualityMin:60,watchEdgeMinPct:2,primeMayBeCreatedOnlyHere:true,gateCanBlock:true,confidencePenaltiesApplied:true,marketRegimeApplied:true,rule:'Final verdict is evidence-based and downgrade-first. No upstream module may bypass eligibility governance.'},decisions})}