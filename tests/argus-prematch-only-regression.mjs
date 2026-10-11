import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPrematchFixture, prematchFixtures } from '../api/_prematch-scope.js';
const t=Date.parse('2026-10-11T12:00:00Z');
const future='2026-10-11T14:00:00Z',past='2026-10-11T10:00:00Z';
const fixture=(x={})=>({id:1,home:'Home',away:'Away',kickoff:future,status:'NS',isLive:false,isFinished:false,...x});
assert.equal(isPrematchFixture(fixture(),t),true);
assert.equal(isPrematchFixture(fixture({status:'TBD'}),t),true);
for(const x of [{isLive:true},{isFinished:true},{status:'1H'},{status:'2H'},{status:'HT'},{status:'FT'},{status:'PEN'},{status:'LIVE'},{status:{short:'1H'}},{kickoff:past},{kickoff:'invalid'},{kickoff:null}]){
 assert.equal(isPrematchFixture(fixture(x),t),false,JSON.stringify(x));
}
const testFixtures=[fixture({id:1}),fixture({id:2,isLive:true}),fixture({id:3,kickoff:past}),fixture({id:4,status:'FT'})];
assert.deepEqual(prematchFixtures(testFixtures,t).map(x=>x.id),[1]);
assert.deepEqual(prematchFixtures(null,t),[]);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('app.js'),scheduler=read('api/decision-scheduler.js'),autopilot=read('api/autopilot-v2.js');
assert.ok(app.includes('state.matches=scoped'), 'client must scope to future pre-match');
assert.ok(scheduler.includes('matches=prematchFixtures(body.matches)'), 'server scheduler must scope input');
assert.ok(autopilot.includes('const matches=prematchFixtures(live.matches)'), 'autopilot must scope fixtures');
const fast=read('api/fast-cycle.js'), paper=read('api/live-paper-bankroll.js');
assert.ok(!fast.includes("handler:livePaperBankroll"),'live jobs must be unscheduled');
assert.ok(paper.includes("if(req.method==='POST')return res.status(410)"),'new live bets must be rejected');
const index=read('index.html'),results=read('prediction-results.html'),daily=read('daily-slip.html'),mobile=read('src/argus-os.js'),legacy=read('live.html');
for(const [name,html] of [['index.html',index],['prediction-results.html',results],['daily-slip.html',daily]]) {
 assert.ok(html.includes('href="daily-slip.html">Predictions'),name+' must feature Predictions');
 assert.ok(!html.includes('href="live.html"'),name+' must not link Live');
}
assert.ok(!mobile.includes("['bets','Bets'"),'dynamic mobile nav must not add Bets');
assert.ok(mobile.includes("['picks','Predictions','/daily-slip.html']"),'mobile Predictions tab required');
assert.ok(legacy.includes('location.replace(\'/daily-slip.html\')'),'old Live page must redirect');
console.log('ARGUS PRE-MATCH ONLY regression: OK');
