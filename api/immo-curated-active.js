import {BRUSSELS_COMMUNES,brusselsGeography} from './immo-brussels-zones.js';
import {isStudioListing} from './immo-property-type.js';
import {readJsonFresh} from './_report-store.js';
import {isBrusselsListing,hasDeferredPriceStructure} from './immo-region.js';
import {isUserExcludedListing} from './immo-user-exclusions.js';
import {BUILDING_MIN_PRICE,BUILDING_MAX_PRICE,matchesBuildingCriteria,enrichBuildingCriteria} from './immo-building-criteria.js';
import apartmentsFallback from '../data/immo-opportunities.json' with {type:'json'};
import buildingsFallback from '../data/immo-building-opportunities.json' with {type:'json'};

const PATHS={
  apartment:'argus/immo/active-catalog-apartment.json',
  building:'argus/immo/active-catalog-building.json'
};
const MAX={apartment:150000,building:BUILDING_MAX_PRICE};
const LIMIT={apartment:24,building:100};

function number(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function text(x={}){return [x.title,x.description,x.location,x.address,x.city,x.peb,x.epc,x.heating,x.charges].filter(Boolean).join(' ').toLowerCase()}
function pebBand(x={}){const raw=String(x.peb||x.epc||'').trim().toUpperCase();const m=raw.match(/\b([A-G])(?:\+|-)?\b/);return m?m[1]:null}
function pricePerSqm(x={}){const p=number(x.price),a=number(x.area??x.surface);return p&&a?Math.round(p/a):null}
function hardExcludedApartment(x={}){const s=text(x);return isStudioListing(x)||hasDeferredPriceStructure(x)||isUserExcludedListing(x,'apartment')||/appartement de service|residence services|résidence services|serviceflat/.test(s)}
function locationBonus(x={}){const s=text(x);if(/saint-josse|sint-joost|ribaucourt|maritime|tour\s*&?\s*taxis|molenbeek|anderlecht|bruxelles|brussel/.test(s))return 4;return 0}
function scoreApartment(x={}){
  const p=number(x.price),a=number(x.area??x.surface),psm=pricePerSqm(x),peb=pebBand(x),s=text(x);let score=48;
  if(p!==null){if(p<=90000)score+=20;else if(p<=110000)score+=16;else if(p<=125000)score+=12;else if(p<=140000)score+=8;else if(p<=150000)score+=4}
  if(a!==null){if(a>=60)score+=14;else if(a>=45)score+=11;else if(a>=35)score+=8;else if(a>=25)score+=4;else if(a<18)score-=8}else score-=3;
  if(psm!==null){if(psm<=2500)score+=12;else if(psm<=3200)score+=9;else if(psm<=4000)score+=5;else if(psm>5000)score-=5}
  if(peb){if(['A','B','C'].includes(peb))score+=8;else if(peb==='D')score+=5;else if(peb==='E')score+=1;else score-=5}
  if(/chauffage individuel|individual heating|individuele verwarming/.test(s))score+=4;
  const charges=number(x.chargesAmount??x.monthlyCharges);if(charges!==null){if(charges<=100)score+=4;else if(charges>200)score-=5}
  score+=locationBonus(x);if(/vente publique|public sale|openbare verkoop/.test(s))score-=8;if(/occup[eé]|lou[eé]|tenant|locataire/.test(s))score-=4;
  return Math.max(0,Math.min(96,Math.round(score)));
}
function risksForApartment(x={}){
  const out=[];if(!(x.peb||x.epc))out.push('PEB à confirmer');
  if(x.chargesAmount==null&&x.monthlyCharges==null&&!x.charges)out.push('Charges de copropriété à confirmer');
  if(!x.heating)out.push('Type de chauffage à confirmer');
  if(!number(x.area??x.surface))out.push('Surface exacte à confirmer');
  return out.slice(0,3);
}
function statusFor(score){if(score>=82)return 'ARGUS_1';if(score>=72)return 'SHORTLIST';return 'WATCH'}
function enrichApartment(x){const score=scoreApartment(x),status=statusFor(score),verdict=status==='ARGUS_1'?'PRIORITÉ ARGUS — AUDIT À LANCER':status==='SHORTLIST'?'À ÉTUDIER — BON RAPPORT POTENTIEL':'À SURVEILLER — VÉRIFICATIONS NÉCESSAIRES';return {...brusselsGeography(x),score,status,verdict,risks:[...(Array.isArray(x.risks)?x.risks:[]),...risksForApartment(x)].filter((v,i,a)=>v&&a.indexOf(v)===i),selectionSource:'LIVE_CATALOG'}}
function enrichBuilding(x){return {...enrichBuildingCriteria(x),selectionSource:'LIVE_CATALOG',status:'ACTIVE',verdict:'CORRESPOND AUX CRITÈRES IMMEUBLE DE RAPPORT'}}
function fallback(category){
  const data=category==='building'?buildingsFallback:apartmentsFallback;
  if(category==='building')return (data.opportunities||[]).map(enrichBuildingCriteria).filter(matchesBuildingCriteria).map(x=>({...x,availabilityStatus:'ACTIVE',selectionSource:'STATIC_FALLBACK'})).sort((a,b)=>(number(a.price)??Infinity)-(number(b.price)??Infinity));
  return (data.opportunities||[]).filter(x=>number(x.price)!==null&&number(x.price)<=MAX.apartment&&isBrusselsListing(x,x.source)&&!hardExcludedApartment(x)).map(x=>({...x,availabilityStatus:'ACTIVE',selectionSource:'STATIC_FALLBACK'}));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});
  try{
    const base=`https://${String(req.headers?.host||'argus-omni-live.vercel.app')}`;
    const category=new URL(req.url||'/',base).searchParams.get('category')==='building'?'building':'apartment';
    const catalog=await readJsonFresh(PATHS[category],null);
    const stored=(catalog?.listings||[]).filter(x=>String(x.availabilityStatus||'').toUpperCase()==='ACTIVE');
    let source,selected,filteredUserCriteria=0;
    if(category==='building'){
      const eligible=stored.map(enrichBuildingCriteria).filter(matchesBuildingCriteria);
      source=eligible.length?eligible:fallback('building');
      selected=source.map(enrichBuilding).sort((a,b)=>(number(a.price)??Infinity)-(number(b.price)??Infinity)).slice(0,LIMIT.building);
    }else{
      const activeCandidates=stored.filter(x=>number(x.price)!==null&&number(x.price)<=MAX.apartment&&isBrusselsListing(x,x.canonical||x.source));
      const catalogListings=activeCandidates.filter(x=>!hardExcludedApartment(x));
      filteredUserCriteria=Math.max(0,activeCandidates.length-catalogListings.length);
      source=catalogListings.length?catalogListings:fallback('apartment');
      selected=source.map(enrichApartment).sort((a,b)=>b.score-a.score||(number(a.price)??Infinity)-(number(b.price)??Infinity)).slice(0,LIMIT.apartment);
    }
    const checkedAt=catalog?.refreshedAt||new Date().toISOString(),quarantineCount=Number(catalog?.counts?.quarantined)||0;
    return res.status(200).json({ok:true,category,updatedAt:checkedAt,checkedAt,failClosed:true,cachePolicy:'NO_STORE_LIVE_CATALOG',selectionMode:(catalog?.listings||[]).length?'DYNAMIC_LIVE_CATALOG':'STATIC_FALLBACK',criteria:category==='building'?{zones:BRUSSELS_COMMUNES.map(c=>c.name),sectors:['NORD','SUD'],apartments:[3,4,5,6],minPrice:BUILDING_MIN_PRICE,maxPrice:BUILDING_MAX_PRICE,sort:'price_asc'}:null,counts:{sourceRecords:source.length,active:selected.length,excludedUnavailable:quarantineCount,hiddenUnverified:Math.max(0,source.length-selected.length),filteredUserCriteria},opportunities:selected,notice:category==='building'?'Immeubles de rapport : 19 communes de Bruxelles, NORD/SUD, 3 à 6 appartements, 600 k€ à 1,4 M€.':'Sélection ARGUS appartements.'});
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
