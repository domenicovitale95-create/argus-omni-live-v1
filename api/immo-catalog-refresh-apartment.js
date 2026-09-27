import refresh from './immo-catalog-refresh.js';

export default async function handler(req,res){
  req.url='/api/immo-catalog-refresh?category=apartment';
  return refresh(req,res);
}
