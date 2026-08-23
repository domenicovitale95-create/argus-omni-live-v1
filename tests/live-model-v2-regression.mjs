import assert from 'node:assert/strict';
import { liveModelSnapshot, probabilityForSelection, MODEL_VERSION } from '../api/_live-model-v2.js';
import { bestMarketCandidate } from '../api/_market-candidate.js';
import eligibilityHandler from '../api/bet-eligibility-v2.js';

const now=()=>new Date().toISOString();
const history=(gf=1.45,ga=1.15)=>({matches:10,pointsPerGame:1.55,goalsForPerGame:gf,goalsAgainstPerGame:ga,homePPG:1.65,awayPPG:1.45,last5PPG:1.6});
function match({minute=60,homeGoals=0,awayGoals=0,markets=true,observedAt=now()}={}){
  return{id:999001,fixtureId:999001,competition:'Regression League',status:'2H',isLive:true,isFinished:false,minute,kickoff:new Date(Date.now()-minute*60000).toISOString(),observedAt,home:'Alpha',away:'Beta',score:{home:homeGoals,away:awayGoals},stats:{shotsHome:10,shotsAway:9,shotsOnTargetHome:4,shotsOnTargetAway:4,cornersHome:4,cornersAway:4,possessionHome:51,possessionAway:49},markets:markets?{home:2.55,draw:3.25,away:3.05}:{},marketOdds:markets?{over15:1.32,under15:3.6,over25:1.95,under25:1.92,over35:3.15,under35:1.38,bttsYes:1.78,bttsNo:2.0,doubleChance1X:1.39,doubleChance12:1.34,doubleChanceX2:1.48,homeOver05:1.22,homeUnder05:4.4,awayOver05:1.3,awayUnder05:3.4,coverage:15}:{},preMatchModel:{home:.42,draw:.28,away:.30},history90d:{home:history(1.55,1.05),away:history(1.3,1.25)}};
}

function drawP(opts){const m=match({...opts,markets:false}),s=liveModelSnapshot(m);assert(s);return probabilityForSelection(m,'DRAW',s)}

const early00=drawP({minute:20,homeGoals:0,awayGoals:0});
const late00=drawP({minute:86,homeGoals:0,awayGoals:0});
const late10=drawP({minute:86,homeGoals:1,awayGoals:0});
const late30=drawP({minute:86,homeGoals:3,awayGoals:0});

assert(late00>early00+.15,`late 0-0 draw probability must rise materially: early=${early00}, late=${late00}`);
assert(late00>late10,`86' 0-0 must have more draw probability than 1-0: ${late00} vs ${late10}`);
assert(late10>late30,`86' 1-0 must have more draw probability than 3-0: ${late10} vs ${late30}`);
assert(late30<.01,`86' 3-0 draw probability must be near zero, got ${late30}`);

const live=match();
const snap=liveModelSnapshot(live);
assert.equal(snap.modelVersion,MODEL_VERSION);
assert.equal(snap.validationStatus,'SHADOW_ONLY');
assert(Math.abs(snap.official1x2.HOME+snap.official1x2.DRAW+snap.official1x2.AWAY-1)<1e-10,'1X2 simplex must sum to one');
assert.equal(snap.integrity.scoreConditioned,true);
assert.equal(snap.integrity.timeConditioned,true);
assert.equal(snap.integrity.marketCalibrated,true);

const universe=bestMarketCandidate(live);
assert(universe.candidate,'live fixture with prices must produce a ranked candidate');
assert.equal(universe.candidate.source,'LIVE_V2');
assert.equal(universe.candidate.modelVersion,MODEL_VERSION);
assert.equal(universe.candidate.validationStatus,'SHADOW_ONLY');
assert.equal(universe.candidate.mathIntegrity.ok,true,JSON.stringify(universe.candidate.mathIntegrity));
const c=universe.candidate;
assert(Math.abs(c.fairOdds-1/c.probability)<.02,'fair odds must be reciprocal of outcome probability');
assert(Math.abs(c.evPct-(c.probability*c.odds-1)*100)<.05,'EV must use the same probability and price');
assert(Math.abs(c.edgePct-(c.probability-c.marketProbability)*100)<.05,'edge must use the same probability and no-vig market probability');

async function eligibility(m){let body=null,code=null;const req={method:'POST',body:{matches:[m],preKickoffGates:[]}},res={setHeader(){},status(x){code=x;return this},json(x){body=x;return x}};await eligibilityHandler(req,res);assert.equal(code,200);return body.decisions[String(m.id)]}
const freshDecision=await eligibility(live);
assert.equal(freshDecision.eligible,false,'unvalidated Live V2 must never be eligible');
assert(freshDecision.issues.includes('LIVE_V2_SHADOW_ONLY'),'shadow-only validation gate must be visible');
assert.equal(freshDecision.candidate.modelVersion,MODEL_VERSION);
assert.equal(freshDecision.confidence.meaning,'DECISION_EVIDENCE_SCORE_NOT_OUTCOME_PROBABILITY');

const stale=match({minute:86,observedAt:new Date(Date.now()-120000).toISOString()});
const staleDecision=await eligibility(stale);
assert.equal(staleDecision.eligible,false);
assert.equal(staleDecision.verdict,'NO BET');
assert(staleDecision.issues.includes('EVIDENCE_STALE_OR_WEAK'),'stale late-live snapshot must hard block');
assert(staleDecision.evidenceFreshness.maxAllowedAgeSeconds===45,'80+ minute snapshots must be capped at 45 seconds');

console.log(JSON.stringify({ok:true,modelVersion:MODEL_VERSION,drawRegression:{early00,late00,late10,late30},candidate:{selection:c.selection,probability:c.probability,fairOdds:c.fairOdds,edgePct:c.edgePct,evPct:c.evPct},freshVerdict:freshDecision.verdict,staleVerdict:staleDecision.verdict},null,2));
