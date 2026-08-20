import { readJson, writeJson, storageReady } from './_report-store.js';

const PLAN_PATH='argus/autopilot/decision-plan.json';
const SKILL_PATH='argus/learning/skill-map.json';
const OUT='argus/autopilot/resource-policy.json';
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
function minutesToKickoff(row){const t=new Date(row?.kickoff||0).getTime();return Number.isFinite(t)?Math.round((t-Date.now())/60000):99999}
function dominantQuotaMode(plan=[]){const modes=plan.map(x=>x?.quotaMode).filter(Boolean);if(modes.includes('EMERGENCY'))return'EMERGENCY';if(modes.includes('SAFE'))return'SAFE';if(modes.includes('CONSERVE'))return'CONSERVE';if(modes.includes('NORMAL'))return'NORMAL';return'UNKNOWN'}
function budgetMode(quotaMode,urgent,strongCount){if(quotaMode==='EMERGENCY')return'EMERGENCY';if(quotaMode==='SAFE')return'CONSERVE';if(quotaMode==='CONSERVE')return urgent?'NORMAL':'CONSERVE';if(quotaMode==='NORMAL'&&strongCount>=2&&!urgent)return'EXPAND';return'NORMAL'}
function policy(mode,urgent){const table={EMERGENCY:{tacticalTeams:0,heavyEnrichment:false,monitorFactor:2.5,explorationShare:0},CONSERVE:{tacticalTeams:1,heavyEnrichment:true,monitorFactor:1.5,explorationShare:.15},NORMAL:{tacticalTeams:2,heavyEnrichment:true,monitorFactor:1,explorationShare:.30},EXPAND:{tacticalTeams:3,heavyEnrichment:true,monitorFactor:.8,explorationShare:.35}};const p=table[mode]||table.NORMAL;if(urgent&&mode!=='EMERGENCY')return{...p,tacticalTeams:Math.max(1,p.tacticalTeams),monitorFactor:Math.min(1,p.monitorFactor)};return p}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const [planDoc,skill]=await Promise.all([readJson(PLAN_PATH,{plan:[],generatedAt:null}),readJson(SKILL_PATH,{byLeague:{},strongest:[],weakest:[],generatedAt:null})]);
  const plan=Array.isArray(planDoc?.plan)?planDoc.plan:[];
  const quotaMode=dominantQuotaMode(plan),urgent=plan.some(x=>{const m=minutesToKickoff(x);return x?.isLive||(m>=0&&m<=90)}),strongCount=(skill?.strongest||[]).filter(x=>x?.status==='STRONG').length;
  const mode=budgetMode(quotaMode,urgent,strongCount),allocation=policy(mode,urgent);
  const snapshot={version:'ARGUS-RESOURCE-INTELLIGENCE-1',generatedAt:new Date().toISOString(),mode,quotaMode,urgent,strongSegments:strongCount,planRows:plan.length,allocation,principles:{preserveQuotaReserve:true,urgentMatchesOverrideConservationExceptEmergency:true,skillMapGuidesDepthNotVerdict:true,explorationFloor:true,neverCreatesPrime:true,neverOverridesGovernance:true},skillMapGeneratedAt:skill?.generatedAt||null,decisionPlanGeneratedAt:planDoc?.generatedAt||null};
  await writeJson(OUT,snapshot);
  return res.status(200).json(snapshot);
}
