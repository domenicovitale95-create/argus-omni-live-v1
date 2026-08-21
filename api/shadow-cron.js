function authorized(req){const secret=process.env.CRON_SECRET;return !secret||req.headers.authorization===`Bearer ${secret}`}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function json(url,options={}){const r=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error||`HTTP ${r.status}`);e.status=r.status;e.payload=j;throw e}return j}
async function retryJson(url,options={},attempts=3){let lastError=null;for(let attempt=1;attempt<=attempts;attempt++){try{return await json(url,options)}catch(error){lastError=error;const status=Number(error.status)||0,retryable=status===0||status===408||status===429||status>=500;if(!retryable||attempt===attempts)throw error;await wait(250*attempt)}}throw lastError}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app',base=`${proto}://${host}`;
  try{
    let live;
    try{live=await retryJson(`${base}/api/live`,{},2)}catch(error){
      if([408,429,500,502,503,504].includes(Number(error.status)))return res.status(200).json({ok:true,status:'DEGRADED',skipped:true,reason:'LIVE_TEMPORARILY_UNAVAILABLE',upstreamStatus:Number(error.status),retryable:true,shadowCapture:false});
      throw error;
    }
    const matches=(live.matches||[]).filter(m=>!m.isFinished);
    if(!matches.length)return res.status(200).json({ok:true,status:'IDLE',skipped:true,reason:'NO_ACTIVE_FIXTURES',shadowCapture:false,quota:live.meta?.quota||null});
    try{
      const capture=await retryJson(`${base}/api/shadow-mode`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({matches})},3);
      return res.status(200).json({ok:true,status:'HEALTHY',matches:matches.length,shadow:capture,quota:live.meta?.quota||null});
    }catch(error){
      console.warn('[shadow-cron] shadow capture degraded',{status:Number(error.status)||null,message:error.message});
      return res.status(200).json({ok:false,status:'DEGRADED',skipped:true,reason:'SHADOW_CAPTURE_TEMPORARILY_UNAVAILABLE',upstreamStatus:Number(error.status)||null,retryable:[0,408,429,500,502,503,504].includes(Number(error.status)||0),shadowCapture:false,quota:live.meta?.quota||null});
    }
  }catch(error){
    console.warn('[shadow-cron] controlled failure',{status:Number(error.status)||null,message:error.message});
    return res.status(200).json({ok:false,status:'DEGRADED',skipped:true,reason:'CONTROLLED_FAILURE',upstreamStatus:Number(error.status)||null,retryable:false,shadowCapture:false});
  }
}
