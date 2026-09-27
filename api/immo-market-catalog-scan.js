import {fetchHtml,extractListing,isUnavailableListing,isConfirmedActiveListing} from './immo-listing-scan.js';
import {linksFrom,buildSourcePageUrls} from './immo-discovery-scan.js';
import {isBrusselsListing,hasDeferredPriceStructure} from './immo-region.js';

const APARTMENT_SOURCES=[
  {id:'immoweb-apartment',name:'Immoweb · appartements',url:'https://www.immoweb.be/fr/recherche/appartement/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\/fr\/annonce\//i,pages:20},
  {id:'immoweb-studio',name:'Immoweb · studios',url:'https://www.immoweb.be/fr/recherche/studio/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\/fr\/annonce\//i,pages:20},
  {id:'immovlan-apartment',name:'Immovlan · appartements',url:'https://immovlan.be/fr/immobilier/appartement/a-vendre?maxprice=150000&regions=bruxelles-region',match:/\/fr\/detail\//i,pages:20},
  {id:'immovlan-studio',name:'Immovlan · studios',url:'https://immovlan.be/fr/immobilier/appartement/a-vendre?propertysubtypes=studio&regions=bruxelles-region&maxprice=150000',match:/\/fr\/detail\//i,pages:20},
  {id:'zimmo',name:'Zimmo',url:'https://www.zimmo.be/fr/bruxelles/a-vendre/appartement',match:/(a-vendre|te-koop|for-sale)/i,pages:20},
  {id:'immoscoop',name:'Immoscoop',url:'https://www.immoscoop.be/fr/chercher/a-vendre/ville-de-bruxelles/appartement',match:/(a-vendre|te-koop|property|bien|pand)/i},
  {id:'century21',name:'CENTURY 21',url:'https://www.century21.be/fr/a-vendre',match:/\/fr\/properiete\/a-vendre\//i},
  {id:'victoire',name:'Victoire-Junot',url:'https://victoire.be/fr/a-vendre/all/1?sort=price-asc&view=list',match:/(a-vendre|for-sale|te-koop|bien|property)/i},
  {id:'era',name:'ERA',url:'https://www.era.be/fr/a-vendre/bruxelles/appartement',match:/\/fr\/a-vendre\/[^/]+\/appartement\/.+/i},
  {id:'weinvest',name:'We Invest',url:'https://weinvest.be/fr-BE/properties/for-sale/apartment/city/bruxelles',match:/\/fr-BE\/property\/for-sale\/[^/]+\/apartment\/\d+/i},
  {id:'properstar',name:'Properstar',url:'https://www.properstar.be/belgique/bruxelles/acheter/appartement/plus-recents',match:/\/annonce\/\d+/i}
];
const BUILDING_SOURCES=[
  {id:'immoweb-building',name:'Immoweb · immeubles',url:'https://www.immoweb.be/fr/recherche/immeuble-a-appartements/a-vendre/bruxelles/arrondissement?maxprice=400000',match:/\/fr\/annonce\/immeuble-a-appartements\/a-vendre\//i,pages:20},
  {id:'immovlan-building',name:'Immovlan · immeubles',url:'https://immovlan.be/fr/immobilier/immeuble-de-rapport/a-vendre?maxprice=400000&provinces=bruxelles',match:/\/fr\/detail\/immeuble-de-rapport\/a-vendre\//i,pages:20}
];
const SEARCH_TIMEOUT=7000,DETAIL_TIMEOUT=8500,DETAIL_CONCURRENCY=12,MAX_LINKS_PER_SOURCE=1000;

async function fetchSearch(url){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),SEARCH_TIMEOUT);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; ArgusImmoCatalog/2.2; +https://argus-omni-live.vercel.app/immo-opportunities)','accept':'text/html,application/xhtml+xml','accept-language':'fr-BE,fr;q=.9,nl;q=.8,en;q=.7'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const ct=r.headers.get('content-type')||'';if(!ct.includes('text/html'))throw new Error('not HTML');
    return {url:r.url||url,text:(await r.text()).slice(0,2200000)};
  }finally{clearTimeout(timer)}
}
function correctedType(row={},url='',category='apartment'){
  const head=(String(row.title||'')+' '+String(row.description||'')).toLowerCase();
  const path=(()=>{try{return new URL(url).pathname.toLowerCase()}catch{return String(url).toLowerCase()}})();
  if(category==='building'){
    if(/immeuble de rapport|immeuble à appartements|immeuble a appartements|maison de rapport|opbrengsteigendom|investment property/.test(head)||/immeuble-a-appartements|immeuble-de-rapport|opbrengsteigendom/.test(path))return 'building';
    return row.type==='building'?'building':'unknown';
  }
  if(/\bstudio\b|\bkot\b/.test(head)||/\/studio(?:\/|$)/.test(path))return 'studio';
  if(/appartement|apartment|\bflat\b|duplex|penthouse/.test(head)||/\/appartement(?:\/|$)|\/apartment(?:\/|$)/.test(path))return 'apartment';
  if(['apartment','studio'].includes(row.type))return row.type;
  return 'unknown';
}
function amount(raw=''){
  const digits=String(raw).replace(/[^0-9]/g,'');
  const n=Number(digits);return Number.isFinite(n)?n:null;
}
function euroAmount(text=''){
  const s=String(text).replace(/&nbsp;|&#160;/gi,' ').replace(/\u202f|\u00a0/g,' ');
  const patterns=[
    /(?:prix|prijs|price)\s*[:\-]?\s*(?:€\s*)?([0-9][0-9 .,'’\u00a0\u202f]{3,})\s*€/i,
    /(?:€\s*)([0-9][0-9 .,'’\u00a0\u202f]{3,})/i,
    /([0-9][0-9 .,'’\u00a0\u202f]{3,})\s*€/i
  ];
  for(const re of patterns){const m=s.match(re);if(m){const n=amount(m[1]);if(n>=40000&&n<=5000000)return n}}
  return null;
}
function correctedPrice(row={},html='',maxPrice=150000){
  const titleTag=(String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';
  const ogTitle=(String(html).match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']*)["']/i)||[])[1]||'';
  for(const text of [titleTag,ogTitle,row.title,row.description]){
    const n=euroAmount(text);if(n!=null)return n;
  }
  const head=String(html).slice(0,220000);
  const jsonPatterns=[
    /"price"\s*:\s*"?([0-9]{4,8})"?/i,
    /"mainPrice"\s*:\s*"?([0-9]{4,8})"?/i,
    /"transactionPrice"\s*:\s*"?([0-9]{4,8})"?/i
  ];
  for(const re of jsonPatterns){const m=head.match(re);if(m){const n=Number(m[1]);if(n>=40000&&n<=Math.max(5000000,maxPrice*20))return n}}
  const n=Number(row.price);return Number.isFinite(n)?n:null;
}
function keyFor(x={}){
  const raw=String(x.canonical||'').trim();
  if(raw){try{const u=new URL(raw);const host=u.hostname.toLowerCase().replace(/^www\./,'');const id=u.pathname.match(/\/(\d+)\/?$/);if(host==='immoweb.be'&&id)return 'immoweb:'+id[1];for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||['s','source','ref','tracking'].includes(k.toLowerCase()))u.searchParams.delete(k);u.hash='';return u.toString().replace(/\/$/,'').toLowerCase()}catch{return raw.toLowerCase()}}
  return [x.address||x.city||'',x.price||'',x.surface||'',x.bedrooms??''].join('|').toLowerCase();
}
async function scanSource(source,category,maxPrice){
  const status={id:source.id,name:source.name,reachable:false,pagesReached:0,linksFound:0,detailsRead:0,activeEligible:0,unavailable:0,unverified:0,outsideRegion:0,deferredPrice:0,outsidePrice:0,typeRejected:0,detailFailed:0,error:null};
  const links=[],seen=new Set();
  try{
    for(const pageUrl of buildSourcePageUrls(source)){
      let page;try{page=await fetchSearch(pageUrl)}catch(e){if(!status.reachable)throw e;status.error=String(e?.message||e);break}
      status.reachable=true;status.pagesReached++;
      const found=linksFrom(page.text,page.url,source);let added=0;
      for(const link of found){if(seen.has(link))continue;seen.add(link);links.push(link);added++;if(links.length>=MAX_LINKS_PER_SOURCE)break}
      if(!added||links.length>=MAX_LINKS_PER_SOURCE)break;
    }
    status.linksFound=links.length;
    const rows=[];
    for(let i=0;i<links.length;i+=DETAIL_CONCURRENCY){
      const batch=await Promise.all(links.slice(i,i+DETAIL_CONCURRENCY).map(async url=>{
        try{const page=await fetchHtml(url,DETAIL_TIMEOUT);return {url:page.url||url,html:page.html,row:extractListing(page.html,page.url||url)}}catch(e){return {url,error:String(e?.message||e)}}
      }));
      for(const item of batch){
        if(item.error){status.detailFailed++;continue}
        status.detailsRead++;const row=item.row;
        if(isUnavailableListing(row)){status.unavailable++;continue}
        if(!isConfirmedActiveListing(row)){status.unverified++;continue}
        if(!isBrusselsListing(row,item.url)){status.outsideRegion++;continue}
        if(hasDeferredPriceStructure(row)){status.deferredPrice++;continue}
        const type=correctedType(row,item.url,category);
        if(type==='unknown'){status.typeRejected++;continue}
        const price=correctedPrice(row,item.html,maxPrice);
        if(!Number.isFinite(price)||price<40000||price>maxPrice){status.outsidePrice++;continue}
        rows.push({...row,price,type,category,canonical:String(row.canonical||item.url),discoveredFrom:source.id,discoveredAt:new Date().toISOString(),availabilityStatus:'ACTIVE'});status.activeEligible++;
      }
    }
    return {status,rows};
  }catch(e){status.error=e?.name==='AbortError'?'timeout':String(e?.message||e);return {status,rows:[]}}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
  try{
    const raw=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const category=raw.category==='building'?'building':'apartment';const maxPrice=Math.max(50000,Math.min(1000000,Number(raw.maxPrice)||(category==='building'?400000:150000)));const sources=category==='building'?BUILDING_SOURCES:APARTMENT_SOURCES;
    const results=await Promise.all(sources.map(s=>scanSource(s,category,maxPrice))),map=new Map();for(const r of results)for(const row of r.rows){const k=keyFor(row);if(k&&!map.has(k))map.set(k,row)}
    const listings=[...map.values()].sort((a,b)=>Number(a.price)-Number(b.price));
    return res.status(200).json({ok:true,category,scannedAt:new Date().toISOString(),maxPrice,sourceStatus:results.map(r=>r.status),coverage:{complete:results.every(r=>r.status.reachable&&!r.status.error),sourcesConfigured:sources.length,sourcesReached:results.filter(r=>r.status.reachable).length},totals:{linksFound:results.reduce((n,r)=>n+r.status.linksFound,0),detailsRead:results.reduce((n,r)=>n+r.status.detailsRead,0),eligibleAfterDedup:listings.length,unavailable:results.reduce((n,r)=>n+r.status.unavailable,0),unverified:results.reduce((n,r)=>n+r.status.unverified,0),outsideRegion:results.reduce((n,r)=>n+r.status.outsideRegion,0),deferredPrice:results.reduce((n,r)=>n+r.status.deferredPrice,0),outsidePrice:results.reduce((n,r)=>n+r.status.outsidePrice,0),typeRejected:results.reduce((n,r)=>n+r.status.typeRejected,0),detailFailed:results.reduce((n,r)=>n+r.status.detailFailed,0)},listings,notice:'Catalogue scanner 2.2: Brussels-Capital perimeter is enforced before ranking; deferred-price/annuity structures are excluded; listing type and portal prices are revalidated before price-box filtering.'});
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
