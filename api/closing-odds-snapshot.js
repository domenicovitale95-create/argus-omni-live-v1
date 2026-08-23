import { readJson, writeJson, storageReady } from './_report-store.js';
import { VALIDATION_POLICY, isInValidationEpoch } from './_validation-policy.js';

const BANKROLL_PATH='argus/paper/virtual-bankroll.json';
const PLAN_PATH='argus/autopilot/decision-plan.json';
const WINDOW_MIN=35;
const n=(v,f=null)=>{const x=Number(v);return Number.isFinite(x)?x:f};
function authorized(req){const s=String(process.env.CRON_SECRET||'').trim();return!s||req.headers.authorization===`Bearer ${s}`}
function canonical(v){let x=String(v||'').trim().toUpperCase();if(/^EXACT_SCORE:\d+-\d+$/.test(x))return x;const score=x.match(/EXACT\s*SCORE\s*(\d+)\s*[-:]\s*(\d+)/);if(score)return`EXACT_SCORE:${score[1]}-${score[2]}`;x=x.replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');const a={HOME_WIN:'HOME',HOME_TEAM_TO_WIN:'HOME',AWAY_WIN:'AWAY',AWAY_TEAM_TO_WIN:'AWAY',OVER_1_5_GOALS:'OVER_1_5',UNDER_1_5_GOALS:'UNDER_1_5',OVER_2_5_GOALS:'OVER_2_5',UNDER_2_5_GOALS:'UNDER_2_5',OVER_3_5_GOALS:'OVER_3_5',UNDER_3_5_GOALS:'UNDER_3_5',BTTS:'BTTS_YES',BOTH_TEAMS_TO_SCORE_YES:'BTTS_YES',BOTH_TEAMS_TO_SCORE_NO:'BTTS_NO',HOME_TEAM_OVER_0_5:'HOME_OVER_0_5',HOME_TEAM_UNDER_0_5:'HOME_UNDER_0_5',AWAY_TEAM_OVER_0_5:'AWAY_OVER_0_5',AWAY_TEAM_UNDER_0_5:'AWAY_UNDER_0_5'};return a[x]||x}
function planSelection(r){return canonical(r?.stakeSelection||r?.eligibilityCandidate?.selection||r?.eligibilityCandidate?.side||'')}
function planOdds(r){const x=n(r?.stakeOdds??r?.eligibilityCandidate?.odds);return x&&x>1?x:null}
function evidence(opening,closing,minutes,now){return{version:'NEAR-CLOSE-PRICE-1',source:'DECISION_PLAN_CURRENT_MARKET',capturedAt:now,minutesToKickoff:minutes,sameSelection:true,openingOdds:Number(opening.toFixed(3)),closingOdds:Number(closing.toFixed(3)),rawClvPct:Number(((opening/closing-1)*100).toFixed(2)),impliedProbabilityMovePp:Number(((1/closing-1/opening)*100).toFixed(2)),independentClosingBook:false,providerCalls:0,note:'Near-kickoff same-selection price snapshot; positive CLV means the recorded entry price was better than the later observed price.'}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});if(!authorized(req))return res.status(401).json({error:'Unauthorized'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const [state,plan]=await Promise.all([readJson(BANKROLL_PATH,null),readJson(PLAN_PATH,{plan:[],generatedAt:null})]);if(!state)return res.status(200).json({ok:true,version:'NEAR-CLOSE-PRICE-1',updated:0,reason:'Virtual bankroll not initialized'});
  const byFixture=new Map((plan.plan||[]).map(r=>[String(r.fixtureId),r])),now=new Date().toISOString(),nowMs=Date.now();let considered=0,eligibleWindow=0,updated=0,selectionMismatch=0,priceMissing=0,alreadyCloser=0;
  for(const bet of Object.values(state.bets||{})){
    if(String(bet?.cohort||'OFFICIAL_PAPER')!=='OFFICIAL_PAPER'||bet?.integrity?.countsAsOfficialTrackRecord===false||!isInValidationEpoch(bet?.capturedAt))continue;
    considered++;const ko=new Date(bet.kickoff||0).getTime();if(!Number.isFinite(ko)||ko<=nowMs)continue;const minutes=(ko-nowMs)/60000;if(minutes<0||minutes>WINDOW_MIN)continue;eligibleWindow++;
    const row=byFixture.get(String(bet.fixtureId));if(!row)continue;const currentSel=planSelection(row),originalSel=canonical(bet.selection);if(!currentSel||currentSel!==originalSel){selectionMismatch++;continue}const close=planOdds(row),open=n(bet.odds);if(!(open>1&&close>1)){priceMissing++;continue}
    const prev=n(bet?.closingEvidence?.minutesToKickoff,Infinity);if(prev<=minutes){alreadyCloser++;continue}bet.closingEvidence=evidence(open,close,Number(minutes.toFixed(1)),now);updated++;
  }
  if(updated){state.updatedAt=now;state.validationEvidence={...(state.validationEvidence||{}),version:'ARGUS-VALIDATION-EVIDENCE-1',epoch:VALIDATION_POLICY.epoch,lastClosingSnapshotAt:now};await writeJson(BANKROLL_PATH,state)}
  return res.status(200).json({ok:true,version:'NEAR-CLOSE-PRICE-1',generatedAt:now,epoch:VALIDATION_POLICY.epoch,windowMinutes:WINDOW_MIN,planGeneratedAt:plan.generatedAt||null,considered,eligibleWindow,updated,selectionMismatch,priceMissing,alreadyCloser,providerCalls:0,automaticRealWagering:false});
}
