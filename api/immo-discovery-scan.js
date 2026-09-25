import {extractListing,hostAllowed,isUnavailableListing,isConfirmedActiveListing} from './immo-listing-scan.js';

const APARTMENT_SOURCES=[
  {id:'immoweb-apartment',name:'Immoweb · appartements',url:'https://www.immoweb.be/fr/recherche/appartement/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\/fr\/annonce\//i,pages:20},
  {id:'immoweb-studio',name:'Immoweb · studios',url:'https://www.immoweb.be/fr/recherche/studio/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\/fr\/annonce\//i,pages:20},
  {id:'immovlan-apartment',name:'Immovlan · appartements',url:'https://immovlan.be/fr/immobilier/appartement/a-vendre?maxprice=150000&regions=bruxelles-region',match:/\/fr\/detail\//i,pages:20},
  {id:'immovlan-studio',name:'Immovlan · studios',url:'https://immovlan.be/fr/immobilier/appartement/a-vendre?propertysubtypes=studio&regions=bruxelles-region',match:/\/fr\/detail\//i,pages:20},
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

const MAX_SOURCE_PAGES=20;
const MAX_LINKS_PER_SOURCE=1000;
const DEFAULT_SOURCE_PAGES=1;
const DETAIL_CONCURRENCY=10;
const FETCH_TIMEOUT=7000;

async function fetchText(url){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),FETCH_TIMEOUT);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctrl.signal,headers:{
      'user-agent':'Mozilla/5.0 (compatible; ArgusImmoDiscovery/1.3; +https://argus-omni-live.vercel.app/immo-opportunities)',
      'accept':'text/html,application/xhtml+xml','accept-language':'fr-BE,fr;q=0.9,nl;q=0.8,en;q=0.7'
    }});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const ct=r.headers.get('content-type')||'';
    if(!ct.includes('text/html'))throw new Error('not HTML');
    const text=await r.text();
    return {url:r.url||url,text:text.slice(0,2200000)};
  }finally{clearTimeout(timer)}
}
function normalizedHost(value=''){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
function likelyDetailUrl(u,source){
  const sourceHost=normalizedHost(source.url),candidateHost=u.hostname.toLowerCase().replace(/^www\./,'');
  if(candidateHost!==sourceHost)return false;
  const p=u.pathname.toLowerCase().replace(/\/+$/,'');
  if(!source.match.test(p+u.search.toLowerCase()))return false;
  if(/\/(chercher|recherche|search)(\/|$)/i.test(p))return false;
  if(source.id==='victoire'&&/^\/fr\/a-vendre\/all(?:\/|$)/i.test(p))return false;
  if(source.id==='zimmo'&&/^\/fr\/[^/]+\/a-vendre\/appartement(?:\/|$)/i.test(p))return false;
  if(source.id==='immoscoop'&&/^\/fr\/(?:chercher|search)(?:\/|$)/i.test(p))return false;
  if(source.id==='century21'&&!/\/fr\/properiete\/a-vendre\//i.test(p))return false;
  if(source.id.startsWith('immoweb')&&!/\/fr\/annonce\//i.test(p))return false;
  if(source.id.startsWith('immovlan')&&!/\/fr\/detail\//i.test(p))return false;
  if(source.id==='era'&&!/\/fr\/a-vendre\/[^/]+\/appartement\/.+/i.test(p))return false;
  if(source.id==='weinvest'&&!/\/fr-be\/property\/for-sale\/[^/]+\/apartment\/\d+/i.test(p))return false;
  if(source.id==='properstar'&&!/\/annonce\/\d+/i.test(p))return false;
  if(source.id==='immoweb-building'&&!/\/fr\/annonce\/immeuble-a-appartements\/a-vendre\//i.test(p))return false;
  if(source.id==='immovlan-building'&&!/\/fr\/detail\/immeuble-de-rapport\/a-vendre\//i.test(p))return false;
  if(/[?&](?:page|sort|view|offset)=/i.test(u.search))return false;
  return p.split('/').filter(Boolean).length>=3;
}
export function linksFrom(html,base,source){
  const out=[],seen=new Set();
  const add=raw=>{
    try{
      const u=new URL(raw,base);
      if(!['http:','https:'].includes(u.protocol)||!hostAllowed(u.hostname)||!likelyDetailUrl(u,source))return;
      u.hash='';
      const key=u.toString();
      if(seen.has(key)||out.length>=MAX_LINKS_PER_SOURCE)return;
      seen.add(key);out.push(key);
    }catch{}
  };
  const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while((m=re.exec(html)))add(m[1]);

  // Immoweb also embeds listing routes inside hydrated JSON/script payloads.
  // Read those routes too so a listing is not lost simply because it was not emitted as an <a>.
  if(String(source?.id||'').startsWith('immoweb')){
    const normalized=String(html||'').replace(/\\\//g,'/');
    const embedded=/\/fr\/annonce\/[a-z0-9%_.~\-\/]+\/\d+(?:\?[^"'<>\\\s]*)?/gi;
    while((m=embedded.exec(normalized)))add(m[0]);
  }
  return out;
}

export function buildSourcePageUrls(source={}){
  const count=Math.max(1,Math.min(MAX_SOURCE_PAGES,Number(source.pages)||DEFAULT_SOURCE_PAGES));
  const urls=[];
  for(let page=1;page<=count;page++){
    const u=new URL(source.url);
    if(page>1)u.searchParams.set('page',String(page));
    urls.push(u.toString());
  }
  return urls;
}
export function detectCriticalLegalRisks(listing={}){
  const raw=[listing.title,listing.description,listing.html].filter(Boolean).join(' ');
  const text=String(raw).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').toLowerCase();
  const rules=[
    ['URBANISM_INFRACTION',/\b(?:en\s+)?infraction(?:\s+urbanistique)?\b|\bsituation\s+urbanistique\s+non\s+conforme\b/i],
    ['NON_REGULARISABLE',/\bnon[ -]?r[ée]gularisables?\b|\bimpossible\s+[àa]\s+r[ée]gulariser\b/i],
    ['UNPERMITTED',/\bsans\s+permis\b|\bsans\s+autorisation\b|\bnon\s+autoris[ée]e?\b/i],
    ['UNRECOGNIZED_UNIT',/\b(?:unit[ée]|logement|division|appartement)\s+non\s+(?:reconnue?|autoris[ée]e?|r[ée]gularis[ée]e?)\b/i],
    ['NL_URBANISM',/\bstedenbouwkundige\s+overtreding\b|\bniet\s+vergund\b|\bniet\s+regulariseerbaar\b/i]
  ];
  return rules.filter(([,re])=>re.test(text)).map(([code])=>code);
}

function keyFor(x){
  const raw=String(x.canonical||'').trim();
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
    }catch{
      return raw.replace(/\/$/,'').toLowerCase();
    }
  }
  return [x.address||x.city||'',x.price||'',x.surface||'',x.bedrooms??''].join('|').toLowerCase();
}
export function evaluateEligibility(x,maxPrice,category){
  if(isUnavailableListing(x))return {eligible:false,review:false,reason:'EXPLICITLY_UNAVAILABLE'};
  const price=Number(x.price),surface=Number(x.surface);
  const type=String(x.type||'unknown'),text=(String(x.title||'')+' '+String(x.description||'')).toLowerCase();
  const categoryMatch=category==='building'
    ? type==='building'||/(immeuble de rapport|immeuble à appartements|maison de rapport|investment property|opbrengsteigendom)/i.test(text)
    : ['apartment','studio'].includes(type)||/(appartement|apartment|flat|studio|duplex|penthouse|kot\b)/i.test(text);
  if(Number.isFinite(price)&&(price<40000||price>maxPrice))return {eligible:false,review:false,reason:'OUTSIDE_PRICE_BOX'};
  if(Number.isFinite(surface)&&(surface<12||surface>800))return {eligible:false,review:false,reason:'IMPLAUSIBLE_SURFACE'};
  if(!categoryMatch&&type!=='unknown')return {eligible:false,review:false,reason:'WRONG_PROPERTY_TYPE'};
  if(!Number.isFinite(price))return {eligible:false,review:true,reason:'PRICE_NOT_PARSED'};
  if(!categoryMatch)return {eligible:false,review:true,reason:'TYPE_NOT_CONFIRMED'};
  if(!isConfirmedActiveListing(x))return {eligible:false,review:true,reason:'ACTIVE_STATUS_UNCONFIRMED'};
  return {eligible:true,review:false,reason:'ELIGIBLE'};
}
function eligible(x,maxPrice,category){
  return evaluateEligibility(x,maxPrice,category).eligible;
}
async function scanSource(source,maxPrice,category){
  const pagesConfigured=Math.max(1,Math.min(MAX_SOURCE_PAGES,Number(source.pages)||DEFAULT_SOURCE_PAGES));
  const started=Date.now();
  const status={id:source.id,name:source.name,url:source.url,reachable:false,pagesConfigured,pagesReached:0,linksFound:0,listingsParsed:0,eligible:0,reviewQueue:0,hardStops:0,excludedUnavailable:0,hiddenUnverified:0,detailFetchFailed:0,coverageComplete:false,stoppedBecause:null,error:null,pageErrors:[],durationMs:0};
  const rows=[],review=[];
  try{
    const seenLinks=new Set(),links=[];
    let exhausted=false,hitSafetyCap=false;
    for(const pageUrl of buildSourcePageUrls(source)){
      try{
        const page=await fetchText(pageUrl);
        status.reachable=true;status.pagesReached++;
        const pageLinks=linksFrom(page.text,page.url,source);
        let added=0;
        for(const link of pageLinks){
          if(seenLinks.has(link))continue;
          seenLinks.add(link);links.push(link);added++;
          if(links.length>=MAX_LINKS_PER_SOURCE){hitSafetyCap=true;break}
        }
        if(hitSafetyCap){status.stoppedBecause='link_safety_cap';break}
        if(added===0){exhausted=true;status.stoppedBecause='no_new_results';break}
      }catch(e){
        status.pageErrors.push({page:pageUrl,error:e?.name==='AbortError'?'timeout':String(e?.message||e)});
        status.stoppedBecause='page_fetch_error';
        if(!status.reachable)throw e;
        break;
      }
    }
    status.linksFound=links.length;
    if(!status.stoppedBecause&&status.pagesReached>=pagesConfigured)status.stoppedBecause='page_safety_cap';

    for(let i=0;i<links.length;i+=DETAIL_CONCURRENCY){
      const got=await Promise.all(links.slice(i,i+DETAIL_CONCURRENCY).map(async url=>{
        try{
          const p=await fetchText(url),row=extractListing(p.text,p.url),canonical=String(row.canonical||p.url);
          if(canonical&&normalizedHost(canonical)!==normalizedHost(source.url))return {error:'canonical_host_mismatch',url};
          const criticalLegalRisks=detectCriticalLegalRisks({...row,html:p.text});
          return {row:{...row,canonical,category,criticalLegalRisks,decisionGate:criticalLegalRisks.length?'HARD_STOP':'REVIEW',discoveredFrom:source.id,discoveredAt:new Date().toISOString()}};
        }catch(e){
          return {error:e?.name==='AbortError'?'timeout':String(e?.message||e),url};
        }
      }));
      for(const item of got){
        if(item.error){
          status.detailFetchFailed++;
          review.push({canonical:item.url,category,discoveredFrom:source.id,reviewReason:'DETAIL_FETCH_FAILED',reviewDetail:item.error});
          continue;
        }
        const row=item.row;
        status.listingsParsed++;
        if(isUnavailableListing(row)){status.excludedUnavailable++;continue}
        const gate=evaluateEligibility(row,maxPrice,category);
        if(!isConfirmedActiveListing(row))status.hiddenUnverified++;
        if(gate.review){
          status.reviewQueue++;
          review.push({...row,reviewReason:gate.reason});
          continue;
        }
        if(gate.eligible){
          status.eligible++;
          if(row.decisionGate==='HARD_STOP')status.hardStops++;
          rows.push(row);
        }
      }
    }

    status.coverageComplete=Boolean(exhausted&&!hitSafetyCap&&status.pageErrors.length===0&&status.detailFetchFailed===0);
    status.durationMs=Date.now()-started;
    return {status,rows,review};
  }catch(e){
    status.error=e?.name==='AbortError'?'timeout':String(e?.message||e);
    status.coverageComplete=false;
    status.durationMs=Date.now()-started;
    return {status,rows,review};
  }
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET')return res.status(200).json({ok:true,service:'ARGUS IMMO multi-source discovery',version:'1.4',categories:['apartment','building']});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
  try{
    const raw=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const category=raw.category==='building'?'building':'apartment';
    const defaultMax=category==='building'?400000:150000;
    const maxPrice=Math.max(50000,Math.min(1000000,Number(raw.maxPrice)||defaultMax));
    const sources=category==='building'?BUILDING_SOURCES:APARTMENT_SOURCES;
    const results=await Promise.all(sources.map(s=>scanSource(s,maxPrice,category)));
    const map=new Map(),reviewMap=new Map();
    for(const r of results)for(const row of r.rows){const k=keyFor(row);if(k&&!map.has(k))map.set(k,row)}
    for(const r of results)for(const row of r.review||[]){const k=keyFor(row);if(k&&!map.has(k)&&!reviewMap.has(k))reviewMap.set(k,row)}
    const listings=[...map.values()].sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
    const reviewQueue=[...reviewMap.values()].sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
    const sourcesReached=results.filter(r=>r.status.reachable).length;
    const sourcesComplete=results.filter(r=>r.status.coverageComplete).length;
    return res.status(200).json({
      ok:true,category,scannedAt:new Date().toISOString(),maxPrice,
      sourceStatus:results.map(r=>r.status),
      coverage:{complete:sourcesReached===sources.length&&sourcesComplete===sources.length,sourcesConfigured:sources.length,sourcesReached,sourcesComplete},
      totals:{sourcesConfigured:sources.length,sourcesReached,sourcesComplete,pagesReached:results.reduce((n,r)=>n+(r.status.pagesReached||0),0),linksFound:results.reduce((n,r)=>n+r.status.linksFound,0),listingsParsed:results.reduce((n,r)=>n+r.status.listingsParsed,0),detailFetchFailed:results.reduce((n,r)=>n+(r.status.detailFetchFailed||0),0),eligibleAfterDedup:listings.length,reviewQueue:reviewQueue.length,hardStops:listings.filter(x=>x.decisionGate==='HARD_STOP').length},
      listings,
      reviewQueue,
      notice:'ARGUS separates confirmed-active opportunities from candidates that still require verification. Sold, removed, under-contract and option listings are excluded. Incomplete source coverage is explicitly reported instead of being presented as exhaustive.'
    });
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
