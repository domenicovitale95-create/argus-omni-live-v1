import trainingBets from './training-bets-v1.js';
import { requestQuery } from './_request-query.js';

export default async function handler(req,res){
  // Avoid Vercel's legacy req.query getter; parse the raw URL unless an internal caller supplied an own query object.
  const headers=req?.headers&&typeof req.headers==='object'?req.headers:{};
  const query=requestQuery(req);
  const nextReq={
    method:'GET',
    headers,
    query:{...query,mode:'run'},
    body:req?.body&&typeof req.body==='object'?req.body:{}
  };
  return trainingBets(nextReq,res);
}
