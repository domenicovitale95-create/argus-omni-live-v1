function authorized(req){
  const secret=process.env.CRON_SECRET;
  return !secret || req.headers.authorization===`Bearer ${secret}`;
}

async function jsonFetch(url,options={}){
  const r=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}: ${data.error||'request failed'}`);
  return data;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req)) return res.status(401).json({error:'Unauthorized'});

  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app';
  const base=`${proto}://${host}`;
  const started=Date.now();

  try{
    let existing=null;
    try{existing=await jsonFetch(`${base}/api/decision-scheduler`)}catch(_){}
    const plan=Array.isArray(existing?.plan)?existing.plan:[];
    const cadences=plan.map(x=>Number(x.cadenceMinutes)).filter(Number.isFinite);
    const cadence=cadences.length?Math.max(5,Math.min(...cadences)):30;
    const last=existing?.generatedAt?new Date(existing.generatedAt).getTime():0;
    const ageMinutes=last?Math.floor((Date.now()-last)/60000):Infinity;
    if(ageMinutes<cadence){
      return res.status(200).json({ok:true,skipped:true,reason:'NOT_DUE',ageMinutes,cadenceMinutes:cadence,elapsedMs:Date.now()-started});
    }

    const live=await jsonFetch(`${base}/api/live`);
    const matches=Array.isArray(live.matches)?live.matches:[];
    if(!matches.length) return res.status(200).json({ok:true,skipped:true,reason:'NO_FIXTURES',elapsedMs:Date.now()-started,meta:live.meta||null});
    const payload={matches,meta:live.meta||{}};
    const body=JSON.stringify(payload);
    const events=await jsonFetch(`${base}/api/live-events`,{method:'POST',headers:{'Content-Type':'application/json'},body});
    const market=await jsonFetch(`${base}/api/market-memory`,{method:'POST',headers:{'Content-Type':'application/json'},body});
    const scheduler=await jsonFetch(`${base}/api/decision-scheduler`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,events:events.events||[]})});

    return res.status(200).json({ok:true,skipped:false,matches:matches.length,events:events.detected||0,forcedRechecks:events.forcedRechecks||0,marketSnapshots:market.saved||0,scheduler:scheduler.summary||null,elapsedMs:Date.now()-started});
  }catch(error){
    return res.status(500).json({ok:false,error:error.message,elapsedMs:Date.now()-started});
  }
}
