import { listJson, readManyJson, readJson, storageReady } from './_report-store.js';

const cap=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const pct=(v,d)=>d?Math.round(v/d*100):0;
function bucket(p){const pc=Math.max(0,Math.min(99.999,Number(p)*100)),lo=Math.floor(pc/5)*5;return `${lo}-${lo+5}`}
function brusselsClock(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),m=Object.fromEntries(parts.map(x=>[x.type,x.value]));return{hour:Number(m.hour),minute:Number(m.minute)}}
function scheduledIdle(){const c=brusselsClock();return c.hour<6&&!(c.hour===0&&c.minute<=30)}
function automationEvidence(plan){const generated=plan?.generatedAt?new Date(plan.generatedAt).getTime():0,ageMinutes=generated?Math.max(0,Math.round((Date.now()-generated)/60000)):null,rows=Array.isArray(plan?.plan)?plan.plan.length:0,idle=scheduledIdle();let score=20,status='NO_PERSISTED_PLAN';if(generated){if(idle&&ageMinutes<=720){score=80;status='SCHEDULED_IDLE'}else if(ageMinutes<=35){score=95;status='RECENT_PLAN'}else if(ageMinutes<=180){score=80;status='PLAN_AVAILABLE'}else if(ageMinutes<=720){score=60;status='PLAN_STALE'}else{score=40;status='PLAN_VERY_STALE'}}return{score,status,ageMinutes,rows,generatedAt:plan?.generatedAt||null,scheduledIdle:idle}}
function decisionIntegrity(plan){let critical=0,high=0;for(const r of plan?.plan||[]){const v=String(r.finalVerdict||'NO BET'),active=Boolean(r.betEligible),decay=String(r.signalDecayStatus||''),move=String(r.marketMovement||''),timing=String(r.timingAction||''),edge=Number(r.eligibilityCandidate?.edgePct),conf=Number(r.netConfidence),stake=Number(r.recommendedStakePct||0);if(active&&!['PRIME','VALUE'].includes(v))critical++;if(active&&['EXPIRED','DECAYING'].includes(decay))critical++;if(active&&['REVERSAL','ADVERSE_STEAM'].includes(move))critical++;if(active&&r.preKickoffGate==='BLOCKED')critical++;if(active&&r.portfolioBlocked)critical++;if(!active&&stake>0)critical++;if(active&&timing==='WAIT')high++;if(v==='PRIME'&&Number.isFinite(edge)&&edge<6)high++;if(v==='PRIME'&&Number.isFinite(conf)&&conf<68)high++;if(v==='VALUE'&&Number.isFinite(edge)&&edge<3.5)high++;if(v==='VALUE'&&Number.isFinite(conf)&&conf<58)high++}const score=cap(100-critical*35-high*8);return{score,status:critical?'FAIL':high?'CAUTION':'PASS',critical,high}}
function cohortStatus(n){if(n>=30)return'VALIDATED_SAMPLE';if(n>=10)return'LEARNING_SAMPLE';if(n>0)return'SPARSE_SAMPLE';return'NO_SAMPLE'}
function trustState({recordedSettled,shadowSettled,calN,strongSettled,validatedCohorts,integrityScore}){if(recordedSettled>=50&&shadowSettled>=100&&calN>=60&&strongSettled>=60&&validatedCohorts>=3&&integrityScore>=95)return'VALIDATED';if(shadowSettled>=20||calN>=20||strongSettled>=20)return'LEARNING';return'TRAINING_WEAK'}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(200).json({score:15,status:'INFRASTRUCTURE BLOCKED',trainingReadiness:{state:'TRAINING_WEAK',rootCause:['PERSISTENCE_UNAVAILABLE']},components:{storage:0},note:'Vercel Blob storage is not linked; learning cannot persist.'});

  const [reportBlobs,ledgerBlobs,shadowBlobs,plan]=await Promise.all([listJson('argus/reports/',180),listJson('argus/ledger/',180),listJson('argus/shadow/',180),readJson('argus/autopilot/decision-plan.json',{plan:[],generatedAt:null})]);
  const [reports,ledgers,shadows]=await Promise.all([readManyJson(reportBlobs),readManyJson(ledgerBlobs),readManyJson(shadowBlobs)]);

  let recordedSettled=0,recordedActionable=0,reportSettled=0,shadowSettled=0,shadowPriced=0,shadowPicks=0,clvN=0,clvSum=0,lateFreeze=0,missingFreeze=0,brierSum=0,calN=0,strongSettled=0,strongCandidates=0;
  const marketKeys=new Set(),leagueKeys=new Set(),buckets={},cohorts={};

  for(const report of reports)for(const row of report.matches||[]){if(row.competition)leagueKeys.add(row.competition);if(['WIN','LOSS'].includes(row.outcome))reportSettled++}
  for(const book of ledgers)for(const row of book.records||[]){
    if(row.competition)leagueKeys.add(row.competition);
    const settled=['WIN','LOSS'].includes(row.settlement?.status),immutablePrematch=row.integrity?.frozenBeforeKickoff===true&&row.integrity?.evidenceFrozenAtDecisionTime===true;
    if(settled&&immutablePrematch){recordedSettled++;if(Number(row.recommendedStakePct)>0)recordedActionable++}
  }

  for(const book of shadows)for(const f of Object.values(book.fixtures||{})){
    if(f.competition)leagueKeys.add(f.competition);
    const ko=new Date(f.kickoff||0).getTime(),fr=new Date(f.frozenAt||0).getTime();
    const freezeValid=Boolean(f.frozenAt)&&Number.isFinite(ko)&&Number.isFinite(fr)&&fr<ko;
    if(!f.frozenAt)missingFreeze++;else if(Number.isFinite(ko)&&Number.isFinite(fr)&&fr>=ko)lateFreeze++;
    for(const p of f.picks||[]){
      shadowPicks++;marketKeys.add(p.key);if(p.odds)shadowPriced++;
      const pr=Number(p.probability),probValid=Number.isFinite(pr)&&pr>0&&pr<1,priceValid=Number.isFinite(Number(p.odds))&&Number(p.odds)>1;
      if(freezeValid&&probValid&&priceValid)strongCandidates++;
      if(['WIN','LOSS'].includes(p.outcome)){
        shadowSettled++;
        const league=String(f.competition||'UNKNOWN_LEAGUE'),market=String(p.key||'UNKNOWN_MARKET'),ck=`${league}::${market}`;
        const c=cohorts[ck]||(cohorts[ck]={league,market,settled:0,strongSettled:0,wins:0,losses:0,calibrationSamples:0});
        c.settled++;if(p.outcome==='WIN')c.wins++;else c.losses++;
        if(freezeValid&&probValid&&priceValid){strongSettled++;c.strongSettled++}
        if(Number.isFinite(Number(p.clv))){clvN++;clvSum+=Number(p.clv)}
        if(probValid){const y=p.outcome==='WIN'?1:0;brierSum+=(pr-y)**2;calN++;c.calibrationSamples++;const b=bucket(pr);if(!buckets[b])buckets[b]={n:0,p:0,y:0};buckets[b].n++;buckets[b].p+=pr;buckets[b].y+=y}
      }
    }
  }

  const cohortRows=Object.values(cohorts).map(c=>({...c,status:cohortStatus(c.strongSettled),winRate:c.settled?Number((c.wins/c.settled).toFixed(3)):null})).sort((a,b)=>b.strongSettled-a.strongSettled||b.settled-a.settled);
  const validatedCohorts=cohortRows.filter(c=>c.strongSettled>=30).length,learningCohorts=cohortRows.filter(c=>c.strongSettled>=10&&c.strongSettled<30).length,sparseCohorts=cohortRows.filter(c=>c.strongSettled>0&&c.strongSettled<10).length;
  const clvCoverage=pct(clvN,shadowSettled),avgCLV=clvN?clvSum/clvN:null,freezeIntegrity=cap(100-lateFreeze*20-missingFreeze*10),brier=calN?brierSum/calN:null;
  let ece=0;if(calN)for(const b of Object.values(buckets)){ece+=(b.n/calN)*Math.abs(b.p/b.n-b.y/b.n)}
  const calibrationEvidence=cap(Math.round(calN/1.2)),calibrationAccuracy=calN?cap(Math.round(100-ece*500)):0,calibrationMaturity=Math.round(calibrationEvidence*.55+calibrationAccuracy*.45),auto=automationEvidence(plan),decisionAudit=decisionIntegrity(plan),integrityScore=Math.min(freezeIntegrity,decisionAudit.score);
  const components={dataPersistence:100,trackRecord:cap(recordedSettled),shadowLearning:cap(Math.round(shadowSettled/1.2)),marketCoverage:cap(Math.round((marketKeys.size/12)*100)),realPriceCoverage:cap(pct(shadowPriced,shadowPicks)),calibrationMaturity,leagueDiversity:cap(Math.round((leagueKeys.size/12)*100)),clvCoverage:cap(clvCoverage),integrity:integrityScore,automation:auto.score};
  const weights={dataPersistence:.08,trackRecord:.14,shadowLearning:.14,marketCoverage:.09,realPriceCoverage:.08,calibrationMaturity:.15,leagueDiversity:.05,clvCoverage:.10,integrity:.10,automation:.07};
  const score=Math.round(Object.entries(weights).reduce((s,[k,w])=>s+components[k]*w,0));
  const status=score>=85&&integrityScore>=95&&calibrationMaturity>=70?'AUTOPILOT READY FOR SUPERVISED USE':score>=70?'ADVANCED TRAINING':score>=50?'TRAINING IN PROGRESS':'EARLY TRAINING';
  const state=trustState({recordedSettled,shadowSettled,calN,strongSettled,validatedCohorts,integrityScore});
  const rootCause=[];
  if(!shadows.length)rootCause.push('SHADOW_EVIDENCE_PIPELINE_EMPTY');
  if(strongSettled<60)rootCause.push('INSUFFICIENT_STRONG_SETTLED_EVIDENCE');
  if(recordedSettled<50)rootCause.push('INSUFFICIENT_VALID_RECORDED_SETTLEMENTS');
  if(calN<60)rootCause.push('CALIBRATION_SAMPLE_INSUFFICIENT');
  if(validatedCohorts<3)rootCause.push('LEAGUE_MARKET_COHORT_MEMORY_SPARSE');
  if(components.realPriceCoverage<60)rootCause.push('REAL_PRICE_COVERAGE_LOW');
  if(freezeIntegrity<95)rootCause.push('PREMATCH_FREEZE_INTEGRITY_GAP');
  if(decisionAudit.critical)rootCause.push('DECISION_GOVERNANCE_CONTRADICTION');
  if(!rootCause.length&&state!=='VALIDATED')rootCause.push('EVIDENCE_GATES_NOT_YET_COMPLETE');
  const blockers=[];
  if(recordedSettled<50)blockers.push(`Need ${50-recordedSettled} more immutable settled ledger predictions for a stronger real track record`);
  if(!shadows.length)blockers.push('Shadow evidence pipeline has no persisted books; verify shadow cron capture before waiting for sample growth');
  if(shadowSettled<100)blockers.push(`Need ${100-shadowSettled} more settled shadow predictions for broader validation`);
  if(components.realPriceCoverage<60)blockers.push('Real-price coverage across shadow markets is still limited');
  if(clvCoverage<60)blockers.push('Closing-line coverage is still too low for robust CLV validation');
  if(avgCLV!=null&&avgCLV<0)blockers.push('Average CLV is currently negative; ARGUS is not consistently beating the closing market');
  if(freezeIntegrity<95)blockers.push('Freeze-timing or persistence integrity gaps were detected');
  if(decisionAudit.critical)blockers.push(`Decision governance audit found ${decisionAudit.critical} critical contradiction(s); model promotion must remain frozen`);
  if(decisionAudit.high)blockers.push(`Decision governance audit found ${decisionAudit.high} high-severity inconsistency warning(s)`);
  if(calN<60)blockers.push('Probability calibration still needs more settled forecasts');
  if(ece>.08&&calN>=20)blockers.push('Calibration error remains high: predicted probabilities and observed frequencies diverge materially');
  if(marketKeys.size<8)blockers.push('More market families need settled evidence');
  if(validatedCohorts<3)blockers.push('League × market cohort evidence is too sparse for cohort-level trust');
  if(auto.score<60&&!auto.scheduledIdle)blockers.push('Persisted Autopilot decision plan is missing or very stale; verify scheduler execution without disabling autonomy');

  return res.status(200).json({version:'AUTOPILOT-READINESS-8',generatedAt:new Date().toISOString(),score,status,trainingReadiness:{state,strongData:{count:strongSettled,total:shadowSettled,candidatePrematchCount:strongCandidates,coveragePct:pct(strongSettled,shadowSettled)},validSettledCount:recordedSettled,leagueMarketCohortStatus:{total:Object.keys(cohorts).length,validated:validatedCohorts,learning:learningCohorts,sparse:sparseCohorts,top:cohortRows.slice(0,20)},calibrationSampleStatus:{samples:calN,status:calN>=60?'SUFFICIENT_FOR_GATE':calN>=20?'LEARNING':'INSUFFICIENT'},rootCause,trustTransitionRule:'TRAINING_WEAK -> LEARNING -> VALIDATED only from immutable prematch, valid settlement, calibration, cohort and integrity gates; no manual override.'},components,automationEvidence:auto,decisionIntegrity:decisionAudit,evidence:{reports:reports.length,reportSettled,ledgerBooks:ledgers.length,recordedSettled,recordedActionable,shadowBooks:shadows.length,shadowPicks,shadowSettled,shadowPriced,strongSettled,strongCandidates,marketFamilies:marketKeys.size,leagues:leagueKeys.size,cohorts:Object.keys(cohorts).length,validatedCohorts,learningCohorts,sparseCohorts,clvSamples:clvN,clvCoveragePct:clvCoverage,avgCLV:avgCLV==null?null:Number(avgCLV.toFixed(2)),lateFreeze,missingFreeze,calibrationSamples:calN,brier:brier==null?null:Number(brier.toFixed(4)),ecePct:calN?Number((ece*100).toFixed(1)):null},blockers,methodology:'Readiness is evidence-only. The official track record comes from immutable pre-kickoff Prediction Ledger records with valid WIN/LOSS settlement. Strong shadow evidence requires a pre-kickoff freeze, valid probability, real price, and valid WIN/LOSS settlement. Historical replay is never counted as fresh OOS evidence. Cohort diagnostics are observational and do not lower validation thresholds or authorize autonomous wagering.'});
}
