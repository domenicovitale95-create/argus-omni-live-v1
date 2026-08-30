import handler from './bet-eligibility-v2.js';

function startedRecently(m){const t=new Date(m?.kickoff||0).getTime(),now=Date.now();return Number.isFinite(t)&&t>0&&!m?.isFinished&&t<=now-2*60*1000&&t>=now-4*60*60*1000}
function hasLiveState(m){return m?.minute!==null&&m?.minute!==undefined&&m?.score&&m.score.home!==null&&m.score.home!==undefined&&m.score.away!==null&&m.score.away!==undefined}
function normalizedQuality(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);if(!Number.isFinite(x))return null;const scaled=x>=0&&x<=1?x*100:x;return Math.max(0,Math.min(100,scaled))}
function normalizeMatchQuality(m){const raw=m?.dataQuality??m?.quality,q=normalizedQuality(raw);if(q==null)return m;return{...m,dataQuality:q,quality:q,dataQualityScale:'PERCENT_0_100'}}
function lineageId(source){const s=String(source||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'_');return s?`LINEAGE:${s}`:null}
function tagCandidate(candidate){
  if(!candidate||typeof candidate!=='object')return;
  if(String(candidate.modelVersion||'').trim())return;
  const lineage=lineageId(candidate.source);
  if(lineage)candidate.modelVersion=lineage;
}
function enrichProvenance(body){
  if(!body||typeof body!=='object')return body;
  for(const decision of Object.values(body.decisions||{}))tagCandidate(decision?.candidate);
  for(const decision of Object.values(body.eligibility?.decisions||{}))tagCandidate(decision?.candidate);
  body.contract={...(body.contract||{}),dataQualityScale:'PERCENT_0_100',dataQualityNormalizedAtBoundary:true};
  return body;
}
function captureResponse(){
  const out={statusCode:200,headers:{},body:null};
  const proxy={
    setHeader:(k,v)=>{out.headers[String(k).toLowerCase()]=v;return proxy},
    getHeader:k=>out.headers[String(k).toLowerCase()],
    status:c=>{out.statusCode=Number(c)||200;return proxy},
    json:b=>{out.body=b;return b},
    send:b=>{out.body=b;return b},
    end:b=>{if(b!==undefined)out.body=b;return b}
  };
  return{out,proxy};
}

export default async function(req,res){
  if(req.method==='POST'&&Array.isArray(req.body?.matches)){
    const matches=req.body.matches.map(raw=>{
      const m=normalizeMatchQuality(raw),live=Boolean(m?.isLive)||startedRecently(m);
      if(!live)return m;
      if(hasLiveState(m))return{...m,isLive:true};
      return{...m,isLive:true,liveStateIncomplete:true,markets:{},marketOdds:{},confidencePenalty:Number(m?.confidencePenalty||0)+20};
    });
    req.body={...(req.body||{}),matches};
  }
  if(req.method!=='POST')return handler(req,res);
  const {out,proxy}=captureResponse();
  await handler(req,proxy);
  for(const [k,v] of Object.entries(out.headers))res.setHeader(k,v);
  const body=enrichProvenance(out.body);
  if(body&&typeof body==='object')return res.status(out.statusCode).json(body);
  return res.status(out.statusCode).send(body);
}
