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

export function hasNonRegularisableUrbanism(x={}){
  const s=normalizedText(x);
  if(/\b(?:aucune|sans)\s+infraction\s+urbanistique\b|\bgeen\s+stedenbouwkundige\s+overtreding\b/.test(s))return false;
  return /\bnon[ -]?regularisable?s?\b|\bimpossible\s+(?:a|de)\s+regulariser\b|\bregularisation\s+impossible\b|\bne\s+peut\s+pas\s+etre\s+regularise\b|\bniet\s+regulariseerbaar\b|\bniet\s+te\s+regulariseren\b|\bregularisatie\s+onmogelijk\b|\bcannot\s+be\s+regulari[sz]ed\b|\bnot\s+regulari[sz]able\b|\bnon_regularisable\b/i.test(s);
}

export function userExclusionReasons(x={},category='apartment'){
  const reasons=[];
  if(hasNonRegularisableUrbanism(x))reasons.push('URBANISM_NON_REGULARISABLE');
  if(isLargeCopropriete(x,category))reasons.push('LARGE_COPROPRIETE');
  return reasons;
}

export function isUserExcludedListing(x={},category='apartment'){
  return userExclusionReasons(x,category).length>0;
}
