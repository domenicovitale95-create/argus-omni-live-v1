import {brusselsSector} from './immo-brussels-zones.js';
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
function explicitPositive(v){return ['CONFIRMED','VERIFIED','COMPLIANT','CONFORME','OK','VALID'].includes(String(v||'').toUpperCase())}
function qualityEvidence(x={},recognized,units){
  const legal=recognized!==null&&recognized===units&&Boolean(x.recognizedUnitsSource||x.urbanismDocumentUrl||x.urbanismEvidenceUrl);
  const docs=Boolean(x.urbanismDocumentUrl||x.urbanismEvidenceUrl)&&Boolean(x.plansDocumentUrl||x.legalPlansUrl);
  const electricity=explicitPositive(x.electricityStatus||x.electricalComplianceStatus)&&Boolean(x.electricityReportUrl||x.electricalCertificateUrl);
  const technical=explicitPositive(x.technicalInspectionStatus||x.buildingConditionStatus)&&Boolean(x.technicalReportUrl||x.inspectionReportUrl);
  const peb=String(x.peb||x.epc||'').toUpperCase().match(/[A-G](?:[+-])?/);
  const energy=Boolean(peb&&'ABCD'.includes(peb[0][0])&&Boolean(x.pebCertificateUrl||x.epcCertificateUrl));
  const newListing=Boolean(x.isNew);
  const complete=legal&&docs&&electricity&&technical&&energy;
  const missing=[];
  if(!legal)missing.push('Renseignements urbanistiques officiels et unités reconnues');
  if(!docs)missing.push('Plans légaux et documents urbanistiques');
  if(!electricity)missing.push('Rapport RGIE conforme');
  if(!technical)missing.push('Rapport technique sans travaux importants');
  if(!energy)missing.push('Certificats PEB A–D vérifiables');
  const score=(legal?30:0)+(docs?20:0)+(electricity?15:0)+(technical?15:0)+(energy?15:0)+(newListing?5:0);
  return {legal,docs,electricity,technical,energy,newListing,complete,missing,score,proofLevel:complete?'PREUVES_DÉCLARÉES_À_AUDITER':'À_VÉRIFIER'};
}

function verifiedPremium(x,quality,units,recognized,signals,price){
 const approved=v=>['VERIFIED','CONFIRMED','COMPLIANT','CONFORME','VALIDATED','VALIDÉ','VALIDEE'].includes(String(v||'').toUpperCase());
 const check=(ok,reason)=>ok?null:reason;
 const missing=[
 check(Number(price)>0&&Number(price)<=1400000,'Prix valide, maximum 1 400 000 €'),
 check(units>=3&&recognized===units,'Au moins 3 logements officiellement reconnus, identiques aux lots proposés'),
 check(quality.legal&&approved(x.urbanismVerificationStatus),'Renseignements urbanistiques, permis et situation de droit contrôlés'),
 check(quality.docs&&approved(x.approvedPlansVerificationStatus),'Plans autorisés et conformité de la configuration actuelle contrôlés'),
 check(quality.electricity,'Rapports RGIE conformes pour les unités concernées'),
 check(quality.energy,'Certificats PEB vérifiés, classe A à D par logement'),
 check(quality.technical,'Expertise technique attestant absence de travaux lourds'),
 check(approved(x.titleLegalVerificationStatus)&&Boolean(x.titleDeedDocumentUrl),'Titre, charges, servitudes et droits réels vérifiés'),
 check(approved(x.saleByLotsLegalStatus)&&Boolean(x.saleByLotsNotaryDocumentUrl),'Vente par lots, copropriété et option croisée validées par notaire'),
 check(approved(x.tenancyLegalStatus),'Baux, occupation et éventuels droits de préférence vérifiés'),
 check(approved(x.environmentLegalStatus),'Sol et obligations environnementales applicables vérifiés'),
 check(approved(x.fireSafetyLegalStatus),'Sécurité incendie et prescriptions applicables vérifiées'),
 check(signals.hard.length===0&&signals.review.length===0,'Aucune alerte juridique, technique ou locative non résolue')
 ].filter(Boolean);
 return {verified:missing.length===0,missing};
}
export function analyzeFlip(x={}){
  const price=num(x.price),area=num(x.area??x.surface),units=buildingUnitCount(x),zone=buildingZone(x),recognized=recognizedUnits(x),signals=criticalSignals(x),quality=qualityEvidence(x,recognizedUnits(x),units),legal=verifiedPremium(x,quality,units,recognized,signals,price);
  if(!price||!units||!zone)return {...x,flipReady:false,flipReason:'Données de base insuffisantes pour le pré-screening'};
  const score=Math.round(clamp(quality.score-(signals.review.length*5)-(signals.hard.length*25),0,100));
  let status='DOCUMENTS_FIRST',label='🟠 À VÉRIFIER',action='Demander les pièces officielles avant de qualifier le bien.';
  if(signals.hard.length){status='STOP';label='🔴 STOP';action='Écarter jusqu’à résolution documentée du blocage.'}
  else if(legal.verified){status='READY';label='🟢 CONFORMITÉ DOCUMENTÉE · CONTRÔLÉE';action='Valider les derniers paramètres économiques et contractuels avant décision.'}
  const missing=[...new Set([...quality.missing,...legal.missing])];
  if(recognized===null)missing.push('preuve officielle du nombre d’unités reconnues');
  if(!addressKnown(x))missing.push('adresse exacte');
  if(!area)missing.push('surface exploitable / plans');
  if(!(x.peb||x.epc))missing.push('PEB par unité');
  if(!x.meters)missing.push('situation des compteurs');
  return {
    ...x,argusCommune:zone,argusSector:brusselsSector(x),flipReady:true,
    flip:{
      strategy:'DIVIDE_AND_RESELL_AS_IS',
      strategyLabel:'DIVISER & REVENDRE EN L’ÉTAT · 0 € RÉNOVATION',
      valuationRequired:true,valuationSource:'LOT_LEVEL_LIVE_COMPARABLES_ONLY',
      zone,units,recognizedUnits:recognized,area,pricePerSqm:area?Math.round(price/area):null,
      score,status,statusLabel:label,action,quality,legal,verifiedPremium:legal.verified,
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
    statuses:{READY:'Conformité documentée et vérifiée, sous réserve de validité des attestations',DOCUMENTS_FIRST:'Preuves manquantes : le bien ne peut pas être déclaré conforme',STOP:'Blocage explicite ou bien hors stratégie'},
    caution:'Le pré-screening n’est pas une expertise de valeur. La rentabilité est calculée uniquement dans ARGUS FLIP PRO avec les lots et leurs comparables.'
  };
}
