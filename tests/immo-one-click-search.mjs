import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {linksFrom} from '../api/immo-discovery-scan.js';
import {BUILDING_AGENCY_SOURCES} from '../api/immo-agency-sources.js';
const source=BUILDING_AGENCY_SOURCES.find(s=>s.id==='dldproperties-building');
assert.deepEqual(linksFrom('<a href="/listing/messidor-maison-de-rapport-3-unites-r-u-ok/">Bien</a>',source.url,source),['https://www.dldproperties.be/listing/messidor-maison-de-rapport-3-unites-r-u-ok/']);
function element(){return {value:'',textContent:'',innerHTML:'',disabled:false,addEventListener(){},setAttribute(){},append(){},insertAdjacentElement(){},insertAdjacentHTML(){}}}
const elements=new Map(['list','reload','status','commune','query','sort','filters'].map(k=>[k,element()]));
const requests=[];let fail=false;let finishSearch;
const context={document:{getElementById:id=>elements.get(id),createElement:()=>element(),querySelectorAll:()=>[]},location:{pathname:'/immo-opportunities'},window:{},IntersectionObserver:class{observe(){}unobserve(){}},URL,AbortSignal,setInterval,clearInterval,Intl,Date,console,fetch:async(url,options)=>{
requests.push({url,options});
if(options?.method==='POST'){await new Promise(resolve=>{finishSearch=resolve});if(fail)throw Error('offline');return {ok:true,json:async()=>({ok:true,categories:[{category:'building',counts:{newlyDiscovered:2,changedThisRun:1},coverage:{sourcesReached:3,sourcesConfigured:5,complete:false}}]})}}
return {ok:true,json:async()=>({ok:true,ready:true,listings:[]})};
}};
vm.runInNewContext(readFileSync(new URL('../immo-simple.js',import.meta.url),'utf8'),context);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,1);assert.equal(requests[0].options.method,undefined);
const button=elements.get('reload');assert.equal(button.textContent,'RECHERCHER PARTOUT');
const pending=button.onclick();assert.equal(button.disabled,true);await button.onclick();assert.equal(requests.length,2,'double click must not start another scan');
finishSearch();await pending;assert.equal(requests.length,3,'successful scan must reload catalog');assert.equal(button.disabled,false);
fail=true;const retry=button.onclick();finishSearch();await retry;assert.equal(button.disabled,false);assert.equal(requests.length,4,'failed scan preserves catalog');
console.log('PASS: initial read, real scan, duplicate suppression, reload, retry, DLD discovery');
