import {readJsonFresh} from './_report-store.js';

const PATHS={
  apartment:'argus/immo/active-catalog-apartment.json',
  building:'argus/immo/active-catalog-building.json'
};

function normalizeCategory(value){return value==='building'?'building':'apartment'}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});
  try{
    const base=`https://${String(req.headers?.host||'argus-omni-live.vercel.app')}`;
    const category=normalizeCategory(new URL(req.url||'/',base).searchParams.get('category'));
    const data=await readJsonFresh(PATHS[category],null);
    if(!data)return res.status(200).json({ok:true,category,ready:false,refreshedAt:null,counts:{active:0,quarantined:0},listings:[],notice:'Le catalogue persistant sera disponible après le premier rafraîchissement automatique.'});
    const listings=(data.listings||[]).filter(x=>String(x.availabilityStatus||'').toUpperCase()==='ACTIVE');
    return res.status(200).json({
      ok:true,
      ready:true,
      category,
      refreshedAt:data.refreshedAt||null,
      maxPrice:data.maxPrice||null,
      counts:{...(data.counts||{}),active:listings.length},
      discovery:data.discovery||null,
      listings,
      notice:'Catalogue ARGUS persistant : seules les annonces dont la disponibilité a été confirmée lors du dernier contrôle sont affichées.'
    });
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
