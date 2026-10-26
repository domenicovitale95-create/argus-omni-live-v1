// Additional direct sources for the building acquisition search.
// Reachability and eligible listings are reported by the scanner, never assumed.
export const BUILDING_AGENCY_SOURCES = [
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
  {id:'myimmo-building',name:'MYIMMO',url:'https://www.myimmo.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'homestanding-building',name:'Homestanding',url:'https://www.homestanding.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'dldproperties-building',name:'DLD Properties',url:'https://www.dldproperties.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'goinvest-building',name:'GO INVEST',url:'https://www.goinvest.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'everest-building',name:'Everest Properties',url:'https://www.everestproperties.be/fr/a-vendre',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'lamaison-building',name:'La Maison',url:'https://www.lamaison.be/fr',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'vaneau-building',name:'Vaneau Lecobel',url:'https://www.vaneau-lecobel.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'immo-rapport-building',name:'Immeuble-de-rapport.be',url:'https://immeuble-de-rapport.be',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'commerceimmo-building',name:'Commerce Immo',url:'https://www.commerceimmo.be/fr/a-vendre/immeuble-de-rapport/',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'expertissimmo-building',name:'Expertissimmo',url:'https://expertissimmo.eu/fr',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2},
  {id:'househunter-building',name:'Househunter',url:'https://househunter.immo/fr/a-vendre/bruxelles/immeuble-de-rapport',match:/(?:\/bien\/|\/listing\/|\/detail\/|\/property\/|\/a-vendre\/|\/vente\/|\/nos-biens\/)[^?#]+/i,minPathSegments:3,pages:2}
];
