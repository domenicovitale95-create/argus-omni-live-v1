import {fetchHtml,extractListing,isUnavailableListing,isConfirmedActiveListing} from './immo-listing-scan.js';
import {linksFrom,buildSourcePageUrls} from './immo-discovery-scan.js';
import {communeBenchmark} from './immo-market-benchmarks.js';

const SEARCH_TIMEOUT=8000,DETAIL_TIMEOUT=8500,DETAIL_CONCURRENCY=10,MAX_DETAILS=120;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim().toLowerCase();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const txt=x=>norm([x.title,x.description,x.location,x.address,x.exactAddress,x.condition,x.state,x.floor,x.terrace,x.garden,x.elevator].filter(Boolean).join(' '));
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function conditionClass(x){
  const s=txt(x);
  if(/entierement renove|refait a neuf|completement renove|fully renovated|volledig gerenoveerd|recent gerenoveerd|excellent etat|etat neuf/.test(s))return 'RENOVE';
  if(/a renover|te renoveren|renovation complete|gros travaux|volledig te renoveren|to renovate/.test(s))return 'A_RENOVER';
  if(/rafraich|opfrissen|remise au gout|moderniser|a moderniser|te moderniseren/.test(s))return 'A_RAFRAICHIR';
  if(/bon etat|tres bon etat|goede staat|good condition|habitable|instapklaar|pret a habiter|prêt à habiter|bien entretenu|goed onderhouden/.test(s))return 'BON_ETAT';
  return 'NON_CONFIRME';
}
function underOption(x){return /sous option|sous compromis|onder optie|under offer|under option|compromis signe/.test(txt(x))}
function occupiedSale(x){return /vendu loue|vendu loué|vente avec locataire|locataire en place|huurder aanwezig|verhuurd verkocht|investment only|bail en cours/.test(txt(x))}
function bedrooms(x){for(const v of [x.bedrooms,x.bedroomCount,x.numberOfBedrooms]){const z=n(v);if(z!==null)return Math.round(z)}const m=txt(x).match(/\b([0-6])\s*(?:chambres?|ch\.?|slaapkamers?|bedrooms?)\b/);return m?Number(m[1]):null}
function floorOf(x){for(const v of [x.floor,x.floorNumber,x.level]){const z=n(v);if(z!==null)return Math.round(z)}const s=txt(x);if(/rez[- ]de[- ]chaussee|rez de chaussée|gelijkvloers|ground floor/.test(s))return 0;const m=s.match(/(?:etage|étage|verdieping|floor)\s*([0-9]{1,2})/);return m?Number(m[1]):null}
function hasExterior(x){return /terrasse|terras|balcon|balkon|jardin|tuin|garden|terrace/.test(txt(x))}
function hasElevator(x){const s=txt(x);if(/sans ascenseur|geen lift|no lift/.test(s))return false;if(/ascenseur|lift|elevator/.test(s))return true;return null}
function median(v){const a=v.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:Math.round((a[m-1]+a[m])/2)}
function qtile(v,q){const a=v.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const p=(a.length-1)*q,b=Math.floor(p),r=p-b;return Math.round(a[b]+((a[b+1]??a[b])-a[b])*r)}
function removeOutliers(rows){
  if(rows.length<5)return {rows,outliers:0};
  const vals=rows.map(r=>r.pricePerSqm).filter(Number.isFinite),q1=qtile(vals,.25),q3=qtile(vals,.75),iqr=q3-q1,lo=q1-1.5*iqr,hi=q3+1.5*iqr;
  const kept=rows.filter(r=>r.pricePerSqm>=lo&&r.pricePerSqm<=hi);
  return {rows:kept.length>=3?kept:rows,outliers:rows.length-(kept.length>=3?kept.length:rows.length)};
}
function stateFit(actual,target){
  if(!target||target==='NON_CONFIRME')return actual==='RENOVE'?4:actual==='A_RENOVER'?5:8;
  if(actual===target)return 18;
  const near={BON_ETAT:['NON_CONFIRME','A_RAFRAICHIR'],A_RAFRAICHIR:['BON_ETAT','NON_CONFIRME'],A_RENOVER:['A_RAFRAICHIR'],RENOVE:['BON_ETAT']};
  return (near[target]||[]).includes(actual)?6:0;
}
function relevance(row,t){
  const a=row.area,b=row.bedrooms;let s=0;
  if(t.keywords.length)s+=t.keywords.some(k=>txt(row).includes(norm(k)))?25:0; else s+=12;
  if(t.area&&a){const d=Math.abs(a-t.area)/t.area;s+=d<=.08?30:d<=.15?25:d<=.25?17:d<=.40?8:0}else s+=8;
  if(t.beds!=null&&b!=null)s+=b===t.beds?15:Math.abs(b-t.beds)===1?5:0;
  s+=stateFit(row.condition,t.condition);
  if(t.floor!=null&&row.floor!=null)s+=Math.abs(t.floor-row.floor)<=1?5:Math.abs(t.floor-row.floor)<=2?2:0;
  if(t.exterior!=null)s+=row.exterior===t.exterior?4:0;
  if(t.elevator!=null&&row.elevator!=null)s+=row.elevator===t.elevator?3:0;
  return Math.round(clamp(s,0,100));
}
async function fetchSearch(url){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),SEARCH_TIMEOUT);
  try{
    const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; ArgusImmoExitComps/2.0; +https://argus-omni-live.vercel.app/immo-flip-pro)','accept':'text/html,application/xhtml+xml','accept-language':'fr-BE,fr;q=.9,nl;q=.8,en;q=.7'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return {url:r.url||url,text:(await r.text()).slice(0,2200000)};
  }finally{clearTimeout(t)}
}
function quality(pool,targetCondition,microRequested,outliers){
  if(!pool.length)return {score:0,label:'INSUFFISANTE',autoValue:false};
  const avg=pool.reduce((s,r)=>s+r.relevance,0)/pool.length;
  const sameState=pool.filter(r=>targetCondition==='NON_CONFIRME'||r.condition===targetCondition).length/pool.length;
  let score=Math.min(45,pool.length*7)+Math.min(30,avg*.35)+Math.min(15,sameState*15)+(microRequested?10:5);
  score-=Math.min(10,outliers*2);score=Math.round(clamp(score,0,100));
  const label=score>=75&&pool.length>=5?'ELEVEE':score>=55&&pool.length>=3?'MOYENNE':'FAIBLE';
  return {score,label,averageRelevance:Math.round(avg),sameStatePct:Math.round(sameState*100),autoValue:pool.length>=3&&score>=55};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});
  try{
    const base='https://'+String(req.headers?.host||'argus-omni-live.vercel.app'),p=new URL(req.url||'/',base).searchParams;
    const commune=String(p.get('commune')||'').trim(),bench=communeBenchmark(commune);if(!bench)return res.status(400).json({ok:false,error:'Marché non supporté'});
    const micro=String(p.get('micro')||''),md=(bench.microZones||[]).find(z=>z.id===micro),keywords=md?.keywords||[];
    const target={area:n(p.get('surface')),beds:n(p.get('chambres')),condition:String(p.get('condition')||'BON_ETAT').toUpperCase(),floor:n(p.get('etage')),exterior:p.has('exterieur')?p.get('exterieur')==='1':null,elevator:p.has('ascenseur')?p.get('ascenseur')==='1':null,keywords};
    const excludeOccupied=p.get('occupation')!=='include',pages=Math.max(1,Math.min(8,Number(p.get('pages'))||5));
    const source={id:'immoweb-exit',name:'Immoweb · appartements actifs',url:'https://www.immoweb.be/fr/recherche/appartement/a-vendre/'+bench.slug+'/'+bench.postal+'?minprice=75000&maxprice=2000000',match:/\/fr\/annonce\/(?:appartement|studio|duplex|penthouse|rez-de-chaussee)\/a-vendre\//i,pages};
    const links=[],seen=new Set();let pagesReached=0,error=null;
    for(const u of buildSourcePageUrls(source)){try{const page=await fetchSearch(u);pagesReached++;let added=0;for(const l of linksFrom(page.text,page.url,source)){if(!seen.has(l)){seen.add(l);links.push(l);added++}}if(!added||links.length>=MAX_DETAILS)break}catch(e){error=String(e?.message||e);break}}
    const rows=[];let excludedOccupied=0;
    for(let i=0;i<Math.min(links.length,MAX_DETAILS);i+=DETAIL_CONCURRENCY){
      const batch=await Promise.all(links.slice(i,i+DETAIL_CONCURRENCY).map(async u=>{try{const page=await fetchHtml(u,DETAIL_TIMEOUT),row=extractListing(page.html,page.url||u);return {...row,canonical:String(row.canonical||page.url||u)}}catch{return null}}));
      for(const raw of batch){
        if(!raw||isUnavailableListing(raw)||!isConfirmedActiveListing(raw)||underOption(raw))continue;
        if(excludeOccupied&&occupiedSale(raw)){excludedOccupied++;continue}
        const price=n(raw.price),area=n(raw.area??raw.surface),t=txt(raw);if(!price||!area||area<18||area>350)continue;
        if(!t.includes(norm(commune))&&!t.includes(bench.postal))continue;
        if(keywords.length&&!keywords.some(k=>t.includes(norm(k))))continue;
        const row={title:raw.title||'Appartement',location:raw.location||raw.address||commune,price,area,bedrooms:bedrooms(raw),peb:raw.peb||raw.epc||null,condition:conditionClass(raw),floor:floorOf(raw),exterior:hasExterior(raw),elevator:hasElevator(raw),pricePerSqm:Math.round(price/area),canonical:raw.canonical};
        row.relevance=relevance(row,target);rows.push(row);
      }
    }
    const dedup=[...new Map(rows.map(r=>[r.canonical||r.location+'|'+r.price+'|'+r.area,r])).values()];
    const areaFiltered=dedup.filter(r=>!target.area||Math.abs(r.area-target.area)/target.area<=.4);
    const highRel=areaFiltered.filter(r=>r.relevance>=45).sort((a,b)=>b.relevance-a.relevance);
    const stateMatched=highRel.filter(r=>target.condition==='NON_CONFIRME'||r.condition===target.condition);
    let initial=stateMatched.length>=3?stateMatched:highRel;
    if(initial.length<3)initial=areaFiltered.sort((a,b)=>b.relevance-a.relevance);
    initial=initial.slice(0,15);
    const robust=removeOutliers(initial),pool=robust.rows.slice(0,12),psm=pool.map(r=>r.pricePerSqm),q=quality(pool,target.condition,Boolean(md),robust.outliers);
    const med=median(psm),low=qtile(psm,.25),high=qtile(psm,.75);
    return res.status(200).json({
      ok:true,checkedAt:new Date().toISOString(),commune,region:bench.region,registrationRate:bench.registrationRate,microZone:md||null,
      official:{y2025:bench.official2025||null,q12026:bench.officialQ12026||null,s12026:bench.officialS12026||null},
      target:{surface:target.area,bedrooms:target.beds,condition:target.condition,floor:target.floor,exterior:target.exterior,elevator:target.elevator,excludeOccupied},
      coverage:{source:'Immoweb',pagesConfigured:pages,pagesReached,linksFound:links.length,detailsUsable:dedup.length,excludedOccupied,error},
      summary:{count:pool.length,low,median:med,high,outliersRemoved:robust.outliers,confidence:q.label,qualityScore:q.score,averageRelevance:q.averageRelevance,sameStatePct:q.sameStatePct,basis:stateMatched.length>=3?'ETAT_SIMILAIRE':'MEILLEURS_COMPARABLES_DISPONIBLES',autoValue:q.autoValue,recommendedPsm:q.autoValue?med:null},
      comparables:pool,
      warning:"Les comparables sont des prix demandés d'annonces actives, pas des prix actés. ARGUS n'autorise une valeur automatique qu'avec au moins 3 comparables et un score de qualité suffisant. La stratégie n'intègre aucune rénovation."
    });
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
}
