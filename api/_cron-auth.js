export function reportAuthorization(req,env=process.env){
  const secret=String(env?.REPORT_CRON_SECRET||'').trim();
  return secret?`Bearer ${secret}`:(req?.headers?.authorization||'');
}
