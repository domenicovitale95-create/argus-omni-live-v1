import {extractListing,hostAllowed} from './immo-listing-scan.js';

const DISCOVERY_SOURCES=[
  {id:'immoweb',name:'Immoweb',url:'https://www.immoweb.be/fr/recherche/appartement/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\/fr\/annonce\//i},
  {id:'immovlan',name:'Immovlan',url:'https://immovlan.be/fr/immobilier/appartement/a-vendre?maxprice=150000&regions=bruxelles-region',match:/\/fr\/detail\//i},
  {id:'zimmo',name:'Zimmo',url:'https://www.zimmo.be/fr/bruxelles/a-vendre/appartement',match:/(a-vendre|te-koop|for-sale)/i},
  {id:'immoscoop',name:'Immoscoop',url:'https://www.immoscoop.be/fr/chercher/a-vendre/ville-de-bruxelles/appartement',match:/(a-vendre|te-koop|property|bien|pand)/i},
  {id:'century21',name:'CENTURY 21',url:'https://www.century21.be/fr/a-vendre',match:/\/fr\/properiete\/a-vendre\//i},
  {id:'victoire',name:'Victoire-Junot',url:'https://victoire.be/fr/a-vendre/all/1?sort=price-asc&view=list',match:/(a-vendre|for-sale|te-koop|bien|property)/i}
];

const MAX_LINKS_PER_SOURCE=8;
const FETCH_TIMEOUT=7000;

async function fetchText(url){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),FETCH_TIMEOUT);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctrl.signal,headers:{
      'user-agent':'Mozilla/5.0 (compatible; ArgusImmoDiscovery/1.0; +https://argus-omni-live.vercel.app/immo-opportunities)',
      'accept':'text/html,application/xhtml+xml','accept-language':'fr-BE,fr;q=0.9,nl;q=0.8,en;q=0.7'
    }});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const ct=r.headers.get('content-type')||'';
    if(!ct.includes('text/html'))throw new Error('not HTML');
    const text=await r.text();
    return {url:r.url||url,text:text.slice(0,2200000)};
  }finally{clearTimeout(timer)}
}
function linksFrom(html,base,source){
  const out=[],seen=new Set(),re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while((m=re.exec(html))){
    try{
      const u=new URL(m[1],base);
      if(!['http:','https:'].includes(u.protocol)||!hostAllowed(u.hostname))continue;
      if(!source.match.test(u.pathname+u.search))continue;
      u.hash='';
      const key=u.toString();
      if(seen.has(key))continue;
      seen.add(key);out.push(key);
      if(out.length>=MAX_LINKS_PER_SOURCE)break;
    }catch{}
  }
  return out;
}
function keyFor(x){
  const canonical=String(x.canonical||'').replace(/\/$/,'').toLowerCase();
  if(canonical)return canonical;
  return [x.address||x.city||'',x.price||'',x.surface||'',x.bedrooms??''].join('|').toLowerCase();
}
function eligible(x,maxPrice){
  if(!Number.isFinite(Number(x.price))||Number(x.price)<=0||Number(x.price)>maxPrice)return false;
  return ['apartment','studio','unknown'].includes(String(x.type||'unknown'));
}
async function scanSource(source,maxPrice){
  const started=Date.now();
  const status={id:source.id,name:source.name,url:source.url,reachable:false,linksFound:0,listingsParsed:0,eligible:0,error:null,durationMs:0};
  try{
    const page=await fetchText(source.url);status.reachable=true;
    const links=linksFrom(page.text,page.url,source);status.linksFound=links.length;
    const rows=[];
    for(let i=0;i<links.length;i+=4){
      const batch=links.slice(i,i+4);
      const got=await Promise.all(batch.map(async url=>{
        try{const p=await fetchText(url);return {...extractListing(p.text,p.url),discoveredFrom:source.id,discoveredAt:new Date().toISOString()}}
        catch{return null}
      }));
      for(const row of got)if(row){status.listingsParsed++;if(eligible(row,maxPrice)){status.eligible++;rows.push(row)}}
    }
    status.durationMs=Date.now()-started;
    return {status,rows};
  }catch(e){
    status.error=e?.name==='AbortError'?'timeout':String(e?.message||e);
    status.durationMs=Date.now()-started;
    return {status,rows:[]};
  }
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET')return res.status(200).json({ok:true,service:'ARGUS IMMO multi-source discovery',version:'1.0',sources:DISCOVERY_SOURCES.map(({id,name,url})=>({id,name,url}))});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
  const raw=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const maxPrice=Math.max(50000,Math.min(1000000,Number(raw.maxPrice)||150000));
  const results=await Promise.all(DISCOVERY_SOURCES.map(s=>scanSource(s,maxPrice)));
  const map=new Map();
  for(const r of results)for(const row of r.rows){const k=keyFor(row);if(k&&!map.has(k))map.set(k,row)}
  const listings=[...map.values()].sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
  return res.status(200).json({
    ok:true,
    scannedAt:new Date().toISOString(),
    maxPrice,
    sourceStatus:results.map(r=>r.status),
    totals:{
      sourcesConfigured:DISCOVERY_SOURCES.length,
      sourcesReached:results.filter(r=>r.status.reachable).length,
      linksFound:results.reduce((n,r)=>n+r.status.linksFound,0),
      listingsParsed:results.reduce((n,r)=>n+r.status.listingsParsed,0),
      eligibleAfterDedup:listings.length
    },
    listings,
    notice:'ARGUS reports only sources actually reached. A blocked or timed-out source is never counted as covered.'
  });
}
