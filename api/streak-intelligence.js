import { readJson, writeJson, storageReady } from './_report-store.js';

const ARCHIVE='argus/research/historical-decade-fixtures.json';
const STATS='argus/research/historical-stats-enrichment.json';
const OUT='argus/research/streak-intelligence.json';
const MIN_STREAK=3;
const RECENT_WINDOW=10;
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;

function teamView(f,teamId){
  const home=Number(f.homeId)===Number(teamId),gf=home?n(f.homeGoals):n(f.awayGoals),ga=home?n(f.awayGoals):n(f.homeGoals);
  return{home,gf,ga,total:(gf??0)+(ga??0),won:gf>ga,draw:gf===ga,unbeaten:gf>=ga,scored:gf>0,cleanSheet:ga===0,btts:gf>0&&ga>0};
}
function statsView(s,home){
  const raw=s?.stats||{},d=s?.derived||{},mine=home?raw.home:raw.away,opp=home?raw.away:raw.home;
  return{available:s?.status==='AVAILABLE',cornersTotal:n(d.cornersTotal),teamCorners:n(mine?.corners),oppCorners:n(opp?.corners),yellowTotal:n(d.yellowCardsTotal),teamYellow:n(mine?.yellow),oppYellow:n(opp?.yellow),shotsOnTargetTotal:n(d.shotsOnTargetTotal),teamShotsOnTarget:n(mine?.shotsOnTarget),foulsTotal:n(d.foulsTotal)};
}
const CONDITIONS=[
  {id:'OVER_0_5_GOALS',label:'Over 0.5 goals',family:'GOALS',test:(v)=>v.total>.5},
  {id:'OVER_1_5_GOALS',label:'Over 1.5 goals',family:'GOALS',test:(v)=>v.total>1.5},
  {id:'OVER_2_5_GOALS',label:'Over 2.5 goals',family:'GOALS',test:(v)=>v.total>2.5},
  {id:'OVER_3_5_GOALS',label:'Over 3.5 goals',family:'GOALS',test:(v)=>v.total>3.5},
  {id:'GOAL',label:'GOAL',family:'GOAL_NO_GOAL',test:(v)=>v.btts},
  {id:'NO_GOAL',label:'NO GOAL',family:'GOAL_NO_GOAL',test:(v)=>!v.btts},
  {id:'TEAM_SCORED',label:'Team scored',family:'TEAM_GOALS',test:(v)=>v.scored},
  {id:'TEAM_OVER_1_5',label:'Team scored 2+ goals',family:'TEAM_GOALS',test:(v)=>v.gf>1.5},
  {id:'CLEAN_SHEET',label:'Clean sheet',family:'DEFENCE',test:(v)=>v.cleanSheet},
  {id:'UNBEATEN',label:'Unbeaten',family:'RESULT',test:(v)=>v.unbeaten},
  {id:'WIN',label:'Won',family:'RESULT',test:(v)=>v.won},
  {id:'CORNERS_OVER_8_5',label:'Match corners Over 8.5',family:'CORNERS',stats:true,test:(_,s)=>s.cornersTotal!=null&&s.cornersTotal>8.5},
  {id:'CORNERS_OVER_9_5',label:'Match corners Over 9.5',family:'CORNERS',stats:true,test:(_,s)=>s.cornersTotal!=null&&s.cornersTotal>9.5},
  {id:'CORNERS_OVER_10_5',label:'Match corners Over 10.5',family:'CORNERS',stats:true,test:(_,s)=>s.cornersTotal!=null&&s.cornersTotal>10.5},
  {id:'CORNERS_UNDER_7_5',label:'Match corners Under 7.5',family:'CORNERS',stats:true,test:(_,s)=>s.cornersTotal!=null&&s.cornersTotal<7.5},
  {id:'CORNERS_UNDER_8_5',label:'Match corners Under 8.5',family:'CORNERS',stats:true,test:(_,s)=>s.cornersTotal!=null&&s.cornersTotal<8.5},
  {id:'CORNERS_UNDER_9_5',label:'Match corners Under 9.5',family:'CORNERS',stats:true,test:(_,s)=>s.cornersTotal!=null&&s.cornersTotal<9.5},
  {id:'CORNERS_UNDER_10_5',label:'Match corners Under 10.5',family:'CORNERS',stats:true,test:(_,s)=>s.cornersTotal!=null&&s.cornersTotal<10.5},
  {id:'TEAM_CORNERS_OVER_4_5',label:'Team corners Over 4.5',family:'CORNERS',stats:true,test:(_,s)=>s.teamCorners!=null&&s.teamCorners>4.5},
  {id:'TEAM_CORNERS_UNDER_3_5',label:'Team corners Under 3.5',family:'CORNERS',stats:true,test:(_,s)=>s.teamCorners!=null&&s.teamCorners<3.5},
  {id:'TEAM_CORNERS_UNDER_4_5',label:'Team corners Under 4.5',family:'CORNERS',stats:true,test:(_,s)=>s.teamCorners!=null&&s.teamCorners<4.5},
  {id:'TEAM_CORNERS_UNDER_5_5',label:'Team corners Under 5.5',family:'CORNERS',stats:true,test:(_,s)=>s.teamCorners!=null&&s.teamCorners<5.5},
  {id:'YELLOW_OVER_3_5',label:'Match yellow cards Over 3.5',family:'CARDS',stats:true,test:(_,s)=>s.yellowTotal!=null&&s.yellowTotal>3.5},
  {id:'YELLOW_OVER_4_5',label:'Match yellow cards Over 4.5',family:'CARDS',stats:true,test:(_,s)=>s.yellowTotal!=null&&s.yellowTotal>4.5},
  {id:'YELLOW_OVER_5_5',label:'Match yellow cards Over 5.5',family:'CARDS',stats:true,test:(_,s)=>s.yellowTotal!=null&&s.yellowTotal>5.5},
  {id:'TEAM_YELLOW_OVER_1_5',label:'Team yellow cards Over 1.5',family:'CARDS',stats:true,test:(_,s)=>s.teamYellow!=null&&s.teamYellow>1.5},
  {id:'TEAM_YELLOW_OVER_2_5',label:'Team yellow cards Over 2.5',family:'CARDS',stats:true,test:(_,s)=>s.teamYellow!=null&&s.teamYellow>2.5},
  {id:'SOT_OVER_7_5',label:'Match shots on target Over 7.5',family:'SHOTS',stats:true,test:(_,s)=>s.shotsOnTargetTotal!=null&&s.shotsOnTargetTotal>7.5},
  {id:'TEAM_SOT_OVER_3_5',label:'Team shots on target Over 3.5',family:'SHOTS',stats:true,test:(_,s)=>s.teamShotsOnTarget!=null&&s.teamShotsOnTarget>3.5}
];
function currentStreakStrict(evals){let c=0;for(let i=evals.length-1;i>=0;i--){if(evals[i]===true)c++;else break;}return c}
function strength(streak,hitRate,sample,complete){if(!complete)return'INCOMPLETE_DATA';if(streak===10&&hitRate===100)return'PERFECT_10';if(streak>=8&&sample===10&&hitRate>=80)return'VERY_STRONG';if(streak>=5&&sample===10&&hitRate>=70)return'STRONG';if(streak>=3)return'ACTIVE';return'NONE'}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const archive=await readJson(ARCHIVE,null);if(!archive)return res.status(200).json({version:'STREAK-INTELLIGENCE-3',status:'WAITING_FOR_HISTORY',teams:[],trends:[]});
  const statStore=await readJson(STATS,{fixtures:{}}),statsById=statStore.fixtures||{},fixtures=Object.values(archive.fixtures||{}).sort((a,b)=>Number(a.timestamp||0)-Number(b.timestamp||0)),teams=new Map();
  for(const f of fixtures){for(const side of ['home','away']){const id=Number(f[`${side}Id`]);if(!id)continue;const t=teams.get(id)||{teamId:id,team:f[side]||String(id),matches:[]};t.team=f[side]||t.team;t.matches.push(f);teams.set(id,t)}}
  const trends=[];
  for(const t of teams.values()){
    const recent=t.matches.slice(-RECENT_WINDOW);
    if(recent.length<RECENT_WINDOW)continue;
    for(const c of CONDITIONS){const evals=[];let usable=0;for(const f of recent){const tv=teamView(f,t.teamId),sv=statsView(statsById[String(f.fixtureId)],tv.home);if(c.stats&&!sv.available){evals.push(null);continue}evals.push(Boolean(c.test(tv,sv)));usable++}
      const complete=usable===RECENT_WINDOW;const streak=currentStreakStrict(evals);if(streak<MIN_STREAK)continue;const hits=evals.filter(x=>x===true).length,hitRate=Number((hits/RECENT_WINDOW*100).toFixed(1)),coverage=Number((usable/RECENT_WINDOW*100).toFixed(1)),last=recent[recent.length-1],tvLast=teamView(last,t.teamId);trends.push({teamId:t.teamId,team:t.team,condition:c.id,label:c.label,family:c.family,currentStreak:streak,recentSample:RECENT_WINDOW,recentHits:hits,recentHitRate:hitRate,dataCoveragePct:coverage,completeWindow:complete,strength:strength(streak,hitRate,RECENT_WINDOW,complete),perfect10:complete&&streak===10&&hits===10,lastMatch:last?.date||null,lastOpponent:(tvLast.home?last.away:last.home)||null,source:c.stats?'HISTORICAL_FIXTURE_STATS':'VERIFIED_FINAL_SCORE',warning:'Trend uses exactly the 10 most recent consecutive team matches. Missing statistics break the streak; older matches are never pulled in to fill gaps.'})}}
  trends.sort((a,b)=>Number(b.perfect10)-Number(a.perfect10)||Number(b.completeWindow)-Number(a.completeWindow)||b.currentStreak-a.currentStreak||b.recentHitRate-a.recentHitRate);
  const report={version:'STREAK-INTELLIGENCE-3',generatedAt:new Date().toISOString(),historicalFixtures:fixtures.length,teamsAnalyzed:teams.size,activeTrends:trends.length,perfect10Count:trends.filter(x=>x.perfect10).length,policy:{minimumStreak:MIN_STREAK,recentWindow:RECENT_WINDOW,strictLatestTen:true,noGapFilling:true,missingStatsBreakStreak:true,olderMatchesNeverSubstitute:true,noPrimeCreation:true,descriptiveNotPredictive:true,noFabrication:true},families:[...new Set(CONDITIONS.map(x=>x.family))],trends:trends.slice(0,1500)};await writeJson(OUT,report);return res.status(200).json(report)
}
