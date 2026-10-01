import {readJsonFresh} from './_report-store.js';
import {isBrusselsListing,hasDeferredPriceStructure} from './immo-region.js';
import {isUserExcludedListing} from './immo-user-exclusions.js';

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
    const storedActive=(data.listings||[]).filter(x=>String(x.availabilityStatus||'').toUpperCase()==='ACTIVE');
    const scopeEligible=storedActive.filter(x=>isBrusselsListing(x,x.canonical||x.source)&&!hasDeferredPriceStructure(x));
    const listings=scopeEligible.filter(x=>!isUserExcludedListing(x,category));
    const filteredOutsideScope=Math.max(0,storedActive.length-scopeEligible.length);
    const filteredUserCriteria=Math.max(0,scopeEligible.length-listings.length);
    return res.status(200).json({
      ok:true,
      ready:true,
      category,
      refreshedAt:data.refreshedAt||null,
      maxPrice:data.maxPrice||null,
      counts:{...(data.counts||{}),active:listings.length,filteredOutsideScope,filteredUserCriteria},
      discovery:data.discovery||null,
      listings,
      notice:'Catalogue ARGUS persistant limité à Bruxelles-Capitale : seules les annonces actives, dans la région, sans structure de prix différé et conformes aux exclusions personnelles ARGUS sont affichées.'
    });
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
