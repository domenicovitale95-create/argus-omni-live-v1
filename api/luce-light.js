import { put, list } from '@vercel/blob';

const ALLOWED = ['AMOUR','COURAGE','DOUCEUR','ESPOIR','GRATITUDE','LIBERTÉ','LUMIÈRE','PAIX','PARDON','PRÉSENCE','CONFIANCE'];
const PREFIX = 'luce-lights/';

function cleanWord(value=''){
  return String(value).trim().toUpperCase().normalize('NFC');
}
function parseCookie(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim().split('=')).filter(x=>x[0]).map(([k,...v])=>[k,v.join('=')]));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');

  const token=process.env.BLOB_READ_WRITE_TOKEN;
  if(req.method==='GET'){
    if(!token) return res.status(200).json({mode:'local',count:0,lights:[],allowed:ALLOWED});
    try{
      const result=await list({prefix:PREFIX,limit:500,token});
      const lights=(result.blobs||[]).map(b=>{
        const file=(b.pathname||'').split('/').pop()||'';
        const parts=file.split('__');
        const word=decodeURIComponent(parts[0]||'').replaceAll('-',' ');
        const ts=Number(parts[1])||Date.parse(b.uploadedAt||'')||Date.now();
        return {word,ts};
      }).filter(x=>ALLOWED.includes(x.word)).sort((a,b)=>a.ts-b.ts).slice(-400);
      return res.status(200).json({mode:'collective',count:(result.blobs||[]).length,lights,allowed:ALLOWED});
    }catch(error){
      return res.status(200).json({mode:'local',count:0,lights:[],allowed:ALLOWED});
    }
  }

  if(req.method==='POST'){
    const cookies=parseCookie(req.headers.cookie||'');
    if(cookies.luce_light) return res.status(429).json({ok:false,error:'ONE_LIGHT_PER_HOUR'});
    let body=req.body||{};
    if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={}}}
    const word=cleanWord(body.word);
    if(!ALLOWED.includes(word)) return res.status(400).json({ok:false,error:'INVALID_WORD',allowed:ALLOWED});
    if(!token) return res.status(503).json({ok:false,error:'LOCAL_MODE'});
    try{
      const ts=Date.now();
      const id=(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
      const safe=encodeURIComponent(word).replaceAll('%20','-');
      await put(`${PREFIX}${safe}__${ts}__${id}.txt`,'1',{access:'public',addRandomSuffix:false,token});
      res.setHeader('Set-Cookie','luce_light=1; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax; Secure');
      return res.status(200).json({ok:true,mode:'collective',light:{word,ts}});
    }catch(error){
      return res.status(503).json({ok:false,error:'STORE_UNAVAILABLE'});
    }
  }

  res.setHeader('Allow','GET, POST');
  return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
}
