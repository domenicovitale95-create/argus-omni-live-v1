import { listJson, readManyJson, storageReady } from './_report-store.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=180, stale-while-revalidate=300');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(200).json({score:0,status:'NO STORAGE',violations:['Persistent storage unavailable']});
  const blobs=await listJson('argus/shadow/',180),books=await readManyJson(blobs);
  let fixtures=0,picks=0,lateFreeze=0,missingFreeze=0,duplicateKeys=0,settledWithoutFinal=0,settledWithoutClose=0,pricedSettled=0,clvSamples=0;
  const examples=[];
  for(const book of books){for(const f of Object.values(book.fixtures||{})){fixtures++;const ko=new Date(f.kickoff||0).getTime(),fr=new Date(f.frozenAt||0).getTime();if(!f.frozenAt){missingFreeze++;if(examples.length<8)examples.push(`${f.home} vs ${f.away}: missing frozenAt`)}else if(Number.isFinite(ko)&&Number.isFinite(fr)&&fr>=ko){lateFreeze++;if(examples.length<8)examples.push(`${f.home} vs ${f.away}: freeze not before kickoff`)}const seen=new Set();for(const p of f.picks||[]){picks++;if(seen.has(p.key))duplicateKeys++;seen.add(p.key);if(['WIN','LOSS'].includes(p.outcome)){if(!f.finalScore)settledWithoutFinal++;if(p.odds){pricedSettled++;if(!p.closingOdds)settledWithoutClose++;if(Number.isFinite(Number(p.clv)))clvSamples++;}}}}}
  const violations=[];if(lateFreeze)violations.push(`${lateFreeze} fixture(s) frozen at/after kickoff`);if(missingFreeze)violations.push(`${missingFreeze} fixture(s) missing freeze timestamp`);if(duplicateKeys)violations.push(`${duplicateKeys} duplicate market key(s)`);if(settledWithoutFinal)violations.push(`${settledWithoutFinal} settled pick(s) without final score`);
  const coverage=pricedSettled?Math.round(clvSamples/pricedSettled*100):0;
  let score=100;score-=Math.min(50,lateFreeze*15);score-=Math.min(25,missingFreeze*10);score-=Math.min(15,duplicateKeys*3);score-=Math.min(20,settledWithoutFinal*5);if(pricedSettled>=10&&coverage<50)score-=10;score=Math.max(0,score);
  const status=score>=95?'CLEAN':score>=80?'MINOR GAPS':score>=60?'CAUTION':'INTEGRITY RISK';
  return res.status(200).json({version:'INTEGRITY-AUDIT-1',generatedAt:new Date().toISOString(),score,status,evidence:{books:books.length,fixtures,picks,lateFreeze,missingFreeze,duplicateKeys,settledWithoutFinal,pricedSettled,settledWithoutClose,clvSamples,clvCoveragePct:coverage},violations,examples,policy:'A training observation is valid only if its prediction was frozen before kickoff. Closing odds are observational and may never alter the frozen prediction.'});
}
