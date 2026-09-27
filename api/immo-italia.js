import {readJsonFresh,writeJson} from './_report-store.js';
import seed from '../data/immo-italia-seed.json' with {type:'json'};

const STORE_PATH='argus/immo/italia-catalog.json';
const MAX_PRICE=300000;
const FETCH_TIMEOUT=7000;
const MAX_DETAIL_FETCHES=44;
const DETAIL_CONCURRENCY=10;
const SOURCE_CONCURRENCY=2;
const PAGE_CONCURRENCY=4;

const EASTERN_SICILY=[
  'messina','taormina','giardini naxos','letojanni','santa teresa di riva','sant alessio siculo','roccalumera','furci siculo','ali terme','scaletta zanclea',
  'catania','aci castello','aci trezza','acireale','aci catena','vampolieri','capo mulini','riposto','fondachello','mascali','giarre','fiumefreddo','calatabiano',
  'siracusa','plemmirio','fontane bianche','arenella','ognina','avola','noto','lido di noto','marzamemi','pachino','portopalo','granelli','ispica','santa maria del focallo','augusta','brucoli','priolo','melilli',
  'ragusa','marina di ragusa','scicli','sampieri','pozzallo','donnalucata'
];

// Solo modulo Italia. Nessun file, endpoint o dato del Belgio viene letto o modificato qui.
// ARGUS usa esclusivamente pagine pubbliche a bassa frequenza e non aggira blocchi, login, CAPTCHA o paywall.
const SOURCES=[
  {
    id:'idealista',name:'idealista',host:'idealista.it',
    pages:[
      'https://www.idealista.it/geo/vendita-case/sicilia/con-ville,vista-mare/',
      'https://www.idealista.it/cerca/vendita-case/pachino-siracusa/ville_fronte_mare_sicilia/',
      'https://www.idealista.it/vendita-case/siracusa/fontane-bianche-cassibile/fontane-bianche/con-ville-indipendenti,piano-terra/'
    ],
    detail:/\/immobile\/\d+\/?/i
  },
  {
    id:'immobiliare',name:'Immobiliare.it',host:'immobiliare.it',
    pages:[
      'https://www.immobiliare.it/vendita-ville/sicilia/con-vista-mare/',
      'https://www.immobiliare.it/vendita-case-indipendenti/sicilia/con-vista-mare/',
      'https://www.immobiliare.it/vendita-villette/sicilia/con-vista-mare/'
    ],
    detail:/\/annunci\/\d+\/?/i
  },
  {
    id:'casa',name:'Casa.it',host:'casa.it',
    pages:[
      'https://www.casa.it/vendita/ville/sicilia/',
      'https://www.casa.it/vendita/case-indipendenti/sicilia/'
    ],
    detail:/\/immobili\/\d+\/?/i
  },
  {
    id:'remax',name:'RE/MAX Italia',host:'remax.it',
    pages:[
      'https://www.remax.it/trova/ricerca/vendita/Siracusa',
      'https://www.remax.it/trova/ricerca/vendita/Catania',
      'https://www.remax.it/trova/ricerca/vendita/Ragusa',
      'https://www.remax.it/trova/ricerca/vendita/Messina'
    ],
    detail:/\/trova\/immobile\/[^"'?#<>\s]+/i
  },
  {
    id:'tecnocasa',name:'Tecnocasa',host:'tecnocasa.it',
    pages:[
      'https://www.tecnocasa.it/annunci/immobili/sicilia/siracusa.html',
      'https://www.tecnocasa.it/annunci/immobili/sicilia/catania.html',
      'https://www.tecnocasa.it/annunci/immobili/sicilia/ragusa.html',
      'https://www.tecnocasa.it/annunci/immobili/sicilia/messina.html'
    ],
    detail:/\/vendita\/[^"'?#<>\s]+\/\d+\.html/i
  },
  {
    id:'gabetti',name:'Gabetti',host:'gabetti.it',
    pages:[
      'https://www.gabetti.it/vendita/siracusa',
      'https://www.gabetti.it/vendita/catania',
      'https://www.gabetti.it/vendita/ragusa',
      'https://www.gabetti.it/vendita/messina'
    ],
    detail:/\/(?:casa\/)?vendita\/[^"'?#<>\s]+\/(?:villa(?:-[^"'?#<>\s/]+)?|casa-indipendente(?:-[^"'?#<>\s/]+)?)\/\d+/i
  },
  {
    id:'professionecasa',name:'Professionecasa',host:'professionecasa.it',
    pages:[
      'https://www.professionecasa.it/vendita/villa/siracusa',
      'https://www.professionecasa.it/vendita/villa/catania',
      'https://www.professionecasa.it/vendita/villa/ragusa',
      'https://www.professionecasa.it/vendita/villa/messina'
    ],
    detail:/\/(?:villa-singola|villa-bifamiliare|villa-a-schiera|villetta|villa)\/vendita\/[^"'?#<>\s]+\/\d+/i
  },
  {
    id:'century21',name:'CENTURY 21 Italia',host:'century21.it',
    pages:[
      'https://www.century21.it/agenzia/azimmobiliare/14/',
      'https://www.century21.it/agenzia/estates/5/'
    ],
    detail:/\/annuncio\/\?id=\d+/i
  }
];

function clean(v=''){
  return String(v)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/\s+/g,' ')
    .trim();
}
function normalize(v=''){return clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function euroNumber(raw){
  if(raw==null)return null;
  const s=String(raw).replace(/\s/g,'').replace(/€/g,'');
  let n;
  if(/\d+\.\d{3}(?:\.\d{3})*(?:,\d+)?/.test(s))n=Number(s.replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,''));
  else n=Number(s.replace(/,/g,'.').replace(/[^0-9.]/g,''));
  return Number.isFinite(n)?n:null;
}
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
      'user-agent':'Mozilla/5.0 (compatible; ARGUS-Immo-Italia/2.0; public-low-frequency-scan)',
      'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language':'it-IT,it;q=0.9,en;q=0.6'
    }});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    if(!/(text\/html|application\/xhtml\+xml|application\/xml|text\/xml)/.test(ct))throw new Error('Risposta non HTML/XML');
    return {url:r.url||url,text:(await r.text()).slice(0,2600000)};
  }finally{clearTimeout(timer)}
}
function canonicalUrl(raw,base){
  try{
    const u=new URL(raw,base);
    u.hash='';
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','xtcr','xtmc','fbclid','gclid'].forEach(k=>u.searchParams.delete(k));
    return u.toString();
  }catch{return null}
}
function hostMatches(hostname,host){
  const h=hostname.replace(/^www\./,'').toLowerCase(),target=host.replace(/^www\./,'').toLowerCase();
  return h===target||h.endsWith('.'+target);
}
function linksFromPage(html,base,source){
  const out=[],seen=new Set();
  const re=/href\s*=\s*["']([^"']+)["']/gi;let m;
  while((m=re.exec(html))){
    const u=canonicalUrl(m[1],base);if(!u)continue;
    try{
      const x=new URL(u);
      if(!hostMatches(x.hostname,source.host))continue;
      if(!source.detail.test(x.pathname+x.search))continue;
      if(seen.has(u))continue;
      seen.add(u);out.push(u);
    }catch{}
  }
  return out;
}
function textNumber(text,re){const m=text.match(re);return m?Number(m[1]):null}
function wordBedrooms(text){
  let m=text.match(/\b(\d+)\s+camere?\s+da\s+letto\b/i)||text.match(/\b(\d+)\s+camere?\b/i);
  if(m)return Number(m[1]);
  const words={una:1,un:1,due:2,tre:3,quattro:4,cinque:5,sei:6,sette:7,otto:8};
  m=text.match(/\b(una|un|due|tre|quattro|cinque|sei|sette|otto)\s+camere?\b/i);
  return m?words[m[1].toLowerCase()]||null:null;
}
function inEasternSicily(text){const n=normalize(text);return EASTERN_SICILY.some(x=>n.includes(normalize(x)))}
function bestPrice(body,title){
  const candidates=[
    ...(title.match(/(?:€|EUR)\s*([0-9][0-9.\s]{2,12}(?:,[0-9]{1,2})?)/gi)||[]),
    ...(body.slice(0,12000).match(/(?:prezzo(?:\s+immobile)?|costi|vendita)?\s*:?\s*(?:€|EUR)\s*([0-9][0-9.\s]{2,12}(?:,[0-9]{1,2})?)/gi)||[])
  ];
  for(const raw of candidates){
    const m=raw.match(/([0-9][0-9.\s]{2,12}(?:,[0-9]{1,2})?)/);
    const n=m?euroNumber(m[1]):null;
    if(n>=20000&&n<=5000000)return n;
  }
  const fallback=body.slice(0,9000).match(/\b([0-9]{2,3}(?:\.[0-9]{3})+)\s*€/i);
  return fallback?euroNumber(fallback[1]):null;
}
function parseListing(html,url,source){
  const body=clean(html);
  const title=meta(html,'og:title')||meta(html,'twitter:title')||clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'Immobile');
  const desc=meta(html,'description')||meta(html,'og:description')||body.slice(0,6500);
  const scopeText=title+' '+desc+' '+body.slice(0,14000);
  const price=bestPrice(body,title);
  const surface=textNumber(body,/\b(\d{2,4})\s*m(?:²|2|q)\b/i);
  const bathrooms=textNumber(body,/\b(\d+)\s+bagni?\b/i);
  const rooms=textNumber(body,/\b(\d+)\s+locali\b/i);
  const bedrooms=wordBedrooms(body);
  let floors=textNumber(body,/(?:numero\s+piani(?:\s+edificio)?|si\s+sviluppa\s+su|disposta?\s+su)\s*:?\s*(\d+)\b/i);
  if(/un['’]?\s*unico\s+piano|su\s+un\s+unico\s+livello|interamente\s+su\s+un\s+livello|piano\s+terra\b/i.test(body))floors=floors||1;
  if(!floors){
    const f=body.match(/\b([2-5])\s+(?:livelli|piani)\b/i);if(f)floors=Number(f[1]);
  }
  const seaFront=/\bfronte\s+mare\b|accesso\s+(?:privato\s+)?diretto\s+al\s+mare|direttamente\s+sulla\s+spiaggia|affaccio\s+diretto\s+sul\s+mare/i.test(body);
  const seaView=seaFront||/\bvista\s+mare\b|vista\s+(?:sul|del)\s+mare|panoram\w*\s+sul\s+mare/i.test(body);
  const dist=(()=>{
    const m=body.match(/(?:a\s+soli\s+|circa\s+|a\s+)?(\d{1,4})\s*(?:m|metri)\s+(?:dal|dalla|dalle)\s+(?:mare|spiaggia|costa)/i);
    return m?Number(m[1]):null
  })();
  const pool=/\bpiscina\b/i.test(body),garden=/\bgiardino\b|\bterreno\b/i.test(body);
  const storage=/\bripostiglio\b|\bdeposito\b|\bsgabuzzino\b|\bcantina\b/i.test(body);
  const parking=/\bposto\s+auto\b|\bbox\b|\bgarage\b|\bparcheggio\b/i.test(body);
  const needsWork=/da\s+ristrutturare|da\s+rimodernare|da\s+rifinire|lavori\s+da\s+fare|necessita\w*\s+(?:di\s+)?(?:interventi|lavori)|da\s+ammodernare/i.test(body);
  const goodCondition=/ristrutturat|ottimo\s+stato|buono\s+stato|pront[ao]\s+(?:da|per)\s+abitare|subito\s+abitabile|abitabile\b|nuova\s+costruzione|recente\s+costruzione|pari\s+al\s+nuovo/i.test(body);
  const readyToLive=needsWork?false:(goodCondition?true:null);
  const modern=/stile\s+moderno|design\s+contemporaneo|architettura\s+contemporanea|nuova\s+costruzione|finiture\s+moderne/i.test(body)?true:null;
  const independentHouse=/\bvilla\b|\bvilletta\b|casa\s+indipendente|villa\s+singola|unifamiliare|bifamiliare|semindipendente/i.test(scopeText);
  const id=(url.match(/(\d{5,})(?:\/|\.html|$|\?)/)||[])[1]||Buffer.from(url).toString('base64url').slice(0,18);
  return {
    id:`${source.id}-${id}`,title,description:desc,price,surface,rooms,bedrooms,bathrooms,floors,
    independentHouse,seaFront,seaView,distanceSeaMeters:dist,pool,garden,storage,parking,
    readyToLive,condition:needsWork?'Da ristrutturare / lavori':(goodCondition?'Buono stato / ristrutturato':'Da verificare'),
    modern,sourceName:source.name,sourceId:source.id,canonical:url,rawScopeText:scopeText
  };
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
  if(x.seaFront)yes.push('fronte mare');else if(x.seaView)yes.push('vista mare');else if(Number(x.distanceSeaMeters)>0&&Number(x.distanceSeaMeters)<=500)yes.push(`mare a circa ${x.distanceSeaMeters} m`);else check.push('vicinanza al mare da verificare');
  if(Number(x.bedrooms)>=3)yes.push('almeno 3 camere');else if(x.bedrooms==null)check.push('numero camere da verificare');else no.push('meno di 3 camere');
  if(Number(x.bathrooms)>=2)yes.push('almeno 2 bagni');else if(x.bathrooms==null)check.push('numero bagni da verificare');else no.push('meno di 2 bagni');
  if(x.readyToLive===true)yes.push('pronta da abitare');else if(x.readyToLive===false)no.push('richiede lavori');else check.push('stato lavori da verificare');
  if(x.pool)yes.push('piscina');
  if(Number(x.floors)>=1&&Number(x.floors)<=2)yes.push(x.floors===1?'un solo piano':'massimo due piani');else if(x.floors==null)check.push('numero piani da verificare');else no.push('più di due piani');
  return {yes,check,no};
}
function enrich(x){const rank=scoreListing(x);return {...x,...rank,match:explain(x)}}
function mergeListings(rows){
  const map=new Map();
  for(const raw of rows){
    const x=enrich(raw);
    const canonical=String(x.canonical||'').replace(/[?#].*$/,'').replace(/\/$/,'').toLowerCase();
    const fuzzy=[normalize(x.title).slice(0,90),Number(x.price)||0,Number(x.surface)||0].join('|');
    const key=canonical||fuzzy||String(x.id);
    const prev=map.get(key);
    if(!prev||x.score>prev.score)map.set(key,x);
  }
  return [...map.values()].sort((a,b)=>b.score-a.score||(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
}
async function mapBatches(items,size,fn){
  const out=[];
  for(let i=0;i<items.length;i+=size){
    const batch=await Promise.all(items.slice(i,i+size).map(fn));
    out.push(...batch);
  }
  return out;
}
async function discoverSource(source){
  const status={
    id:source.id,name:source.name,url:source.pages[0],mode:'automatico',
    state:'Temporaneamente non disponibile',checkedAt:new Date().toISOString(),
    pagesChecked:0,linksFound:0,error:null
  };
  const links=new Set(),errors=[];
  const results=await mapBatches(source.pages,PAGE_CONCURRENCY,async pageUrl=>{
    try{
      const page=await fetchText(pageUrl);
      return {ok:true,links:linksFromPage(page.text,page.url,source)};
    }catch(e){return {ok:false,error:e?.name==='AbortError'?'timeout':String(e?.message||e)}}
  });
  for(const r of results){
    if(r.ok){status.pagesChecked++;for(const u of r.links)links.add(u)}
    else errors.push(r.error);
  }
  status.linksFound=links.size;
  if(status.pagesChecked){
    status.state=links.size?'Controllata automaticamente':'Raggiunta · nessun annuncio leggibile in questa scansione';
  }
  if(errors.length)status.error=[...new Set(errors)].slice(0,3).join(' · ');
  return {source,status,links:[...links]};
}

export async function refreshItaliaCatalog(){
  const started=new Date().toISOString();
  const discovered=await mapBatches(SOURCES,SOURCE_CONCURRENCY,discoverSource);
  const sourceStatus=discovered.map(x=>x.status);
  const candidateMap=new Map();
  for(const group of discovered){
    for(const url of group.links){
      const key=url.toLowerCase();
      if(!candidateMap.has(key))candidateMap.set(key,{url,source:group.source});
    }
  }
  // Copertura equilibrata: priorità alle reti/portali diversi, non solo alla prima fonte.
  const bySource=new Map();
  for(const candidate of candidateMap.values()){
    const arr=bySource.get(candidate.source.id)||[];arr.push(candidate);bySource.set(candidate.source.id,arr);
  }
  const queue=[];let round=0;
  while(queue.length<MAX_DETAIL_FETCHES){
    let added=false;
    for(const source of SOURCES){
      const arr=bySource.get(source.id)||[];
      if(arr[round]){queue.push(arr[round]);added=true;if(queue.length>=MAX_DETAIL_FETCHES)break}
    }
    if(!added)break;round++;
  }

  const found=[];
  const detailResults=await mapBatches(queue,DETAIL_CONCURRENCY,async ({url,source})=>{
    try{
      const p=await fetchText(url),row=parseListing(p.text,p.url,source);
      if(!row.independentHouse)return null;
      if(!inEasternSicily(row.rawScopeText||''))return null;
      if(!(Number(row.price)>0&&Number(row.price)<=MAX_PRICE))return null;
      return {...row,sourceVerifiedAt:new Date().toISOString(),catalogOrigin:'live'};
    }catch{return null}
  });
  for(const row of detailResults)if(row)found.push(row);

  const seedRows=(seed.listings||[]).map(x=>({...x,catalogOrigin:'verificato'}));
  const listings=mergeListings([...found,...seedRows]);
  const sourcesWithLive=sourceStatus.filter(s=>s.linksFound>0).length;
  const sourcesReached=sourceStatus.filter(s=>s.pagesChecked>0).length;
  const payload={
    ok:true,version:2,scope:'Sicilia orientale · Mar Ionio',criteria:seed.criteria,
    refreshedAt:new Date().toISOString(),listings,sourceStatus,
    counts:{
      active:listings.length,
      automaticSources:SOURCES.length,
      manualSources:0,
      sourcesReached,
      sourcesWithLive,
      candidateLinks:candidateMap.size,
      detailChecked:queue.length,
      liveDiscovered:found.length
    },
    notice:'Scansione multi-fonte gratuita del modulo Italia. ARGUS usa solo pagine pubbliche accessibili e non aggira protezioni: se una fonte limita l’automazione, viene segnalata come temporaneamente non disponibile senza bloccare le altre fonti.'
  };
  try{await writeJson(STORE_PATH,payload)}catch(e){payload.storageWarning=String(e?.message||e)}
  return payload;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
  if(req.method==='POST'){
    try{return res.status(200).json(await refreshItaliaCatalog())}
    catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)})}
  }
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET o POST richiesto'});
  const saved=await readJsonFresh(STORE_PATH,null);
  if(saved?.version>=2&&saved?.listings?.length)return res.status(200).json(saved);
  const listings=mergeListings(seed.listings||[]);
  return res.status(200).json({
    ok:true,version:2,scope:'Sicilia orientale · Mar Ionio',criteria:seed.criteria,
    refreshedAt:seed.updatedAt,listings,
    sourceStatus:SOURCES.map(x=>({...x,detail:undefined,mode:'automatico',state:'In attesa del primo controllo',url:x.pages[0],pages:x.pages.length})),
    counts:{active:listings.length,automaticSources:SOURCES.length,manualSources:0,sourcesReached:0,sourcesWithLive:0,candidateLinks:0,detailChecked:0,liveDiscovered:0},
    notice:'Catalogo iniziale verificato. Premi “Aggiorna ora” per avviare una nuova scansione gratuita multi-fonte.'
  });
}
