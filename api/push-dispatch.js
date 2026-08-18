import webpush from 'web-push';
import { readJson, writeJson, storageReady } from './_report-store.js';

const SUBS='argus/push/subscriptions.json';
const STATE='argus/push/state.json';
const FEED='argus/alerts/feed.json';

function authorized(req){
  const secret=process.env.CRON_SECRET;
  return !secret||req.headers.authorization===`Bearer ${secret}`;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({error:'Push storage unavailable'});

  const pub=process.env.VAPID_PUBLIC_KEY;
  const priv=process.env.VAPID_PRIVATE_KEY;
  const subject=process.env.VAPID_SUBJECT||'mailto:argus@example.com';
  if(!pub||!priv)return res.status(200).json({ok:false,configured:false,reason:'VAPID_NOT_CONFIGURED'});

  webpush.setVapidDetails(subject,pub,priv);
  const [subs,feed,state]=await Promise.all([
    readJson(SUBS,{subscriptions:[]}),
    readJson(FEED,{alerts:[]}),
    readJson(STATE,{sent:{}})
  ]);

  const activeSubs=subs.subscriptions||[];
  const candidates=(feed.alerts||[]).filter(a=>a.pushEligible&&!state.sent?.[a.id]).slice(0,10);
  const dead=new Set();
  const deliveries=[];
  let sent=0,failed=0;

  // Do not consume alerts before at least one device has subscribed.
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
    const payload=JSON.stringify({
      title:`ARGUS ${a.verdict} · ${a.qualityTier||'HIGH'}`,
      body:`${a.home} vs ${a.away} · ${a.selection||'pick'}${a.odds?` @ ${Number(a.odds).toFixed(2)}`:''}${a.confidence!=null?` · ${a.confidence}% confidence`:''}`,
      tag:`argus-${a.fixtureId}-${a.selection||''}`,
      url:'/daily-slip.html'
    });

    let alertSent=0;
    let alertFailed=0;
    for(const row of activeSubs){
      try{
        await webpush.sendNotification(row.subscription,payload,{TTL:900,urgency:a.qualityTier==='CRITICAL'?'high':'normal'});
        sent++;
        alertSent++;
      }catch(e){
        failed++;
        alertFailed++;
        if([404,410].includes(Number(e.statusCode)))dead.add(row.id);
      }
    }

    // Mark consumed only when at least one device actually received it.
    if(alertSent>0)state.sent[a.id]=new Date().toISOString();
    deliveries.push({alertId:a.id,sent:alertSent,failed:alertFailed,retryPending:alertSent===0});
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
    ok:true,
    configured:true,
    alerts:candidates.length,
    subscriptions:subs.subscriptions?.length||0,
    sent,
    failed,
    removedSubscriptions:dead.size,
    deliveries
  });
}
