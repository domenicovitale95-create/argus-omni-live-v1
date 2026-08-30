import assert from 'node:assert/strict';
import fs from 'node:fs';
import scheduler from '../api/decision-scheduler.js';

function responseCapture(){
  let statusCode=200,body=null;
  const headers={};
  const res={
    setHeader(k,v){headers[String(k).toLowerCase()]=v;return res},
    status(c){statusCode=Number(c)||200;return res},
    json(v){body=v;return v},
    send(v){body=v;return v},
    end(v){if(v!==undefined)body=v;return v}
  };
  return{res,snapshot:()=>({statusCode,body,headers})};
}

const kickoff=new Date(Date.now()+60*60*1000).toISOString();
const goodReq={
  method:'POST',
  headers:{},
  body:{
    matches:[{id:101,fixtureId:101,home:'Alpha',away:'Beta',competition:'Regression League',kickoff,isFinished:false,isLive:false,dataQuality:0.8,preMatchModel:{home:.6,draw:.22,away:.18},markets:{home:2.0,draw:3.4,away:4.2}}],
    eligibility:{
      decisions:{
        '101':{verdict:'VALUE',eligible:true,dataQuality:80,confidence:{raw:68,net:64},issues:[],positive:['EDGE_5.0PP'],candidate:{side:'HOME',selection:'HOME',label:'HOME',marketType:'1X2',odds:2.0,edgePct:5,probability:.6,evPct:20,fairOdds:1.667,dataQuality:80,modelVersion:'REGRESSION-MODEL-1',validationStatus:'VALIDATED'}}
      },
      summary:{value:1,eligible:1}
    },
    portfolio:{portfolio:{'101':{blocked:false,portfolioEligible:true,rankScore:73,reasons:[]}}},
    staking:{stakes:{'101':{stakePct:1.2,selection:'HOME',odds:2.0}}},
    preKickoffGates:[{fixtureId:101,status:'OPEN',lineupsConfirmed:true}]
  }
};
const goodCap=responseCapture();
await scheduler(goodReq,goodCap.res);
const good=goodCap.snapshot();
assert.equal(good.statusCode,200);
assert.equal(good.body.version,'DECISION-SCHEDULER-14-FLOW-RECOVERY');
assert.equal(good.body.summary.funnel.discovered,1);
assert.equal(good.body.summary.funnel.eligibilityResolved,1);
assert.equal(good.body.summary.funnel.candidates,1);
assert.equal(good.body.summary.funnel.staked,1);
assert.equal(good.body.summary.funnel.actionable,1);
assert.equal(good.body.summary.verdicts.VALUE,1);
const row=good.body.plan[0];
assert.equal(row.eligibilityStatus,'VALUE');
assert.equal(row.verdict,'VALUE');
assert.equal(row.eligible,true);
assert.equal(row.betEligible,true);
assert.equal(row.portfolioBlocked,false);
assert.equal(row.recommendedStakePct,1.2);
assert.equal(row.stakeSelection,'HOME');
assert.equal(row.stakeOdds,2);
assert.equal(row.dataQualityPct,80);
assert.equal(row.preKickoffGate,'OPEN');
assert.equal(row.lineupsConfirmed,true);
assert.equal(row.eligibilityCandidate.modelVersion,'REGRESSION-MODEL-1');

const missingReq={method:'POST',headers:{},body:{matches:[{id:202,fixtureId:202,home:'Gamma',away:'Delta',competition:'Regression League',kickoff,isFinished:false,isLive:false,dataQuality:80,preMatchModel:{home:.5,draw:.25,away:.25},markets:{home:2.1,draw:3.2,away:3.5}}]}};
const missingCap=responseCapture();
await scheduler(missingReq,missingCap.res);
const missing=missingCap.snapshot();
assert.equal(missing.statusCode,200);
assert.equal(missing.body.plan[0].eligibilityStatus,'MISSING');
assert.equal(missing.body.plan[0].eligible,false);
assert.equal(missing.body.plan[0].recommendedStakePct,0);
assert.equal(missing.body.plan[0].tier,'C');
assert.equal(missing.body.summary.funnel.eligibilityResolved,0);
assert.equal(missing.body.summary.eligibility.MISSING,1);
assert.equal(missing.body.summary.eligibility.UNKNOWN,undefined);

const eligibilityBoundary=fs.readFileSync(new URL('../api/bet-eligibility.js',import.meta.url),'utf8');
assert.match(eligibilityBoundary,/x>=0&&x<=1\?x\*100:x/,'Eligibility boundary must normalize fractional quality to percent');
assert.match(eligibilityBoundary,/dataQualityScale:'PERCENT_0_100'/,'Eligibility boundary must declare normalized quality contract');

console.log('ARGUS flow-recovery regression: OK');
