import {readJsonFresh} from './_report-store.js';
import {analyzeFlip,flipMethodology} from './immo-flip-engine.js';

const PATH='argus/immo/active-catalog-building.json';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});
  try{
    const data=await readJsonFresh(PATH,null);
    const source=(data?.listings||[]).filter(x=>String(x.availabilityStatus||'').toUpperCase()==='ACTIVE');
    const analyzed=source.map(analyzeFlip).filter(x=>x.flipReady);
    analyzed.sort((a,b)=>{
      const order={PRIME:0,VALUE:1,NEGOTIATE:2,REJECT:3};
      const sa=order[a.flip?.status]??9,sb=order[b.flip?.status]??9;
      return sa-sb||(b.flip?.score||0)-(a.flip?.score||0)||(Number(a.price)||Infinity)-(Number(b.price)||Infinity);
    });
    return res.status(200).json({
      ok:true,
      refreshedAt:data?.refreshedAt||null,
      methodology:flipMethodology(),
      counts:{source:source.length,analyzed:analyzed.length,prime:analyzed.filter(x=>x.flip.status==='PRIME').length,value:analyzed.filter(x=>x.flip.status==='VALUE').length,negotiate:analyzed.filter(x=>x.flip.status==='NEGOTIATE').length,reject:analyzed.filter(x=>x.flip.status==='REJECT').length,new:analyzed.filter(x=>x.isNew).length,changed:analyzed.filter(x=>x.lastChangedAt).length},
      coverage:data?.discovery?.coverage||null,
      sourceStatus:data?.discovery?.sourceStatus||[],
      opportunities:analyzed
    });
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
