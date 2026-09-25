import assert from 'node:assert/strict';
import {classifyListingAvailability,isUnavailableListing,isConfirmedActiveListing} from '../api/immo-listing-scan.js';
import {buildSourcePageUrls,detectCriticalLegalRisks,linksFrom,evaluateEligibility} from '../api/immo-discovery-scan.js';

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

const pages=buildSourcePageUrls({url:'https://www.immoweb.be/fr/recherche/appartement/a-vendre/bruxelles/arrondissement?maxprice=150000',pages:6});
assert.equal(pages.length,6,'Immoweb pagination must cover all configured pages');
assert.equal(new URL(pages[0]).searchParams.get('page'),null,'First results page must stay canonical');
assert.equal(new URL(pages[5]).searchParams.get('page'),'6','Last configured Immoweb page must be scanned');

assert.deepEqual(
  detectCriticalLegalRisks({description:'Combles aménagés en infraction urbanistique et non régularisables.'}),
  ['URBANISM_INFRACTION','NON_REGULARISABLE'],
  'Critical urban-planning language must trigger an ARGUS hard stop'
);
assert.deepEqual(
  detectCriticalLegalRisks({title:'Studio à vendre',description:'Situation urbanistique conforme.'}),
  [],
  'Normal compliant listing must not receive a legal hard stop'
);

const embeddedHtml='<script>window.__DATA__={\"url\":\"\\/fr\\/annonce\\/studio\\/a-vendre\\/evere\\/1140\\/21861941?s=s_XL\"}</script>';
const embeddedLinks=linksFrom(
  embeddedHtml,
  'https://www.immoweb.be/fr/recherche/studio/a-vendre/bruxelles/arrondissement?maxprice=150000',
  {id:'immoweb-studio',url:'https://www.immoweb.be/fr/recherche/studio/a-vendre/bruxelles/arrondissement?maxprice=150000',match:/\\/fr\\/annonce\\//i}
);
assert.equal(embeddedLinks.length,1,'Immoweb hydrated JSON listing routes must be discovered');
assert.match(embeddedLinks[0],/21861941/,'Known-style Immoweb listing id must survive embedded-link extraction');

assert.ok(
  detectCriticalLegalRisks({html:'<p>Combles aménagées en infraction urbanistique et non régularisables.</p>'}).includes('NON_REGULARISABLE'),
  'Legal risks appearing only in full page HTML must still be detected'
);

assert.deepEqual(
  evaluateEligibility({availabilityStatus:'UNKNOWN',price:119000,surface:37,type:'studio'},150000,'apartment'),
  {eligible:false,review:true,reason:'ACTIVE_STATUS_UNCONFIRMED'},
  'A discovered listing with unconfirmed active status must be retained for verification'
);
assert.deepEqual(
  evaluateEligibility({availabilityStatus:'ACTIVE',price:null,surface:37,type:'studio'},150000,'apartment'),
  {eligible:false,review:true,reason:'PRICE_NOT_PARSED'},
  'A discovered listing with an unparsed price must not silently disappear'
);
assert.deepEqual(
  evaluateEligibility({availabilityStatus:'ACTIVE',price:170000,surface:37,type:'studio'},150000,'apartment'),
  {eligible:false,review:false,reason:'OUTSIDE_PRICE_BOX'},
  'A confirmed out-of-box listing may be excluded explicitly'
);

console.log(JSON.stringify({ok:true,cases:cases.length,paginationPages:pages.length,legalRiskRegression:true},null,2));
