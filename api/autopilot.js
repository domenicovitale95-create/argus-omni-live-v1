function authorized(req){
  const secret=process.env.CRON_SECRET;
  return !secret || req.headers.authorization===`Bearer ${secret}`;
}
function brusselsClock(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {hour:Number(p.hour),minute:Number(p.minute)};
}
async function jsonFetch(url,options={}){
  const r=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}: ${data.error||'request failed'}`);
  return data;
}
function minutesToKickoff(m){const t=new Date(m?.kickoff||0).getTime();return Number.isFinite(t)?Math.round((t-Date.now())/60000):99999}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req)) return res.status(401).json({error:'Unauthorized'});
  const clock=brusselsClock();
  const active=clock.hour>=6 || (clock.hour===0 && clock.minute<=30);
  if(!active) return res.status(200).json({ok:true,skipped:true,reason:'OUTSIDE_ACTIVE_WINDOW',brussels:clock});
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app';
  const base=`${proto}://${host}`,started=Date.now();
  try{
    let existing=null;try{existing=await jsonFetch(`${base}/api/decision-scheduler`)}catch(_){}
    const plan=Array.isArray(existing?.plan)?existing.plan:[],cadences=plan.map(x=>Number(x.cadenceMinutes)).filter(Number.isFinite),cadence=cadences.length?Math.max(5,Math.min(...cadences)):30,last=existing?.generatedAt?new Date(existing.generatedAt).getTime():0,ageMinutes=last?Math.floor((Date.now()-last)/60000):Infinity;
    const urgent=plan.some(x=>{const t=new Date(x.kickoff||0).getTime(),m=Number.isFinite(t)?Math.round((t-Date.now())/60000):99999;return m>=0&&m<=69});
    if(ageMinutes<cadence&&!urgent)return res.status(200).json({ok:true,skipped:true,reason:'NOT_DUE',ageMinutes,cadenceMinutes:cadence,brussels:clock,elapsedMs:Date.now()-started});
    const live=await jsonFetch(`${base}/api/live`),matches=Array.isArray(live.matches)?live.matches:[];
    if(!matches.length)return res.status(200).json({ok:true,skipped:true,reason:'NO_FIXTURES',brussels:clock,elapsedMs:Date.now()-started,meta:live.meta||null});
    const payload={matches,meta:live.meta||{}},body=JSON.stringify(payload);
    let availability={availability:{},meta:{requested:0,loaded:0}};
    const near=matches.filter(m=>!m.isLive&&!m.isFinished&&minutesToKickoff(m)>=0&&minutesToKickoff(m)<=90).map(m=>m.id).filter(Boolean);
    if(near.length)try{availability=await jsonFetch(`${base}/api/availability?ids=${near.join('-')}`)}catch(_){}
    const gate=await jsonFetch(`${base}/api/prekickoff-gate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,availability:availability.availability||{}})});
    const events=await jsonFetch(`${base}/api/live-events`,{method:'POST',headers:{'Content-Type':'application/json'},body});
    const market=await jsonFetch(`${base}/api/market-memory`,{method:'POST',headers:{'Content-Type':'application/json'},body});
    const scheduler=await jsonFetch(`${base}/api/decision-scheduler`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,events:events.events||[],preKickoffGates:gate.gates||[]})});
    return res.status(200).json({ok:true,skipped:false,matches:matches.length,events:events.detected||0,forcedRechecks:events.forcedRechecks||0,marketSnapshots:market.saved||0,availability:availability.meta||null,preKickoff:gate.summary||null,scheduler:scheduler.summary||null,brussels:clock,elapsedMs:Date.now()-started});
  }catch(error){return res.status(500).json({ok:false,error:error.message,brussels:clock,elapsedMs:Date.now()-started});}
}
