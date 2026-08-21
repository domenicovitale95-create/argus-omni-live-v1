const API_BASE='https://v3.football.api-sports.io';

function apiHeaders(){
  const key=String(process.env.API_FOOTBALL_KEY||'').trim();
  if(!key) throw new Error('API_FOOTBALL_KEY is not configured');
  return {'x-apisports-key':key,Accept:'application/json'};
}

function numberHeader(headers,name){
  const raw=headers.get(name);
  if(raw==null||raw==='') return null;
  const n=Number(raw);
  return Number.isFinite(n)?n:null;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const response=await fetch(`${API_BASE}/status`,{headers:apiHeaders()});
    const data=await response.json().catch(()=>({}));
    const headers={
      dailyLimit:numberHeader(response.headers,'x-ratelimit-requests-limit'),
      dailyRemaining:numberHeader(response.headers,'x-ratelimit-requests-remaining'),
      minuteLimit:numberHeader(response.headers,'x-ratelimit-limit'),
      minuteRemaining:numberHeader(response.headers,'x-ratelimit-remaining')
    };
    return res.status(response.ok?200:503).json({
      ok:response.ok,
      observationalOnly:true,
      provider:'API-FOOTBALL',
      fetchedAt:new Date().toISOString(),
      headers,
      account:data?.response||null,
      providerErrors:data?.errors||null
    });
  }catch(error){
    return res.status(503).json({ok:false,observationalOnly:true,error:error.message,fetchedAt:new Date().toISOString()});
  }
}
