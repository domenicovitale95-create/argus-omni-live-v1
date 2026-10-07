import {buildingZone,buildingUnitCount} from './immo-building-criteria.js';

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLowerCase()}
function text(x={}){return norm([x.title,x.description,x.location,x.address,x.city,x.unitsText,x.condition,x.state,x.peb,x.epc,x.urbanism,x.urbanisme].filter(Boolean).join(' '))}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function criticalSignals(x={}){
  const s=text(x),hard=[],review=[];
  if(/non regularisable|non-regul|impossible.*regularis|niet regulariseerbaar/.test(s))hard.push('Infraction annoncée comme non régularisable');
  if(/unite.*non reconnue|logement.*non reconnu|appartement.*non reconnu|division.*non autorisee|niet vergund/.test(s))hard.push('Unité/division explicitement non reconnue');
  if(/a renover entierement|renovation totale|renovation complete|volledig te renoveren|gros travaux/.test(s))hard.push('Rénovation lourde annoncée — hors stratégie sans travaux');
  if(/probleme structurel|stabilite|stabilité|instabilite|instabilité/.test(s))hard.push('Risque structurel explicite');
  if(/mise a prix|biddit|enchere|vente publique|starting bid/.test(s))review.push('Prix non ferme / enchère');
  if(/loue|louee|locataire|tenant|bail en cours|occupe|verhuurd/.test(s))review.push('Occupation / baux à auditer avant vente par lots');
  if(/regularisation|permis en cours|urbanisme a verifier|situation urbanistique.*verifier/.test(s))review.push('Urbanisme / régularité encore à confirmer');
  if(/amiante|asbest/.test(s))review.push('Amiante à auditer');
  if(/toiture.*a refaire|facade.*a refaire|parties communes.*a renover|dak.*vernieuw|gevel.*renover/.test(s))review.push('Gros poste commun potentiel à vérifier');
  return {hard,review};
}
function recognizedUnits(x={}){
  const v=Number(x.recognizedUnits);
  return Number.isFinite(v)&&v>0?Math.round(v):null;
}
function addressKnown(x={}){return Boolean(String(x.exactAddress||x.address||'').trim())}
export function analyzeFlip(x={}){
  const price=num(x.price),area=num(x.area??x.surface),units=buildingUnitCount(x),zone=buildingZone(x),recognized=recognizedUnits(x),signals=criticalSignals(x);
  if(!price||!units||!zone)return {...x,flipReady:false,flipReason:'Données de base insuffisantes pour le pré-screening'};
  let score=35;
  if(area)score+=10;
  if(units>=3&&units<=6)score+=10;
  if(recognized!==null&&recognized===units)score+=20;
  else if(recognized!==null)score-=20;
  if(addressKnown(x))score+=8;
  if(x.peb||x.epc)score+=5;
  if(!signals.review.length)score+=7;
  score-=signals.review.length*5;
  score-=signals.hard.length*25;
  score=Math.round(clamp(score,0,100));
  let status='READY',label='🟢 READY FOR UNDERWRITING',action='Valoriser chaque futur lot dans ARGUS FLIP PRO.';
  if(signals.hard.length){status='STOP';label='🔴 STOP';action='Écarter tant que le blocage n’est pas juridiquement levé.'}
  else if(recognized===null||recognized!==units||signals.review.length){status='DOCUMENTS_FIRST';label='🟠 DOCUMENTS FIRST';action='Obtenir les preuves manquantes avant toute valorisation finale.'}
  const missing=[];
  if(recognized===null)missing.push('preuve officielle du nombre d’unités reconnues');
  if(!addressKnown(x))missing.push('adresse exacte');
  if(!area)missing.push('surface exploitable / plans');
  if(!(x.peb||x.epc))missing.push('PEB par unité');
  if(!x.meters)missing.push('situation des compteurs');
  return {
    ...x,flipReady:true,
    flip:{
      strategy:'DIVIDE_AND_RESELL_AS_IS',
      strategyLabel:'DIVISER & REVENDRE EN L’ÉTAT · 0 € RÉNOVATION',
      valuationRequired:true,valuationSource:'LOT_LEVEL_LIVE_COMPARABLES_ONLY',
      zone,units,recognizedUnits:recognized,area,pricePerSqm:area?Math.round(price/area):null,
      score,status,statusLabel:label,action,
      blockers:signals.hard,risks:signals.review,missing,
      profit:null,margin:null,stressMargin:null,maxPurchase:null,arv:null,
      note:"Aucune valeur de sortie, marge ou prix maximum n'est calculé au pré-screening. Ces chiffres ne deviennent disponibles qu'après valorisation des lots par comparables documentés dans ARGUS FLIP PRO."
    }
  };
}
export function flipMethodology(){
  return {
    name:'ARGUS SPLIT & SELL — PRE-SCREEN',
    objective:'Éliminer rapidement les immeubles incompatibles avant la valorisation lot par lot.',
    strategyRules:[
      '0 € de rénovation intérieure',
      'Aucun €/m² fixe par commune',
      'Aucun bénéfice calculé sans comparables des futurs lots',
      'Unité reconnue et division juridiquement sécurisable avant décision',
      'Les travaux lourds explicitement nécessaires font sortir le bien de cette stratégie'
    ],
    statuses:{READY:'Dossier suffisamment propre pour lancer l’underwriting lot par lot',DOCUMENTS_FIRST:'Données juridiques ou techniques à obtenir',STOP:'Blocage explicite ou bien hors stratégie'},
    caution:'Le pré-screening n’est pas une expertise de valeur. La rentabilité est calculée uniquement dans ARGUS FLIP PRO avec les lots et leurs comparables.'
  };
}
