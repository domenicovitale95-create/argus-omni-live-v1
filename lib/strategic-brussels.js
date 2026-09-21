export const PROJECT_STAGE_SCORE={
  ANNOUNCED:20,
  PLANNED:40,
  APPROVED:60,
  PERMITTED:78,
  UNDER_CONSTRUCTION:90,
  DELIVERED:100
};

export const SCORE_DIMENSIONS=[
  'valueScore','priceMomentum','urbanTransformation','transportScore','employmentGravity',
  'euInstitutionalImpact','greenPublicSpaceImpact','housingSupply','commercialRevitalisation',
  'demographicMomentum','rentalDemand','affordability','executionCertainty',
  'repricingGap','riskScore'
];

const W={
  valueScore:.14,
  urbanTransformation:.14,
  transportScore:.08,
  employmentGravity:.07,
  euInstitutionalImpact:.05,
  greenPublicSpaceImpact:.05,
  housingSupply:.05,
  commercialRevitalisation:.04,
  demographicMomentum:.04,
  rentalDemand:.06,
  affordability:.05,
  executionCertainty:.12,
  repricingGap:.11
};

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=v=>Math.max(0,Math.min(100,Math.round(v*10)/10));

export function deriveMarketScores(zone,benchmarks={}){
  const s={...(zone.scores||{})};
  const p=n(zone.market?.askingPricePerM2,NaN);
  const region=n(benchmarks.regionAskingPricePerM2,NaN);
  if(!Number.isFinite(Number(s.valueScore))&&Number.isFinite(p)&&Number.isFinite(region)&&region>0){
    const ratio=p/region;
    s.valueScore=clamp(50+(1-ratio)*115);
  }
  if(!Number.isFinite(Number(s.affordability))&&Number.isFinite(p)&&Number.isFinite(region)&&region>0){
    const ratio=p/region;
    s.affordability=clamp(50+(1-ratio)*100);
  }
  const pm=zone.market?.priceMomentum||{};
  if(!Number.isFinite(Number(s.priceMomentum))){
    const vals=[
      Number.isFinite(Number(pm.oneYear))?n(pm.oneYear)*.45:null,
      Number.isFinite(Number(pm.threeYear))?n(pm.threeYear)/3*.35:null,
      Number.isFinite(Number(pm.fiveYear))?n(pm.fiveYear)/5*.20:null
    ].filter(v=>v!=null);
    if(vals.length){
      const annual=vals.reduce((a,b)=>a+b,0)/(vals.length===3?1:vals.length);
      s.priceMomentum=clamp(50+annual*5);
    }
  }
  return s;
}

export function executionFromProjects(projects=[]){
  if(!projects.length)return 0;
  let weight=0,total=0;
  for(const p of projects){
    const significance=Math.max(.4,Math.min(2,n(p.significance,1)));
    const stage=PROJECT_STAGE_SCORE[String(p.stage||'').toUpperCase()]||0;
    total+=stage*significance;weight+=significance;
  }
  return weight?clamp(total/weight):0;
}

export function completeness(zone,benchmarks={}){
  const s=deriveMarketScores(zone,benchmarks);
  const required=[
    'valueScore','urbanTransformation','transportScore','employmentGravity','euInstitutionalImpact',
    'greenPublicSpaceImpact','housingSupply','commercialRevitalisation','demographicMomentum',
    'rentalDemand','affordability','repricingGap','riskScore'
  ];
  const present=required.filter(k=>Number.isFinite(Number(s[k]))).length;
  const momentum=zone.market?.priceMomentum||{};
  const marketPresent=['oneYear','threeYear','fiveYear'].filter(k=>Number.isFinite(Number(momentum[k]))).length;
  return clamp((present+marketPresent)/(required.length+3)*100);
}

export function calculateUrbanUpside(zone,benchmarks={}){
  const s=deriveMarketScores(zone,benchmarks);
  s.executionCertainty=Number.isFinite(Number(s.executionCertainty))
    ?n(s.executionCertainty)
    :executionFromProjects(zone.projects||[]);

  let base=0,weight=0;
  for(const [k,w] of Object.entries(W)){
    if(Number.isFinite(Number(s[k]))){base+=n(s[k])*w;weight+=w}
  }
  base=weight?base/weight:0;

  const value=n(s.valueScore,50)/100;
  const structural=(n(s.urbanTransformation,0)+n(s.transportScore,0)+n(s.employmentGravity,0)+n(s.greenPublicSpaceImpact,0))/400;
  const execution=n(s.executionCertainty,0)/100;
  const liveability=(n(s.greenPublicSpaceImpact,0)+n(s.commercialRevitalisation,0)+n(s.transportScore,0))/300;
  const transportJobs=(n(s.transportScore,0)+n(s.employmentGravity,0))/200;

  const synergy=
    10*(value*structural*execution)+
    4*(transportJobs*execution)+
    4*(liveability*execution);

  const pricedIn=n(zone.penalties?.alreadyPricedIn,Math.max(0,100-n(s.repricingGap,50)));
  const speculative=n(zone.penalties?.speculativeProject,Math.max(0,70-n(s.executionCertainty,0)));
  const oversupply=n(zone.penalties?.overSupply,Math.max(0,n(s.housingSupply,0)-n(s.rentalDemand,0)));
  const structuralNeg=n(zone.penalties?.structuralNegativeFactors,n(s.riskScore,0));
  const missing=Math.max(0,100-completeness(zone,benchmarks));

  const penalty=
    pricedIn*.07+
    speculative*.07+
    oversupply*.05+
    structuralNeg*.10+
    missing*.08;

  return clamp(base+synergy-penalty);
}

export function derivedIndicators(zone,benchmarks={}){
  const s=deriveMarketScores(zone,benchmarks);
  s.executionCertainty=Number.isFinite(Number(s.executionCertainty))
    ?n(s.executionCertainty)
    :executionFromProjects(zone.projects||[]);
  const currentValue=clamp(
    n(s.valueScore,0)*.45+n(s.affordability,0)*.30+n(s.rentalDemand,0)*.15+n(s.repricingGap,0)*.10
  );
  const futureCatalysts=clamp(
    n(s.urbanTransformation,0)*.24+n(s.transportScore,0)*.14+n(s.employmentGravity,0)*.13+
    n(s.euInstitutionalImpact,0)*.11+n(s.greenPublicSpaceImpact,0)*.11+n(s.housingSupply,0)*.11+
    n(s.commercialRevitalisation,0)*.08+n(s.demographicMomentum,0)*.08
  );
  return {
    urbanUpside:calculateUrbanUpside(zone,benchmarks),
    currentValue,
    futureCatalysts,
    executionConfidence:clamp(s.executionCertainty),
    risk:clamp(n(s.riskScore,0)),
    dataCompleteness:completeness(zone,benchmarks)
  };
}

export function rankZones(zones=[],benchmarks={}){
  return zones.map(z=>({...z,scores:deriveMarketScores(z,benchmarks),derived:derivedIndicators(z,benchmarks)}))
    .sort((a,b)=>b.derived.urbanUpside-a.derived.urbanUpside);
}

export function topOpportunityBuckets(zones=[],benchmarks={}){
  const ranked=rankZones(zones,benchmarks).filter(z=>z.status!=='REFERENCE_ONLY');
  const pick=(fn)=>[...ranked].sort(fn)[0]||null;
  return {
    bestValue:pick((a,b)=>b.derived.currentValue-a.derived.currentValue),
    bestFiveYearTransformation:pick((a,b)=>
      (b.horizons?.medium||0)-(a.horizons?.medium||0) ||
      b.derived.futureCatalysts-a.derived.futureCatalysts),
    bestLongTermTransformation:pick((a,b)=>
      (b.horizons?.long||0)-(a.horizons?.long||0) ||
      b.derived.futureCatalysts-a.derived.futureCatalysts),
    bestEuInstitutionalExposure:pick((a,b)=>n(b.scores?.euInstitutionalImpact)-n(a.scores?.euInstitutionalImpact)),
    bestTransportLed:pick((a,b)=>n(b.scores?.transportScore)-n(a.scores?.transportScore)),
    bestValueNearCentre:pick((a,b)=>
      ((n(b.scores?.valueScore)*.6+n(b.scores?.transportScore)*.4)-
       (n(a.scores?.valueScore)*.6+n(a.scores?.transportScore)*.4)))
  };
}

export function detectEmergingAreas(candidates=[]){
  return candidates.map(c=>{
    const signals=c.signals||[];
    const strong=signals.filter(s=>n(s.strength)>=60 && (PROJECT_STAGE_SCORE[String(s.stage||'').toUpperCase()]||0)>=40);
    const categories=new Set(strong.map(s=>s.category));
    const execution=strong.length?strong.reduce((a,s)=>a+(PROJECT_STAGE_SCORE[String(s.stage||'').toUpperCase()]||0),0)/strong.length:0;
    const confidence=clamp(strong.length*14+categories.size*12+execution*.35);
    return {...c,discovery:{strongSignals:strong.length,categories:[...categories],confidence,newEmergingArea:strong.length>=3&&categories.size>=2&&confidence>=60}};
  }).filter(c=>c.discovery.newEmergingArea).sort((a,b)=>b.discovery.confidence-a.discovery.confidence);
}
