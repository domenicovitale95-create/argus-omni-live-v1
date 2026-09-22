import assert from 'node:assert/strict';
import {classifyListingAvailability,isUnavailableListing,isConfirmedActiveListing} from '../api/immo-listing-scan.js';

const cases=[
  [{title:'VENDU - Appartement 2 chambres'},'SOLD'],
  [{title:'VERKOCHT - Appartement in Brussel'},'SOLD'],
  [{title:'SOLD - Investment property'},'SOLD'],
  [{description:'Ce bien est vendu. Découvrez nos autres biens.'},'SOLD'],
  [{description:'Dit pand is verkocht.'},'SOLD'],
  [{description:'This property has been sold.'},'SOLD'],
  [{structuredAvailability:'https://schema.org/SoldOut'},'SOLD'],
  [{structuredAvailability:'https://schema.org/InStock'},'ACTIVE'],
  [{description:"Cette annonce n'est plus disponible."},'REMOVED'],
  [{description:'Sous option - visites suspendues'},'OPTION'],
  [{description:'Sous compromis'},'UNDER_CONTRACT'],
  [{title:'Appartement à vendre',description:'Le bien est vendu loué avec bail en cours.'},'ACTIVE'],
  [{title:'Immeuble de rapport à vendre',description:'Bien vendu loué, rendement locatif existant.'},'ACTIVE']
];

for(const [input,expected] of cases){
  const got=classifyListingAvailability(input);
  assert.equal(got.status,expected,JSON.stringify({input,got,expected}));
}

for(const status of ['SOLD','REMOVED','WITHDRAWN','CLOSED','OPTION','UNDER_CONTRACT']){
  assert.equal(isUnavailableListing({availabilityStatus:status}),true,status+' must be hidden');
}
for(const status of ['ACTIVE','UNKNOWN']){
  assert.equal(isUnavailableListing({availabilityStatus:status}),false,status+' is not an explicit unavailable state');
}
assert.equal(isConfirmedActiveListing({availabilityStatus:'ACTIVE'}),true,'ACTIVE must be displayable');
for(const status of ['SOLD','REMOVED','WITHDRAWN','CLOSED','OPTION','UNDER_CONTRACT','UNKNOWN','UNVERIFIED']){
  assert.equal(isConfirmedActiveListing({availabilityStatus:status}),false,status+' must never be displayable as confirmed active');
}

console.log(JSON.stringify({ok:true,cases:cases.length},null,2));
