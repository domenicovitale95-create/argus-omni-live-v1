import { listJson, readManyJson, storageReady } from './_report-store.js';

function num(v){const x=Number(v);return Number.isFinite(x)?x:null}
function marketKey(prediction={}){const market=String(prediction.market||'1X2').trim().toUpperCase();const selection=String(prediction.selection||'').trim().toUpperCase();if(market==='1X2')return '1X2';if(market.includes('EXACT')||market.includes('CORRECT SCORE'))return 'EXACT SCORE';if(market.includes('BTTS'))return 'BTTS';if(market.includes('CORNER'))return 'CORNERS';if(market.includes('OVER')||market.includes('UNDER')||market.includes('GOAL'))return market;return selection||market||'UNKNOWN'}
function add(map,key,row){if(!map[key])map[key]={sample:0,wins:0,losses:0,pl:0,clvSum:0,clvN:0};const a=map[key];a.sample++;if(row.outcome==='WIN')a.wins++;if(row.outcome==='LOSS')a.losses++;if(num(row.pl)!=null)a.pl+=Number(row.pl);if(num(row._clv)!=null){a.clvSum+=Number(row._clv);a.clvN++}}
function profile(a){const n=a.wins+a.losses,roi=n?100*a.pl/n:null,hit=n?100*a.wins/n:null,clv=a.clvN?a.clvSum/a.clvN:null;let multiplier=1,status='LEARNING',reason='Collecting evidence';if(n>=20){if((roi??0)<=-15){multiplier=.80;status='DEGRADED';reason='Persistent negative out-of-sample performance'}else if((roi??0)<=-5){multiplier=.90;status='CAUTION';reason='Negative evidence; trust reduced'}else if(n>=60&&(roi??0)>=8&&(clv==null||clv>=0)){multiplier=1.02;status='VALIDATING_POSITIVE';reason='Positive evidence with large sample; upside remains capped'}else{status='NEUTRAL';reason='Evidence does not justify material adaptation'}}return{sample:n,wins:a.wins,losses:a.losses,hitRate:hit==null?null:Number(hit.toFixed(1)),roi:roi==null?null:Number(roi.toFixed(2)),avgCLV:clv==null?null:Number(clv.toFixed(2)),multiplier,status,reason}}
function finish(map){return Object.fromEntries(Object.entries(map).map(([k,v])=>[k,profile(v)]))}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Training memory storage unavailable'});
  const blobs=await listJson('argus/reports/',500),reports=await readManyJson(blobs),leagueMarket={},market={},league={};let total=0;
  for(const report of reports){for(const row of report.matches||[]){if(!['WIN','LOSS'].includes(row.outcome)||!row.prediction)continue;const mk=marketKey(row.prediction),lg=row.competition||'UNKNOWN',key=`${lg}|||${mk}`;add(leagueMarket,key,row);add(market,mk,row);add(league,lg,row);total++}}
  return res.status(200).json({version:'TRAINING-MEMORY-1',generatedAt:new Date().toISOString(),totalSettled:total,policy:{minimumSample:20,positiveSample:60,minMultiplier:.80,maxMultiplier:1.02,rule:'Learning may reduce trust quickly but may only increase trust slowly after a large settled sample. It never bypasses ARGUS governance.'},leagueMarket:finish(leagueMarket),market:finish(market),league:finish(league)});
}
