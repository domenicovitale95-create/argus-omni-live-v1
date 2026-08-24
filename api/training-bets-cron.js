import trainingBets from './training-bets-v1.js';

export default async function handler(req,res){
  const nextReq={...req,method:'GET',query:{...(req.query||{}),mode:'run'}};
  return trainingBets(nextReq,res);
}
