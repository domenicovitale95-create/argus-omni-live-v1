export const LARGE_COPRO_THRESHOLD=20;

function finiteNumber(v){
  if(v===null||v===undefined||String(v).trim()==='')return null;
  const cleaned=String(v).replace(/[^0-9.,-]/g,'').replace(',','.');
  const n=Number(cleaned);
  return Number.isFinite(n)?n:null;
}

function normalizedText(x={}){
  const raw=[
    x.title,x.description,x.location,x.address,x.city,x.copropriete,x.copropriété,
    x.coOwnership,x.buildingInfo,x.unitsText,x.urbanism,x.urbanisme,x.legalStatus,
    x.condition,x.state,x.habitability,x.permit,x.permitStatus,x.unitStatus,
    x.canonical,x.source,x.url,x.listingUrl,x.provider,x.platform,x.saleType,x.priceType,
    ...(Array.isArray(x.risks)?x.risks:[]),
    ...(Array.isArray(x.criticalLegalRisks)?x.criticalLegalRisks:[])
  ].filter(Boolean).join(' ');
  return String(raw)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/<[^>]*>/g,' ')
    .replace(/\s+/g,' ')
    .toLowerCase();
}

export function detectedCoproUnits(x={}){
  const explicit=[
    x.coproUnits,x.coOwnershipUnits,x.coproprieteUnits,x.copropriétéUnits,
    x.totalUnits,x.unitCount,x.numberOfUnits,x.totalLots,x.lotCount,x.numberOfLots
  ];
  for(const value of explicit){
    const n=finiteNumber(value);
    if(n!==null&&n>0)return Math.round(n);
  }
  const s=normalizedText(x);
  const patterns=[
    /(?:copropriete|co-?ownership|mede-?eigendom)[^0-9]{0,45}(\d{1,3})\s*(?:lots?|unites?|units?|appartements?|apartments?|logements?)/i,
    /(?:immeuble|residence|gebouw|building)[^0-9]{0,45}(\d{1,3})\s*(?:lots?|unites?|units?|appartements?|apartments?|logements?)/i,
    /(\d{1,3})\s*(?:lots?|unites?|units?|appartements?|apartments?|logements?)[^.!?]{0,55}(?:copropriete|co-?ownership|mede-?eigendom)/i
  ];
  for(const re of patterns){
    const m=s.match(re);
    if(m){
      const n=Number(m[1]);
      if(Number.isFinite(n)&&n>0)return n;
    }
  }
  return null;
}

export function isLargeCopropriete(x={},category='apartment'){
  if(category==='building'||String(x.category||'').toLowerCase()==='building')return false;
  const s=normalizedText(x);
  if(/\b(?:grande|importante|vaste)\s+copropriete\b|\blarge\s+co-?ownership\b|\bgrote\s+mede-?eigendom\b/.test(s))return true;
  const units=detectedCoproUnits(x);
  return units!==null&&units>=LARGE_COPRO_THRESHOLD;
}

export function hasAuctionOrStartingPriceStructure(x={}){
  const s=normalizedText(x);
  return /\bbiddit(?:\.be)?\b|\bvente\s+(?:publique|aux?\s+encheres?)\b|\b(?:aux?\s+)?encheres?\b|\badjudication\b|\bopenbare\s+verkoop\b|\b(?:public\s+)?auction\b|\bmise\s+a\s+prix\b|\bprix\s+de\s+depart\b|\binstelprijs\b|\bstartprijs\b|\bstartbod\b|\bopbod\b|\bstarting\s+bid\b|\breserve\s+price\b/i.test(s);
}

export function hasExplicitUrbanismInfraction(x={}){
  const s=normalizedText(x);
  const explicitNoInfraction=/\b(?:aucune|sans)\s+infractions?\s+urbanistiques?\b|\bpas\s+d[' ]?infractions?\s+urbanistiques?\b|\babsence\s+d[' ]?infractions?\s+urbanistiques?\b|\bgeen\s+stedenbouwkundige\s+overtredingen?\b|\bno\s+(?:urban\s+planning|planning|urbanism)\s+(?:violation|infraction)s?\b/i.test(s);
  if(explicitNoInfraction)return false;
  return /\binfractions?\s+urbanistiques?\b|\bstedenbouwkundige\s+overtredingen?\b|\bbouwovertredingen?\b|\b(?:urban\s+planning|planning)\s+violations?\b|\burbanism\s+infractions?\b/i.test(s);
}

export function hasNonRegularisableUrbanism(x={}){
  const s=normalizedText(x);
  if(/\b(?:aucune|sans)\s+infraction\s+urbanistique\b|\bgeen\s+stedenbouwkundige\s+overtreding\b/.test(s))return false;
  return /\bnon[ -]?regularisable?s?\b|\bimpossible\s+(?:a|de)\s+regulariser\b|\bregularisation\s+impossible\b|\bne\s+peut\s+pas\s+etre\s+regularise\b|\bniet\s+regulariseerbaar\b|\bniet\s+te\s+regulariseren\b|\bregularisatie\s+onmogelijk\b|\bcannot\s+be\s+regulari[sz]ed\b|\bnot\s+regulari[sz]able\b|\bnon_regularisable\b/i.test(s);
}

export function hasHabitabilityOrInsalubrityBlock(x={}){
  const s=normalizedText(x);
  return /\barrete\s+d[' ]?insalubrite\s+(?:en\s+vigueur|actif)\b|\bfait\s+l[' ]objet\s+d[' ]un\s+arrete\s+d[' ]insalubrite\b|\bimmeuble\s+inhabitable\b|\bbien\s+inhabitable\b|\bdeclare\s+inhabitable\b|\bonbewoonbaar\b|\bonbewoonbaar\s+verklaard\b|\buninhabitable\b/i.test(s);
}

export function hasHeavyRenovationBlock(x={}){
  const s=normalizedText(x);
  return /\bimportants?\s+travaux\s+(?:de\s+)?renovation\b|\bgros\s+travaux\b|\brenovation\s+(?:totale|complete|lourde)\b|\ba\s+renover\s+(?:entierement|completement)\b|\bvolledig\s+te\s+renoveren\b|\btotal\s+renovation\b|\bmajor\s+renovation\b/i.test(s);
}

export function isCollectiveStudentHousingWithoutIndependentUnits(x={},category='apartment'){
  if(category!=='building'&&String(x.category||'').toLowerCase()!=='building')return false;
  const s=normalizedText(x);
  const collective=/\bhabitat\s+collectif\b|\blogement\s+collectif\b|\bchambres?\s+etudiantes?\b|\bstudentenkamers?\b|\bstudent\s+rooms?\b/i.test(s);
  if(!collective)return false;
  const explicitIndependent=/\b(?:appartements?|logements?|unites?)\s+(?:autonomes?|independants?|reconnus?|autorises?|reguliers?)\b|\b(?:3|trois)\s+(?:appartements?|logements?|unites?)\s+(?:reconnus?|autorises?|autonomes?|independants?)\b|\bzelfstandige\s+wooneenheden\b|\bindependent\s+(?:apartments?|units?)\b/i.test(s);
  return !explicitIndependent;
}

export function userExclusionReasons(x={},category='apartment'){
  const reasons=[];
  if(hasAuctionOrStartingPriceStructure(x))reasons.push('AUCTION_OR_STARTING_PRICE');
  if(hasExplicitUrbanismInfraction(x))reasons.push('EXPLICIT_URBANISM_INFRACTION');
  else if(hasNonRegularisableUrbanism(x))reasons.push('URBANISM_NON_REGULARISABLE');
  if(hasHabitabilityOrInsalubrityBlock(x))reasons.push('INSALUBRITY_OR_UNINHABITABLE');
  if(hasHeavyRenovationBlock(x))reasons.push('HEAVY_RENOVATION');
  if(isCollectiveStudentHousingWithoutIndependentUnits(x,category))reasons.push('COLLECTIVE_STUDENT_HOUSING_NOT_INDEPENDENT_UNITS');
  if(isLargeCopropriete(x,category))reasons.push('LARGE_COPROPRIETE');
  return reasons;
}

export function isUserExcludedListing(x={},category='apartment'){
  return userExclusionReasons(x,category).length>0;
}
