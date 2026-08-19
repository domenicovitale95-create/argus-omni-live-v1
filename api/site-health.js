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
  const optional=['webPush','emailAlerts'];
  const missingCritical=critical.filter(k=>!checks[k]);
  const optionalMissing=optional.filter(k=>!checks[k]);
  const status=missingCritical.length?'DEGRADED':'HEALTHY';
  const securityStatus=checks.cronAuth?'SECURE':'ATTENTION';
  const securityIssues=checks.cronAuth?[]:['CRON_SECRET_MISSING'];
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
    version:'SITE-HEALTH-4',generatedAt:new Date().toISOString(),status,securityStatus,securityIssues,
    featureAvailability,checks,missingCritical,optionalMissing,deployment,
    notes:{
      footballData:'Required for live football ingestion.',
      persistentStorage:'Required for reports, training memory, alerts and self-improvement.',
      cronAuth:'Security-critical for autonomous scheduled and mutating endpoints. Missing configuration is reported without disabling Autopilot automatically.',
      webPush:'Optional notification channel.',
      emailAlerts:'Optional notification channel.',
      deployment:'Safe metadata used to detect production/repository drift.'
    },
    secretValuesExposed:false
  });
}
