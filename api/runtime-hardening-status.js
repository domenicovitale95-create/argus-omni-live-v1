export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json({
    version:'RUNTIME-HARDENING-1',
    generatedAt:new Date().toISOString(),
    dep0169:{
      directRepositoryUsage:false,
      mitigatedDependency:'web-push',
      pinnedUpstreamCommit:'658a8889aa06cb7292d16ae7f95773a9e97ded04',
      regressionGuard:'.github/workflows/runtime-deprecation-regression.yml',
      productionVerified:false
    },
    policy:{
      noAuthWeakening:true,
      noModelMutation:true,
      noThresholdMutation:true,
      noProviderQuotaMutation:true,
      automaticWagering:false,
      productionVerifiedOnlyAfterFreshRuntimeEvidence:true
    }
  });
}
