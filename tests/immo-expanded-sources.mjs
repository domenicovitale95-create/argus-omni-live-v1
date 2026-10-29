import assert from 'node:assert/strict';
import {BUILDING_AGENCY_SOURCES as sources} from '../api/immo-agency-sources.js';
import {linksFrom,fetchSourcePage} from '../api/immo-discovery-scan.js';
import {hostAllowed} from '../api/immo-listing-scan.js';
assert.equal(sources.length,new Set(sources.map(s=>s.id)).size);
for(const source of sources)assert.ok(hostAllowed(new URL(source.url).hostname),source.id);
const fixtures={
 'pavimmo-building':'/fr/bien/house-saint-gilles-7919789',
 'charlesimmo-building':'/fr/a-vendre?view=detail&amp;id=637',
 'clavis-building':'/fr/a-vendre/15656/maison-unifamiliale-avec-3-appartements-te-drogenbos',
 'soinvest-building':'/elements/immeuble-mixte-haut-de-gamme',
 'fhimmobiliere-building':'/fr/bien/a-vendre/maison/1180-uccle/7903897',
 'propertyone-building':'/fr/properties/immeuble-de-rapport-14752/',
 'immoschmidt-building':'/fiche/immeuble-de-rapport/a-vendre/1060/saint-gilles/_i-29564',
 'immobpc-building':'/fr/propriete/3900/immeuble/',
 'immo20-building':'/buy/schaerbeek/immeuble/468',
 'fierce-building':'/fr/a-vendre/141125/immeuble',
 'goinvest-building':'https://www.goinvest.be/fr/annonces-immobilieres/offre/uccle/bien/1023423/immeuble.html'
};
for(const [id,path] of Object.entries(fixtures)){
 const s=sources.find(x=>x.id===id);assert.ok(s,id);
 assert.equal(linksFrom(`<a href="${path}">Voir</a>`,s.url,s).length,1,id);
 assert.equal(linksFrom('<a href="https://evil.invalid/fr/bien/test">X</a><a href="/fr/a-vendre">Liste</a>',s.url,s).length,0,id+' non-detail');
}
const calls=[],source=sources.find(s=>s.id==='fhimmobiliere-building');
const json=encodeURIComponent(JSON.stringify({PageNumber:0}));
const page=await fetchSourcePage(source,source.url+'?page=2',async url=>{calls.push(url);return calls.length===1?{url,text:`<a href="/fr/List/InfiniteScroll?json=${json}&amp;mode=list">Next</a>`}:{url,text:'cards'};});
assert.equal(page.text,'cards');assert.equal(JSON.parse(new URL(calls[1]).searchParams.get('json')).PageNumber,1);
assert.equal(new URL(calls[1]).searchParams.get('mode'),'list');
console.log('PASS expanded registry, host permissions, 11 agency routes, HTML entities, WHISE pagination');
