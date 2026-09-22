import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const immo=await readFile(new URL('../immo.html',import.meta.url),'utf8');
const strategic=await readFile(new URL('../strategic-brussels.html',import.meta.url),'utf8');

const must=(text,pattern,message)=>assert.match(text,pattern,message);
const mustNot=(text,pattern,message)=>assert.doesNotMatch(text,pattern,message);

must(immo,/ARGUS IMMO · Belgique 2026/,'ARGUS IMMO branding should be consistent');
must(immo,/Bruxelles stratégique/,'French strategic navigation missing');
must(immo,/Calculer ACHETER \/ NÉGOCIER \/ PASSER/,'French decision CTA missing');
must(immo,/PRIX DEMANDÉ/,'French asking-price label missing');
must(immo,/VALEUR ARGUS/,'French ARGUS value label missing');
must(immo,/PRIX CIBLE/,'French target-price label missing');
must(immo,/MAXIMUM ABSOLU/,'French maximum-price label missing');
must(immo,/Fiabilité du dossier/,'Evidence-quality label missing');
must(immo,/Les 19 communes analysées · sélection par données/,'Region-wide investment principle missing');
must(immo,/Pas de commune gagnante par défaut/,'Fixed-ranking guardrail missing');
mustNot(immo,/ARGUS IMMO BELGIUM|Strategic Brussels|Mobile-first|Calculer BUY \/ NEGOTIATE \/ PASS|FAIR VALUE|Target deal|ABS MAX|DATA INCOMPLETE|BUY \/ VISITE PRIORITAIRE/,'Legacy English UI labels must not return');
mustNot(immo,/Où je commencerais la recherche|Schaerbeek · Anderlecht · Evere en point de départ/,'Fixed commune recommendations must not return');

must(strategic,/Bruxelles stratégique/,'French strategic branding missing');
must(strategic,/RÈGLE ANTI-EMBALLEMENT/,'Anti-hype guardrail must be visible in French');
must(strategic,/Meilleures opportunités actuelles/,'Dynamic opportunities heading missing');
must(strategic,/CLASSEMENT DYNAMIQUE/,'Dynamic ranking label missing');
must(strategic,/Potentiel urbain/,'French urban-upside label missing');
must(strategic,/Surveillance renforcée/,'Enhanced surveillance label missing');
must(strategic,/Cœur européen/,'European core label must be French');
must(strategic,/MOTEUR DE DÉCOUVERTE/,'Discovery-engine label must be French');
must(strategic,/ANALYSE RÉGIONALE/,'Region-wide scan label must be French');
must(strategic,/Certitude d’exécution/,'Execution confidence must be French');
must(strategic,/Couverture des données/,'Data completeness must be labelled as coverage');
mustNot(strategic,/Strategic Brussels|ANTI-HYPE RULE|Top Opportunities Now|DYNAMIC RANKING|Urban Upside Map|Click zone → dossier|European Core|New Emerging Area|DISCOVERY ENGINE|REGION-WIDE SCAN|Project certainty|Data completeness|Why it matters|Projects & execution/,'Legacy English strategic labels must not return');

for(const [name,html] of [['immo.html',immo],['strategic-brussels.html',strategic]]){
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim());
  assert.ok(scripts.length>0,name+' must contain inline application JavaScript');
  for(const source of scripts) assert.doesNotThrow(()=>new Function(source),name+' contains invalid inline JavaScript');
}

console.log(JSON.stringify({ok:true,language:'fr',pages:['immo.html','strategic-brussels.html']},null,2));
