import trainingBets from './training-bets-v1.js';

export default async function handler(req,res){
  // Normalize the Vercel cron request before delegating so downstream auth never sees missing request bags.
  const headers=req?.headers&&typeof req.headers==='object'?req.headers:{};
  const query=req?.query&&typeof req.query==='object'?req.query:{};
  const nextReq={
    ...(req||{}),
    method:'GET',
    headers,
    query:{...query,mode:'run'}
  };
  return trainingBets(nextReq,res);
}
