import { writeJson, storageReady } from './_report-store.js';

function secret(){return String(process.env.CRON_SECRET||'').trim()}
function authorized(req){const s=secret();return !s||req.headers.authorization===`Bearer ${s}`}
function brussels(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return{date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute)}}
function addDays(s,d){const x=new Date(`${s}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
function baseUrl(req){const production=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');if(production)return`https://${production}`;const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0],host=req.headers['x-forwarded-host']||req.headers.host;return host?`${proto}://${host}`:null}
async function call(base,mode,date){const s=secret(),r=await fetch(`${base}/api/prediction-ledger?mode=${mode}${date?`&date=${date}`:''}`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',...(s?{Authorization:`Bearer ${s}`}:{})},body:'{}'});const j=await r.json().catch(()=>({}));return{ok:r.ok,status:r.status,data:j}}
async function saveHealth(state){if(!storageReady())return;try{await writeJson('argus/health/prediction-ledger-cron.json',state)}catch(_){}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 const base=baseUrl(req);if(!base)return res.status(500).json({error:'Host unavailable'});
 const clock=brussels(),startedAt=new Date().toISOString(),capture=await call(base,'capture',null),settlements=[];
 if(clock.hour===23&&clock.minute>=55)settlements.push({reason:'END_OF_DAY',date:clock.date,...await call(base,'settle',clock.date)});
 if([0,2].includes(clock.hour)&&clock.minute>=55){const previous=addDays(clock.date,-1);settlements.push({reason:clock.hour===0?'LATE_MATCH_RETRY_1':'LATE_MATCH_RETRY_2',date:previous,...await call(base,'settle',previous)})}
 const state={version:'PREDICTION-LEDGER-CRON-2',startedAt,completedAt:new Date().toISOString(),baseHost:new URL(base).host,ok:capture.ok&&settlements.every(x=>x.ok),capture:{status:capture.status,...capture.data},settlements:settlements.map(x=>({reason:x.reason,date:x.date,status:x.status,result:x.data})),policy:{captureEveryCron:true,endOfDaySettlement:true,lateMatchRetriesBrusselsHours:[0,2],productionDomainPreferred:true,automaticWagering:false}};
 await saveHealth(state);
 return res.status(200).json({...state,clock});
}
