import {buildingZone,buildingUnitCount} from './immo-building-criteria.js';

const ZONE_ARV={
  'Ixelles':{low:4600,mid:5000,high:5400,liquidity:10},
  'Uccle':{low:4300,mid:4700,high:5100,liquidity:9},
  'Auderghem':{low:4000,mid:4400,high:4800,liquidity:9},
  'Watermael-Boitsfort':{low:4200,mid:4600,high:5000,liquidity:8},
  'Forest':{low:3700,mid:4100,high:4500,liquidity:8}
};

const ACQUISITION_RATE=0.14; // droits + frais d'acquisition, hypothèse prudente
const HOLDING_RATE=0.045; // financement, assurance, précompte, portage
const EXIT_RATE=0.03; // commercialisation, certificats, staging, marge de vente
const WORK_CONTINGENCY=0.12;
const TARGET_MARGIN=0.20;

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLowerCase()}
function text(x={}){return norm([x.title,x.description,x.location,x.address,x.city,x.unitsText,x.condition,x.state,x.peb,x.epc].filter(Boolean).join(' '))}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function round500(n){return Math.round(Number(n||0)/500)*500}
function pct(n){return Math.round(Number(n||0)*10)/10}

function workBand(x={}){
  const s=text(x),peb=String(x.peb||x.epc||'').toUpperCase();
  if(/renovation totale|renovation complete|gros travaux|a renover entierement|a renover completement|total renovation|volledig te renoveren/.test(s))return {level:'LOURDE',low:1200,high:1650,confidence:'MOYENNE',reason:'annonce: rénovation lourde'};
  if(/a renover|te renoveren|renovation|moderniser|modernisation/.test(s))return {level:'IMPORTANTE',low:900,high:1350,confidence:'MOYENNE',reason:'annonce: rénovation/modernisation'};
  if(/a rafraichir|rafraichissement|opfrissen|refresh/.test(s))return {level:'LEGERE',low:500,high:800,confidence:'MOYENNE',reason:'annonce: rafraîchissement'};
  if(/renove|renovee|entierement renove|excellent etat|parfait etat|instapklaar|gerenoveerd/.test(s))return {level:'LEGERE',low:350,high:650,confidence:'MOYENNE',reason:'annonce: état rénové'};
  if(/^A|^B|^C/.test(peb))return {level:'MOYENNE',low:650,high:950,confidence:'FAIBLE',reason:'estimation par surface + PEB'};
  if(/^D/.test(peb))return {level:'MOYENNE',low:750,high:1050,confidence:'FAIBLE',reason:'estimation par surface + PEB D'};
  if(/^E/.test(peb))return {level:'MOYENNE',low:850,high:1200,confidence:'FAIBLE',reason:'estimation par surface + PEB E'};
  if(/^F|^G/.test(peb))return {level:'IMPORTANTE',low:1050,high:1450,confidence:'FAIBLE',reason:'estimation par surface + PEB faible'};
  return {level:'MOYENNE',low:800,high:1150,confidence:'FAIBLE',reason:'état exact non publié'};
}

function risks(x={}){
  const s=text(x),out=[];
  if(/infraction|non conforme|non reconnu|regularisation|permis en cours|urbanisme a verifier/.test(s))out.push('Urbanisme / régularité à auditer');
  if(/mise a prix|biddit|enchere|vente publique|starting bid/.test(s))out.push('Prix non ferme / enchère');
  if(/loue|louee|locataire|tenant|bail en cours|occupe/.test(s))out.push('Occupation / baux à auditer');
  if(/amiante|asbest/.test(s))out.push('Amiante à chiffrer');
  if(/toiture.*a refaire|roof.*replace|dak.*vernieuw/.test(s))out.push('Toiture potentiellement lourde');
  if(!/reconnu|reconnue|urbanistique|stedenbouwkundig|regularise|autorise/.test(s))out.push('Nombre d’unités à confirmer urbanistiquement');
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

  const band=workBand(x);
  const workLow=round500(area*band.low),workHigh=round500(area*band.high),workMid=round500((workLow+workHigh)/2);
  const saleableFactor=clamp(0.92-(Math.max(0,units-3)*0.012),0.87,0.92);
  const saleableArea=Math.round(area*saleableFactor);
  const avgUnitArea=Math.round(saleableArea/units);
  const sizeAdjustment=avgUnitArea<45?0.94:avgUnitArea>115?0.97:1;
  const arvLow=round500(saleableArea*bench.low*sizeAdjustment);
  const arvMid=round500(saleableArea*bench.mid*sizeAdjustment);
  const arvHigh=round500(saleableArea*bench.high*sizeAdjustment);

  const acquisition=round500(price*ACQUISITION_RATE);
  const holding=round500(price*HOLDING_RATE);
  const legalAdmin=round500(15000+units*2500);
  const contingency=round500(workMid*WORK_CONTINGENCY);
  const exitCosts=round500(arvMid*EXIT_RATE);
  const allIn=price+acquisition+holding+legalAdmin+workMid+contingency+exitCosts;
  const profit=arvMid-allIn;
  const margin=allIn>0?(profit/allIn)*100:0;

  const stressContingency=round500(workHigh*WORK_CONTINGENCY);
  const stressExit=round500(arvLow*EXIT_RATE);
  const stressAllIn=price+acquisition+holding+legalAdmin+workHigh+stressContingency+stressExit;
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
  if(band.confidence==='FAIBLE')score-=3;
  score=Math.round(clamp(score,0,100));

  const fixedForTarget=workMid+contingency+legalAdmin+exitCosts;
  const purchaseFactor=1+ACQUISITION_RATE+HOLDING_RATE;
  const maxPurchase=round500(Math.max(0,(arvMid/(1+TARGET_MARGIN)-fixedForTarget)/purchaseFactor));
  const targetGap=price-maxPurchase;
  const status=statusFor(margin,stressMargin,score);

  const action=status.code==='PRIME'?'Visite + devis entrepreneur + urbanisme immédiatement':status.code==='VALUE'?'Auditer puis négocier si nécessaire':status.code==='NEGOTIATE'?`Négocier vers ${Math.round(maxPurchase/1000)} k€ ou moins`:'Écarter sauf forte baisse du prix';

  return {
    ...x,
    flipReady:true,
    flip:{
      zone,units,area,saleableArea,avgUnitArea,pricePerSqm:psm,
      works:{level:band.level,low:workLow,mid:workMid,high:workHigh,rateLow:band.low,rateHigh:band.high,confidence:band.confidence,reason:band.reason},
      arv:{low:arvLow,mid:arvMid,high:arvHigh,benchmarkLow:bench.low,benchmarkMid:bench.mid,benchmarkHigh:bench.high},
      costs:{acquisition,holding,legalAdmin,contingency,exitCosts,allIn},
      profit:round500(profit),margin:pct(margin),stressProfit:round500(stressProfit),stressMargin:pct(stressMargin),
      maxPurchase,targetGap:round500(targetGap),score,status:status.code,statusLabel:status.label,action,
      risks:riskList,
      assumptions:{acquisitionRate:ACQUISITION_RATE,holdingRate:HOLDING_RATE,exitRate:EXIT_RATE,workContingency:WORK_CONTINGENCY,targetMargin:TARGET_MARGIN,saleableFactor:pct(saleableFactor*100)}
    }
  };
}

export function flipMethodology(){
  return {
    name:'ARGUS FLIP',
    objective:'Acheter un immeuble de rapport, rénover/optimiser puis revendre les appartements avec une marge de sécurité.',
    baseCriteria:{zones:Object.keys(ZONE_ARV),excluded:['Saint-Gilles'],units:'3–6 appartements',price:'600 k€–1,2 M€'},
    essentialCriteria:[
      'Décote d’achat mesurée par rapport à la valeur rénovée',
      'Marge centrale et marge stressée après tous les coûts',
      'Travaux estimés par surface, état publié et PEB',
      'Liquidité de revente par commune et taille moyenne des lots',
      'Risque urbanistique et confirmation du nombre d’unités',
      'Occupation/baux, enchères et travaux lourds signalés comme risques',
      'Prix maximum recommandé pour viser 20 % de marge sur coût total'
    ],
    caution:'Les travaux et valeurs de revente sont des estimations ARGUS destinées au tri. Validation obligatoire par entrepreneur, architecte/notaire et comparables de vente avant offre.'
  };
}
