import shadowMode from './shadow-mode.js';

const TZ='Europe/Brussels';
function authorized(req){const secret=String(process.env.CRON_SECRET||'').trim();return !secret||req.headers.authorization===`Bearer ${secret}`}
function previousBrusselsDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value])),t=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))-86400000;return new Date(t).toISOString().slice(0,10)}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  const date=previousBrusselsDate();
  // Keep the internal settlement request minimal. Spreading Vercel's request
  // object can evaluate framework getters (including the legacy query parser).
  const proxy={method:'GET',headers:req.headers,url:`/api/shadow-mode?mode=settle&date=${encodeURIComponent(date)}`,query:{mode:'settle',date}};
  return shadowMode(proxy,res);
}
