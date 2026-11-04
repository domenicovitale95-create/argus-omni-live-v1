import assert from 'node:assert/strict';
import {BRUSSELS_COMMUNES,brusselsCommune,brusselsSector,brusselsGeography} from '../api/immo-brussels-zones.js';
import {BUILDING_TARGET_ZONES,buildingZone,matchesBuildingCriteria} from '../api/immo-building-criteria.js';
import {isStudioListing} from '../api/immo-property-type.js';
assert.equal(BRUSSELS_COMMUNES.length,19);
assert.equal(BUILDING_TARGET_ZONES.length,19);
assert.equal(new Set(BRUSSELS_COMMUNES.map(x=>x.name)).size,19);
assert.equal(BRUSSELS_COMMUNES.filter(x=>x.sector==='NORD').length,9);
assert.equal(BRUSSELS_COMMUNES.filter(x=>x.sector==='SUD').length,10);
for(const commune of BRUSSELS_COMMUNES){
 const row={postalCode:commune.postcodes[0],price:800000,numberOfUnits:4};
 assert.equal(brusselsCommune(row)?.name,commune.name);
 assert.equal(brusselsSector(row),commune.sector);
 assert.equal(buildingZone(row),commune.name);
 assert.equal(brusselsGeography(row).argusSector,commune.sector);
 assert.equal(matchesBuildingCriteria(row),true,'In scope: '+commune.name);
}
assert.equal(buildingZone({city:'Saint-Gilles'}),'Saint-Gilles');
assert.equal(brusselsCommune({postalCode:'75001',city:'Paris'}),null);
assert.equal(isStudioListing({type:'studio'}),true);
assert.equal(isStudioListing({title:'Studio 33m² à Ixelles'}),true);
assert.equal(isStudioListing({canonical:'https://www.immoweb.be/fr/annonce/studio/a-vendre/ixelles/1050/000'}),true);
assert.equal(isStudioListing({type:'apartment',title:'Appartement 2 chambres à Forest'}),false);
console.log('ARGUS IMMO 19 communes NORD/SUD et exclusion studios: OK');
