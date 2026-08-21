import { listJson, readManyJson, readJson, storageReady } from './_report-store.js';
import { SHARD_INDEX } from './_historical-shards.js';

function countRecords(rows,key){return rows.reduce((n,x)=>n+(Array.isArray(x?.[key])?x[key].length:0),0)}
function countFixtures(rows){return rows.reduce((n,x)=>n+Object.keys(x?.fixtures||{}).length,0)}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Evidence storage unavailable'});
  try{
    const [ledgerBlobs,marketBlobs,reportBlobs,shardIndex]=await Promise.all([
      listJson('argus/ledger/',180),
      listJson('argus/market-memory/',180),
      listJson('argus/reports/',180),
      readJson(SHARD_INDEX,null)
    ]);
    const [ledgers,markets,reports]=await Promise.all([
      readManyJson(ledgerBlobs),readManyJson(marketBlobs),readManyJson(reportBlobs)
    ]);
    const ledgerRecords=ledgers.flatMap(x=>x?.records||[]);
    const settled=ledgerRecords.filter(x=>['WIN','LOSS','VOID'].includes(x?.settlement?.status));
    const pending=ledgerRecords.filter(x=>x?.settlement?.status==='PENDING');
    const marketFixtures=countFixtures(markets);
    const marketSnapshots=markets.reduce((n,b)=>n+Object.values(b?.fixtures||{}).reduce((s,f)=>s+(f?.snapshots?.length||0),0),0);
    return res.status(200).json({
      ok:true,
      version:'ARGUS-EVIDENCE-LIBRARY-1',
      generatedAt:new Date().toISOString(),
      mode:'READ_ONLY',
      sources:{
        predictionLedger:{files:ledgerBlobs.length,records:ledgerRecords.length,settled:settled.length,pending:pending.length,integrity:'FROZEN_BEFORE_KICKOFF_WHEN_VALID'},
        marketMemory:{files:marketBlobs.length,fixtures:marketFixtures,snapshots:marketSnapshots,integrity:'TIMESTAMPED_MARKET_SNAPSHOTS'},
        dailyReports:{files:reportBlobs.length,matches:countRecords(reports,'matches'),integrity:'POST_MATCH_RESULTS_AND_REPORTS'},
        historicalShards:{available:Boolean(shardIndex),shards:Object.keys(shardIndex?.shards||{}).length,fixtures:Number(shardIndex?.fixtureCount)||0,completedDates:Number(shardIndex?.completedDates)||0,integrity:'HISTORICAL_REPLAY_SOURCE'}
      },
      learningPolicy:{
        useForTrainingAndValidation:true,
        neverRewriteFrozenPredictions:true,
        noHindsightFeatures:true,
        postMatchDataMaySettleButNotAlterForecast:true,
        unknownTemporalProvenanceIsNotStrongEvidence:true,
        researchEvidenceCannotCreatePrimeAlone:true
      }
    });
  }catch(error){return res.status(500).json({ok:false,error:error.message})}
}
