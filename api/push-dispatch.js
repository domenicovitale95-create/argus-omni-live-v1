import { readJsonFresh, writeJson, storageReady } from './_report-store.js';

const SUBS='argus/push/subscriptions.json';
const STATE='argus/push/state.json';
const FEED='argus/alerts/feed.json';

function authorized(req){
  const secret=process.env.CRON_SECRET;
  return !secret||req.headers.authorization===`Bearer ${secret}`;
}
function payloadFor(a){
  if(a?.operationalAlert){
    return JSON.stringify({
      title:a.systemTitle||`ARGUS SYSTEM · ${a.verdict||'ATTENTION'}`,
      body:a.systemBody||a.reason||'ARGUS detected an operational condition that needs attention.',
      tag:`argus-system-${a.type||'incident'}`,
      url:a.systemUrl||'/system-health.html'
    });
  }
  return JSON.stringify({
    title:`ARGUS ${a.verdict} · ${a.qualityTier||'HIGH'}`,
    body:`${a.home} vs ${a.away} · ${a.selection||'pick'}${a.odds?` @ ${Number(a.odds).toFixed(2)}`:''}${a.confidence!=null?` · ${a.confidence}% confidence`:''}`,
    tag:`argus-${a.fixtureId}-${a.selection||''}`,
    url:'/daily-slip.html'
  });
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});

  const pub=process.env.VAPID_PUBLIC_KEY;
  const priv=process.env.VAPID_PRIVATE_KEY;
  const subject=process.env.VAPID_SUBJECT||'mailto:argus@example.com';
  if(!pub||!priv)return res.status(200).json({ok:false,configured:false,reason:'VAPID_NOT_CONFIGURED',lazyLoad:true});
  if(!storageReady())return res.status(503).json({error:'Push storage unavailable'});

  const mod=await import('web-push');
  const webpush=mod.default||mod;
  webpush.setVapidDetails(subject,pub,priv);
  const [subs,feed,state]=await Promise.all([
    readJsonFresh(SUBS,{subscriptions:[]}),
    readJsonFresh(FEED,{alerts:[]}),
    readJsonFresh(STATE,{sent:{}})
  ]);

  const activeSubs=subs.subscriptions||[];
  const candidates=(feed.alerts||[]).filter(a=>a.pushEligible&&!state.sent?.[a.id]).slice(0,10);
  const dead=new Set();
  const deliveries=[];
  let sent=0,failed=0;

  if(!activeSubs.length){
    return res.status(200).json({
      ok:true,
      configured:true,
      alerts:candidates.length,
      subscriptions:0,
      sent:0,
      failed:0,
      pending:candidates.length,
      reason:'NO_ACTIVE_SUBSCRIPTIONS'
    });
  }

  state.sent=state.sent||{};
  for(const a of candidates){
    const payload=payloadFor(a);
    let alertSent=0;
    let alertFailed=0;
    for(const row of activeSubs){
      try{
        await webpush.sendNotification(row.subscription,payload,{TTL:a.operationalAlert?1800:900,urgency:a.qualityTier==='CRITICAL'?'high':'normal'});
        sent++;
        alertSent++;
      }catch(e){
        failed++;
        alertFailed++;
        if([404,410].includes(Number(e.statusCode)))dead.add(row.id);
      }
    }
    if(alertSent>0)state.sent[a.id]=new Date().toISOString();
    deliveries.push({alertId:a.id,type:a.type||null,operationalAlert:Boolean(a.operationalAlert),sent:alertSent,failed:alertFailed,retryPending:alertSent===0});
  }

  if(dead.size){
    subs.subscriptions=activeSubs.filter(x=>!dead.has(x.id));
    await writeJson(SUBS,subs);
  }
  if(Object.keys(state.sent).length){
    const entries=Object.entries(state.sent).slice(-500);
    state.sent=Object.fromEntries(entries);
    state.updatedAt=new Date().toISOString();
    await writeJson(STATE,state);
  }

  return res.status(200).json({
    version:'PUSH-DISPATCH-4',
    ok:true,
    configured:true,
    alerts:candidates.length,
    subscriptions:subs.subscriptions?.length||0,
    sent,
    failed,
    removedSubscriptions:dead.size,
    deliveries,
    policy:{operationalIncidentsSupported:true,lazyWebPushImport:true,consistentMutableReads:true,automaticWagering:false}
  });
}
