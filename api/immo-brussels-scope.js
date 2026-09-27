const BRUSSELS_POSTAL_CODES=new Set([
  '1000','1020','1030','1040','1050','1060','1070','1080','1081','1082','1083','1090',
  '1120','1130','1140','1150','1160','1170','1180','1190','1200','1210'
]);

const BRUSSELS_NAMES=/\b(?:bruxelles|brussel|laeken|laken|schaerbeek|schaarbeek|etterbeek|ixelles|elsene|saint[- ]gilles|sint[- ]gillis|anderlecht|molenbeek(?:[- ]saint[- ]jean)?|sint[- ]jans[- ]molenbeek|koekelberg|berchem[- ]sainte[- ]agathe|sint[- ]agatha[- ]berchem|ganshoren|jette|neder[- ]over[- ]heembeek|haren|evere|woluwe[- ]saint[- ]pierre|sint[- ]pieters[- ]woluwe|auderghem|oudergem|watermael[- ]boitsfort|watermaal[- ]bosvoorde|uccle|ukkel|forest|vorst|woluwe[- ]saint[- ]lambert|sint[- ]lambrechts[- ]woluwe|saint[- ]josse(?:[- ]ten[- ]noode)?|sint[- ]joost(?:[- ]ten[- ]node)?)\b/i;

function combinedText(x={}){
  return [x.title,x.description,x.address,x.location,x.city,x.postalCode,x.canonical,x.source]
    .filter(Boolean).join(' ');
}

export function isBrusselsListing(x={}){
  const explicit=String(x.postalCode||'').trim();
  if(/^\d{4}$/.test(explicit))return BRUSSELS_POSTAL_CODES.has(explicit);

  const rawUrl=String(x.canonical||x.source||'').trim();
  if(rawUrl){
    try{
      const u=new URL(rawUrl);
      const pathCodes=(u.pathname.match(/(?:^|\/)(\d{4})(?=\/|$)/g)||[]).map(v=>v.replace(/\//g,''));
      if(pathCodes.length)return pathCodes.some(code=>BRUSSELS_POSTAL_CODES.has(code));
      if(BRUSSELS_NAMES.test(decodeURIComponent(u.pathname).replace(/[\/_]+/g,' ')))return true;
    }catch{}
  }

  const text=combinedText(x);
  const codes=text.match(/\b\d{4}\b/g)||[];
  if(codes.some(code=>BRUSSELS_POSTAL_CODES.has(code)))return true;
  return BRUSSELS_NAMES.test(text);
}

export function isStandardOutrightSale(x={}){
  const text=combinedText(x).toLowerCase().replace(/&nbsp;|&#160;/g,' ');
  if(/viager|rente\s+viag|vente\s+avec\s+rente|nue[- ]propri|usufruit|emphyt[eé]ose|droit\s+de\s+superficie|timeshare/.test(text))return false;
  if(/\+\s*[0-9][0-9 .,'’\u00a0\u202f]*\s*€\s*(?:\/\s*mois|par\s+mois)/i.test(text))return false;
  return true;
}

export {BRUSSELS_POSTAL_CODES};
