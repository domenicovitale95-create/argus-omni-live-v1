
// Direct agency catalogues: links verified against the agencies’ public routes.
export const EXTENDED_BUILDING_SOURCES = [
  {id:'fierce-building',name:'Fierce Immo',url:'https://www.fierceimmo.com/fr/a-vendre',match:/^\/fr\/a-vendre\/\d+\//i,minPathSegments:2,pages:3},
  {id:'immo20-building',name:'Immo 2.0',url:'https://immo2-0.com/buy',match:/^\/buy\/[^?]+\/\d+/i,minPathSegments:2,pages:3},
  {id:'immobpc-building',name:'Immo BPC',url:'https://immobpc.be/fr/a-vendre/',match:/^\/fr\/propriete\/\d+\//i,minPathSegments:2,pages:3},
  {id:'sothebys-building',name:'Belgium Sotheby’s Realty',url:'https://sothebysrealty.be/fr/immobilier/a-vendre/',match:/^\/fr\/(?:propriete|property|immobilier)\/[^?]+/i,minPathSegments:2,pages:3},
  {id:'century21-network-building',name:'Century 21 · réseau',url:'https://www.century21.be/fr/a-vendre',match:/^\/fr\/(?:properiete|propriete|proprietes)\/a-vendre\/[^?]+/i,minPathSegments:2,pages:3},
  {id:'weinvest-network-building',name:'We Invest · réseau',url:'https://weinvest.be/fr-BE/properties/for-sale',match:/^\/fr-be\/property\/for-sale\/[^\/]+\/[^\/]+\/\d+/i,minPathSegments:2,pages:3},
  {id:'victoire-building',name:'Victoire Junot',url:'https://victoire.be/fr/a-vendre/all/1?sort=price-asc&view=list',match:/^\/fr\/(?:bien|property|a-vendre)\/(?!all(?:\/|$))[^?]+/i,minPathSegments:2,pages:3},
  {id:'properstar-building',name:'Properstar · immeubles',url:'https://www.properstar.be/belgique/bruxelles/acheter/immeuble',match:/^\/annonce\/\d+/i,minPathSegments:2,pages:3},
  {id:'barnes-international-building',name:'Barnes International · Uccle',url:'https://www.barnes-international.com/fr/vente/belgique/uccle/',match:/^\/fr\/vente\/[^?]+\/ref-[^?]+\.html/i,minPathSegments:2,pages:3},
  {id:'realo-building',name:'Realo · immeubles',url:'https://www.realo.be/fr/search/a-vendre/bruxelles-1000',match:/^\/fr\/[^?]+\/\d+/i,minPathSegments:2,pages:3},

  {id:'pavimmo-building',name:'Pavimmo',url:'https://pavimmo.be/fr/biens?transaction=sale',match:/^\/fr\/bien\/[^\/?]+/i,minPathSegments:2,pages:3},
  {id:'charlesimmo-building',name:'Charles Immo',url:'https://www.charlesimmo.be/fr/a-vendre',match:/^\/fr\/(?:component\/properties\/|a-vendre)\?(?=[^#]*\bid=\d+)(?=[^#]*\bview=detail)/i,minPathSegments:2,pages:3},
  {id:'soinvest-building',name:'So Invest',url:'https://www.soinvest.be/elements',allowedHosts:['en.soinvest.be','nl.soinvest.be'],match:/^\/elements\/[^\/?]+/i,minPathSegments:2,pages:3},
  {id:'propertyone-building',name:'Property One',url:'https://propertyone.be/fr/properties/',match:/^\/fr\/properties\/[^\/?]+/i,minPathSegments:2,pages:3},
  {id:'espaceimmobrussels-building',name:'Espace Immo Brussels',url:'https://www.espaceimmobrussels.be/fr/nos-biens/a-vendre/',match:/^\/fr\/nos-biens\/a-vendre\/[^\/]+\/[^\/]+\/\d+/i,minPathSegments:2,pages:3},
  {id:'findimmo-building',cms:'whise',name:'Find Immo',url:'https://www.findimmo.be/fr/2/chercher-bien/a-vendre',match:/^\/fr\/bien\/a-vendre\/[^\/]+\/[^\/]+\/\d+/i,minPathSegments:2,pages:3},
  {id:'fhimmobiliere-building',cms:'whise',name:'FH Immobilière',url:'https://www.fhimmobiliere.be/fr/2/chercher-bien/a-vendre',match:/^\/fr\/bien\/a-vendre\/[^\/]+\/[^\/]+\/\d+/i,minPathSegments:2,pages:3},
  {id:'barnes-brussels-building',name:'Barnes Brussels',url:'https://barnes-brussels.com/acheter/',match:/^\/(?:bien|property)\/[^\/?]+/i,minPathSegments:2,pages:3},
  {id:'directimmo-building',cms:'whise',name:'Direct Immo',url:'https://www.direct-immo.be/fr/2/chercher-bien/a-vendre',match:/^\/fr\/bien\/a-vendre\/[^\/]+\/[^\/]+\/\d+/i,minPathSegments:2,pages:3},
  {id:'balcaen-building',cms:'whise',name:'Immo Balcaen',url:'https://www.immobalcaen.be/',match:/^\/fr\/bien\/a-vendre\/[^\/]+\/[^\/]+\/\d+/i,minPathSegments:2,pages:3},
  {id:'clavis-building',name:'Clavis Immo',url:'https://www.clavisimmo.be/fr/a-vendre',match:/^\/fr\/(?:a-vendre\/\d+\/|component\/properties\/?\?(?=[^#]*\bid=\d+)(?=[^#]*\bview=detail))/i,minPathSegments:2,pages:3},
  {id:'immoschmidt-building',name:'Immo Schmidt',url:'https://www.immoschmidt.be/ventes-belgique',match:/^\/fiche\/[^?]+/i,minPathSegments:2,pages:3},
];

// Additional direct sources for the building acquisition search.
// Reachability and eligible listings are reported by the scanner, never assumed.
export const BUILDING_AGENCY_SOURCES = [
  ...EXTENDED_BUILDING_SOURCES,
  {id:'revimmo-building',name:'Rêvimmo · immeubles',url:'https://revimmo.be/nos-biens-a-vendre-louer?purpose=1&region[]=5',match:/^\/propriete\/\d+-[^/?]+/i,minPathSegments:2,pages:3},
  {id:'dewaele-building',name:'Dewaele · immeubles',url:'https://www.dewaele.com/fr/a-vendre/1000-bruxelles/immeuble-de-rapport',match:/^\/fr\/a-vendre\/[^/]+\/immeuble-de-rapport\/[^/?]+/i,pages:3},
  {id:'bathim-building',name:'Bathim · immeubles',url:'https://www.bathim.be/fr/chercher-bien/a-vendre',match:/^\/(?:corporate\/)?fr\/bien\/a-vendre\/[^/]+\/[^/]+\/\d+/i,pages:3},
  {id:'bathim-corporate-building',name:'Bathim Corporate · immeubles',url:'https://www.bathim.be/corporate/fr/chercher-bien/a-vendre',match:/^\/(?:corporate\/)?fr\/bien\/a-vendre\/[^/]+\/[^/]+\/\d+/i,pages:3},
  {id:'century21-everone-building',name:'Century 21 Ever One · immeubles',url:'https://agence-immobiliere.brussels/a-vendre/',match:/^\/bien\/[^/?]+/i,minPathSegments:2,pages:3},
  {id:'engel-volkers-building',name:'Engel & Völkers Bruxelles · immeubles',url:'https://www.engelvoelkers.com/be/fr/shops/bruxelles-centre',match:/^\/be\/fr\/exposes\/[^/?]+/i},
  {id:'engel-volkers-woluwe-building',name:'Engel & Völkers Woluwe · immeubles',url:'https://www.engelvoelkers.com/be/fr/shops/woluwe',match:/^\/be\/fr\/exposes\/[^/?]+/i},
  {id:'latour-petit-building',name:'Latour & Petit',url:'https://latouretpetit.be/nos-biens/vente',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'trevi-building',name:'TREVI',url:'https://www.trevi.be/fr/acheter',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'macnash-building',name:'Macnash',url:'https://www.macnash.com/fr',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'myimmo-building',name:'MYIMMO',url:'https://www.myimmo.be/vente/',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'homestanding-building',name:'Homestanding',url:'https://www.homestanding.be/a-vendre/',match:/^\/propertypostname\/[^/?]+/i,minPathSegments:2,pages:3},
  {id:'dldproperties-building',name:'DLD Properties',url:'https://www.dldproperties.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:2,pages:2},
  {id:'goinvest-building',name:'GO INVEST',url:'https://www.go-investuccle.be/',allowedHosts:['goinvest.be'],match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'everest-building',name:'Everest Properties',url:'https://www.everestproperties.be/fr/a-vendre',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'lamaison-building',name:'La Maison',url:'https://www.lamaison.be/fr',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'vaneau-building',name:'Vaneau Lecobel',url:'https://www.vaneau-lecobel.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'immo-rapport-building',name:'Immeuble-de-rapport.be',url:'https://immeuble-de-rapport.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'commerceimmo-building',name:'Commerce Immo',url:'https://www.commerceimmo.be/fr/a-vendre/immeuble-de-rapport/',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'expertissimmo-building',name:'Expertissimmo',url:'https://expertissimmo.eu/fr/biens-a-vendre',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'househunter-building',name:'Househunter',url:'https://househunter.immo/fr/a-vendre/bruxelles/immeuble-de-rapport',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2}
];
