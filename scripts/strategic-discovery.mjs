import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const mode=process.argv.includes('--monthly')?'monthly':'weekly';
const feeds=JSON.parse(await readFile(path.join(root,'data','strategic-discovery-feeds.json'),'utf8'));
const base=JSON.parse(await readFile(path.join(root,'data','strategic-brussels.json'),'utf8'));
const neighborhoodPath=path.join(root,'data','strategic-neighborhoods.json');
const existingNeighborhoods=JSON.parse(await readFile(neighborhoodPath,'utf8').catch(()=>JSON.stringify({districts:[]})));

const DISTRICT_WFS='https://geoservices-urbis.irisnet.be/geoserver/urbisvector/wfs?version=2.0.0&request=GetFeature&typename=urbisvector:MonitoringDistricts&outputformat=json';
const timeout=ms=>new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms));
const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const abs=(href,baseUrl)=>{try{return new URL(href,baseUrl).toString()}catch{return null}};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);

async function fetchResponse(url,accept='text/html,application/xhtml+xml,application/json'){
  return await Promise.race([
    fetch(url,{redirect:'follow',headers:{
      'user-agent':'ARGUS-Strategic-Brussels/1.1 (+https://argus-omni-live.vercel.app/strategic-brussels)',
      'accept-language':'fr-BE,fr;q=0.9,en;q=0.7','accept':accept
    }}),
    timeout(20000)
  ]);
}
async function fetchPage(url){
  const r=await fetchResponse(url);
  if(!r.ok)throw new Error('HTTP '+r.status);
  const ct=r.headers.get('content-type')||'';
  if(!/text\/html|application\/xhtml\+xml/.test(ct))throw new Error('unsupported '+ct);
  return await r.text();
}
function flattenCoordinates(value,out=[]){
  if(!Array.isArray(value))return out;
  if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){out.push([value[0],value[1]]);return out}
  for(const v of value)flattenCoordinates(v,out);
  return out;
}
function geometryCenter(geometry){
  const pts=flattenCoordinates(geometry?.coordinates||[]);
  if(!pts.length)return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of pts){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
  if(!Number.isFinite(minX)||!Number.isFinite(minY))return null;
  return {lng:(minX+maxX)/2,lat:(minY+maxY)/2};
}
function prop(obj,names){
  for(const n of names)if(obj?.[n]!=null&&String(obj[n]).trim())return obj[n];
  const entries=Object.entries(obj||{});
  for(const n of names){
    const found=entries.find(([k])=>k.toLowerCase()===n.toLowerCase());
    if(found&&String(found[1]??'').trim())return found[1];
  }
  return null;
}
async function refreshNeighborhoods(snapshot){
  try{
    const r=await fetchResponse(DISTRICT_WFS,'application/json');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const geo=await r.json();
    const districts=(geo.features||[]).map((f,i)=>{
      const p=f.properties||{};
      const id=String(prop(p,['mdzone','inspire_id','id'])??f.id??i);
      const name=clean(prop(p,['namefre','name_fr','name'])||'');
      const nameNl=clean(prop(p,['namedut','name_nl'])||'');
      if(!name)return null;
      return {id,name,nameNl,center:geometryCenter(f.geometry),areaM2:Number(prop(p,['area'])||0)||null};
    }).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
    if(!districts.length)throw new Error('empty MonitoringDistricts response');
    const registry={
      version:1,updatedAt:snapshot.generatedAt,status:'LIVE',
      source:{
        name:'Monitoring des Quartiers — IBSA / perspective.brussels / UrbIS',
        dataset:'quartiers-du-monitoring-des-quartiers-ibsa-perspective-rbc',
        referenceUrl:'https://opendata.brussels.be/explore/dataset/quartiers-du-monitoring-des-quartiers-ibsa-perspective-rbc/',
        wfsUrl:DISTRICT_WFS,modified:'2026-07-28',geographicalLevel:'neighbourhood',license:'CC0 1.0'
      },
      count:districts.length,districts
    };
    await writeFile(neighborhoodPath,JSON.stringify(registry,null,2)+'\n','utf8');
    snapshot.neighborhoodRegistry={ok:true,count:districts.length,updatedAt:snapshot.generatedAt};
    return registry;
  }catch(e){
    snapshot.neighborhoodRegistry={ok:false,count:(existingNeighborhoods.districts||[]).length,error:String(e.message||e)};
    snapshot.errors.push({feedId:'monitoring-districts',error:String(e.message||e)});
    return existingNeighborhoods;
  }
}

function classify(text){
  const lower=text.toLowerCase(),cats=[];
  for(const [cat,patterns] of Object.entries(feeds.signalPatterns||{})){
    if(patterns.some(p=>lower.includes(String(p).toLowerCase())))cats.push(cat);
  }
  let stage='ANNOUNCED',best=-1;
  const order=['ANNOUNCED','PLANNED','APPROVED','PERMITTED','UNDER_CONSTRUCTION','DELIVERED'];
  for(const [st,patterns] of Object.entries(feeds.stagePatterns||{})){
    if(patterns.some(p=>lower.includes(String(p).toLowerCase()))){
      const idx=order.indexOf(st);if(idx>best){stage=st;best=idx}
    }
  }
  return {categories:cats,stage};
}
let neighborhoodRegistry=existingNeighborhoods;
function knownArea(text){
  const t=text.toLowerCase();
  for(const z of base.zones||[]){
    const names=[z.name,...(z.microzones||[])];
    for(const n of names){if(n&&String(n).length>=4&&t.includes(String(n).toLowerCase()))return {id:z.id,name:z.name,known:true,strategic:true}}
  }
  for(const d of neighborhoodRegistry.districts||[]){
    const names=[d.name,d.nameNl].filter(Boolean);
    for(const n of names){
      if(String(n).length>=4&&t.includes(String(n).toLowerCase())){
        return {id:'monitoring:'+d.id,name:d.name,known:false,neighborhood:true,districtId:d.id,center:d.center||null};
      }
    }
  }
  const municipality=(base.municipalities||[]).find(m=>t.includes(String(m.name).toLowerCase()));
  if(municipality)return {id:null,name:municipality.name,known:false,municipality:municipality.name};
  return null;
}
function extractLinks(html,baseUrl){
  const out=[],seen=new Set(),re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const url=abs(m[1],baseUrl),text=clean(m[2]);
    if(!url||!text||text.length<4||seen.has(url))continue;
    seen.add(url);out.push({url,text});
  }
  return out.slice(0,800);
}

const snapshot={version:2,mode,generatedAt:new Date().toISOString(),feeds:[],signals:[],errors:[]};
neighborhoodRegistry=await refreshNeighborhoods(snapshot);

for(const feed of feeds.feeds||[]){
  try{
    const html=await fetchPage(feed.url);
    const body=clean(html).slice(0,300000);
    const links=extractLinks(html,feed.url);
    snapshot.feeds.push({id:feed.id,url:feed.url,ok:true,fingerprint:hash(body),links:links.length});
    for(const l of links){
      const c=classify(l.text+' '+l.url);
      if(!c.categories.length)continue;
      const area=knownArea(l.text+' '+decodeURIComponent(l.url));
      snapshot.signals.push({
        id:hash(feed.id+'|'+l.url+'|'+l.text),
        feedId:feed.id,feedName:feed.name,url:l.url,title:l.text.slice(0,220),
        categories:c.categories,stage:c.stage,area,sourcePriority:feed.priority||2,
        detectedAt:snapshot.generatedAt
      });
    }
  }catch(e){
    snapshot.feeds.push({id:feed.id,url:feed.url,ok:false,error:String(e.message||e)});
    snapshot.errors.push({feedId:feed.id,error:String(e.message||e)});
  }
}
const grouped={};
for(const s of snapshot.signals){
  const key=s.area?.id||s.area?.municipality||s.area?.name||'UNRESOLVED';
  if(!grouped[key])grouped[key]={key,area:s.area||null,signals:[],sources:new Set(),categories:new Set()};
  grouped[key].signals.push(s);grouped[key].sources.add(s.feedId);s.categories.forEach(c=>grouped[key].categories.add(c));
}
snapshot.candidates=Object.values(grouped).map(g=>({
  key:g.key,area:g.area,
  signalCount:g.signals.length,independentSources:g.sources.size,categories:[...g.categories],
  qualifiesForReview:g.key!=='UNRESOLVED'&&g.sources.size>=2&&g.categories.size>=2&&g.signals.length>=3,
  signals:g.signals.slice(0,30)
})).sort((a,b)=>Number(b.qualifiesForReview)-Number(a.qualifiesForReview)||b.independentSources-a.independentSources||b.signalCount-a.signalCount);

const outfile=path.join(root,'data','strategic-watch-snapshot.json');
await writeFile(outfile,JSON.stringify(snapshot,null,2)+'\n','utf8');
console.log(JSON.stringify({
  mode,neighborhoods:neighborhoodRegistry.count||0,feeds:snapshot.feeds.length,signals:snapshot.signals.length,
  candidates:snapshot.candidates.length,review:snapshot.candidates.filter(x=>x.qualifiesForReview).length,errors:snapshot.errors.length
}));
