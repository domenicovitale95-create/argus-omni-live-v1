// Additional direct sources for the building acquisition search.
// Reachability and eligible listings are reported by the scanner, never assumed.
export const BUILDING_AGENCY_SOURCES = [
  {id:'revimmo-building',name:'Rêvimmo · immeubles',url:'https://revimmo.be/nos-biens-a-vendre-louer?purpose=1&region[]=5',match:/^\/propriete\/\d+-[^/?]+/i,minPathSegments:2,pages:3},
  {id:'dewaele-building',name:'Dewaele · immeubles',url:'https://www.dewaele.com/fr/a-vendre/1000-bruxelles/immeuble-de-rapport',match:/^\/fr\/a-vendre\/[^/]+\/immeuble-de-rapport\/[^/?]+/i,pages:3},
  {id:'bathim-building',name:'Bathim · immeubles',url:'https://www.bathim.be/fr/chercher-bien/a-vendre',match:/^\/(?:corporate\/)?fr\/bien\/a-vendre\/[^/]+\/[^/]+\/\d+/i,pages:3},
  {id:'bathim-corporate-building',name:'Bathim Corporate · immeubles',url:'https://www.bathim.be/corporate/fr/chercher-bien/a-vendre',match:/^\/(?:corporate\/)?fr\/bien\/a-vendre\/[^/]+\/[^/]+\/\d+/i,pages:3},
  {id:'century21-everone-building',name:'Century 21 Ever One · immeubles',url:'https://agence-immobiliere.brussels/a-vendre/',match:/^\/bien\/[^/?]+/i,minPathSegments:2,pages:3},
  {id:'engel-volkers-building',name:'Engel & Völkers Bruxelles · immeubles',url:'https://www.engelvoelkers.com/be/fr/shops/bruxelles-centre',match:/^\/be\/fr\/exposes\/[^/?]+/i},
  {id:'engel-volkers-woluwe-building',name:'Engel & Völkers Woluwe · immeubles',url:'https://www.engelvoelkers.com/be/fr/shops/woluwe',match:/^\/be\/fr\/exposes\/[^/?]+/i}
];
