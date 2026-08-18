import { readJson, writeJson, storageReady } from './_report-store.js';

const API_BASE='https://v3.football.api-sports.io';
const TZ='Europe/Brussels';
const INJURY_TTL=4*60*60*1000;

function headers(){const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');return {'x-apisports-key':key,Accept:'application/json'}}
async function apiGet(path){const r=await fetch(`${API_BASE}${path}`,{headers:headers()});if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);const data=await r.json();if(data?.errors&&Object.keys(data.errors).length)throw new Error(`API-Football: ${JSON.stringify(data.errors)}`);return data}
function today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
function chunk(a,n){const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out}
async function injuries(date){const path=`argus/data/injuries-${date}.json`;let cached=null;if(storageReady())try{cached=await readJson(path,null)}catch(_){}if(cached?.savedAt&&Date.now()-new Date(cached.savedAt).getTime()<INJURY_TTL&&Array.isArray(cached.response))return {rows:cached.response,cache:'HIT'};try{const data=await apiGet(`/injuries?date=${date}&timezone=${encodeURIComponent(TZ)}`),rows=data.response||[];if(storageReady())try{await writeJson(path,{savedAt:new Date().toISOString(),response:rows})}catch(_){}return {rows,cache:'MISS'}}catch(error){return {rows:cached?.response||[],cache:cached?.response?'STALE':'ERROR',error:error.message}}}
function injuryIndex(rows){const map=new Map();for(const row of rows||[]){const fid=Number(row.fixture?.id),tid=Number(row.team?.id);if(!fid||!tid)continue;const key=`${fid}:${tid}`;if(!map.has(key))map.set(key,[]);map.get(key).push({playerId:row.player?.id||null,name:row.player?.name||null,type:row.player?.type||null,reason:row.player?.reason||null})}return map}
function lineup(f,teamId){const row=(f.lineups||[]).find(x=>Number(x.team?.id)===Number(teamId));if(!row)return null;const starters=(row.startXI||[]).map(x=>({id:x.player?.id||null,name:x.player?.name||null,number:x.player?.number||null,pos:x.player?.pos||null,grid:x.player?.grid||null}));const bench=(row.substitutes||[]).map(x=>({id:x.player?.id||null,name:x.player?.name||null,number:x.player?.number||null,pos:x.player?.pos||null}));return {confirmed:starters.length>=11,formation:row.formation||null,coach:row.coach?.name||null,starters,bench}}
function availability(f,index){const fid=Number(f.fixture?.id),homeId=Number(f.teams?.home?.id),awayId=Number(f.teams?.away?.id),h=lineup(f,homeId),a=lineup(f,awayId),ha=index.get(`${fid}:${homeId}`)||[],aa=index.get(`${fid}:${awayId}`)||[],confirmed=Boolean(h?.confirmed&&a?.confirmed);return {fixtureId:fid,lineupsConfirmed:confirmed,lineupStatus:confirmed?'CONFIRMED':'PENDING_OR_UNAVAILABLE',home:{formation:h?.formation||null,coach:h?.coach||null,starters:h?.starters||[],bench:h?.bench||[],absences:ha,absenceCount:ha.length},away:{formation:a?.formation||null,coach:a?.coach||null,starters:a?.starters||[],bench:a?.bench||[],absences:aa,absenceCount:aa.length},policy:'Availability data is contextual only until player-importance calibration is validated.'}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=45, stale-while-revalidate=30');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const ids=String(req.query?.ids||'').split(/[,-]/).map(Number).filter(Boolean).slice(0,120);
    if(!ids.length)return res.status(200).json({availability:{},meta:{requested:0,loaded:0}});
    const date=String(req.query?.date||today()),fixtures=[];
    for(const group of chunk(ids,20)){const data=await apiGet(`/fixtures?ids=${group.join('-')}&timezone=${encodeURIComponent(TZ)}`);fixtures.push(...(data.response||[]))}
    const injuryResult=await injuries(date),index=injuryIndex(injuryResult.rows),map={};
    for(const f of fixtures){const a=availability(f,index);map[String(a.fixtureId)]=a}
    return res.status(200).json({availability:map,meta:{date,requested:ids.length,loaded:fixtures.length,lineupsConfirmed:Object.values(map).filter(x=>x.lineupsConfirmed).length,injuryRows:injuryResult.rows.length,injuryCache:injuryResult.cache}});
  }catch(error){return res.status(503).json({error:error.message,availability:{}})}
}
