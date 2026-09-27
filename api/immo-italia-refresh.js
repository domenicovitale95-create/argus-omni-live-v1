import {refreshItaliaCatalog} from './immo-italia.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'GET o POST richiesto'});
  try{return res.status(200).json(await refreshItaliaCatalog())}
  catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
