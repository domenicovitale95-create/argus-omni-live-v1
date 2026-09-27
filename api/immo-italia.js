import {readJsonFresh,writeJson} from './_report-store.js';
import seed from '../data/immo-italia-seed.json' with {type:'json'};

const STORE_PATH='argus/immo/italia-catalog.json';
const MAX_PRICE=300000;
const FETCH_TIMEOUT=9000;
const MAX_DETAIL_FETCHES=48;
const DETAIL_CONCURRENCY=6;

const EASTERN_SICILY=[
  'messina','taormina','giardini naxos','letojanni','santa teresa di riva','sant alessio siculo','roccalumera','furci siculo','ali terme','scaletta zanclea',
  'catania','aci castello','aci trezza','acireale','aci catena','vampolieri','capo mulini','riposto','fondachello','mascali','giarre','fiumefreddo','calatabiano',
  'siracusa','plemmirio','fontane bianche','arenella','ognina','avola','noto','lido di noto','marzamemi','pachino','portopalo','granelli','ispica','santa maria del focallo','augusta','brucoli','priolo','melilli',
  'ragusa','marina di ragusa','scicli','sampieri','pozzallo','donnalucata'
];

// Pagine pubbliche a bassa frequenza. Se una sorgente rifiuta l'accesso, ARGUS la segnala senza aggirare protezioni.
const AUTO_SOURCES=[
  {id:'idealista-sicilia-vista-mare',name:'idealista · Sicilia ville vista mare',url:'https://www.idealista.it/geo/vendita-case/sicilia/con-ville,vista-mare/'},
  {id:'idealista-pachino',name:'idealista · Pachino / Marzamemi fronte mare',url:'https://www.idealista.it/cerca/vendita-case/pachino-siracusa/ville_fronte_mare_sicilia/'},
  {id:'idealista-fontane-bianche',name:'idealista · Fontane Bianche',url:'https://www.idealista.it/vendita-case/siracusa/fontane-bianche-cassibile/fontane-bianche/con-ville-indipendenti,piano-terra/'},
  {id:'idealista-avola',name:'idealista · Avola vista mare',url:'https://www.idealista.it/cerca/vendita-case/avola-siracusa/ville_vista_mare_sicilia/'},
  {id:'idealista-taormina',name:'idealista · Taormina vista mare',url:'https://www.idealista.it/cerca/vendita-case/taormina-messina/ville_vista_mare_sicilia/'},
  {id:'idealista-catania',name:'idealista · Catania vista mare',url:'https://www.idealista.it/cerca/vendita-case/catania-catania/ville_vista_mare_sicilia/'}
];

const MANUAL_SOURCES=[
  {id:'immobiliare',name:'Immobiliare.it',url:'https://www.immobiliare.it/vendita-ville/sicilia/',reason:'Collegamento esterno: ARGUS non forza le pagine di ricerca se la fonte limita l’automazione.'},
  {id:'casa',name:'Casa.it',url:'https://www.casa.it/vendita/residenziale/sicilia/',reason:'Ricerca manuale disponibile dal portale.'},
  {id:'remax',name:'RE/MAX Italia',url:'https://www.remax.it/',reason:'Rete nazionale: ricerca esterna per Sicilia orientale.'},
  {id:'tecnocasa',name:'Tecnocasa',url:'https://www.tecnocasa.it/',reason:'Rete nazionale: ricerca esterna per le zone costiere.'},
  {id:'gabetti',name:'Gabetti',url:'https://www.gabetti.it/',reason:'Rete nazionale: ricerca esterna.'},
  {id:'professionecasa',name:'Professionecasa',url:'https://www.professionecasa.it/',reason:'Rete nazionale: ricerca esterna.'},
  {id:'century21',name:'CENTURY 21 Italia',url:'https://www.century21.it/',reason:'Rete nazionale: ricerca esterna.'}
];

function clean(v=''){
  return String(v).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
}
function normalize(v=''){return clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function euroNumber(raw){if(raw==null)return null;const n=Number(String(raw).replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.]/g,''));return Number.isFinite(n)?n:null}
function meta(html,key){
  const k=String(key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const a=new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i');
  const b=new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${k}["'][^>]*>`,'i');
  return clean((html.match(a)||html.match(b)||[])[1]||'');
}
async function fetchText(url){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),FETCH_TIMEOUT);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctrl.signal,headers:{
      'user-agent':'Mozilla/5.0 (compatible; ARGUS-Immo-Italia/1.0; public-low-frequency-scan)',
      'accept':'text/html,application/xhtml+xml','accept-language':'it-IT,it;q=0.9,en;q=0.6'
    }});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const ct=r.headers.get('content-type')||'';if(!ct.includes('text/html'))throw new Error('Risposta non HTML');
    return {url:r.url||url,text:(await r.text()).slice(0,2500000)};
  }finally{clearTimeout(timer)}
}
function linksFromIdealista(html,base){
  const out=[],seen=new Set();let m;
  const re=/href=["']([^"']*\/immobile\/\d+\/?[^"']*)["']/gi;
  while((m=re.exec(html))){try{const u=new URL(m[1],base);u.hash='';['xtcr','xtmc'].forEach(k=>u.searchParams.delete(k));const s=u.toString();if(u.hostname.endsWith('idealista.it')&&!seen.has(s)){seen.add(s);out.push(s)}}catch{}}
  return out;
}
function textNumber(text,re){const m=text.match(re);return m?Number(m[1]):null}
function wordBedrooms(text){
  let m=text.match(/\b(\d+)\s+camere?\s+da\s+letto\b/i)||text.match(/\b(\d+)\s+camere?\b/i);if(m)return Number(m[1]);
  const words={una:1,un:1,due:2,tre:3,quattro:4,cinque:5,sei:6};
  m=text.match(/\b(una|un|due|tre|quattro|cinque|sei)\s+camere?\b/i);return m?words[m[1].toLowerCase()]||null:null;
}
function inEasternSicily(text){const n=normalize(text);return EASTERN_SICILY.some(x=>n.includes(normalize(x)))}
function parseIdealista(html,url){
  const body=clean(html),low=normalize(body),title=meta(html,'og:title')||clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'Immobile');
  const desc=meta(html,'description')||meta(html,'og:description')||body.slice(0,5000);
  const priceMatch=body.match(/(?:Prezzo dell'immobile:\s*)?([0-9]{2,3}(?:\.[0-9]{3})+)\s*€/i)||body.match(/([0-9]{2,6})\s*€/i);
  const price=priceMatch?euroNumber(priceMatch[1]):null;
  const surface=textNumber(body,/\b(\d{2,4})\s*m²\s*(?:commerciali)?/i);
  const bathrooms=textNumber(body,/\b(\d+)\s+bagni\b/i);
  const rooms=textNumber(body,/\b(\d+)\s+locali\b/i);
  const bedrooms=wordBedrooms(body);
  const floorMatch=body.match(/\b(\d+)\s+piani?\b/i);let floors=floorMatch?Number(floorMatch[1]):null;
  if(/un['’]?unica\s+(?:elevazione|piano)|su\s+un\s+unico\s+piano|\b1\s+piano\b/i.test(body))floors=1;
  const seaFront=/\bfronte\s+mare\b|accesso\s+diretto\s+al\s+mare|sul\s+mare\b/i.test(body);
  const seaView=seaFront||/\bvista\s+mare\b|vista\s+(?:sul|del)\s+mare/i.test(body);
  const dist=(()=>{const m=body.match(/(?:a\s+soli\s+|circa\s+|a\s+)?(\d{1,4})\s+metri\s+(?:dal|dalla|dalle)\s+(?:mare|spiaggia|discese\s+a\s+mare)/i);return m?Number(m[1]):null})();
  const pool=/\bpiscina\b/i.test(body),garden=/\bgiardino\b|\bterreno\b/i.test(body),storage=/\bripostiglio\b|\bdeposito\b|\bsgabuzzino\b/i.test(body),parking=/\bposto\s+auto\b|\bbox\b|\bgarage\b/i.test(body);
  const needsWork=/da\s+ristrutturare|da\s+rimodernare|da\s+rifinire|lavori\s+da\s+fare/i.test(body);
  const goodCondition=/ristrutturat|ottimo\s+stato|buono\s+stato|pront[ao]\s+(?:da|per)\s+abitare|nuova\s+costruzione|recente\s+costruzione/i.test(body);
  const readyToLive=needsWork?false:(goodCondition?true:null);
  const modern=/stile\s+moderno|design\s+contemporaneo|architettura\s+contemporanea|nuova\s+costruzione/i.test(body)?true:null;
  const independentHouse=/\bvilla\b|\bvilletta\b|casa\s+indipendente|unifamiliare|bifamiliare/i.test(title+' '+body.slice(0,1500));
  const id=(url.match(/\/immobile\/(\d+)/)||[])[1]||url;
  return {id:'idealista-'+id,title,description:desc,price,surface,rooms,bedrooms,bathrooms,floors,independentHouse,seaFront,seaView,distanceSeaMeters:dist,pool,garden,storage,parking,readyToLive,condition:needsWork?'Da ristrutturare / lavori':(goodCondition?'Buono stato / ristrutturato':'Da verificare'),modern,sourceName:'idealista',canonical:url,rawScopeText:(title+' '+desc+' '+body.slice(0,8000))};
}
function scoreListing(x){
  let s=0;
  if(x.independentHouse)s+=15;
  if(Number.isFinite(Number(x.price))&&Number(x.price)<=MAX_PRICE)s+=15;
  if(x.seaFront)s+=20;else if(x.seaView)s+=13;else if(Number(x.distanceSeaMeters)>0&&Number(x.distanceSeaMeters)<=500)s+=10;
  if(Number(x.bedrooms)>=3)s+=12;else if(x.bedrooms==null)s+=2;
  if(Number(x.bathrooms)>=2)s+=10;else if(x.bathrooms==null)s+=2;
  if(x.readyToLive===true)s+=15;else if(x.readyToLive==null)s+=4;
  if(Number(x.floors)>=1&&Number(x.floors)<=2)s+=5;else if(x.floors==null)s+=2;
  if(x.pool)s+=5;if(x.modern)s+=3;
  if(x.readyToLive===false)s-=25;if(Number(x.price)>MAX_PRICE)s-=30;if(!x.independentHouse)s-=25;
  s=Math.max(0,Math.min(100,s));
  const label=s>=85?'PERFETTA':s>=72?'MOLTO FORTE':s>=58?'INTERESSANTE':s>=42?'DA VERIFICARE':'FUORI CRITERI';
  return {score:s,label};
}
function explain(x){
  const yes=[],check=[],no=[];
  if(x.independentHouse)yes.push('casa indipendente / villa');else no.push('tipologia indipendente non confermata');
  if(Number(x.price)<=MAX_PRICE)yes.push('entro 300.000 €');else no.push('oltre 300.000 €');
  if(x.seaFront)yes.push('fronte mare');else if(x.seaView)yes.push('vista mare');else check.push('vicinanza al mare da verificare');
  if(Number(x.bedrooms)>=3)yes.push('almeno 3 camere');else if(x.bedrooms==null)check.push('numero camere da verificare');else no.push('meno di 3 camere');
  if(Number(x.bathrooms)>=2)yes.push('almeno 2 bagni');else if(x.bathrooms==null)check.push('numero bagni da verificare');else no.push('meno di 2 bagni');
  if(x.readyToLive===true)yes.push('pronta da abitare');else if(x.readyToLive===false)no.push('richiede lavori');else check.push('stato lavori da verificare');
  if(x.pool)yes.push('piscina');
  if(Number(x.floors)>=1&&Number(x.floors)<=2)yes.push(x.floors===1?'un solo piano':'massimo due piani');else if(x.floors==null)check.push('numero piani da verificare');else no.push('più di due piani');
  return {yes,check,no};
}
function enrich(x){const rank=scoreListing(x);return {...x,...rank,match:explain(x)}}
function mergeListings(rows){
  const map=new Map();for(const raw of rows){const x=enrich(raw),key=String(x.canonical||x.id).replace(/[?#].*$/,'').replace(/\/$/,'').toLowerCase();const prev=map.get(key);if(!prev||x.score>prev.score)map.set(key,x)}
  return [...map.values()].sort((a,b)=>b.score-a.score||(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
}

export async function refreshItaliaCatalog(){
  const started=new Date().toISOString(),sourceStatus=[],allLinks=[];
  for(const source of AUTO_SOURCES){
    const status={id:source.id,name:source.name,url:source.url,mode:'automatico',state:'Temporaneamente non disponibile',checkedAt:new Date().toISOString(),linksFound:0,error:null};
    try{const page=await fetchText(source.url),links=linksFromIdealista(page.text,page.url);status.linksFound=links.length;status.state='Controllata automaticamente';for(const link of links)allLinks.push(link)}catch(e){status.error=e?.name==='AbortError'?'timeout':String(e?.message||e)}
    sourceStatus.push(status);
  }
  const unique=[...new Set(allLinks)].slice(0,MAX_DETAIL_FETCHES),found=[];
  for(let i=0;i<unique.length;i+=DETAIL_CONCURRENCY){
    const batch=await Promise.all(unique.slice(i,i+DETAIL_CONCURRENCY).map(async url=>{try{const p=await fetchText(url);return parseIdealista(p.text,p.url)}catch{return null}}));
    for(const row of batch)if(row&&inEasternSicily(row.rawScopeText||'')&&Number(row.price)>0&&Number(row.price)<=MAX_PRICE)found.push({...row,sourceVerifiedAt:new Date().toISOString()});
  }
  for(const m of MANUAL_SOURCES)sourceStatus.push({...m,mode:'manuale',state:'Da controllare manualmente',checkedAt:started,linksFound:null,error:null});
  const seedRows=(seed.listings||[]).map(x=>({...x,catalogOrigin:'verificato'}));
  const listings=mergeListings([...found,...seedRows]);
  const payload={ok:true,version:1,scope:'Sicilia orientale · Mar Ionio',criteria:seed.criteria,refreshedAt:new Date().toISOString(),listings,sourceStatus,counts:{active:listings.length,automaticSources:AUTO_SOURCES.length,manualSources:MANUAL_SOURCES.length,liveDiscovered:found.length},notice:'ARGUS mostra solo dati realmente letti o annunci verificati. Le fonti non automatizzabili gratuitamente vengono indicate come ricerca manuale.'};
  try{await writeJson(STORE_PATH,payload)}catch(e){payload.storageWarning=String(e?.message||e)}
  return payload;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
  if(req.method==='POST'){
    try{return res.status(200).json(await refreshItaliaCatalog())}catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
  }
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET o POST richiesto'});
  const saved=await readJsonFresh(STORE_PATH,null);
  if(saved?.listings?.length)return res.status(200).json(saved);
  const listings=mergeListings(seed.listings||[]);
  return res.status(200).json({ok:true,version:1,scope:'Sicilia orientale · Mar Ionio',criteria:seed.criteria,refreshedAt:seed.updatedAt,listings,sourceStatus:[...AUTO_SOURCES.map(x=>({...x,mode:'automatico',state:'In attesa del primo controllo'})),...MANUAL_SOURCES.map(x=>({...x,mode:'manuale',state:'Da controllare manualmente'}))],counts:{active:listings.length,automaticSources:AUTO_SOURCES.length,manualSources:MANUAL_SOURCES.length,liveDiscovered:0},notice:'Catalogo iniziale verificato. Premi “Aggiorna ora” per avviare una nuova scansione gratuita.'});
}