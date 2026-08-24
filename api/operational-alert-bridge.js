import { readJsonFresh, writeJson, storageReady } from './_report-store.js';

const INCIDENTS='argus/health/incidents.json';
const FEED='argus/alerts/feed.json';
const STATE='argus/alerts/operational-bridge-state.json';
function authorized(req){const s=String(process.env.CRON_SECRET||'').trim();return !s||req.headers.authorization===`Bearer ${s}`}
function now(){return new Date().toISOString()}
function severityOf(x){const s=String(x?.severity||x?.status||'DEGRADED').toUpperCase();return s==='CRITICAL'?'CRITICAL':'DEGRADED'}
function incidentReason(x){
  const issues=Array.isArray(x?.issues)?x.issues:[];
  const codes=issues.map(i=>i?.code).filter(Boolean);
  if(x?.kind==='SYSTEM_RECOVERED')return 'ARGUS recovered after a persistent operational incident. Autonomous control is healthy again.';
  if(codes.length)return `Persistent operational issue: ${codes.join(', ')}. ARGUS has already attempted bounded self-healing.`;
  return 'ARGUS detected a persistent operational issue after multiple autonomous health cycles.';
}
function alertFrom(x,{escalation=false}={}){
  const recovered=x?.kind==='SYSTEM_RECOVERED';
  const critical=severityOf(x)==='CRITICAL';
  const qualityScore=recovered?90:critical?100:94;
  return{
    id:`OPERATIONAL|${x.id}`,
    createdAt:x.createdAt||now(),
    type:recovered?'SYSTEM_RECOVERED':escalation?'SYSTEM_ESCALATED':'SYSTEM_INCIDENT',
    operationalAlert:true,
    verdict:recovered?'RECOVERED':critical?'CRITICAL':'DEGRADED',
    systemTitle:recovered?'ARGUS recovered':escalation?'ARGUS incident escalated':'ARGUS needs attention',
    systemBody:incidentReason(x),
    systemUrl:'/system-health.html',
    severity:recovered?'INFO':severityOf(x),
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
    readJsonFresh(INCIDENTS,{incidents:[]}),
    readJsonFresh(FEED,{alerts:[]}),
    readJsonFresh(STATE,{seen:{},openIncidentId:null,openSeverity:null})
  ]);
  state.seen=state.seen||{};
  const rows=(incidents?.incidents||[]).filter(x=>['SYSTEM_UNHEALTHY','SYSTEM_RECOVERED'].includes(x?.kind)&&!state.seen[x.id]).slice().reverse();
  const generated=[];
  let suppressed=0;
  for(const row of rows){
    if(row.kind==='SYSTEM_UNHEALTHY'){
      const severity=severityOf(row);
      if(!state.openIncidentId){
        generated.push(alertFrom(row));
        state.openIncidentId=row.id;
        state.openSeverity=severity;
        state.openedAt=row.createdAt||now();
      }else if(state.openSeverity!=='CRITICAL'&&severity==='CRITICAL'){
        generated.push(alertFrom(row,{escalation:true}));
        state.openSeverity='CRITICAL';
      }else suppressed++;
    }else if(row.kind==='SYSTEM_RECOVERED'){
      if(state.openIncidentId){
        generated.push(alertFrom(row));
        state.openIncidentId=null;
        state.openSeverity=null;
        state.openedAt=null;
      }else suppressed++;
    }
    state.seen[row.id]=now();
  }
  if(generated.length){feed.alerts=[...generated.slice().reverse(),...(feed.alerts||[])].slice(0,160);feed.updatedAt=now()}
  state.updatedAt=now();
  const ids=Object.keys(state.seen);if(ids.length>300){for(const id of ids.slice(0,ids.length-300))delete state.seen[id]}
  if(generated.length||rows.length)await Promise.all([writeJson(FEED,feed),writeJson(STATE,state)]);
  return res.status(200).json({version:'OPERATIONAL-ALERT-BRIDGE-3',generatedAt:now(),status:'OK',incidentCount:(incidents?.incidents||[]).length,processed:rows.length,newAlerts:generated.length,suppressed,openIncidentId:state.openIncidentId,openSeverity:state.openSeverity,alerts:generated,policy:{cronAuthenticatedWhenConfigured:true,persistentFailuresOnly:true,oneOpenIncidentAtATime:true,criticalEscalationAllowed:true,recoveryRequiresOpenIncident:true,transientRecoverySuppressed:true,consistentMutableReads:true,bettingAlertLogicUntouched:true,providerCalls:false,automaticWagering:false}});
}
