import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const mode=process.argv.includes('--monthly')?'monthly':'weekly';
const feeds=JSON.parse(await readFile(path.join(root,'data','strategic-discovery-feeds.json'),'utf8'));
const base=JSON.parse(await readFile(path.join(root,'data','strategic-brussels.json'),'utf8'));

const timeout=ms=>new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms));
const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const abs=(href,baseUrl)=>{try{return new URL(href,baseUrl).toString()}catch{return null}};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);

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
function knownArea(text){
  const t=text.toLowerCase();
  for(const z of base.zones||[]){
    const names=[z.name,...(z.microzones||[]),...(z.communes||[])];
    for(const n of names){if(n&&t.includes(String(n).toLowerCase()))return {id:z.id,name:z.name,known:true}}
  }
  const municipality=(base.municipalities||[]).find(m=>t.includes(String(m.name).toLowerCase()));
  if(municipality)return {id:null,name:municipality.name,known:false,municipality:municipality.name};
  return null;
}
async function fetchPage(url){
  const r=await Promise.race([
    fetch(url,{redirect:'follow',headers:{'user-agent':'ARGUS-Strategic-Brussels/1.0 (+https://argus-omni-live.vercel.app/strategic-brussels)','accept-language':'fr-BE,fr;q=0.9,en;q=0.7'}}),
    timeout(15000)
  ]);
  if(!r.ok)throw new Error('HTTP '+r.status);
  const ct=r.headers.get('content-type')||'';
  if(!/text\/html|application\/xhtml\+xml/.test(ct))throw new Error('unsupported '+ct);
  return await r.text();
}
function extractLinks(html,baseUrl){
  const out=[],seen=new Set(),re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const url=abs(m[1],baseUrl),text=clean(m[2]);
    if(!url||!text||text.length<4||seen.has(url))continue;
    seen.add(url);out.push({url,text});
  }
  return out.slice(0,500);
}
const snapshot={version:1,mode,generatedAt:new Date().toISOString(),feeds:[],signals:[],errors:[]};
for(const feed of feeds.feeds||[]){
  try{
    const html=await fetchPage(feed.url);
    const body=clean(html).slice(0,250000);
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
  signals:g.signals.slice(0,20)
})).sort((a,b)=>Number(b.qualifiesForReview)-Number(a.qualifiesForReview)||b.signalCount-a.signalCount);

const outfile=path.join(root,'data','strategic-watch-snapshot.json');
await writeFile(outfile,JSON.stringify(snapshot,null,2)+'\n','utf8');
console.log(JSON.stringify({mode,feeds:snapshot.feeds.length,signals:snapshot.signals.length,candidates:snapshot.candidates.length,review:snapshot.candidates.filter(x=>x.qualifiesForReview).length,errors:snapshot.errors.length}));
