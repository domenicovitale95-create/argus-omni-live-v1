import {readJsonFresh} from './_report-store.js';
import {isBrusselsListing,hasDeferredPriceStructure} from './immo-region.js';
import {isUserExcludedListing} from './immo-user-exclusions.js';
import apartmentsFallback from '../data/immo-opportunities.json' with {type:'json'};
import buildingsFallback from '../data/immo-building-opportunities.json' with {type:'json'};

const PATHS={
  apartment:'argus/immo/active-catalog-apartment.json',
  building:'argus/immo/active-catalog-building.json'
};
const MAX={apartment:150000,building:400000};
const LIMIT={apartment:24,building:16};

function number(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function text(x={}){return [x.title,x.description,x.location,x.address,x.city,x.peb,x.epc,x.heating,x.charges].filter(Boolean).join(' ').toLowerCase()}
function pebBand(x={}){const raw=String(x.peb||x.epc||'').trim().toUpperCase();const m=raw.match(/\b([A-G])(?:\+|-)?\b/);return m?m[1]:null}
function pricePerSqm(x={}){const p=number(x.price),a=number(x.area??x.surface);return p&&a?Math.round(p/a):null}
function hardExcluded(x={},category='apartment'){const s=text(x);return hasDeferredPriceStructure(x)||isUserExcludedListing(x,category)||/appartement de service|residence services|résidence services|serviceflat/.test(s)}
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
function scoreBuilding(x={}){
  const p=number(x.price),a=number(x.area??x.surface),peb=pebBand(x),units=number(x.recognizedUnits),yieldValue=number(x.grossYield),s=text(x);let score=48;
  if(p!==null){if(p<=250000)score+=18;else if(p<=300000)score+=14;else if(p<=350000)score+=9;else if(p<=400000)score+=5}
  if(a!==null){if(a>=220)score+=10;else if(a>=150)score+=7;else if(a>=100)score+=4}
  if(units!==null){if(units>=3)score+=16;else if(units===2)score+=8;else score-=5}
  if(yieldValue!==null){if(yieldValue>=7)score+=10;else if(yieldValue>=5.5)score+=6;else if(yieldValue<4)score-=4}
  if(peb){if(['A','B','C','D'].includes(peb))score+=6;else if(['F','G'].includes(peb))score-=5}
  score+=locationBonus(x);if(/urbanisme.*non|non reconnu|non conforme|infraction/.test(s))score-=15;
  return Math.max(0,Math.min(96,Math.round(score)));
}
function risksFor(x={},category='apartment'){
  const out=[];if(!(x.peb||x.epc))out.push('PEB à confirmer');
  if(category==='apartment'){if(x.chargesAmount==null&&x.monthlyCharges==null&&!x.charges)out.push('Charges de copropriété à confirmer');if(!x.heating)out.push('Type de chauffage à confirmer');if(!number(x.area??x.surface))out.push('Surface exacte à confirmer')}
  else{if(x.recognizedUnits==null)out.push('Nombre d’unités reconnues à confirmer');if(x.grossYield==null)out.push('Rendement locatif à recalculer')}
  return out.slice(0,3);
}
function statusFor(score){if(score>=82)return 'ARGUS_1';if(score>=72)return 'SHORTLIST';return 'WATCH'}
function enrich(x,category){const score=category==='building'?scoreBuilding(x):scoreApartment(x),status=statusFor(score),verdict=status==='ARGUS_1'?'PRIORITÉ ARGUS — AUDIT À LANCER':status==='SHORTLIST'?'À ÉTUDIER — BON RAPPORT POTENTIEL':'À SURVEILLER — VÉRIFICATIONS NÉCESSAIRES';return {...x,score,status,verdict,risks:[...(Array.isArray(x.risks)?x.risks:[]),...risksFor(x,category)].filter((v,i,a)=>v&&a.indexOf(v)===i),selectionSource:'LIVE_CATALOG'}}
function fallback(category){const data=category==='building'?buildingsFallback:apartmentsFallback;return (data.opportunities||[]).filter(x=>number(x.price)!==null&&number(x.price)<=MAX[category]&&isBrusselsListing(x,x.source)&&!hardExcluded(x,category)).map(x=>({...x,availabilityStatus:'ACTIVE',selectionSource:'STATIC_FALLBACK'}))}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});
  try{
    const base=`https://${String(req.headers?.host||'argus-omni-live.vercel.app')}`;
    const category=new URL(req.url||'/',base).searchParams.get('category')==='building'?'building':'apartment';
    const catalog=await readJsonFresh(PATHS[category],null);
    const activeCandidates=(catalog?.listings||[]).filter(x=>String(x.availabilityStatus||'').toUpperCase()==='ACTIVE'&&number(x.price)!==null&&number(x.price)<=MAX[category]&&isBrusselsListing(x,x.canonical||x.source));
    const catalogListings=activeCandidates.filter(x=>!hardExcluded(x,category));
    const filteredUserCriteria=Math.max(0,activeCandidates.length-catalogListings.length);
    const source=catalogListings.length?catalogListings:fallback(category);
    const ranked=source.map(x=>enrich(x,category)).sort((a,b)=>b.score-a.score||(number(a.price)??Infinity)-(number(b.price)??Infinity));
    const selected=ranked.slice(0,LIMIT[category]),checkedAt=catalog?.refreshedAt||new Date().toISOString(),quarantineCount=Number(catalog?.counts?.quarantined)||0;
    return res.status(200).json({ok:true,category,updatedAt:checkedAt,checkedAt,failClosed:true,cachePolicy:'NO_STORE_LIVE_CATALOG',selectionMode:catalogListings.length?'DYNAMIC_LIVE_CATALOG':'STATIC_FALLBACK',counts:{sourceRecords:source.length,active:selected.length,excludedUnavailable:quarantineCount,hiddenUnverified:Math.max(0,source.length-selected.length),filteredUserCriteria},opportunities:selected,notice:'Sélection ARGUS dynamique limitée à Bruxelles-Capitale : les grandes copropriétés et les situations urbanistiques non régularisables sont exclues avant classement.'});
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
