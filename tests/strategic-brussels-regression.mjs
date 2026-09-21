import assert from 'node:assert/strict';
import data from '../data/strategic-brussels.json' with { type: 'json' };
import neighborhoods from '../data/strategic-neighborhoods.json' with { type: 'json' };
import {PROJECT_STAGE_SCORE,rankZones,topOpportunityBuckets,derivedIndicators,deriveMarketScores,completeness} from '../lib/strategic-brussels.js';

assert.equal(data.municipalities.length,19,'Strategic Brussels must cover all 19 municipalities');
assert.equal(new Set(data.municipalities.map(x=>x.name)).size,19,'Municipality names must be unique');
assert.ok(neighborhoods.source?.wfsUrl,'Official Monitoring neighbourhood registry needs a WFS source');
assert.equal(neighborhoods.source?.geographicalLevel,'neighbourhood');

const sourceMap=new Map((data.sources||[]).map(s=>[s.id,s]));
for(const s of data.sources||[]){
  assert.ok(s.url,'Every source needs a URL');
  assert.ok(s.date,'Every source needs a date/last-update field');
  assert.ok(s.geographicalLevel,'Every source needs a geographical level');
}
for(const z of data.zones||[]){
  assert.ok(z.id&&z.name,'Every zone needs id/name');
  assert.ok(Array.isArray(z.communes)&&z.communes.length,'Every zone needs a commune');
  assert.ok(Array.isArray(z.microzones)&&z.microzones.length,'Every strategic zone must resolve below commune level');
  assert.ok(z.center&&Number.isFinite(z.center.lat)&&Number.isFinite(z.center.lng),'Every zone needs map coordinates');
  assert.equal(z.derived,undefined,'Derived Urban Upside must never be hardcoded in source data');
  for(const p of z.projects||[])assert.ok(PROJECT_STAGE_SCORE[p.stage]!=null,'Unknown project stage '+p.stage);
  for(const id of z.sourceIds||[])assert.ok(sourceMap.has(id),'Missing source '+id+' for '+z.id);
}
const defense=data.zones.find(z=>z.id==='bordet-defense');
assert.ok(defense?.excludedCatalysts?.some(x=>/Metro 3/i.test(x)),'Bordet must exclude unconfirmed Metro 3 as an automatic catalyst');
const core=data.zones.find(z=>z.id==='european-core');
assert.equal(core?.status,'REFERENCE_ONLY','European Core must remain a benchmark, not a catch-up candidate');
const josaphat=data.zones.find(z=>z.id==='josaphat');
assert.ok(josaphat?.projects?.some(p=>p.stage==='PLANNED'),'Josaphat must keep its lower execution stage');
const missingMomentum=deriveMarketScores(josaphat,{regionAskingPricePerM2:data.methodology.marketBenchmark.regionAskingPricePerM2});
assert.equal(missingMomentum.priceMomentum,undefined,'Null momentum must remain missing, never become a neutral 50');
assert.ok(completeness(josaphat,{regionAskingPricePerM2:data.methodology.marketBenchmark.regionAskingPricePerM2})<100,'Missing 1/3/5-year momentum must reduce data completeness');

const benchmarks={regionAskingPricePerM2:data.methodology.marketBenchmark.regionAskingPricePerM2};
const ranked=rankZones(data.zones,benchmarks);
assert.equal(ranked.length,data.zones.length);
for(const z of ranked){
  const d=derivedIndicators(z,benchmarks);
  for(const [k,v] of Object.entries(d))assert.ok(Number.isFinite(v)&&v>=0&&v<=100,z.id+' '+k+' must be 0..100');
}
const nonRef=ranked.filter(z=>z.status!=='REFERENCE_ONLY');
assert.ok(nonRef.every((z,i,a)=>i===0||a[i-1].derived.urbanUpside>=z.derived.urbanUpside),'Rank must be dynamic descending');
const tops=topOpportunityBuckets(data.zones,benchmarks);
for(const [k,v] of Object.entries(tops))assert.ok(v?.id,'Top bucket '+k+' must resolve dynamically');

console.log(JSON.stringify({
  ok:true,
  municipalities:data.municipalities.length,
  zones:data.zones.length,
  leader:nonRef[0]?.id,
  leaderScore:nonRef[0]?.derived?.urbanUpside,
  core:core?.id
},null,2));
