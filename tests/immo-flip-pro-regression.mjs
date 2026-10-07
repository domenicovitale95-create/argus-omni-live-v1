import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page=await readFile(new URL('../immo-flip-pro.html',import.meta.url),'utf8');
const engine=await readFile(new URL('../api/immo-flip-engine.js',import.meta.url),'utf8');
const comps=await readFile(new URL('../api/immo-exit-comps.js',import.meta.url),'utf8');
const bench=await readFile(new URL('../api/immo-market-benchmarks.js',import.meta.url),'utf8');

assert.match(page,/LOT-LEVEL UNDERWRITING/,'Flip Pro must remain lot-level');
assert.match(page,/id="lotRows"/,'Lot matrix missing');
assert.match(page,/gateUnits/,'Legal gates missing');
assert.match(page,/analyzeAll/,'Lot comparable analyzer missing');
assert.match(page,/taxOverride/,'Validated tax override missing');
assert.match(page,/taxRefund/,'Validated tax refund missing');
assert.match(page,/localStorage/,'Visit dossier persistence missing');
assert.match(page,/portfolioKey/,'Multi-deal visit portfolio missing');
assert.match(page,/priceConservative/,'Stress-derived conservative price missing');
assert.match(page,/priceTarget/,'Prudent target price missing');
assert.match(page,/regionalDocs/,'Regional due-diligence checklist missing');
assert.match(page,/0 € de rénovation/,'No-renovation strategy must be explicit');

assert.doesNotMatch(engine,/ZONE_ARV/,'Synthetic commune ARV bands must never return');
assert.match(engine,/valuationRequired:true/,'Prescreen must require lot valuation');
assert.match(engine,/profit:null/,'Prescreen must not invent profit');
assert.match(engine,/maxPurchase:null/,'Prescreen must not invent max purchase');

assert.match(comps,/qualityScore/,'Comparable quality score missing');
assert.match(comps,/outliersRemoved/,'Outlier filtering missing');
assert.match(comps,/autoValue/,'Automatic valuation gate missing');
assert.match(comps,/excludeOccupied/,'Occupied-sale filtering missing');

assert.match(bench,/FLANDERS/,'Flanders market/tax configuration missing');
assert.match(bench,/WALLONIA/,'Wallonia market/tax configuration missing');
assert.match(bench,/Knokke-Heist/,'Outside-Brussels premium market missing');
assert.match(bench,/Waterloo/,'Outside-Brussels Wallonia market missing');

console.log('ARGUS FLIP PRO regression: OK');
