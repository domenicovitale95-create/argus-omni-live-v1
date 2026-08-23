import { readJson, writeJson, storageReady } from './_report-store.js';

const INCIDENTS='argus/health/incidents.json';
const FEED='argus/alerts/feed.json';
const STATE='argus/alerts/operational-bridge-state.json';
function authorized(req){const s=String(process.env.CRON_SECRET||'').trim();return !s||req.headers.authorization===`Bearer ${s}`}
function now(){return new Date().toISOString()}
function incidentReason(x){
  const issues=Array.isArray(x?.issues)?x.issues:[];
  const codes=issues.map(i=>i?.code).filter(Boolean);
  if(x?.kind==='SYSTEM_RECOVERED')return 'ARGUS recovered after a persistent operational incident. Autonomous control is healthy again.';
  if(codes.length)return `Persistent operational issue: ${codes.join(', ')}. ARGUS has already attempted bounded self-healing.`;
  return 'ARGUS detected a persistent operational issue after multiple autonomous health cycles.';
}
function alertFrom(x){
  const recovered=x?.kind==='SYSTEM_RECOVERED';
  const critical=String(x?.severity||x?.status||'').toUpperCase()==='CRITICAL';
  const qualityScore=recovered?90:critical?100:94;
  return{
    id:`OPERATIONAL|${x.id}`,
    createdAt:x.createdAt||now(),
    type:recovered?'SYSTEM_RECOVERED':'SYSTEM_INCIDENT',
    operationalAlert:true,
    verdict:recovered?'RECOVERED':critical?'CRITICAL':'DEGRADED',
    systemTitle:recovered?'ARGUS recovered':'ARGUS needs attention',
    systemBody:incidentReason(x),
    systemUrl:'/system-health.html',
    severity:recovered?'INFO':x.severity||x.status||'DEGRADED',
    qualityScore,
    qualityTier:recovered?'RECOVERY':critical?'CRITICAL':'HIGH',
    reason:incidentReason(x),
    risk:(x.issues||[]).map(i=>`${i.code}${i.ageMinutes!=null?` (${i.ageMinutes}m)`:''}`).slice(0,4),
    pushEligible:true,
    emailEligible:true,
    siteOnly:false,
    automaticWagering:false
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Operational alert storage unavailable'});
  const [incidents,feed,state]=await Promise.all([
    readJson(INCIDENTS,{incidents:[]}),
    readJson(FEED,{alerts:[]}),
    readJson(STATE,{seen:{}})
  ]);
  state.seen=state.seen||{};
  const candidates=(incidents?.incidents||[]).filter(x=>['SYSTEM_UNHEALTHY','SYSTEM_RECOVERED'].includes(x?.kind)&&!state.seen[x.id]);
  const generated=[];
  for(const row of candidates.slice().reverse()){
    const alert=alertFrom(row);generated.push(alert);state.seen[row.id]=now();
  }
  if(generated.length){
    feed.alerts=[...generated.reverse(),...(feed.alerts||[])].slice(0,160);
    feed.updatedAt=now();
    state.updatedAt=feed.updatedAt;
    const ids=Object.keys(state.seen);if(ids.length>300){for(const id of ids.slice(0,ids.length-300))delete state.seen[id]}
    await Promise.all([writeJson(FEED,feed),writeJson(STATE,state)]);
  }
  return res.status(200).json({version:'OPERATIONAL-ALERT-BRIDGE-1',generatedAt:now(),status:'OK',incidentCount:(incidents?.incidents||[]).length,newAlerts:generated.length,alerts:generated,policy:{cronAuthenticatedWhenConfigured:true,persistentFailuresOnly:true,recoveryNotifications:true,bettingAlertLogicUntouched:true,providerCalls:false,automaticWagering:false}});
}
