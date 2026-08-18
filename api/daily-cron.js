function brusselsParts(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function authorized(req){const secret=process.env.CRON_SECRET;return !secret||req.headers.authorization===`Bearer ${secret}`}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  const p=brusselsParts();
  if(Number(p.hour)!==23)return res.status(200).json({ok:true,skipped:true,reason:'NOT_23H_BRUSSELS',localHour:p.hour});
  const date=`${p.year}-${p.month}-${p.day}`;
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host||'argus-omni-live.vercel.app';
  const r=await fetch(`${proto}://${host}/api/daily-report?date=${date}&force=1`,{headers:{Accept:'application/json',Authorization:req.headers.authorization||''}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)return res.status(r.status).json({ok:false,error:data.error||'Daily report failed'});
  return res.status(200).json({ok:true,date,summary:data.summary||null});
}
