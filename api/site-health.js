import { storageReady } from './_report-store.js';

function flag(v){return Boolean(String(v||'').trim())}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});

  const checks={
    footballData:flag(process.env.API_FOOTBALL_KEY),
    persistentStorage:storageReady(),
    cronAuth:flag(process.env.CRON_SECRET),
    webPush:Boolean(flag(process.env.VAPID_PUBLIC_KEY)&&flag(process.env.VAPID_PRIVATE_KEY)),
    emailAlerts:Boolean(flag(process.env.RESEND_API_KEY)&&flag(process.env.ARGUS_ALERT_FROM))
  };

  const critical=['footballData','persistentStorage'];
  const optional=['cronAuth','webPush','emailAlerts'];
  const missingCritical=critical.filter(k=>!checks[k]);
  const optionalMissing=optional.filter(k=>!checks[k]);
  // SITE HEALTH must describe whether the core website can operate. Optional notification
  // integrations are reported separately and must not downgrade an otherwise healthy site.
  const status=missingCritical.length?'DEGRADED':'HEALTHY';
  const featureAvailability=optionalMissing.length?'OPTIONAL_FEATURES_MISSING':'FULL';
  const deployment={
    provider:'VERCEL',
    environment:process.env.VERCEL_ENV||null,
    gitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,
    gitBranch:process.env.VERCEL_GIT_COMMIT_REF||null,
    deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null,
    region:process.env.VERCEL_REGION||null
  };

  return res.status(200).json({
    version:'SITE-HEALTH-3',
    generatedAt:new Date().toISOString(),
    status,
    featureAvailability,
    checks,
    missingCritical,
    optionalMissing,
    deployment,
    notes:{
      footballData:'Required for live football ingestion.',
      persistentStorage:'Required for reports, training memory, alerts and self-improvement.',
      cronAuth:'Recommended security feature; absence does not make the core website unavailable.',
      webPush:'Optional notification channel. Missing configuration does not make the website unhealthy.',
      emailAlerts:'Optional notification channel. Missing configuration does not make the website unhealthy.',
      deployment:'Safe metadata used by the watchdog to detect production/repository version drift.'
    },
    secretValuesExposed:false
  });
}
