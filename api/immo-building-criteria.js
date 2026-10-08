import {BRUSSELS_COMMUNES,brusselsCommune,brusselsSector} from './immo-brussels-zones.js';
export const BUILDING_MIN_PRICE=40000;
export const BUILDING_MAX_PRICE=1400000;
export const BUILDING_MIN_UNITS=3;
export const BUILDING_MAX_UNITS=99;

export const BUILDING_TARGET_ZONES=BRUSSELS_COMMUNES.map(c=>c.name);

function normalize(value=''){
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/<[^>]*>/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

function listingText(x={}){
  return normalize([
    x.title,x.description,x.location,x.address,x.exactAddress,x.city,x.postalCode,
    x.unitsText,x.canonical,x.source
  ].filter(Boolean).join(' '));
}

export function buildingZone(x={}){return brusselsCommune(x)?.name||null}

export function buildingUnitCount(x={}){
  const explicit=[x.recognizedUnits,x.unitCount,x.numberOfUnits,x.totalUnits,x.apartmentCount,x.apartments,x.logements];
  for(const value of explicit){
    const n=Number(value);
    if(Number.isFinite(n)&&n>0)return Math.round(n);
  }
  const s=listingText(x);
  const patterns=[
    /\b([1-9])\s*(?:appartements?|apartments?|logements?|unites?|units?|wooneenheden)\b/,
    /\b(?:compose|composee|comprend|comprenant|reparti|repartie|divise|divisee)\s+(?:de\s+|en\s+)?([1-9])\s*(?:appartements?|logements?|unites?)\b/,
    /\bimmeuble[^.!?]{0,80}\b([1-9])\s*(?:appartements?|logements?|unites?)\b/
  ];
  for(const re of patterns){
    const m=s.match(re);
    if(m){const n=Number(m[1]);if(Number.isFinite(n))return n;}
  }
  return null;
}

export function matchesBuildingCriteria(x={}){
  const price=Number(x.price);
  const units=buildingUnitCount(x);
  return Number.isFinite(price)
    && price>=BUILDING_MIN_PRICE
    && price<=BUILDING_MAX_PRICE
    && buildingZone(x)!==null
    && units!==null
    && units>=BUILDING_MIN_UNITS
    && units<=BUILDING_MAX_UNITS;
}

export function enrichBuildingCriteria(x={}){
  const units=buildingUnitCount(x);
  const zone=buildingZone(x);
  const explicitRecognized=Number(x.recognizedUnits);
  const evidenceText=normalize([x.title,x.description,x.unitsText,x.urbanism,x.urbanisme,x.legalStatus].filter(Boolean).join(' '));
  const recognitionEvidence=x.urbanismUnitStatus==='CONFIRMED'
    ||Boolean(x.recognizedUnitsSource)
    ||x.catalogOrigin==='curated'
    ||/\b(?:unites?|logements?|appartements?)\s+(?:urbanistiquement\s+)?(?:reconnus?|autorises?|reguliers?|regularises?)\b/.test(evidenceText)
    ||/\b(?:reconnu|autorise|regularise)\s+(?:comme|en)\s+\d+\s+(?:unites?|logements?|appartements?)\b/.test(evidenceText);
  const recognizedUnits=recognitionEvidence&&Number.isFinite(explicitRecognized)&&explicitRecognized>0?Math.round(explicitRecognized):null;
  return {
    ...x,
    // Never promote an advertised/detected unit count to a legally recognized count.
    // recognizedUnits is populated only when a source explicitly proves recognition.
    recognizedUnits,
    announcedUnits:x.announcedUnits??units,
    detectedUnits:units,
    unitsText:x.unitsText||(units?`${units} appartements annoncés`:'À confirmer'),
    urbanismUnitStatus:recognizedUnits!==null?'CONFIRMED':'TO_CONFIRM',
    argusTargetZone:zone,
    argusCommune:zone,
    argusSector:brusselsSector(x)
  };
}
