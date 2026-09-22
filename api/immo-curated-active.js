import {requestQuery} from './_request-query.js';
import apartments from '../data/immo-opportunities.json' with { type: 'json' };
import buildings from '../data/immo-building-opportunities.json' with { type: 'json' };
import {fetchListingStatus,isUnavailableListing,isConfirmedActiveListing} from './immo-listing-scan.js';

const MAX_CONCURRENCY=4;
const TIMEOUT_MS=9000;

async function verifyOne(item){
  const source=String(item.source||'').trim();
  if(!source)return {item,status:'UNVERIFIED',keep:false,error:'missing_source'};
  try{
    const live=await fetchListingStatus(source,TIMEOUT_MS);
    const unavailable=isUnavailableListing(live);
    const confirmedActive=isConfirmedActiveListing(live);
    return {
      item:{...item,liveAvailability:live.availabilityStatus||'UNKNOWN',liveCheckedAt:new Date().toISOString()},
      status:live.availabilityStatus||'UNKNOWN',
      keep:confirmedActive&&!unavailable,
      error:null
    };
  }catch(e){
    return {item,status:'UNVERIFIED',keep:false,error:String(e?.message||e)};
  }
}

async function verifyAll(items=[]){
  const out=[];
  for(let i=0;i<items.length;i+=MAX_CONCURRENCY){
    const batch=await Promise.all(items.slice(i,i+MAX_CONCURRENCY).map(verifyOne));
    out.push(...batch);
  }
  return out;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=900, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});

  const category=String(requestQuery(req).category||'apartment')==='building'?'building':'apartment';
  const data=category==='building'?buildings:apartments;
  const checked=await verifyAll(data.opportunities||[]);
  const active=checked.filter(x=>x.keep).map(x=>x.item);
  const excluded=checked.filter(x=>!x.keep);

  return res.status(200).json({
    ok:true,
    category,
    updatedAt:data.updatedAt,
    checkedAt:new Date().toISOString(),
    failClosed:true,
    counts:{
      sourceRecords:(data.opportunities||[]).length,
      active:active.length,
      excludedUnavailable:excluded.filter(x=>['SOLD','REMOVED','WITHDRAWN','CLOSED','UNDER_CONTRACT','OPTION'].includes(x.status)).length,
      hiddenUnverified:excluded.filter(x=>['UNKNOWN','UNVERIFIED'].includes(x.status)).length
    },
    opportunities:active,
    notice:'ARGUS displays a curated listing only when its source is explicitly confirmed ACTIVE. Sold, removed, under-contract, option and unverifiable listings stay hidden.'
  });
}
