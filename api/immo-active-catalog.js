import {brusselsGeography,BRUSSELS_COMMUNES} from './immo-brussels-zones.js';
import {isStudioListing} from './immo-property-type.js';
import {readJsonFresh} from './_report-store.js';
import {isBrusselsListing,hasDeferredPriceStructure} from './immo-region.js';
import {isUserExcludedListing} from './immo-user-exclusions.js';
import {matchesBuildingCriteria,enrichBuildingCriteria} from './immo-building-criteria.js';

const PATHS={
  apartment:'argus/immo/active-catalog-apartment.json',
  building:'argus/immo/active-catalog-building.json'
};

function normalizeCategory(value){return value==='building'?'building':'apartment'}
function price(x){const n=Number(x?.price);return Number.isFinite(n)?n:Infinity}

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
    let listings,filteredOutsideScope=0,filteredUserCriteria=0;
    if(category==='building'){
      const enriched=storedActive.map(enrichBuildingCriteria);
      listings=enriched.filter(matchesBuildingCriteria).sort((a,b)=>price(a)-price(b));
      filteredOutsideScope=Math.max(0,storedActive.length-listings.length);
    }else{
      const scopeEligible=storedActive.filter(x=>isBrusselsListing(x,x.canonical||x.source)&&!hasDeferredPriceStructure(x)&&!isStudioListing(x));
      listings=scopeEligible.filter(x=>!isUserExcludedListing(x,'apartment')).map(brusselsGeography);
      filteredOutsideScope=Math.max(0,storedActive.length-scopeEligible.length);
      filteredUserCriteria=Math.max(0,scopeEligible.length-listings.length);
    }
    return res.status(200).json({
      ok:true,
      ready:true,
      category,
      refreshedAt:data.refreshedAt||null,
      minPrice:data.minPrice||null,
      maxPrice:data.maxPrice||null,
      criteria:category==='building'?{zones:BRUSSELS_COMMUNES.map(c=>c.name),sectors:['NORD','SUD'],apartments:[3,4,5,6],minPrice:600000,maxPrice:1400000,sort:'price_asc'}:null,
      counts:{...(data.counts||{}),active:listings.length,filteredOutsideScope,filteredUserCriteria},
      discovery:data.discovery||null,
      listings,
      notice:category==='building'?'Immeubles : 19 communes, NORD/SUD, 3–6 logements annoncés; preuves urbanistiques à contrôler.':'Catalogue ARGUS appartements actif.'
    });
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
