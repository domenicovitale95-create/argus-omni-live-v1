import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const data=JSON.parse(read('data/immo-contactes.json'));
assert.equal(data.properties.length,31,'All 31 PDF dossiers must remain visible, including closed and secondary records');
assert.equal(new Set(data.properties.map(p=>p.id)).size,31);
for(const p of data.properties){
  for(const field of ['title','contactName','responseSummary','composition','urbanism','technical','occupancy'])assert.ok(p[field],`${p.id}: missing ${field}`);
  assert.ok(p.links.length,`${p.id}: missing provenance`);
  for(const url of p.photos)assert.equal(new URL(url).protocol,'https:');
  for(const field of ['documents','history','criteriaNotes','links','photos'])assert.ok(Array.isArray(p[field]));
}
const byId=id=>data.properties.find(p=>p.id===id);
assert.equal(byId('contact-09').marketStatus,'option');
assert.equal(byId('contact-04').unitsAnnounced,1,'Couronne 276 must not be treated as a recognized apartment block');
assert.equal(byId('contact-14').price,1150000);
assert.equal(byId('contact-05').price,795000);
assert.equal(byId('contact-23').marketStatus,'sold');
assert.match(byId('contact-12').urbanism,/Trois unités reconnues mais quatre loyers/);
assert.match(byId('contact-13').urbanism,/interdiction/);

// Exercise the real loading, filtering, sorting and escaped rendering code.
const nodes=new Map();
function element(){return {value:'',innerHTML:'',textContent:'',disabled:false,handlers:{},dataset:{},addEventListener(type,fn){this.handlers[type]=fn;},querySelector(){return element();}};}
for(const id of ['stats','query','commune','status-filter','sort','list','status','filters','reset','photo-close','photo-viewer','photo-prev','photo-next','export'])nodes.set(id,element());
nodes.get('sort').value='source';
const context={console,Intl,URL,Blob,setTimeout,clearTimeout,Date,location:{origin:'https://argus-omni-live.vercel.app',hash:''},document:{getElementById:id=>nodes.get(id),addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}},fetch:async()=>({ok:true,json:async()=>data})};
vm.runInNewContext(read('immo-contactes.js'),context);
await new Promise(resolve=>setTimeout(resolve,0));
assert.match(nodes.get('status').textContent,/31 biens affichés sur 31/);
nodes.get('query').value='charité';nodes.get('query').handlers.input();
assert.match(nodes.get('status').textContent,/1 bien affiché/);
assert.match(nodes.get('list').innerHTML,/Rue de la Charité 6/);
nodes.get('query').value='';nodes.get('status-filter').value='option';nodes.get('status-filter').handlers.change();
assert.match(nodes.get('status').textContent,/2 biens affichés/);
assert.match(nodes.get('list').innerHTML,/Rue au Bois 77/);
nodes.get('status-filter').value='';nodes.get('commune').value='Uccle';nodes.get('commune').handlers.change();
assert.match(nodes.get('status').textContent,/5 biens affichés/);
nodes.get('commune').value='';nodes.get('query').value='<img src=x onerror=alert(1)>';nodes.get('query').handlers.input();
assert.match(nodes.get('list').innerHTML,/Aucun bien/);
for(const path of ['immo-opportunities.html','immo-proposition-2.html','immo-biens-a-appeler.html','immo-documents.html','immo-reseau.html'])assert.ok(read(path).includes('href="/immo-contactes"'),path+' must expose the new tab');
assert.match(read('immo-contactes.html'),/href="\/immo-contactes" aria-current="page"/);
console.log('PASS: 31 dossiers, evidence gates, updated prices/status, real filtering, search, navigation and safe rendering');
