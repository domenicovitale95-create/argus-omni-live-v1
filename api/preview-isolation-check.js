export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  const env=String(process.env.VERCEL_ENV||'').toLowerCase();
  const host=String((req.headers['x-forwarded-host']||req.headers.host||'')).split(',')[0].trim();
  const productionHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').trim().replace(/^https?:\/\//,'');
  const isPreview=env==='preview';
  const hostIsProduction=Boolean(productionHost)&&host===productionHost;
  const isolated=!isPreview||!hostIsProduction;
  return res.status(isolated?200:409).json({
    ok:isolated,
    version:'PREVIEW-ISOLATION-CHECK-1',
    environment:env||'unknown',
    requestHost:host||null,
    productionHost:productionHost||null,
    isPreview,
    hostIsProduction,
    isolated,
    rule:'A preview request must never resolve its execution host to the production host.'
  });
}
