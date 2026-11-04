import assert from 'node:assert/strict';
import {BUILDING_MIN_PRICE,matchesBuildingCriteria} from '../api/immo-building-criteria.js';
import {BUILDING_AGENCY_SOURCES} from '../api/immo-agency-sources.js';
import {fetchSourcePage,linksFrom,evaluateEligibility} from '../api/immo-discovery-scan.js';
assert.equal(BUILDING_MIN_PRICE,0);
const building={city:'Ixelles',numberOfUnits:3};
assert.equal(matchesBuildingCriteria({...building,price:449999}),true);
assert.equal(matchesBuildingCriteria({...building,price:450000}),true);
assert.equal(evaluateEligibility({type:'building',price:2000001,surface:250},2000000,'building').reason,'OUTSIDE_PRICE_BOX');
const source=BUILDING_AGENCY_SOURCES.find(s=>s.id==='agimo-building');
const original=globalThis.fetch;
try{
 globalThis.fetch=async url=>{
  assert.equal(url.hostname,'api.agimo.be');
  assert.equal(url.searchParams.get('price_min'),'0');
  assert.equal(url.searchParams.get('price_max'),'2000000');
  assert.equal(url.searchParams.get('offset'),'100');
  assert.equal(url.searchParams.getAll('areas').length,19);
  return {ok:true,json:async()=>({items:[
   {price_eur:450000,url:'https://oralis.be/fr/estates/7924146'},
   {price_eur:2000001,url:'https://oralis.be/fr/estates/too-expensive'},
   {price_eur:700000,under_option:true,url:'https://oralis.be/fr/estates/option'},
   {price_eur:700000,url:'https://evil.invalid/private'},
   {price_eur:700000,url:'http://oralis.be/fr/estates/insecure'}
  ]})};
 };
 const page=await fetchSourcePage(source,source.url+'&page=2');
 assert.deepEqual(linksFrom(page.text,page.url,source),['https://oralis.be/fr/estates/7924146']);
 globalThis.fetch=async()=>({ok:false,status:503});
 await assert.rejects(fetchSourcePage(source,source.url),/AGIMO_HTTP_503/);
}finally{globalThis.fetch=original;}
console.log('PASS Agimo API filters, pagination, original links, host restrictions, unavailable and price exclusions');
