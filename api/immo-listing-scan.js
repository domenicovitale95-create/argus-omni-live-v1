export const ALLOWED_DOMAINS = [
  'immoweb.be','immovlan.be','zimmo.be','realo.be','era.be','logic-immo.be',
  'immoscoop.be','spotto.be','properstar.be','biddit.be',
  'weinvest.be','trevi.be','latouretpetit.be','victoire.be','bathim.be',
  'macnash.com','myimmo.be','century21.be','hyimmo.com','skyimmo.be','immo.notaris.be','direct-immo.be'
];

export function hostAllowed(host=''){
  const h=String(host).toLowerCase().replace(/^www\./,'');
  return ALLOWED_DOMAINS.some(d=>h===d||h.endsWith('.'+d));
}
function cleanText(v=''){
  return String(v).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
}
function meta(html,key){
  const escaped=String(key).replace(/[.*+?^$()|[\]\\]/g,'\\$&');
  const re1=new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i');
  const re2=new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,'i');
  return cleanText((html.match(re1)||html.match(re2)||[])[1]||'');
}
function parseNumber(v){
  if(v==null)return null;
  const s=String(v).replace(/[^0-9.,]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  const n=Number(s); return Number.isFinite(n)?n:null;
}
function collectJsonLd(html){
  const out=[]; const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; while((m=re.exec(html))){try{const j=JSON.parse(m[1].trim());out.push(j)}catch{}}
  return out;
}
function walk(obj,fn){
  if(!obj||typeof obj!=='object')return;
  fn(obj);
  if(Array.isArray(obj))for(const x of obj)walk(x,fn); else for(const v of Object.values(obj))walk(v,fn);
}
function inferType(text){
  const s=text.toLowerCase();
  if(/immeuble de rapport|opbrengsteigendom|investment property|appartements? building|gebouw.*appartement/.test(s))return 'building';
  if(/terrain|bouwgrond|building plot|grond te koop/.test(s))return 'land';
  if(/studio|kot\b/.test(s))return 'studio';
  if(/maison|huis|woning|villa|townhouse/.test(s))return 'house';
  if(/appartement|apartment|flat|duplex|penthouse/.test(s))return 'apartment';
  if(/commerce|commercial|handelspand|retail/.test(s))return 'commercial';
  return 'unknown';
}
function regexNum(text,patterns){
  for(const p of patterns){const m=text.match(p); if(m){const n=parseNumber(m[1]); if(n!=null)return n}}
  return null;
}
export function classifyListingAvailability({title='',description='',html='',structuredAvailability=''}={}){
  const titleText=cleanText(title).toLowerCase();
  const descText=cleanText(description).toLowerCase();
  const head=(titleText+' '+descText).trim();
  const top=cleanText(html).slice(0,45000).toLowerCase();
  const structured=String(structuredAvailability||'').toLowerCase();

  if(/soldout|discontinued|outofstock/.test(structured)){
    return {status:'SOLD',reason:'structured_availability'};
  }
  if(/instock|limitedavailability/.test(structured)){
    return {status:'ACTIVE',reason:'structured_active_availability'};
  }

  const forSaleSignal=['à vendre','a vendre','te koop','for sale'].some(s=>head.includes(s));
  const tenantedSale=['vendu loué','vendue louée','vendu loue','vendue louee','verkocht verhuurd','sold tenanted','sold with tenant'].some(s=>head.includes(s));
  if(forSaleSignal&&tenantedSale){
    return {status:'ACTIVE',reason:'tenanted_sale_signal'};
  }

  const explicitSold=[
    /\bce bien (?:est |a été )?vendu\b/,
    /\bbien (?:est |a été |déjà )vendu\b/,
    /\bpropri[ée]t[ée] (?:est )?vendue\b/,
    /\bappartement (?:est )?vendu\b/,
    /\bmaison (?:est )?vendue\b/,
    /\bimmeuble (?:est )?vendu\b/,
    /\bdit pand is verkocht\b/,
    /\bdit appartement is verkocht\b/,
    /\bdeze woning is verkocht\b/,
    /\bproperty (?:is |has been )?sold\b/,
    /\bthis (?:property|home|apartment|building) is sold\b/,
    /\balready sold\b/
  ];
  const soldBadge=/^(?:vendu(?:e)?|verkocht|sold)(?:\s*[!:\-–—].*)?$/i;
  const soldPrefix=/^(?:vendu(?:e)?|verkocht|sold)\s*[!:\-–—|]/i;
  if(
    explicitSold.some(r=>r.test(head))||
    explicitSold.some(r=>r.test(top.slice(0,22000)))||
    soldBadge.test(cleanText(title))||
    soldPrefix.test(cleanText(title))||
    soldBadge.test(cleanText(description))
  ){
    return {status:'SOLD',reason:'page_sold_signal'};
  }

  const removed=[
    /\bannonce (?:retir[ée]e?|supprim[ée]e?|plus disponible)\b/,
    /\bbien (?:retir[ée] de la vente|plus disponible)\b/,
    /\bn'est plus disponible\b/,
    /\bniet meer beschikbaar\b/,
    /\bannonce niet meer beschikbaar\b/,
    /\blisting (?:removed|no longer available)\b/,
    /\bproperty no longer available\b/
  ];
  if(removed.some(r=>r.test(head))||removed.some(r=>r.test(top))){
    return {status:'REMOVED',reason:'page_removed_signal'};
  }

  const contract=[
    /\bsous compromis\b/,/\bcompromis sign[ée]\b/,/\bvente conclue\b/,
    /\bonder compromis\b/,/\bkoopovereenkomst getekend\b/,/\bsale agreed\b/,/\bunder contract\b/
  ];
  if(contract.some(r=>r.test(head))||contract.some(r=>r.test(top.slice(0,18000)))){
    return {status:'UNDER_CONTRACT',reason:'contract_signal'};
  }

  const option=[/\bsous option\b/,/\ben option\b/,/\bin optie\b/,/\boption pending\b/];
  if(option.some(r=>r.test(head))||option.some(r=>r.test(top.slice(0,18000)))){
    return {status:'OPTION',reason:'option_signal'};
  }

  if(forSaleSignal){
    return {status:'ACTIVE',reason:'for_sale_signal'};
  }
  return {status:'UNKNOWN',reason:'no_reliable_availability_signal'};
}
export function isUnavailableListing(listing={}){
  const status=String(listing.availabilityStatus||listing.status||'').toUpperCase();
  return ['SOLD','REMOVED','WITHDRAWN','CLOSED','UNDER_CONTRACT','OPTION'].includes(status);
}
export function isConfirmedActiveListing(listing={}){
  return String(listing.availabilityStatus||listing.status||'').toUpperCase()==='ACTIVE';
}
export function extractListing(html,url){
  const title=meta(html,'og:title')||cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const description=meta(html,'og:description')||meta(html,'description');
  const canonical=cleanText((html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||[])[1]||url);
  const ld=collectJsonLd(html);
  let price=parseNumber(meta(html,'product:price:amount')||meta(html,'og:price:amount'));
  let currency=meta(html,'product:price:currency')||meta(html,'og:price:currency')||'EUR';
  let address=null,city=null,postalCode=null,surface=null,bedrooms=null,bathrooms=null,image=null,structuredAvailability='';
  for(const root of ld)walk(root,o=>{
    if(price==null&&o.offers?.price!=null)price=parseNumber(o.offers.price);
    if(o.offers?.priceCurrency)currency=o.offers.priceCurrency;
    if(!structuredAvailability&&o.offers?.availability)structuredAvailability=String(o.offers.availability);
    if(!image&&o.image){image=Array.isArray(o.image)?o.image[0]:o.image}
    if(!address&&o.address){
      const a=o.address;
      address=cleanText([a.streetAddress,a.postalCode,a.addressLocality].filter(Boolean).join(', '));
      city=city||cleanText(a.addressLocality||''); postalCode=postalCode||cleanText(a.postalCode||'');
    }
    if(surface==null){
      const v=o.floorSize?.value??o.floorSize??o.area?.value??o.area;
      const n=parseNumber(v); if(n&&n<10000)surface=n;
    }
    if(bedrooms==null){const n=parseNumber(o.numberOfBedrooms); if(n!=null)bedrooms=n}
    if(bathrooms==null){const n=parseNumber(o.numberOfBathroomsTotal??o.numberOfBathrooms); if(n!=null)bathrooms=n}
  });
  const text=cleanText(html).slice(0,500000);
  if(price==null)price=regexNum(title+' '+description,[
    /([0-9][0-9 .,'’]{3,})\s*€/i,/€\s*([0-9][0-9 .,'’]{3,})/i,
    /prix\s*[:\-]?\s*€?\s*([0-9 .,'’]+)/i,/prijs\s*[:\-]?\s*€?\s*([0-9 .,'’]+)/i
  ]);
  if(price==null)price=regexNum(text,[
    /prix\s*[:\-]?\s*€?\s*([0-9 .,'’]+)/i,/prijs\s*[:\-]?\s*€?\s*([0-9 .,'’]+)/i,
    /([0-9][0-9 .,'’]{3,})\s*€/i,/€\s*([0-9][0-9 .,'’]{3,})/i
  ]);
  if(surface==null)surface=regexNum(text,[
    /surface\s+habitable\s*[:\-]?\s*([0-9.,]+)\s*m²/i,
    /woonoppervlakte\s*[:\-]?\s*([0-9.,]+)\s*m²/i,
    /living\s+surface\s*[:\-]?\s*([0-9.,]+)\s*m²/i
  ]);
  if(bedrooms==null)bedrooms=regexNum(text,[/([0-9]+)\s+chambre/i,/([0-9]+)\s+slaapkamer/i,/([0-9]+)\s+bedroom/i]);
  if(bathrooms==null)bathrooms=regexNum(text,[/([0-9]+)\s+salle(?:s)?\s+de\s+bain/i,/([0-9]+)\s+badkamer/i,/([0-9]+)\s+bathroom/i]);
  const pebMatch=text.match(/\b(?:PEB|EPC)\s*[:\-]?\s*([A-G](?:\+|\-)?)/i);
  const epc=pebMatch?pebMatch[1].toUpperCase():null;
  const type=inferType(title+' '+description+' '+text.slice(0,20000));
  const availability=classifyListingAvailability({title,description,html,structuredAvailability});
  return {title,description,canonical,source:new URL(url).hostname,price,currency,address,city,postalCode,surface,bedrooms,bathrooms,epc,type,image,availabilityStatus:availability.status,availabilityReason:availability.reason};
}
export async function fetchHtml(url,timeoutMs=12000){
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctrl.signal,headers:{
      'user-agent':'Mozilla/5.0 (compatible; ArgusImmo/1.2; +https://argus-omni-live.vercel.app/immo)',
      'accept':'text/html,application/xhtml+xml','accept-language':'fr-BE,fr;q=0.9,nl;q=0.8,en;q=0.7'
    }});
    if(!r.ok)throw new Error('La page a répondu HTTP '+r.status);
    const ct=r.headers.get('content-type')||''; if(!ct.includes('text/html'))throw new Error('La page ne semble pas être une annonce HTML');
    const html=await r.text();
    return {html:html.length>1800000?html.slice(0,1800000):html,url:r.url||url};
  }finally{clearTimeout(timer)}
}
export async function fetchListingStatus(url,timeoutMs=12000){
  const u=new URL(String(url||'').trim());
  if(!['http:','https:'].includes(u.protocol))throw new Error('URL invalide');
  if(!hostAllowed(u.hostname))throw new Error('Site non supporté');
  const page=await fetchHtml(u.toString(),timeoutMs);
  return extractListing(page.html,page.url);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method==='GET')return res.status(200).json({ok:true,service:'ARGUS IMMO listing scanner',version:'1.4',supportedDomains:ALLOWED_DOMAINS,mode:'public-listing-metadata'});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
  try{
    const raw=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const u=new URL(String(raw.url||'').trim());
    if(!['http:','https:'].includes(u.protocol))throw new Error('URL invalide');
    if(!hostAllowed(u.hostname))return res.status(400).json({ok:false,error:'Site non encore supporté',supportedDomains:ALLOWED_DOMAINS});
    const data=await fetchListingStatus(u.toString());
    const completeness=['price','surface','type'].filter(k=>data[k]!=null&&data[k]!=='unknown').length;
    return res.status(200).json({ok:true,data,meta:{fetchedAt:new Date().toISOString(),completeness,notice:'Les champs sont extraits automatiquement du contenu public de l’annonce. Vérifiez-les avant toute décision.'}});
  }catch(e){
    return res.status(422).json({ok:false,error:e?.name==='AbortError'?'Le site de l’annonce a mis trop de temps à répondre':String(e?.message||e)});
  }
}
