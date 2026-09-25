import {extractListing,hostAllowed,isUnavailableListing,isConfirmedActiveListing} from './immo-listing-scan.js';

const APARTMENT_SOURCES=[
  {id:'immoweb-apartment',name:'Immoweb · appartements',url:'https://www.immoweb.be/fr/recherche/appartement/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\/fr\/annonce\//i,pages:6},
  {id:'immoweb-studio',name:'Immoweb · studios',url:'https://www.immoweb.be/fr/recherche/studio/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\/fr\/annonce\//i,pages:6},
  {id:'immovlan',name:'Immovlan',url:'https://immovlan.be/fr/immobilier/appartement/a-vendre?maxprice=150000&regions=bruxelles-region',match:/\/fr\/detail\//i},
  {id:'zimmo',name:'Zimmo',url:'https://www.zimmo.be/fr/bruxelles/a-vendre/appartement',match:/(a-vendre|te-koop|for-sale)/i},
  {id:'immoscoop',name:'Immoscoop',url:'https://www.immoscoop.be/fr/chercher/a-vendre/ville-de-bruxelles/appartement',match:/(a-vendre|te-koop|property|bien|pand)/i},
  {id:'century21',name:'CENTURY 21',url:'https://www.century21.be/fr/a-vendre',match:/\/fr\/properiete\/a-vendre\//i},
  {id:'victoire',name:'Victoire-Junot',url:'https://victoire.be/fr/a-vendre/all/1?sort=price-asc&view=list',match:/(a-vendre|for-sale|te-koop|bien|property)/i},
  {id:'era',name:'ERA',url:'https://www.era.be/fr/a-vendre/bruxelles/appartement',match:/\/fr\/a-vendre\/[^/]+\/appartement\/.+/i},
  {id:'weinvest',name:'We Invest',url:'https://weinvest.be/fr-BE/properties/for-sale/apartment/city/bruxelles',match:/\/fr-BE\/property\/for-sale\/[^/]+\/apartment\/\d+/i},
  {id:'properstar',name:'Properstar',url:'https://www.properstar.be/belgique/bruxelles/acheter/appartement/plus-recents',match:/\/annonce\/\d+/i}
];

const BUILDING_SOURCES=[
  {id:'immoweb-building',name:'Immoweb · immeubles',url:'https://www.immoweb.be/fr/recherche/immeuble-a-appartements/a-vendre/bruxelles/arrondissement?maxprice=400000',match:/\/fr\/annonce\/immeuble-a-appartements\/a-vendre\//i,pages:6},
  {id:'immovlan-building',name:'Immovlan · immeubles',url:'https://immovlan.be/fr/immobilier/immeuble-de-rapport/a-vendre?maxprice=400000&provinces=bruxelles',match:/\/fr\/detail\/immeuble-de-rapport\/a-vendre\//i}
];

const MAX_LINKS_PER_PAGE=24;
const MAX_LINKS_PER_SOURCE=72;
const DEFAULT_SOURCE_PAGES=1;
const DETAIL_CONCURRENCY=6;
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
  if(source.id==='immovlan'&&!/\/fr\/detail\//i.test(p))return false;
  if(source.id==='era'&&!/\/fr\/a-vendre\/[^/]+\/appartement\/.+/i.test(p))return false;
  if(source.id==='weinvest'&&!/\/fr-be\/property\/for-sale\/[^/]+\/apartment\/\d+/i.test(p))return false;
  if(source.id==='properstar'&&!/\/annonce\/\d+/i.test(p))return false;
  if(source.id==='immoweb-building'&&!/\/fr\/annonce\/immeuble-a-appartements\/a-vendre\//i.test(p))return false;
  if(source.id==='immovlan-building'&&!/\/fr\/detail\/immeuble-de-rapport\/a-vendre\//i.test(p))return false;
  if(/[?&](?:page|sort|view|offset)=/i.test(u.search))return false;
  return p.split('/').filter(Boolean).length>=3;
}
function linksFrom(html,base,source){
  const out=[],seen=new Set(),re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while((m=re.exec(html))){
    try{
      const u=new URL(m[1],base);
      if(!['http:','https:'].includes(u.protocol)||!hostAllowed(u.hostname)||!likelyDetailUrl(u,source))continue;
      u.hash='';
      const key=u.toString();
      if(seen.has(key))continue;
      seen.add(key);out.push(key);
      if(out.length>=MAX_LINKS_PER_PAGE)break;
    }catch{}
  }
  return out;
}

export function buildSourcePageUrls(source={}){
  const count=Math.max(1,Math.min(10,Number(source.pages)||DEFAULT_SOURCE_PAGES));
  const urls=[];
  for(let page=1;page<=count;page++){
    const u=new URL(source.url);
    if(page>1)u.searchParams.set('page',String(page));
    urls.push(u.toString());
  }
  return urls;
}
export function detectCriticalLegalRisks(listing={}){
  const text=(String(listing.title||'')+' '+String(listing.description||'')).toLowerCase();
  const rules=[
    ['URBANISM_INFRACTION',/\b(?:en\s+)?infraction(?:\s+urbanistique)?\b/i],
    ['NON_REGULARISABLE',/\bnon[ -]?r[ée]gularisables?\b/i],
    ['UNPERMITTED',/\bsans\s+permis\b|\bnon\s+autoris[ée]e?\b/i],
    ['UNRECOGNIZED_UNIT',/\b(?:unit[ée]|logement|division)\s+non\s+(?:reconnue?|autoris[ée]e?)\b/i],
    ['NL_URBANISM',/\bstedenbouwkundige\s+overtreding\b|\bniet\s+vergund\b|\bniet\s+regulariseerbaar\b/i]
  ];
  return rules.filter(([,re])=>re.test(text)).map(([code])=>code);
}

function keyFor(x){
  const canonical=String(x.canonical||'').replace(/\/$/,'').toLowerCase();
  if(canonical)return canonical;
  return [x.address||x.city||'',x.price||'',x.surface||'',x.bedrooms??''].join('|').toLowerCase();
}
function eligible(x,maxPrice,category){
  if(isUnavailableListing(x)||!isConfirmedActiveListing(x))return false;
  const price=Number(x.price),surface=Number(x.surface);
  if(!Number.isFinite(price)||price<40000||price>maxPrice)return false;
  if(Number.isFinite(surface)&&(surface<12||surface>800))return false;
  const type=String(x.type||'unknown'),text=(String(x.title||'')+' '+String(x.description||'')).toLowerCase();
  if(category==='building')return type==='building'||/(immeuble de rapport|immeuble à appartements|maison de rapport|investment property|opbrengsteigendom)/i.test(text);
  if(!['apartment','studio','unknown'].includes(type))return false;
  return type!=='unknown'||/(appartement|apartment|flat|studio|duplex|penthouse|kot\b)/i.test(text);
}
async function scanSource(source,maxPrice,category){
  const started=Date.now(),status={id:source.id,name:source.name,url:source.url,reachable:false,pagesConfigured:Number(source.pages)||1,pagesReached:0,linksFound:0,listingsParsed:0,eligible:0,hardStops:0,excludedUnavailable:0,hiddenUnverified:0,error:null,pageErrors:[],durationMs:0};
  try{
    const seenLinks=new Set(),links=[];
    for(const pageUrl of buildSourcePageUrls(source)){
      try{
        const page=await fetchText(pageUrl);status.reachable=true;status.pagesReached++;
        const pageLinks=linksFrom(page.text,page.url,source);
        let added=0;
        for(const link of pageLinks){
          if(seenLinks.has(link))continue;
          seenLinks.add(link);links.push(link);added++;
          if(links.length>=MAX_LINKS_PER_SOURCE)break;
        }
        if(links.length>=MAX_LINKS_PER_SOURCE||added===0)break;
      }catch(e){
        status.pageErrors.push({page:pageUrl,error:e?.name==='AbortError'?'timeout':String(e?.message||e)});
        if(!status.reachable)throw e;
        break;
      }
    }
    status.linksFound=links.length;
    const rows=[];
    for(let i=0;i<links.length;i+=DETAIL_CONCURRENCY){
      const got=await Promise.all(links.slice(i,i+DETAIL_CONCURRENCY).map(async url=>{
        try{
          const p=await fetchText(url),row=extractListing(p.text,p.url),canonical=String(row.canonical||p.url);
          if(canonical&&normalizedHost(canonical)!==normalizedHost(source.url))return null;
          const criticalLegalRisks=detectCriticalLegalRisks(row);
          return {...row,canonical,category,criticalLegalRisks,decisionGate:criticalLegalRisks.length?'HARD_STOP':'REVIEW',discoveredFrom:source.id,discoveredAt:new Date().toISOString()};
        }catch{return null}
      }));
      for(const row of got)if(row){
        status.listingsParsed++;
        if(isUnavailableListing(row)){status.excludedUnavailable++;continue}
        if(!isConfirmedActiveListing(row)){status.hiddenUnverified++;continue}
        if(eligible(row,maxPrice,category)){
          status.eligible++;
          if(row.decisionGate==='HARD_STOP')status.hardStops++;
          rows.push(row);
        }
      }
    }
    status.durationMs=Date.now()-started;return {status,rows};
  }catch(e){
    status.error=e?.name==='AbortError'?'timeout':String(e?.message||e);status.durationMs=Date.now()-started;return {status,rows:[]};
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
    const map=new Map();
    for(const r of results)for(const row of r.rows){const k=keyFor(row);if(k&&!map.has(k))map.set(k,row)}
    const listings=[...map.values()].sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
    return res.status(200).json({
      ok:true,category,scannedAt:new Date().toISOString(),maxPrice,
      sourceStatus:results.map(r=>r.status),
      totals:{sourcesConfigured:sources.length,sourcesReached:results.filter(r=>r.status.reachable).length,pagesReached:results.reduce((n,r)=>n+(r.status.pagesReached||0),0),linksFound:results.reduce((n,r)=>n+r.status.linksFound,0),listingsParsed:results.reduce((n,r)=>n+r.status.listingsParsed,0),eligibleAfterDedup:listings.length,hardStops:listings.filter(x=>x.decisionGate==='HARD_STOP').length},
      listings,
      notice:'ARGUS reports only sources actually reached. Only listings explicitly confirmed ACTIVE are eligible; sold, removed, under-contract, option and unverifiable listings are excluded before deduplication, ranking and map display.'
    });
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
