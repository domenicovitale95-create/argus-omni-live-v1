// Regroupement ARGUS NORD / SUD : outil de prospection, pas division administrative officielle.
export const BRUSSELS_COMMUNES=[
  {
    "name": "Bruxelles-Ville",
    "sector": "NORD",
    "slug": "bruxelles",
    "postcodes": [
      "1000",
      "1020",
      "1120",
      "1130"
    ],
    "aliases": [
      "bruxelles ville",
      "ville de bruxelles",
      "bruxelles",
      "brussel",
      "laeken",
      "laken",
      "haren",
      "neder over heembeek"
    ]
  },
  {
    "name": "Schaerbeek",
    "sector": "NORD",
    "slug": "schaerbeek",
    "postcodes": [
      "1030"
    ],
    "aliases": [
      "schaerbeek",
      "schaarbeek"
    ]
  },
  {
    "name": "Evere",
    "sector": "NORD",
    "slug": "evere",
    "postcodes": [
      "1140"
    ],
    "aliases": [
      "evere"
    ]
  },
  {
    "name": "Molenbeek-Saint-Jean",
    "sector": "NORD",
    "slug": "molenbeek-saint-jean",
    "postcodes": [
      "1080"
    ],
    "aliases": [
      "molenbeek saint jean",
      "sint jans molenbeek",
      "molenbeek"
    ]
  },
  {
    "name": "Jette",
    "sector": "NORD",
    "slug": "jette",
    "postcodes": [
      "1090"
    ],
    "aliases": [
      "jette"
    ]
  },
  {
    "name": "Ganshoren",
    "sector": "NORD",
    "slug": "ganshoren",
    "postcodes": [
      "1083"
    ],
    "aliases": [
      "ganshoren"
    ]
  },
  {
    "name": "Koekelberg",
    "sector": "NORD",
    "slug": "koekelberg",
    "postcodes": [
      "1081"
    ],
    "aliases": [
      "koekelberg"
    ]
  },
  {
    "name": "Berchem-Sainte-Agathe",
    "sector": "NORD",
    "slug": "berchem-ste-agathe",
    "postcodes": [
      "1082"
    ],
    "aliases": [
      "berchem sainte agathe",
      "sint agatha berchem"
    ]
  },
  {
    "name": "Saint-Josse-ten-Noode",
    "sector": "NORD",
    "slug": "st-josse-ten-noode",
    "postcodes": [
      "1210"
    ],
    "aliases": [
      "saint josse ten noode",
      "saint josse",
      "sint joost ten node",
      "sint joost"
    ]
  },
  {
    "name": "Anderlecht",
    "sector": "SUD",
    "slug": "anderlecht",
    "postcodes": [
      "1070"
    ],
    "aliases": [
      "anderlecht"
    ]
  },
  {
    "name": "Ixelles",
    "sector": "SUD",
    "slug": "ixelles",
    "postcodes": [
      "1050"
    ],
    "aliases": [
      "ixelles",
      "elsene"
    ]
  },
  {
    "name": "Etterbeek",
    "sector": "SUD",
    "slug": "etterbeek",
    "postcodes": [
      "1040"
    ],
    "aliases": [
      "etterbeek"
    ]
  },
  {
    "name": "Saint-Gilles",
    "sector": "SUD",
    "slug": "saint-gilles",
    "postcodes": [
      "1060"
    ],
    "aliases": [
      "saint gilles",
      "sint gillis"
    ]
  },
  {
    "name": "Forest",
    "sector": "SUD",
    "slug": "forest",
    "postcodes": [
      "1190"
    ],
    "aliases": [
      "forest",
      "vorst"
    ]
  },
  {
    "name": "Uccle",
    "sector": "SUD",
    "slug": "uccle",
    "postcodes": [
      "1180"
    ],
    "aliases": [
      "uccle",
      "ukkel"
    ]
  },
  {
    "name": "Watermael-Boitsfort",
    "sector": "SUD",
    "slug": "watermael-boitsfort",
    "postcodes": [
      "1170"
    ],
    "aliases": [
      "watermael boitsfort",
      "watermaal bosvoorde",
      "watermael"
    ]
  },
  {
    "name": "Auderghem",
    "sector": "SUD",
    "slug": "auderghem",
    "postcodes": [
      "1160"
    ],
    "aliases": [
      "auderghem",
      "oudergem"
    ]
  },
  {
    "name": "Woluwe-Saint-Lambert",
    "sector": "SUD",
    "slug": "woluwe-saint-lambert",
    "postcodes": [
      "1200"
    ],
    "aliases": [
      "woluwe saint lambert",
      "sint lambrechts woluwe"
    ]
  },
  {
    "name": "Woluwe-Saint-Pierre",
    "sector": "SUD",
    "slug": "woluwe-saint-pierre",
    "postcodes": [
      "1150"
    ],
    "aliases": [
      "woluwe saint pierre",
      "sint pieters woluwe"
    ]
  }
];
const normal=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const byPostcode=new Map(BRUSSELS_COMMUNES.flatMap(c=>c.postcodes.map(p=>[p,c])));
const aliases=BRUSSELS_COMMUNES.flatMap(c=>[c.name,...c.aliases].map(value=>({value:normal(value),commune:c}))).sort((a,b)=>b.value.length-a.value.length);
function fromName(value){const s=' '+normal(value)+' ';if(s.trim()==='')return null;for(const a of aliases)if(s.includes(' '+a.value+' '))return a.commune;return null}
export function brusselsCommune(x={}){
 const direct=String(x.postalCode||'').trim();if(/^\d{4}$/.test(direct))return byPostcode.get(direct)||null;
 for(const value of [x.address,x.location,x.exactAddress,x.city,x.canonical,x.source]){const codes=String(value||'').match(/\b\d{4}\b/g)||[];for(const code of codes)if(byPostcode.has(code))return byPostcode.get(code)}
 for(const value of [x.city,x.location,x.address,x.exactAddress,x.canonical,x.source,x.title]){const found=fromName(value);if(found)return found}
 return null;
}
export const brusselsSector=x=>brusselsCommune(x)?.sector||null;
export function brusselsGeography(x={}){const commune=brusselsCommune(x);return {...x,argusCommune:commune?.name||null,argusSector:commune?.sector||null}}
