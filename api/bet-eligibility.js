import handler from './bet-eligibility-v2.js';

function startedRecently(m){const t=new Date(m?.kickoff||0).getTime(),now=Date.now();return Number.isFinite(t)&&t>0&&!m?.isFinished&&t<=now-2*60*1000&&t>=now-4*60*60*1000}
function hasLiveState(m){return m?.minute!==null&&m?.minute!==undefined&&m?.score&&m.score.home!==null&&m.score.home!==undefined&&m.score.away!==null&&m.score.away!==undefined}

export default async function(req,res){
  if(req.method==='POST'&&Array.isArray(req.body?.matches)){
    const matches=req.body.matches.map(m=>{
      const live=Boolean(m?.isLive)||startedRecently(m);
      if(!live)return m;
      if(hasLiveState(m))return{...m,isLive:true};
      return{...m,isLive:true,liveStateIncomplete:true,markets:{},marketOdds:{},confidencePenalty:Number(m?.confidencePenalty||0)+20};
    });
    req.body={...(req.body||{}),matches};
  }
  return handler(req,res);
}
