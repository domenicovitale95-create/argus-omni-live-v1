import {readJsonFresh,writeJson} from './_report-store.js';
import {fetchListingStatus,isUnavailableListing,isConfirmedActiveListing} from './immo-listing-scan.js';
import apartments from '../data/immo-opportunities.json' with {type:'json'};
import buildings from '../data/immo-building-opportunities.json' with {type:'json'};

const PATHS={
  apartment:'argus/immo/active-catalog-apartment.json',
  building:'argus/immo/active-catalog-building.json'
};
const MAX={apartment:150000,building:400000};
const VERIFY_CONCURRENCY=8;
const VERIFY_TIMEOUT_MS=8500;

function listingKey(x={}){
  const raw=String(x.canonical||x.source||'').trim();
  if(raw){
    try{
      const u=new URL(raw);
      const host=u.hostname.toLowerCase().replace(/^www\./,'');
      const immoweb=u.pathname.match(/\/(\d+)\/?$/);
      if(host==='immoweb.be'&&immoweb)return 'immoweb:'+immoweb[1];
      for(const key of [...u.searchParams.keys()]){
        if(/^utm_/i.test(key)||['s','source','ref','tracking'].includes(key.toLowerCase()))u.searchParams.delete(key);
      }
      u.hash='';
      return u.toString().replace(/\/$/,'').toLowerCase();
    }catch{return raw.replace(/\/$/,'').toLowerCase()}
  }
  return [x.address||x.location||x.city||'',x.price||'',x.surface||x.area||'',x.bedrooms??''].join('|').toLowerCase();
}

function normalize(x={},category,origin='discovery'){
  const canonical=String(x.canonical||x.source||'').trim();
  const surface=Number(x.surface??x.area);
  const price=Number(x.price);
  return {
    ...x,
    category,
    canonical,
    source:canonical||x.source||'',
    surface:Number.isFinite(surface)?surface:(x.surface??x.area??null),
    area:Number.isFinite(surface)?surface:(x.area??x.surface??null),
    epc:x.epc||x.peb||null,
    peb:x.peb||x.epc||null,
    address:x.address||x.location||x.city||null,
    location:x.location||x.address||x.city||null,
    price:Number.isFinite(price)?price:x.price,
    catalogOrigin:x.catalogOrigin||origin
  };
}

function curated(category){
  const source=category==='building'?buildings:apartments;
  return (source.opportunities||[]).map(x=>normalize(x,category,'curated'));
}

function baseUrl(req){
  const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim()||'https';
  const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'argus-omni-live.vercel.app').split(',')[0].trim();
  return `${proto}://${host}`;
}

async function discovery(req,category){
  const url=baseUrl(req)+'/api/immo-discovery-scan';
  const r=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json','user-agent':'ARGUS-Immo-Catalog/1.0'},
    body:JSON.stringify({category,maxPrice:MAX[category]}),
    signal:AbortSignal.timeout(285000)
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw new Error(j.error||`DISCOVERY_HTTP_${r.status}`);
  return j;
}

async function verifyOne(candidate,alreadyConfirmed=false){
  const canonical=String(candidate.canonical||candidate.source||'').trim();
  if(!canonical)return {keep:false,reason:'MISSING_SOURCE',item:candidate};
  if(alreadyConfirmed){
    return {keep:true,reason:'ACTIVE',item:{...candidate,availabilityStatus:'ACTIVE'}};
  }
  try{
    const live=await fetchListingStatus(canonical,VERIFY_TIMEOUT_MS);
    if(isUnavailableListing(live))return {keep:false,reason:live.availabilityStatus||'UNAVAILABLE',item:{...candidate,...live,canonical}};
    if(!isConfirmedActiveListing(live))return {keep:false,reason:live.availabilityStatus||'UNVERIFIED',item:{...candidate,...live,canonical}};
    return {keep:true,reason:'ACTIVE',item:{...candidate,...live,canonical,availabilityStatus:'ACTIVE'}};
  }catch(e){
    return {keep:false,reason:'VERIFY_FAILED',error:String(e?.message||e),item:candidate};
  }
}

async function verifyAll(candidates,confirmedKeys){
  const out=[];
  for(let i=0;i<candidates.length;i+=VERIFY_CONCURRENCY){
    const batch=candidates.slice(i,i+VERIFY_CONCURRENCY);
    const got=await Promise.all(batch.map(x=>verifyOne(x,confirmedKeys.has(listingKey(x)))));
    out.push(...got);
  }
  return out;
}

async function refreshCategory(req,category){
  const now=new Date().toISOString();
  const previous=await readJsonFresh(PATHS[category],{category,listings:[],quarantine:[]});
  let scan=null,scanError=null;
  try{scan=await discovery(req,category)}catch(e){scanError=String(e?.message||e)}

  const discovered=(scan?.listings||[]).map(x=>normalize(x,category,'discovery'));
  const confirmedKeys=new Set(discovered.map(listingKey));
  const merged=new Map();
  for(const x of previous?.listings||[])merged.set(listingKey(x),normalize(x,category,x.catalogOrigin||'saved'));
  for(const x of curated(category))merged.set(listingKey(x),{...(merged.get(listingKey(x))||{}),...x});
  for(const x of discovered)merged.set(listingKey(x),{...(merged.get(listingKey(x))||{}),...x});

  const candidates=[...merged.values()].filter(x=>{
    const p=Number(x.price);
    return !Number.isFinite(p)||p<=MAX[category];
  });
  const checked=await verifyAll(candidates,confirmedKeys);
  const active=[],quarantine=[];

  for(const result of checked){
    const key=listingKey(result.item);
    const old=(previous?.listings||[]).find(x=>listingKey(x)===key);
    if(result.keep){
      const wasSeenThisRun=confirmedKeys.has(key)||curated(category).some(x=>listingKey(x)===key);
      active.push({
        ...normalize(result.item,category,result.item.catalogOrigin||'saved'),
        catalogKey:key,
        firstSeenAt:old?.firstSeenAt||result.item.firstSeenAt||now,
        lastSeenAt:wasSeenThisRun?now:(old?.lastSeenAt||result.item.lastSeenAt||now),
        lastVerifiedAt:now,
        availabilityStatus:'ACTIVE'
      });
    }else{
      quarantine.push({
        ...normalize(result.item,category,result.item.catalogOrigin||'saved'),
        catalogKey:key,
        firstSeenAt:old?.firstSeenAt||result.item.firstSeenAt||now,
        lastSeenAt:old?.lastSeenAt||result.item.lastSeenAt||null,
        lastCheckedAt:now,
        hiddenReason:result.reason,
        verifyError:result.error||null
      });
    }
  }

  active.sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
  const payload={
    version:1,
    category,
    refreshedAt:now,
    maxPrice:MAX[category],
    scanError,
    discovery:{
      scannedAt:scan?.scannedAt||null,
      coverage:scan?.coverage||null,
      totals:scan?.totals||null,
      sourceStatus:scan?.sourceStatus||[]
    },
    counts:{active:active.length,quarantined:quarantine.length,newlyDiscovered:discovered.length,previouslySaved:(previous?.listings||[]).length},
    listings:active,
    quarantine
  };
  await writeJson(PATHS[category],payload);
  return payload;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'GET or POST required'});
  try{
    const q=new URL(req.url||'/',baseUrl(req)).searchParams;
    const requested=q.get('category');
    const categories=requested==='apartment'||requested==='building'?[requested]:['apartment','building'];
    const refreshed=await Promise.all(categories.map(c=>refreshCategory(req,c)));
    return res.status(200).json({
      ok:true,
      refreshedAt:new Date().toISOString(),
      categories:refreshed.map(x=>({category:x.category,refreshedAt:x.refreshedAt,counts:x.counts,scanError:x.scanError,coverage:x.discovery?.coverage||null}))
    });
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
