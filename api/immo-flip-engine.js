import {buildingZone,buildingUnitCount} from './immo-building-criteria.js';

const ZONE_ARV={
  'Ixelles':{low:4600,mid:5000,high:5400,liquidity:10},
  'Uccle':{low:4300,mid:4700,high:5100,liquidity:9},
  'Auderghem':{low:4000,mid:4400,high:4800,liquidity:9},
  'Watermael-Boitsfort':{low:4200,mid:4600,high:5000,liquidity:8},
  'Forest':{low:3700,mid:4100,high:4500,liquidity:8}
};

const ACQUISITION_RATE=0.14;
const HOLDING_RATE=0.045;
const EXIT_RATE=0.03;
const TARGET_MARGIN=0.20;
const DIVISION_FIXED_RESERVE=15000;
const DIVISION_PER_UNIT_RESERVE=2500;
const DIVISION_CONTINGENCY=0.10;

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLowerCase()}
function text(x={}){return norm([x.title,x.description,x.location,x.address,x.city,x.unitsText,x.condition,x.state,x.peb,x.epc,x.urbanism,x.urbanisme].filter(Boolean).join(' '))}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function round500(n){return Math.round(Number(n||0)/500)*500}
function pct(n){return Math.round(Number(n||0)*10)/10}

function commonWorksRisk(x={}){
  const s=text(x),items=[];
  if(/toiture.*a refaire|roof.*replace|dak.*vernieuw|toiture.*renover/.test(s))items.push('toiture');
  if(/facade.*a refaire|facade.*renover|gevel.*renover/.test(s))items.push('façade');
  if(/communs?.*a renover|parties communes.*a renover|gemeenschappelijke.*renover/.test(s))items.push('communs');
  if(/electricite.*communs?.*non conforme|installation commune.*non conforme/.test(s))items.push('électricité commune');
  return items;
}

function risks(x={}){
  const s=text(x),out=[];
  if(/infraction|non conforme|non reconnu|regularisation|permis en cours|urbanisme a verifier/.test(s))out.push('Urbanisme / régularité à auditer');
  if(/mise a prix|biddit|enchere|vente publique|starting bid/.test(s))out.push('Prix non ferme / enchère');
  if(/loue|louee|locataire|tenant|bail en cours|occupe/.test(s))out.push('Occupation / baux à auditer');
  if(/amiante|asbest/.test(s))out.push('Amiante à auditer');
  const common=commonWorksRisk(x);if(common.length)out.push('Travaux communs à chiffrer : '+common.join(', '));
  const recognized=Number(x.recognizedUnits);
  if(!(Number.isFinite(recognized)&&recognized>0))out.push('Nombre d’unités à confirmer urbanistiquement');
  return out;
}

function statusFor(margin,stressMargin,score){
  if(margin>=20&&stressMargin>=5&&score>=78)return {code:'PRIME',label:'🟢 PRIME'};
  if(margin>=15&&stressMargin>=0&&score>=65)return {code:'VALUE',label:'🔵 VALUE'};
  if(margin>=8)return {code:'NEGOTIATE',label:'🟠 NEGOTIATE'};
  return {code:'REJECT',label:'⚫ REJECT'};
}

export function analyzeFlip(x={}){
  const price=num(x.price),area=num(x.area??x.surface),units=buildingUnitCount(x),zone=buildingZone(x),bench=ZONE_ARV[zone];
  if(!price||!area||!units||!bench)return {...x,flipReady:false,flipReason:'Données insuffisantes pour estimer la rentabilité'};

  const interiorWorks=0;
  const commonWorks=commonWorksRisk(x);
  const divisionLegal=round500(DIVISION_FIXED_RESERVE+units*DIVISION_PER_UNIT_RESERVE);
  const divisionContingency=round500(divisionLegal*DIVISION_CONTINGENCY);

  const saleableFactor=clamp(0.92-(Math.max(0,units-3)*0.012),0.87,0.92);
  const saleableArea=Math.round(area*saleableFactor);
  const avgUnitArea=Math.round(saleableArea/units);
  const sizeAdjustment=avgUnitArea<45?0.94:avgUnitArea>115?0.97:1;
  const arvLow=round500(saleableArea*bench.low*sizeAdjustment);
  const arvMid=round500(saleableArea*bench.mid*sizeAdjustment);
  const arvHigh=round500(saleableArea*bench.high*sizeAdjustment);

  const acquisition=round500(price*ACQUISITION_RATE);
  const holding=round500(price*HOLDING_RATE);
  const exitCosts=round500(arvMid*EXIT_RATE);
  const allIn=price+acquisition+holding+divisionLegal+divisionContingency+exitCosts;
  const profit=arvMid-allIn;
  const margin=allIn>0?(profit/allIn)*100:0;

  const stressExit=round500(arvLow*EXIT_RATE);
  const stressAllIn=price+acquisition+holding+divisionLegal+divisionContingency+stressExit;
  const stressProfit=arvLow-stressAllIn;
  const stressMargin=stressAllIn>0?(stressProfit/stressAllIn)*100:0;

  const psm=Math.round(price/area);
  const spread=1-(psm/bench.mid);
  const riskList=risks(x);
  let score=0;
  score+=clamp((margin+5)*1.25,0,42);
  score+=clamp((stressMargin+10)*0.8,0,20);
  score+=clamp(spread*28,0,15);
  score+=units<=4?10:units===5?8:6;
  score+=bench.liquidity;
  score-=riskList.length*4;
  if(commonWorks.length)score-=6;
  score=Math.round(clamp(score,0,100));

  const fixedForTarget=divisionLegal+divisionContingency+exitCosts;
  const purchaseFactor=1+ACQUISITION_RATE+HOLDING_RATE;
  const maxPurchase=round500(Math.max(0,(arvMid/(1+TARGET_MARGIN)-fixedForTarget)/purchaseFactor));
  const targetGap=price-maxPurchase;
  const status=statusFor(margin,stressMargin,score);
  const action=status.code==='PRIME'?'Urbanisme + acte de base + baux + visite immédiatement':status.code==='VALUE'?'Auditer la division et les documents puis négocier si nécessaire':status.code==='NEGOTIATE'?'Négocier vers '+Math.round(maxPurchase/1000)+' k€ ou moins':'Écarter sauf forte baisse du prix';

  return {
    ...x,
    flipReady:true,
    flip:{
      strategy:'DIVIDE_AND_RESELL_AS_IS',
      strategyLabel:'DIVISER & REVENDRE · SANS RÉNOVATION INTÉRIEURE',
      zone,units,area,saleableArea,avgUnitArea,pricePerSqm:psm,
      works:{
        interior:interiorWorks,
        commonQuoted:false,
        commonRisks:commonWorks,
        level:'AUCUNE RÉNOVATION INTÉRIEURE',
        low:0,mid:0,high:0,
        confidence:'CONFIRMÉ PAR STRATÉGIE',
        reason:'La stratégie ARGUS n’intègre aucune rénovation intérieure des appartements.'
      },
      division:{
        legalAdminReserve:divisionLegal,
        contingency:divisionContingency,
        totalReserve:divisionLegal+divisionContingency,
        confidence:'MODÈLE À VALIDER',
        note:'Réserve division/copropriété/documents. À remplacer par devis notaire, géomètre et architecte.'
      },
      arv:{low:arvLow,mid:arvMid,high:arvHigh,benchmarkLow:bench.low,benchmarkMid:bench.mid,benchmarkHigh:bench.high},
      costs:{acquisition,holding,divisionLegal,divisionContingency,interiorWorks,exitCosts,allIn},
      profit:round500(profit),margin:pct(margin),stressProfit:round500(stressProfit),stressMargin:pct(stressMargin),
      maxPurchase,targetGap:round500(targetGap),score,status:status.code,statusLabel:status.label,action,
      risks:riskList,
      confidence:{
        urbanism:Number.isFinite(Number(x.recognizedUnits))&&Number(x.recognizedUnits)>0?'CONFIRMED':'TO_CONFIRM',
        division:'MODEL_TO_QUOTE',
        interiorWorks:'ZERO_BY_STRATEGY',
        valuation:'MODEL'
      },
      assumptions:{acquisitionRate:ACQUISITION_RATE,holdingRate:HOLDING_RATE,exitRate:EXIT_RATE,divisionFixedReserve:DIVISION_FIXED_RESERVE,divisionPerUnitReserve:DIVISION_PER_UNIT_RESERVE,divisionContingency:DIVISION_CONTINGENCY,targetMargin:TARGET_MARGIN,saleableFactor:pct(saleableFactor*100)}
    }
  };
}

export function flipMethodology(){
  return {
    name:'ARGUS SPLIT & SELL',
    objective:'Acheter un immeuble de rapport, sécuriser sa situation urbanistique et sa division en lots, puis revendre les appartements séparément sans rénovation intérieure.',
    baseCriteria:{zones:Object.keys(ZONE_ARV),excluded:['Saint-Gilles'],units:'3–6 appartements',price:'600 k€–1,2 M€'},
    strategyRules:[
      '0 € de rénovation intérieure par défaut',
      'Division juridique / copropriété / documents intégrés comme réserve séparée',
      'Travaux communs non chiffrés sans signal explicite et devis',
      'Revente des appartements en l’état, après sécurisation juridique et technique'
    ],
    essentialCriteria:[
      'Décote d’achat par rapport à la valeur de revente séparée',
      'Marge centrale et marge stressée après acquisition, portage, division et sortie',
      'Nombre d’unités annoncé distinct du nombre d’unités urbanistiquement reconnu',
      'Possibilité de créer/adapter l’acte de base et la copropriété',
      'Occupation/baux et possibilité de vendre les lots',
      'PEB, électricité, compteurs et documents nécessaires à chaque revente',
      'Travaux communs lourds signalés comme risque à chiffrer séparément',
      'Prix maximum recommandé pour viser 20 % de marge sur coût total'
    ],
    caution:'Les valeurs de revente et réserves de division sont des estimations ARGUS de tri. Les frais réels doivent être validés par notaire, géomètre/architecte et comparables de marché avant offre.'
  };
}
