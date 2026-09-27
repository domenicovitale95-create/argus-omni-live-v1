import {readJsonFresh,writeJson} from './_report-store.js';
import {fetchListingStatus,isUnavailableListing,isConfirmedActiveListing} from './immo-listing-scan.js';
import {isBrusselsListing,hasDeferredPriceStructure} from './immo-region.js';
import apartments from '../data/immo-opportunities.json' with {type:'json'};
import buildings from '../data/immo-building-opportunities.json' with {type:'json'};

const PATHS={apartment:'argus/immo/active-catalog-apartment.json',building:'argus/immo/active-catalog-building.json'};
const MAX={apartment:150000,building:400000};
const VERIFY_CONCURRENCY=8,VERIFY_TIMEOUT_MS=8500;

function listingKey(x={}){
  const raw=String(x.canonical||x.source||'').trim();
  if(raw){try{const u=new URL(raw),host=u.hostname.toLowerCase().replace(/^www\./,''),m=u.pathname.match(/\/(\d+)\/?$/);if(host==='immoweb.be'&&m)return 'immoweb:'+m[1];for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||['s','source','ref','tracking'].includes(k.toLowerCase()))u.searchParams.delete(k);u.hash='';return u.toString().replace(/\/$/,'').toLowerCase()}catch{return raw.replace(/\/$/,'').toLowerCase()}}
  return [x.address||x.location||x.city||'',x.price??'',x.surface??x.area??'',x.bedrooms??''].join('|').toLowerCase();
}
function finiteValue(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function normalize(x={},category,origin='discovery'){
  const canonical=String(x.canonical||x.source||'').trim(),surface=finiteValue(x.surface??x.area),price=finiteValue(x.price);
  return {...x,category,canonical,source:canonical||x.source||'',surface:surface??x.surface??x.area??null,area:surface??x.area??x.surface??null,epc:x.epc||x.peb||null,peb:x.peb||x.epc||null,address:x.address||x.location||x.city||null,location:x.location||x.address||x.city||null,price:price??x.price??null,catalogOrigin:x.catalogOrigin||origin};
}
function curated(category){const source=category==='building'?buildings:apartments;return (source.opportunities||[]).map(x=>normalize(x,category,'curated'))}
function baseUrl(req){const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim()||'https',host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'argus-omni-live.vercel.app').split(',')[0].trim();return `${proto}://${host}`}
async function discovery(req,category){
  const r=await fetch(baseUrl(req)+'/api/immo-market-catalog-scan',{method:'POST',headers:{'content-type':'application/json','user-agent':'ARGUS-Immo-Catalog/2.2'},body:JSON.stringify({category,maxPrice:MAX[category]}),signal:AbortSignal.timeout(285000)}),j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw new Error(j.error||`CATALOG_SCAN_HTTP_${r.status}`);return j;
}
function mergeLive(candidate,live,canonical){
  return {...live,...candidate,canonical,
    title:candidate.title||live.title||null,description:candidate.description||live.description||null,
    address:candidate.address||live.address||candidate.location||null,location:candidate.location||candidate.address||live.address||live.city||null,city:candidate.city||live.city||null,
    surface:finiteValue(candidate.surface??candidate.area)??finiteValue(live.surface),area:finiteValue(candidate.area??candidate.surface)??finiteValue(live.surface),
    price:finiteValue(candidate.price)??finiteValue(live.price),bedrooms:candidate.bedrooms??live.bedrooms??null,bathrooms:candidate.bathrooms??live.bathrooms??null,
    epc:candidate.epc||candidate.peb||live.epc||null,peb:candidate.peb||candidate.epc||live.epc||null,
    type:(candidate.type&&candidate.type!=='unknown')?candidate.type:live.type,image:candidate.image||live.image||null,
    availabilityStatus:live.availabilityStatus||'UNKNOWN',availabilityReason:live.availabilityReason||null};
}
async function verifyOne(candidate,alreadyConfirmed=false){
  const canonical=String(candidate.canonical||candidate.source||'').trim();if(!canonical)return {keep:false,reason:'MISSING_SOURCE',item:candidate};
  if(alreadyConfirmed)return {keep:true,reason:'ACTIVE',item:{...candidate,availabilityStatus:'ACTIVE'}};
  try{const live=await fetchListingStatus(canonical,VERIFY_TIMEOUT_MS),item=mergeLive(candidate,live,canonical);if(isUnavailableListing(live))return {keep:false,reason:live.availabilityStatus||'UNAVAILABLE',item};if(!isConfirmedActiveListing(live))return {keep:false,reason:live.availabilityStatus||'UNVERIFIED',item};return {keep:true,reason:'ACTIVE',item:{...item,availabilityStatus:'ACTIVE'}}}catch(e){return {keep:false,reason:'VERIFY_FAILED',error:String(e?.message||e),item:candidate}}
}
async function verifyAll(candidates,confirmedKeys){const out=[];for(let i=0;i<candidates.length;i+=VERIFY_CONCURRENCY){out.push(...await Promise.all(candidates.slice(i,i+VERIFY_CONCURRENCY).map(x=>verifyOne(x,confirmedKeys.has(listingKey(x))))))}return out}

async function refreshCategory(req,category){
  const now=new Date().toISOString(),previous=await readJsonFresh(PATHS[category],{category,listings:[],quarantine:[]});let scan=null,scanError=null;try{scan=await discovery(req,category)}catch(e){scanError=String(e?.message||e)}
  const curatedRows=curated(category),discovered=(scan?.listings||[]).map(x=>normalize(x,category,'discovery')),confirmedKeys=new Set(discovered.map(listingKey)),previousKeys=new Set((previous?.listings||[]).map(listingKey)),merged=new Map();
  for(const x of previous?.listings||[])merged.set(listingKey(x),normalize(x,category,x.catalogOrigin||'saved'));
  for(const x of curatedRows){const k=listingKey(x);merged.set(k,{...(merged.get(k)||{}),...x})}
  for(const x of discovered){const k=listingKey(x);merged.set(k,{...(merged.get(k)||{}),...x})}
  const candidates=[...merged.values()].filter(x=>{const p=finiteValue(x.price);return (p===null||p<=MAX[category])&&isBrusselsListing(x,x.canonical||x.source)&&!hasDeferredPriceStructure(x)}),checked=await verifyAll(candidates,confirmedKeys),active=[],quarantine=[];
  for(const result of checked){const k=listingKey(result.item),old=(previous?.listings||[]).find(x=>listingKey(x)===k);if(result.keep){active.push({...normalize(result.item,category,result.item.catalogOrigin||'saved'),catalogKey:k,firstSeenAt:old?.firstSeenAt||result.item.firstSeenAt||now,lastSeenAt:confirmedKeys.has(k)?now:(old?.lastSeenAt||result.item.lastSeenAt||now),lastVerifiedAt:now,availabilityStatus:'ACTIVE'})}else{quarantine.push({...normalize(result.item,category,result.item.catalogOrigin||'saved'),catalogKey:k,firstSeenAt:old?.firstSeenAt||result.item.firstSeenAt||now,lastSeenAt:old?.lastSeenAt||result.item.lastSeenAt||null,lastCheckedAt:now,hiddenReason:result.reason,verifyError:result.error||null})}}
  active.sort((a,b)=>(finiteValue(a.price)??Infinity)-(finiteValue(b.price)??Infinity));const newlyDiscovered=discovered.filter(x=>!previousKeys.has(listingKey(x))).length;
  const payload={version:3,category,refreshedAt:now,maxPrice:MAX[category],marketScope:'BRUSSELS_CAPITAL_REGION',scanError,discovery:{scannedAt:scan?.scannedAt||null,coverage:scan?.coverage||null,totals:scan?.totals||null,sourceStatus:scan?.sourceStatus||[]},counts:{active:active.length,quarantined:quarantine.length,newlyDiscovered,discoveredThisRun:discovered.length,previouslySaved:(previous?.listings||[]).length,purgedOutsideScope:Math.max(0,merged.size-candidates.length)},listings:active,quarantine};await writeJson(PATHS[category],payload);return payload;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'GET or POST required'});
  try{const q=new URL(req.url||'/',baseUrl(req)).searchParams,requested=q.get('category'),categories=requested==='apartment'||requested==='building'?[requested]:['apartment','building'],refreshed=await Promise.all(categories.map(c=>refreshCategory(req,c)));return res.status(200).json({ok:true,refreshedAt:new Date().toISOString(),categories:refreshed.map(x=>({category:x.category,refreshedAt:x.refreshedAt,counts:x.counts,scanError:x.scanError,coverage:x.discovery?.coverage||null,marketScope:x.marketScope}))})}catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
