const BRUSSELS_POSTCODES=new Set(['1000','1020','1030','1040','1050','1060','1070','1080','1081','1082','1083','1090','1120','1130','1140','1150','1160','1170','1180','1190','1200','1210']);

const BRUSSELS_NAMES=[
  'bruxelles','brussel','laeken','laken','haren','neder-over-heembeek','neder over heembeek',
  'schaerbeek','schaarbeek','etterbeek','ixelles','elsene','saint-gilles','sint-gillis',
  'anderlecht','molenbeek-saint-jean','sint-jans-molenbeek','molenbeek','koekelberg',
  'berchem-sainte-agathe','sint-agatha-berchem','ganshoren','jette','evere',
  'woluwe-saint-pierre','sint-pieters-woluwe','auderghem','oudergem','watermael-boitsfort',
  'watermaal-bosvoorde','uccle','ukkel','forest','vorst','woluwe-saint-lambert',
  'sint-lambrechts-woluwe','saint-josse-ten-noode','sint-joost-ten-node','saint-josse','sint-joost'
];

function normalize(value=''){
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

export function isBrusselsListing(x={},url=''){
  const postal=String(x.postalCode||'').trim();
  if(/^\d{4}$/.test(postal))return BRUSSELS_POSTCODES.has(postal);

  const canonical=String(url||x.canonical||x.source||'');
  try{
    const path=new URL(canonical).pathname;
    const segments=path.split('/').filter(Boolean);
    const postcodes=segments.filter(s=>/^\d{4}$/.test(s));
    if(postcodes.length)return postcodes.some(pc=>BRUSSELS_POSTCODES.has(pc));
  }catch{}

  const hay=normalize([x.city,x.location,x.address,x.title,x.description,canonical].filter(Boolean).join(' '));
  if(BRUSSELS_NAMES.some(name=>hay.includes(normalize(name))))return true;

  const addressMatch=hay.match(/(?:adresse|address|adres)\s*[:\-]?[^\n]{0,120}?\b(\d{4})\b/);
  if(addressMatch)return BRUSSELS_POSTCODES.has(addressMatch[1]);
  return false;
}

export function hasDeferredPriceStructure(x={}){
  const hay=normalize([x.title,x.description].filter(Boolean).join(' '));
  return /\bviager\b|\brente\b|\blijfrente\b|\bnue[- ]propri|\busufruit\b|\bvruchtgebruik\b|\bemphyteose\b|\bdroit de superficie\b|\btimeshare\b/.test(hay)
    || /\+\s*[0-9][0-9 .,'’]*\s*€\s*\/\s*(?:mois|month|maand)/.test(hay);
}

export function brusselsPostcodes(){return [...BRUSSELS_POSTCODES]}
