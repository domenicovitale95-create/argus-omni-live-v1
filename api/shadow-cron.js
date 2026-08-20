function authorized(req){const secret=process.env.CRON_SECRET;return !secret||req.headers.authorization===`Bearer ${secret}`}
async function json(url,options={}){const r=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error||`HTTP ${r.status}`);e.status=r.status;e.payload=j;throw e}return j}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app',base=`${proto}://${host}`;
  try{
    let live;
    try{live=await json(`${base}/api/live`)}catch(error){
      if([429,503].includes(Number(error.status)))return res.status(200).json({ok:true,skipped:true,reason:'LIVE_TEMPORARILY_UNAVAILABLE',upstreamStatus:Number(error.status),retryable:true,shadowCapture:false});
      throw error;
    }
    const matches=(live.matches||[]).filter(m=>!m.isFinished);
    if(!matches.length)return res.status(200).json({ok:true,skipped:true,reason:'NO_ACTIVE_FIXTURES',shadowCapture:false,quota:live.meta?.quota||null});
    const capture=await json(`${base}/api/shadow-mode`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({matches})});
    return res.status(200).json({ok:true,matches:matches.length,shadow:capture,quota:live.meta?.quota||null});
  }catch(error){return res.status(500).json({ok:false,error:error.message,status:Number(error.status)||null})}
}
